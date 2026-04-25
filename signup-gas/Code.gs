/**
 * XiX 先行受付フォーム — Google Apps Script Web App
 *
 * 受信: LP (https://tnc-works.com) からの fetch POST
 * 送信:
 *   1) 店舗側通知メール → info@tonchi.works
 *   2) 申込者への自動返信メール
 *
 * デプロイ手順:
 *   1. https://script.google.com/ に terasawa@tonchi.works でログイン
 *   2. 「新しいプロジェクト」→ 名前を「XiX先行受付フォーム」に
 *   3. Code.gs の中身をこのファイルの内容に置き換えて保存
 *   4. 右上「デプロイ」→「新しいデプロイ」
 *      - 種類: ウェブアプリ
 *      - 説明: XiX 先行受付 v1
 *      - 次のユーザーとして実行: 自分 (terasawa@tonchi.works)
 *      - アクセスできるユーザー: 全員
 *   5. 「デプロイ」→「アクセスを承認」(初回のみ、Googleの警告を許可)
 *   6. 生成される「ウェブアプリ」URL (https://script.google.com/macros/s/XXXX/exec) をコピー
 *   7. そのURLを Claude (私) に教えてください → LP側に埋め込みます
 */

// ========== 設定 ==========
const NOTIFY_TO = 'info@tonchi.works';              // 店舗側通知先
const FROM_NAME = 'XiX / 株式会社頓智WORKS';          // 差出人表示名
const REPLY_TO  = 'terasawa@tonchi.works';          // 申込者が返信したとき届く先

// Slack Incoming Webhook URL（空文字のまま置くとSlack通知をスキップ）
// 取得手順: https://api.slack.com/apps → 新規作成 → Incoming Webhooks → Add New Webhook to Workspace
// 形式: 'https://hooks.slack.com/services/TXX/BXX/XXXXX'
const SLACK_WEBHOOK_URL = '';

// ========== 受付枠フェーズ管理 ==========
// 1段階につき +50法人 / +100店舗 ずつ拡大、計7段階。
// 7段階目（350法人/800店舗）は表示上「100法人/800店舗」のキリ数値ラベル。
// それを超えたらウェイティングリストモードへ移行。
const PHASES = [
  { phase: 1, capC:  50, capS: 200, dispC:  50, dispS: 200, label: '' },
  { phase: 2, capC: 100, capS: 300, dispC: 100, dispS: 300, label: '✨好評につき増枠中（第2期）' },
  { phase: 3, capC: 150, capS: 400, dispC: 150, dispS: 400, label: '✨好評につき増枠中（第3期）' },
  { phase: 4, capC: 200, capS: 500, dispC: 200, dispS: 500, label: '✨好評につき増枠中（第4期）' },
  { phase: 5, capC: 250, capS: 600, dispC: 250, dispS: 600, label: '✨好評につき増枠中（第5期）' },
  { phase: 6, capC: 300, capS: 700, dispC: 300, dispS: 700, label: '✨好評につき増枠中（第6期）' },
  { phase: 7, capC: 350, capS: 800, dispC: 100, dispS: 800, label: '✨好評につき大増枠中（最終期）' }
];
// 初期表示値（一度PropertiesServiceに保存後はそちらが優先）
const INITIAL_C = 19;
const INITIAL_S = 142;

function _calcPhase(c, s) {
  for (var i = 0; i < PHASES.length; i++) {
    if (c <= PHASES[i].capC && s <= PHASES[i].capS) return PHASES[i];
  }
  return null; // ウェイトリスト
}

function _getState() {
  const props = PropertiesService.getScriptProperties();
  const c = parseInt(props.getProperty('total_companies') || String(INITIAL_C), 10);
  const s = parseInt(props.getProperty('total_stores') || String(INITIAL_S), 10);
  const p = _calcPhase(c, s);
  if (!p) {
    return {
      companies: c,
      stores: s,
      phase: 'waitlist',
      capC: 100,
      capS: 800,
      label: '🎉一次受付 100法人・800店舗 達成',
      waitlist: true
    };
  }
  return {
    companies: c,
    stores: s,
    phase: p.phase,
    capC: p.dispC,
    capS: p.dispS,
    label: p.label,
    waitlist: false
  };
}

