/* 先行受付フォーム送信 — Google Apps Script Web App にPOSTして、メール送信＋自動返信をトリガー */
(function () {
  'use strict';

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyoirIbRdCg-0AHsdmXk7Ntz5EexkIcLv0THeGq6ZTWwPedFuYZGnG5pjVPLjpF9CAHzg/exec';

  const form = document.getElementById('signup-form');
  const thanks = document.getElementById('signup-thanks');
  if (!form || !thanks) return;

  const submitBtn = form.querySelector('.sf-submit');
  const btnText = submitBtn.querySelector('.sf-btn-text');

  function setSending(sending) {
    submitBtn.disabled = sending;
    submitBtn.classList.toggle('is-sending', sending);
    btnText.textContent = sending ? '送信中…' : '先行受付に申し込む';
  }

  function showError(msg) {
    alert('送信エラー: ' + msg + '\n\nお手数ですが info@tonchi.works までメールでご連絡ください。');
  }

  function serializeForm() {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) data[k] = String(v).trim();
    data._ua = navigator.userAgent;
    data._referrer = document.referrer || '';
    data._ts = new Date().toISOString();
    return data;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 簡易バリデーション（HTML5 required に加えて）
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = serializeForm();

    // エンドポイント未設定チェック
    if (GAS_URL.includes('REPLACE_WITH_DEPLOYED_URL')) {
      showError('フォームの送信先が未設定です（運用者にお知らせください）');
      return;
    }

    setSending(true);

    try {
      // GAS Web App は text/plain でPOSTするとCORSプリフライトなしで通る
      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const json = await res.json().catch(() => ({ ok: true }));
      if (json && json.ok === false) throw new Error(json.error || 'unknown');

      // 成功：サンクス画面へ
      form.hidden = true;
      thanks.hidden = false;
      thanks.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error('[signup] error', err);
      showError(err.message || '不明なエラー');
      setSending(false);
    }
  });
})();
