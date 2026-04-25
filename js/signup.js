/* 先行受付フォーム送信 — Google Apps Script Web App にPOSTして、
   メール送信＋自動返信＋Slack通知＋カウンター更新をトリガー */
(function () {
  'use strict';

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyoirIbRdCg-0AHsdmXk7Ntz5EexkIcLv0THeGq6ZTWwPedFuYZGnG5pjVPLjpF9CAHzg/exec';

  const form = document.getElementById('signup-form');
  const thanks = document.getElementById('signup-thanks');
  if (!form || !thanks) return;

  const submitBtn = form.querySelector('.sf-submit');
  const btnText = submitBtn.querySelector('.sf-btn-text');

  // === Capacity / state UI elements ===
  const capacityEl = document.getElementById('capacity');
  const capPhaseBadge = document.getElementById('cap-phase-badge');
  const capCurrentC = document.getElementById('cap-current-c');
  const capCurrentS = document.getElementById('cap-current-s');
  const capTotalC = document.getElementById('cap-total-c');
  const capTotalS = document.getElementById('cap-total-s');
  const capBarC = document.getElementById('cap-bar-c');
  const capBarS = document.getElementById('cap-bar-s');
  const capNote = document.getElementById('cap-note');
  const capExpanded = document.getElementById('cap-expanded');
  const capExpandedLabel = document.getElementById('cap-expanded-label');
  const waitlistIntro = document.getElementById('waitlist-intro');
  const waitlistShowBtn = document.getElementById('waitlist-show-btn');
  const thanksTitle = document.getElementById('thanks-title');
  const thanksBody = document.getElementById('thanks-body');

  let isWaitlistMode = false;

  // === State render ===
  function renderState(state) {
    if (!state) return;
    if (capCurrentC) capCurrentC.textContent = (state.companies || 0).toLocaleString();
    if (capCurrentS) capCurrentS.textContent = (state.stores || 0).toLocaleString();
    if (capTotalC) capTotalC.textContent = (state.capC || 0).toLocaleString();
    if (capTotalS) capTotalS.textContent = (state.capS || 0).toLocaleString();
    if (capPhaseBadge) {
      capPhaseBadge.textContent = '先着 ' + (state.capC || 0) + '法人 / ' + (state.capS || 0) + '店舗';
    }
    if (capBarC) {
      const pct = Math.min(100, Math.round(((state.companies || 0) / (state.capC || 1)) * 100));
      capBarC.style.setProperty('--pct', pct + '%');
    }
    if (capBarS) {
      const pct = Math.min(100, Math.round(((state.stores || 0) / (state.capS || 1)) * 100));
      capBarS.style.setProperty('--pct', pct + '%');
    }

    if (state.waitlist) {
      // ウェイトリストモード: 申込状況・フォーム・サンクス を隠してウェイトリスト導入を表示
      if (capacityEl) capacityEl.hidden = true;
      form.hidden = true;
      if (waitlistIntro) waitlistIntro.hidden = false;
      isWaitlistMode = true;
      // フォームボタン押下時の文言も用意
      btnText.textContent = 'ウェイティングリストに登録する';
    } else {
      // 通常 or 増枠中
      if (capacityEl) capacityEl.hidden = false;
      if (waitlistIntro) waitlistIntro.hidden = true;
      isWaitlistMode = false;

      // 増枠バナー表示
      if (state.label && capExpanded && capExpandedLabel) {
        capExpandedLabel.textContent = state.label;
        capExpanded.hidden = false;
      } else if (capExpanded) {
        capExpanded.hidden = true;
      }
    }
  }

  // === Initial state load ===
  async function loadState() {
    try {
      const res = await fetch(GAS_URL + '?ts=' + Date.now(), { method: 'GET', mode: 'cors' });
      if (!res.ok) return;
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        renderState(json);
      } catch (_) {
        // doGetがプレーンテキスト("XiX signup endpoint is alive.")の旧版を返した場合は無視
      }
    } catch (e) {
      console.warn('[signup] loadState failed', e);
    }
  }
  loadState();

  // === Waitlist mode show form ===
  if (waitlistShowBtn) {
    waitlistShowBtn.addEventListener('click', () => {
      if (waitlistIntro) waitlistIntro.hidden = true;
      form.hidden = false;
      // フォーム見出しなど書き換え
      const ctaTitle = document.querySelector('.cta-title');
      if (ctaTitle) ctaTitle.textContent = 'ウェイティングリスト 登録フォーム';
      btnText.textContent = 'ウェイティングリストに登録する';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // === Helpers ===
  function setSending(sending) {
    submitBtn.disabled = sending;
    submitBtn.classList.toggle('is-sending', sending);
    btnText.textContent = sending
      ? '送信中…'
      : (isWaitlistMode ? 'ウェイティングリストに登録する' : '先行受付に申し込む');
  }

  function showError(msg) {
    alert('送信エラー: ' + msg + '\n\nお手数ですが info@tonchi.works までメールでご連絡ください。');
  }

  function serializeForm() {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) data[k] = String(v).trim();
    data.waitlist = !!isWaitlistMode;
    data._ua = navigator.userAgent;
    data._referrer = document.referrer || '';
    data._ts = new Date().toISOString();
    return data;
  }

  // === Submit ===
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = serializeForm();
    if (GAS_URL.includes('REPLACE_WITH_DEPLOYED_URL')) {
      showError('フォームの送信先が未設定です（運用者にお知らせください）');
      return;
    }
    setSending(true);
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json().catch(() => ({ ok: true }));
      if (json && json.ok === false) throw new Error(json.error || 'unknown');

      // 成功：サンクス画面へ（ウェイトリストかで文言切替）
      form.hidden = true;
      if (isWaitlistMode) {
        if (thanksTitle) thanksTitle.textContent = 'ウェイティングリストにご登録いただきました';
        if (thanksBody) thanksBody.innerHTML = '二次受付開始の際に <b>登録順で優先的にご案内</b> いたします。<br>自動返信メールをお送りしましたのでご確認ください。';
      } else {
        if (thanksTitle) thanksTitle.textContent = 'お申込みを受け付けました';
        if (thanksBody) thanksBody.innerHTML = '自動返信メールをお送りしました。<br>担当者より3営業日以内にご連絡いたします。';
      }
      thanks.hidden = false;
      thanks.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // カウンター反映
      if (json && json.state) renderState(json.state);
    } catch (err) {
      console.error('[signup] error', err);
      showError(err.message || '不明なエラー');
      setSending(false);
    }
  });
})();
