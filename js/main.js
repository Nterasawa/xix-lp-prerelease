// 画面イメージの生成・アニメーション。店舗名・ゲスト名・機種名はすべて架空、数値はサンプル。
import { JAPAN, JAPAN_VIEWBOX } from './japan.js';

const G = window.gsap, ST = window.ScrollTrigger;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
if (G && ST) G.registerPlugin(ST);
const rng = seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const onView = (el, fn, opts = { threshold: .35 }) => {
  if (!el) return;
  if (reduce) { fn(); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fn(); io.disconnect(); } }), opts);
  io.observe(el);
};

/* ---------- nav ---------- */
const nav = $('#nav'), toggle = $('.nav-toggle'), drawer = $('#drawer');
const setSolid = () => nav.classList.toggle('solid', scrollY > 40);
setSolid(); addEventListener('scroll', setSolid, { passive: true });
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', open); drawer.hidden = !open;
});
$$('#drawer a').forEach(a => a.addEventListener('click', () => { toggle.setAttribute('aria-expanded', 'false'); drawer.hidden = true; }));

/* ---------- ページ内リンク（CSSのsmooth scrollはScrollTriggerの計算を壊すためJSで） ---------- */
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute('href'); const t = id.length > 1 && document.querySelector(id); if (!t) return;
  e.preventDefault();
  t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', id);
});

/* ---------- 見出し：イベント用語のノイズから文字が確定していく ---------- */
const POOL = '取材来店新台入替特定日周年ゾロ目抽選並び朝一演者媒体告知商圏稼働'.split('');
function scramble(el, delay = 0) {
  const text = el.dataset.text; const chars = [...text];
  el.setAttribute('aria-label', text);
  el.innerHTML = chars.map(() => '<span class="ch" aria-hidden="true"></span>').join('');
  const spans = $$('.ch', el);
  if (reduce) { spans.forEach((s, i) => s.textContent = chars[i]); return; }
  const start = performance.now() + delay, per = 70, hold = 380;
  (function tick(now) {
    let done = true;
    spans.forEach((s, i) => {
      const fixAt = start + hold + i * per;
      if (now >= fixAt) { if (s.textContent !== chars[i]) { s.textContent = chars[i]; s.classList.remove('noise'); } }
      else {
        done = false;
        if (now >= start && /[^、。 ]/.test(chars[i])) { s.textContent = POOL[(Math.random() * POOL.length) | 0]; s.classList.add('noise'); }
        else if (now < start) s.textContent = '　';
      }
    });
    if (!done) requestAnimationFrame(tick);
  })(performance.now());
}
$$('.scramble').forEach((el, i) => scramble(el, 250 + i * 520));
if (G && !reduce) {
  G.from('.hero-lead, .hero-cta, .hero-note, .hero .eyebrow', { y: 24, opacity: 0, duration: 1, ease: 'power3.out', stagger: .12, delay: 1.5 });
}

/* ---------- セクション見出し：行ごとにせり上がる ---------- */
$$('.reveal-type').forEach(h => {
  h.innerHTML = h.innerHTML.split(/<br\s*\/?>/).map(seg => `<span class="w"><span>${seg}</span></span>`).join('<br>');
  if (G && ST && !reduce) {
    G.from($$('.w > span', h), { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: .12, scrollTrigger: { trigger: h, start: 'top 85%' } });
  }
});
if (G && ST && !reduce) {
  $$('.sec-lead, .cl-item, .scene, .road li, .faq details').forEach(el => {
    G.from(el, { y: 30, opacity: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });
}

/* ---------- ストーリーの段落 ---------- */
const steps = $$('.story-step');
if (reduce) steps.forEach(s => s.classList.add('on'));
else {
  const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('on', e.isIntersecting)), { rootMargin: '-35% 0px -35% 0px' });
  steps.forEach(s => io.observe(s));
}

