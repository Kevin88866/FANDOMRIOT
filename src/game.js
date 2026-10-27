import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Audio } from './engine/audio.js';
import { City } from './world/city.js';
import { loadActors } from './world/actors.js';
import { Crowd } from './world/npc.js';
import { Props } from './world/props.js';
import { FX } from './fx/fx.js';
import { Player } from './player/player.js';
import { Vehicle } from './player/vehicle.js';
import { PhotoMode } from './player/photo.js';
import { Placer } from './player/placer.js';
import { Opportunities, Walker } from './world/opportunities.js';
import { Actor } from './world/actors.js';
import { ITEMS, TEAMS, VEHICLES, LEAGUE, BALANCE as B } from './content/data.js';
import * as Sim from './sim/sim.js';
import { UI } from './ui/ui.js';

export class Game {
  constructor() {
    this.renderer = new Renderer(document.getElementById('gl'));
    this.scene = this.renderer.scene; this.camera = this.renderer.camera;
    this.audio = new Audio();
    this.time = 0; this.charScale = 1;
    this.input = { up: 0, down: 0, left: 0, right: 0, run: 0, brake: 0, mouseActive: false };
    this.mode = 'menu';           // menu | play | photo | place | ui
    this.vehicles = [];           // 场景内车辆（玩家载具、订购卡车、警车）
    this.ui = new UI(this);
  }

