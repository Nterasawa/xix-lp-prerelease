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

// ========== パチンコ業界キーワード（許可シグナル） ==========
// 法人名／役職／課題 のいずれかにこれらが含まれれば「パチンコ関連」と判定。
// ホール・代理店・メーカー・取材業者など、業界の人なら自然に出る語彙。
var PACHINKO_TERMS = [
  // 一般語
  'パチンコ','ぱちんこ','パチスロ','ぱちすろ','スロット','スマスロ','スマパチ',
  '遊技','遊戯','遊技場','遊技機','ホール','出玉','差枚','設定','新台','新台入替','入替',
  '来店','取材','演者','ライター','旧イベ','特定日','等価','換金','稼働','客数','アウト',
  '風営','風適法','パチ屋','P機','S機','甘デジ','ミドル','回胴','回胴式','遊技産業',
  'パチンコ店','パチンコホール','スロット店','据え置き','高設定','設定示唆','機械割','機種',
  'ジャグラー','番長','北斗','エヴァ','沖ドキ','まどマギ','押し順','天井','ボーナス',
  // 媒体・取材・データ
  'P-WORLD','Pワールド','ピーワールド','ぱちタウン','DMMぱちタウン','スロパチ','スロパチステーション',
  'アツ姫','みんレポ','みんなのレポート','取材会社','演者来店','来店イベント','取材イベント',
  // ホールチェーン
  'マルハン','ダイナム','夢屋','ニラク','楽園','エスパス','日拓','ガイア','GAIA','キコーナ',
  'ベガスベガス','123','延田','サンキョーレジャー','パラッツォ','デルパラ','アビバ','AVIVA',
  'Dステーション','ステーション','NEXUS','やすだ','一六','オーギヤ','コンサートホール','ゾロ',
  'モナコ','クリエ','アムテック','合田','ジャンジャン','ピーアーク','メッセ','プレゴ','AMS',
  'ウイング','トーホー','ベルシティ','スーパーコスモ','タイホー','アイランド','フェイス','楽園',
  // メーカー
  'サンキョー','SANKYO','三洋','SANYO','京楽','KYORAKU','ニューギン','NEWGIN','大一','DAIICHI',
  '藤商事','平和','HEIWA','オリンピア','サミー','Sammy','北電子','ユニバーサル','UNIVERSAL',
  '大都','大都技研','DAITO','山佐','YAMASA','パイオニア','豊丸','西陣','タイヨーエレック',
  'マルホン','ビスティ','Bisty','七匠','JFJ','浅間','エンターライズ','銀座','竹屋','大網',
  'ニッタク','スパイキー','ロデオ','メーシー','ベルコ','大協','奥村','SNK','高砂','遊技機メーカー',
  // システム・周辺機器・団体
  'ダイコク電機','DAIKOKU','マースエンジニアリング','MARS','グローリー','ナスカ',
  'ホールコンピュータ','ホルコン','日工組','日電協','全日遊連','景品','大景協',
  // 自社・姉妹
  'P-Brain','Pブレイン','ピーブレイン','XiX','ザイクス','pxix'
];

// ========== 非パチンコ営業キーワード（拒否シグナル） ==========
// パチンコ業界の人がこのフォームに書くことはまず無い、売り込み専用の語彙。
// ※ パチンコシグナルが1つでもあれば、こちらが出ても許可される（誤検知防止）。
var OFFTARGET_TERMS = [
  // tnc-works.com から自動取得した定型句（最強シグナル）
  'IoT','映像制作','クラウドアプリ','クラウドアプリケーション','IT業界','情報通信業',
  // 売り込みサービスカテゴリ（パチンコ業界向けでない一般B2B営業）
  '採用サイト','求人媒体','中途採用','採用活動','採用コスト','採用ブランディング','人材採用',
  'SEO','MEO','LLMO','AIO','CVR','UI/UX','ヒートマップ','ヒューリスティック',
  'M&A','事業売却','事業譲渡','現金化','コールセンター','ポスティング','折込チラシ','折込広告',
  '補助金','助成金','SNS運用代行','動画運用','ショート動画','ホームページ制作','Webサイト制作',
  'サイトリニューアル','ハガキサイズ','デジタルマーケティング','Web集客','EC運用','ECサイト',
  'オウンドメディア','コンテンツマーケティング','リスティング','広告運用代行','成果報酬',
  'ゼロクリック','AI Overviews','ChatGPT','LLM','検索順位','被リンク','内部対策',
  // 予約・日程調整リンク（コールド営業の定番）
  'timerex','calendar.app.google','calendar.google.com','aitemasu.me','calendly','spirinc'
];

function _countHits(text, list) {
  var hits = [];
  for (var i = 0; i < list.length; i++) {
    if (text.indexOf(list[i]) !== -1) hits.push(list[i]);
  }
  return hits;
}

