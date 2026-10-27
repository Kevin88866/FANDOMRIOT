import * as THREE from 'three';

// 程序化贴图（网络拿不到 PBR 素材，全部用 canvas 画）
const cache = new Map();
let rnd = mulberry(7);
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(g, w, h, amt, alpha = 0.08) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

export function asphalt() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#2b2c30'; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 26);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); }
  const m = { map: tex(c, { repeat: [1, 1] }), rough: null };
  cache.set('asphalt', m); return m;
}

export function sidewalk() {
  if (cache.has('side')) return cache.get('side');
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8f8a86'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const v = 130 + rnd() * 30 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
    g.fillRect(x * 64 + (y % 2) * 32 + 1, y * 32 + 1, 62, 30);
  }
  noise(g, 256, 256, 18);
  const m = tex(c, { repeat: [1, 1] }); cache.set('side', m); return m;
}

// ---------- 大楼立面 ----------
// 一张贴图 = 7 层楼高（22.4m）× 12m 宽。同一套布局同时生成：
// 颜色贴图、夜间灯光贴图、法线贴图（窗户内凹、窗框凸起）、粗糙度/金属度贴图（玻璃反光、墙面粗糙）。
export const FACADE_TILE = { w: 12, h: 22.4, floors: 7 };
const STYLES = [
  { name: 'office',    wall: '#3a3f47', glass: [24, 32, 44], frame: '#9aa3ad', bays: 6, win: [0.96, 0.62], curtain: true,  lit: 0.32, light: 'office' },
  { name: 'apartment', wall: '#d9d0c1', glass: [40, 48, 58], frame: '#f1ede6', bays: 4, win: [0.62, 0.5],  balcony: true,  lit: 0.38, light: 'home' },
  { name: 'brick',     wall: '#8a4b38', glass: [30, 36, 44], frame: '#d8d0c4', bays: 4, win: [0.5, 0.48],  brick: true,    lit: 0.34, light: 'home' },
  { name: 'darkglass', wall: '#1b2330', glass: [18, 26, 38], frame: '#2c3644', bays: 8, win: [0.98, 0.9],  curtain: true,  lit: 0.18, light: 'office' },
  { name: 'ribbon',    wall: '#9b9a95', glass: [30, 38, 48], frame: '#5c6066', bays: 1, win: [0.96, 0.42], ribbon: true,    lit: 0.3,  light: 'office' },
  { name: 'tile',      wall: '#e6e4de', glass: [34, 42, 52], frame: '#c9c6bf', bays: 5, win: [0.52, 0.5],  tile: true,     lit: 0.36, light: 'home' },
];
const LIGHTS = {
  office: [['#e6f0ff', 0.55], ['#fff4dd', 0.35], ['#cfe3ff', 0.1]],
  home: [['#ffc77a', 0.5], ['#ffe2b0', 0.3], ['#fff4e2', 0.14], ['#9cc3ff', 0.06]],
};
function pickW(r, list) { let x = r(); for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[0][0]; }

function heightToNormal(hc, strength = 2.2) {
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const [nc, ng] = canvas(W, H), out = ng.createImageData(W, H), d = out.data;
  const h = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ng.putImageData(out, 0, 0); return nc;
}

