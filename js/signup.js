// お問い合わせフォーム → 既存の Google Apps Script（先行受付フォームと同じ送信先・同じ項目名）
(function () {
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyoirIbRdCg-0AHsdmXk7Ntz5EexkIcLv0THeGq6ZTWwPedFuYZGnG5pjVPLjpF9CAHzg/exec';
  const MIN_FORM_AGE_MS = 4000;
  const LOADED_AT = Date.now();
  const form = document.getElementById('signupForm');
  if (!form) return;
  const btn = document.getElementById('submitBtn');
  const err = document.getElementById('formError');
  const thanks = document.getElementById('thanks');

  const showError = msg => { err.textContent = msg; err.hidden = false; };
  const setSending = on => { btn.disabled = on; btn.textContent = on ? '送信しています…' : '送信する'; };
  const done = () => { form.hidden = true; thanks.hidden = false; thanks.focus(); thanks.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;

    // 必須チェック（どこが足りないかを示す）
    const missing = [...form.querySelectorAll('[required]')].filter(el => !el.value.trim() || !el.checkValidity());
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    if (missing.length) {
      missing.forEach(el => el.setAttribute('aria-invalid', 'true'));
      const names = missing.map(el => el.closest('label').querySelector('span').firstChild.textContent.trim());
      showError(names.join('・') + ' を入力してください。' + (missing.some(el => el.name === 'stores') ? '店舗数は半角数字で入力します。' : ''));
      missing[0].focus();
      return;
    }
    // bot対策：ハニーポット／表示直後の送信は送らずに完了表示
    if (form.website.value || Date.now() - LOADED_AT < MIN_FORM_AGE_MS) { done(); return; }

    const fd = new FormData(form);
    const kind = fd.get('kind') || 'お問い合わせ';
    const data = {
      company: fd.get('company').trim(), name: fd.get('name').trim(), role: (fd.get('role') || '').trim(),
      email: fd.get('email').trim(), phone: (fd.get('phone') || '').trim(), stores: fd.get('stores').trim(),
      pbrain: fd.get('pbrain') || '', challenges: `【${kind}】` + (fd.get('challenges') || '').trim(),
      source: 'tnc-works.com 2026renewal', website: '',
    };
    setSending(true);
    try {
      const res = await fetch(GAS_URL, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json().catch(() => ({ ok: true }));
      if (json && json.ok === false) throw new Error(json.error || 'unknown');
      done();
    } catch (ex) {
      setSending(false);
      const body = encodeURIComponent(Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n'));
      showError('送信できませんでした。通信状況を確認してもう一度お試しいただくか、');
      err.insertAdjacentHTML('beforeend', `<a href="mailto:info@tonchi.works?subject=${encodeURIComponent('XiX ' + kind)}&body=${body}" style="color:inherit">入力内容をメールで送る</a>。`);
    }
  });
})();
