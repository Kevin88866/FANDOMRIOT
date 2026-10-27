import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, AVENUE_Z, roadWidth } from './city.js';
import { Vehicle } from '../player/vehicle.js';
import { textTex, mulberry } from '../engine/textures.js';

// 街道细节：红绿灯、公交站、自动售货机、电线杆和电线、路边停的车、护栏和花坛。
// 静态物体按材质合并成少数几个网格，控制绘制次数。
const CURB = 0.18;

// 把一堆物体按"材质外观"合并（同色同类型的材质视为同一个）
function bake(parent, objects) {
  const groups = new Map();
  const keyOf = m => [m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.emissiveIntensity, m.map?.uuid, m.transparent, m.opacity].join('|');
  for (const obj of objects) {
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh) return;
      const k = keyOf(o.material);
      if (!groups.has(k)) groups.set(k, { mat: o.material, geos: [] });
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      groups.get(k).geos.push(g);
    });
  }
  const out = [];
  for (const { mat, geos } of groups.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true; parent.add(m); out.push(m);
  }
  return out;
}

export function buildStreetDetails(game) {
  const city = game.city, grp = new THREE.Group(), r = mulberry(77);
  game.scene.add(grp);
  const statics = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.7, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.6 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 0.9 });
  const box = (w, h, d, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; statics.push(m); return m; };
  const cyl = (rt, rb, h, mat, x, y, z, seg = 8) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); statics.push(m); return m; };

  // ---------- 红绿灯（大路上的每个路口） ----------
  const lampMats = {
    r: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1), toneMapped: false }),
    y: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.1), toneMapped: false }),
    g: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 2.6, 1.2), toneMapped: false }),
  };
  const lamps = { A: { r: [], y: [], g: [] }, B: { r: [], y: [], g: [] } };
  const signal = (x, z, armDir, phase) => {
    // armDir: 灯臂伸向路中间的方向；phase A = 控制沿 x 方向行驶的车，B = 沿 z
    cyl(0.12, 0.15, 6.5, metal, x, CURB + 3.25, z);
    const L = 5.5, ax = x + armDir[0] * L / 2, az = z + armDir[1] * L / 2;
    box(armDir[0] ? L : 0.14, 0.14, armDir[1] ? L : 0.14, metal, ax, CURB + 6.3, az);
    const hx = x + armDir[0] * (L - 0.4), hz = z + armDir[1] * (L - 0.4);
    const along = armDir[0] !== 0;
    box(along ? 1.5 : 0.45, 0.45, along ? 0.45 : 1.5, dark, hx, CURB + 5.9, hz);
    ['r', 'y', 'g'].forEach((c, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lampMats[c]);
      const o = (i - 1) * 0.45;
      // 灯面朝向来车方向（垂直于灯臂）
      s.position.set(hx + (along ? o : 0), CURB + 5.9, hz + (along ? 0 : o));
      if (along) s.position.z += phase === 'A' ? 0 : 0.24 * Math.sign(-armDir[0] || 1); else s.position.x += 0.24;
      grp.add(s); lamps[phase][c].push(s);
    });
  };
  for (const x of ROADS) {
    const hw = 7, hz = roadWidth('z', AVENUE_Z) / 2;
    signal(x - hw - 1, AVENUE_Z - hz - 1, [0, 1], 'B');
    signal(x + hw + 1, AVENUE_Z + hz + 1, [0, -1], 'B');
    signal(x + hw + 1, AVENUE_Z - hz - 1, [-1, 0], 'A');
    signal(x - hw - 1, AVENUE_Z + hz + 1, [1, 0], 'A');
  }

  // ---------- 公交站（大路两侧） ----------
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
  const ads = ['LCK 2026 · 恶搞版', '삼각김밥 1+1', '편의점 야식', 'FANDOM RIOT', '치킨은 언제나 옳다'];
  for (const [x, side] of [[-60, -1], [60, 1], [-120, 1], [120, -1]]) {
    const z = AVENUE_Z + side * (roadWidth('z', AVENUE_Z) / 2 + 2.2), ry = side < 0 ? 0 : Math.PI;
    const g = new THREE.Group(); g.position.set(x, CURB, z); g.rotation.y = ry;
    const add = (m, px, py, pz) => { m.position.set(px, py, pz); g.add(m); };
    add(new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 1.8), metal), 0, 2.6, 0);
    for (const px of [-2.4, 2.4]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), metal), px, 1.3, -0.7);
    add(new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.2, 0.05), glass), 0, 1.3, -0.8);
    add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.7 })), 0, 0.5, -0.45);
    const t = textTex(ads[r() * ads.length | 0], { w: 512, h: 768, bg: '#101320', fg: '#ffffff', size: 0.16, glow: 10 });
    const ad = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.0, 0.15), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.1 }));
    add(ad, 2.6, 1.2, -0.2);
    grp.add(g);
  }

  // ---------- 自动售货机（商店、家门口附近） ----------
  const vend = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#e8eef6'; x.fillRect(0, 0, 256, 512);
    for (let row = 0; row < 5; row++) for (let i = 0; i < 6; i++) { x.fillStyle = `hsl(${(row * 70 + i * 23) % 360},70%,50%)`; x.fillRect(16 + i * 38, 30 + row * 64, 26, 44); x.fillStyle = '#333'; x.fillRect(16 + i * 38, 78 + row * 64, 26, 6); }
    x.fillStyle = '#c4161c'; x.fillRect(0, 360, 256, 152); x.fillStyle = '#fff'; x.font = '900 46px sans-serif'; x.textAlign = 'center'; x.fillText('음료', 128, 450);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const vmMat = new THREE.MeshStandardMaterial({ map: vend, emissiveMap: vend, emissive: 0xffffff, emissiveIntensity: 0.8 });
  for (const key of ['shop', 'home', 'garage']) {
    const p = city.points[key]?.pos; if (!p) continue;
    for (const dx of [4.5, 5.6]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.8), [dark, dark, dark, dark, dark, vmMat]);
      m.position.set(p.x + dx, CURB + 0.95, p.z + 1.6); m.rotation.y = Math.PI; m.castShadow = true; grp.add(m);
    }
  }

  // ---------- 电线杆 + 电线（小路两侧，首尔街头的标志） ----------
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0c0c0e });
  const poleLines = [];
  const poleRow = pts => {
    pts.forEach(([x, z]) => { cyl(0.13, 0.17, 9, concrete, x, CURB + 4.5, z); box(1.8, 0.12, 0.12, metal, x, CURB + 8.4, z); box(1.2, 0.1, 0.1, metal, x, CURB + 7.6, z); cyl(0.25, 0.25, 0.7, dark, x + 0.4, CURB + 7.1, z); });
    for (let i = 0; i < pts.length - 1; i++) for (const [ox, oy] of [[-0.8, 8.45], [0, 8.45], [0.8, 8.45], [-0.5, 7.65], [0.5, 7.65]]) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], seg = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; seg.push(new THREE.Vector3(x0 + (x1 - x0) * t + ox, CURB + oy - Math.sin(t * Math.PI) * 0.7, z0 + (z1 - z0) * t)); }
      poleLines.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg), wireMat));
    }
  };
  for (const x of [-90, 90, -150]) { const pts = []; for (let z = -140; z <= 140; z += 22) if (!ROADS.some(rz => Math.abs(z - rz) < roadWidth('z', rz) / 2 + 3)) pts.push([x + 8.2, z]); poleRow(pts); }
  for (const z of [-90, 90]) { const pts = []; for (let x = -140; x <= 140; x += 22) if (!ROADS.some(rx => Math.abs(x - rx) < 10)) pts.push([x, z - 8.2]); poleRow(pts); }
  for (const l of poleLines) grp.add(l);

  // ---------- 路边停车（小路，合并成静态网格） ----------
  const parked = [];
  const cols = [0xf2f2f2, 0x1d1f24, 0x8a8f96, 0x2b3a55, 0x6b1d22, 0xd8d4c8];
  for (let i = 0; i < 18; i++) {
    const vertical = i % 2 === 0;
    const road = ROADS[[0, 1, 4, 5][i % 4]];
    const along = -140 + r() * 280;
    if (ROADS.some(rr => Math.abs(along - rr) < 14)) continue;
    const kind = r() < 0.2 ? 'taxi' : 'sedan';
    const v = new Vehicle(kind, { color: kind === 'sedan' ? cols[i % cols.length] : undefined });
    const side = r() < 0.5 ? -1 : 1;
    if (vertical) { v.root.position.set(road + side * 5.6, 0, along); v.root.rotation.y = side > 0 ? 0 : Math.PI; }
    else { v.root.position.set(along, 0, road + side * 5.6); v.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    parked.push(v.root);
    city.colliders.push({ minX: v.root.position.x - (vertical ? 1 : 2.3), maxX: v.root.position.x + (vertical ? 1 : 2.3), minZ: v.root.position.z - (vertical ? 2.3 : 1), maxZ: v.root.position.z + (vertical ? 2.3 : 1), small: true });
  }
  bake(grp, parked);

  // ---------- 大路护栏（中央绿化带）和花坛 ----------
  for (let x = -160; x <= 160; x += 4) { if (ROADS.some(rx => Math.abs(x - rx) < 9)) continue; box(3.8, 0.7, 0.08, new THREE.MeshStandardMaterial({ color: 0xd8d8d0, metalness: 0.4, roughness: 0.5 }), x, 0.45, AVENUE_Z); }
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.95 }), bushMat = new THREE.MeshStandardMaterial({ color: 0x3e6236, roughness: 0.9, flatShading: true });
  for (let x = -150; x <= 150; x += 15) for (const side of [-1, 1]) {
    if (ROADS.some(rx => Math.abs(x - rx) < 10)) continue;
    const z = AVENUE_Z + side * (roadWidth('z', AVENUE_Z) / 2 + 1.1);
    box(1.6, 0.5, 0.7, planterMat, x + 7, CURB + 0.25, z);
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), bushMat); b.scale.set(1.4, 0.7, 0.6); b.position.set(x + 7, CURB + 0.75, z); statics.push(b);
  }

  bake(grp, statics);

  // ---------- 动态：红绿灯循环 ----------
  game.details = {
    update(time) {
      const t = (time % 24) / 24;   // 24 秒一个周期
      const set = (ph, state) => { for (const c of ['r', 'y', 'g']) for (const m of lamps[ph][c]) m.visible = c === state; };
      set('A', t < 0.42 ? 'g' : t < 0.5 ? 'y' : 'r');
      set('B', t < 0.5 ? 'r' : t < 0.92 ? 'g' : 'y');
    },
  };
}
