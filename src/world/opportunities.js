import * as THREE from 'three';
import { Actor } from './actors.js';
import { Vehicle } from '../player/vehicle.js';
import { textTex } from '../engine/textures.js';
import { TEAMS, LEAGUE } from '../content/data.js';
import { noteInfluence } from '../sim/sim.js';

// 每晚的限时机会事件：选手下班、记者采访、对手粉头的卡车、街头主播。
// 它们给玩家在 3D 世界里"赶时间、抢镜头"的理由，并产生特殊的照片标签。
const clockStr = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const rnd = (a, b) => a + Math.random() * (b - a);

function nameTag(text, color = '#ffffff') {
  const t = textTex(text, { w: 512, h: 96, bg: 'rgba(0,0,0,0.55)', fg: color, size: 0.62 });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2.2, 0.41, 1); s.position.y = 2.25; s.renderOrder = 10;
  return s;
}

// 简单的路点行走 NPC
export class Walker {
  constructor(game, actor, path, speed = 1.3) { this.g = game; this.a = actor; this.path = path; this.i = 0; this.speed = speed; this.wait = 0; this.done = false; }
  update(dt) {
    const root = this.a.root;
    if (this.wait > 0) { this.wait -= dt; this.a.update(dt); return; }
    const wp = this.path[this.i];
    if (!wp) { this.done = true; this.a.play('idle', 0.3); this.a.update(dt); return; }
    const d = wp.pos.clone().sub(root.position).setY(0), L = d.length();
    if (L < 0.3) {
      this.i++;
      if (wp.wait) { this.wait = wp.wait; this.a.play(wp.anim || 'idle', 0.3); if (wp.face) root.rotation.y = Math.atan2(wp.face.x - root.position.x, wp.face.z - root.position.z); wp.onArrive?.(); }
    } else {
      d.normalize(); root.position.addScaledVector(d, Math.min(L, this.speed * dt));
      const want = Math.atan2(d.x, d.z); let df = want - root.rotation.y; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
      root.rotation.y += df * Math.min(1, dt * 8);
      this.a.play('walk', 0.25, this.speed / 1.3);
    }
    root.position.y = this.g.city.groundY(root.position.x, root.position.z);
    this.a.update(dt);
  }
}

export class Opportunities {
  constructor(game) { this.g = game; this.list = []; this.objects = []; }

  get s() { return this.g.state; }

  clear() {
    for (const o of this.objects) this.g.scene.remove(o);
    for (const e of this.list) if (e.van) this.g.removeVehicle(e.van);
    for (const e of this.list) if (e.truck) this.g.removeVehicle(e.truck);
    this.objects = []; this.list = [];
  }

  add(obj) { this.g.scene.add(obj); this.objects.push(obj); return obj; }

  // ---------- 每天开始时安排 ----------
  plan() {
    this.clear();
    const s = this.s, n = 3 + (Math.random() < 0.4 ? 1 : 0);
    const types = ['commute', 'press', 'rival', 'streamer'];
    if (Math.random() < 0.5) types.push('commute2');
    const pick = types.sort(() => Math.random() - 0.5).slice(0, n);
    if (!pick.includes('commute') && !pick.includes('commute2')) pick[0] = 'commute';
    const used = new Set();
    for (const t of pick) {
      const e = this.make(t.replace('2', ''), used); if (e) this.list.push(e);
    }
    this.list.sort((a, b) => a.start - b.start);
  }

  // 优先挑和玩家有关的人（背包里有针对他的道具、赛季目标）
  pickPlayer(used) {
    const s = this.s, hqTeams = [LEAGUE.hqA, LEAGUE.hqB];
    const c = Object.values(s.players).filter(p => hqTeams.includes(p.team) && !p.benched && !p.sub && !used.has(p.name));
    const w = p => 1 + p.heat / 30 + (s.inventory.some(o => o.target === p.name) ? 4 : 0) + (s.goals?.target === p.name ? 3 : 0);
    const tot = c.reduce((a, p) => a + w(p), 0); let r = Math.random() * tot;
    for (const p of c) { r -= w(p); if (r <= 0) return p; }
    return c[0];
  }