function _incrementState(addC, addS) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const c = parseInt(props.getProperty('total_companies') || String(INITIAL_C), 10) + addC;
    const s = parseInt(props.getProperty('total_stores') || String(INITIAL_S), 10) + addS;
    props.setProperties({
      total_companies: String(c),
      total_stores: String(s)
    });
    return { companies: c, stores: s };
  } finally {
    lock.releaseLock();
  }
}

// ========== 管理用ユーティリティ ==========
// 数値を手動で調整したい時はエディタからこれらを実行。
function adminSetCounter() {
  // 例: 19法人 / 142店舗 にリセット
  PropertiesService.getScriptProperties().setProperties({
    total_companies: '19',
    total_stores: '142'
  });
  console.log('counter set:', _getState());
}
function adminGetCounter() {
  console.log(_getState());
}

// ========== エンドポイント ==========
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const d = JSON.parse(raw);

    // 最低限のバリデーション
    if (!d.company || !d.name || !d.email) {
      return _json({ ok: false, error: '必須項目が不足しています' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
      return _json({ ok: false, error: 'メールアドレスの形式が正しくありません' });
    }

    const receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    const isWaitlist = d.waitlist === true || d.waitlist === 'true';

    // カウンター更新（ウェイティングリストはカウントに含めない）
    let stateAfter;
    if (!isWaitlist) {
      const addC = 1;
      const addS = parseInt(String(d.stores || '0').replace(/[^0-9]/g, ''), 10) || 0;
      _incrementState(addC, addS);
    }
    stateAfter = _getState();

    // 1) 店舗側への通知
    _sendToNotify(d, receivedAt, isWaitlist, stateAfter);

    // 2) 申込者への自動返信
    _sendToApplicant(d, receivedAt, isWaitlist);

    // 3) Slack通知（URL未設定時はスキップ。失敗してもフォーム全体を失敗させない）
    _sendToSlack(d, receivedAt, isWaitlist, stateAfter);

    return _json({ ok: true, state: stateAfter, waitlist: isWaitlist });
  } catch (err) {
    console.error(err);
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

// GET: 現在の申込状況を返す（LPがpage loadで取得）
function doGet() {
  return _json(_getState());
}

// ========== メール送信 ==========
function _sendToNotify(d, receivedAt, isWaitlist, state) {
  const tag = isWaitlist ? '【XiX ウェイトリスト】' : '【XiX 先行受付】';
  const subject = tag + '新規申込: ' + d.company + ' / ' + d.name + '様';
  const stateLine = state ? ('現在累計: ' + state.companies + '法人 / ' + state.stores + '店舗 申込済（フェーズ' + state.phase + '）') : '';
  const body = [
    isWaitlist ? 'XiX ウェイティングリストに新規登録がありました。' : 'XiX 先行受付フォームから新規申込がありました。',
    '',
    '━━━━━━━━━━━━━━━━━━━',
    '■ 受付日時: ' + receivedAt,
    '━━━━━━━━━━━━━━━━━━━',
    '■ 法人名: ' + (d.company || '-'),
    '■ ご担当者: ' + (d.name || '-'),
    '■ 役職: ' + (d.role || '-'),
    '■ メール: ' + (d.email || '-'),
    '■ 電話: ' + (d.phone || '-'),
    '■ 店舗数: ' + (d.stores || '-'),
    '■ P-Brain 利用状況: ' + (d.pbrain || '-'),
    '━━━━━━━━━━━━━━━━━━━',
    '■ 現在の課題:',
    (d.challenges || '(未記入)'),
    '━━━━━━━━━━━━━━━━━━━',
    stateLine ? '■ ' + stateLine : '',
    stateLine ? '━━━━━━━━━━━━━━━━━━━' : '',
    '',
    '[参考情報]',
    'User-Agent: ' + (d._ua || '-'),
    'Referrer: ' + (d._referrer || '-'),
    '',
    '-- XiX 先行受付フォーム (自動送信)'
  ].filter(Boolean).join('\n');

  GmailApp.sendEmail(NOTIFY_TO, subject, body, {
    name: FROM_NAME,
    replyTo: d.email,  // 「返信」ボタンで申込者に返信できるように
  });
}

function _sendToApplicant(d, receivedAt, isWaitlist) {
  const subject = isWaitlist
    ? '【XiX】ウェイティングリストご登録ありがとうございます'
    : '【XiX】先行受付お申込みを受け付けました';
  const heroLabel = isWaitlist
    ? 'ウェイティングリスト 登録完了'
    : '先行受付お申込み 受付完了';
  const introHtml = isWaitlist
    ? 'このたびは <b>XiX（ザイクス）</b> のウェイティングリストにご登録いただき、誠にありがとうございます。<br>一次受付（100法人/800店舗）が満席となりましたが、<br>二次受付開始の際に <b>登録順で優先的にご案内</b> いたします。'
    : 'このたびは <b>XiX（ザイクス）</b> の先行受付にお申込みいただき、誠にありがとうございます。<br>お申込み内容は以下のとおりです。<br>担当者より <b>3営業日以内</b> にご連絡差し上げます。';
  const htmlBody = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Noto Sans JP\', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222; line-height: 1.8;">',
    '  <div style="background: linear-gradient(135deg, ' + (isWaitlist ? '#0891b2, #6366f1' : '#6366f1, #8b5cf6') + '); color: #fff; padding: 20px 24px; border-radius: 10px 10px 0 0; margin-bottom: 0;">',
    '    <div style="font-size: 11px; letter-spacing: 0.2em; opacity: 0.9;">XIX - ザイクス</div>',
    '    <div style="font-size: 22px; font-weight: 800; margin-top: 4px;">' + heroLabel + '</div>',
    '  </div>',
    '  <div style="background: #f8f9fc; padding: 24px; border: 1px solid #e7e9ee; border-top: none; border-radius: 0 0 10px 10px;">',
    '    <p>' + _escape(d.name) + ' 様</p>',
    '    <p>' + introHtml + '</p>',
    '    <h3 style="font-size: 14px; color: #6366f1; border-bottom: 1px solid #e7e9ee; padding-bottom: 8px; margin-top: 24px;">お申込み内容</h3>',
    '    <table style="width: 100%; font-size: 13px; border-collapse: collapse;">',
    _row('法人名', d.company),
    _row('ご担当者', d.name),
    _row('役職', d.role),
    _row('メール', d.email),
    _row('電話', d.phone),
    _row('店舗数', d.stores),
    _row('P-Brain 利用状況', d.pbrain),
    '    </table>',
    '    <h3 style="font-size: 14px; color: #6366f1; border-bottom: 1px solid #e7e9ee; padding-bottom: 8px; margin-top: 20px;">現在の課題</h3>',
    '    <div style="padding: 10px 14px; background: #fff; border-radius: 6px; font-size: 13px; white-space: pre-wrap;">' + _escape(d.challenges || '(未記入)') + '</div>',
    '    <p style="margin-top: 28px; font-size: 12px; color: #666;">※ 本メールは自動送信です。このメールへの返信でもお問い合わせいただけます（<a href="mailto:' + REPLY_TO + '" style="color: #6366f1;">' + REPLY_TO + '</a> 宛）。</p>',
    '    <hr style="border: none; border-top: 1px solid #e7e9ee; margin: 24px 0;">',
    '    <div style="font-size: 11px; color: #888; line-height: 1.8;">',
    '      <b>株式会社 頓智WORKS</b><br>',
    '      〒169-0072 東京都新宿区大久保2-2-11 新宿太陽ビル 5F<br>',
    '      <a href="mailto:info@tonchi.works" style="color: #6366f1;">info@tonchi.works</a> / 03-6457-3737<br>',
    '      <a href="https://tnc-works.com/" style="color: #6366f1;">https://tnc-works.com/</a>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('');

  const introText = isWaitlist
    ? 'このたびは XiX（ザイクス）のウェイティングリストにご登録いただき、誠にありがとうございます。\n一次受付（100法人/800店舗）が満席となりましたが、二次受付開始の際に登録順で優先的にご案内いたします。'
    : 'このたびは XiX（ザイクス）の先行受付にお申込みいただき、誠にありがとうございます。\n担当者より3営業日以内にご連絡差し上げます。';
  const textBody = [
    d.name + ' 様',
    '',
    introText,
    '',
    '━━━ ' + (isWaitlist ? 'ご登録内容' : 'お申込み内容') + ' ━━━',
    '法人名: ' + (d.company || '-'),
    'ご担当者: ' + (d.name || '-'),
    '役職: ' + (d.role || '-'),
    'メール: ' + (d.email || '-'),
    '電話: ' + (d.phone || '-'),
    '店舗数: ' + (d.stores || '-'),
    'P-Brain: ' + (d.pbrain || '-'),
    '━━━━━━━━━━━━━━',
    '現在の課題:',
    (d.challenges || '(未記入)'),
    '',
    '※ 本メールは自動送信です。このメールへの返信でもお問い合わせいただけます。',
    '',
    '--',
    '株式会社 頓智WORKS',
    '〒169-0072 東京都新宿区大久保2-2-11 新宿太陽ビル 5F',
    'info@tonchi.works / 03-6457-3737',
    'https://tnc-works.com/'
  ].join('\n');

  GmailApp.sendEmail(d.email, subject, textBody, {
    name: FROM_NAME,
    htmlBody: htmlBody,
    replyTo: REPLY_TO,
  });
}

// ========== Slack 通知 ==========
function _sendToSlack(d, receivedAt, isWaitlist, state) {
  if (!SLACK_WEBHOOK_URL) return;  // 未設定時はスキップ
  try {
    const challenges = (d.challenges || '(未記入)').toString().slice(0, 1800);
    const quotedChallenges = challenges.replace(/\n/g, '\n> ');
    const headerText = isWaitlist
      ? '⏳ XiX ウェイティングリスト 新規登録'
      : '🎉 XiX 先行受付 新規申込';
    const titleText = (isWaitlist ? '【XiX ウェイトリスト】' : '【XiX 先行受付】')
      + '新規申込: ' + (d.company || '-') + ' / ' + (d.name || '-') + '様';
    const stateText = state
      ? '📊 累計: ' + state.companies + '法人 / ' + state.stores + '店舗 申込済（フェーズ' + state.phase + (state.label ? ' ' + state.label.replace(/^[\s✨]+/, '') : '') + '）'
      : '';
    const payload = {
      text: titleText,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: headerText, emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: '*法人名:*\n' + (d.company || '-') },
            { type: 'mrkdwn', text: '*ご担当者:*\n' + (d.name || '-') + (d.role ? ' / ' + d.role : '') },
            { type: 'mrkdwn', text: '*メール:*\n' + (d.email || '-') },
            { type: 'mrkdwn', text: '*電話:*\n' + (d.phone || '-') },
            { type: 'mrkdwn', text: '*店舗数:*\n' + (d.stores || '-') },
            { type: 'mrkdwn', text: '*P-Brain:*\n' + (d.pbrain || '-') }
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*課題:*\n> ' + quotedChallenges }
        },
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: '🕒 受付日時: ' + receivedAt + (stateText ? '   ' + stateText : '') }
          ]
        }
      ]
    };
    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('slack notify failed', e);
    // Slack失敗でもメール送信済みなのでユーザーには成功扱い
  }
}

// ========== ユーティリティ ==========
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function _escape(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function _row(label, value) {
  return '<tr><td style="padding: 6px 0; width: 140px; color: #888;">' + _escape(label) + '</td>' +
         '<td style="padding: 6px 0; font-weight: 600;">' + _escape(value || '-') + '</td></tr>';
}

/* 任意: スプレッドシートに記録したい場合の例
function _appendToSheet(d, receivedAt) {
  const SHEET_ID = 'YOUR_SPREADSHEET_ID';   // スプレッドシートのID
  const SHEET_NAME = 'シート1';
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  sheet.appendRow([
    receivedAt, d.company, d.name, d.role, d.email, d.phone, d.stores, d.pbrain, d.challenges
  ]);
}
*/
