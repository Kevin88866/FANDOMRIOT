import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { textTex } from '../engine/textures.js';
import { model, recolor } from '../engine/assets.js';

// 花圈、横幅、花篮、涂鸦、炸弹、无人机等。每个道具注册成"拍照对象"。
function verticalText(text, { bg = '#ffffff', fg = '#111', w = 128, h = 1024 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const chars = [...text].slice(0, 14), fs = Math.min(w * 0.8, (h * 0.92) / Math.max(chars.length, 1));
  g.fillStyle = fg; g.font = `800 ${fs}px "Noto Sans KR","Noto Sans SC","Microsoft YaHei",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((ch, i) => g.fillText(ch, w / 2, h * 0.04 + fs * (i + 0.5)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let flowerGeoCache = {};
function flowerRing(colors, radius = 0.75, count = 70, seed = 1) {
  const key = colors.join() + radius;
  if (flowerGeoCache[key]) return flowerGeoCache[key];
  const groups = colors.map(() => []);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.05, rr = radius + (Math.random() - 0.5) * 0.22;
    const g = new THREE.IcosahedronGeometry(0.09 + Math.random() * 0.05, 1);
    g.scale(1, 1, 0.6);
    g.translate(Math.cos(a) * rr, Math.sin(a) * rr, (Math.random() - 0.5) * 0.12);
    groups[i % colors.length].push(g);
  }
  const res = groups.map((arr, i) => [mergeGeometries(arr), colors[i]]);
  flowerGeoCache[key] = res; return res;
}

export class Props {
  constructor(game) {
    this.game = game; this.scene = game.scene;
    this.list = [];           // 当前场景里的道具
    this.subjects = [];       // 拍照对象
  }

  // 摆放类道具统一入口（摆放模式的幽灵、缩略图、正式摆放都走这里）
  build(prop, pos, faceRy, text, kind, color) {
    switch (prop) {
      case 'wreath': return this.wreath(pos, faceRy, text, kind);
      case 'flowers': return this.flowers(pos, faceRy, text);
      case 'banner': return this.banner(pos, faceRy, text, kind);
      case 'rally': return this.rallyGroup(pos, faceRy, text, kind);
      case 'lightboard': return this.signModel('pr_lightboard', pos, faceRy, text, kind, true);
      case 'cake': return this.signModel('pr_cake', pos, faceRy, text, 'support');
      case 'lunch': return this.signModel('pr_lunch', pos, faceRy, text, 'support');
      case 'balloon': { const o = this.signModel('pr_balloon', pos, faceRy, text, 'support'); recolor(o, color || '#ff7ab0'); return o; }
    }
    return null;
  }

  // 带一块写字牌（sign_*）的 Blender 模型；glow = 夜里发光的 LED 牌
  signModel(name, pos, faceRy, text, kind, glow = false) {
    const support = kind === 'support';
    const glb = model(name) || new THREE.Group();
    const t = textTex(text, glow ? { w: 512, h: 190, bg: '#000000', fg: support ? '#ff7ab0' : '#ff2d2d', size: 0.5, glow: 18 }
      : { w: 512, h: 260, bg: support ? '#fff0f5' : '#ffffff', fg: support ? '#d81b60' : '#c00000', size: 0.4, border: support ? '#ff9ec4' : '#222' });
    glb.traverse(o => {
      if (!o.isMesh || !o.name.startsWith('sign_')) return;
      o.material = glow ? new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4 })
        : new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
      if (glow) { o.material.userData.night = true; this.game.city?.nightMats.push(o.material); }
    });
    glb.position.copy(pos); glb.rotation.y = faceRy;
    this.place(glb); return glb;
  }

  // 楼体投影：投影灯 + 外墙上的发光文字
  projection(hq, text, kind) {
    const support = kind === 'support';
    const lamp = model('pr_projector') || new THREE.Group();
    lamp.position.copy(hq.plaza).add(new THREE.Vector3(0, 0, hq.dir * 6)); lamp.rotation.y = hq.faceRy + Math.PI;
    this.place(lamp);
    const t = textTex(text, { w: 1024, h: 384, bg: '#000000', fg: support ? '#ffd1e6' : '#ffffff', size: 0.55, glow: 30 });
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), m);
    wall.position.set(hq.cx, 14, hq.face + hq.dir * 0.35); wall.rotation.y = hq.faceRy;
    this.place(wall);
    // 光束
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3dd, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const from = lamp.position.clone().setY(1.3), to = wall.position.clone(), len = from.distanceTo(to);
    beam.scale.set(1, len, 1); beam.position.copy(from).lerp(to, 0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), from.clone().sub(to).normalize().negate());
    this.place(beam);
    return wall;
  }

  // 公交车身广告：在城市里跑一整晚的公交车，侧面贴你的图文
  busAd(text, kind) {
    const g = this.game, support = kind === 'support';
    const bus = new (g.VehicleClass)('bus', { color: support ? 0xff7ab0 : 0x1a1a1a });
    const t = textTex(text, { w: 1024, h: 200, bg: support ? '#ffe3ef' : '#111111', fg: support ? '#d81b60' : '#ff2d2d', size: 0.62 });
    bus.root.traverse(o => { if (o.isMesh && (o.name === 'sign_side' || o.name.startsWith('sign_side'))) o.material = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.5 }); });
    // 车身两侧再贴一块大广告板（模型上没有 sign_side 时也能看到）
    const L = bus.T.len;
    for (const sx of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.62, 1.1), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.5 }));
      pl.position.set(sx * (bus.T.wid / 2 + 0.03), 1.75, -0.2); pl.rotation.y = sx * Math.PI / 2; bus.body.add(pl);
    }
    bus.ai = true; bus.npc = true; bus.path = g.truckRoute(); bus.loop = true; bus.aiSpeed = 8;
    bus.root.position.copy(bus.path[0]); g.addVehicle(bus);
    return bus;
  }

  // 应援棒：广场上的路人人手一根，夜里一片光海
  lightsticks(hq, color) {
    const grp = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), toneMapped: false });
    const geo = new THREE.CylinderGeometry(0.025, 0.03, 0.32, 8); geo.translate(0, 0.16, 0);
    const near = this.game.crowd.list.filter(p => p.a.root.position.distanceTo(hq.plaza) < 26).slice(0, 18);
    for (const p of near) {
      const hand = p.a.bones?.RightHand; if (!hand) continue;
      const st = new THREE.Mesh(geo, m); st.rotation.x = -0.6; hand.add(st); (p.sticks ||= []).push(st);
      setTimeout(() => { hand.remove(st); }, 240000);
    }
    // 广场上再站一排举棒的粉丝（集会规模随粉丝团）
    const n = Math.min(14, 6 + Math.floor((this.game.state.club || 0) / 80));
    for (let i = 0; i < n; i++) {
      const st = new THREE.Mesh(geo, m);
      st.position.copy(hq.plaza).add(new THREE.Vector3(-8 + i * 16 / n, 1.5 + Math.random() * 0.3, hq.dir * (3 + (i % 2))));
      st.rotation.z = (Math.random() - 0.5) * 0.6; grp.add(st);
    }
    this.place(grp);
    return grp;
  }

  addSubject(obj, info) { const s = { obj, ...info, born: this.game.time }; this.subjects.push(s); return s; }

  clearAll() {
    for (const p of this.list) this.scene.remove(p);
    this.list = []; this.subjects = [];
  }

  place(obj) { this.scene.add(obj); this.list.push(obj); obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }

  // 花圈（근조화환）：黑白，竖条丝带写字
  wreath(pos, faceRy, text, kind = 'attack') {
    const support = kind === 'support';
    const t1 = verticalText(text.slice(0, 14), { bg: support ? '#ffd9e6' : '#ffffff', fg: support ? '#c2185b' : '#111' });
    const t2 = verticalText(support ? '♥ 팬 일동 ♥' : '팬 일동 올림', { bg: support ? '#ffd9e6' : '#ffffff', fg: '#444' });
    const glb = model(support ? 'pr_wreath_p' : 'pr_wreath_w');
    if (glb) {   // Blender 花圈：真实花朵 + 三脚架，丝带贴字
      glb.traverse(o => {
        if (o.isMesh && !o.name.startsWith('ribbon') && !o.material.userData.dimmed) {   // 白花反照率压到 0.72，灯下不过曝
          const m = o.material; m.userData.dimmed = true; m.color.multiplyScalar(0.72); m.roughness = Math.max(m.roughness, 0.85); m.envMapIntensity = 0.5;
        }
        if (o.isMesh && o.name === 'ribbon_L') o.material = new THREE.MeshStandardMaterial({ map: t1, roughness: 0.8 });
        else if (o.isMesh && o.name === 'ribbon_R') o.material = new THREE.MeshStandardMaterial({ map: t2, roughness: 0.8 });
      });
      glb.position.copy(pos); glb.rotation.y = faceRy + (Math.random() - 0.5) * 0.1;
      this.place(glb);
      return glb;
    }
    const g = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 });
    for (const [x, rz] of [[-0.45, -0.18], [0.45, 0.18]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.2, 6), legMat); l.position.set(x, 1.05, -0.15); l.rotation.z = rz; g.add(l); }
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.2, 6), legMat); back.position.set(0, 1.05, -0.5); back.rotation.x = -0.3; g.add(back);
    const cols = support ? [0xff6fa0, 0xffd34d, 0xff9ec4, 0xffffff] : [0xf4f4f0, 0xeeeeea, 0xffe9a8, 0xdedede];
    const ring = new THREE.Group();
    for (const [geo, c] of flowerRing(cols)) ring.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ color: support ? 0xffeef4 : 0x1b1b1b, roughness: 0.9 }));
    inner.position.z = -0.03; ring.add(inner);
    ring.position.set(0, 2.05, 0); g.add(ring);
    // 两条竖丝带
    for (const [x, t] of [[-0.32, t1], [0.32, t2]]) {
      const rb = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.6), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
      rb.position.set(x, 1.0, 0.06); g.add(rb);
    }
    g.position.copy(pos); g.rotation.y = faceRy + (Math.random() - 0.5) * 0.1;
    this.place(g);
    return g;
  }

  banner(pos, faceRy, text, kind) {
    const support0 = kind === 'support';
    const glb = model('pr_banner');
    if (glb) {
      const t = textTex(text, { w: 1536, h: 340, bg: support0 ? '#ffe5ef' : '#111111', fg: support0 ? '#e0115f' : '#ff2222', size: 0.62, border: support0 ? '#ff7aa8' : '#ffffff' });
      let cloth = null;
      glb.traverse(o => { if (o.isMesh && o.name === 'cloth') { o.material = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }); cloth = o; } });
      glb.position.copy(pos); glb.rotation.y = faceRy;
      this.place(glb);
      glb.userData.cloth = cloth;
      return glb;
    }
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.3 });
    for (const x of [-3.2, 3.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), poleMat); p.position.set(x, 1.6, 0); g.add(p); }
    const geo = new THREE.PlaneGeometry(6.3, 1.4, 30, 4);
    const pos2 = geo.attributes.position; for (let i = 0; i < pos2.count; i++) pos2.setZ(i, Math.sin(pos2.getX(i) * 1.3) * 0.08);
    geo.computeVertexNormals();
    const support = kind === 'support';
    const t = textTex(text, { w: 1536, h: 340, bg: support ? '#ffe5ef' : '#111111', fg: support ? '#e0115f' : '#ff2222', size: 0.62, border: support ? '#ff7aa8' : '#ffffff' });
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.85 }));
    cloth.position.y = 2.4; g.add(cloth);
    g.position.copy(pos); g.rotation.y = faceRy;
    this.place(g);
    g.userData.cloth = cloth;
    return g;
  }

  flowers(pos, faceRy, text) {
    // 应援花篮：彩色花团 + 立牌
    const glb = model('pr_basket');
    if (glb) {
      const t = textTex(text, { w: 512, h: 288, bg: '#fff0f5', fg: '#d81b60', size: 0.4, border: '#ff9ec4' });
      glb.traverse(o => { if (o.isMesh && o.name === 'sign_card') o.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); });
      glb.position.copy(pos); glb.rotation.y = faceRy;
      this.place(glb); return glb;
    }
    const g = new THREE.Group();
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.32, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.9 }));
    basket.position.y = 0.95; g.add(basket);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0xffffff })); stand.position.y = 0.35; g.add(stand);
    const cols = [0xff5c8a, 0xffd34d, 0xff9ec4, 0xffffff, 0xb36bff];
    const arr = cols.map(() => []);
    for (let i = 0; i < 60; i++) { const b = new THREE.IcosahedronGeometry(0.1 + Math.random() * 0.05, 1); const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y); v.multiplyScalar(0.45); b.translate(v.x, 1.25 + v.y, v.z); arr[i % cols.length].push(b); }
    arr.forEach((a, i) => g.add(new THREE.Mesh(mergeGeometries(a), new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.7 }))));
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ map: textTex(text, { w: 512, h: 280, bg: '#fff0f5', fg: '#d81b60', size: 0.4 }), side: THREE.DoubleSide }));
    card.position.set(0, 1.9, 0.3); g.add(card);
    g.position.copy(pos); g.rotation.y = faceRy;
    this.place(g); return g;
  }

  graffiti(hq, text) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    g.font = '900 300px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,0,60,.8)'; g.shadowBlur = 25; g.fillStyle = '#ff1e46';
    g.save(); g.translate(512, 230); g.rotate(-0.08); g.fillText('OUT', 0, 0); g.restore();
    g.shadowBlur = 0; g.font = '700 70px "Noto Sans KR",sans-serif'; g.fillStyle = '#ffffff'; g.fillText(text, 512, 440);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,30,70,.8)'; g.fillRect(200 + Math.random() * 600, 300 + Math.random() * 60, 4, 20 + Math.random() * 90); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, emissive: 0x330008, emissiveMap: t }));
    m.position.copy(hq.wallPos); m.position.x += 8; m.rotation.y = hq.faceRy;
    m.position.z += hq.dir * 0.1;
    this.place(m); return m;
  }

  // 集会：8 个举牌的人站成两排（整体作为一个可摆放的道具）
  rallyGroup(pos, faceRy, text, kind) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const p = this.picket(new THREE.Vector3(-5.25 + i * 1.5, 0, (i % 2) * 1.1), Math.PI + (Math.random() - 0.5) * 0.3, text, kind);
      this.scene.remove(p); this.list = this.list.filter(x => x !== p); g.add(p);
    }
    g.position.copy(pos); g.rotation.y = faceRy;
    this.place(g); return g;
  }

  // 集会用的手举牌
  picket(pos, faceRy, text, kind) {
    const support0 = kind === 'support';
    const glb = model('pr_picket');
    if (glb) {
      const t = textTex(text, { w: 512, h: 316, bg: support0 ? '#ffe5ef' : '#ffffff', fg: support0 ? '#e0115f' : '#d10000', size: 0.42, border: support0 ? '#ff7aa8' : '#222' });
      glb.traverse(o => { if (o.isMesh && o.name === 'sign_board') o.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }); });
      glb.position.copy(pos); glb.rotation.y = faceRy;
      this.place(glb); return glb;
    }
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a45 }));
    stick.position.y = 0.95; g.add(stick);
    const support = kind === 'support';
    const t = textTex(text, { w: 512, h: 320, bg: support ? '#ffe5ef' : '#ffffff', fg: support ? '#e0115f' : '#d10000', size: 0.42, border: support ? '#ff7aa8' : '#222' });
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.02), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    board.position.y = 2.0; g.add(board);
    g.position.copy(pos); g.rotation.y = faceRy;
    this.place(g); return g;
  }

  // 无人机灯光秀：把文字采样成点阵
  droneShow(center, text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#fff'; g.font = '900 52px "Noto Sans KR","Noto Sans SC",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 52; while (g.measureText(text).width > 246 && fs > 10) { fs -= 2; g.font = `900 ${fs}px "Noto Sans KR","Noto Sans SC",sans-serif`; }
    g.fillText(text, 128, 34);
    const d = g.getImageData(0, 0, 256, 64).data, targets = [];
    for (let y = 0; y < 64; y += 2) for (let x = 0; x < 256; x += 2) if (d[(y * 256 + x) * 4] > 128) targets.push(new THREE.Vector3((x - 128) * 0.28, (32 - y) * 0.28, 0));
    const n = Math.min(targets.length, 900);
    const geo = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), start = [];
    for (let i = 0; i < n; i++) { const s = new THREE.Vector3((Math.random() - 0.5) * 60, -30 + Math.random() * 6, (Math.random() - 0.5) * 30); start.push(s); arr.set([s.x, s.y, s.z], i * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    if (!this.dotTex) { const cc = document.createElement('canvas'); cc.width = cc.height = 32; const gg = cc.getContext('2d'); const gr = gg.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 32, 32); this.dotTex = new THREE.CanvasTexture(cc); }
    const col = new THREE.Color(color).multiplyScalar(3);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, map: this.dotTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.position.copy(center); pts.userData.drone = { start, targets: targets.slice(0, n), t: 0 };
    pts.frustumCulled = false;
    this.place(pts); return pts;
  }

  billboardOrder(text) { this.game.city.setBillboard(text, '#ff7ab0', '생일 축하해요 · 우리 선수 최고 ♥'); }

  update(dt, t) {
    for (const p of this.list) {
      const dr = p.userData.drone;
      if (dr) {
        dr.t += dt; const k = Math.min(1, dr.t / 6), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const a = p.geometry.attributes.position;
        for (let i = 0; i < dr.targets.length; i++) {
          const s = dr.start[i], g = dr.targets[i];
          a.setXYZ(i, s.x + (g.x - s.x) * e, s.y + (g.y - s.y) * e + Math.sin(t * 2 + i) * 0.05, s.z + (g.z - s.z) * e);
        }
        a.needsUpdate = true;
        p.userData.formed = k >= 1;
      }
      if (p.userData.cloth) { const a = p.userData.cloth.geometry.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, Math.sin(a.getX(i) * 1.3 + t * 2.2) * 0.12); a.needsUpdate = true; }
    }
  }
}