/* ---------- 変更履歴：縦のレールが伸びる ---------- */
const cl = $('.changelog');
if (cl && G && ST && !reduce) {
  const rail = document.createElement('span'); rail.className = 'cl-rail'; cl.prepend(rail);
  G.to(rail, { height: 'calc(100% - 16px)', ease: 'none', scrollTrigger: { trigger: cl, start: 'top 70%', end: 'bottom 60%', scrub: true } });
}

/* ---------- F1 カレンダー ---------- */
(function calendar() {
  const grid = $('#mockCal .cal-grid'); if (!grid) return;
  const first = new Date(2026, 9, 1), lead = (first.getDay() + 6) % 7; // 月曜はじまり
  const R = rng(1001);
  const own = ['取材', '来店 ゲストA', '新台入替', '取材 媒体X', '来店 ゲストC', '特定日'];
  const rival = ['競合A 取材', '競合B 来店', '競合C 新台', '競合A 来店', '競合D 周年'];
  let html = '';
  for (let i = 0; i < lead; i++) html += '<div class="cal-cell off"></div>';
  for (let d = 1; d <= 31; d++) {
    const z = d === 11 || d === 22; let evs = '';
    if (z || R() < .38) evs += `<span class="ev own">${z ? '特定日' : own[(R() * own.length) | 0]}</span>`;
    if (z || R() < .55) evs += `<span class="ev rival">${rival[(R() * rival.length) | 0]}</span>`;
    html += `<div class="cal-cell"><span class="d${z ? ' z' : ''}">${d}</span>${evs}</div>`;
  }
  grid.innerHTML = html;
  onView(grid, () => {
    if (!G || reduce) return;
    G.from($$('.ev', grid), { scale: .3, opacity: 0, y: -8, duration: .45, ease: 'back.out(2)', stagger: { each: .025, from: 'start' } });
  });
})();

/* ---------- F2 地域イベント特性 ---------- */
(function area() {
  const svg = $('#areaSvg'); if (!svg) return;
  const [vx, vy, vw, vh] = JAPAN_VIEWBOX;
  svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  const NS = 'http://www.w3.org/2000/svg';
  const base = [12, 18, 24, 8]; // 取材/特定日/周年/ゾロ目 の基準（イメージ）
  const lifts = JAPAN.map((p, i) => base.map((b, k) => { const r = rng(i * 31 + k * 7 + 5); return +(b * (0.55 + r() * 0.95)).toFixed(1); }));
  const groups = JAPAN.map((p, i) => {
    const g = document.createElementNS(NS, 'g'); g.dataset.i = i;
    g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', p.p);
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', p.d); g.append(path); svg.append(g);
    return g;
  });
  let type = 0, size = 150, sel = JAPAN.findIndex(p => p.p === '東京都'); if (sel < 0) sel = 0;
  const color = t => { // 淡い青 → XiXブルー → 濃紺
    const stops = [[228, 238, 250], [61, 148, 241], [23, 44, 110]];
    const s = t < .5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - .5) * 2];
    return `rgb(${s[0].map((c, k) => Math.round(c + (s[1][k] - c) * s[2])).join(',')})`;
  };
  function paint() {
    const vals = lifts.map(l => l[type]); const mn = Math.min(...vals), mx = Math.max(...vals);
    groups.forEach((g, i) => { g.firstChild.style.fill = color((vals[i] - mn) / (mx - mn || 1)); g.classList.toggle('sel', i === sel); });
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const v = vals[sel];
    $('#areaPref').textContent = JAPAN[sel].p + '｜' + ['取材', '特定日', '周年', 'ゾロ目'][type];
    countTo($('#areaLift'), v, 1, '+');
    countTo($('#areaPeople'), Math.round(size * v / 100), 0, '+');
    $('#areaNat').textContent = `全国平均 +${avg.toFixed(1)}%（${v >= avg ? '全国より効きやすい' : '全国より効きにくい'}）`;
  }
  groups.forEach(g => {
    const pick = () => { sel = +g.dataset.i; paint(); };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  segmented($('#areaType'), b => { type = +b.dataset.k; paint(); });
  segmented($('#areaSize'), b => { size = +b.dataset.n; paint(); });
  paint();
  groups.forEach((g, i) => g.style.setProperty('--d', (groups.length - i) * 18 + 'ms'));
  onView(svg, () => svg.classList.add('in'));
})();