  async boot() {
    const bar = document.getElementById('lbar'), txt = document.getElementById('ltext');
    const step = (p, t) => { bar.style.width = (p * 100) + '%'; txt.textContent = t; };
    step(0.05, '加载天空…');
    await this.renderer.loadEnv('assets/hdr/venice_sunset_1k.hdr');
    step(0.2, '加载角色…');
    await loadActors(p => step(0.2 + p * 0.5, '加载角色…'));
    step(0.75, '建造首尔街区…');
    await new Promise(r => setTimeout(r, 30));
    this.city = new City(this.scene);
    this.city.finalizeTrees();
    this.fx = new FX(this.scene, this);
    this.props = new Props(this);
    step(0.85, '路人出门中…');
    this.crowd = new Crowd(this, 28);
    this.player = new Player(this);
    this.photo = new PhotoMode(this);
    this.placer = new Placer(this);
    this.opps = new Opportunities(this);
    this.player.pos.set(-120, 0.18, 28 - 13);
    this.renderer.applyEnvIntensity();
    step(0.95, '编译着色器…');
    this.renderer.setTime(19);
    this.renderer.r.compile(this.scene, this.camera);
    this.bindInput();
    step(1, '完成');
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
    const l = document.getElementById('loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 800);
    this.ui.title();
  }

  // ================= 输入 =================
  bindInput() {
    const map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run', Space: 'brake' };
    addEventListener('keydown', e => {
      this.audio.init();
      if (map[e.code]) { this.input[map[e.code]] = 1; if (e.code === 'Space') e.preventDefault(); }
      if (e.repeat) return;
      if (this.mode === 'play') {
        if (e.code === 'KeyE') this.interact();
        if (e.code === 'KeyF') this.toggleVehicle();
        if (e.code === 'KeyC') this.enterPhoto();
        if (e.code === 'Tab') { e.preventDefault(); this.ui.inventory(); }
        if (e.code === 'KeyM') this.bigMap = !this.bigMap;
        if (e.code === 'KeyH') document.getElementById('objective').classList.toggle('collapsed');
        if (e.code === 'Escape') this.ui.pause();
      } else if (this.mode === 'photo') {
        if (e.code === 'KeyC' || e.code === 'Escape') this.exitPhoto();
      } else if (this.mode === 'place') {
        if (e.code === 'KeyQ') this.placer.rotate(0.2618);
        if (e.code === 'KeyE') this.placer.rotate(-0.2618);
        if (e.code === 'Escape') this.placer.cancel();
      } else if (this.mode === 'ui' && e.code === 'Escape') this.ui.escape?.();
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', e => { if (map[e.code]) this.input[map[e.code]] = 0; });
    const cv = this.renderer.r.domElement;
    cv.addEventListener('mousedown', e => {
      this.audio.init();
      if (this.mode === 'place') return this.placer.click(e.button);
      if (this.mode === 'play' || this.mode === 'photo') {
        if (document.pointerLockElement !== cv) { cv.requestPointerLock?.(); return; }
        if (this.mode === 'photo') { if (e.button === 0) this.photo.shoot(); else if (e.button === 2) this.exitPhoto(); }
      }
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== cv) return;
      if (this.mode === 'play') { this.player.look(e.movementX, e.movementY); this.input.mouseActive = true; clearTimeout(this.mt); this.mt = setTimeout(() => this.input.mouseActive = false, 1200); }
      else if (this.mode === 'photo') this.photo.look(e.movementX, e.movementY);
    });
    addEventListener('wheel', e => { if (this.mode === 'place') this.placer.rotate(Math.sign(e.deltaY) * 0.2618); else if (this.mode === 'photo') this.photo.zoom(e.deltaY); else if (this.mode === 'play') this.player.camDist = THREE.MathUtils.clamp(this.player.camDist + e.deltaY * 0.005, 2.5, 18); });
  }

  releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
  lockMouse() { this.renderer.r.domElement.requestPointerLock?.(); }

  // ================= 主循环 =================
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.time += dt;
    if (this.mode === 'play' || this.mode === 'photo') this.tickDay(dt);
    if (this.mode === 'play') this.player.update(dt, this.input);
    else this.player.actor.update(dt);
    for (const v of this.vehicles) {
      if (v.ai) this.updateAIVehicle(v, dt);
      v.update(dt, this.time);
    }
    this.crowd.update(dt);
    this.props.update(dt, this.time);
    this.fx.update(dt);
    this.updateTimers(dt);
    this.updateGuards(dt);
    this.updateFade(dt);
    if (this.mode === 'place') this.placer.update();
    else if (this.mode === 'photo') this.photo.updateCamera(this.camera);
    else if (this.mode === 'menu' || (this.mode === 'ui' && this.ui.cinematic)) this.cinematicCam(dt);
    else this.player.updateCamera(this.camera, dt);
    const focus = this.player.vehicle ? this.player.vehicle.root.position : this.player.pos;
    this.renderer.followShadow(focus);
    if (this.mode === 'play') this.updatePrompt();
    if (this.state && (this.mode === 'play' || this.mode === 'photo')) this.ui.hud();
    const v = this.player.vehicle; this.audio.setEngine(!!v && this.mode !== 'ui', v ? Math.abs(v.speed) : 0);
    this.renderer.render();
    requestAnimationFrame(t => this.loop(t));
  }

  cinematicCam(dt) {
    // 沿大路缓慢移动的航拍镜头，看向两栋总部
    const t = this.time * 0.04;
    this.camera.position.set(Math.sin(t) * 70, 14 + Math.sin(t * 0.7) * 4, 30);
    this.camera.lookAt(Math.sin(t) * 70 * 0.4, 16, 30 + Math.sin(t * 0.5) * 12);
    if (this.renderer.hour !== 21) { this.renderer.setTime(21); this.city.updateNight(this.renderer.night); }
  }

  shake(amount, pos) {
    const d = pos ? pos.distanceTo(this.camera.position) : 0;
    this.player.shake = Math.max(this.player.shake || 0, amount * Math.max(0.1, 1 - d / 120));
  }

  // ================= 一天的流程 =================
  startDay() {
    const s = this.state;
    this.day = { photos: [], events: [], startMin: 18 * 60 };
    this.clockMin = 18 * 60;
    this.props.clearAll(); this.fx.clearDecals();
    for (const v of this.vehicles.slice()) this.removeVehicle(v);
    this.city.setBillboard(LEAGUE.billboard, '#27e1ff', `WEEK ${s.week}`);
    for (const id in this.city.hq) { const hq = this.city.hq[id]; hq.used = 0; hq.sign.position.copy(hq.signHome); hq.sign.rotation.set(0, hq.faceRy ?? hq.sign.rotation.y, 0); hq.sign.userData.vel = null; hq.sign.visible = true; }
    this.player.vehicle && this.player.exit();
    // 自己的载具停在家门口
    const home = this.city.points.home.pos;
    this.player.pos.set(home.x + 2, 0.18, home.z - 1);
    this.player.yaw = Math.PI * 0.9; this.player.facing = Math.PI; this.player.snapCam = true;
    const vt = s.vehicle;
    const own = new Vehicle(vt === 'van' ? 'van' : vt === 'pickup' ? 'pickup' : 'scooter', { speed: VEHICLES.find(v => v.id === vt).speed });
    own.root.position.set(home.x - 3, 0, home.z - 5); own.heading = Math.PI / 2; own.root.rotation.y = own.heading; own.owned = true;
    this.addVehicle(own); this.myRide = own;
    this.crowd.list.forEach(p => { p.state = 'walk'; });
    this.guards = [];
    s.weekStory = [];
    this.opps.plan();
    this.mode = 'play'; this.ui.showHud(true);
    this.lockMouse();
    this.toast(`第 ${s.week} 周 · 行动日开始（18:00 - 24:00）`, 'big');
    if (s.week === 1 && s.season === 1) setTimeout(() => this.toast('先去「应援 & 抗议用品店」买东西（地图上的粉色点）', ''), 2500);
  }

  tickDay(dt) {
    this.clockMin += dt / B.realSecPerGameMin;
    this.renderer.setTime(this.clockMin / 60);
    this.city.updateNight(this.renderer.night);
    this.opps.update(dt);
    if (this.clockMin >= 24 * 60 && !this.ending) { this.toast('已经午夜了，回家发帖吧', 'big'); this.endDay(); }
  }

  endDay() {
    if (this.ending) return; this.ending = true;
    if (this.mode === 'photo') this.exitPhoto();
    if (this.mode === 'place') this.placer.cancel();
    for (const e of this.opps.list) if (e.state === 'active') this.opps.finish(e);
    this.fade(() => { this.ending = false; this.mode = 'ui'; this.ui.showHud(false); this.releaseMouse(); this.ui.posting(); });
  }

  // 黑场转场：在后期着色器里压暗（不用 DOM 遮罩，避免部分显卡驱动下合成层出问题）
  fade(fn) { this.fading = { t: 0, fn, done: false }; }
  updateFade(dt) {
    const f = this.fading; if (!f) return;
    f.t += dt;
    if (!f.done && f.t >= 0.6) { f.done = true; f.fn(); }
    const k = f.t < 0.6 ? f.t / 0.6 : Math.max(0, 1 - (f.t - 0.6) / 0.6);
    this.renderer.grade.uniforms.fade.value = k;
    if (f.t > 1.2) { this.fading = null; this.renderer.grade.uniforms.fade.value = 0; }
  }

  toast(text, cls = '') { this.ui.toast(text, cls); }
  itemOf(id) { return ITEMS.find(i => i.id === id); }

  // ================= 车辆 =================
  addVehicle(v) { this.scene.add(v.root); this.vehicles.push(v); return v; }
  removeVehicle(v) { this.scene.remove(v.root); this.vehicles = this.vehicles.filter(x => x !== v); if (this.player.vehicle === v) this.player.exit(); }

  toggleVehicle() {
    const p = this.player;
    if (p.vehicle) { if (Math.abs(p.vehicle.speed) > 3) return this.toast('先停车（空格刹车）'); p.exit(); return; }
    const near = this.vehicles.filter(v => !v.ai && !v.npc).map(v => [v, v.root.position.distanceTo(p.pos)]).filter(([, d]) => d < 4.5).sort((a, b) => a[1] - b[1])[0];
    if (near) { p.enter(near[0]); this.audio.click(); }
  }

  updateAIVehicle(v, dt) {
    const done = v.followPath(v.path, dt, this.city, v.aiSpeed || 8);
    if (done && v.loop) v.pathI = 0;
    if (v.onLoop && done) v.onLoop();
  }

  // 订购的卡车：沿大路两侧来回绕圈经过两栋总部
  truckRoute() {
    const zA = 30 - 7, zB = 30 + 7;   // 大路两条车道（右侧通行）
    return [[-150, zA], [150, zA], [150, 90 - 4], [150, zB], [-150, zB], [-150, -30 + 4]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  }

  // ================= 互动 =================
  nearestPoint() {
    const p = this.player.vehicle ? this.player.vehicle.root.position : this.player.pos;
    let best = null, bd = 1e9;
    for (const k in this.city.points) {
      const pt = this.city.points[k]; if (!pt.r) continue;
      const d = Math.hypot(pt.pos.x - p.x, pt.pos.z - p.z);
      const r = this.player.vehicle ? pt.r + 10 : pt.r;
      if (d < r && d < bd) { bd = d; best = pt; }
    }
    return best;
  }

  updatePrompt() {
    const el = document.getElementById('prompt');
    const pt = this.nearestPoint(); let txt = '';
    if (!this.player.vehicle && this.opps.nearStreamer(this.player.pos)) txt = '<kbd>E</kbd>接受街头主播的直播采访';
    else if (pt) {
      if (pt.kind === 'hq') txt = this.player.vehicle?.order ? `<kbd>E</kbd>把卡车停在 ${pt.label} 门口展示` : `<kbd>E</kbd>在 ${pt.label} 使用道具`;
      else if (pt.kind === 'shop') txt = `<kbd>E</kbd>进入 ${pt.label}`;
      else if (pt.kind === 'garage') txt = `<kbd>E</kbd>${pt.label}`;
      else if (pt.kind === 'home') txt = `<kbd>E</kbd>回家（结束今天，去发帖）`;
    } else if (!this.player.vehicle) {
      const nv = this.vehicles.find(v => !v.ai && !v.npc && v.root.position.distanceTo(this.player.pos) < 4.5);
      if (nv) txt = `<kbd>F</kbd>上车`;
    } else txt = '';
    el.innerHTML = txt; el.classList.toggle('hidden', !txt);
  }

  interact() {
    const st = !this.player.vehicle && this.opps.nearStreamer(this.player.pos);
    if (st) return this.ui.streamerInterview(st);
    const pt = this.nearestPoint(); if (!pt) return;
    this.audio.click();
    if (pt.kind === 'shop') return this.ui.shop();
    if (pt.kind === 'garage') return this.ui.garage();
    if (pt.kind === 'home') return this.ui.confirm('结束今天回家？没用掉的道具会留到下周。', () => this.endDay());
    if (pt.kind === 'hq') {
      const v = this.player.vehicle;
      if (v && v.order) return this.parkTruck(v, pt.id);
      if (v) return this.toast('先下车（F）');
      return this.ui.useItems(pt.id);
    }
  }

  // ================= 道具执行 =================
  hqFor(team) { return this.city.hq[team] ? team : null; }

  newEvent(order, hqId) {
    const s = this.state, F = s.flags ||= {};
    // 剧情约束：休战期间骂他 / 违反赞助合同
    if (order.kind === 'attack' && F.truce?.name === order.target) {
      const l = Math.round(s.fans * 0.1); s.fans -= l; delete F.truce;
      this.ui.push('💔 你违背了休战承诺', `${order.target} 把你们的私信公开了，粉丝 -${l}`, 'bad');
      (s.weekStory ||= []).push({ t: `你违背了和 ${order.target} 的休战约定，被骂"出尔反尔"`, c: 'bad' });
    }
    if (F.noExtreme && (order.item === 'eggs' || order.item === 'graffiti')) {
      s.money -= 4000000; delete F.noExtreme;
      this.ui.push('📄 违反赞助合同', 'BOLT 要求退还双倍预付款：-₩4,000,000', 'bad');
    }
    const ev = { id: 'e' + Math.random().toString(36).slice(2, 8), item: order.item, target: order.target, kind: order.kind, text: order.text, hq: hqId, time: this.clockMin };
    Sim.applyAction(this.state, ev);
    const cost = ITEMS.find(i => i.id === order.item).cleanup;
    if (cost) { this.state.cleanupDue = (this.state.cleanupDue || 0) + cost; setTimeout(() => this.toast(`物业会找你要清洁费 ₩${cost.toLocaleString()}（周结算扣除）`, 'bad'), 2500); }
    this.day.events.push(ev);
    if (ev.backfire) setTimeout(() => this.toast(`${order.target} 好像被激励了……（知耻后勇）`, ''), 1500);
    return ev;
  }

  consume(order) { const inv = this.state.inventory; const i = inv.indexOf(order); if (i >= 0) inv.splice(i, 1); }

  useItem(order, hqId) {
    const item = ITEMS.find(i => i.id === order.item), hq = this.city.hq[hqId];
    const support = order.kind === 'support';
    this.consume(order);
    if (Placer.supports(item.prop)) return this.placer.start(order, hqId, item);
    const ev = this.newEvent(order, hqId);
    const label = `${item.name}→${order.target}`;
    const face = hq.faceRy;
    switch (item.prop) {
      case 'wreath': {
        const n = 3; let last;
        for (let i = 0; i < n; i++) { const slot = hq.slots[hq.used++ % hq.slots.length]; last = this.props.wreath(slot, face, order.text, order.kind); this.popIn(last, i * 0.25); this.props.addSubject(last, { eventId: ev.id, label, text: true, weight: 1 }); }
        break;
      }
      case 'flowers': {
        for (let i = 0; i < 3; i++) { const slot = hq.slots[hq.used++ % hq.slots.length]; const f = this.props.flowers(slot, face, order.text); this.popIn(f, i * 0.2); this.props.addSubject(f, { eventId: ev.id, label, text: true }); }
        break;
      }
      case 'banner': { const b = this.props.banner(hq.bannerPos, face, order.text, order.kind); this.popIn(b); this.props.addSubject(b, { eventId: ev.id, label, text: true, weight: 1.1 }); break; }
      case 'fireworks': this.fireworks(hq, ev, label); break;
      case 'drone': {
        const d = this.props.droneShow(new THREE.Vector3(hq.cx, 45, hq.face + hq.dir * 10), order.text, support ? '#ff7ab0' : '#ff2d55');
        d.rotation.y = face; this.props.addSubject(d, { eventId: ev.id, label, text: true, glow: true, weight: 1.5 });
        this.droneShowT = { obj: d, until: this.time + 40 };
        this.audio.whoosh(); break;
      }
      case 'graffiti': { const g = this.props.graffiti(hq, order.text); this.props.addSubject(g, { eventId: ev.id, label, text: true, weight: 1.3 }); this.audio.noise(1.5, { f: 5000, type: 'highpass', gain: 0.25 }); break; }
      case 'eggs': this.throwEggs(hq, ev, label); break;
      case 'rally': this.rally(hq, ev, label, order); break;
      case 'billboard': {
        this.props.billboardOrder(order.text);
        this.props.addSubject(this.city.billboard, { eventId: ev.id, label, text: true, glow: true, weight: 1.4 });
        break;
      }
    }
    this.crowd.attract(hq.plaza, 80, item.prop === 'rally' ? 22 : 12, support ? 'cheer' : 'angry');
    this.toast(`${item.name} 已布置！掏出手机（C）拍照`, 'good');
    this.ui.saveSoon();
  }

  // 摆放完成：生成事件，按排面分加权拍照主体
  finishPlacement(c, sc) {
    const { order, hqId, hq, item, placed } = c;
    const ev = this.newEvent(order, hqId);
    ev.layout = sc.score; ev.blockDoor = sc.blockDoor;
    const label = `${item.name}→${order.target}`;
    for (const o of placed) this.props.addSubject(o, { eventId: ev.id, label, text: true, weight: item.prop === 'banner' ? 1.1 : item.prop === 'rally' ? 1.2 : 1, layout: sc.score });
    this.crowd.attract(hq.plaza, 80, item.prop === 'rally' ? 22 : 12, order.kind === 'support' ? 'cheer' : 'angry');
    const stars = '★'.repeat(Math.round((sc.score - 0.6) / 0.65 * 5)).padEnd(5, '☆');
    if (sc.score >= 1.18) this.ui.achieve('layout');
    this.toast(`${item.name} 已布置 · 排面 ${stars}　掏出手机（C）拍照`, 'good');
    if (sc.blockDoor) {
      this.state.heat = Math.min(120, this.state.heat + 5);
      this.ui.push('🚪 你把大门堵住了', '曝光 +30%，争议度 +5。保安一会儿会出来清理 —— 那也是名场面', 'bad');
      setTimeout(() => this.callGuard(hq, placed, ev), 20000);
    }
    this.mode = 'play'; this.ui.showHud(true); this.lockMouse(); this.player.snapCam = true;
    this.ui.saveSoon();
  }

  cancelPlacement(c) {
    this.state.inventory.push(c.order);
    this.mode = 'play'; this.ui.showHud(true); this.lockMouse(); this.player.snapCam = true;
    this.toast('已取消，道具退回背包');
  }

  // 保安出来清理堵门的道具（期间拍到就是名场面）
  callGuard(hq, pieces, ev) {
    if (!this.day || !pieces.some(p => p.parent)) return;
    const a = new Actor('soldier', { tint: new THREE.Color(0.55, 0.6, 0.7) });
    const door = new THREE.Vector3(hq.cx, 0.18, hq.face + hq.dir * 0.8);
    a.root.position.copy(door); this.scene.add(a.root);
    const near = pieces.filter(p => p.parent && Math.abs(p.position.x - hq.cx) < 4 && (p.position.z - hq.face) * hq.dir < 5);
    const path = near.map(p => ({ pos: p.position.clone().add(new THREE.Vector3(0, 0, -hq.dir * 0.9)).setY(0.18), wait: 2.6, anim: 'headshake', face: p.position.clone(), onArrive: () => { this.lastSpectacle = { t: this.time, pos: p.position.clone().setY(1.5) }; setTimeout(() => this.removeProp(p), 2400); } }));
    path.push({ pos: door });
    this.guards.push({ w: new Walker(this, a, path, 1.4), a });
    this.ui.push('👮 保安出来清理大门口了', '现在拍照是名场面！', 'big');
    this.ui.achieve('door');
    (this.state.weekStory ||= []).push({ t: `${hq.team.name} 的保安清理了你堵在门口的道具`, c: 'bad' });
  }

  updateGuards(dt) {
    for (const gd of this.guards || []) { gd.w.update(dt); if (gd.w.done && !gd.gone) { gd.gone = true; this.scene.remove(gd.a.root); } }
    if (this.guards) this.guards = this.guards.filter(g => !g.gone);
  }

  removeProp(p) {
    (this.anims ||= []).push({ obj: p, t: 0, s: p.scale.clone(), out: true });
    setTimeout(() => { this.scene.remove(p); this.props.list = this.props.list.filter(x => x !== p); this.props.subjects = this.props.subjects.filter(su => su.obj !== p); }, 500);
  }

  popIn(obj, delay = 0) { const s = obj.scale.clone(); obj.scale.setScalar(0.001); (this.anims ||= []).push({ obj, t: -delay, s }); }

  updateTimers(dt) {
    for (const a of this.anims || []) {
      a.t += dt; const k = THREE.MathUtils.clamp(a.t / 0.45, 0, 1);
      const e = a.out ? 1 - k : 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
      a.obj.scale.copy(a.s).multiplyScalar(Math.max(0.001, a.out || k > 0 ? e : 0.001));
    }
    this.anims = (this.anims || []).filter(a => a.t < 0.5);
    if (this.droneShowT && this.time < this.droneShowT.until && this.droneShowT.obj.userData.formed) this.lastSpectacle = { t: this.time, pos: this.droneShowT.obj.position.clone() };
  }

  throwEggs(hq, ev, label) {
    let i = 0;
    const throwOne = () => {
      if (i++ >= 8) return;
      const target = new THREE.Vector3(hq.cx + (Math.random() - 0.5) * 16, 2 + Math.random() * 6, hq.face);
      const n = new THREE.Vector3(0, 0, hq.dir);
      this.player.actor.play('agree', 0.1);
      setTimeout(() => { this.fx.splat(target, n); this.audio.splat(); }, 350);
      setTimeout(throwOne, 380);
    };
    throwOne();
    // 用一个隐形对象当拍照主体（蛋液所在的墙面）
    const dummy = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
    dummy.position.set(hq.cx, 6, hq.face); this.props.place(dummy);
    this.props.addSubject(dummy, { eventId: ev.id, label, weight: 0.9 });
  }

  // 粉丝集会：一排举牌的人 + 围观
  rally(hq, ev, label, order) {
    const zone = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 8), new THREE.MeshBasicMaterial({ visible: false }));
    zone.position.copy(hq.plaza).setY(2); this.props.place(zone);
    for (let i = 0; i < 8; i++) {
      const p = hq.plaza.clone().add(new THREE.Vector3(-9 + i * 2.5, 0, hq.dir * (1 + (i % 2))));
      const sign = this.props.picket(p, hq.faceRy + Math.PI, order.text, order.kind);
      this.popIn(sign, i * 0.1);
    }
    this.props.addSubject(zone, { eventId: ev.id, label, text: true, weight: 1.2 });
  }

