import * as THREE from 'three';
import { Vehicle } from '../player/vehicle.js';
import { ROADS, AVENUE_Z } from './city.js';

// 街上的 AI 车流：在路网交叉口之间随机行驶，右侧通行，前方有车或玩家会刹车按喇叭。
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];          // +x, +z, -x, -z
const COLORS = [0xf2f2f2, 0x1d1f24, 0x8a8f96, 0x2b3a55, 0x6b1d22, 0xd8d4c8, 0x3c4a3e];

export class Traffic {
  constructor(game, n = 12) {
    this.g = game; this.cars = [];
    for (let i = 0; i < n; i++) {
      const kind = i % 6 === 0 ? 'bus' : i % 3 === 0 ? 'taxi' : 'sedan';
      const v = new Vehicle(kind, { color: kind === 'sedan' ? COLORS[i % COLORS.length] : undefined });
      v.ai = true; v.npc = true; v.traffic = true;
      v.aiSpeed = kind === 'bus' ? 8 : 9 + Math.random() * 4;
      // 随机放在某个路口，选一个方向出发
      const ix = Math.random() * ROADS.length | 0, iz = Math.random() * ROADS.length | 0;
      v.node = [ix, iz]; v.dir = Math.random() * 4 | 0;
      if (!this.valid(ix + DIRS[v.dir][0], iz + DIRS[v.dir][1])) v.dir = (v.dir + 2) % 4;
      const p = this.lanePoint(ix, iz, v.dir);
      v.root.position.set(p.x, 0, p.z); v.heading = Math.atan2(DIRS[v.dir][0], DIRS[v.dir][1]); v.root.rotation.y = v.heading;
      this.planNext(v);
      game.addVehicle(v); this.cars.push(v);
    }
  }

  valid(ix, iz) { return ix >= 0 && iz >= 0 && ix < ROADS.length && iz < ROADS.length; }

  // 路口中心向行驶方向右侧偏移到车道上
  lanePoint(ix, iz, dir) {
    const x = ROADS[ix], z = ROADS[iz], [dx, dz] = DIRS[dir];
    const off = dz === 0 && z === AVENUE_Z ? 6 : 3.4;   // 大路走外侧车道
    // 朝 (dx,dz) 行驶时，右手边是 (-dz, dx)
    return new THREE.Vector3(x - dz * off, 0, z + dx * off);
  }

  planNext(v) {
    const [ix, iz] = v.node;
    const opts = [v.dir, (v.dir + 1) % 4, (v.dir + 3) % 4].filter(d => this.valid(ix + DIRS[d][0], iz + DIRS[d][1]));
    const dir = opts.length ? (Math.random() < 0.6 && opts.includes(v.dir) ? v.dir : opts[Math.random() * opts.length | 0]) : (v.dir + 2) % 4;
    const nx = ix + DIRS[dir][0], nz = iz + DIRS[dir][1];
    const start = this.lanePoint(ix, iz, dir), end = this.lanePoint(nx, nz, dir);
    // 出路口后先直行一段再到下一个路口前
    const [dx, dz] = DIRS[dir];
    v.path = [start.clone().add(new THREE.Vector3(dx * 9, 0, dz * 9)), end.clone().add(new THREE.Vector3(-dx * 9, 0, -dz * 9)), end];
    v.pathI = 0; v.dir = dir; v.node = [nx, nz];
  }

  // 红绿灯相位（和 details.js 的灯同步）：A = 大路上沿 x 方向的车，B = 横穿大路的车
  green(axisX) {
    const t = (this.g.time % 24) / 24;
    return axisX ? t < 0.42 : t >= 0.5 && t < 0.92;
  }

  // 找一个远离镜头、附近没车的车道点重新放车（卡死时用）
  respawn(v) {
    const cam = this.g.camera.position;
    for (let k = 0; k < 30; k++) {
      const ix = Math.random() * ROADS.length | 0, iz = Math.random() * ROADS.length | 0, dir = Math.random() * 4 | 0;
      if (!this.valid(ix + DIRS[dir][0], iz + DIRS[dir][1])) continue;
      const p = this.lanePoint(ix, iz, dir).add(new THREE.Vector3(DIRS[dir][0] * 12, 0, DIRS[dir][1] * 12));
      if (p.distanceTo(cam) < 70) continue;
      if (this.g.vehicles.some(o => o !== v && o.root.position.distanceTo(p) < 14)) continue;
      v.root.position.copy(p); v.heading = Math.atan2(DIRS[dir][0], DIRS[dir][1]); v.root.rotation.y = v.heading;
      v.speed = 0; v.slide.set(0, 0, 0); v.spin = 0; v.stun = 0; v.stuckT = 0;
      v.node = [ix, iz]; v.dir = dir; this.planNext(v);
      return;
    }
  }

  // 车流密度：多出来的车停用（隐藏、不参与碰撞）
  setDensity(k = 0.75) {
    const n = Math.round(this.cars.length * k);
    this.cars.forEach((v, i) => { v.off = i >= n; v.root.visible = !v.off; });
  }

  update(dt) {
    const g = this.g, me = g.player.vehicle ? g.player.vehicle.root.position : g.player.pos;
    for (const v of this.cars) {
      if (v.off) continue;
      // 被撞失控：不受 AI 控制，只靠惯性滑行
      if (v.stun > 0) { v.speed *= Math.pow(0.2, dt); v.integrate(dt, null); v.stuckT = 0; continue; }
      const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
      let block = false, wait = false;
      // 前方同车道 12 米内有车 / 玩家 → 跟车减速
      const check = (p, range = 12) => { const d = p.clone().sub(v.root.position); d.y = 0; const ahead = d.dot(fwd); if (ahead > 0 && ahead < range && Math.abs(d.cross(fwd).y) < 2.2) block = true; };
      check(me, 10);
      for (const o of g.vehicles) if (o !== v && !o.off) check(o.root.position);
      // 路口：开往停止线时，大路路口看红绿灯，其他路口看路口里有没有别的车
      if (v.pathI === 1 && v.path) {
        const stop = v.path[1], d = stop.distanceTo(v.root.position);
        if (d < 14) {
          const [nx, nz] = v.node, X = ROADS[nx], Z = ROADS[nz];
          const axisX = DIRS[v.dir][1] === 0;
          if (Z === AVENUE_Z) wait = !this.green(axisX);
          else wait = this.cars.some(o => o !== v && Math.abs(o.root.position.x - X) < 8 && Math.abs(o.root.position.z - Z) < 8 && Math.abs(o.speed) > 0.5);
          if (wait && d < 3) { v.speed = Math.max(0, v.speed - 18 * dt); }
        }
      }
      const target = block || wait ? 0 : v.aiSpeed;
      if (block && Math.abs(v.speed) > 3 && !v.honked && me.distanceTo(v.root.position) < 10) { v.honked = true; g.audio?.sample?.('horn', 0.4) || g.audio?.tone(392, 0.25, { type: 'square', gain: 0.04 }); setTimeout(() => v.honked = false, 4000); }
      const done = v.followPath(v.path, dt, null, target);
      if (block) v.speed = Math.max(0, v.speed - 14 * dt);
      if (done) this.planNext(v);
      // 卡死检测：不是在等灯 / 跟车，却 5 秒没怎么动 → 在镜头外重生
      v.stuckT = Math.abs(v.speed) < 0.6 && !wait ? (v.stuckT || 0) + dt : 0;
      if (v.stuckT > (block ? 9 : 5)) this.respawn(v);
    }
  }
}
