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

    // 1) 店舗側への通知
    _sendToNotify(d, receivedAt);

    // 2) 申込者への自動返信
    _sendToApplicant(d, receivedAt);

    // (任意) スプレッドシートに記録したい場合はここで追加
    // _appendToSheet(d, receivedAt);

    return _json({ ok: true });
  } catch (err) {
    console.error(err);
    return _json({ ok: false, error: String(err && err.message || err) });
  }
}

// GETされたときの健康チェック用
function doGet() {
  return ContentService.createTextOutput('XiX signup endpoint is alive.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ========== メール送信 ==========
function _sendToNotify(d, receivedAt) {
  const subject = '【XiX 先行受付】新規申込: ' + d.company + ' / ' + d.name + '様';
  const body = [
    'XiX 先行受付フォームから新規申込がありました。',
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
    '',
    '[参考情報]',
    'User-Agent: ' + (d._ua || '-'),
    'Referrer: ' + (d._referrer || '-'),
    '',
    '-- XiX 先行受付フォーム (自動送信)'
  ].join('\n');

  GmailApp.sendEmail(NOTIFY_TO, subject, body, {
    name: FROM_NAME,
    replyTo: d.email,  // 「返信」ボタンで申込者に返信できるように
  });
}

function _sendToApplicant(d, receivedAt) {
  const subject = '【XiX】先行受付お申込みを受け付けました';
  const htmlBody = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Noto Sans JP\', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222; line-height: 1.8;">',
    '  <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; padding: 20px 24px; border-radius: 10px 10px 0 0; margin-bottom: 0;">',
    '    <div style="font-size: 11px; letter-spacing: 0.2em; opacity: 0.9;">XIX - ザイクス</div>',
    '    <div style="font-size: 22px; font-weight: 800; margin-top: 4px;">先行受付お申込み 受付完了</div>',
    '  </div>',
    '  <div style="background: #f8f9fc; padding: 24px; border: 1px solid #e7e9ee; border-top: none; border-radius: 0 0 10px 10px;">',
    '    <p>' + _escape(d.name) + ' 様</p>',
    '    <p>このたびは <b>XiX（ザイクス）</b> の先行受付にお申込みいただき、誠にありがとうございます。<br>',
    '    お申込み内容は以下のとおりです。<br>',
    '    担当者より <b>3営業日以内</b> にご連絡差し上げます。</p>',
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

  const textBody = [
    d.name + ' 様',
    '',
    'このたびは XiX（ザイクス）の先行受付にお申込みいただき、誠にありがとうございます。',
    '担当者より3営業日以内にご連絡差し上げます。',
    '',
    '━━━ お申込み内容 ━━━',
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
