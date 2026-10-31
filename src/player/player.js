import * as THREE from 'three';
import { Actor, loadFull, scooterPose, airPose } from '../world/actors.js';

// 第三人称角色 + 相机 + 上下车（走到车门边、上车/下车动作）+ 跳跃
export class Player {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();          // 玩家自己的根节点；角色模型挂在下面，可以随时换形象
    game.scene.add(this.root);
    this.pos = this.root.position;
    this.setLook('josh');
    this.yaw = Math.PI; this.pitch = 0.25; this.camDist = 5.5;
    this.facing = 0; this.vehicle = null;
    this.vel = new THREE.Vector3(); this.vy = 0; this.air = false;
    this.camPos = new THREE.Vector3();
    this.seq = null;                        // 上下车过程
  }

  // 换形象：先用路人版，完整版加载好后替换
  setLook(kind) {
    this.lookKind = kind;
    const build = full => {
      if (this.actor) this.root.remove(this.actor.root);
      const prev = this.actor;
      this.actor = new Actor(kind, { scale: this.game.charScale, full });
      if (prev) { this.actor.pose = prev.pose; this.actor.scooter = prev.scooter; }
      this.root.add(this.actor.root);
      this.actor.play('idle', 0);
    };
    build(false);
    loadFull(kind).then(() => { if (this.lookKind === kind) build(true); });
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.002, -0.35, 1.1);
  }

  get busy() { return !!this.seq; }

  // 驾驶座在车的左侧（韩国左舵）；被挡住就换右侧
  doorPoint(v, side = 1) {
    const h = v.heading, sx = Math.cos(h), sz = -Math.sin(h), fx = Math.sin(h), fz = Math.cos(h);
    const o = v.T.wid * 0.5 + 0.55, f = v.T.len * 0.12;
    return new THREE.Vector3(v.root.position.x + sx * o * side + fx * f, 0, v.root.position.z + sz * o * side + fz * f);
  }

  // 上车：滑板直接站上去；汽车先走到车门边，播放上车动作，再坐进去
  startEnter(v) {
    if (v.type === 'scooter') return this.enter(v);
    this.seq = { type: 'toDoor', v, t: 0, door: this.doorPoint(v) };
  }
  enter(v) {
    this.seq = null; this.vehicle = v; v.driver = this; this.camDist = Math.max(7, v.T.len * 1.5);
    this.root.visible = v.type === 'scooter';
    this.actor.pose = v.type === 'scooter' ? scooterPose : null;
    this.actor.scooter = v.type === 'scooter' ? v : null;
  }
  exit() {
    const v = this.vehicle; if (!v) return;
    const city = this.game.city;
    let p = this.doorPoint(v, 1);
    const test = p.clone(); city.collide(test, 0.4);
    if (test.distanceTo(p) > 0.05) { p = this.doorPoint(v, -1); city.collide(p, 0.4); }
    this.pos.copy(p); this.pos.y = city.groundY(p.x, p.z);
    v.driver = null; v.speed = 0; this.vehicle = null; this.root.visible = true; this.camDist = 5.5;
    this.actor.pose = null; this.actor.scooter = null;
    if (v.type === 'scooter') { this.facing = v.heading; this.root.rotation.set(0, v.heading, 0); return; }
    // 面朝车外，播放下车动作
    const out = Math.atan2(p.x - v.root.position.x, p.z - v.root.position.z);
    this.facing = out; this.root.rotation.set(0, out, 0);
    if (this.actor.play('exit', 0.1, 1.3, true)) this.seq = { type: 'exiting', t: 0, dur: Math.min(1.1, this.actor.duration('exit') / 1.3) };
  }

  jump() {
    if (this.vehicle || this.air || this.seq) return;
    this.vy = 5.2; this.air = true; this.actor.pose = airPose;
    this.game.audio?.sample?.('jump', 0.4);
  }

  // 上下车过程（返回 true 表示这一帧由过程接管）
  updateSeq(dt) {
    const q = this.seq; if (!q) return false;
    q.t += dt;
    if (q.type === 'toDoor') {
      const d = q.door.clone().sub(this.pos); d.y = 0;
      if (d.length() > 0.25 && q.t < 2.5) {
        d.normalize(); this.facing = Math.atan2(d.x, d.z);
        this.pos.addScaledVector(d, Math.min(2.4 * dt, this.pos.distanceTo(q.door)));
        this.actor.play('walk', 0.15);
      } else {
        // 面向车头方向，播放上车动作，结束后坐进车里
        this.facing = q.v.heading + Math.PI / 2 * 0;
        const toCar = q.v.root.position.clone().sub(this.pos); this.facing = Math.atan2(toCar.x, toCar.z);
        const ok = this.actor.play('enter', 0.1, 1.4, true);
        q.type = 'entering'; q.t = 0; q.dur = ok ? Math.min(1.2, this.actor.duration('enter') / 1.4) : 0.2;
      }
    } else if (q.type === 'entering') {
      if (q.t > q.dur) { this.enter(q.v); this.actor.play('idle', 0); }
    } else if (q.type === 'exiting') {
      if (q.t > q.dur) { this.seq = null; this.actor.play('idle', 0.3); }
    }
    this.pos.y = THREE.MathUtils.lerp(this.pos.y, this.game.city.groundY(this.pos.x, this.pos.z), 0.4);
    this.root.rotation.y = this.facing;
    this.actor.update(dt);
    return true;
  }

  update(dt, input) {
    const city = this.game.city;
    if (this.updateSeq(dt)) return;
    if (this.vehicle) {
      const v = this.vehicle;
      v.drive(input, dt, city);
      if (v.type === 'scooter') {
        this.pos.copy(v.root.position); this.pos.y += v.seatY; this.root.rotation.set(0, v.heading, 0);
        this.actor.play('breathe');
      }
      // 车辆模式：相机自动回到车后方
      if (!input.mouseActive) {
        let d = (v.heading + Math.PI) - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * 2.2) * Math.min(1, Math.abs(v.speed) / 3);
      }
    } else {
      let fwd = (+input.up || 0) - (+input.down || 0), side = (+input.right || 0) - (+input.left || 0);
      if (Math.hypot(fwd, side) < 0.2) fwd = side = 0;
      const run = input.run;
      const speed = run ? 6.2 : 2.1;
      if (fwd || side) {
        const a = Math.atan2(side, fwd);
        const dir = this.yaw + Math.PI - a;
        const target = dir;
        let d = target - this.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.facing += d * Math.min(1, dt * 10);
        this.vel.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(speed);
        if (!this.air) this.actor.play(run ? 'run' : 'walk', 0.2, run ? 1 : 1.0);
      } else {
        this.vel.multiplyScalar(Math.pow(this.air ? 0.5 : 0.001, dt));
        if (!this.air) this.actor.play('idle', 0.3);
      }
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      city.collide(this.pos, 0.35);
      const ground = city.groundY(this.pos.x, this.pos.z);
      if (this.air) {   // 跳跃：重力，落地（可以跳上路沿）
        this.vy -= 16 * dt; this.pos.y += this.vy * dt;
        if (this.pos.y <= ground && this.vy < 0) { this.pos.y = ground; this.air = false; this.vy = 0; this.actor.pose = null; this.game.audio?.sample?.('land', 0.3); }
      } else this.pos.y = THREE.MathUtils.lerp(this.pos.y, ground, 0.4);
      this.root.rotation.y = this.facing;
    }
    this.actor.update(dt);
  }

  updateCamera(cam, dt) {
    const focus = this.vehicle ? this.vehicle.root.position.clone().add(new THREE.Vector3(0, this.vehicle.T.len > 6 ? 2.6 : 1.6, 0)) : this.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    const dist = this.camDist;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(dist);
    // 相机避障：沿相机射线检测楼体 AABB，缩短距离
    let t = 1;
    for (const c of this.game.city.colliders) {
      if (c.small) continue;
      const hit = segAABB(focus.x, focus.z, focus.x + off.x, focus.z + off.z, c);
      if (hit !== null && hit < t) t = hit;
    }
    t = Math.max(0.15, t - 0.05);
    const want = focus.clone().add(off.multiplyScalar(t));
    want.y = Math.max(want.y, 0.5);
    this.camPos.lerp(want, 1 - Math.pow(0.0005, dt));
    if (this.camPos.lengthSq() === 0 || this.snapCam) { this.camPos.copy(want); this.snapCam = false; }
    cam.position.copy(this.camPos);
    if (this.shake > 0.002) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.02, dt); }
    cam.lookAt(focus);
  }
}

function segAABB(x0, z0, x1, z1, b) {
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  for (const [p, d, mn, mx] of [[x0, dx, b.minX, b.maxX], [z0, dz, b.minZ, b.maxZ]]) {
    if (Math.abs(d) < 1e-8) { if (p < mn || p > mx) return null; }
    else { let t1 = (mn - p) / d, t2 = (mx - p) / d; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null; }
  }
  return tmin;
}
