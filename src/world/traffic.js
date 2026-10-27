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

  update(dt) {
    const g = this.g, me = g.player.vehicle ? g.player.vehicle.root.position : g.player.pos;
    for (const v of this.cars) {
      // 前方 9 米内有车 / 玩家 → 减速
      const fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
      let block = false;
      const check = p => { const d = p.clone().sub(v.root.position); d.y = 0; const ahead = d.dot(fwd); if (ahead > 0 && ahead < 9 && Math.abs(d.cross(fwd).y) < 2.2) block = true; };
      check(me);
      for (const o of g.vehicles) if (o !== v && !o.traffic) check(o.root.position);
      for (const o of this.cars) if (o !== v) check(o.root.position);
      const target = block ? 0 : v.aiSpeed;
      if (block && Math.abs(v.speed) > 3 && !v.honked && me.distanceTo(v.root.position) < 10) { v.honked = true; g.audio?.tone(392, 0.25, { type: 'square', gain: 0.04 }); setTimeout(() => v.honked = false, 4000); }
      const done = v.followPath(v.path, dt, null, target);
      if (block) v.speed = Math.max(0, v.speed - 14 * dt);
      if (done) this.planNext(v);
    }
  }
}
