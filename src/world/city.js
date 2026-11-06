import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asphalt, sidewalk, facade, storefront, FACADE_TILE, textTex, logoTex, mulberry, KOREAN_SIGNS, vsignAtlas, SignAtlas } from '../engine/textures.js';
import { TEAMS, LEAGUE } from '../content/data.js';
import { hasModel, instanced, partGeos, model, registerNight, registerCull, registerRange } from '../engine/assets.js';
import { CurveRoad, stripGeo, curbWall } from './curve.js';

// 首尔街区：8x8 路网（7x7 个街区），中间一条宽的大路（z=30），两家战队总部（LEAGUE.hqA / hqB）隔路相对。
// 南边（+z）是汉江公园和江面。
export const ROADS = [-210, -150, -90, -30, 30, 90, 150, 210];
export const AVENUE_Z = 30;
export const roadWidth = (axis, v) => (axis === 'z' && v === AVENUE_Z ? 26 : 14);
const BLOCK = 60, CURB = 0.18;
export const HALF = 225;
// 街区用途（key = 街区中心坐标）。5 栋战队总部分散在地图各处，其余战队在中间的竞技场。
// hq:<队> 的 front：-1 = 楼在街区北侧、正面朝南；1 = 楼在南侧、正面朝北
export const SPECIAL = {
  '-120,-120': 'hq:T0:1', '120,120': 'hq:HWL:-1', '120,-120': 'hq:GZ:1', '-120,120': 'hq:DM:-1', '0,-120': 'hq:KC:1',
  '0,0': 'billboard', '-60,0': 'shop', '-120,0': 'home', '120,0': 'garage',
  '-60,-120': 'print', '60,-60': 'cafe', '60,120': 'metro', '-60,60': 'pcbang',
  '-60,180': 'park', '0,180': 'park', '60,180': 'park',
  '-180,-60': 'pocket', '180,60': 'pocket', '-180,120': 'playground', '180,-60': 'parking', '0,-180': 'construction', '180,-180': 'pocket',
};

// 取 BoxGeometry 的几个面（按 groups），用于把同一个盒子的不同面分到不同材质的合并网格里
const SHOP_KINDS = ['shop_conv', 'shop_cafe', 'shop_chicken', 'shop_pcbang', 'shop_phone', 'shop_conv', 'shop_cafe'];