  make(type, used) {
    const g = this.g, city = g.city;
    if (type === 'commute') {
      const p = this.pickPlayer(used); if (!p) return null; used.add(p.name);
      const start = Math.round(rnd(19.5, 22.6) * 60);
      return { type, start, end: start + 45, hqId: p.team, player: p.name, title: `${p.name} 下班`, icon: '🚐', where: `${TEAMS.find(t => t.id === p.team).name} 总部` };
    }
    if (type === 'press') {
      const ids = [LEAGUE.hqA, LEAGUE.hqB, 'ARENA'];
      const hot = this.s.inventory.map(o => g.ui.locationOf(o));
      const hqId = hot.length && Math.random() < 0.6 ? hot[Math.random() * hot.length | 0] : ids[Math.random() * 3 | 0];
      const start = Math.round(rnd(19, 22) * 60);
      return { type, start, end: start + 50, hqId, title: '电视台记者采访', icon: '🎥', where: hqId === 'ARENA' ? LEAGUE.arena : `${TEAMS.find(t => t.id === hqId).name} 总部` };
    }
    if (type === 'rival') {
      const start = Math.round(rnd(19, 22.4) * 60);
      return { type, start, end: start + 45, title: `${this.s.rival.name} 的卡车`, icon: '⚔', where: '大路' };
    }
    if (type === 'streamer') {
      const start = Math.round(rnd(18.6, 22) * 60);
      return { type, start, end: start + 50, title: '街头主播路过', icon: '🔴', where: '两家总部之间' };
    }
    return null;
  }

  // ---------- 每帧 ----------
  update(dt) {
    const now = this.g.clockMin;
    for (const e of this.list) {
      if (!e.notified && now >= e.start - 25) { e.notified = true; this.g.ui.push(`${e.icon} ${clockStr(e.start)} · ${e.title}`, `地点：${e.where}${e.type === 'commute' ? '（门口会停一辆保姆车）' : ''}`, e.type === 'rival' ? 'bad' : ''); }
      if (!e.state && now >= e.start - (e.type === 'commute' ? 12 : 0)) this.begin(e);
      if (e.state === 'active') this['tick_' + e.type](e, dt, now);
      if (e.state === 'active' && now >= e.end) this.finish(e);
    }
  }

