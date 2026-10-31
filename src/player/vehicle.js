import * as THREE from 'three';
import { textTex } from '../engine/textures.js';
import { model, recolor } from '../engine/assets.js';

// 程序化车辆：车漆用 clearcoat 物理材质，配合环境反射
function paint(color) { return new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }); }
const M = {};
function mats() {
  if (M.tire) return M;
  M.tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  M.rim = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: 0.25 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: 0.2, roughness: 0.05, transmission: 0, clearcoat: 1 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  M.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 3 });
  M.tail = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a1a, emissiveIntensity: 2.5 });
  M.screenOff = new THREE.MeshBasicMaterial({ color: 0x050505 });
  return M;
}

function rbox(w, h, d, r = 0.15, seg = 3) {
  // 圆角盒（用 ExtrudeGeometry 做倒角），比纯方块精致很多
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: seg, curveSegments: 4 });
  g.translate(0, 0, -(d - r * 2) / 2);   // 宽 → x，高 → y，深 → z（车长方向）
  g.computeVertexNormals();
  return g;
}

function wheel(r = 0.5, w = 0.35) {
  const m = mats(), g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 24), m.tire); t.rotation.z = Math.PI / 2; g.add(t);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 12), m.rim); rim.rotation.z = Math.PI / 2; g.add(rim);
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// 车身侧面轮廓：点是 [沿车长方向的比例（-1 车尾 … 1 车头）, 高度（米）]
// lower = 车身下半部分，glass = 车窗（比车身窄一点，形成内收），roof = 车顶薄板，extra = 额外部件
const PROFILES = {
  sedan: {
    lower: [[-1, 0.32], [1, 0.32], [1, 0.62], [0.935, 0.82], [0.43, 0.98], [-0.72, 1.0], [-0.96, 0.98], [-1, 0.76]],
    glass: [[0.44, 0.97], [0.07, 1.39], [-0.41, 1.41], [-0.72, 0.99]],
    roof: [[0.1, 1.37], [0.06, 1.44], [-0.42, 1.46], [-0.46, 1.38]], roofY: 1.46, glassW: 0.88, headY: 0.72, tailY: 0.86,
  },
  van: {
    lower: [[-1, 0.35], [1, 0.35], [1, 0.72], [0.94, 0.95], [0.64, 1.06], [-1, 1.06]],
    glass: [[0.64, 1.05], [0.4, 1.93], [0.08, 1.95], [0.08, 1.05]],
    roof: [[0.42, 1.9], [0.38, 1.99], [-1, 1.99], [-1, 1.9]], roofY: 1.99, glassW: 0.94, headY: 0.8, tailY: 0.95,
    extra: [[0.09, 1.05], [0.09, 1.93], [-0.98, 1.93], [-1, 1.86], [-1, 1.05]], extraW: 0.97,
  },
  pickup: {
    lower: [[-1, 0.42], [1, 0.42], [1, 0.78], [0.95, 1.0], [0.48, 1.1], [-1, 1.1]],
    glass: [[0.48, 1.09], [0.23, 1.86], [-0.17, 1.88], [-0.22, 1.09]],
    roof: [[0.25, 1.83], [0.22, 1.92], [-0.18, 1.94], [-0.23, 1.85]], roofY: 1.94, glassW: 0.9, headY: 0.85, tailY: 1.0,
    extra: [[-0.26, 1.09], [-0.26, 1.42], [-1, 1.42], [-1, 1.09]], extraW: 0.98, extraMat: 'black',
  },
  bus: {
    lower: [[-1, 0.35], [1, 0.35], [1, 1.25], [-1, 1.25]],
    glass: [[0.995, 1.24], [0.985, 2.62], [-0.995, 2.62], [-1, 1.24]],
    roof: [[0.985, 2.6], [0.95, 3.05], [-0.99, 3.05], [-1, 2.6]], roofY: 3.05, glassW: 1.0, headY: 0.75, tailY: 0.95,
  },
};
const profCache = {};
function extrudeProfile(pts, L, width, bevel = 0.05) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z * L / 2, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 2 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);      // 轮廓的 x（车长）→ 世界 z，挤出方向 → 世界 x（车宽）
  g.computeVertexNormals();
  return g;
}
function profileGeos(type, P, L, W) {
  const key = type + L + W;
  if (profCache[key]) return profCache[key];
  const out = {
    lower: extrudeProfile(P.lower, L, W, 0.08),
    glass: extrudeProfile(P.glass, L, W * P.glassW, 0.03),
    roof: extrudeProfile(P.roof, L, W * P.glassW + 0.02, 0.04),
    extra: P.extra ? extrudeProfile(P.extra, L, W * P.extraW, 0.05) : null,
  };
  return (profCache[key] = out);
}