function segmented(root, cb) {
  if (!root) return;
  const btns = $$('button', root);
  btns.forEach(b => b.addEventListener('click', () => { btns.forEach(x => x.setAttribute('aria-checked', x === b)); cb(b); }));
  root.addEventListener('keydown', e => {
    const i = btns.findIndex(b => b.getAttribute('aria-checked') === 'true');
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
    e.preventDefault(); const n = btns[(i + d + btns.length) % btns.length]; n.focus(); n.click();
  });
}

function countTo(el, to, dec = 0, sign = '') {
  if (!el) return;
  const fmt = v => (sign && v > 0 ? sign : '') + v.toLocaleString('ja-JP', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (!G || reduce) { el.textContent = fmt(to); return; }
  const o = { v: parseFloat(el.dataset.v || 0) };
  G.to(o, { v: to, duration: .8, ease: 'power2.out', onUpdate: () => el.textContent = fmt(o.v), onComplete: () => el.dataset.v = to });
}

/* ---------- F3 来店ゲストランキング ---------- */
(function guests() {
  const list = $('#guestList'); if (!list) return;
  const data = [
    ['ゲスト A', '実戦・攻略', '動画演者', 96, 92, 88], ['ゲスト B', '実戦・攻略', '動画演者', 91, 95, 70],
    ['ゲスト C', '芸能・タレント', '芸人', 88, 74, 97], ['ゲスト D', 'アイドル・グラビア', 'グラビア', 84, 79, 90],
    ['ゲスト E', '実戦・攻略', '雑誌ライター', 80, 86, 58], ['ゲスト F', 'インフルエンサー', '配信者', 77, 66, 93],
    ['ゲスト G', '芸能・タレント', 'タレント', 72, 70, 81], ['ゲスト H', 'アイドル・グラビア', 'アイドル', 68, 73, 64],
    ['ゲスト I', 'インフルエンサー', '配信者', 63, 58, 76], ['ゲスト J', '実戦・攻略', '動画演者', 60, 69, 45],
  ].map(([n, c, sub, t, l, s]) => ({ n, c, sub, t, l, s }));
  const rank = v => v >= 90 ? 'S' : v >= 80 ? 'A' : v >= 70 ? 'B' : v >= 60 ? 'C' : 'D';
  const label = { t: '総合スコア', l: '稼働リフトスコア', s: 'SNSスコア' };
  let key = 't', cat = 'all';
  list.innerHTML = data.map((g, i) => `<li class="g-row" data-i="${i}"><span class="pos"></span><span class="g-rank"></span><span class="g-name"><b>${g.n}</b><small>${g.c}／${g.sub}</small></span><span class="g-bar"><i></i></span><span class="g-score"></span></li>`).join('');
  const rows = $$('.g-row', list);
  function render(animate = true) {
    const first = new Map(rows.map(r => [r, r.getBoundingClientRect().top]));
    const shown = data.map((g, i) => ({ g, r: rows[i] })).filter(x => cat === 'all' || x.g.c === cat).sort((a, b) => b.g[key] - a.g[key]);
    rows.forEach(r => r.hidden = true);
    shown.slice(0, 7).forEach((x, i) => {
      const v = x.g[key], rk = rank(v); x.r.hidden = false; list.append(x.r);
      x.r.querySelector('.pos').textContent = i + 1;
      const b = x.r.querySelector('.g-rank'); b.textContent = rk; b.className = 'g-rank rk-' + rk;
      x.r.querySelector('.g-bar i').style.width = v + '%';
      x.r.querySelector('.g-score').textContent = v;
    });
    $('#guestLabel').textContent = label[key];
    if (!animate || reduce || !G) return;
    rows.filter(r => !r.hidden).forEach(r => {
      const was = first.get(r), now = r.getBoundingClientRect().top;
      if (was && was !== now) G.fromTo(r, { y: was - now }, { y: 0, duration: .6, ease: 'power3.out' });
    });
  }
  segmented($('#guestScore'), b => { key = b.dataset.s; render(); });
  $$('#guestCat .chip').forEach(c => c.addEventListener('click', () => {
    $$('#guestCat .chip').forEach(x => x.classList.toggle('on', x === c)); cat = c.dataset.c; render(false);
    if (G && !reduce) G.from(rows.filter(r => !r.hidden), { opacity: 0, x: -14, duration: .4, stagger: .04 });
  }));
  render(false);
  onView(list, () => { if (G && !reduce) G.from($$('.g-bar i', list), { width: 0, duration: 1, ease: 'power3.out', stagger: .06 }); });
})();

/* ---------- F4 動画分析（折れ線を描く） ---------- */
(function video() {
  const svg = $('#videoChart'); if (!svg) return;
  const W = 560, H = 300, P = { l: 44, r: 12, t: 16, b: 28 };
  const series = [
    { c: 'var(--amber)', f: i => 18 + i * .4 + (i > 18 ? (i - 18) ** 1.9 * 1.3 : 0) },
    { c: 'var(--signal)', f: i => 58 + Math.sin(i / 3) * 8 + i * .5 },
    { c: 'var(--muted)', f: i => 44 - i * .6 + Math.cos(i / 2.5) * 5 },
  ];
  const R = rng(7);
  const pts = series.map(s => Array.from({ length: 30 }, (_, i) => Math.max(4, s.f(i) + (R() - .5) * 5)));
  const mx = Math.max(...pts.flat()) * 1.08;
  const x = i => P.l + (W - P.l - P.r) * i / 29, y = v => H - P.b - (H - P.t - P.b) * v / mx;
  let h = '<g class="grid">';
  for (let k = 0; k <= 4; k++) { const yy = P.t + (H - P.t - P.b) * k / 4; h += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}"/>`; }
  h += '</g><g class="axis">';
  for (let k = 0; k <= 4; k++) { const yy = P.t + (H - P.t - P.b) * k / 4; h += `<text x="${P.l - 8}" y="${yy + 3}" text-anchor="end">${Math.round(mx * (1 - k / 4))}万</text>`; }
  ['9/1', '9/8', '9/15', '9/22', '9/30'].forEach((t, k) => h += `<text x="${x(k * 29 / 4)}" y="${H - 8}" text-anchor="middle">${t}</text>`);
  h += '</g>';
  pts.forEach((p, si) => {
    const d = p.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    h += `<path class="area" d="${d} L${x(29)} ${H - P.b} L${x(0)} ${H - P.b}Z" fill="${series[si].c}"/>`;
    h += `<path class="ln" d="${d}" stroke="${series[si].c}"/>`;
  });
  const last = pts[0][29];
  h += `<circle cx="${x(29)}" cy="${y(last)}" r="5" fill="var(--amber)"/><circle cx="${x(29)}" cy="${y(last)}" r="5" fill="none" stroke="var(--amber)" class="ping"/>`;
  svg.innerHTML = h;
  const lines = $$('.ln', svg);
  lines.forEach(l => { const L = l.getTotalLength(); l.style.strokeDasharray = L; l.style.strokeDashoffset = reduce ? 0 : L; });
  onView(svg, () => {
    if (!G || reduce) return;
    G.to(lines, { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut', stagger: .2 });
    G.from($$('.area', svg), { opacity: 0, duration: 1.2, delay: 1.2 });
    G.fromTo($('.ping', svg), { attr: { r: 5 }, opacity: 1 }, { attr: { r: 18 }, opacity: 0, duration: 1.4, repeat: -1, delay: 2 });
  });
})();

/* ---------- F5 店舗分析（イベント履歴の帯） ---------- */
(function hall() {
  const root = $('#hallRows'); if (!root) return;
  const names = ['サンプル店', '競合店 A', '競合店 B', '競合店 C', '競合店 D'];
  const types = ['t-news', 't-guest', 't-new', 't-day'];
  const R = rng(42);
  root.innerHTML = names.map((n, i) => {
    let marks = '';
    for (let d = 1; d <= 31; d++) if (R() < (i ? .2 : .28) || d === 11 || d === 22) {
      const t = d === 11 || d === 22 ? 't-day' : types[(R() * 3) | 0];
      marks += `<span class="h-mark ${t}" style="left:${((d - .5) / 31 * 100).toFixed(2)}%"></span>`;
    }
    return `<div class="h-row${i ? '' : ' own'}"><span class="h-name">${n}</span><div class="h-track">${marks}</div></div>`;
  }).join('');
  root.insertAdjacentHTML('afterend', '<div class="h-legend"><span><i style="background:var(--signal)"></i>取材</span><span><i style="background:var(--amber)"></i>来店ゲスト</span><span><i style="background:var(--coral)"></i>新台入替</span><span><i style="background:#6F7FD6"></i>特定日</span></div>');
  onView(root, () => { if (G && !reduce) G.from($$('.h-mark', root), { scaleY: 0, opacity: 0, duration: .35, ease: 'back.out(3)', stagger: { each: .012, from: 'random' } }); });
})();

/* ---------- 数字のカウントアップ ---------- */
$$('[data-count]').forEach(el => onView(el, () => countTo(el, +el.dataset.count), { threshold: .6 }));

/* ---------- パイプライン：順に点灯 ---------- */
(function pipe() {
  const items = $$('.pipe-steps li'); if (!items.length) return;
  onView($('#pipe'), () => items.forEach((li, i) => setTimeout(() => li.classList.add('lit'), reduce ? 0 : i * 420)));
})();

/* ---------- P-Brain：流れる粒 ---------- */
(function flow() {
  const svg = $('#flowSvg'); if (!svg) return;
  const paths = $$('.flows path', svg), holder = $('.flow-dots', svg);
  const NS = 'http://www.w3.org/2000/svg';
  const dots = [];
  paths.forEach((p, k) => {
    const L = p.getTotalLength(), n = [9, 5, 3][k], w = +p.getAttribute('stroke-width');
    for (let i = 0; i < n; i++) {
      const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', 2.4); holder.append(c);
      dots.push({ c, p, L, off: i / n, speed: .12 + k * .02, jit: (Math.random() - .5) * w * .6 });
    }
  });
  const place = t => dots.forEach(d => {
    const u = (d.off + t * d.speed) % 1, pt = d.p.getPointAtLength(u * d.L);
    d.c.setAttribute('cx', pt.x); d.c.setAttribute('cy', pt.y + d.jit * Math.sin(u * Math.PI));
    d.c.setAttribute('opacity', Math.sin(u * Math.PI).toFixed(2));
  });
  if (reduce) { place(0); return; }
  let on = false; new IntersectionObserver(([e]) => on = e.isIntersecting).observe(svg);
  (function loop(ts) { if (on) place(ts / 1000); requestAnimationFrame(loop); })(0);
})();

/* ---------- 画面イメージ：マウスで少し傾く ---------- */
if (!reduce && matchMedia('(hover: hover)').matches) {
  $$('.mock').forEach(m => {
    m.addEventListener('pointermove', e => {
      const r = m.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
      m.style.transform = `perspective(1200px) rotateY(${px * 5}deg) rotateX(${-py * 5}deg)`;
    });
    m.addEventListener('pointerleave', () => { m.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; m.style.transform = ''; setTimeout(() => m.style.transition = '', 600); });
  });
}
if (G && ST && !reduce) {
  $$('.feat-visual').forEach(v => G.from(v, { y: 60, rotateX: 8, opacity: 0, duration: 1.2, ease: 'power3.out', transformPerspective: 1200, scrollTrigger: { trigger: v, start: 'top 88%' } }));
}

/* ---------- レイアウト確定後にスクロール位置を再計算 ---------- */
if (ST) {
  addEventListener('load', () => ST.refresh());
  document.fonts && document.fonts.ready.then(() => ST.refresh());
}
