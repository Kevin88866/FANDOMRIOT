import * as THREE from 'three';
import { Actor } from '../world/actors.js';

// 第三人称角色 + 相机 + 上下车
export class Player {
  constructor(game) {
    this.game = game;
    this.actor = new Actor('michelle', { scale: game.charScale });
    this.root = this.actor.root;
    game.scene.add(this.root);
    this.pos = this.root.position;
    this.yaw = Math.PI; this.pitch = 0.25; this.camDist = 5.5;
    this.facing = 0; this.vehicle = null;
    this.vel = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.actor.play('idle');
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.002, -0.35, 1.1);
  }

  enter(v) { this.vehicle = v; this.root.visible = v.type === 'scooter'; v.driver = this; this.camDist = Math.max(7, v.T.len * 1.5); }
  exit() {
    const v = this.vehicle; if (!v) return;
    const side = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)).multiplyScalar(v.T.wid * 0.5 + 1.2);
    this.pos.copy(v.root.position).add(side); this.pos.y = this.game.city.groundY(this.pos.x, this.pos.z);
    this.game.city.collide(this.pos, 0.4);
    v.driver = null; v.speed = 0; this.vehicle = null; this.root.visible = true; this.camDist = 5.5;
    this.root.rotation.set(0, v.heading, 0);
  }

  update(dt, input) {
    const city = this.game.city;
    if (this.vehicle) {
      const v = this.vehicle;
      v.drive(input, dt, city);
      if (v.type === 'scooter') {
        this.pos.copy(v.root.position); this.pos.y += v.seatY; this.root.rotation.set(0, v.heading, 0);
        this.actor.play('idle');
      }
      // 车辆模式：相机自动回到车后方
      if (!input.mouseActive) {
        let d = (v.heading + Math.PI) - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * 2.2) * Math.min(1, Math.abs(v.speed) / 3);
      }
    } else {
      const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0), side = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const run = input.run;
      const speed = run ? 6.2 : 2.1;
      if (fwd || side) {
        const a = Math.atan2(side, fwd);
        const dir = this.yaw + Math.PI - a;
        const target = dir;
        let d = target - this.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.facing += d * Math.min(1, dt * 10);
        this.vel.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(speed);
        this.actor.play(run ? 'run' : 'walk', 0.2, run ? 1 : 1.0);
      } else {
        this.vel.multiplyScalar(Math.pow(0.001, dt));
        this.actor.play('idle', 0.3);
      }
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      city.collide(this.pos, 0.35);
      this.pos.y = THREE.MathUtils.lerp(this.pos.y, city.groundY(this.pos.x, this.pos.z), 0.4);
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
    if (this.shake > 0) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.pow(0.02, dt); }
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
