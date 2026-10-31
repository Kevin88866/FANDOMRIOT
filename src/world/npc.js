import * as THREE from 'three';
import { Actor, dressActor, REAL } from './actors.js';
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
      // 20 个写实角色轮流用，避开玩家自己的形象；高矮胖瘦略有差别
      const pool = REAL.filter(k => k !== game.playerLook);
      const kind = pool[(i * 7 + (r() * 3 | 0)) % pool.length];
      const a = new Actor(kind, { scale: game.charScale * (0.95 + r() * 0.1) });
      dressActor(a, r);
      const s = (i < count * 0.6 ? near : blocks)[r() * (i < count * 0.6 ? near.length : blocks.length) | 0];
      const loop = [[s.xMin + 1.2, s.zMin + 1.2], [s.xMax - 1.2, s.zMin + 1.2], [s.xMax - 1.2, s.zMax - 1.2], [s.xMin + 1.2, s.zMax - 1.2]].map(([x, z]) => new THREE.Vector3(x, 0.18, z));
      if (r() < 0.5) loop.reverse();
      const idx = r() * 4 | 0;
      const t = r();
      const p0 = {};
      a.root.position.lerpVectors(loop[idx], loop[(idx + 1) % 4], t);
      game.scene.add(a.root);
      p0.walkClip = ['walk', 'walk2', 'walk3', 'walk_text'][r() * 4 | 0];
      a.play(p0.walkClip, 0);
      a.mixer.setTime(r() * 2);
      this.list.push(Object.assign(p0, { a, loop, idx: (idx + 1) % 4, speed: 1.1 + r() * 0.5, state: 'walk', wait: 0, r, k: i }));
    }
  }

  // 路人密度：只显示前 N 个
  setDensity(k = 0.75) {
    const n = Math.round(this.list.length * k);
    this.list.forEach((p, i) => { p.off = i >= n; if (p.off) p.a.root.visible = false; });
  }

  // 玩家选了某个形象：把用这个形象的路人换成别人
  avoid(kind) {
    const pool = REAL.filter(k => k !== kind);
    for (const p of this.list) {
      if (p.a.kind !== kind) continue;
      const old = p.a, a = new Actor(pool[p.k % pool.length], { scale: old.root.children[0].scale.x / ((old.root.children[0].scale.x) || 1) * this.game.charScale });
      a.root.position.copy(old.root.position); a.root.rotation.copy(old.root.rotation);
      this.game.scene.remove(old.root); this.game.scene.add(a.root);
      a.play(p.walkClip || 'walk', 0); p.a = a; p.meshes = null; p.shadow = undefined;
    }
  }

  // 让附近路人去围观某个点
  attract(point, radius = 70, n = 10, mood = 'cheer') {
    if (this.game.camera.position.distanceTo(point) < 60) this.game.audio?.sample?.(mood === 'angry' ? 'boo' : 'cheer', 0.35);
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
    this.frame = (this.frame || 0) + 1;
    const cam = this.game.camera.position;
    for (const p of this.list) {
      if (p.off) continue;
      const root = p.a.root, pos = root.position;
      const d2 = pos.distanceToSquared(cam), far = d2 > 110 * 110;
      root.visible = !far;
      // 只有镜头附近的路人投影（蒙皮模型很重，远处的阴影也看不清）
      const near = d2 < 38 * 38;
      // 远处的 Xbot 不画关节球（2 万多个三角形，远了看不出来）
      if (p.shadow !== near) { p.shadow = near; (p.meshes ||= (() => { const l = []; root.traverse(o => { if (o.isMesh) l.push(o); }); return l; })()).forEach(o => { o.castShadow = near; }); }
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
          p.a.play(spd > 3 ? 'run' : p.walkClip || 'walk', 0.25, spd > 3 ? 1 : spd / 1.3);
        }
        pos.y = this.game.city.groundY(pos.x, pos.z);
      }
      if (p.state === 'watch') {
        const d = p.look.clone().sub(pos); const want = Math.atan2(d.x, d.z); root.rotation.y += (want - root.rotation.y) * Math.min(1, dt * 4);
        p.wait -= dt;
        // 围观：按情绪随机换动作（欢呼 / 鼓掌 / 跳舞，或者摇头 / 怒吼 / 指指点点），中间夹杂拍照、看手机
        const set = p.mood === 'angry' ? ['headshake', 'angry', 'point', 'text'] : p.mood === 'cheer' ? ['cheer', 'agree', 'fist', 'wave', 'text', 'dance'] : ['idle', 'idle2', 'look', 'text', 'phone'];
        if (!p.anim || Math.random() < 0.004) p.anim = Math.random() < 0.7 ? set[Math.random() * set.length | 0] : 'idle';
        p.a.play(p.anim, 0.4);
        if (p.wait <= 0) { p.state = 'walk'; p.anim = null; }
      }
      if (!far) {   // 远处的路人隔几帧才更新一次骨骼动画
        const every = d2 > 60 * 60 ? 4 : d2 > 30 * 30 ? 2 : 1;
        p.acc = (p.acc || 0) + dt;
        if (((this.frame || 0) + p.k) % every === 0) { p.a.update(p.acc); p.acc = 0; }
      }
    }
  }
}
