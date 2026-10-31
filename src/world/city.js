import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asphalt, sidewalk, facade, storefront, FACADE_TILE, textTex, logoTex, mulberry, KOREAN_SIGNS, vsignAtlas, SignAtlas } from '../engine/textures.js';
import { TEAMS, LEAGUE } from '../content/data.js';
import { hasModel, instanced, partGeos, model, registerNight } from '../engine/assets.js';

// 首尔街区：8x8 路网（7x7 个街区），中间一条宽的大路（z=30），两家战队总部（LEAGUE.hqA / hqB）隔路相对。
// 南边（+z）是汉江公园和江面。
export const ROADS = [-210, -150, -90, -30, 30, 90, 150, 210];
export const AVENUE_Z = 30;
export const roadWidth = (axis, v) => (axis === 'z' && v === AVENUE_Z ? 26 : 14);
const BLOCK = 60, CURB = 0.18;
export const HALF = 225;
export const SPECIAL = { '0,60': 'A', '0,0': 'B', '-60,0': 'shop', '60,60': 'billboard', '-120,60': 'home', '120,0': 'garage',
  '-60,-60': 'print', '60,-60': 'cafe', '120,60': 'metro', '-120,-60': 'pcbang', '-60,180': 'park', '0,180': 'park', '60,180': 'park' };

// 取 BoxGeometry 的几个面（按 groups），用于把同一个盒子的不同面分到不同材质的合并网格里
const SHOP_KINDS = ['shop_conv', 'shop_cafe', 'shop_chicken', 'shop_pcbang', 'shop_phone', 'shop_conv', 'shop_cafe'];