  begin(e) {
    e.state = 'active';
    const g = this.g, city = g.city;
    if (e.type === 'commute') {
      const hq = city.hq[e.hqId], team = TEAMS.find(t => t.id === e.hqId);
      // 保姆车先到，停在路边
      const vanPos = new THREE.Vector3(hq.cx + 7, 0, hq.face + hq.dir * 18.6);
      e.van = new Vehicle('van', { color: 0x16181d }); e.van.ai = false; e.van.npc = true;
      e.van.root.position.copy(vanPos); e.van.heading = hq.dir < 0 ? -Math.PI / 2 : Math.PI / 2; e.van.root.rotation.y = e.van.heading;
      g.addVehicle(e.van);
      e.phase = 'waiting';
    } else if (e.type === 'press') {
      const hq = city.hq[e.hqId];
      const base = hq.plaza.clone().add(new THREE.Vector3(hq.cx > 0 ? -10 : 10, 0, e.hqId === 'ARENA' ? 0 : hq.dir * 4));
      const rep = new Actor('michelle', { tint: new THREE.Color(0.95, 0.9, 1.0) });
      rep.root.position.copy(base); rep.play('idle', 0); this.add(rep.root);
      const cam = new Actor('xbot', { tint: new THREE.Color(0.35, 0.38, 0.45) });
      cam.root.position.copy(base).add(new THREE.Vector3(0, 0, hq.dir * 2.6)); this.add(cam.root);
      rep.root.rotation.y = Math.atan2(cam.root.position.x - base.x, cam.root.position.z - base.z);
      cam.root.rotation.y = rep.root.rotation.y + Math.PI;
      cam.play('idle', 0);
      // 摄像机 + 补光灯
      const rig = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.55), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6), toneMapped: false }));
      lamp.position.set(0, 0.22, 0.25); rig.add(body, lamp); rig.position.set(0.25, 1.55, 0.25); cam.root.add(rig);
      rep.root.add(nameTag('📺 SBC 뉴스', '#ffd34d'));
      e.actors = [rep, cam]; e.reporter = rep;
      g.crowd.attract(base, 60, 6, 'idle');
    } else if (e.type === 'rival') {
      const r = this.s.rival;
      e.truck = new Vehicle('ledtruck', { text: `${r.name} 응원단`, textColor: '#27e1ff', sub: '진짜 팬은 우리' });
      e.truck.ai = true; e.truck.npc = true; e.truck.path = g.truckRoute().reverse(); e.truck.loop = true; e.truck.aiSpeed = 7.5;
      e.truck.root.position.copy(e.truck.path[0]); g.addVehicle(e.truck);
      e.truck.root.add(Object.assign(nameTag(`⚔ ${r.name}`, '#27e1ff'), { position: new THREE.Vector3(0, 4.6, 0) }));
      e.rivalQ = 0.8 + Math.random() * 0.45 + this.s.week * 0.015 + (this.s.season - 1) * 0.05;
    } else if (e.type === 'streamer') {
      const a = new Actor('michelle', { tint: new THREE.Color(1, 0.85, 0.95) });
      const A = city.hq[LEAGUE.hqA], Bq = city.hq[LEAGUE.hqB];
      // 沿两家总部门前的人行道走一圈
      const path = [
        new THREE.Vector3(A.cx - 30, 0.18, A.face + A.dir * 15), new THREE.Vector3(A.cx + 30, 0.18, A.face + A.dir * 15),
        new THREE.Vector3(Bq.cx + 30, 0.18, Bq.face + Bq.dir * 15), new THREE.Vector3(Bq.cx - 30, 0.18, Bq.face + Bq.dir * 15),
        new THREE.Vector3(A.cx - 30, 0.18, A.face + A.dir * 15),
      ].map(pos => ({ pos }));
      a.root.position.copy(path[0].pos); this.add(a.root);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      stick.position.set(0.25, 1.6, 0.3); stick.rotation.x = -0.9; a.root.add(stick);
      const ph = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.5, 3), toneMapped: false }));
      ph.position.set(0.25, 1.95, 0.65); a.root.add(ph);
      a.root.add(nameTag('🔴 LIVE 街头主播', '#ff4f7a'));
      e.walker = new Walker(g, a, path, 1.1); e.actors = [a]; e.visited = new Set();
    }
  }

  // 选手下班：从大门走出 →（如果门口有针对他的道具，会停下来看）→ 上保姆车离开
  tick_commute(e, dt, now) {
    const g = this.g, hq = g.city.hq[e.hqId];
    if (e.phase === 'waiting' && now >= e.start) {
      e.phase = 'walking';
      const team = TEAMS.find(t => t.id === e.hqId);
      const a = new Actor('xbot', { tint: new THREE.Color(team.color).lerp(new THREE.Color(0.15, 0.15, 0.18), 0.35) });
      const door = new THREE.Vector3(hq.cx, 0.18, hq.face + hq.dir * 0.8);
      a.root.position.copy(door); this.add(a.root);
      a.root.add(nameTag(`★ ${e.player}`, team.color));
      e.actors = [a]; e.npc = a;
      const path = [{ pos: door.clone().add(new THREE.Vector3(0, 0, hq.dir * 2)) }];
      // 门口有针对他的道具 → 走过去看一眼
      const mine = g.day.events.filter(x => x.target === e.player && x.hq === e.hqId);
      const subj = g.props.subjects.find(su => mine.some(m => m.id === su.eventId) && su.obj.parent && !su.obj.isPoints);
      if (subj) {
        const sp = subj.obj.getWorldPosition(new THREE.Vector3());
        const stand = sp.clone().add(new THREE.Vector3(0, 0, hq.dir * 2.6)); stand.y = 0.18;
        const ev = mine.find(m => m.id === subj.eventId);
        path.push({ pos: stand, wait: 5, anim: ev.kind === 'support' ? 'agree' : 'headshake', face: sp, onArrive: () => this.react(e, ev, subj) });
      }
      path.push({ pos: new THREE.Vector3(hq.cx + 6, 0.18, hq.face + hq.dir * 15.5) });
      path.push({ pos: e.van.root.position.clone().setY(0.18).add(new THREE.Vector3(-1.2, 0, 0)) });
      e.walker = new Walker(g, a, path, 1.25);
      g.crowd.attract(door, 50, 8, 'cheer');
    }
    if (e.phase === 'walking') {
      e.walker.update(dt);
      if (e.walker.done) { e.phase = 'leaving'; g.scene.remove(e.npc.root); e.npc = null; e.van.ai = true; e.van.path = [new THREE.Vector3(hq.cx + (hq.dir < 0 ? -200 : 200), 0, e.van.root.position.z)]; e.van.aiSpeed = 9; }
    }
  }

  // 选手看到了你的道具：心态变化 + "名场面"
  react(e, ev, subj) {
    const g = this.g, p = this.s.players[e.player];
    const d = ev.kind === 'support' ? 6 : -6;
    noteInfluence(this.s, e.player, '下班时亲眼看到', ev.kind, d);
    p.mood = THREE.MathUtils.clamp(p.mood + d, 0, 100);
    e.reacted = { eventId: ev.id, kind: ev.kind, obj: subj.obj, until: g.time + 6 };
    (this.s.weekStory ||= []).push({ t: `${e.player} 下班时看到了你的${ev.kind === 'support' ? '应援' : '抗议'}，${ev.kind === 'support' ? '笑着点了点头' : '摇了摇头，表情很难看'}（心态 ${d > 0 ? '+' : ''}${d}）`, c: ev.kind === 'support' ? 'good' : 'bad', player: e.player });
    g.ui.push(`👀 ${e.player} 停下来看你的${ev.kind === 'support' ? '应援' : '抗议'}了！`, '快拍！这是名场面', 'big');
  }

  tick_press(e, dt) { for (const a of e.actors) a.update(dt); }

  tick_rival(e) { /* 卡车由 game 的 AI 车辆逻辑驱动 */ }

  tick_streamer(e, dt) {
    const g = this.g;
    e.walker.update(dt);
    if (e.walker.done) { e.walker.i = 0; e.walker.done = false; }
    const pos = e.actors[0].root.position;
    for (const su of g.props.subjects) {
      if (e.visited.has(su.eventId) || !su.obj.parent) continue;
      const sp = su.obj.getWorldPosition(new THREE.Vector3());
      if (sp.distanceTo(pos) < 12) {
        e.visited.add(su.eventId);
        const ev = g.day.events.find(x => x.id === su.eventId); if (!ev) continue;
        const fans = Math.round(80 + (g.itemOf(ev.item).impact) * 12 * (1 + this.s.fans / 50000));
        this.s.fans += fans; g.audio.coin();
        g.ui.push(`🔴 主播的直播间路过了你的现场`, `${g.itemOf(ev.item).name} 上了直播，粉丝 +${fans}`, 'good');
      }
    }
  }

  finish(e) {
    const g = this.g;
    e.state = 'done';
    if (e.type === 'rival') {
      const best = g.day.photos.filter(p => p.t >= e.start && p.t <= e.end).reduce((a, p) => Math.max(a, p.q), 0);
      const s = this.s;
      if (best > e.rivalQ) {
        const gain = Math.round(300 + s.rival.fans * 0.04); s.fans += gain; s.rival.fans = Math.round(s.rival.fans * 0.94);
        e.result = { win: true, gain }; g.ui.achieve('rival'); g.ui.push('⚔ 抢镜成功！', `你的现场照片比 ${s.rival.name} 的卡车更火，粉丝 +${gain}`, 'good');
      } else {
        s.rival.fans = Math.round(s.rival.fans * 1.08);
        e.result = { win: false }; g.ui.push('⚔ 被抢了风头', best ? `你这段时间最好的照片（${best.toFixed(2)}）没赢过对手（${e.rivalQ.toFixed(2)}）` : '这段时间你一张照片都没拍', 'bad');
      }
      (s.weekStory ||= []).push({ t: e.result.win ? `你在和 ${s.rival.name} 的抢镜对决中赢了` : `${s.rival.name} 的卡车抢走了当晚的热度`, c: e.result.win ? 'good' : 'bad' });
      if (e.truck) { g.removeVehicle(e.truck); e.truck = null; }
    }
    if (e.type === 'press' || e.type === 'streamer') { for (const a of e.actors || []) g.scene.remove(a.root); e.actors = []; }
    if (e.type === 'commute') { if (e.npc) g.scene.remove(e.npc.root); if (e.van) { g.removeVehicle(e.van); e.van = null; } }
  }

  // ---------- 拍照用：画面里的特殊元素 ----------
  photoTags(frustum, cam, inFrame) {
    const out = { tags: [], reaction: null, star: null, press: false };
    for (const e of this.list) {
      if (e.state !== 'active') continue;
      if (e.type === 'commute' && e.npc) {
        const head = e.npc.root.position.clone().setY(e.npc.root.position.y + 1.6);
        if (frustum.containsPoint(head) && head.distanceTo(cam.position) < 40) {
          out.tags.push('star'); out.star = e.player;
          if (e.reacted && this.g.time < e.reacted.until && inFrame(e.reacted.obj)) { out.tags.push('reaction'); out.reaction = { player: e.player, eventId: e.reacted.eventId }; }
        }
      }
      if (e.type === 'press' && e.reporter) {
        const head = e.reporter.root.position.clone().setY(1.6);
        if (frustum.containsPoint(head) && head.distanceTo(cam.position) < 40) { out.tags.push('press'); out.press = true; }
      }
    }
    return out;
  }

  hudList() {
    const now = this.g.clockMin;
    return this.list.filter(e => e.state !== 'done' && now >= e.start - 60).map(e => ({ icon: e.icon, title: e.title, where: e.where, time: clockStr(e.start), live: e.state === 'active', type: e.type, pos: this.markerPos(e) }));
  }

  markerPos(e) {
    const c = this.g.city;
    if (e.type === 'commute' || e.type === 'press') return c.hq[e.hqId].plaza;
    if (e.type === 'rival' && e.truck) return e.truck.root.position;
    if (e.type === 'streamer' && e.actors?.[0]) return e.actors[0].root.position;
    return null;
  }

  // 主播在附近时可以接受采访
  nearStreamer(pos) {
    const e = this.list.find(x => x.type === 'streamer' && x.state === 'active' && !x.interviewed);
    if (!e || !e.actors?.[0]) return null;
    return e.actors[0].root.position.distanceTo(pos) < 4 ? e : null;
  }
}
