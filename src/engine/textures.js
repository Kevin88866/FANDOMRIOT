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

// 大楼立面：返回 map + emissiveMap（夜晚灯光窗户）
export function facade(style = 0, seed = 1) {
  const key = 'fac' + style + '_' + seed;
  if (cache.has(key)) return cache.get(key);
  const r = mulberry(seed * 977 + style);
  const W = 256, H = 512;
  const [c, g] = canvas(W, H), [e, ge] = canvas(W, H);
  const palettes = [
    ['#c9c4bd', '#2d3a4a'], ['#8d8f94', '#1d2a38'], ['#d8d2c4', '#31404e'], ['#5b616b', '#16202b'], ['#b68f72', '#2b3440'], ['#e4e4e2', '#3a4a5c'],
  ];
  const [wall, glass] = palettes[style % palettes.length];
  g.fillStyle = wall; g.fillRect(0, 0, W, H); noise(g, W, H, 14);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const glassTower = style === 1 || style === 3;
  const cols = glassTower ? 8 : 4 + (r() * 3 | 0), rows = glassTower ? 16 : 8 + (r() * 4 | 0);
  const cw = W / cols, rh = H / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = x * cw + (glassTower ? 1 : cw * 0.16), py = y * rh + (glassTower ? 1 : rh * 0.22);
    const w = glassTower ? cw - 2 : cw * 0.68, h = glassTower ? rh - 2 : rh * 0.56;
    const gr = g.createLinearGradient(px, py, px + w, py + h);
    gr.addColorStop(0, glass); gr.addColorStop(1, '#0c1118');
    g.fillStyle = gr; g.fillRect(px, py, w, h);
    if (r() < 0.42) {                     // 亮灯
      const warm = r() < 0.7;
      ge.fillStyle = warm ? `hsl(${35 + r() * 15},${70 + r() * 20}%,${45 + r() * 25}%)` : `hsl(${190 + r() * 30},60%,${55 + r() * 20}%)`;
      ge.fillRect(px, py, w, h);
      if (r() < 0.5) { ge.fillStyle = 'rgba(0,0,0,.55)'; ge.fillRect(px + w * r(), py, w * 0.3, h); }
    }
  }
  const out = { map: tex(c), emissive: tex(e) };
  cache.set(key, out); return out;
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
