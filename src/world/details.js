import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, AVENUE_Z, roadWidth } from './city.js';
import { Vehicle } from '../player/vehicle.js';
import { textTex, mulberry } from '../engine/textures.js';
import { model, hasModel, instanced, recolor, registerNight } from '../engine/assets.js';

// 街道细节：红绿灯、公交站、自动售货机、电线杆和电线、路边停的车、护栏、花坛、长椅、垃圾桶、护柱。
// 模型来自 Blender（assets/models/st_*.glb）。静态物体按材质合并或实例化，控制绘制次数。
const CURB = 0.18;
const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const place = (x, y, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), ONE);

// 把一堆物体按"材质外观"合并（同外观的材质视为同一个），保留顶点色（Blender 烘焙的 AO）
function bake(parent, objects) {
  const groups = new Map();
  const keyOf = m => [m.type, m.color?.getHexString(), m.emissive?.getHexString(), m.emissiveIntensity, m.map?.uuid, m.transparent, m.opacity, m.roughness, m.metalness, m.vertexColors, m.clearcoat, m.side].join('|');
  for (const obj of objects) {
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const k = keyOf(o.material);
      if (!groups.has(k)) groups.set(k, { mat: o.material, geos: [] });
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const col = g.attributes.color;
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (o.material.vertexColors) {
        const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(1);
        if (col) for (let i = 0; i < n; i++) { a[i * 3] = col.getX(i); a[i * 3 + 1] = col.getY(i); a[i * 3 + 2] = col.getZ(i); }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
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

const ROAD_NAMES = ['선릉로', '삼성로', '봉은사로', '테헤란로', '영동대로', '학동로'];
const ADS = ['LCK 2026 · 恶搞版', '삼각김밥 1+1', '편의점 야식', 'FANDOM RIOT', '치킨은 언제나 옳다', '롤 파크 직관 가자'];

export function buildStreetDetails(game) {
  const city = game.city, grp = new THREE.Group(), r = mulberry(77);
  game.scene.add(grp);
  const statics = [];
  const add = (name, x, y, z, ry = 0) => { const o = model(name); if (!o) return null; o.position.set(x, y, z); o.rotation.y = ry; statics.push(o); return o; };

  // ---------- 红绿灯（大路上的每个路口）：灯泡按相位、颜色合并成 6 个网格，循环切换材质 ----------
  const lampOn = {
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1), toneMapped: false }),
    yellow: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.1), toneMapped: false }),
    green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 2.6, 1.2), toneMapped: false }),
  };
  const lampOff = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.25 });
  const lampGeos = { A: { red: [], yellow: [], green: [] }, B: { red: [], yellow: [], green: [] } };
  const signMats = {};
  const signMat = name => signMats[name] ||= new THREE.MeshStandardMaterial({ map: textTex(name, { w: 512, h: 112, bg: '#0b3d91', fg: '#ffffff', size: 0.62, border: '#dfe7ff' }), roughness: 0.5 });
  // armDir：灯臂伸向路中间的方向。A 相 = 大路（沿 x）上的车看的灯（灯臂横跨大路，沿 z）
  const signal = (x, z, armDir, roadName) => {
    const o = add('st_signal', x, CURB, z, Math.atan2(-armDir[1], armDir[0]));
    if (!o) return;
    const phase = armDir[1] !== 0 ? 'A' : 'B';
    o.updateMatrixWorld(true);
    o.traverse(c => {
      if (!c.isMesh) return;
      const m = /^lamp_(red|yellow|green)/.exec(c.name);
      if (m) { lampGeos[phase][m[1]].push(c.geometry.clone().applyMatrix4(c.matrixWorld)); c.visible = false; }
      else if (c.name.startsWith('sign_street')) c.material = signMat(roadName);
    });
    city.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, small: true });
  };
  ROADS.forEach((x, i) => {
    const hw = 7, hz = roadWidth('z', AVENUE_Z) / 2;
    signal(x - hw - 1, AVENUE_Z - hz - 1, [0, 1], '테헤란로');
    signal(x + hw + 1, AVENUE_Z + hz + 1, [0, -1], '테헤란로');
    signal(x + hw + 1, AVENUE_Z - hz - 1, [-1, 0], ROAD_NAMES[i]);
    signal(x - hw - 1, AVENUE_Z + hz + 1, [1, 0], ROAD_NAMES[i]);
  });
  const lamps = { A: {}, B: {} };
  for (const ph of ['A', 'B']) for (const c of ['red', 'yellow', 'green']) {
    if (!lampGeos[ph][c].length) continue;
    const m = new THREE.Mesh(mergeGeometries(lampGeos[ph][c]), lampOff); grp.add(m); lamps[ph][c] = m;
  }

  // ---------- 公交站（大路两侧） ----------
  const ledMat = new THREE.MeshBasicMaterial({ map: textTex('472  곧 도착', { w: 512, h: 110, bg: '#050505', fg: '#ffb020', size: 0.62 }), toneMapped: false });
  const stopMat = new THREE.MeshStandardMaterial({ map: textTex('롤파크 앞', { w: 384, h: 256, bg: '#ffffff', fg: '#0b6b45', size: 0.4, sub: 'LoL Park', subColor: '#333' }), roughness: 0.5 });
  for (const [x, side] of [[-60, -1], [60, 1], [-120, 1], [120, -1]]) {
    const z = AVENUE_Z + side * (roadWidth('z', AVENUE_Z) / 2 + 2.2), ry = side < 0 ? 0 : Math.PI;
    const o = model('st_busstop');
    if (!o) continue;
    o.position.set(x, CURB, z); o.rotation.y = ry;
    const t = textTex(ADS[r() * ADS.length | 0], { w: 512, h: 768, bg: '#101320', fg: '#ffffff', size: 0.16, glow: 10 });
    const adMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.1 });
    adMat.userData.night = true; city.nightMats.push(adMat);
    o.traverse(c => {
      if (!c.isMesh) return;
      if (c.name.startsWith('screen_ad')) c.material = adMat;
      else if (c.name === 'screen_led') c.material = ledMat;
      else if (c.name === 'sign_stop') c.material = stopMat;
    });
    const bin = model('st_bin'); if (bin) { bin.position.set(3.4, 0, -0.3); o.add(bin); }
    registerNight(o, city);
    grp.add(o);
    const backZ = z + (ry ? 0.84 : -0.84);
    city.colliders.push({ minX: x - 2.7, maxX: x + 2.7, minZ: backZ - 0.12, maxZ: backZ + 0.12, small: true });
  }

  // ---------- 自动售货机 + 垃圾桶（商店、家门口、车行附近） ----------
  const vendCols = [0xc4161c, 0x1f5fbf, 0xeeeeee, 0x1e7a46, 0xf0a020];
  const vendSign = new THREE.MeshStandardMaterial({ map: textTex('시원한 음료', { w: 512, h: 192, bg: '#151515', fg: '#ffffff', size: 0.5 }), roughness: 0.4 });
  let vi = 0;
  for (const key of ['shop', 'home', 'garage']) {
    const p = city.points[key]?.pos; if (!p) continue;
    for (const dx of [4.5, 5.6]) {
      const o = model('st_vending'); if (!o) continue;
      o.position.set(p.x + dx, CURB, p.z + 1.6);
      recolor(o, vendCols[vi++ % vendCols.length]);
      o.traverse(c => { if (c.isMesh && c.name === 'sign_vend') c.material = vendSign; });
      registerNight(o, city);
      grp.add(o);
      city.colliders.push({ minX: o.position.x - 0.5, maxX: o.position.x + 0.5, minZ: o.position.z - 0.4, maxZ: o.position.z + 0.4, small: true });
    }
    add('st_bin', p.x + 6.8, CURB, p.z + 1.7);
  }
  // 车行门口的路锥
  const gp = city.points.garage?.pos;
  if (gp) for (let i = 0; i < 4; i++) add('st_cone', gp.x - 4 + i * 1.3, CURB, gp.z + 3.2, r() * 3);

  // ---------- 电线杆 + 电线（小路两侧，首尔街头的标志） ----------
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0c0c0e });
  const poleMats = [], poleLines = [];
  const WIRES = [[-0.8, 8.5], [0, 8.5], [0.8, 8.5], [-0.5, 7.7], [0.5, 7.7]];
  const poleRow = (pts, alongX) => {
    pts.forEach(([x, z]) => poleMats.push(place(x, CURB, z, alongX ? Math.PI / 2 : 0)));
    for (let i = 0; i < pts.length - 1; i++) for (const [o, oy] of WIRES) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], seg = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        seg.push(new THREE.Vector3(x0 + (x1 - x0) * t + (alongX ? 0 : o), CURB + oy - Math.sin(t * Math.PI) * 0.7, z0 + (z1 - z0) * t + (alongX ? -o : 0)));
      }
      poleLines.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(seg), wireMat));
    }
    pts.forEach(([x, z]) => city.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, small: true }));
  };
  for (const x of [-90, 90, -150]) { const pts = []; for (let z = -140; z <= 140; z += 22) if (!ROADS.some(rz => Math.abs(z - rz) < roadWidth('z', rz) / 2 + 3)) pts.push([x + 8.2, z]); poleRow(pts, false); }
  for (const z of [-90, 90]) { const pts = []; for (let x = -140; x <= 140; x += 22) if (!ROADS.some(rx => Math.abs(x - rx) < 10)) pts.push([x, z - 8.2]); poleRow(pts, true); }
  instanced('st_pole', poleMats, grp);
  for (const l of poleLines) grp.add(l);

  // ---------- 路边停车（小路，合并成静态网格；车灯不亮） ----------
  const parked = [];
  const cols = [0xf2f2f2, 0x1d1f24, 0x8a8f96, 0x2b3a55, 0x6b1d22, 0xd8d4c8];
  const offHead = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.15, metalness: 0.3 });
  const offTail = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, roughness: 0.25 });
  for (let i = 0; i < 18; i++) {
    const vertical = i % 2 === 0;
    const road = ROADS[[0, 1, 4, 5][i % 4]];
    const along = -140 + r() * 280;
    if (ROADS.some(rr => Math.abs(along - rr) < 14)) continue;
    const kind = r() < 0.2 ? 'taxi' : r() < 0.15 ? 'van' : 'sedan';
    const v = new Vehicle(kind, { color: kind === 'sedan' ? cols[i % cols.length] : undefined });
    v.root.traverse(o => { if (!o.isMesh) return; const n = o.material.name || ''; if (n === 'emit_head' || n === 'emit_amber') o.material = offHead; else if (n === 'emit_tail') o.material = offTail; });
    const side = r() < 0.5 ? -1 : 1;
    if (vertical) { v.root.position.set(road + side * 5.6, 0, along); v.root.rotation.y = side > 0 ? 0 : Math.PI; }
    else { v.root.position.set(along, 0, road + side * 5.6); v.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    parked.push(v.root);
    city.colliders.push({ minX: v.root.position.x - (vertical ? 1 : 2.4), maxX: v.root.position.x + (vertical ? 1 : 2.4), minZ: v.root.position.z - (vertical ? 2.4 : 1), maxZ: v.root.position.z + (vertical ? 2.4 : 1), small: true });
  }
  bake(grp, parked);

  // ---------- 大路中央护栏、人行道花坛、消防栓 ----------
  const railMats = [];
  for (let x = -160; x <= 160; x += 3.8) {
    if (ROADS.some(rx => Math.abs(x - rx) < 9)) continue;
    railMats.push(place(x, 0.03, AVENUE_Z));
    city.colliders.push({ minX: x - 1.95, maxX: x + 1.95, minZ: AVENUE_Z - 0.15, maxZ: AVENUE_Z + 0.15, small: true });   // 护栏挡人也挡车
  }
  for (const im of instanced('st_rail', railMats, grp)) im.castShadow = false;
  const planterMats = [];
  for (let x = -150; x <= 150; x += 15) for (const side of [-1, 1]) {
    if (ROADS.some(rx => Math.abs(x - rx) < 10)) continue;
    const z = AVENUE_Z + side * (roadWidth('z', AVENUE_Z) / 2 + 1.1);
    planterMats.push(place(x + 7, CURB, z));
    city.colliders.push({ minX: x + 6.2, maxX: x + 7.8, minZ: z - 0.35, maxZ: z + 0.35, small: true });
  }
  for (const im of instanced('st_planter', planterMats, grp)) im.castShadow = false;
  for (const [x, side] of [[-104, 1], [-16, -1], [44, 1], [104, -1], [134, 1]]) add('st_hydrant', x, CURB, AVENUE_Z + side * (roadWidth('z', AVENUE_Z) / 2 + 0.7), r() * 6);

  // ---------- 总部门前广场：两侧长椅 + 垃圾桶 + 花坛，靠路边一排护柱 ----------
  for (const id of Object.keys(city.hq)) {
    const hq = city.hq[id];
    if (!hq || id === 'ARENA' || hq.face === undefined) continue;
    const d = hq.dir, cx = hq.cx, fz = hq.face;
    for (const s of [-1, 1]) {
      add('st_bench', cx + s * 17.5, CURB, fz + d * 8, -s * Math.PI / 2);
      add('st_bin', cx + s * 17.6, CURB, fz + d * 10.3, -s * Math.PI / 2);
      add('st_planter', cx + s * 17.5, CURB, fz + d * 4.5, Math.PI / 2);
      city.colliders.push({ minX: cx + s * 17.5 - 0.5, maxX: cx + s * 17.5 + 0.5, minZ: Math.min(fz + d * 3.5, fz + d * 11) , maxZ: Math.max(fz + d * 3.5, fz + d * 11), small: true });
    }
    for (let x = cx - 21; x <= cx + 21; x += 2.6) {
      if (Math.abs(x - cx) < 5) continue;
      add('st_bollard', x, CURB, fz + d * 15.2);
    }
  }

  bake(grp, statics);

  // ---------- 动态：红绿灯循环 ----------
  game.details = {
    update(time) {
      const t = (time % 24) / 24;   // 24 秒一个周期
      const set = (ph, state) => { for (const c of ['red', 'yellow', 'green']) { const m = lamps[ph][c]; if (m) m.material = c === state ? lampOn[c] : lampOff; } };
      set('A', t < 0.42 ? 'green' : t < 0.5 ? 'yellow' : 'red');
      set('B', t < 0.5 ? 'red' : t < 0.92 ? 'green' : 'yellow');
    },
  };
}