// 下载的 PBR 贴图（Poly Haven，1K）：颜色 + 法线 + 粗糙度
const texLoader = new THREE.TextureLoader();
function pbrMat(base, repeat, { color = 0xffffff, normalScale = 1 } = {}) {
  const url = k => `assets/thirdparty/textures/${base}_${k}_1k.jpg`;
  const load = (k, srgb) => { const t = texLoader.load(url(k)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return new THREE.MeshStandardMaterial({ color, map: load('diff', true), normalMap: load('nor_gl'), roughnessMap: load('rough'), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(normalScale, normalScale) });
}

// 窗户构件几何体（+Z 朝外，原点在窗中心、墙面上）。两组：0 = 窗框 / 窗台 / 栏杆，1 = 玻璃
function windowGeo(kind) {
  const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const P = (w, h, x, y, z) => new THREE.PlaneGeometry(w, h).translate(x, y, z);
  const strip = g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; };
  let frame = [], glass = [];
  if (kind === 'balcony') {   // 公寓封闭阳台：凸出墙面 0.9 米，下半实墙板、上半玻璃
    const W = 3.3, D = 0.9;
    frame.push(B(W, 0.16, D, 0, -1.5, D / 2), B(W, 0.12, D, 0, 1.35, D / 2), B(W, 1.0, 0.08, 0, -0.92, D), B(0.08, 2.8, D, -W / 2, -0.1, D / 2), B(0.08, 2.8, D, W / 2, -0.1, D / 2), B(0.06, 1.7, 0.06, 0, 0.47, D));
    glass.push(P(W - 0.1, 1.7, 0, 0.47, D + 0.01));
  } else if (kind === 'office') {   // 写字楼幕墙单元：整面玻璃 + 细窗框 + 层间横梁
    const W = 1.66, H = 3.1;
    frame.push(B(0.06, H, 0.1, -W / 2, 0, 0.05), B(W, 0.32, 0.12, 0, -H / 2 + 0.16, 0.06), B(W, 0.05, 0.08, 0, 0.35, 0.05));
    glass.push(P(W - 0.04, H - 0.34, 0, 0.17, 0.03));
  } else {
    const W = kind === 'grille' ? 1.3 : 1.9, H = kind === 'grille' ? 1.05 : 1.35, t = 0.07;
    frame.push(B(W + t * 2, t, 0.1, 0, H / 2 + t / 2, 0.05), B(W + t * 2, t, 0.1, 0, -H / 2 - t / 2, 0.05), B(t, H, 0.1, -W / 2 - t / 2, 0, 0.05), B(t, H, 0.1, W / 2 + t / 2, 0, 0.05),
      B(0.05, H, 0.06, 0, 0, 0.06), B(W + 0.3, 0.06, 0.2, 0, -H / 2 - 0.1, 0.1));   // 推拉窗中梃 + 窗台
    if (kind === 'grille') for (let i = 0; i < 6; i++) frame.push(B(0.025, H + 0.1, 0.025, -W / 2 + (i + 0.5) * W / 6, 0, 0.16));   // 防盗网
    glass.push(P(W, H, 0, 0, 0.02));
  }
  const fg = mergeGeometries(frame.map(strip)), gg = mergeGeometries(glass.map(strip));
  return mergeGeometries([fg, gg], true);
}

// 世界坐标 UV（侧面按 x 或 z、顶面按 xz），scale = 每米多少格
function worldUV(g, scale) {
  const uv = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const u = ny > 0.5 ? pos.getX(i) : nx > 0.5 ? pos.getZ(i) : pos.getX(i), v = ny > 0.5 ? pos.getZ(i) : pos.getY(i);
    uv.setXY(i, u * scale, v * scale);
  }
  return g;
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
    this.curveSetup();
    this.ground();
    this.roadMarkings();
    for (let bx = -3; bx <= 3; bx++) for (let bz = -3; bz <= 3; bz++) this.block(bx * BLOCK, bz * BLOCK);
    this.curveBuild();
    this.streetLamps();
    for (const [id, b] of Object.entries(this.hqBlocks)) this.buildHQ(id, b.s, b.front);
    for (const f of this.fillers || []) this.filler(f.kind, f.s);
    this.subwayExits();
    this.shops();
    this.boundary();
    this.finalizeStatic();
  }

  ground() {
    // 路面：Poly Haven 的磨损沥青（颜色 + 法线 + 粗糙度），每 5 米一格
    const size = HALF * 2 + 40, rep = size / 5;
    const roadMat = this.roadMat = pbrMat('polyhaven_worn_asphalt/worn_asphalt', rep, { color: 0x9a9a9a, normalScale: 0.8 }) || new THREE.MeshStandardMaterial({ map: asphalt().map, roughness: 0.82, color: 0xb8b8b8 });
    if (!roadMat.normalMap) roadMat.map.repeat.set(36, 36);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40), roadMat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
    this.group.add(g);
    // 远处地面
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.05; this.group.add(far);
    // 汉江：南边的江面（光滑、反射城市灯光）+ 江边护栏
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 520), new THREE.MeshStandardMaterial({ color: 0x0a1822, roughness: 0.12, metalness: 0.3 }));
    water.material.userData.envMul = 0.7;
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
    this.parkDressing(cx, cz, w, d, main);
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
    if (this.curveCutSlab(s)) { /* 弯路穿过：人行道按格子拼，让出路面 */ } else {
    const geo = new THREE.BoxGeometry(w, CURB, d);
    // 世界坐标 UV，避免拉伸
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + mx) * 0.4, (pos.getZ(i) + mz) * 0.4);
    geo.translate(mx, CURB / 2, mz);
    this.addStatic(this.swMat, geo, false);
    }

    const key = `${cx},${cz}`;
    const special = SPECIAL[key];
    if (special === 'park') return this.park(s, cx === 0);
    if (special && special.startsWith('hq:')) { const [, id, front] = special.split(':'); (this.hqBlocks ||= {})[id] = { s, front: +front }; this.fillerRing(s, true, +front); return; }
    if (['pocket', 'playground', 'parking', 'construction'].includes(special)) { (this.fillers ||= []).push({ kind: special, s }); this.fillerRing(s, false, 0, null, true); return; }
    if (!special && (Math.abs(cx) === 180 || Math.abs(cz) === 180)) {
      const W2 = s.xMax - s.xMin - 10;
      for (const [z, facing] of [[s.zMin + 9, 'S'], [s.zMax - 9, 'N']]) { const L = { x: (s.xMin + s.xMax) / 2, z, w: W2, d: 11, facing, apt: true }; if (!this.curveHit(L)) this.building(L, r); }
      for (let i = 0; i < 5; i++) this.tree(s.xMin + 5 + i * (W2 / 4), (s.zMin + s.zMax) / 2 + (i % 2 ? 3 : -3));
      return;
    }
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
  fillerRing(s, hq, hqDir, special, open = false) {
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
    if (open) { for (const L of lots) this.building(L, r); return; }
    if (!hq) {
      const midD = d - depth * 2;
      if (midD > 6) {
        lots.push({ x: x0 + depth / 2, z: z0 + d / 2, w: depth, d: midD - 0.6, facing: 'W' });
        lots.push({ x: x0 + w - depth / 2, z: z0 + d / 2, w: depth, d: midD - 0.6, facing: 'E' });
      }
    }
    for (const L of lots) {
      if (this.curveHit(L)) continue;   // 被斜穿的弯路占了
      if (Math.abs(L.z - AVENUE_Z) < 30) L.zone = 'ave';
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
    const floors = billboard ? 9 : L.apt ? 14 + (r() * 7 | 0) : L.zone === 'ave' ? Math.round(5 + Math.pow(r(), 1.3) * 14) : Math.round(3 + Math.pow(r(), 2.2) * 9);
    const h = GROUND + floors * FLOOR;
    const style = r() * 6 | 0, seed = r() * 1000 | 0;
    const roofMat = this.roofMat || (this.roofMat = new THREE.MeshStandardMaterial({ color: 0x45474d, roughness: 0.92 }));
    const darkMat = this.darkMat || (this.darkMat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.6, metalness: 0.3 }));
    // 一楼外墙：真实的石材 / 面砖贴图（不再是一整块黑色）
    this.baseMats ||= ['polyhaven_concrete_tile_facade/concrete_tile_facade', 'polyhaven_rectangular_facade_tiles/rectangular_facade_tiles', 'polyhaven_plastered_wall_04/plastered_wall_04']
      .map((b, i) => pbrMat(b, 1, { color: [0xb8b4ae, 0xc9c4bc, 0xa9a6a2][i] }));
    const baseMat = this.baseMats[(r() * this.baseMats.length) | 0];
    // 一楼：深色框架 + 朝街的店面玻璃
    const shops = hasModel('shop_conv');
    const REC = shops && !L.apt ? 3.1 : 0;   // 有店铺内景时，一楼主体往里缩，让出店铺纵深
    const off0 = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing];
    const g0 = new THREE.BoxGeometry(L.w - 0.3 - Math.abs(off0[0]) * REC, GROUND, L.d - 0.3 - Math.abs(off0[1]) * REC);
    g0.translate(L.x - off0[0] * REC / 2, GROUND / 2 + CURB, L.z - off0[1] * REC / 2);
    this.addStatic(baseMat, worldUV(g0, 0.4));
    if (L.apt) { /* 公寓楼一楼是架空层，不开店 */ } else if (shops) this.shopModules(L, r, GROUND, baseMat); else this.storefront(L, r, GROUND);
    // 楼身：真实材质墙面（抹灰 / 砖 / 面砖 / 混凝土）+ 立体窗户构件；按楼型变化体量
    const arch = L.apt ? 'apt' : billboard ? 'office' : (L.zone === 'ave' && floors >= 9) ? 'office' : (floors <= 5 && r() < 0.45) ? 'villa' : 'shop';
    const tower = arch === 'office' && !billboard && floors >= 9 && r() < 0.55;
    const podiumFloors = tower ? 2 + (r() * 2 | 0) : floors;
    const wall = this.wallMat(arch, r);
    const body = (cx, cz, w, d, y0, y1, m, winKind) => {
      const hh = y1 - y0, g = new THREE.BoxGeometry(w, hh, d);
      g.translate(cx, CURB + y0 + hh / 2, cz); worldUV(g, 0.33);
      this.addStatic(m, faces(g, [0, 1, 4, 5]));
      this.addStatic(roofMat, faces(g, [2, 3]));
      if (winKind) this.windowsFor({ ...L, x: cx, z: cz, w, d }, r, y0, y1, winKind, arch);
    };
    const winKind = { apt: 'balcony', office: 'office', villa: 'grille', shop: 'slider' }[arch];
    // 退台：商住楼顶上 1–2 层往里缩，留出屋顶平台（韩国常见的"옥탑"）
    const setback = arch === 'shop' && floors >= 4 && r() < 0.5 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
    const off = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing], inset = 1.8;
    const lowTop = GROUND + (podiumFloors - setback) * FLOOR;
    body(L.x, L.z, L.w, L.d, GROUND, lowTop, wall, winKind);
    let topW = L.w, topD = L.d, topX = L.x, topZ = L.z;
    if (setback) {
      topW = L.w - Math.abs(off[0]) * inset; topD = L.d - Math.abs(off[1]) * inset; topX = L.x - off[0] * inset / 2; topZ = L.z - off[1] * inset / 2;
      body(topX, topZ, topW, topD, lowTop, h, wall, winKind);
      this.parapet(L.x, L.z, L.w, L.d, lowTop);
    }
    if (tower) {
      topW = Math.max(6, L.w - 2.4); topD = Math.max(6, L.d - 2.4);
      body(L.x, L.z, topW, topD, GROUND + podiumFloors * FLOOR, h, this.wallMat('office', r), 'office');
      this.parapet(L.x, L.z, L.w, L.d, GROUND + podiumFloors * FLOOR);
    }
    // 多户住宅：彩色金属坡屋顶
    if (arch === 'villa' && r() < 0.6) this.gableRoof(L, h, r);
    // 商住楼正面的竖向装饰条
    if (arch === 'shop' && r() < 0.3) this.finStrips(L, r, GROUND, lowTop);
    this.addCollider(L.x, L.z, L.w, L.d);
    this.parapet(topX, topZ, topW, topD, h);
    this.rooftop(L, r, h, topW, topD, floors);
    this.facadeDetails(L, r, style, GROUND, FLOOR, tower ? podiumFloors : floors, tower ? floors - podiumFloors : 0, topW, topD);
    if (L.apt) { this.aptMarks(L, r, h); return; }
    // 一楼招牌（霓虹）+ 楼上每层的横招牌（首尔商住楼的样子）
    this.shopSign(L, r);
    if (!tower && floors <= 9) this.floorSigns(L, r, GROUND, FLOOR, Math.min(floors, 6));
    if (billboard) { this.billboardScreen(L, h); this.arenaFront(L, h); }
  }

  // 墙面材质：按楼型挑真实贴图 + 色调（所有楼共用十几个材质，按材质合并绘制）
  wallMat(arch, r) {
    const W = this.wallMats ||= {};
    const pick = { shop: [['polyhaven_plastered_wall_04/plastered_wall_04', 0xfaf6ee], ['polyhaven_plastered_wall_04/plastered_wall_04', 0xeee8dc], ['polyhaven_concrete_tile_facade/concrete_tile_facade', 0xe6e1d8], ['polyhaven_rectangular_facade_tiles/rectangular_facade_tiles', 0xece7df], ['polyhaven_painted_brick/painted_brick', 0xe2dacd], ['polyhaven_brushed_concrete/brushed_concrete', 0xd6d3cd]],
      villa: [['polyhaven_brick_wall_10/brick_wall_10', 0xe6bca4], ['polyhaven_brick_wall_10/brick_wall_10', 0xd8a68e], ['polyhaven_painted_brick/painted_brick', 0xc98b72]],
      office: [['polyhaven_brushed_concrete/brushed_concrete', 0xa9aeb5], ['polyhaven_concrete_tile_facade/concrete_tile_facade', 0xb8bec6], ['polyhaven_rectangular_facade_tiles/rectangular_facade_tiles', 0x9aa1aa]],
      apt: [['polyhaven_plastered_wall_04/plastered_wall_04', 0xfffcf4], ['polyhaven_plastered_wall_04/plastered_wall_04', 0xfaf4e6]] }[arch];
    const [base, col] = pick[(r() * pick.length) | 0], k = base + col;
    if (!W[k]) {
      const m = W[k] = pbrMat(base, 1, { color: col, normalScale: 0.8 });
      // 城市里的墙面有大量反射光（路面、对面楼、招牌），用一点固定的自发光模拟，不然黄昏时整面墙是黑的
      m.color.multiplyScalar(1.9);   // Poly Haven 的抹灰 / 面砖贴图本身偏暗，经过 ACES 色调映射后更暗
      m.emissive = new THREE.Color(col).multiplyScalar(0.28); m.emissiveMap = m.map; m.emissiveIntensity = 1;
      m.userData.envMul = 1.5;
    }
    return W[k];
  }

  // 窗户构件：铝合金推拉窗 / 带防盗网的小窗 / 写字楼幕墙单元 / 公寓封闭阳台。实例化，按区块合并
  windowsFor(L, r, y0, y1, kind, arch) {
    const FLOOR = 3.2, F = this.facadeFrame(L, L.w, L.d), back = this.facadeFrame({ ...L, facing: { S: 'N', N: 'S', W: 'E', E: 'W' }[L.facing] }, L.w, L.d);
    const bay = { slider: 3.2, grille: 2.6, office: 1.7, balcony: 3.6 }[kind];
    const lit = this.rnd;   // 夜里哪些窗亮
    const list = (this.winInst ||= {})[kind] ||= [];
    for (const [Fr, sideK] of [[F, 1], [back, arch === 'apt' || arch === 'office' ? 1 : 0.6]]) {
      const n = Math.max(1, Math.floor((Fr.along - 1.2) / bay)), x0 = -(n - 1) * bay / 2;
      for (let f = 0; y0 + f * FLOOR + 2.6 <= y1 + 0.01; f++) {
        if (sideK < 1 && r() > sideK) continue;
        for (let i = 0; i < n; i++) {
          if (kind !== 'office' && r() < 0.08) continue;   // 偶尔留一格实墙，不那么规整
          const m = new THREE.Matrix4().compose(Fr.at(x0 + i * bay, CURB + y0 + f * FLOOR + 1.55, 0.02), Fr.q, new THREE.Vector3(1, 1, 1));
          const on = lit() < (arch === 'office' ? 0.45 : 0.32), warm = lit() < 0.75;
          list.push([m, on ? (warm ? [0.95, 0.72, 0.45] : [0.62, 0.72, 0.85]) : [0.05, 0.055, 0.065]]);
        }
      }
    }
  }

  // 彩色金属坡屋顶（빌라 楼顶常见的蓝 / 绿 / 红色铁皮屋顶）
  gableRoof(L, h, r) {
    const cols = [0x3d6e8f, 0x3f7a52, 0x8a3b32, 0x555b63], c = cols[(r() * cols.length) | 0];
    const m = (this.roofCols ||= {})[c] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35 });
    const alongX = L.w >= L.d, len = (alongX ? L.w : L.d) - 0.6, span = (alongX ? L.d : L.w) - 0.6, rise = Math.min(2.4, span * 0.28);
    const shape = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2); if (alongX) g.rotateY(Math.PI / 2);
    g.translate(L.x, CURB + h + 0.9, L.z);
    this.addStatic(m, g);
  }

  // 正面竖向装饰条（金属板）
  finStrips(L, r, y0, y1) {
    const F = this.facadeFrame(L, L.w, L.d), m = this.finMat ||= new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.45, metalness: 0.5 });
    const n = 2 + (r() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(0.28, y1 - y0, 0.35); g.applyQuaternion(F.q);
      const c = F.at((i - (n - 1) / 2) * (F.along / n), CURB + (y0 + y1) / 2, 0.16); g.translate(c.x, c.y, c.z);
      this.addStatic(m, g);
    }
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
      this.addStatic(darkMat, worldUV(g, 0.4));
    };
    const edge = (span - used) / 2;
    if (edge > 0.01) { box(-span / 2 + edge / 2, edge, 0, GROUND); box(span / 2 - edge / 2, edge, 0, GROUND); }
    box(0, used, MH, GROUND - MH);
    for (let i = 0; i <= n; i++) box(start + i * (MW + P) + P / 2, P, 0, MH);
    for (let i = 0; i < n; i++) {
      const kind = SHOP_KINDS[(r() * SHOP_KINDS.length) | 0];
      const u = start + P + i * (MW + P) + MW / 2;
      (this.inst[kind] ||= []).push(new THREE.Matrix4().compose(F.at(u, CURB, -D / 2 - 0.12), F.q, one));
      // 远处用一张发光的店面卡片代替整套内景（30 米外看不出区别，绘制次数少很多）
      ((this.shopFar ||= [[], [], [], []])[(r() * 4) | 0]).push(new THREE.Matrix4().compose(F.at(u, CURB + 0.15, -0.2), F.q, one));
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
    // 外观相同的材质（很多地方各自 new 了一份同色材质）合并成一个，每种只画一次
    const sig = m => [m.type, m.color?.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.map?.uuid, m.emissiveMap?.uuid, m.normalMap?.uuid,
      m.transparent, m.opacity, m.side, m.vertexColors, m.toneMapped, m.depthWrite, !!m.userData.night, m.userData.envMul].join('|');
    const geoSig = g => (g.index ? 'i' : 'n') + Object.keys(g.attributes).sort().join(',');
    const merged = new Map();
    for (const [mat, e] of this.buckets || []) for (const geo of e.geos) {
      const k = sig(mat) + '#' + geoSig(geo);
      if (!merged.has(k)) merged.set(k, { mat, geos: [], cast: false });
      const m = merged.get(k); m.geos.push(geo); m.cast ||= e.cast;
    }
    for (const e of merged.values()) {
      const geo = mergeGeometries(e.geos); if (!geo) continue;
      const m = new THREE.Mesh(geo, e.mat); m.castShadow = e.cast; m.receiveShadow = true; this.group.add(m);
    }
    this.staticBuckets = merged.size;
    this.buckets = null;
    // Blender 细节模块（实例化）
    const NOSHADOW = new Set(['bd_ac', 'bd_vsign', 'bd_dish', 'bd_antenna', 'bd_condenser', 'bd_stair', 'bd_tank', ...SHOP_KINDS]);   // 楼顶小件从街上看不到影子   // 小件不投影，省一遍阴影绘制
    for (const [name, mats] of Object.entries(this.inst)) for (const im of instanced(name, mats, this.group, o => o.name.startsWith('sign_v'), name.startsWith('shop_') ? { near: 28 } : { cell: 120, maxDist: 150, shadowDist: 60 })) {
      if (NOSHADOW.has(name)) { im.castShadow = false; im.userData.shadowDist = 0; } if (name.startsWith('shop_')) registerNight(im, this);
      if (name.startsWith('pl_') && im.material.name.startsWith('leaf')) for (let i = 0; i < im.count; i++) { const v = 0.8 + this.rnd() * 0.3; im.setColorAt(i, new THREE.Color(0.32 * v, 0.55 * v, 0.24 * v)); }   // 绿篱 / 花丛叶子染绿
    }
    // 窗户构件：每种窗型一个几何体（窗框 + 玻璃两组），按 120 米区块实例化；夜里每扇窗亮不亮由实例颜色决定
    if (this.winInst) {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.5, metalness: 0.1 });
      frameMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', ''); };   // 窗框不吃实例颜色
      frameMat.customProgramCacheKey = () => 'winframe';
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.16, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.05 });
      glassMat.userData.envMul = 1.1; this.winGlass = glassMat;   // 亮度在 updateNight 里单独控制：白天几乎不亮，夜里适中
      glassMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n totalEmissiveRadiance *= vColor;\n#endif'); };
      glassMat.customProgramCacheKey = () => 'winglass';
      const darkFrame = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.45, metalness: 0.3 });
      darkFrame.onBeforeCompile = frameMat.onBeforeCompile; darkFrame.customProgramCacheKey = () => 'winframe2';
      for (const [kind, list] of Object.entries(this.winInst)) {
        const geo = windowGeo(kind), mats = [kind === 'office' ? darkFrame : frameMat, glassMat];
        const cells = new Map(), p = new THREE.Vector3();
        for (const it of list) { p.setFromMatrixPosition(it[0]); const k = Math.floor(p.x / 120) + ',' + Math.floor(p.z / 120); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(it); }
        for (const l of cells.values()) {
          const im = new THREE.InstancedMesh(geo, mats, l.length), c = new THREE.Color();
          l.forEach(([m, col], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setRGB(col[0], col[1], col[2])); });
          im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true;
          registerCull(im, { maxDist: 380 }); this.group.add(im);
        }
      }
      this.winInst = null;
    }
    // 店面远景卡片：4 种贴图 × 区块，近处隐藏（由内景接手），远处显示
    if (this.shopFar) {
      const geo = new THREE.PlaneGeometry(5.9, 3.35); geo.translate(0, 1.68, 0);
      this.shopFar.forEach((list, vi) => {
        if (!list.length) return;
        const t = storefront(vi * 3 + 1);
        const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0 });
        mat.userData.night = true; this.nightMats.push(mat);
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        im.castShadow = false; im.receiveShadow = false; registerRange(im, list, 28, 170); this.group.add(im);
      });
      this.shopFar = null;
    }
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
    const C = this.curve, clear = g => { if (!C) return true; g.computeBoundingSphere(); const c = g.boundingSphere.center; return C.dist(c.x, c.z) > C.hw + 0.5 + g.boundingSphere.radius; };
    for (let [arr, m] of [[geos, white], [yel, yellow], [cross, white]]) {
      arr = arr.filter(clear);
      if (!arr.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(arr), m); mesh.receiveShadow = true; this.group.add(mesh);
    }
  }

  tree(x, z, park = false) {
    if (this.curve && !this.curveTreeOK && this.curve.dist(x, z) < this.curve.hw + 3.4) return;   // 别种在弯路上
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
    this.treeList.push([x, z, park]);
  }

  finalizeTrees() {
    const maple = hasModel('tr_maple0');
    if (maple || hasModel('tr_ginkgo')) {   // 行道树：写实叶片卡片树（三种树形），叶色逐棵变化（首尔秋天：红、橙、银杏黄、还没变色的绿）
      const kinds = maple ? ['tr_maple0', 'tr_maple2', 'tr_maple3', 'tr_maple4'] : ['tr_ginkgo', 'tr_zelkova', 'tr_round'], lists = kinds.map(() => []);
      const AUTUMN = [[1.0, 0.36, 0.2], [1.0, 0.58, 0.24], [1.0, 0.84, 0.3], [1.0, 0.8, 0.28], [0.5, 0.68, 0.3], [0.62, 0.7, 0.3]];
      const r = mulberry(31), up = new THREE.Vector3(0, 1, 0);
      const GREEN = [[0.45, 0.66, 0.3], [0.38, 0.6, 0.28], [0.52, 0.7, 0.32], [0.6, 0.72, 0.3], [1.0, 0.62, 0.25], [1.0, 0.84, 0.3]];   // 公园：绿色为主，夹几棵红黄
      const parkLists = kinds.map(() => []);
      const n = kinds.length;
      this.treeList.forEach(([x, z, park]) => {
        const k = (r() * n) | 0, s = 0.85 + r() * 0.3;
        (park ? parkLists : lists)[k].push(new THREE.Matrix4().compose(new THREE.Vector3(x, CURB, z), new THREE.Quaternion().setFromAxisAngle(up, r() * 6.28), new THREE.Vector3(s, s, s)));
        this.colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, small: true });
      });
      for (const [L, PAL] of [[lists, AUTUMN], [parkLists, GREEN]]) kinds.forEach((name, k) => {
        if (!L[k].length) return;
        for (const im of instanced(name, L[k], this.group, null, { cell: 120, maxDist: 240, shadowDist: 80 })) {
          if (!im.material.name.startsWith('leaf')) continue;
          for (let i = 0; i < im.count; i++) {
            if (maple) { const c = PAL[r() * PAL.length | 0], v = 0.85 + r() * 0.3; im.setColorAt(i, new THREE.Color(c[0] * v, c[1] * v, c[2] * v)); }
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
      const free = x => !ROADS.some(r => Math.abs(x - r) < 10) && Math.abs(x) < HALF - 4 && !(this.curve && this.curve.dist(x, v) < this.curve.hw + 14);   // 两侧的灯各自检查，别立在十字路口里
      for (let x = -HALF + 15; x < HALF; x += 24) { if (free(x)) pts.push([x, v - off, Math.PI / 2]); if (free(x + 12)) pts.push([x + 12, v + off, -Math.PI / 2]); }
    }
    for (const pl of this.curveLamps || []) pts.push(pl);
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

  // 楼上每层的横招牌：学院、诊所、KTV、网吧、台球……（韩国商住楼最典型的样子）
  floorSigns(L, r, GROUND, FLOOR, n) {
    const F = this.facadeFrame(L, L.w, L.d), W = ['학원', '영어학원', '수학학원', '치과', '내과', '한의원', '노래방', 'PC방', '당구장', '헬스', '필라테스', '미용실', '부동산', '호프', '고깃집', '스터디카페', '네일', '안경', '세무사', '태권도'];
    for (let k = 0; k < n; k++) {
      if (r() < 0.25) continue;
      const cnt = F.along > 14 && r() < 0.55 ? 2 : 1;
      for (let j = 0; j < cnt; j++) {
        const sw = Math.min(F.along / cnt - 1.6, 5.5 + r()), u = cnt === 1 ? (r() - 0.5) * Math.max(0, F.along - sw - 1.5) : (j - 0.5) * F.along / 2;
        const cell = this.signs2.cell(W[(r() * W.length) | 0], (r() * 12 | 0) * 30);
        const g = new THREE.BoxGeometry(sw, 0.8, 0.14);
        remapUV(g, [4, 5], cell);
        g.applyQuaternion(F.q); const c = F.at(u, CURB + GROUND + k * FLOOR + 0.55, 0.12); g.translate(c.x, c.y, c.z);
        this.addStatic(this.signMat, faces(g, [4, 5]), false);
        this.addStatic(this.curbMat, faces(g, [0, 1, 2, 3]), false);
      }
    }
  }

  // 公寓楼：山墙上刷大号楼号"10X동"，楼顶正面是品牌名
  aptMarks(L, r, h) {
    if (!this.aptAtlas) {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
      g.fillStyle = '#dcd8d0'; g.fillRect(0, 0, 1024, 1024);
      const brands = ['래미안', '자이', '푸르지오', '힐스테이트', 'e편한세상', '아이파크', '롯데캐슬', '더샵'];
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) { g.fillStyle = ['#1d3f7a', '#5a2b1f', '#2c5a3a', '#3a3a3a'][i % 4]; g.font = '900 150px "Noto Sans KR",sans-serif'; g.fillText(`${101 + i}동`, 128 + (i % 4) * 256, 128 + (i >> 2) * 256); }
      for (let i = 0; i < 8; i++) { g.fillStyle = ['#0f5e9c', '#8c1d2a', '#2f6b38', '#5b3a8c'][i % 4]; g.font = '900 64px "Noto Sans KR",sans-serif'; g.fillText(brands[i], 256 + (i % 2) * 512, 576 + (i >> 1) * 112); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      this.aptAtlas = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    }
    const n = (r() * 8) | 0, b = (r() * 8) | 0;
    const numCell = { u0: (n % 4) / 4, u1: (n % 4 + 1) / 4, v0: 1 - ((n >> 2) + 1) / 4, v1: 1 - (n >> 2) / 4 };
    const brCell = { u0: (b % 2) / 2, u1: (b % 2 + 1) / 2, v0: 1 - (0.5 + ((b >> 1) + 1) * 0.109375), v1: 1 - (0.5 + (b >> 1) * 0.109375) };
    for (const sx of [-1, 1]) {   // 两侧山墙
      const g = new THREE.PlaneGeometry(6, 6); remapUV(g, [0], numCell);
      g.rotateY(sx * Math.PI / 2); g.translate(L.x + sx * (L.w / 2 + 0.05), CURB + h - 6, L.z);
      this.addStatic(this.aptAtlas, g, false);
    }
    const off = { S: [0, -1], N: [0, 1] }[L.facing] || [0, -1];
    const bg = new THREE.PlaneGeometry(10, 2.2); remapUV(bg, [0], brCell);
    bg.rotateY(off[1] < 0 ? Math.PI : 0); bg.translate(L.x, CURB + h - 1.6, L.z + off[1] * (L.d / 2 + 0.05));
    this.addStatic(this.aptAtlas, bg, false);
  }

  // 把一个静态物体的所有网格按世界坐标烘焙进合并网格（同材质的合成一次绘制）
  bakeStatic(obj, cast = true) {
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      this.addStatic(o.material, g, cast);
    });
  }

  // 公园布置：缓坡草丘、弯曲步道、绿篱和花坛、混种的树（以绿为主）、凉亭、喷泉、长椅
  parkDressing(cx, cz, w, d, main, small = false) {
    const r = this.rnd, up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const inst = (name, x, z, ry = 0, sc = 1) => (this.inst[name] ||= []).push(new THREE.Matrix4().compose(new THREE.Vector3(x, CURB, z), new THREE.Quaternion().setFromAxisAngle(up, ry), new THREE.Vector3(sc, sc, sc)));
    const pathMat = this.parkPath ||= pbrMat('polyhaven_square_brick_paving/square_brick_paving', 1, { color: 0xd8cfc2 });
    // 环形步道 + 两条弯曲小路（沿曲线铺带状网格）
    const ribbon = (pts, width) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))), N = 48, pos = [], idx = [], uv = [], nrm = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, p = curve.getPoint(t), tg = curve.getTangent(t), nx = -tg.z, nz = tg.x;
        for (const sgn of [-1, 1]) { pos.push(p.x + nx * width / 2 * sgn, CURB + 0.035, p.z + nz * width / 2 * sgn); uv.push((p.x + nx * sgn) * 0.4, (p.z + nz * sgn) * 0.4); nrm.push(0, 1, 0); }
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      this.addStatic(pathMat, g, false);
    };
    const R = Math.min(w, d) * 0.36;
    if (!small) {
      const ring = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; ring.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R * 0.85]); }
      ribbon(ring, 2.6);
      ribbon([[cx - w / 2 + 1, cz - d / 2 + 4], [cx - R * 0.6, cz - R * 0.2], [cx - R * 0.95, cz + R * 0.1]], 2);
      ribbon([[cx + w / 2 - 1, cz + d / 2 - 5], [cx + R * 0.5, cz + R * 0.55], [cx + R * 0.9, cz + R * 0.3]], 2);
    } else ribbon([[cx - w / 2 + 1, cz + 2], [cx - w / 6, cz - 2.5], [cx + w / 6, cz + 2.5], [cx + w / 2 - 1, cz - 1]], 2.2);
    // 缓坡草丘
    for (let i = 0; i < (small ? 1 : 3); i++) {
      const a = r() * Math.PI * 2, rr = R * (0.45 + r() * 0.3), m = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const sx = 4 + r() * 4; m.scale(sx, 0.9 + r() * 0.8, sx * (0.6 + r() * 0.4)); m.rotateY(r() * 3); m.translate(cx + Math.cos(a) * rr, CURB - 0.1, cz + Math.sin(a) * rr * 0.85);
      worldUV(m, 0.25); this.addStatic(this.grassMat, m, false);
    }
    // 树：沿环路外侧和草丘，绿色为主
    const nT = small ? 6 : 22;
    for (let i = 0; i < nT; i++) {
      const a = i / nT * Math.PI * 2 + r() * 0.2, rr = small ? 0 : R + 3 + r() * (Math.min(w, d) / 2 - R - 5);
      const x = small ? cx - w / 2 + 3 + i * (w - 6) / (nT - 1) : cx + Math.cos(a) * rr, z = small ? cz + (i % 2 ? 5.5 : -5.5) : cz + Math.sin(a) * rr * 0.85;
      this.tree(x, z, true);
    }
    // 绿篱和花坛
    for (let i = 0; i < (small ? 6 : 14); i++) {
      const a = r() * Math.PI * 2, x = small ? cx - w / 2 + 4 + r() * (w - 8) : cx + Math.cos(a) * (R + 1.8), z = small ? cz + (r() < 0.5 ? 3.5 : -3.5) : cz + Math.sin(a) * (R + 1.8) * 0.85;
      inst(r() < 0.5 ? 'pl_hedge' : 'pl_flowers', x, z, small ? 0 : -a + Math.PI / 2, 0.9 + r() * 0.4);
    }
    // 长椅沿路
    for (let i = 0; i < (small ? 4 : 8); i++) { const a = (i + 0.5) / 8 * Math.PI * 2; small ? inst('st_bench', cx - w / 3 + i * (w / 5), cz - 1.8, 0) : inst('st_bench', cx + Math.cos(a) * (R - 2), cz + Math.sin(a) * (R - 2) * 0.85, -a - Math.PI / 2); }
    if (small) return;
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
    const addG = (mat, geo, x, y, z) => { geo.translate(x, y, z); this.addStatic(mat, geo); };
    // 韩式凉亭（정자）：红柱、绿色檐、上翘的四坡顶
    const px = cx + R * 0.55, pz = cz - R * 0.5;
    const red = this.redMat ||= M(0x8e2a22, { roughness: 0.6 }), grn = this.dancheong ||= M(0x2f6b55, { roughness: 0.6 }), tile = this.roofTile ||= M(0x3a3d42, { roughness: 0.8 });
    addG(this.swMat, new THREE.BoxGeometry(5.6, 0.5, 5.6), px, CURB + 0.25, pz);
    for (const [a, b] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) addG(red, new THREE.CylinderGeometry(0.14, 0.16, 2.8, 10), px + a, CURB + 1.9, pz + b);
    addG(grn, new THREE.BoxGeometry(5.2, 0.3, 5.2), px, CURB + 3.4, pz);
    const roof = new THREE.ConeGeometry(4.9, 1.8, 4, 1, false, Math.PI / 4); roof.scale(1, 1, 1); addG(tile, roof, px, CURB + 4.45, pz);
    addG(tile, new THREE.BoxGeometry(6.6, 0.12, 6.6), px, CURB + 3.6, pz);
    this.addCollider(px, pz, 5.6, 5.6);
    // 喷泉水池
    const fx = cx - R * 0.5, fz = cz + R * 0.45, stone = this.stoneMat ||= M(0xb5b1aa, { roughness: 0.85 });
    addG(stone, new THREE.CylinderGeometry(3.4, 3.6, 0.6, 32, 1, true), fx, CURB + 0.3, fz);
    addG(stone, new THREE.TorusGeometry(3.5, 0.18, 6, 32).rotateX(Math.PI / 2), fx, CURB + 0.6, fz);
    const water = this.fountainWater ||= new THREE.MeshStandardMaterial({ color: 0x1c3a4a, roughness: 0.05, metalness: 0.4 });
    addG(water, new THREE.CircleGeometry(3.4, 32).rotateX(-Math.PI / 2), fx, CURB + 0.45, fz);
    addG(stone, new THREE.CylinderGeometry(0.35, 0.6, 1.6, 12), fx, CURB + 1.1, fz);
    this.addCollider(fx, fz, 6.8, 6.8);
    // 江边自行车道（红色）+ 健身器材（汉江公园特色）
    const bike = this.bikeMat ||= M(0x8a3a32, { roughness: 0.9 });
    addG(bike, new THREE.BoxGeometry(w, 0.03, 2.6), cx, CURB + 0.03, cz + d / 2 - 2.2);
    addG(M(0xf2f2f2, { emissive: 0x222222 }), new THREE.BoxGeometry(w, 0.035, 0.12), cx, CURB + 0.045, cz + d / 2 - 2.2);
    const steel = this.fitMat ||= M(0x2f7fc1, { roughness: 0.4, metalness: 0.5 });
    for (let i = 0; i < 4; i++) {
      const x = cx - w / 2 + 6 + i * 3.2, z = cz + d / 2 - 6;
      addG(steel, new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), x - 0.7, CURB + 1.1, z); addG(steel, new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), x + 0.7, CURB + 1.1, z);
      addG(steel, new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8).rotateZ(Math.PI / 2), x, CURB + 2.1 - i * 0.3, z);
    }
  }

  // ---------- 斜穿全城的弯曲大道 ----------
  // 从东北到西南穿过一串普通街区（不碰总部、功能地点和公园），控制点左右起伏成 S 形
  // 弯路穿过的街区：人行道顶面用 0.5 米小格拼（跳过路面），四周侧面 1 米一段（路口处断开）
  curveCutSlab(s) {
    const C = this.curve; if (!C) return false;
    const lim = C.hw + 0.3, cut = (x, z) => C.dist(x, z) < lim;
    let hit = false;
    for (let x = s.xMin; x <= s.xMax && !hit; x += 2) for (let z = s.zMin; z <= s.zMax; z += 2) if (cut(x, z)) { hit = true; break; }
    if (!hit) return false;
    const pos = [], uv = [], nrm = [], q = 0.5;
    const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) { pos.push(...v); uv.push((v[0] + v[1]) * 0.4 * (n[1] ? 0 : 1) + (n[1] ? v[0] * 0.4 : 0), n[1] ? v[2] * 0.4 : v[1] * 0.4); nrm.push(...n); } };
    for (let z = s.zMin; z < s.zMax - 1e-6; z += q) {
      const z1 = Math.min(z + q, s.zMax); let run = null;
      for (let x = s.xMin; x < s.xMax + q / 2; x += q) {
        const x1 = Math.min(x + q, s.xMax), keep = x < s.xMax - 1e-6 && !cut((x + x1) / 2, (z + z1) / 2);
        if (keep) { if (run === null) run = x; }
        else if (run !== null) { quad([run, CURB, z1], [x, CURB, z1], [x, CURB, z], [run, CURB, z], [0, 1, 0]); run = null; }
      }
    }
    // 侧面（只朝外的四面）
    for (let x = s.xMin; x < s.xMax - 1e-6; x += 1) { const x1 = Math.min(x + 1, s.xMax);
      if (!cut((x + x1) / 2, s.zMin)) quad([x, 0, s.zMin], [x, CURB, s.zMin], [x1, CURB, s.zMin], [x1, 0, s.zMin], [0, 0, -1]);
      if (!cut((x + x1) / 2, s.zMax)) quad([x1, 0, s.zMax], [x1, CURB, s.zMax], [x, CURB, s.zMax], [x, 0, s.zMax], [0, 0, 1]); }
    for (let z = s.zMin; z < s.zMax - 1e-6; z += 1) { const z1 = Math.min(z + 1, s.zMax);
      if (!cut(s.xMin, (z + z1) / 2)) quad([s.xMin, 0, z1], [s.xMin, CURB, z1], [s.xMin, CURB, z], [s.xMin, 0, z], [-1, 0, 0]);
      if (!cut(s.xMax, (z + z1) / 2)) quad([s.xMax, 0, z], [s.xMax, CURB, z], [s.xMax, CURB, z1], [s.xMax, 0, z1], [1, 0, 0]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.addStatic(this.swMat, g, false);
    return true;
  }

  curveSetup() {
    const isRoad = (x, z) => ROADS.some(R => Math.abs(x - R) < 7) || ROADS.some(R => Math.abs(z - R) < roadWidth('z', R) / 2);
    const base = [[228, -168], [180, -120], [120, -60], [60, 0], [0, 60], [-60, 120], [-120, 180], [-168, 228]];
    const wob = [0, 9, -7, 11, -9, 8, -5, 0];   // 沿 (1,1)/√2 方向的偏移
    const pts = base.map(([x, z], i) => [x + wob[i] * 0.7071, z + wob[i] * 0.7071]);
    this.curve = new CurveRoad(pts, 6, isRoad, 0);
    this.curveRoad = isRoad;
    // 路灯：沿两侧人行道每 26 米一盏（交给 streetLamps 一起实例化）
    const S = this.curve.samples; this.curveLamps = [];
    for (let i = 8; i < S.length; i += 17) for (const side of [-1, 1]) {
      const p = S[i], x = p.x + p.nx * side * (this.curve.hw + 2.2), z = p.z + p.nz * side * (this.curve.hw + 2.2);
      if (isRoad(x, z) || Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
      this.curveLamps.push([x, z, Math.atan2(-p.nx * side, -p.nz * side) - Math.PI / 2]);
    }
  }

  // 地块和弯路走廊有没有重叠（矩形内 5×5 个点都离路足够远才算不重叠）
  curveHit(L) {
    if (!this.curve) return false;
    const lim = this.curve.hw + 3.6;
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) {
      const x = L.x - L.w / 2 + L.w * a / 4, z = L.z - L.d / 2 + L.d * b / 4;
      if (this.curve.dist(x, z) < lim) return true;
    }
    return false;
  }

  curveBuild() {
    const C = this.curve, S = C.samples, hw = C.hw;
    // 路面就是整张地面沥青（弯路和方格路同高），这里只画标线和路沿
    const yellow = this.curveYellow ||= new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const white = this.curveWhite ||= new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const edgeRoad = i => { const p = S[i]; return p.road || this.curveRoad(p.x + p.nx * hw, p.z + p.nz * hw) || this.curveRoad(p.x - p.nx * hw, p.z - p.nz * hw); };
    const near = S.map((_, i) => [-1, 0, 1].some(k => S[i + k] && edgeRoad(i + k)));   // 进路口前 1.5 米停
    const free = i => !near[i];
    for (const o of [-0.25, 0.1]) this.addStatic(yellow, stripGeo(C, o, o + 0.15, () => 0.02, free), false);
    for (const o of [-hw / 2, hw / 2]) this.addStatic(white, stripGeo(C, o - 0.075, o + 0.075, () => 0.02, i => free(i) && (Math.floor(S[i].s / 3) % 2) === 0), false);
    // 出入路口处：顺着弯路方向的斑马线
    const zeb = new Set();
    for (let i = 1; i < S.length; i++) {
      if (near[i] === near[i - 1]) continue;
      const j0 = near[i] ? i - 3 : i + 1;   // 在街区一侧
      for (let k = j0; k < j0 + 2; k++) if (S[k] && S[k + 1] && free(k) && free(k + 1)) zeb.add(k);
    }
    for (let o = -hw + 0.5; o < hw - 0.4; o += 1.2) this.addStatic(white, stripGeo(C, o, o + 0.6, () => 0.022, i => zeb.has(i) || zeb.has(i - 1)), false);
    // 两侧路沿：竖直面（0 → 人行道高）+ 0.6 米路沿石盖住小格的锯齿边
    const side = i => !S[i].road && !edgeRoad(i);
    for (const sg of [-1, 1]) {
      const a = sg * hw, b = sg * (hw + 0.6);
      this.addStatic(this.curbMat, stripGeo(C, Math.min(a, b), Math.max(a, b), () => CURB + 0.012, side, 0.4), false);
      this.addStatic(this.curbMat, curbWall(C, a, sg, CURB + 0.012, side), false);
    }
    // 行道树
    this.curveTreeOK = true;
    for (let i = 12; i < S.length; i += 9) for (const sg of [-1, 1]) {
      const p = S[i], x = p.x + p.nx * sg * (hw + 1.6), z = p.z + p.nz * sg * (hw + 1.6);
      if (!p.road && !this.curveRoad(x, z) && Math.abs(x) < HALF - 3 && Math.abs(z) < HALF - 3) this.tree(x, z);
    }
    this.curveTreeOK = false;
    // 沿弯路的斜楼：楼正面朝着路
    this.curveLots();
  }

  curveLots() {
    const C = this.curve, S = C.samples, r = this.rnd, placed = [];
    const blockOf = (x, z) => SPECIAL[Math.round(x / BLOCK) * BLOCK + ',' + Math.round(z / BLOCK) * BLOCK];
    for (let i = 4; i < S.length - 4; i += 8) for (const sg of [-1, 1]) {
      const p = S[i], w = 9 + r() * 6, d = 12, off = C.hw + 3.4 + d / 2 + 0.2;
      const cx = p.x + p.nx * sg * off, cz = p.z + p.nz * sg * off, th = Math.atan2(sg * p.nx, sg * p.nz);
      // 四个角 + 中心：不能落在方格路上、特殊街区里、弯路上，也不能和已经放的楼挤在一起
      const ca = Math.cos(th), sa = Math.sin(th), pts = [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2]].map(([u, v]) => [cx + u * ca + v * sa, cz - u * sa + v * ca]);
      if (pts.some(([x, z]) => this.curveRoad(x, z) || blockOf(x, z) || Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8 || C.dist(x, z) < C.hw + 3.2)) continue;
      if (placed.some(q => Math.hypot(q[0] - cx, q[1] - cz) < (q[2] + w) / 2 + 0.8)) continue;
      placed.push([cx, cz, w]);
      const M = new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), th), new THREE.Vector3(1, 1, 1));
      this.withTransform(M, () => this.building({ x: 0, z: 0, w, d, facing: 'S', zone: 'curve' }, r));
    }
  }

  // 在原点按朝南造一栋楼，再把这次新加的所有几何、实例、碰撞体整体变换到 M（旋转 + 平移）
  withTransform(M, fn) {
    const snap = { buckets: new Map([...(this.buckets || new Map())].map(([k, e]) => [k, e.geos.length])), inst: Object.fromEntries(Object.entries(this.inst).map(([k, l]) => [k, l.length])),
      ledges: this.ledges.length, vsigns: this.vsigns.length, win: Object.fromEntries(Object.entries(this.winInst || {}).map(([k, l]) => [k, l.length])),
      far: (this.shopFar || [[], [], [], []]).map(l => l.length), par: (this.parapetGeos || []).length, roof: (this.roofGeos || []).length, col: this.colliders.length, kids: this.group.children.length };
    fn();
    for (const [k, e] of this.buckets || []) for (let i = snap.buckets.get(k) || 0; i < e.geos.length; i++) e.geos[i].applyMatrix4(M);
    for (const [k, l] of Object.entries(this.inst)) for (let i = snap.inst[k] || 0; i < l.length; i++) l[i].premultiply(M);
    for (let i = snap.ledges; i < this.ledges.length; i++) this.ledges[i][0].premultiply(M);
    for (let i = snap.vsigns; i < this.vsigns.length; i++) this.vsigns[i][0].premultiply(M);
    for (const [k, l] of Object.entries(this.winInst || {})) for (let i = snap.win[k] || 0; i < l.length; i++) l[i][0].premultiply(M);
    (this.shopFar || []).forEach((l, j) => { for (let i = snap.far[j] || 0; i < l.length; i++) l[i].premultiply(M); });
    for (let i = snap.par; i < (this.parapetGeos || []).length; i++) this.parapetGeos[i].applyMatrix4(M);
    for (let i = snap.roof; i < (this.roofGeos || []).length; i++) this.roofGeos[i].applyMatrix4(M);
    // 碰撞体：旋转后的矩形用一格格小包围盒拼出来（一个大包围盒会鼓出去挡到路上）
    const fresh = this.colliders.splice(snap.col), v = new THREE.Vector3();
    for (const c of fresh) {
      const nx = Math.max(1, Math.ceil((c.maxX - c.minX) / 2.5)), nz = Math.max(1, Math.ceil((c.maxZ - c.minZ) / 2.5));
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const x0 = c.minX + (c.maxX - c.minX) * a / nx, x1 = c.minX + (c.maxX - c.minX) * (a + 1) / nx, z0 = c.minZ + (c.maxZ - c.minZ) * b / nz, z1 = c.minZ + (c.maxZ - c.minZ) * (b + 1) / nz;
        const xs = [], zs = [];
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { v.set(x, 0, z).applyMatrix4(M); xs.push(v.x); zs.push(v.z); }
        this.colliders.push({ ...c, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), sub: true });
      }
    }
    for (let i = snap.kids; i < this.group.children.length; i++) this.group.children[i].applyMatrix4(M);
  }

  // ---------- 点缀地点（没有玩法，只为让城市更像首尔） ----------
  // 街区中间空出来的一块：口袋公园 / 小区游乐场 / 路面停车场 / 工地
  filler(kind, s) {
    const cx = (s.xMin + s.xMax) / 2, cz = (s.zMin + s.zMax) / 2, w = s.xMax - s.xMin - 10, d = 16;
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
    const add = (mat, geo, x, y, z, ry = 0) => { const g = geo.clone(); if (ry) g.rotateY(ry); g.translate(x, y, z); this.addStatic(mat, g); };
    const one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const inst = (name, x, z, ry = 0) => (this.inst[name] ||= []).push(new THREE.Matrix4().compose(new THREE.Vector3(x, CURB, z), new THREE.Quaternion().setFromAxisAngle(up, ry), one));
    if (kind === 'pocket') {
      if (!this.grassMat) this.grassMat = pbrMat('polyhaven_leafy_grass/leafy_grass', 1, { color: 0x9fb48a });
      add(this.grassMat, worldUV(new THREE.BoxGeometry(w, 0.05, d), 0.25), cx, CURB + 0.025, cz);
      this.parkDressing(cx, cz, w, d, false, true);
    } else if (kind === 'playground') {
      add(M(0x2f8f5b), new THREE.BoxGeometry(w * 0.7, 0.05, d), cx, CURB + 0.025, cz);   // 塑胶地面
      const red = M(0xd23a2a, { roughness: 0.5 }), yel = M(0xf2c12e, { roughness: 0.5 }), blu = M(0x2d6fd6, { roughness: 0.5 }), steel = M(0x9aa0a6, { metalness: 0.7, roughness: 0.35 });
      // 滑梯
      add(blu, new THREE.BoxGeometry(2.2, 2, 2.2), cx - 6, CURB + 1, cz); add(red, new THREE.BoxGeometry(2.6, 0.3, 2.6), cx - 6, CURB + 2.6, cz);
      const slide = new THREE.BoxGeometry(0.9, 0.08, 4.2); slide.rotateX(-0.55); add(yel, slide, cx - 6, CURB + 1.2, cz + 2.9);
      // 秋千
      for (const x of [-1.6, 1.6]) { const leg = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6); leg.rotateZ(x > 0 ? -0.18 : 0.18); add(steel, leg, cx + 3 + x, CURB + 1.3, cz); }
      add(steel, new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6).rotateZ(Math.PI / 2), cx + 3, CURB + 2.55, cz);
      for (const x of [-0.7, 0.7]) add(red, new THREE.BoxGeometry(0.5, 0.06, 0.3), cx + 3 + x, CURB + 0.6, cz);
      for (let i = 0; i < 3; i++) inst('st_bench', cx - w * 0.3 + i * 4, cz + 6.5, Math.PI);
      for (let i = 0; i < 4; i++) this.tree(cx + w * 0.38, cz - 6 + i * 4);
    } else if (kind === 'parking') {
      const line = M(0xe8e8e8, { emissive: 0x222222 });
      add(M(0x3a3b3f, { roughness: 0.9 }), new THREE.BoxGeometry(w, 0.04, d), cx, CURB + 0.02, cz);
      for (let i = 0; i <= 8; i++) for (const zz of [-1, 1]) add(line, new THREE.BoxGeometry(0.12, 0.02, 5), cx - w / 2 + 2 + i * (w - 4) / 8, CURB + 0.05, cz + zz * 4.5);
      const types = ['car_sedan', 'car_taxi', 'car_van', 'car_pickup'];
      for (let i = 0; i < 8; i++) {
        if (this.rnd() < 0.35) continue;
        const name = types[(this.rnd() * types.length) | 0], zz = i % 2 ? 1 : -1;
        const m = model(name); if (!m) continue;
        m.position.set(cx - w / 2 + 2 + ((i >> 1) + 0.5) * (w - 4) / 4 + (zz > 0 ? 1 : -1), CURB, cz + zz * 4.5); m.rotation.y = zz > 0 ? 0 : Math.PI;
        this.bakeStatic(m, false);
        this.colliders.push({ minX: m.position.x - 1, maxX: m.position.x + 1, minZ: m.position.z - 2.3, maxZ: m.position.z + 2.3, small: true });
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: textTex('P', { w: 128, h: 128, bg: '#1546c4', fg: '#ffffff', size: 0.8 }), emissive: 0x222244 }));
      sign.position.set(cx - w / 2, 3, s.zMin + 0.5); this.group.add(sign);
    } else if (kind === 'construction') {
      // 工地围挡 + 塔吊（夜里吊臂顶上有红灯）
      const panel = new THREE.MeshStandardMaterial({ map: textTex('안전제일  공사중  SAFETY FIRST', { w: 1024, h: 128, bg: '#e9eef5', fg: '#1b4fa0', size: 0.5 }), roughness: 0.7 });
      for (const zz of [-1, 1]) add(panel, new THREE.BoxGeometry(w, 2.4, 0.15), cx, CURB + 1.2, cz + zz * (d / 2));
      for (const xx of [-1, 1]) add(panel, new THREE.BoxGeometry(0.15, 2.4, d), cx + xx * w / 2, CURB + 1.2, cz);
      this.addCollider(cx, cz, w, d);
      const yel = M(0xf2b705, { roughness: 0.5, metalness: 0.3 });
      for (let y = 0; y < 38; y += 2) { add(yel, new THREE.BoxGeometry(1.6, 0.12, 1.6), cx + 4, CURB + y, cz); for (const [a, b] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) add(yel, new THREE.BoxGeometry(0.12, 2, 0.12), cx + 4 + a, CURB + y + 1, cz + b); }
      add(yel, new THREE.BoxGeometry(34, 0.9, 0.9), cx + 4 + 9, CURB + 38.5, cz);
      add(M(0x666a70), new THREE.BoxGeometry(4, 2.5, 2.5), cx + 4 - 9, CURB + 37.5, cz);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.2), toneMapped: false }));
      lamp.position.set(cx + 4, CURB + 40.2, cz); this.group.add(lamp);
      for (let i = 0; i < 6; i++) inst('st_cone', cx - w / 2 + 2 + i * 1.5, s.zMin - 0.4 + (s.zMin < cz ? 2.4 : -2.4), 0);
    }
  }

  // 地铁出入口：沿大路人行道的玻璃顶棚 + 下沉楼梯 + 号线标识（人流多的地方）
  subwayExits() {
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fb3c2, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
    const frame = new THREE.MeshStandardMaterial({ color: 0x3c4148, metalness: 0.7, roughness: 0.35 });
    const names = ['역삼', '강남', '선릉', '삼성'];
    this.subways = [];
    [[-100, -1], [40, 1], [140, -1], [-20, 1]].forEach(([x, side], i) => {
      const z = AVENUE_Z + side * (roadWidth('z', AVENUE_Z) / 2 + 3.2), g = new THREE.Group();
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 6), glass); roof.position.y = 3.1; g.add(roof);
      for (const [a, b] of [[-1.6, -2.9], [1.6, -2.9], [-1.6, 2.9], [1.6, 2.9]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.1, 0.12), frame); p.position.set(a, 1.55, b); g.add(p); }
      for (const a of [-1.6, 1.6]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 6), glass); wall.position.set(a, 0.55, 0); g.add(wall); }
      const hole = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 5), new THREE.MeshBasicMaterial({ color: 0x050608 })); hole.position.y = 0.02; g.add(hole);
      const t = textTex(`2  ${names[i]}역  ${i + 1}번 출구`, { w: 512, h: 96, bg: '#0b5f2e', fg: '#ffffff', size: 0.55 });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 0.08), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.2 }));
      sign.position.set(0, 3.5, 2.9 * -side); g.add(sign); sign.material.userData.night = true; this.nightMats.push(sign.material);
      g.position.set(x, CURB, z); this.bakeStatic(g, true);
      this.colliders.push({ minX: x - 1.7, maxX: x + 1.7, minZ: z - 3, maxZ: z + 3, small: true });
      this.subways.push(new THREE.Vector3(x, CURB, z - side * 4));
    });
  }

  // 战队总部：T0、汉华用 Blender 地标；其余战队用程序化写字楼（队色腰线 + 大堂 + 楼顶招牌）
  buildHQ(id, s, front) {
    const h = this.hqCommon(id, s, front);
    const { cx, bzc, W, D, faceZ, team } = h;
    const ry = front === -1 ? Math.PI : 0, fz = d => faceZ + front * d;   // fz(d)：正面往外 d 米
    const lmName = { T0: 'lm_t0', HWL: 'lm_hwl' }[id], lm = lmName && model(lmName);
    if (lm) {
      lm.position.set(cx, CURB, bzc); lm.rotation.y = ry;
      // 塔身在模型里只有四个侧面、没有底；大堂比塔身缩进一圈，从门口往上看会透过塔身看到天。补一块朝下的底板
      const soffit = new THREE.Mesh(new THREE.PlaneGeometry(30, 20).rotateX(Math.PI / 2), this.soffitMat ||= new THREE.MeshStandardMaterial({ color: 0x8c8f94, roughness: 0.8 }));
      soffit.position.y = id === 'T0' ? 7.99 : 5.99; soffit.receiveShadow = true; lm.add(soffit);
      // 大堂芯筒原来是纯黑的，外面包一层一楼墙面（面砖 / 抹灰）
      const [cw, cd, cz] = id === 'T0' ? [25.9, 15.9, -1.0] : [26.7, 16.7, -0.8], L0 = soffit.position.y;
      const core = faces(worldUV(new THREE.BoxGeometry(cw, L0, cd), 0.4), [0, 1, 4, 5]); core.translate(0, L0 / 2, cz);
      const coreMesh = new THREE.Mesh(core, this.coreMat ||= pbrMat('polyhaven_concrete_tile_facade/concrete_tile_facade', 1, { color: 0xb9b4ac })); coreMesh.receiveShadow = true; lm.add(coreMesh);
      this.dressLandmark(lm, team.color, this.facadeMat(id === 'T0' ? 3 : 0, id === 'T0' ? 77 : 31, FACADE_TILE.w, FACADE_TILE.h));
      this.group.add(lm);
      this.addCollider(cx, bzc, W, D);
      this.makeHQSign(id, team, cx, id === 'T0' ? 55.5 : 34, fz(1.5), ry, id === 'T0' ? 14 : 18, id === 'T0' ? 6 : 5);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
      logo.position.set(cx - (id === 'T0' ? 10 : 11) * front, id === 'T0' ? 12.5 : 9.5, fz(id === 'T0' ? 1.15 : 1.3)); logo.rotation.y = ry; this.group.add(logo);
      this.registerHQ(id, h, ry, logo);
      return;
    }
    const H = 34 + ((id.charCodeAt(0) * 7) % 22);
    const glass = new THREE.MeshStandardMaterial({ color: 0x0d0f14, metalness: 0.9, roughness: 0.25, emissive: 0x161c26 });
    glass.userData.envMul = 1.6;
    const towerMat = this.facadeMat([3, 0, 4][id.length % 3], 70 + id.charCodeAt(0), W, H);
    towerMat.userData.envMul = 0.9;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), towerMat);
    tower.position.set(cx, H / 2 + CURB, bzc); tower.castShadow = tower.receiveShadow = true; this.group.add(tower);
    this.addCollider(cx, bzc, W, D);
    const band = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: team.color, emissiveIntensity: 2.2 });
    band.userData.night = true; this.nightMats.push(band);
    for (const y of [6.5, H * 0.5, H - 1.5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.45, D + 0.4), band); b.position.set(cx, y, bzc); this.group.add(b); }
    for (const sx of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, H, 0.8), band); fin.position.set(cx + sx * (W / 2 - 0.4), H / 2 + CURB, fz(0.4)); this.group.add(fin); }
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(18, 5.5, 0.6), glass); lobby.position.set(cx, 2.95 + CURB, fz(0.3)); this.group.add(lobby);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.5, metalness: 0.4 })); canopy.position.set(cx, 6.2, fz(2)); this.group.add(canopy);
    this.makeHQSign(id, team, cx, H - 6, fz(0.7), ry, 14, 5);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
    logo.position.set(cx + 11, 9, fz(0.05)); logo.rotation.y = ry; this.group.add(logo);
    this.registerHQ(id, h, ry, logo);
  }

  // 地标模型换材质：facade → 楼面贴图（带夜间窗灯），emit_team → 战队色发光，paint → 战队色
  dressLandmark(obj, color, fac) {
    const tc = new THREE.Color(color);
    const f = fac.clone(); f.vertexColors = true; f.userData.night = true; this.nightMats.push(f);
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: tc, emissiveIntensity: 2.6 });
    glow.userData.night = true; this.nightMats.push(glow);
    const paints = new Map();
    // 大堂玻璃：原来近乎纯黑（看上去像墙上一个黑洞），改成浅色玻璃 + 夜里亮灯的大堂 + 竖框
    const lobbyGlass = this.lobbyGlass ||= (() => { const m = new THREE.MeshStandardMaterial({ color: 0x5d6b78, metalness: 0.1, roughness: 0.12, emissive: 0xffc98a, emissiveIntensity: 0.55 }); m.userData.envMul = 0.7; m.userData.night = true; this.nightMats.push(m); return m; })();
    const frames = [];
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh) return;
      const n = o.material.name || '';
      if (n === 'glass_lobby') {
        o.material = lobbyGlass;
        const bb = new THREE.Box3().setFromObject(o), y0 = bb.min.y, y1 = bb.max.y, hgt = y1 - y0;
        const bar = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); frames.push(g); };
        for (const [zf, out] of [[bb.min.z, -0.04], [bb.max.z, 0.04]]) {
          for (let x = bb.min.x; x <= bb.max.x + 0.01; x += Math.max(1.2, (bb.max.x - bb.min.x) / Math.round((bb.max.x - bb.min.x) / 1.6))) bar(0.12, hgt, 0.12, x, y0 + hgt / 2, zf + out);
          for (const y of [y0 + 0.06, Math.min(y1 - 0.3, y0 + 2.7), y1 - 0.06]) bar(bb.max.x - bb.min.x, 0.12, 0.12, (bb.min.x + bb.max.x) / 2, y, zf + out);
        }
        for (const [xf, out] of [[bb.min.x, -0.04], [bb.max.x, 0.04]]) {
          for (let z = bb.min.z; z <= bb.max.z + 0.01; z += Math.max(1.2, (bb.max.z - bb.min.z) / Math.max(1, Math.round((bb.max.z - bb.min.z) / 1.6)))) bar(0.12, hgt, 0.12, xf + out, y0 + hgt / 2, z);
          for (const y of [y0 + 0.06, Math.min(y1 - 0.3, y0 + 2.7), y1 - 0.06]) bar(0.12, 0.12, bb.max.z - bb.min.z, xf + out, y, (bb.min.z + bb.max.z) / 2);
        }
        return;
      }
      if (n.startsWith('facade')) o.material = f;
      else if (n === 'emit_team') o.material = glow;
      else if (n === 'paint') { if (!paints.has(o.material)) { const m = o.material.clone(); m.color.copy(tc); paints.set(o.material, m); } o.material = paints.get(o.material); }
      else if (n.startsWith('emit_') && !o.material.userData.night) { o.material.userData.night = true; this.nightMats.push(o.material); }
    });
    if (frames.length) { const fm = this.frameMat ||= new THREE.MeshStandardMaterial({ color: 0x2e3238, metalness: 0.6, roughness: 0.4 }); const m = new THREE.Mesh(mergeGeometries(frames), fm); m.castShadow = true; this.group.add(m); }
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
    // 墙根射灯：贴着墙往上打亮立面，光锥不扫门前地面（花圈摆在那里，以前被照得像闪光弹）
    const spot = new THREE.SpotLight(h.team.color, 18, 34, 0.42, 0.5, 1.5);
    spot.position.set(h.cx, 0.4, h.faceZ + dir * 1.2); spot.target.position.set(h.cx, 24, h.faceZ + dir * 0.2); this.group.add(spot, spot.target);
    const pt = new THREE.PointLight(0xffe2b8, 4, 22, 1.8); pt.position.set(h.cx, 7, h.faceZ + dir * 9); this.group.add(pt);
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
      // 远景楼：6 种立面共用 6 个材质，几何体合并（以前每栋一个材质，70 次绘制）
      const st = r() * 6 | 0, mats = (this.farMats ||= []);
      if (!mats[st]) { const f = facade(st, 500 + st); const m = mats[st] = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.8, metalness: 0 }); f.map.wrapS = f.map.wrapT = f.emissive.wrapS = f.emissive.wrapT = THREE.RepeatWrapping; m.userData.night = true; this.nightMats.push(m); }
      const b = new THREE.BoxGeometry(w, h, w), uv = b.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2, uv.getY(k) * 3);
      b.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d); this.addStatic(mats[st], b, false);
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
    if (this.winGlass) this.winGlass.emissiveIntensity = 0.02 + n * 0.3;
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
    if (this.curve) { const y = this.curve.groundY(x, z); if (y !== null) return y; }
    for (const r of ROADS) { if (Math.abs(x - r) < 7) return 0; if (Math.abs(z - r) < roadWidth('z', r) / 2) return 0; }
    return CURB;
  }
}
