// 6,396粒＝XiXが監視している店舗数。
// ノイズ（散らばった情報）→ 日本地図（そろえる）→ 県別の柱（測る）へスクロールで変形する。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { JAPAN, JAPAN_VIEWBOX } from './japan.js';

const N = 6396;
const canvas = document.getElementById('field');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (!canvas || !webglOK()) {
  document.documentElement.classList.add('no-webgl');
} else {
  init();
}

// 決定論的な乱数（毎回同じ形になる）
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// 県ごとのピクセルを集めて、面積に比例して粒を配置する
function sampleJapan(rand) {
  const [vx, vy, vw, vh] = JAPAN_VIEWBOX;
  const S = 0.5, W = Math.ceil(vw * S), H = Math.ceil(vh * S);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(S, 0, 0, S, -vx * S, -vy * S);
  JAPAN.forEach((p, i) => { ctx.fillStyle = `rgb(${i + 1},0,0)`; ctx.fill(new Path2D(p.d)); });
  const img = ctx.getImageData(0, 0, W, H).data;
  const pix = []; // [x, y, prefIndex]
  const sums = JAPAN.map(() => ({ x: 0, y: 0, n: 0 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4, r = img[k];
    if (r > 0 && img[k + 3] > 200 && r <= JAPAN.length) {
      const pi = r - 1; pix.push(x, y, pi);
      sums[pi].x += x; sums[pi].y += y; sums[pi].n++;
    }
  }
  const cx = W / 2, cy = H / 2, scale = 10 / H; // 地図の高さ ≒ 10ユニット
  const toWorld = (x, y) => [(x - cx) * scale, -(y - cy) * scale];
  const pts = new Float32Array(N * 3), pref = new Uint16Array(N);
  const total = pix.length / 3;
  for (let i = 0; i < N; i++) {
    const j = Math.floor(rand() * total) * 3;
    const [wx, wy] = toWorld(pix[j] + rand(), pix[j + 1] + rand());
    pts[i * 3] = wx; pts[i * 3 + 1] = wy; pts[i * 3 + 2] = (rand() - 0.5) * 0.08;
    pref[i] = pix[j + 2];
  }
  const cent = sums.map(s => s.n ? toWorld(s.x / s.n, s.y / s.n) : [0, 0]);
  return { pts, pref, cent };
}

function init() {
  const rand = rng(20260427);
  const { pts: mapPts, pref, cent } = sampleJapan(rand);

  // 県ごとの柱の高さ（イメージ値）
  const heights = JAPAN.map((_, i) => 0.6 + rng(i * 97 + 13)() * 2.6);
  const counts = new Array(JAPAN.length).fill(0), seen = new Array(JAPAN.length).fill(0);
  for (let i = 0; i < N; i++) counts[pref[i]]++;

  const noise = new Float32Array(N * 3), bars = new Float32Array(N * 3), meta = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    // ノイズ：横長の雲
    const u = rand() * Math.PI * 2, v = Math.acos(2 * rand() - 1), r = Math.cbrt(rand());
    noise[i * 3] = Math.sin(v) * Math.cos(u) * r * 15;
    noise[i * 3 + 1] = Math.sin(v) * Math.sin(u) * r * 8;
    noise[i * 3 + 2] = Math.cos(v) * r * 7;
    // 柱：県の重心に積み上げる
    const p = pref[i], k = seen[p]++, f = counts[p] > 1 ? k / (counts[p] - 1) : 0;
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 0.16;
    bars[i * 3] = cent[p][0] + Math.cos(a) * rr;
    bars[i * 3 + 1] = cent[p][1] + Math.sin(a) * rr;
    bars[i * 3 + 2] = f * heights[p];
    meta[i * 4] = rand();          // 位相
    meta[i * 4 + 1] = 0.6 + rand() * 0.9; // サイズ
    meta[i * 4 + 2] = f;           // 柱の中での高さ位置
    meta[i * 4 + 3] = rand();      // 遅延
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mapPts, 3));
  geo.setAttribute('aNoise', new THREE.BufferAttribute(noise, 3));
  geo.setAttribute('aBar', new THREE.BufferAttribute(bars, 3));
  geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));

  const uniforms = {
    uP: { value: reduce ? 1 : 0 },
    uTime: { value: 0 },
    uPix: { value: Math.min(window.devicePixelRatio, 2) },
    uBlue: { value: new THREE.Color('#3D94F1') },
    uAmber: { value: new THREE.Color('#FFB23F') },
    uWhite: { value: new THREE.Color('#E9EDF8') },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uP, uTime, uPix;
      attribute vec3 aNoise, aBar; attribute vec4 aMeta;
      varying float vFlash, vTop, vMap;
      float ease(float t){ return t<.5 ? 4.*t*t*t : 1.-pow(-2.*t+2.,3.)/2.; }
      void main(){
        float d = aMeta.w * .35;
        float t1 = ease(clamp((uP - d) / .65, 0., 1.));
        float t2 = ease(clamp((uP - 1. - d) / .65, 0., 1.));
        vec3 drift = vec3(sin(uTime*.35 + aMeta.x*40.), cos(uTime*.28 + aMeta.x*31.), sin(uTime*.22 + aMeta.x*17.)) * .45;
        vec3 p = mix(aNoise + drift, position, t1);
        p = mix(p, aBar, t2);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        float flash = step(.992, fract(uTime*.09 + aMeta.x*7.));
        vFlash = flash * (1. - t2);
        vTop = t2 * smoothstep(.82, 1., aMeta.z);
        vMap = t1;
        gl_PointSize = aMeta.y * uPix * (1. + flash*1.8 + vTop*.8) * (74. / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBlue, uAmber, uWhite;
      varying float vFlash, vTop, vMap;
      void main(){
        vec2 c = gl_PointCoord - .5; float r = length(c);
        if (r > .5) discard;
        float a = smoothstep(.5, .0, r);
        vec3 col = mix(mix(uWhite, uBlue, .35), uBlue, vMap);
        col = mix(col, uAmber, max(vFlash, vTop));
        float core = smoothstep(.22, .0, r);
        gl_FragColor = vec4(col + core*.35, a * (.7 + .3*vMap + vFlash));
      }`,
  });

  const points = new THREE.Points(geo, mat);
  const group = new THREE.Group(); group.add(points);
  const scene = new THREE.Scene(); scene.add(group);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 24);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);

  let wide = true;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    wide = w > 900;
  }
  resize(); window.addEventListener('resize', resize);

  // マウスで少し傾く
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth - .5; mouse.ty = e.clientY / innerHeight - .5; }, { passive: true });

  // スクロール：ストーリー区間で 0→1→2
  const state = { p: reduce ? 1 : 0, tilt: 0 };
  const G = window.gsap, ST = window.ScrollTrigger;
  if (G && ST && !reduce) {
    G.registerPlugin(ST);
    // 3段落（各100vh）に合わせる：散らばる→そろう→測る
    const tl = G.timeline({ scrollTrigger: { trigger: '#story', start: 'top bottom', end: 'bottom bottom', scrub: 1 } });
    tl.to(state, { p: 0, duration: .36 })
      .to(state, { p: 1, duration: .28, ease: 'none' })
      .to(state, { p: 1, duration: .12 })
      .to(state, { p: 2, tilt: 1, duration: .2, ease: 'none' })
      .to(state, { p: 2, duration: .04 });
  }

  // 見えている間だけ描画
  let visible = true;
  const cover = document.querySelector('.paper');
  if (cover) new IntersectionObserver(([e]) => {
    visible = !(e.isIntersecting && e.boundingClientRect.top <= 0);
  }, { threshold: [0, 1] }).observe(cover);
  window.addEventListener('scroll', () => {
    if (!cover) return;
    visible = cover.getBoundingClientRect().top > 0;
  }, { passive: true });

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uP.value = state.p;
    mouse.x += (mouse.tx - mouse.x) * .05; mouse.y += (mouse.ty - mouse.y) * .05;
    const offX = wide ? 5.2 : 0;
    group.position.x = offX * (0.6 + 0.4 * Math.min(state.p, 1));
    group.position.y = wide ? 0 : -1.5;
    group.rotation.x = -state.tilt * 0.95 + mouse.y * .25;
    group.rotation.y = mouse.x * .35 + (state.p < 1 ? t * .03 : 0) * (1 - Math.min(state.p, 1));
    group.rotation.z = state.tilt * 0.22;
    camera.position.z = (wide ? 24 : 30) - state.tilt * (wide ? 4 : 5);
    renderer.render(scene, camera);
  }
  if (reduce) { renderer.render(scene, camera); window.addEventListener('resize', () => renderer.render(scene, camera)); }
  else frame();
}