export function facade(style = 0, seed = 1) {
  // 每种风格只做 3 个变体（贴图共享），控制生成时间和显存
  seed = seed % 3;
  const key = 'fac' + style + '_' + seed;
  if (cache.has(key)) return cache.get(key);
  const S = STYLES[style % STYLES.length], r = mulberry(seed * 977 + style * 31 + 7);
  const W = 320, H = 640, F = FACADE_TILE.floors, fh = H / F, bw = W / S.bays;
  const [c, g] = canvas(W, H), [e, ge] = canvas(W, H), [hc, hg] = canvas(W, H), [oc, og] = canvas(W, H);
  g.fillStyle = S.wall; g.fillRect(0, 0, W, H); noise(g, W, H, S.brick ? 10 : 8);
  hg.fillStyle = 'rgb(170,170,170)'; hg.fillRect(0, 0, W, H);
  og.fillStyle = 'rgb(255,215,0)'; og.fillRect(0, 0, W, H);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  if (S.brick) { for (let y = 0; y < H; y += 8) for (let x = (y / 8 % 2) * 12; x < W; x += 24) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`; g.fillRect(x, y, 23, 1); g.fillRect(x, y, 1, 8); hg.fillStyle = 'rgb(150,150,150)'; hg.fillRect(x, y, 23, 1); } }
  if (S.tile) { g.strokeStyle = 'rgba(0,0,0,.07)'; for (let y = 0; y < H; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } for (let x = 0; x < W; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } }
  for (let f = 0; f < F; f++) {
    const y = f * fh;
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + fh - 6, W, 6);
    hg.fillStyle = 'rgb(200,200,200)'; hg.fillRect(0, y + fh - 8, W, 8);
  }
  const [gr, gg, gb] = S.glass;
  for (let f = 0; f < F; f++) {
    for (let b = 0; b < S.bays; b++) {
      const ww = bw * S.win[0], wh = fh * S.win[1];
      const x0 = b * bw + (bw - ww) / 2, y0 = f * fh + (S.curtain ? 3 : fh * 0.18);
      const grad = g.createLinearGradient(0, y0, 0, y0 + wh);
      grad.addColorStop(0, `rgb(${gr + 38},${gg + 46},${gb + 58})`); grad.addColorStop(0.55, `rgb(${gr},${gg},${gb})`); grad.addColorStop(1, `rgb(${gr - 10},${gg - 10},${gb - 8})`);
      g.fillStyle = grad; g.fillRect(x0, y0, ww, wh);
      hg.fillStyle = 'rgb(70,70,70)'; hg.fillRect(x0, y0, ww, wh);
      og.fillStyle = 'rgb(255,22,150)'; og.fillRect(x0, y0, ww, wh);
      const mull = S.curtain ? 3 : S.ribbon ? 6 : 2;
      g.strokeStyle = S.frame; g.lineWidth = 3; g.strokeRect(x0, y0, ww, wh);
      hg.strokeStyle = 'rgb(235,235,235)'; hg.lineWidth = 3; hg.strokeRect(x0, y0, ww, wh);
      og.strokeStyle = 'rgb(255,90,200)'; og.lineWidth = 3; og.strokeRect(x0, y0, ww, wh);
      for (let m = 1; m < mull; m++) { const mx = x0 + ww * m / mull; g.fillStyle = S.frame; g.fillRect(mx - 1, y0, 2, wh); hg.fillStyle = 'rgb(230,230,230)'; hg.fillRect(mx - 1, y0, 2, wh); }
      if (!S.curtain && !S.ribbon) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x0 - 3, y0 + wh, ww + 6, 4); hg.fillStyle = 'rgb(255,255,255)'; hg.fillRect(x0 - 3, y0 + wh, ww + 6, 4); }
      if (S.balcony) { g.fillStyle = 'rgba(240,238,230,.9)'; g.fillRect(x0 - 6, y0 + wh * 0.62, ww + 12, wh * 0.38); g.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 6; k++) g.fillRect(x0 - 6 + k * (ww + 12) / 6, y0 + wh * 0.62, 2, wh * 0.38); hg.fillStyle = 'rgb(225,225,225)'; hg.fillRect(x0 - 6, y0 + wh * 0.62, ww + 12, wh * 0.38); }
      const segs = S.ribbon ? 6 : 1;
      for (let k = 0; k < segs; k++) {
        if (r() > S.lit) continue;
        const sx = x0 + ww * k / segs, sw = ww / segs;
        const col = pickW(r, LIGHTS[S.light]);
        const lg = ge.createLinearGradient(0, y0, 0, y0 + wh);
        lg.addColorStop(0, col); lg.addColorStop(1, shade(col, 0.45));
        ge.globalAlpha = 0.55 + r() * 0.45; ge.fillStyle = lg; ge.fillRect(sx + 2, y0 + 2, sw - 4, wh - 4);
        ge.globalAlpha = 1;
        const t = r();
        if (t < 0.35) { ge.fillStyle = 'rgba(0,0,0,.55)'; const cw = sw * (0.2 + r() * 0.35); ge.fillRect(r() < 0.5 ? sx + 2 : sx + sw - cw - 2, y0 + 2, cw, wh - 4); }
        else if (t < 0.55 && S.light === 'office') { ge.fillStyle = 'rgba(0,0,0,.35)'; for (let yy = y0 + 4; yy < y0 + wh; yy += 5) ge.fillRect(sx + 2, yy, sw - 4, 2); }
        else if (t < 0.7) { ge.fillStyle = 'rgba(0,0,0,.22)'; ge.fillRect(sx + 2, y0 + wh * 0.6, sw - 4, wh * 0.4 - 2); }   // 室内家具的阴影
      }
    }
  }
  const map = tex(c), emissive = tex(e);
  const normal = tex(heightToNormal(hc), { srgb: false }), orm = tex(oc, { srgb: false });
  const out = { map, emissive, normal, orm, style: S.name };
  cache.set(key, out); return out;
}

function shade(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); return '#' + c.getHexString(); }

export function storefront(seed = 1) {
  const key = 'shop' + seed; if (cache.has(key)) return cache.get(key);
  const r = mulberry(seed * 131 + 3), W = 512, H = 192;
  const [c, g] = canvas(W, H);
  const hue = r() * 360 | 0, warm = r() < 0.6;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, warm ? '#fff3d9' : '#eef6ff'); bg.addColorStop(1, warm ? '#b88d5a' : '#8fa3b8');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) { const y = 70 + i * 22; g.fillStyle = 'rgba(60,50,40,.55)'; g.fillRect(10, y, W - 20, 3); for (let x = 14; x < W - 20; x += 8 + r() * 10) { g.fillStyle = `hsl(${(hue + r() * 120) | 0},${50 + r() * 40}%,${40 + r() * 25}%)`; g.fillRect(x, y - 6 - r() * 10, 5 + r() * 4, 6 + r() * 10); } }
  for (let x = 40; x < W; x += 90) { g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(x, 8, 50, 5); }
  for (let i = 0; i < 1 + (r() * 3 | 0); i++) { const x = 40 + r() * (W - 80); g.fillStyle = 'rgba(30,28,30,.75)'; g.beginPath(); g.ellipse(x, 150, 14, 34, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x, 105, 11, 0, 7); g.fill(); }
  const rf = g.createLinearGradient(0, 0, W, H); rf.addColorStop(0, 'rgba(255,255,255,.18)'); rf.addColorStop(0.5, 'rgba(255,255,255,0)'); rf.addColorStop(1, 'rgba(255,255,255,.1)');
  g.fillStyle = rf; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a2d33'; for (let x = 0; x <= W; x += W / 4) g.fillRect(x - 3, 0, 6, H); g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6);
  const t = tex(c); cache.set(key, t); return t;
}

// 文字贴图：招牌 / 横幅 / LED 屏
export function textTex(text, { w = 1024, h = 256, bg = '#000', fg = '#fff', font = 900, size = 0.6, glow = 0, border = null, sub = null, subColor = null } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = h * 0.06; g.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08); }
  let fs = h * size * (sub ? 0.75 : 1);
  g.font = `${font} ${fs}px "Noto Sans KR","Noto Sans SC","Microsoft YaHei",sans-serif`;
  while (g.measureText(text).width > w * 0.9 && fs > 8) { fs *= 0.92; g.font = `${font} ${fs}px "Noto Sans KR","Noto Sans SC","Microsoft YaHei",sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (glow) { g.shadowColor = fg; g.shadowBlur = glow; }
  g.fillStyle = fg; g.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) { g.shadowBlur = 0; g.font = `600 ${h * 0.16}px sans-serif`; g.fillStyle = subColor || fg; g.fillText(sub, w / 2, h * 0.78); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// 队标（圆角方块 + 队名）
export function logoTex(team) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = team.color2; g.fillRect(0, 0, 512, 512);
  g.fillStyle = team.color;
  g.beginPath(); g.roundRect(40, 40, 432, 432, 70); g.fill();
  g.fillStyle = '#fff'; g.font = `900 ${team.name.length > 3 ? 120 : 200}px "Noto Sans KR",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(team.id, 256, 270);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const KOREAN_SIGNS = ['편의점', '치킨', '노래방', 'PC방', '카페', '약국', '한식당', '고기집', '부동산', '병원', '커피', '떡볶이', '호프', '24시', '김밥천국', '올리브영', '은행', '네일', '헤어샵', '편의점 GS', '맥주', '소주', '라면'];

// 竖排招牌（세로 간판）图集：8 格，每格 128×640，一格一个店名
export const VSIGN_WORDS = ['치킨', '노래방', 'PC방', '약국', '호프', '당구장', '한의원', '미용실'];
export function vsignAtlas(words = VSIGN_WORDS) {
  const [c, g] = canvas(1024, 640);
  words.slice(0, 8).forEach((w, i) => {
    const x0 = i * 128, hue = (i * 47 + 10) % 360;
    g.fillStyle = `hsl(${hue},55%,9%)`; g.fillRect(x0, 0, 128, 640);
    g.strokeStyle = `hsl(${hue},90%,60%)`; g.lineWidth = 6; g.strokeRect(x0 + 7, 7, 114, 626);
    const chars = [...w].slice(0, 5), fs = Math.min(92, 560 / chars.length * 0.82);
    g.font = `900 ${fs}px "Noto Sans KR","Noto Sans SC",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = `hsl(${hue},100%,60%)`; g.shadowBlur = 16; g.fillStyle = `hsl(${hue},100%,80%)`;
    chars.forEach((ch, k) => g.fillText(ch, x0 + 64, 320 + (k - (chars.length - 1) / 2) * fs * 1.1));
    g.shadowBlur = 0;
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