const TYPES = {
  ledtruck:  { len: 8.2, wid: 2.5, color: 0xf2f2f2, speed: 16, accel: 6, screen: true },
  coffee:    { len: 7.2, wid: 2.4, color: 0xffd3e2, speed: 16, accel: 6, screen: true },
  van:       { len: 5.0, wid: 2.0, color: 0xd9dde3, speed: 20, accel: 9 },
  pickup:    { len: 5.4, wid: 2.1, color: 0x1a1a1a, speed: 26, accel: 13 },
  scooter:   { len: 1.4, wid: 0.6, color: 0x27e1ff, speed: 14, accel: 10 },
  sedan:     { len: 4.6, wid: 1.9, color: 0x888888, speed: 12, accel: 5 },
  taxi:      { len: 4.7, wid: 1.85, color: 0xe9782a, speed: 12, accel: 5 },
  bus:       { len: 10.5, wid: 2.5, color: 0x2a8f4e, speed: 10, accel: 3 },
};

export class Vehicle {
  constructor(type, opts = {}) {
    this.type = type; const T = this.T = TYPES[type];
    this.maxSpeed = opts.speed || T.speed;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.wheels = []; this.speed = 0; this.steer = 0; this.heading = 0;
    this.radius = T.wid * 0.55;
    // 碰撞用：质量、侧滑速度、自转、失控时间
    this.mass = { bus: 12, ledtruck: 9, coffee: 8, van: 2.6, pickup: 2.6, sedan: 1.6, taxi: 1.6, scooter: 0.35 }[type] || 2;
    this.slide = new THREE.Vector3(); this.spin = 0; this.stun = 0;
    const m = mats();
    const color = opts.color ?? T.color;
    const glb = model('car_' + type);
    if (glb) this.buildModel(glb, color, opts);           // Blender 模型
    else if (type === 'scooter') this.buildScooter(color);  // 没加载到就退回程序化模型
    else if (type === 'ledtruck' || type === 'coffee') this.buildTruck(color, opts);
    else this.buildCar(color, type);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  buildModel(obj, color, opts) {
    const m = mats();
    this.body.add(obj);
    recolor(obj, color);
    this.screens = [];
    obj.traverse(o => {
      if (o.name.startsWith('wheel_')) { this.wheels.push(o); o.userData.front = /_(FL|FR|F)$/.test(o.name); }
      else if (o.isMesh && o.name.startsWith('screen_')) { o.material = m.screenOff; this.screens.push(o); }
      else if (o.isMesh && o.name.startsWith('sign_taxi')) {
        const t = textTex('TAXI', { w: 256, h: 72, bg: '#fff7d6', fg: '#c4161c', size: 0.72 });
        o.material = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5 });
      } else if (o.isMesh && (o.name === 'sign_route' || o.name === 'sign_side')) {
        o.material = new THREE.MeshBasicMaterial({ map: textTex('472 신촌', { w: 512, h: 100, bg: '#000', fg: '#ffb020', size: 0.7 }), toneMapped: false });
      }
    });
    if (this.type === 'scooter') { this.seatY = 0.26; this.standing = true; }
    if (opts.text && this.screens.length) this.setText(opts.text, opts.textColor, opts.sub);
  }

  addWheels(positions, r, w) {
    for (const [x, z] of positions) { const wh = wheel(r, w); wh.position.set(x, r, z); this.body.add(wh); this.wheels.push(wh); wh.userData.front = z > 0; }
  }

  buildTruck(color, opts) {
    const m = mats(), L = this.T.len;
    const cab = new THREE.Mesh(rbox(2.4, 2.3, 2.2, 0.25), paint(color)); cab.position.set(0, 1.75, L / 2 - 1.15); this.body.add(cab);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.9), m.glass); ws.position.set(0, 2.35, L / 2 - 0.03); ws.rotation.x = -0.12; this.body.add(ws);
    for (const s of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), m.glass); sw.position.set(s * 1.215, 2.3, L / 2 - 1.0); sw.rotation.y = s * Math.PI / 2; this.body.add(sw); }
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 0.3), m.black); bumper.position.set(0, 0.6, L / 2 + 0.05); this.body.add(bumper);
    for (const s of [-1, 1]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.08), m.head); hl.position.set(s * 0.85, 1.0, L / 2 + 0.02); this.body.add(hl); }
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, L - 0.4), m.black); chassis.position.set(0, 0.7, 0); this.body.add(chassis);
    // 车厢 + 两侧 LED 屏
    const boxL = L - 2.6;
    const box = new THREE.Mesh(rbox(2.5, 2.9, boxL, 0.08), paint(0x202226)); box.position.set(0, 2.35, -L / 2 + boxL / 2 + 0.1); this.body.add(box);
    this.screens = [];
    for (const s of [-1, 1]) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(boxL - 0.4, 2.5), m.screenOff.clone());
      sc.position.set(s * 1.33, 2.35, box.position.z); sc.rotation.y = s * Math.PI / 2; this.body.add(sc); this.screens.push(sc);   // 车厢有倒角，屏幕要放在倒角外面
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.5), m.screenOff.clone()); back.position.set(0, 2.35, -L / 2 + 0.05); back.rotation.y = Math.PI; this.body.add(back); this.screens.push(back);
    for (const s of [-1, 1]) { const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06), m.tail); tl.position.set(s * 1.0, 0.75, -L / 2); this.body.add(tl); }
    this.addWheels([[-1.05, L / 2 - 1.3], [1.05, L / 2 - 1.3], [-1.05, -L / 2 + 1.4], [1.05, -L / 2 + 1.4], [-1.05, -L / 2 + 2.5], [1.05, -L / 2 + 2.5]], 0.5, 0.4);
    if (opts.text) this.setText(opts.text, opts.textColor, opts.sub);
  }

  // LED 屏文字（走马灯在 update 里滚动）
  setText(text, color = '#ff2d55', sub = '') {
    const t = textTex(text, { w: 2048, h: 512, bg: '#000000', fg: color, glow: 40, size: 0.62, sub: sub || null, subColor: '#ffffff' });
    t.wrapS = THREE.RepeatWrapping;
    for (const s of this.screens) { s.material = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }); }
    this.screenTex = t;
    this.glow = this.glow || new THREE.PointLight(new THREE.Color(color), 18, 12, 1.5);
    this.glow.color.set(color); this.glow.position.set(0, 2.5, 0); this.body.add(this.glow);
  }

  // 轿车 / 出租车 / 面包车 / 皮卡 / 公交：用侧面轮廓挤出车身（引擎盖、挡风玻璃斜面、车顶、后备箱）
  buildCar(color, type) {
    const m = mats(), L = this.T.len, W = this.T.wid;
    const P = PROFILES[type === 'taxi' ? 'sedan' : type] || PROFILES.sedan;
    const geo = profileGeos(type === 'taxi' ? 'sedan' : type, P, L, W);
    const pm = paint(color);
    for (const [g, mat] of [[geo.lower, pm], [geo.roof, pm], [geo.glass, m.glass], ...(geo.extra ? [[geo.extra, P.extraMat === 'black' ? m.black : pm]] : [])]) {
      const mesh = new THREE.Mesh(g, mat); this.body.add(mesh);
    }
    const bus = type === 'bus';
    if (bus) {   // 车内灯光 + 路线牌
      const lit = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.9, L * 0.86), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.15, 1.0), toneMapped: false, transparent: true, opacity: 0.32 }));
      lit.position.set(0, 1.95, 0); this.body.add(lit);
      const no = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), new THREE.MeshBasicMaterial({ map: textTex('472 신촌', { w: 512, h: 112, bg: '#000', fg: '#ffb020', size: 0.7 }), toneMapped: false }));
      no.position.set(0, 2.85, L / 2 + 0.02); this.body.add(no);
    }
    if (type === 'taxi') {   // 车顶灯
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshStandardMaterial({ map: textTex('TAXI', { w: 256, h: 96, bg: '#fff7d6', fg: '#c4161c', size: 0.7 }), emissive: 0xfff2c0, emissiveIntensity: 1.2 }));
      sign.position.set(0, P.roofY * 1 + 0.13, -L * 0.08); this.body.add(sign);
    }
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(bus ? 0.35 : 0.42, 0.13, 0.08), m.head); hl.position.set(s * W * 0.34, P.headY, L / 2 - 0.02); this.body.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(bus ? 0.3 : 0.38, 0.14, 0.08), m.tail); tl.position.set(s * W * 0.36, P.tailY, -L / 2 + 0.02); this.body.add(tl);
    }
    const wr = bus ? 0.52 : 0.38;
    this.addWheels([[-W * 0.45, L * 0.32], [W * 0.45, L * 0.32], [-W * 0.45, -L * 0.32], [W * 0.45, -L * 0.32]], wr, bus ? 0.36 : 0.28);
  }

  buildScooter(color) {
    const m = mats();
    const deck = new THREE.Mesh(rbox(0.25, 0.08, 1.1, 0.03), paint(color)); deck.position.y = 0.22; this.body.add(deck);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), m.chrome); stem.position.set(0, 0.75, 0.5); stem.rotation.x = -0.15; this.body.add(stem);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), m.black); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.28, 0.58); this.body.add(bar);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), m.head); hl.position.set(0, 1.15, 0.62); this.body.add(hl);
    this.addWheels([[0, 0.5], [0, -0.48]], 0.14, 0.08);
    this.seatY = 0.26; this.standing = true;
  }

  // 玩家驾驶
  drive(input, dt, city) {
    const T = this.T;
    const throttle = (+input.up || 0) - (+input.down || 0);       // 手柄扳机 / 摇杆是 0..1 的模拟量
    const steerIn = (+input.left || 0) - (+input.right || 0);
    if (throttle) this.speed += throttle * T.accel * dt * (Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.5 ? 2.2 : 1);
    else this.speed *= Math.pow(0.45, dt);
    if (input.brake) this.speed *= Math.pow(0.05, dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * 0.35, this.maxSpeed);
    this.steer = THREE.MathUtils.lerp(this.steer, steerIn, Math.min(1, dt * 12));
    this.integrate(dt, city);
  }

  integrate(dt, city) {
    const L = this.T.len;
    const turnRate = this.steer * Math.min(1, Math.abs(this.speed) / 2) * (2.2 / Math.max(2.5, L * 0.55)) * 1.8;
    this.heading += turnRate * Math.sign(this.speed) * dt + this.spin * dt;
    const p = this.root.position;
    p.x += Math.sin(this.heading) * this.speed * dt + this.slide.x * dt;
    p.z += Math.cos(this.heading) * this.speed * dt + this.slide.z * dt;
    // 被撞后的侧滑和打转逐渐停下
    this.slide.multiplyScalar(Math.pow(0.08, dt)); this.spin *= Math.pow(0.06, dt); this.stun = Math.max(0, this.stun - dt);
    // 前后两个碰撞圆
    let hit = false;
    if (city) {
      for (const k of [L * 0.3, -L * 0.3]) {
        const c = new THREE.Vector3(p.x + Math.sin(this.heading) * k, 0, p.z + Math.cos(this.heading) * k);
        const before = c.clone();
        if (city.collide(c, this.radius)) { hit = true; p.x += c.x - before.x; p.z += c.z - before.z; }
      }
    }
    if (hit) { this.lastHit = Math.abs(this.speed); this.speed *= 0.5; } else this.lastHit = 0;
    this.root.rotation.y = this.heading;
    // 车身侧倾与轮子
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -this.steer * Math.min(1, Math.abs(this.speed) / 15) * 0.05, 0.1);
    for (const w of this.wheels) {
      w.children.forEach(c => c.rotation.x += this.speed * dt / 0.45);
      if (w.userData.front) w.rotation.y = this.steer * 0.45;
    }
    if (city) p.y = THREE.MathUtils.lerp(p.y, city.groundY(p.x, p.z), this.type === 'scooter' ? 0.5 : 0.3);
  }

  // AI：沿路点行驶
  followPath(path, dt, city, target = 9) {
    if (!path || this.pathI >= path.length) { this.speed *= 0.9; this.integrate(dt, null); return true; }
    this.pathI = this.pathI ?? 0;
    const p = this.root.position, wp = path[this.pathI];
    const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
    // 到点判定随车速放宽；路点已经在车身侧后方也算到了（避免绕着路点打转）
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), ahead = (dx * fx + dz * fz) / Math.max(d, 1e-3);
    if (d < Math.max(3.5, Math.abs(this.speed) * 0.45) || (d < 10 && ahead < 0.2)) { this.pathI++; return this.pathI >= path.length; }
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    this.steer = THREE.MathUtils.clamp(diff * 2, -1, 1);
    const tgt = Math.abs(diff) > 0.9 ? Math.min(target, 3) : Math.abs(diff) > 0.35 ? target * 0.5 : target;
    this.speed += THREE.MathUtils.clamp(tgt - this.speed, -8 * dt, this.T.accel * dt);
    this.integrate(dt, null);
    return false;
  }

  // LED 屏滚动时，标语正好在屏幕中间的时刻（拍照要抓这个时机）
  sloganVisible() { if (!this.screenTex) return true; const o = ((this.screenTex.offset.x % 1) + 1) % 1; return o < 0.16 || o > 0.84; }

  update(dt, t) {
    if (this.screenTex) this.screenTex.offset.x = (t * 0.12) % 1;
  }
}
