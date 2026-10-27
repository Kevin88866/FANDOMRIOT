import * as THREE from 'three';
import { Actor, randomTint } from './actors.js';
import { mulberry } from '../engine/textures.js';

// 路人：沿街区人行道绕圈；发生"事件"时会围观拍照
export class Crowd {
  constructor(game, count = 26) {
    this.game = game; this.list = [];
    const r = mulberry(99);
    const blocks = [];
    for (let bx = -2; bx <= 2; bx++) for (let bz = -2; bz <= 2; bz++) blocks.push(game.city.sidewalkFor(bx * 60, bz * 60));
    // 优先放在总部附近
    const near = blocks.filter(s => Math.abs((s.xMin + s.xMax) / 2) <= 60 && Math.abs((s.zMin + s.zMax) / 2 - 30) <= 60);
    for (let i = 0; i < count; i++) {
      const kind = r() < 0.75 ? 'michelle' : 'xbot';
      const a = new Actor(kind, { tint: randomTint(r), scale: game.charScale * (kind === 'xbot' ? 1.02 : 0.94 + r() * 0.12) });
      const s = (i < count * 0.6 ? near : blocks)[r() * (i < count * 0.6 ? near.length : blocks.length) | 0];
      const loop = [[s.xMin + 1.2, s.zMin + 1.2], [s.xMax - 1.2, s.zMin + 1.2], [s.xMax - 1.2, s.zMax - 1.2], [s.xMin + 1.2, s.zMax - 1.2]].map(([x, z]) => new THREE.Vector3(x, 0.18, z));
      if (r() < 0.5) loop.reverse();
      const idx = r() * 4 | 0;
      const t = r();
      a.root.position.lerpVectors(loop[idx], loop[(idx + 1) % 4], t);
      game.scene.add(a.root);
      a.play('walk', 0);
      a.mixer.setTime(r() * 2);
      this.list.push({ a, loop, idx: (idx + 1) % 4, speed: 1.1 + r() * 0.5, state: 'walk', wait: 0, r });
    }
  }

  // 让附近路人去围观某个点
  attract(point, radius = 70, n = 10, mood = 'cheer') {
    const sorted = this.list.filter(p => p.state !== 'flee').map(p => [p, p.a.root.position.distanceTo(point)]).filter(([, d]) => d < radius).sort((a, b) => a[1] - b[1]).slice(0, n);
    sorted.forEach(([p], i) => {
      const ang = Math.random() * Math.PI * 2, rr = 5 + Math.random() * 5;
      p.target = point.clone().add(new THREE.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr));
      p.look = point.clone(); p.state = 'goto'; p.mood = mood; p.wait = 25 + Math.random() * 20;
    });
  }

  flee(point, radius = 25) {
    for (const p of this.list) if (p.a.root.position.distanceTo(point) < radius) {
      const away = p.a.root.position.clone().sub(point).setY(0).normalize().multiplyScalar(30);
      p.target = p.a.root.position.clone().add(away); p.state = 'flee'; p.wait = 8;
    }
  }

  // 拍照时：镜头里在"围观"的路人数
  watchersNear(point, r = 16) { return this.list.filter(p => (p.state === 'watch' || p.state === 'goto') && p.a.root.position.distanceTo(point) < r).length; }

  update(dt) {
    const cam = this.game.camera.position;
    for (const p of this.list) {
      const root = p.a.root, pos = root.position;
      const far = pos.distanceToSquared(cam) > 160 * 160;
      root.visible = !far;
      let tgt = null, spd = p.speed;
      if (p.state === 'walk') tgt = p.loop[p.idx];
      else if (p.state === 'goto' || p.state === 'flee') { tgt = p.target; spd = p.state === 'flee' ? 5.5 : 2.6; }
      if (tgt) {
        const d = tgt.clone().sub(pos).setY(0), L = d.length();
        if (L < 0.4) {
          if (p.state === 'walk') p.idx = (p.idx + 1) % 4;
          else if (p.state === 'goto') { p.state = 'watch'; }
          else if (p.state === 'flee') { p.state = 'walk'; }
        } else {
          d.normalize();
          pos.addScaledVector(d, Math.min(L, spd * dt));
          const want = Math.atan2(d.x, d.z); let df = want - root.rotation.y; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
          root.rotation.y += df * Math.min(1, dt * 8);
          p.a.play(spd > 3 ? 'run' : 'walk', 0.25, spd > 3 ? 1 : spd / 1.3);
        }
        pos.y = this.game.city.groundY(pos.x, pos.z);
      }
      if (p.state === 'watch') {
        const d = p.look.clone().sub(pos); const want = Math.atan2(d.x, d.z); root.rotation.y += (want - root.rotation.y) * Math.min(1, dt * 4);
        p.wait -= dt;
        const anim = p.mood === 'angry' ? 'headshake' : p.mood === 'cheer' ? (p.a.kind === 'michelle' && Math.random() < 0.002 ? 'sambadance' : 'agree') : 'idle';
        if (!p.anim || Math.random() < 0.004) { p.anim = Math.random() < 0.55 ? anim : 'idle'; }
        p.a.play(p.anim, 0.4);
        if (p.wait <= 0) { p.state = 'walk'; p.anim = null; }
      }
      if (!far) p.a.update(dt);
    }
  }
}
