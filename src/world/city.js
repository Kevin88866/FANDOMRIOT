import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asphalt, sidewalk, facade, textTex, logoTex, mulberry, KOREAN_SIGNS } from '../engine/textures.js';
import { TEAMS, LEAGUE } from '../content/data.js';

// 首尔街区：6x6 路网，中间一条宽的大路（z=30），两家战队总部（LEAGUE.hqA / hqB）隔路相对。
export const ROADS = [-150, -90, -30, 30, 90, 150];
export const AVENUE_Z = 30;
export const roadWidth = (axis, v) => (axis === 'z' && v === AVENUE_Z ? 26 : 14);
const BLOCK = 60, CURB = 0.18, HALF = 165;

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
    this.rnd = mulberry(2024);
    this.build();
  }

  addCollider(cx, cz, w, d) { this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }); }

  build() {
    this.ground();
    this.roadMarkings();
    for (let bx = -2; bx <= 2; bx++) for (let bz = -2; bz <= 2; bz++) this.block(bx * BLOCK, bz * BLOCK);
    this.streetLamps();
    this.hqA(); this.hqB();
    this.shops();
    this.boundary();
  }

  ground() {
    const a = asphalt();
    const roadMat = new THREE.MeshStandardMaterial({ map: a.map, roughness: 0.82, metalness: 0.0, color: 0xb8b8b8 });
    roadMat.map.repeat.set(36, 36);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40), roadMat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
    this.group.add(g);
    // 远处地面
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.y = -0.05; this.group.add(far);
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
      this.swMat = new THREE.MeshStandardMaterial({ map: sidewalk(), roughness: 0.9 });
      this.swMat.map.repeat.set(0.25, 0.25);
      this.curbMat = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.85 });
    }
    const geo = new THREE.BoxGeometry(w, CURB, d);
    // 世界坐标 UV，避免拉伸
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + mx) * 0.25, (pos.getZ(i) + mz) * 0.25);
    const sw = new THREE.Mesh(geo, this.swMat);
    sw.material.map.repeat.set(1, 1);
    sw.position.set(mx, CURB / 2, mz); sw.receiveShadow = true;
    this.group.add(sw);

    const key = `${cx},${cz}`;
    const special = { '0,60': 'A', '0,0': 'B', '-60,0': 'shop', '60,60': 'billboard', '-120,60': 'home', '120,0': 'garage' }[key];
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

  building(L, r) {
    let h;
    if (L.special === 'billboard') h = 34; else h = 8 + Math.pow(r(), 1.7) * 46;
    const style = r() * 6 | 0, seed = r() * 1000 | 0;
    const f = facade(style, seed);
    const repY = Math.max(1, Math.round(h / 22));
    const mat = new THREE.MeshStandardMaterial({
      map: f.map.clone(), emissiveMap: f.emissive.clone(), emissive: 0xffffff, emissiveIntensity: 1.2,
      roughness: style === 1 || style === 3 ? 0.25 : 0.75, metalness: style === 1 || style === 3 ? 0.55 : 0.05,
    });
    for (const t of [mat.map, mat.emissiveMap]) { t.repeat.set(Math.max(1, Math.round(L.w / 10)), repY); t.needsUpdate = true; }
    mat.userData.night = true;
    const roofMat = this.roofMat || (this.roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.9 }));
    const b = new THREE.Mesh(new THREE.BoxGeometry(L.w, h, L.d), [mat, mat, roofMat, roofMat, mat, mat]);
    b.position.set(L.x, h / 2 + CURB, L.z); b.castShadow = true; b.receiveShadow = true;
    this.group.add(b);
    this.addCollider(L.x, L.z, L.w, L.d);
    this.nightMats = this.nightMats || []; this.nightMats.push(mat);
    // 屋顶设备
    if (r() < 0.6) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(2 + r() * 3, 1.5, 2 + r() * 2), roofMat);
      ac.position.set(L.x + (r() - 0.5) * L.w * 0.5, h + CURB + 0.75, L.z + (r() - 0.5) * L.d * 0.5); ac.castShadow = true; this.group.add(ac);
    }
    // 一楼店铺招牌（霓虹）
    if (h < 40 || r() < 0.5) this.shopSign(L, r);
    if (L.special === 'billboard') this.billboardScreen(L, h);
  }

  shopSign(L, r, text) {
    const t = text || KOREAN_SIGNS[r() * KOREAN_SIGNS.length | 0];
    const hue = r() * 360 | 0;
    const tx = textTex(t, { w: 512, h: 128, bg: `hsl(${hue},55%,12%)`, fg: `hsl(${hue},95%,72%)`, glow: 18, size: 0.62 });
    const m = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4 });
    m.userData.night = true; this.nightMats.push(m);
    const sw = Math.min(L.w * 0.8, 7), sh = sw / 4;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.25), [this.curbMat, this.curbMat, this.curbMat, this.curbMat, m, m]);
    const off = { S: [0, -1], N: [0, 1], W: [-1, 0], E: [1, 0] }[L.facing];
    // 招牌朝向街道：S 侧楼的正面朝 -z
    const fx = L.x + off[0] * (L.w / 2 + 0.15), fz = L.z + off[1] * (L.d / 2 + 0.15);
    sign.position.set(fx, 4.2, fz);
    sign.rotation.y = { S: Math.PI, N: 0, W: -Math.PI / 2, E: Math.PI / 2 }[L.facing];
    this.group.add(sign);
    // 雨棚
    const aw = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.12, 1.4), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.5, 0.35), roughness: 0.7 }));
    aw.position.set(fx + off[0] * 0.7, 3.1, fz + off[1] * 0.7); aw.rotation.y = sign.rotation.y; aw.castShadow = true;
    this.group.add(aw);
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
    const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x2c2f35, metalness: 0.6, roughness: 0.5 }), n);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 3 });
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMat, n);
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
    this.group.add(poles, bulbs, pools);
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
    const glass = new THREE.MeshStandardMaterial({ color: 0x0d0f14, metalness: 0.9, roughness: 0.12 });
    glass.userData.envMul = 1.6;
    const f = facade(1, 77);
    const towerMat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.18, color: 0x8890a0 });
    f.map.repeat.set(3, 4); f.emissive.repeat.set(3, 4); towerMat.userData.night = true; this.nightMats.push(towerMat);
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
    const f = facade(5, 31);
    const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.2 });
    f.map.repeat.set(3, 3); f.emissive.repeat.set(3, 3); mat.userData.night = true; this.nightMats.push(mat);
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, 44, D), mat);
    body.position.set(cx, 22 + CURB, bzc); body.castShadow = body.receiveShadow = true; this.group.add(body);
    this.addCollider(cx, bzc, W, D);
    // 橙色竖向鳍片
    const orange = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.4, metalness: 0.3, emissive: team.color, emissiveIntensity: 0.25 });
    for (let i = -3; i <= 3; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 44, 1.2), orange); fin.position.set(cx + i * 4.4, 22, faceZ + 0.6); fin.castShadow = true; this.group.add(fin); }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 5), orange);
    canopy.position.set(cx, 5.5, faceZ + 2.5); canopy.castShadow = true; this.group.add(canopy);
    const glass = new THREE.MeshStandardMaterial({ color: 0x10141a, metalness: 0.9, roughness: 0.1 });
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 0.6), glass); lobby.position.set(cx, 2.7, faceZ + 0.3); this.group.add(lobby);
    this.makeHQSign(id, team, cx, 38, faceZ + 1.4, 0, 18, 5);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshStandardMaterial({ map: logoTex(team), emissive: 0xffffff, emissiveMap: logoTex(team), emissiveIntensity: 0.6 }));
    logo.position.set(cx - 12, 8, faceZ + 1.3); this.group.add(logo);
    this.registerHQ(id, h, 0, logo);
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
    const spot = new THREE.SpotLight(h.team.color, 60, 40, 0.7, 0.6, 1.5);
    spot.position.set(h.cx, 0.5, h.faceZ + dir * 12); spot.target.position.set(h.cx, 18, h.faceZ); this.group.add(spot, spot.target);
    const pt = new THREE.PointLight(0xffe2b8, 40, 26, 1.6); pt.position.set(h.cx, 6, h.faceZ + dir * 8); this.group.add(pt);
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
      const a = (i / 70) * Math.PI * 2, d = 230 + r() * 120, h = 20 + r() * 90;
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