  fireworks(hq, ev, label) {
    const base = hq.plaza.clone().add(new THREE.Vector3(0, 0, hq.dir * 2));
    const holder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 }));
    holder.position.copy(base).setY(0.43); this.props.place(holder);
    const sky = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 4), new THREE.MeshBasicMaterial({ visible: false }));
    sky.position.copy(base).setY(28); this.props.place(sky);
    this.props.addSubject(sky, { eventId: ev.id, label, glow: true, weight: 1.2 });
    for (let i = 0; i < 16; i++) setTimeout(() => { this.fx.firework(base); setTimeout(() => this.lastSpectacle = { t: this.time, pos: base.clone().setY(30) }, 1000); }, i * 550);
  }

  enterPhoto() {
    if (this.player.vehicle && Math.abs(this.player.vehicle.speed) > 2) return;
    this.mode = 'photo'; this.photo.enter();
    document.getElementById('prompt').classList.add('hidden');
  }
  exitPhoto() { this.photo.exit(); this.mode = 'play'; this.player.snapCam = true; }

  // ================= 卡车订单 =================
  spawnOrderTruck(order, driver) {
    const item = ITEMS.find(i => i.id === order.item);
    const support = order.kind === 'support';
    const v = new Vehicle(support ? 'coffee' : 'ledtruck', { text: order.text, textColor: support ? '#ff7ab0' : '#ff2d2d', sub: support ? `♥ ${order.target} 응원해요 ♥` : `${order.target} OUT` });
    this.consume(order);
    v.order = order;
    const g = this.city.points.garage.pos;
    if (driver) {
      v.ai = true; v.path = this.truckRoute(); v.loop = true; v.aiSpeed = 7;
      v.root.position.copy(v.path[0]); v.heading = Math.PI / 2;
      const team = this.state.players[order.target].team; const hqId = this.city.hq[team] ? team : 'ARENA';
      const ev = this.newEvent(order, hqId);
      this.props.addSubject(v.root, { eventId: ev.id, label: `${item.name}→${order.target}`, text: true, glow: true, weight: 1.3, vehicle: v });
      this.addVehicle(v);
      this.crowd.attract(new THREE.Vector3(0, 0, 30), 90, 10, support ? 'cheer' : 'angry');
      this.toast('司机已出发！卡车会沿大路来回经过两家总部，去路边拍它吧', 'good');
    } else {
      v.root.position.set(g.x, 0, g.z - 9); v.heading = -Math.PI / 2; v.root.rotation.y = v.heading;
      this.addVehicle(v); this.player.enter(v);
      this.toast('开着卡车去目标总部门口，按 E 停车展示', 'good');
    }
    this.ui.saveSoon();
  }

  parkTruck(v, hqId) {
    if (Math.abs(v.speed) > 2) return this.toast('先减速停下');
    const order = v.order; const item = ITEMS.find(i => i.id === order.item);
    const ev = this.newEvent(order, hqId);
    v.order = null; v.shown = true;
    this.player.exit();
    this.props.addSubject(v.root, { eventId: ev.id, label: `${item.name}→${order.target}`, text: true, glow: true, weight: 1.4, vehicle: v });
    this.crowd.attract(v.root.position, 80, 12, order.kind === 'support' ? 'cheer' : 'angry');
    this.toast('卡车就位！LED 屏亮起来了 —— 拍照！', 'good');
  }
}