// 入力を分類: 'block'（無音拒否） / 'review'（要確認フラグ付通知） / 'allow'（通常）
function _classifyInquiry(d) {
  // --- ① ボット系（無条件block） ---
  if (d._honeypot && String(d._honeypot).trim().length > 0) return { action: 'block', reason: 'honeypot' };

  var storesStr = String(d.stores || '').trim();
  if (!/^[0-9]{1,4}$/.test(storesStr) || parseInt(storesStr, 10) < 1) {
    return { action: 'block', reason: 'stores-non-numeric' };
  }

  var company = String(d.company || '');
  var name = String(d.name || '');
  var role = String(d.role || '');
  if (/^[A-Za-z0-9]{8,}$/.test(company)) return { action: 'block', reason: 'random-company' };
  if (/^[A-Za-z0-9]{8,}$/.test(name)) return { action: 'block', reason: 'random-name' };
  if (role && /^[A-Za-z0-9]{8,}$/.test(role)) return { action: 'block', reason: 'random-role' };

  var email = String(d.email || '').toLowerCase();
  if (email.indexOf('@gmail.com') !== -1) {
    var local = email.split('@')[0];
    if ((local.match(/\./g) || []).length >= 4) return { action: 'block', reason: 'gmail-dots' };
  }

  // --- ② パチンコ関連スコア vs 非パチンコ営業スコア ---
  var allText = [company, name, role, String(d.challenges || '')].join(' \n ');
  var pachiHits = _countHits(allText, PACHINKO_TERMS);
  var offHits = _countHits(allText, OFFTARGET_TERMS);

  // パチンコシグナルが1つでもあれば許可（「弊社」「お打ち合わせ」があってもOK）
  if (pachiHits.length > 0) {
    return { action: 'allow', reason: 'pachinko:' + pachiHits.slice(0, 3).join(',') };
  }
  // パチンコシグナル無し かつ 非パチンコ営業シグナルあり → 無音拒否
  if (offHits.length > 0) {
    return { action: 'block', reason: 'offtarget:' + offHits.slice(0, 3).join(',') };
  }
  // どちらのシグナルも無い → 判定不能。安全側に倒し「要確認」で通知（弾かない）
  return { action: 'review', reason: 'no-signal' };
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

    // 分類
    const cls = _classifyInquiry(d);
    if (cls.action === 'block') {
      console.log('SPAM blocked [' + cls.reason + '] company=' + (d.company || '-') + ' email=' + (d.email || '-'));
      // スパマーには気づかせず成功扱いを返す
      return _json({ ok: true, state: _getState(), waitlist: false, _filtered: true });
    }
    const isReview = cls.action === 'review';

    const receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    const isWaitlist = d.waitlist === true || d.waitlist === 'true';

    // カウンター更新（ウェイティングリストと要確認はカウントに含めない）
    let stateAfter;
    if (!isWaitlist && !isReview) {
      const addC = 1;
      const addS = parseInt(String(d.stores || '0').replace(/[^0-9]/g, ''), 10) || 0;
      _incrementState(addC, addS);
    }
    stateAfter = _getState();

    // 1) 店舗側への通知
    _sendToNotify(d, receivedAt, isWaitlist, stateAfter, isReview, cls.reason);

    // 2) 申込者への自動返信（要確認でも本人には通常どおり返信）
    _sendToApplicant(d, receivedAt, isWaitlist);

    // 3) Slack通知（URL未設定時はスキップ。失敗してもフォーム全体を失敗させない）
    _sendToSlack(d, receivedAt, isWaitlist, stateAfter, isReview, cls.reason);

    return _json({ ok: true, state: stateAfter, waitlist: isWaitlist, review: isReview });
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
function _sendToNotify(d, receivedAt, isWaitlist, state, isReview, clsReason) {
  const tag = isReview ? '【XiX 要確認】' : (isWaitlist ? '【XiX ウェイトリスト】' : '【XiX 先行受付】');
  const subject = tag + '新規申込: ' + d.company + ' / ' + d.name + '様';
  const stateLine = state ? ('現在累計: ' + state.companies + '法人 / ' + state.stores + '店舗 申込済（フェーズ' + state.phase + '）') : '';
  const reviewLine = isReview ? '⚠️ パチンコ業界関連か自動判定できませんでした（' + (clsReason || '') + '）。内容をご確認ください。カウンターには加算していません。' : '';
  const body = [
    isReview ? '【要確認】XiX 先行受付フォームに、業界関連か判定できない申込がありました。' :
    (isWaitlist ? 'XiX ウェイティングリストに新規登録がありました。' : 'XiX 先行受付フォームから新規申込がありました。'),
    reviewLine ? '' : null,
    reviewLine || null,
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
function _sendToSlack(d, receivedAt, isWaitlist, state, isReview, clsReason) {
  if (!SLACK_WEBHOOK_URL) return;  // 未設定時はスキップ
  try {
    const challenges = (d.challenges || '(未記入)').toString().slice(0, 1800);
    const quotedChallenges = challenges.replace(/\n/g, '\n> ');
    const headerText = isReview
      ? '⚠️ XiX 要確認（業界関連か自動判定不可）'
      : (isWaitlist ? '⏳ XiX ウェイティングリスト 新規登録' : '🎉 XiX 先行受付 新規申込');
    const titleText = (isReview ? '【XiX 要確認】' : (isWaitlist ? '【XiX ウェイトリスト】' : '【XiX 先行受付】'))
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
            { type: 'mrkdwn', text: '🕒 受付日時: ' + receivedAt + (isReview ? '   ⚠️要確認（' + (clsReason || '') + '・カウント外）' : (stateText ? '   ' + stateText : '')) }
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
