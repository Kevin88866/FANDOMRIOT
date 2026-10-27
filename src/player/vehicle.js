import * as THREE from 'three';
import { textTex } from '../engine/textures.js';

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
  g.translate(0, 0, -(d - r * 2) / 2); g.rotateY(Math.PI / 2);
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

const TYPES = {
  ledtruck:  { len: 8.2, wid: 2.5, color: 0xf2f2f2, speed: 16, accel: 6, screen: true },
  coffee:    { len: 7.2, wid: 2.4, color: 0xffd3e2, speed: 16, accel: 6, screen: true },
  van:       { len: 5.0, wid: 2.0, color: 0xd9dde3, speed: 20, accel: 9 },
  pickup:    { len: 5.4, wid: 2.1, color: 0x1a1a1a, speed: 26, accel: 13 },
  scooter:   { len: 1.4, wid: 0.6, color: 0x27e1ff, speed: 14, accel: 10 },
  police:    { len: 4.8, wid: 1.9, color: 0x1a2a6c, speed: 24, accel: 12 },
  sedan:     { len: 4.6, wid: 1.9, color: 0x888888, speed: 12, accel: 5 },
};

export class Vehicle {
  constructor(type, opts = {}) {
    this.type = type; const T = this.T = TYPES[type];
    this.maxSpeed = opts.speed || T.speed;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.wheels = []; this.speed = 0; this.steer = 0; this.heading = 0;
    this.radius = T.wid * 0.55;
    const m = mats();
    const color = opts.color ?? T.color;
    if (type === 'scooter') this.buildScooter(color);
    else if (type === 'ledtruck' || type === 'coffee') this.buildTruck(color, opts);
    else this.buildCar(color, type);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
      sc.position.set(s * 1.27, 2.35, box.position.z); sc.rotation.y = s * Math.PI / 2; this.body.add(sc); this.screens.push(sc);
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

  buildCar(color, type) {
    const m = mats(), L = this.T.len, W = this.T.wid;
    const lower = new THREE.Mesh(rbox(W, 0.8, L, 0.25), paint(color)); lower.position.y = 0.85; this.body.add(lower);
    const cabLen = type === 'van' ? L * 0.8 : type === 'pickup' ? L * 0.42 : L * 0.55;
    const cabZ = type === 'van' ? -0.1 : type === 'pickup' ? 0.4 : -0.2;
    const cabH = type === 'van' ? 1.3 : 0.75;
    const upper = new THREE.Mesh(rbox(W * 0.92, cabH, cabLen, 0.22), paint(color)); upper.position.set(0, 1.25 + cabH / 2, cabZ); this.body.add(upper);
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.93, cabH * 0.62, cabLen * 0.92), m.glass); g1.position.set(0, 1.3 + cabH * 0.5, cabZ); this.body.add(g1);
    if (type === 'pickup') { const bed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.5, L * 0.38), m.black); bed.position.set(0, 1.3, -L * 0.28); this.body.add(bed); }
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.06), m.head); hl.position.set(s * W * 0.33, 0.95, L / 2 + 0.02); this.body.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.06), m.tail); tl.position.set(s * W * 0.33, 1.0, -L / 2 - 0.02); this.body.add(tl);
    }
    if (type === 'police') {
      const bar = new THREE.Group(); bar.position.set(0, 1.25 + cabH + 0.12, cabZ);
      this.sirenR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false }));
      this.sirenB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.25), new THREE.MeshBasicMaterial({ color: 0x0044ff, toneMapped: false }));
      this.sirenR.position.x = -0.3; this.sirenB.position.x = 0.3; bar.add(this.sirenR, this.sirenB); this.body.add(bar);
      this.sirenLight = new THREE.PointLight(0xff0000, 25, 18, 1.5); this.sirenLight.position.copy(bar.position); this.body.add(this.sirenLight);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.18, L * 0.7), new THREE.MeshStandardMaterial({ color: 0xffffff })); stripe.position.y = 0.95; this.body.add(stripe);
    }
    this.addWheels([[-W * 0.45, L * 0.32], [W * 0.45, L * 0.32], [-W * 0.45, -L * 0.32], [W * 0.45, -L * 0.32]], 0.38, 0.28);
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
    const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (throttle) this.speed += throttle * T.accel * dt * (Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.5 ? 2.2 : 1);
    else this.speed *= Math.pow(0.45, dt);
    if (input.brake) this.speed *= Math.pow(0.05, dt);
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxSpeed * 0.35, this.maxSpeed);
    this.steer = THREE.MathUtils.lerp(this.steer, steerIn, Math.min(1, dt * 6));
    this.integrate(dt, city);
  }

  integrate(dt, city) {
    const L = this.T.len;
    const turnRate = this.steer * Math.min(1, Math.abs(this.speed) / 4) * (2.2 / Math.max(2.5, L * 0.55)) * 1.6;
    this.heading += turnRate * Math.sign(this.speed) * dt;
    const p = this.root.position;
    p.x += Math.sin(this.heading) * this.speed * dt;
    p.z += Math.cos(this.heading) * this.speed * dt;
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
    if (city && this.type !== 'scooter') p.y = THREE.MathUtils.lerp(p.y, city.groundY(p.x, p.z), 0.3);
  }

  // AI：沿路点行驶
  followPath(path, dt, city, target = 9) {
    if (!path || this.pathI >= path.length) { this.speed *= 0.9; this.integrate(dt, null); return true; }
    this.pathI = this.pathI ?? 0;
    const p = this.root.position, wp = path[this.pathI];
    const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
    if (d < 3.5) { this.pathI++; return this.pathI >= path.length; }
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    this.steer = THREE.MathUtils.clamp(diff * 2, -1, 1);
    const tgt = Math.abs(diff) > 0.5 ? target * 0.5 : target;
    this.speed += THREE.MathUtils.clamp(tgt - this.speed, -8 * dt, this.T.accel * dt);
    this.integrate(dt, null);
    return false;
  }

  update(dt, t) {
    if (this.screenTex) this.screenTex.offset.x = (t * 0.12) % 1;
    if (this.sirenR) {
      const on = Math.floor(t * 6) % 2 === 0;
      this.sirenR.material.color.setRGB(on ? 3 : 0.1, 0, 0); this.sirenB.material.color.setRGB(0, 0, on ? 0.1 : 3);
      this.sirenLight.color.set(on ? 0xff0000 : 0x0044ff);
    }
  }
}