// 下载的 PBR 贴图（Poly Haven，1K）：颜色 + 法线 + 粗糙度
const texLoader = new THREE.TextureLoader();
function pbrMat(base, repeat, { color = 0xffffff, normalScale = 1 } = {}) {
  const url = k => `assets/thirdparty/textures/${base}_${k}_1k.jpg`;
  const load = (k, srgb) => { const t = texLoader.load(url(k)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return new THREE.MeshStandardMaterial({ color, map: load('diff', true), normalMap: load('nor_gl'), roughnessMap: load('rough'), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(normalScale, normalScale) });
}

function faces(g, ids) {
  const idx = [];
  for (const i of ids) { const gr = g.groups[i]; for (let k = gr.start; k < gr.start + gr.count; k++) idx.push(g.index.getX(k)); }
  const n = g.clone(); n.setIndex(idx); n.clearGroups(); return n;
}
const placeGeo = (g, x, y, z, ry = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
const remapUV = (g, from, r) => { const uv = g.attributes.uv; for (const f of from) for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0)); };

// 路灯杆上的竖旗：联赛标志
function flagTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 360; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, '#0d1b3d'); gr.addColorStop(1, '#1f4fbf'); g.fillStyle = gr; g.fillRect(0, 0, 128, 360);
  g.fillStyle = '#27e1ff'; g.fillRect(0, 300, 128, 10);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 46px "Noto Sans KR",sans-serif'; g.fillText(LEAGUE.name, 64, 70);
  g.font = '800 30px "Noto Sans KR",sans-serif'; g.fillText('2026', 64, 130);
  g.font = '700 22px "Noto Sans KR",sans-serif'; g.fillText('SPRING', 64, 168);
  g.font = '700 26px "Noto Sans KR",sans-serif'; g.fillStyle = '#ffd34d'; g.fillText('파이팅!', 64, 250);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];     // {minX,maxX,minZ,maxZ}
    this.points = {};        // 互动点
    this.hq = {};
    this.lamps = [];
    this.signs = [];
    this.nightMats = [];
    this.inst = {};          // Blender 细节模块的实例矩阵：模型名 → [Matrix4]
    this.ledges = [];        // 楼层腰线（实例化的长条）
    this.vsigns = [];        // 竖排招牌：[矩阵, 图集格子]
    this.rnd = mulberry(2024);
    this.build();
  }

  // 静态几何按材质合并：整座城市的楼体、店面、招牌最后只剩几十个网格（绘制调用从上千降到几十）
  addStatic(mat, geo, cast = true) {
    const b = (this.buckets ||= new Map());
    if (!b.has(mat)) b.set(mat, { geos: [], cast: false });
    const e = b.get(mat); e.geos.push(geo); e.cast ||= cast;
  }
  sharedFacade(style, seed) {
    const k = style + '_' + (seed % 3), c = (this.facCache ||= {});
    return c[k] || (c[k] = this.facadeMat(style, seed, FACADE_TILE.w, FACADE_TILE.h));
  }
  get signs2() {
    if (!this.signAtlas) {
      this.signAtlas = new SignAtlas();
      this.signMat = new THREE.MeshStandardMaterial({ map: this.signAtlas.tex, emissiveMap: this.signAtlas.tex, emissive: 0xffffff, emissiveIntensity: 1.8, roughness: 0.4 });
      this.signMat.userData.night = true; this.nightMats.push(this.signMat);
    }
    return this.signAtlas;
  }

  addCollider(cx, cz, w, d) { this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }); }

  build() {
    this.ground();
    this.roadMarkings();
    for (let bx = -3; bx <= 3; bx++) for (let bz = -3; bz <= 3; bz++) this.block(bx * BLOCK, bz * BLOCK);
    this.streetLamps();
    this.hqA(); this.hqB();
    this.shops();
    this.boundary();
    this.finalizeStatic();
  }

  ground() {
    // 路面：Poly Haven 的磨损沥青（颜色 + 法线 + 粗糙度），每 5 米一格
    const size = HALF * 2 + 40, rep = size / 5;
    const roadMat = pbrMat('polyhaven_worn_asphalt/worn_asphalt', rep, { color: 0x9a9a9a, normalScale: 0.8 }) || new THREE.MeshStandardMaterial({ map: asphalt().map, roughness: 0.82, color: 0xb8b8b8 });
    if (!roadMat.normalMap) roadMat.map.repeat.set(36, 36);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40), roadMat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
    this.group.add(g);
    // 远处地面
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.05; this.group.add(far);
    // 汉江：南边的江面（光滑、反射城市灯光）+ 江边护栏
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 520), new THREE.MeshStandardMaterial({ color: 0x0b1a26, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2 }));
    water.material.userData.envMul = 2.5;
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, HALF + 6 + 260); this.group.add(water);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 40, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.9 }));
    bank.position.set(0, -0.2, HALF + 4); this.group.add(bank);
    const railG = []; for (let x = -HALF; x <= HALF; x += 2.5) { const b = new THREE.BoxGeometry(0.08, 1, 0.08); b.translate(x, 0.5, HALF - 0.5); railG.push(b); }
    const top = new THREE.BoxGeometry(HALF * 2, 0.06, 0.1); top.translate(0, 1, HALF - 0.5); railG.push(top);
    const rail = new THREE.Mesh(mergeGeometries(railG), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.35 })); this.group.add(rail);
  }

  // 汉江公园：草地、步道、树、长椅、路灯；中间那块是可以集会 / 放烟花的广场
  park(s, main) {
    const w = s.xMax - s.xMin, d = s.zMax - s.zMin, cx = (s.xMin + s.xMax) / 2, cz = (s.zMin + s.zMax) / 2;
    if (!this.grassMat) this.grassMat = pbrMat('polyhaven_leafy_grass/leafy_grass', 1, { color: 0x9fb48a });
    const g = new THREE.BoxGeometry(w, CURB, d), uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + cx) * 0.25, (pos.getZ(i) + cz) * 0.25);
    g.translate(cx, CURB / 2, cz); this.addStatic(this.grassMat, faces(g, [2]), false); this.addStatic(this.curbMat || this.swMat, faces(g, [0, 1, 4, 5]), false);
    // 十字步道
    for (const [pw, pd] of [[w, 3.2], [3.2, d]]) { const p = new THREE.BoxGeometry(pw, 0.04, pd); const u = p.attributes.uv, ps = p.attributes.position; for (let i = 0; i < u.count; i++) u.setXY(i, (ps.getX(i) + cx) * 0.4, (ps.getZ(i) + cz) * 0.4); p.translate(cx, CURB + 0.02, cz); this.addStatic(this.swMat, p, false); }
    const r = this.rnd;
    for (let i = 0; i < 16; i++) {   // 树沿四周和对角
      const a = r() * Math.PI * 2, rr = 8 + r() * (Math.min(w, d) / 2 - 10);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
      this.tree(x, z);
    }
    if (main) {
      // 中央广场（铺装 + 舞台），注册成"使用道具"的地点
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.06, 40), this.swMat); pl.position.set(cx, CURB + 0.03, cz); pl.receiveShadow = true; this.group.add(pl);
      const stage = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.7 })); stage.position.set(cx, CURB + 0.3, cz - 9); this.group.add(stage);
      this.addCollider(cx, cz - 9, 10, 4);
      const t = textTex('한강공원  HAN RIVER PARK', { w: 1024, h: 160, bg: '#0b2a1e', fg: '#7dffb0', glow: 18, size: 0.55 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.5 }));
      sign.position.set(cx, 2.6, cz - 11.05); this.group.add(sign); sign.material.userData.night = true; this.nightMats.push(sign.material);
      const plaza = new THREE.Vector3(cx, CURB, cz);
      this.hq.PARK = {
        id: 'PARK', team: { id: 'PARK', name: '汉江公园', color: '#38e08a' }, cx, face: cz - 7, dir: 1, faceRy: 0, used: 0, plaza, park: true,
        slots: Array.from({ length: 10 }, (_, i) => new THREE.Vector3(cx - 9 + i * 2, CURB, cz - 5)),
        bannerPos: new THREE.Vector3(cx, CURB, cz - 6.5), wallPos: new THREE.Vector3(cx, 3, cz - 11.1), sign, signHome: sign.position.clone(), logo: null,
      };
      this.points.hq_PARK = { pos: plaza.clone(), r: 9, label: '汉江公园（集会 / 烟花 / 无人机加成）', kind: 'hq', id: 'PARK' };
    }
  }

  // 人行道块（每个街区一块抬高的人行道）
  sidewalkFor(cx, cz) {
    const wx = BLOCK - roadWidth('x', 0), wz0 = cz - BLOCK / 2, wz1 = cz + BLOCK / 2;
    // 根据相邻道路宽度收缩
    const zMin = wz0 + roadWidth('z', cz - BLOCK / 2) / 2, zMax = wz1 - roadWidth('z', cz + BLOCK / 2) / 2;
    const xMin = cx - BLOCK / 2 + 7, xMax = cx + BLOCK / 2 - 7;
    return { xMin, xMax, zMin, zMax };
  }

  block(cx, cz) {
    const r = this.rnd, s = this.sidewalkFor(cx, cz);
    const w = s.xMax - s.xMin, d = s.zMax - s.zMin, mx = (s.xMin + s.xMax) / 2, mz = (s.zMin + s.zMax) / 2;
    if (!this.swMat) {
      this.swMat = pbrMat('polyhaven_rectangular_paving/rectangular_paving', 1, { color: 0xc8c4be }) || new THREE.MeshStandardMaterial({ map: sidewalk(), roughness: 0.9 });
      this.curbMat = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.85 });
    }
    const geo = new THREE.BoxGeometry(w, CURB, d);
    // 世界坐标 UV，避免拉伸
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + mx) * 0.4, (pos.getZ(i) + mz) * 0.4);
    geo.translate(mx, CURB / 2, mz);
    this.addStatic(this.swMat, geo, false);

    const key = `${cx},${cz}`;
    const special = SPECIAL[key];
    if (special === 'park') return this.park(s, cx === 0);
    if (special === 'A' || special === 'B') { this.hqBlocks = this.hqBlocks || {}; this.hqBlocks[special] = s; this.fillerRing(s, true, special === 'A' ? -1 : 1); return; }
    if (special) { this.specialBlocks = this.specialBlocks || {}; this.specialBlocks[special] = s; }
    this.fillerRing(s, false, 0, special);
    // 街树
    for (let i = 0; i < 6; i++) {
      const side = i % 4, t = 0.15 + r() * 0.7;
      const p = side === 0 ? [s.xMin + 2, s.zMin + t * d] : side === 1 ? [s.xMax - 2, s.zMin + t * d] : side === 2 ? [s.xMin + t * w, s.zMin + 2] : [s.xMin + t * w, s.zMax - 2];
      this.tree(p[0], p[1]);
    }
  }

  // 沿街区四周排布楼房；hq 模式留出朝大路一侧的空地
  fillerRing(s, hq, hqDir, special) {
    const r = this.rnd;
    const inset = 4.5;
    const w = s.xMax - s.xMin - inset * 2, d = s.zMax - s.zMin - inset * 2;
    const x0 = s.xMin + inset, z0 = s.zMin + inset;
    const lots = [];
    // 沿 x 方向两排（北、南），沿 z 方向两列（东、西）
    const depth = 13;
    const splitRow = (z, facing) => { let x = x0; while (x < x0 + w - 6) { const lw = Math.min(8 + r() * 10, x0 + w - x); lots.push({ x: x + lw / 2, z, w: lw - 0.6, d: depth, facing }); x += lw; } };
    if (!(hq && hqDir === -1)) splitRow(z0 + depth / 2, 'S');
    if (!(hq && hqDir === 1)) splitRow(z0 + d - depth / 2, 'N');
    if (!hq) {
      const midD = d - depth * 2;
      if (midD > 6) {
        lots.push({ x: x0 + depth / 2, z: z0 + d / 2, w: depth, d: midD - 0.6, facing: 'W' });
        lots.push({ x: x0 + w - depth / 2, z: z0 + d / 2, w: depth, d: midD - 0.6, facing: 'E' });
      }
    }
    for (const L of lots) {
      if (special && L.facing === 'S' && Math.abs(L.x - (s.xMin + s.xMax) / 2) < 9) { L.special = special; }
      if (hq) { // HQ 街区：两侧楼放低
        if (Math.abs(L.x - (s.xMin + s.xMax) / 2) < 15) continue;
      }
      this.building(L, r);
    }
  }

  // 立面材质：颜色 + 夜灯 + 法线 + 粗糙度/金属度，按楼的尺寸设置平铺
  facadeMat(style, seed, w, hUpper, offsetY = 0) {
    const f = facade(style, seed);
    const rx = Math.max(1, Math.round(w / FACADE_TILE.w)), ry = hUpper / FACADE_TILE.h;
    const maps = { map: f.map.clone(), emissiveMap: f.emissive.clone(), normalMap: f.normal.clone(), roughnessMap: f.orm.clone(), metalnessMap: null };
    for (const t of [maps.map, maps.emissiveMap, maps.normalMap, maps.roughnessMap]) { t.repeat.set(rx, ry); t.offset.set(0, offsetY); t.needsUpdate = true; }
    maps.metalnessMap = maps.roughnessMap;
    const mat = new THREE.MeshStandardMaterial({ ...maps, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.9, 0.9) });
    mat.userData.night = true; (this.nightMats ||= []).push(mat);
    return mat;
  }

  building(L, r) {
    const GROUND = 4.6, FLOOR = 3.2;
    const billboard = L.special === 'billboard' && !this.billboard;
    const floors = billboard ? 9 : Math.round(2 + Math.pow(r(), 1.6) * 14);
    const h = GROUND + floors * FLOOR;
    const style = r() * 6 | 0, seed = r() * 1000 | 0;
    const roofMat = this.roofMat || (this.roofMat = new THREE.MeshStandardMaterial({ color: 0x45474d, roughness: 0.92 }));
    const darkMat = this.darkMat || (this.darkMat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.6, metalness: 0.3 }));
    // 一楼：深色框架 + 朝街的店面玻璃
    const shops = hasModel('shop_conv');
    const REC = shops ? 3.1 : 0;   // 有店铺内景时，一楼主体往里缩，让出店铺纵深
    const off0 = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing];
    const g0 = new THREE.BoxGeometry(L.w - 0.3 - Math.abs(off0[0]) * REC, GROUND, L.d - 0.3 - Math.abs(off0[1]) * REC);
    g0.translate(L.x - off0[0] * REC / 2, GROUND / 2 + CURB, L.z - off0[1] * REC / 2);
    this.addStatic(darkMat, g0);
    if (shops) this.shopModules(L, r, GROUND, darkMat); else this.storefront(L, r, GROUND);
    // 楼身（高楼有一定概率做成"裙楼 + 塔楼"）。侧面 UV 按整数格贴楼面贴图，所有同款楼共用一个材质
    const tower = !billboard && floors >= 9 && r() < 0.55;
    const podiumFloors = tower ? 2 + (r() * 2 | 0) : floors;
    const mat = this.sharedFacade(style, seed);
    const body = (w, d, y0, y1, m) => {
      const hh = y1 - y0, g = new THREE.BoxGeometry(w, hh, d), uv = g.attributes.uv;
      const rx = [Math.max(1, Math.round(d / FACADE_TILE.w)), Math.max(1, Math.round(w / FACADE_TILE.w))], ry = hh / FACADE_TILE.h;
      for (let i = 0; i < 24; i++) { const f = i >> 2; if (f === 2 || f === 3) continue; uv.setXY(i, uv.getX(i) * rx[f < 2 ? 0 : 1], uv.getY(i) * ry); }
      g.translate(L.x, CURB + y0 + hh / 2, L.z);
      this.addStatic(m, faces(g, [0, 1, 4, 5]));
      this.addStatic(roofMat, faces(g, [2, 3]));
    };
    body(L.w, L.d, GROUND, GROUND + podiumFloors * FLOOR, mat);
    let topW = L.w, topD = L.d;
    if (tower) {
      topW = Math.max(6, L.w - 2.4); topD = Math.max(6, L.d - 2.4);
      const tm = this.sharedFacade(r() < 0.5 ? 3 : 0, seed + 1);
      body(topW, topD, GROUND + podiumFloors * FLOOR, h, tm);
      this.parapet(L.x, L.z, L.w, L.d, GROUND + podiumFloors * FLOOR);
    }
    this.addCollider(L.x, L.z, L.w, L.d);
    this.parapet(L.x, L.z, topW, topD, h);
    this.rooftop(L, r, h, topW, topD, floors);
    this.facadeDetails(L, r, style, GROUND, FLOOR, tower ? podiumFloors : floors, tower ? floors - podiumFloors : 0, topW, topD);
    // 一楼招牌（霓虹）
    this.shopSign(L, r);
    if (billboard) { this.billboardScreen(L, h); this.arenaFront(L, h); }
  }

  // 女儿墙（楼顶一圈矮墙），合并进一个大网格减少绘制次数
  parapet(x, z, w, d, y) {
    const t = 0.25, hh = 0.9, parts = (this.parapetGeos ||= []);
    for (const [px, pz, sx, sz] of [[x, z - d / 2 + t / 2, w, t], [x, z + d / 2 - t / 2, w, t], [x - w / 2 + t / 2, z, t, d], [x + w / 2 - t / 2, z, t, d]]) {
      const g = new THREE.BoxGeometry(sx, hh, sz); g.translate(px, CURB + y + hh / 2, pz); parts.push(g);
    }
  }

  // 楼面细节：每层腰线、外挂空调、竖排招牌（只做朝街的一面）
  facadeFrame(L, w, d) {
    const f = { S: [0, -1, Math.PI], N: [0, 1, 0], W: [-1, 0, -Math.PI / 2], E: [1, 0, Math.PI / 2] }[L.facing];
    const c = new THREE.Vector3(L.x + f[0] * w / 2, 0, L.z + f[1] * d / 2), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f[2]);
    return { along: f[0] ? d : w, q, at: (u, y, o) => new THREE.Vector3(u, y, o).applyQuaternion(q).add(c) };
  }

  facadeDetails(L, r, style, GROUND, FLOOR, lowFloors, highFloors, topW, topD) {
    if (!hasModel('bd_ac')) return;
    const LEDGE = ['#a3abb5', '#efe9dd', '#cfc6b8', null, '#86898f', '#dedbd4'][style];
    const BAYS = [6, 4, 4, 8, 3, 5][style];
    const resid = style === 1 || style === 2 || style === 5;
    const one = new THREE.Vector3(1, 1, 1);
    const part = (F, y0, n) => {
      if (LEDGE) for (let k = 0; k <= n; k++) {
        const depth = resid ? 0.16 : 0.09;
        this.ledges.push([new THREE.Matrix4().compose(F.at(0, y0 + k * FLOOR + 0.09, depth / 2), F.q, new THREE.Vector3(F.along + 0.12, 0.17, depth)), new THREE.Color(LEDGE)]);
      }
      if (!resid && style !== 4) return;
      const tiles = Math.max(1, Math.round(F.along / FACADE_TILE.w)), bays = tiles * BAYS, bw = F.along / bays;
      for (let k = 0; k < n; k++) for (let b = 0; b < bays; b++) {
        if (r() > 0.1) continue;
        const u = -F.along / 2 + (b + 0.5) * bw + (r() - 0.5) * bw * 0.3;
        (this.inst.bd_ac ||= []).push(new THREE.Matrix4().compose(F.at(u, y0 + k * FLOOR + 0.28, 0), F.q, one));
      }
    };
    const F = this.facadeFrame(L, L.w, L.d);
    part(F, CURB + GROUND, lowFloors);
    if (highFloors) part(this.facadeFrame(L, topW, topD), CURB + GROUND + lowFloors * FLOOR, highFloors);
    // 竖排招牌：住宅/砖楼/瓷砖楼，3 层以上，楼角伸出
    if (resid && lowFloors >= 3 && r() < 0.5) {
      for (const side of r() < 0.3 ? [-1, 1] : [r() < 0.5 ? -1 : 1]) {
        this.vsigns.push([new THREE.Matrix4().compose(F.at(side * (F.along / 2 - 0.45), CURB + GROUND + 0.4, 0), F.q, one), r() * 8 | 0]);
      }
    }
  }

  rooftop(L, r, h, w, d, floors = 5) {
    const y = CURB + h, parts = (this.roofGeos ||= []);
    if (hasModel('bd_stair')) {   // Blender 楼顶设备：楼梯间、冷凝机、水箱、卫星锅、天线（实例化）
      const one = new THREE.Vector3(1, 1, 1), slots = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort(() => r() - 0.5);
      const small = w * d < 90;
      const rot = { S: Math.PI, N: 0, W: -Math.PI / 2, E: Math.PI / 2 }[L.facing] + (r() < 0.5 ? 0 : Math.PI);
      const put = (name, k, ry = rot) => {
        const [sx, sz] = slots[k];
        const p = new THREE.Vector3(L.x + sx * Math.max(0, w / 2 - 2.2), y, L.z + sz * Math.max(0, d / 2 - 2.2));
        (this.inst[name] ||= []).push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), one));
      };
      if (floors > 3) put('bd_stair', 0);
      put('bd_condenser', 1, rot + Math.PI / 2 * (r() * 4 | 0));
      if (!small) {
        if (r() < 0.6) put('bd_tank', 2);
        if (r() < 0.35) put('bd_dish', 3, r() * 6);
        else if (r() < 0.35) put('bd_antenna', 3);
      }
    } else {
      const n = 1 + (r() * 3 | 0);
      for (let i = 0; i < n; i++) {   // 空调外机 / 设备间
        const bw = 1.2 + r() * 2.5, bd = 1.2 + r() * 2, bh = 0.8 + r() * 1.6;
        const g = new THREE.BoxGeometry(bw, bh, bd); g.translate(L.x + (r() - 0.5) * (w - bw - 1), y + bh / 2, L.z + (r() - 0.5) * (d - bd - 1)); parts.push(g);
      }
      if (r() < 0.45) { const g = new THREE.CylinderGeometry(1, 1, 2, 12); g.translate(L.x + (r() - 0.5) * (w - 3), y + 1.6, L.z + (r() - 0.5) * (d - 3)); parts.push(g); }
      if (r() < 0.3) { const g = new THREE.CylinderGeometry(0.05, 0.08, 6 + r() * 6, 5); g.translate(L.x + (r() - 0.5) * w * 0.5, y + 4, L.z + (r() - 0.5) * d * 0.5); parts.push(g); }
    }
    this.rooftopSigns(L, r, h, w, d);
  }

  rooftopSigns(L, r, h, w, d) {
    const y = CURB + h;
    // 首尔特色：楼顶红色霓虹十字架 / 楼顶招牌
    const roll = r();
    if (h > 14 && h < 45 && roll < 0.12) this.neonCross(L.x + (r() - 0.5) * w * 0.4, y, L.z + (r() - 0.5) * d * 0.4);
    else if (h < 40 && roll > 0.8) this.roofSign(L, r, y, w, d);
  }

  neonCross(x, y, z) {
    const m = this.crossMat || (this.crossMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.3), toneMapped: false }));
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.5, 0.25), this.darkMat); pole.position.set(x, y + 1.75, z); this.group.add(pole);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), m); v.position.set(x, y + 4.6, z);
    const hz = new THREE.Mesh(new THREE.BoxGeometry(2, 0.35, 0.35), m); hz.position.set(x, y + 5.4, z);
    this.group.add(v, hz); (this.nightOnly ||= []).push(v, hz);
  }

  roofSign(L, r, y, w, d) {
    const words = ['모텔', 'HOTEL', '노래연습장', '치킨', '한의원', '교회', 'PC방', '찜질방', '24H', '호프'];
    const t = words[r() * words.length | 0], hue = r() < 0.5 ? 0 : r() * 360 | 0;
    const cell = this.signs2.cell(t, hue);
    const sw = Math.min(w * 0.9, 12), sh = sw / 4;
    const off = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing];
    const g = new THREE.BoxGeometry(sw, sh, 0.3);
    remapUV(g, [4, 5], cell);
    placeGeo(g, L.x + off[0] * (w / 2 - 0.6), y + sh / 2 + 0.8, L.z + off[1] * (d / 2 - 0.6), { S: Math.PI, N: 0, W: -Math.PI / 2, E: Math.PI / 2 }[L.facing]);
    this.addStatic(this.signMat, faces(g, [4, 5]), false);
    this.addStatic(this.darkMat, faces(g, [0, 1, 2, 3]));
  }

  // 一楼店铺：Blender 做的有纵深的店面模块（6 米宽、3 米深），之间用深色柱子补齐
  shopModules(L, r, GROUND, darkMat) {
    const F = this.facadeFrame(L, L.w, L.d), MW = 6.0, MH = 3.6, D = 3.1, P = 0.35;
    const span = F.along - 0.3, n = Math.max(1, Math.floor((span - P) / (MW + P)));
    const used = n * MW + (n + 1) * P, start = -used / 2;
    const one = new THREE.Vector3(1, 1, 1);
    const box = (u, w, y, h) => {   // 店面层的实心部分：柱子、两端墙、门头
      const g = new THREE.BoxGeometry(w, h, D);
      g.applyQuaternion(F.q); const c = F.at(u, CURB + y + h / 2, -D / 2 - 0.15); g.translate(c.x, c.y, c.z);
      this.addStatic(darkMat, g);
    };
    const edge = (span - used) / 2;
    if (edge > 0.01) { box(-span / 2 + edge / 2, edge, 0, GROUND); box(span / 2 - edge / 2, edge, 0, GROUND); }
    box(0, used, MH, GROUND - MH);
    for (let i = 0; i <= n; i++) box(start + i * (MW + P) + P / 2, P, 0, MH);
    for (let i = 0; i < n; i++) {
      const kind = SHOP_KINDS[(r() * SHOP_KINDS.length) | 0];
      const u = start + P + i * (MW + P) + MW / 2;
      (this.inst[kind] ||= []).push(new THREE.Matrix4().compose(F.at(u, CURB, -D / 2 - 0.12), F.q, one));
    }
  }

  // 朝街一面的一楼店面玻璃（夜里亮）
  storefront(L, r, GROUND) {
    const vi = (r() * 40 | 0) % 12, mats = (this.sfMats ||= []);
    if (!mats[vi]) {   // 12 种店面，所有楼共用
      const t = storefront(vi);
      const m = mats[vi] = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1 });
      m.userData.night = true; this.nightMats.push(m);
    }
    const off = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing];
    const along = L.facing === 'S' || L.facing === 'N' ? L.w : L.d;
    const g = new THREE.PlaneGeometry(along - 1, GROUND - 1.1);
    placeGeo(g, L.x + off[0] * (L.w / 2 - 0.1), CURB + (GROUND - 1.1) / 2 + 0.15, L.z + off[1] * (L.d / 2 - 0.1), { S: Math.PI, N: 0, W: -Math.PI / 2, E: Math.PI / 2 }[L.facing]);
    this.addStatic(mats[vi], g, false);
  }

  // 把零碎几何（女儿墙、屋顶设备）各自合并成一个网格
  finalizeStatic() {
    if (this.parapetGeos?.length) { const m = new THREE.Mesh(mergeGeometries(this.parapetGeos), this.roofMat); m.castShadow = m.receiveShadow = true; this.group.add(m); }
    if (this.roofGeos?.length) { const m = new THREE.Mesh(mergeGeometries(this.roofGeos.map(g => g.index ? g.toNonIndexed() : g)), new THREE.MeshStandardMaterial({ color: 0x8a8d93, roughness: 0.7, metalness: 0.2 })); m.castShadow = m.receiveShadow = true; this.group.add(m); }
    this.parapetGeos = this.roofGeos = null;
    for (const [mat, e] of this.buckets || []) {
      const m = new THREE.Mesh(mergeGeometries(e.geos), mat); m.castShadow = e.cast; m.receiveShadow = true; this.group.add(m);
    }
    this.buckets = null;
    // Blender 细节模块（实例化）
    const NOSHADOW = new Set(['bd_ac', 'bd_vsign', 'bd_dish', 'bd_antenna', 'bd_condenser', ...SHOP_KINDS]);   // 小件不投影，省一遍阴影绘制
    for (const [name, mats] of Object.entries(this.inst)) for (const im of instanced(name, mats, this.group, o => o.name.startsWith('sign_v'), name.startsWith('shop_') ? { cell: 120, maxDist: 85 } : { cell: 180, maxDist: 300 })) { if (NOSHADOW.has(name)) im.castShadow = false; if (name.startsWith('shop_')) registerNight(im, this); }
    if (this.ledges.length) {
      const lg = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), this.ledges.length);
      this.ledges.forEach(([m, c], i) => { lg.setMatrixAt(i, m); lg.setColorAt(i, c); });
      lg.castShadow = lg.receiveShadow = true; lg.computeBoundingSphere(); this.group.add(lg);
    }
    const sp = partGeos('bd_vsign').filter(p => p.name.startsWith('sign_v'));
    if (this.vsigns.length && sp.length) {   // 竖排招牌文字：按图集格子改 UV，全部合并成一个网格
      const geos = [];
      for (const [m, cell] of this.vsigns) for (const p of sp) {
        const g = p.geometry.clone().applyMatrix4(m), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 8);
        geos.push(g);
      }
      const t = vsignAtlas();
      const mm = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.4 });
      mm.userData.night = true; this.nightMats.push(mm);
      this.group.add(new THREE.Mesh(mergeGeometries(geos), mm));
    }
    this.inst = {}; this.ledges = []; this.vsigns = [];
  }

  shopSign(L, r, text) {
    const t = text || KOREAN_SIGNS[r() * KOREAN_SIGNS.length | 0];
    const hue = r() * 360 | 0;
    const cell = this.signs2.cell(t, hue);
    const sw = Math.min(L.w * 0.8, 7), sh = sw / 4;
    const off = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing];
    // 招牌朝向街道：S 侧楼的正面朝 -z
    const fx = L.x + off[0] * (L.w / 2 + 0.15), fz = L.z + off[1] * (L.d / 2 + 0.15), ry = { S: Math.PI, N: 0, W: -Math.PI / 2, E: Math.PI / 2 }[L.facing];
    const g = new THREE.BoxGeometry(sw, sh, 0.25);
    remapUV(g, [4, 5], cell);
    placeGeo(g, fx, 4.2, fz, ry);
    this.addStatic(this.signMat, faces(g, [4, 5]), false);
    this.addStatic(this.curbMat, faces(g, [0, 1, 2, 3]), false);
    // 雨棚（8 种颜色）
    const ai = Math.round(hue / 45) % 8, am = (this.awnMats ||= []);
    am[ai] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(ai / 8, 0.5, 0.35), roughness: 0.7 });
    const ag = new THREE.BoxGeometry(sw, 0.12, 1.4);
    placeGeo(ag, fx + off[0] * 0.7, 3.1, fz + off[1] * 0.7, ry);
    this.addStatic(am[ai], ag);
  }

  billboardScreen(L, h) {
    // 对着大路的巨幕（应援广告位）
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshBasicMaterial({ color: 0x222233, toneMapped: false }));
    screen.position.set(L.x, h * 0.55, L.z - L.d / 2 - 0.2); screen.rotation.y = Math.PI;
    this.group.add(screen);
    this.billboard = screen;
    this.setBillboard(LEAGUE.billboard, '#27e1ff');
  }

  setBillboard(text, color = '#ffffff', sub = null) {
    if (!this.billboard) return;
    const t = textTex(text, { w: 1024, h: 576, bg: '#06060c', fg: color, glow: 30, size: 0.3, sub, subColor: '#ffffff' });
    this.billboard.material.map = t; this.billboard.material.color.set(0xffffff); this.billboard.material.needsUpdate = true;
  }

  roadMarkings() {
    const geos = [], yel = [], cross = [];
    const L = HALF;
    for (const v of ROADS) {
      // 沿 x 方向的路（z = v）
      const wz = roadWidth('z', v);
      for (let x = -L; x < L; x += 6) {
        if (ROADS.some(rx => Math.abs(x + 1.5 - rx) < 9)) continue;
        if (wz > 20) { // 大路：双黄线 + 车道线
          for (const o of [-0.25, 0.25]) { const g = new THREE.PlaneGeometry(6, 0.15); g.rotateX(-Math.PI / 2); g.translate(x + 3, 0.02, v + o); yel.push(g); }
          for (const o of [-6.5, 6.5]) { const g = new THREE.PlaneGeometry(3, 0.15); g.rotateX(-Math.PI / 2); g.translate(x + 1.5, 0.02, v + o); geos.push(g); }
        } else { const g = new THREE.PlaneGeometry(3, 0.15); g.rotateX(-Math.PI / 2); g.translate(x + 1.5, 0.02, v); geos.push(g); }
      }
      for (let z = -L; z < L; z += 6) {
        if (ROADS.some(rz => Math.abs(z + 1.5 - rz) < (roadWidth('z', rz) / 2 + 2))) continue;
        const g = new THREE.PlaneGeometry(0.15, 3); g.rotateX(-Math.PI / 2); g.translate(v, 0.02, z + 1.5); geos.push(g);
      }
    }
    // 斑马线
    for (const x of ROADS) for (const z of ROADS) {
      const wz = roadWidth('z', z), wx = 14;
      for (let i = -wx / 2 + 1; i < wx / 2; i += 1.2) {
        for (const sz of [-1, 1]) { const g = new THREE.PlaneGeometry(0.6, 3); g.rotateX(-Math.PI / 2); g.translate(x + i, 0.025, z + sz * (wz / 2 + 2)); cross.push(g); }
      }
      for (let i = -wz / 2 + 1; i < wz / 2; i += 1.2) {
        for (const sx of [-1, 1]) { const g = new THREE.PlaneGeometry(3, 0.6); g.rotateX(-Math.PI / 2); g.translate(x + sx * (wx / 2 + 2), 0.025, z + i); cross.push(g); }
      }
    }
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [arr, m] of [[geos, white], [yel, yellow], [cross, white]]) {
      if (!arr.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(arr), m); mesh.receiveShadow = true; this.group.add(mesh);
    }
  }

  tree(x, z) {
    if (!this.treeGeo) {
      const trunk = new THREE.CylinderGeometry(0.12, 0.18, 3, 6); trunk.translate(0, 1.5, 0);
      this.trunkGeo = trunk;
      const parts = [];
      for (let i = 0; i < 5; i++) { const s = new THREE.IcosahedronGeometry(1 + Math.random() * 0.5, 1); s.translate((Math.random() - 0.5) * 1.6, 3.4 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6); parts.push(s); }
      this.treeGeo = mergeGeometries(parts);
      this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
      this.leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.85, flatShading: true });
      this.treeList = [];
    }
    this.treeList.push([x, z]);
  }

  finalizeTrees() {
    const maple = hasModel('tr_maple0');
    if (maple || hasModel('tr_ginkgo')) {   // 行道树：写实叶片卡片树（三种树形），叶色逐棵变化（首尔秋天：红、橙、银杏黄、还没变色的绿）
      const kinds = maple ? ['tr_maple0', 'tr_maple2', 'tr_maple4'] : ['tr_ginkgo', 'tr_zelkova', 'tr_round'], lists = kinds.map(() => []);
      const AUTUMN = [[1.0, 0.36, 0.2], [1.0, 0.58, 0.24], [1.0, 0.84, 0.3], [1.0, 0.8, 0.28], [0.5, 0.68, 0.3], [0.62, 0.7, 0.3]];
      const r = mulberry(31), up = new THREE.Vector3(0, 1, 0);
      this.treeList.forEach(([x, z]) => {
        const k = r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2, s = 0.85 + r() * 0.3;
        lists[k].push(new THREE.Matrix4().compose(new THREE.Vector3(x, CURB, z), new THREE.Quaternion().setFromAxisAngle(up, r() * 6.28), new THREE.Vector3(s, s, s)));
        this.colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, small: true });
      });
      kinds.forEach((name, k) => {
        for (const im of instanced(name, lists[k], this.group, null, { cell: 120, maxDist: 340 })) {
          if (!im.material.name.startsWith('leaf')) continue;
          for (let i = 0; i < im.count; i++) {
            if (maple) { const c = AUTUMN[r() * AUTUMN.length | 0], v = 0.85 + r() * 0.3; im.setColorAt(i, new THREE.Color(c[0] * v, c[1] * v, c[2] * v)); }
            else im.setColorAt(i, new THREE.Color(0.82 + r() * 0.3, 0.85 + r() * 0.25, 0.7 + r() * 0.3));
          }
        }
      });
      return;
    }
    const n = this.treeList.length, m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const t = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, n), l = new THREE.InstancedMesh(this.treeGeo, this.leafMat, n);
    this.treeList.forEach(([x, z], i) => {
      const s = 0.8 + Math.random() * 0.5; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6); sc.set(s, s, s);
      m.compose(new THREE.Vector3(x, CURB, z), q, sc); t.setMatrixAt(i, m); l.setMatrixAt(i, m);
      l.setColorAt(i, new THREE.Color().setHSL(0.25 + Math.random() * 0.08, 0.35, 0.28 + Math.random() * 0.1));
      this.colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, small: true });
    });
    for (const o of [t, l]) { o.castShadow = true; o.receiveShadow = true; this.group.add(o); }
  }

  streetLamps() {
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7, 6); poleGeo.translate(0, 3.5, 0);
    const armGeo = new THREE.BoxGeometry(1.6, 0.08, 0.08); armGeo.translate(0.8, 7, 0);
    const pole = mergeGeometries([poleGeo, armGeo]);
    const bulbGeo = new THREE.BoxGeometry(0.6, 0.12, 0.3); bulbGeo.translate(1.4, 6.92, 0);
    const pts = [];
    for (const v of ROADS) {
      const off = roadWidth('z', v) / 2 + 0.6;
      for (let x = -HALF + 15; x < HALF; x += 24) if (!ROADS.some(r => Math.abs(x - r) < 10)) { pts.push([x, v - off, Math.PI / 2]); pts.push([x + 12, v + off, -Math.PI / 2]); }
    }
    const n = pts.length, m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const useModel = hasModel('st_lamp');
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x2c2f35, metalness: 0.6, roughness: 0.5 }), n);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 3 });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, n);
    if (useModel) {   // Blender 路灯：每个部件一个 InstancedMesh；灯杆小旗印联赛标志
      const mats = pts.map(([x, z, ry]) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), one));
      const flag = new THREE.MeshStandardMaterial({ map: flagTex(), roughness: 0.8 });
      for (const im of instanced('st_lamp', mats, this.group)) {
        if (im.material.name === 'emit_lamp') this.bulbMat = im.material;
        if (im.name.startsWith('sign_flag')) { im.material = flag; im.castShadow = false; }
      }
    }
    // 地面光斑（假的点光源，便宜又好看）
    const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,150,0.55)'); gr.addColorStop(0.5, 'rgba(255,190,120,0.18)'); gr.addColorStop(1, 'rgba(255,180,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), this.poolMat, n);
    pts.forEach(([x, z, ry], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      m.compose(new THREE.Vector3(x, 0, z), q, one); poles.setMatrixAt(i, m); bulbs.setMatrixAt(i, m);
      const dx = Math.cos(ry) * 1.4, dz = -Math.sin(ry) * 1.4;
      m.compose(new THREE.Vector3(x + dx, 0.05 + (i % 3) * 0.002, z + dz), new THREE.Quaternion(), one); pools.setMatrixAt(i, m);
      this.colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, small: true });
    });
    poles.castShadow = true;
    if (useModel) this.group.add(pools); else this.group.add(poles, bulbs, pools);
  }

  // —— 总部 ——
  hqCommon(id, s, front) {
    const team = TEAMS.find(t => t.id === id);
    const cx = (s.xMin + s.xMax) / 2;
    const backZ = front === -1 ? s.zMax - 4 : s.zMin + 4;     // 楼背靠的一侧
    const W = 30, D = 20;
    const bz = backZ - front * (-D / 2) * -1;                 // 楼中心
    const bzc = front === -1 ? backZ - D / 2 : backZ + D / 2;
    const plazaZ = front === -1 ? s.zMin + 6 : s.zMax - 6;    // 门前广场中心
    const faceZ = front === -1 ? bzc - D / 2 : bzc + D / 2;   // 正面
    return { team, cx, bzc, W, D, plazaZ, faceZ, front };
  }

  hqA() {
    const s = this.hqBlocks.A, front = -1;            // 楼在北侧，正面朝南（-z）对着大路
    const id = LEAGUE.hqA, h = this.hqCommon(id, s, front);
    const { cx, bzc, W, D, faceZ, plazaZ, team } = h;
    const lm = model('lm_t0');
    if (lm) {   // Blender 地标：黑玻璃塔 + 竖鳍片 + 斜光带 + 顶部光环
      lm.position.set(cx, CURB, bzc); lm.rotation.y = Math.PI;
      this.dressLandmark(lm, team.color, this.facadeMat(3, 77, FACADE_TILE.w, FACADE_TILE.h));
      this.group.add(lm);
      this.addCollider(cx, bzc, W, D);
      this.makeHQSign(id, team, cx, 55.5, faceZ - 1.5, Math.PI, 14, 6);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
      logo.position.set(cx + 10, 12.5, faceZ - 1.15); logo.rotation.y = Math.PI; this.group.add(logo);
      this.registerHQ(id, h, Math.PI, logo);
      return;
    }
    const glass = new THREE.MeshStandardMaterial({ color: 0x0d0f14, metalness: 0.9, roughness: 0.12, emissive: 0x161c26 });
    glass.userData.envMul = 1.6;
    const towerMat = this.facadeMat(3, 77, W, 62);
    towerMat.userData.envMul = 1.4;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(W, 62, D), towerMat);
    tower.position.set(cx, 31 + CURB, bzc); tower.castShadow = tower.receiveShadow = true; this.group.add(tower);
    this.addCollider(cx, bzc, W, D);
    // 红色 LED 腰线
    const red = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: team.color, emissiveIntensity: 2.4 });
    for (const y of [8, 30, 52]) { const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.5, D + 0.4), red); band.position.set(cx, y, bzc); this.group.add(band); }
    // 大堂玻璃
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 1), glass);
    lobby.position.set(cx, 3.2, faceZ - 0.3); this.group.add(lobby);
    // 顶部招牌（可被火箭筒打掉）
    this.makeHQSign(id, team, cx, 52, faceZ - 0.6, Math.PI, 14, 6);
    // 立面队标
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
    logo.position.set(cx + 11, 8, faceZ - 0.05); logo.rotation.y = Math.PI; this.group.add(logo);
    this.registerHQ(id, h, Math.PI, logo);
  }

  hqB() {
    const s = this.hqBlocks.B, front = 1;             // 楼在南侧，正面朝北（+z）
    const id = LEAGUE.hqB, h = this.hqCommon(id, s, front);
    const { cx, bzc, W, D, faceZ, team } = h;
    const lm = model('lm_hwl');
    if (lm) {   // Blender 地标：浅色办公楼 + 战队色竖鳍片 + 大雨棚 + 退台楼顶
      lm.position.set(cx, CURB, bzc);
      this.dressLandmark(lm, team.color, this.facadeMat(0, 31, FACADE_TILE.w, FACADE_TILE.h));
      this.group.add(lm);
      this.addCollider(cx, bzc, W, D);
      this.makeHQSign(id, team, cx, 34, faceZ + 1.5, 0, 18, 5);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
      logo.position.set(cx - 11, 9.5, faceZ + 1.3); this.group.add(logo);
      this.registerHQ(id, h, 0, logo);
      return;
    }
    const mat = this.facadeMat(0, 31, W, 44);
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, 44, D), mat);
    body.position.set(cx, 22 + CURB, bzc); body.castShadow = body.receiveShadow = true; this.group.add(body);
    this.addCollider(cx, bzc, W, D);
    // 橙色竖向鳍片
    const orange = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.4, metalness: 0.3, emissive: team.color, emissiveIntensity: 0.25 });
    for (let i = -3; i <= 3; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 44, 1.2), orange); fin.position.set(cx + i * 4.4, 22, faceZ + 0.6); fin.castShadow = true; this.group.add(fin); }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 5), orange);
    canopy.position.set(cx, 5.5, faceZ + 2.5); canopy.castShadow = true; this.group.add(canopy);
    const glass = new THREE.MeshStandardMaterial({ color: 0x10141a, metalness: 0.9, roughness: 0.1, emissive: 0x161c26 });
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 0.6), glass); lobby.position.set(cx, 2.7, faceZ + 0.3); this.group.add(lobby);
    this.makeHQSign(id, team, cx, 38, faceZ + 1.4, 0, 18, 5);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
    logo.position.set(cx - 12, 8, faceZ + 1.3); this.group.add(logo);
    this.registerHQ(id, h, 0, logo);
  }

  // 地标模型换材质：facade → 楼面贴图（带夜间窗灯），emit_team → 战队色发光，paint → 战队色
  dressLandmark(obj, color, fac) {
    const tc = new THREE.Color(color);
    const f = fac.clone(); f.vertexColors = true; f.userData.night = true; this.nightMats.push(f);
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: tc, emissiveIntensity: 2.6 });
    glow.userData.night = true; this.nightMats.push(glow);
    const paints = new Map();
    obj.traverse(o => {
      if (!o.isMesh) return;
      const n = o.material.name || '';
      if (n.startsWith('facade')) o.material = f;
      else if (n === 'emit_team') o.material = glow;
      else if (n === 'paint') { if (!paints.has(o.material)) { const m = o.material.clone(); m.color.copy(tc); paints.set(o.material, m); } o.material = paints.get(o.material); }
      else if (n.startsWith('emit_') && !o.material.userData.night) { o.material.userData.night = true; this.nightMats.push(o.material); }
    });
  }

  arenaFront(L, h) {
    const lm = model('lm_arena');
    if (!lm) return;
    lm.position.set(L.x, CURB, L.z - L.d / 2 - 0.05); lm.rotation.y = Math.PI;
    this.dressLandmark(lm, '#27e1ff', this.facadeMat(3, 1, FACADE_TILE.w, FACADE_TILE.h));
    const c = document.createElement('canvas'); c.width = 128; c.height = 544; const g = c.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 128, 544); g.strokeStyle = '#27e1ff'; g.lineWidth = 6; g.strokeRect(6, 6, 116, 532);
    g.fillStyle = '#ffffff'; g.font = '900 64px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...LEAGUE.name, '·', ...'ARENA'].slice(0, 9), fs = Math.min(64, 500 / chars.length);
    g.font = `900 ${fs}px "Noto Sans KR",sans-serif`; chars.forEach((ch, i) => g.fillText(ch, 64, 272 + (i - (chars.length - 1) / 2) * fs * 1.02));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.4 });
    pm.userData.night = true; this.nightMats.push(pm);
    lm.traverse(o => { if (o.isMesh && o.name.startsWith('sign_pylon')) o.material = pm; });
    this.group.add(lm);
  }

  makeHQSign(id, team, x, y, z, ry, w, hgt) {
    const t = textTex(team.sign || team.name, { w: 1024, h: 420, bg: '#050505', fg: team.color, glow: 40, size: 0.8, sub: team.full, subColor: '#ffffff' });
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.8 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.6), [frame, frame, frame, frame, m, m]);
    sign.position.set(x, y, z); sign.rotation.y = ry; sign.castShadow = true;
    this.group.add(sign);
    this.hq[id] = this.hq[id] || {}; this.hq[id].sign = sign; this.hq[id].signHome = sign.position.clone();
  }

  registerHQ(id, h, ry, logo) {
    const dir = h.front;   // -1: 正面朝 -z
    const plaza = new THREE.Vector3(h.cx, CURB, h.faceZ + dir * 7);
    const hq = this.hq[id];
    Object.assign(hq, {
      id, team: h.team, plaza, face: h.faceZ, dir, cx: h.cx, logo,
      // 花圈 / 花篮摆放位
      slots: Array.from({ length: 10 }, (_, i) => new THREE.Vector3(h.cx - 13 + i * 2.9, CURB, h.faceZ + dir * 3.2)),
      used: 0,
      bannerPos: new THREE.Vector3(h.cx, CURB, h.faceZ + dir * 11.5),
      wallPos: new THREE.Vector3(h.cx - 8, 6, h.faceZ + dir * 0.08),
      faceRy: ry,
    });
    // 门前广场铺装 + 台阶
    const pl = new THREE.Mesh(new THREE.BoxGeometry(34, 0.08, 14), new THREE.MeshStandardMaterial({ color: 0x5d5f66, roughness: 0.35, metalness: 0.1 }));
    pl.position.set(h.cx, CURB + 0.04, h.faceZ + dir * 7); pl.receiveShadow = true; this.group.add(pl);
    // 广场射灯照亮正面
    const spot = new THREE.SpotLight(h.team.color, 25, 40, 0.7, 0.6, 1.5);
    spot.position.set(h.cx, 0.5, h.faceZ + dir * 12); spot.target.position.set(h.cx, 18, h.faceZ); this.group.add(spot, spot.target);
    const pt = new THREE.PointLight(0xffe2b8, 9, 26, 1.6); pt.position.set(h.cx, 6, h.faceZ + dir * 8); this.group.add(pt);
    this.points['hq_' + id] = { pos: plaza.clone(), r: 9, label: `${h.team.name} 总部`, kind: 'hq', id };
  }

  shops() {
    // 道具店、车库、出租屋：放在特殊街区朝路一侧
    const sb = this.specialBlocks;
    const mk = (key, label, kind, text, hue) => {
      const s = sb[key]; const cx = (s.xMin + s.xMax) / 2;
      const z = s.zMin + 1.5;           // 南侧人行道
      const p = new THREE.Vector3(cx, CURB, z);
      this.points[kind] = { pos: p, r: 3, label, kind };
      // 发光地圈
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 1, 0.6), transparent: true, opacity: 0.85, toneMapped: false }));
      ring.position.set(cx, CURB + 0.03, z); this.group.add(ring);
      this.points[kind].ring = ring;
      // 门头大招牌
      const t = textTex(text, { w: 1024, h: 256, bg: '#0b0b10', fg: `hsl(${hue * 360},100%,65%)`, glow: 30, size: 0.55 });
      const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 2 });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), m);
      sign.position.set(cx, 5.2, s.zMin + 4.5 - 0.05); sign.rotation.y = Math.PI; this.group.add(sign);
    };
    mk('shop', '应援 & 抗议用品店', 'shop', '응원·항의 용품  SHOP', 0.92);
    mk('garage', '车行 / 司机中介', 'garage', '중고차 · 대리운전', 0.55);
    mk('home', '你的出租屋（结束今天）', 'home', '원룸  HOME', 0.15);
    mk('print', '打印店（定制标语 / 做周边）', 'print', '인쇄 · 굿즈 제작  PRINT', 0.08);
    mk('cafe', '粉丝咖啡店（办应援活动）', 'cafe', '팬 카페  FAN CAFE', 0.05);
    mk('metro', '地铁站广告位', 'metro', '지하철  2호선  광고', 0.33);
    mk('pcbang', '网吧（全明星投票打榜）', 'pcbang', 'PC방  24시', 0.72);
    // 联盟竞技场：其余 8 支战队的选手都在这里"被应援/被抗议"
    const bb0 = sb.billboard, acx = (bb0.xMin + bb0.xMax) / 2, aface = bb0.zMin + 4.5;
    this.hq.ARENA = {
      id: 'ARENA', team: { id: 'ARENA', name: LEAGUE.arena, color: '#27e1ff' }, cx: acx, face: aface, dir: -1, faceRy: Math.PI, used: 0,
      plaza: new THREE.Vector3(acx, CURB, aface - 3), sign: this.billboard, signHome: this.billboard.position.clone(), logo: null,
      slots: Array.from({ length: 10 }, (_, i) => new THREE.Vector3(acx - 13 + i * 2.9, CURB, aface - 1.6)),
      bannerPos: new THREE.Vector3(acx, CURB, bb0.zMin + 0.8), wallPos: new THREE.Vector3(acx - 8, 6, aface - 0.02),
    };
    this.points.hq_ARENA = { pos: this.hq.ARENA.plaza.clone(), r: 9, label: `${LEAGUE.arena}（其他战队）`, kind: 'hq', id: 'ARENA' };
    const bb = sb.billboard; this.points.billboard = { pos: new THREE.Vector3((bb.xMin + bb.xMax) / 2, CURB, bb.zMin - 2), r: 0, label: '对面大屏', kind: 'billboard' };
  }

  boundary() {
    // 城市外围：远景楼群 + 不可越过的边界
    const r = this.rnd;
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2, d = (Math.sin(a) > 0.3 ? 420 : 290) + r() * 120, h = 20 + r() * 90;   // 南边隔着汉江
      const w = 15 + r() * 25;
      const f = facade(r() * 6 | 0, i + 500);
      const m = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6 });
      m.userData.night = true; this.nightMats.push(m);
      f.map.repeat.set(2, 3); f.emissive.repeat.set(2, 3);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), m);
      b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); this.group.add(b);
    }
    // 南山塔剪影
    const tower = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3, 90, 12), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.5 }));
    shaft.position.y = 45 + 60; tower.add(shaft);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(7, 5, 10, 16), new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0x4466ff, emissiveIntensity: 0.6 }));
    pod.position.y = 140; tower.add(pod);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d2a1d, roughness: 1 }));
    hill.scale.y = 0.55; tower.add(hill);
    tower.position.set(-120, 0, -480); this.group.add(tower);
    this.bounds = HALF - 2;
  }

  // 夜晚：窗户、招牌亮度
  updateNight(n) {
    for (const m of this.nightMats) m.emissiveIntensity = (m.userData.base ?? (m.userData.base = m.emissiveIntensity)) * (0.15 + n * 0.85);
    if (this.poolMat) this.poolMat.opacity = n * 0.9;
    for (const o of this.nightOnly || []) o.visible = n > 0.25;
    if (this.bulbMat) this.bulbMat.emissiveIntensity = 0.5 + n * 3;
  }

  // 圆与 AABB 碰撞推出
  collide(pos, radius) {
    let hit = false;
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX)), nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (radius - d) / d; pos.x += dx * k; pos.z += dz * k; }
        else { // 在内部：沿最近边推出
          const opts = [[c.minX - radius - pos.x, 0], [c.maxX + radius - pos.x, 0], [0, c.minZ - radius - pos.z], [0, c.maxZ + radius - pos.z]];
          opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); pos.x += opts[0][0]; pos.z += opts[0][1];
        }
      }
    }
    const B = this.bounds;
    if (Math.abs(pos.x) > B) { pos.x = Math.sign(pos.x) * B; hit = true; }
    if (Math.abs(pos.z) > B) { pos.z = Math.sign(pos.z) * B; hit = true; }
    return hit;
  }

  // 是否在人行道上（决定地面高度）
  groundY(x, z) {
    for (const r of ROADS) { if (Math.abs(x - r) < 7) return 0; if (Math.abs(z - r) < roadWidth('z', r) / 2) return 0; }
    return CURB;
  }
}
