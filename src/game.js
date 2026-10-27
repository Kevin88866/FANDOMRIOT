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
import { ITEMS, TEAMS, VEHICLES, BALANCE as B } from './content/data.js';
import * as Sim from './sim/sim.js';
import { UI } from './ui/ui.js';

export class Game {
  constructor() {
    this.renderer = new Renderer(document.getElementById('gl'));
    this.scene = this.renderer.scene; this.camera = this.renderer.camera;
    this.audio = new Audio();
    this.time = 0; this.charScale = 1;
    this.input = { up: 0, down: 0, left: 0, right: 0, run: 0, brake: 0, mouseActive: false };
    this.mode = 'menu';           // menu | play | photo | aim | ui
    this.vehicles = [];           // 场景内车辆（玩家载具、订购卡车、警车）
    this.police = [];
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
        if (e.code === 'Escape') this.ui.pause();
      } else if (this.mode === 'photo' || this.mode === 'aim') {
        if (e.code === 'KeyC' || e.code === 'Escape') this.exitPhoto();
      } else if (this.mode === 'ui' && e.code === 'Escape') this.ui.escape?.();
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', e => { if (map[e.code]) this.input[map[e.code]] = 0; });
    const cv = this.renderer.r.domElement;
    cv.addEventListener('mousedown', e => {
      this.audio.init();
      if (this.mode === 'play' || this.mode === 'photo' || this.mode === 'aim') {
        if (document.pointerLockElement !== cv) { cv.requestPointerLock?.(); return; }
        if (this.mode === 'photo') { if (e.button === 0) this.photo.shoot(); else if (e.button === 2) this.exitPhoto(); }
        else if (this.mode === 'aim') { if (e.button === 0) this.fireRocket(); else if (e.button === 2) this.exitPhoto(); }
      }
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== cv) return;
      if (this.mode === 'play') { this.player.look(e.movementX, e.movementY); this.input.mouseActive = true; clearTimeout(this.mt); this.mt = setTimeout(() => this.input.mouseActive = false, 1200); }
      else if (this.mode === 'photo' || this.mode === 'aim') this.photo.look(e.movementX, e.movementY);
    });
    addEventListener('wheel', e => { if (this.mode === 'photo' || this.mode === 'aim') this.photo.zoom(e.deltaY); else if (this.mode === 'play') this.player.camDist = THREE.MathUtils.clamp(this.player.camDist + e.deltaY * 0.005, 2.5, 18); });
  }

  releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
  lockMouse() { this.renderer.r.domElement.requestPointerLock?.(); }

  // ================= 主循环 =================
  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.time += dt;
    if (this.mode === 'play' || this.mode === 'photo' || this.mode === 'aim') this.tickDay(dt);
    if (this.mode === 'play') this.player.update(dt, this.input);
    else this.player.actor.update(dt);
    for (const v of this.vehicles) {
      if (v.ai) this.updateAIVehicle(v, dt);
      v.update(dt, this.time);
    }
    this.updatePolice(dt);
    this.crowd.update(dt);
    this.props.update(dt, this.time);
    this.fx.update(dt);
    this.updateTimers(dt);
    if (this.mode === 'photo' || this.mode === 'aim') this.photo.updateCamera(this.camera);
    else if (this.mode === 'menu' || (this.mode === 'ui' && this.ui.cinematic)) this.cinematicCam(dt);
    else this.player.updateCamera(this.camera, dt);
    const focus = this.player.vehicle ? this.player.vehicle.root.position : this.player.pos;
    this.renderer.followShadow(focus);
    if (this.mode === 'play') this.updatePrompt();
    if (this.state && (this.mode === 'play' || this.mode === 'photo' || this.mode === 'aim')) this.ui.hud();
    const v = this.player.vehicle; this.audio.setEngine(!!v && this.mode !== 'ui', v ? Math.abs(v.speed) : 0);
    this.renderer.render();
    requestAnimationFrame(t => this.loop(t));
  }

  cinematicCam(dt) {
    const t = this.time * 0.05;
    this.camera.position.set(Math.sin(t) * 55, 22 + Math.sin(t * 0.7) * 6, 30 + Math.cos(t) * 55);
    this.camera.lookAt(0, 14, 30);
  }

  shake(amount, pos) {
    const d = pos ? pos.distanceTo(this.camera.position) : 0;
    this.player.shake = Math.max(this.player.shake || 0, amount * Math.max(0.1, 1 - d / 120));
  }

  // ================= 一天的流程 =================
  startDay() {
    const s = this.state;
    this.day = { photos: [], events: [], startMin: 18 * 60, police: false };
    this.clockMin = 18 * 60;
    this.props.clearAll(); this.fx.clearDecals();
    for (const v of this.vehicles.slice()) this.removeVehicle(v);
    this.police = [];
    this.city.setBillboard('LCK 2026 · 롤 파크', '#27e1ff', `WEEK ${s.week}`);
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
    this.mode = 'play'; this.ui.showHud(true);
    this.lockMouse();
    this.toast(`第 ${s.week} 周 · 行动日开始（18:00 - 24:00）`, 'big');
    if (s.week === 1 && s.season === 1) setTimeout(() => this.toast('先去「应援 & 抗议用品店」买东西（地图上的粉色点）', ''), 2500);
  }

  tickDay(dt) {
    this.clockMin += dt / B.realSecPerGameMin;
    this.renderer.setTime(this.clockMin / 60);
    this.city.updateNight(this.renderer.night);
    if (this.clockMin >= 24 * 60 && !this.ending) { this.toast('已经午夜了，回家发帖吧', 'big'); this.endDay(); }
  }

  endDay() {
    if (this.ending) return; this.ending = true;
    if (this.mode === 'photo' || this.mode === 'aim') this.exitPhoto();
    // 被追捕中回家：逃脱
    if (this.police.length) { this.clearPolice(); this.toast('你甩掉了警察（暂时）', 'good'); }
    this.fade(() => { this.ending = false; this.mode = 'ui'; this.ui.showHud(false); this.releaseMouse(); this.ui.posting(); });
  }

  fade(fn) { const f = document.getElementById('fade'); f.style.opacity = 1; setTimeout(() => { fn(); f.style.opacity = 0; }, 650); }

  toast(text, cls = '') { this.ui.toast(text, cls); }

  // ================= 车辆 =================
  addVehicle(v) { this.scene.add(v.root); this.vehicles.push(v); return v; }
  removeVehicle(v) { this.scene.remove(v.root); this.vehicles = this.vehicles.filter(x => x !== v); if (this.player.vehicle === v) this.player.exit(); }

  toggleVehicle() {
    const p = this.player;
    if (p.vehicle) { if (Math.abs(p.vehicle.speed) > 3) return this.toast('先停车（空格刹车）'); p.exit(); return; }
    const near = this.vehicles.filter(v => !v.ai && !v.police).map(v => [v, v.root.position.distanceTo(p.pos)]).filter(([, d]) => d < 4.5).sort((a, b) => a[1] - b[1])[0];
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
    if (pt) {
      if (pt.kind === 'hq') txt = this.player.vehicle?.order ? `<kbd>E</kbd>把卡车停在 ${pt.label} 门口展示` : `<kbd>E</kbd>在 ${pt.label} 使用道具`;
      else if (pt.kind === 'shop') txt = `<kbd>E</kbd>进入 ${pt.label}`;
      else if (pt.kind === 'garage') txt = `<kbd>E</kbd>${pt.label}`;
      else if (pt.kind === 'home') txt = `<kbd>E</kbd>回家（结束今天，去发帖）`;
    } else if (!this.player.vehicle) {
      const nv = this.vehicles.find(v => !v.ai && !v.police && v.root.position.distanceTo(this.player.pos) < 4.5);
      if (nv) txt = `<kbd>F</kbd>上车`;
    } else txt = '';
    if (this.bombTimer > 0) txt = `💣 ${this.bombTimer.toFixed(1)} 秒后爆炸，快跑！`;
    el.innerHTML = txt; el.classList.toggle('hidden', !txt);
  }

  interact() {
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
    const ev = { id: 'e' + Math.random().toString(36).slice(2, 8), item: order.item, target: order.target, kind: order.kind, text: order.text, hq: hqId, time: this.clockMin };
    Sim.applyAction(this.state, ev);
    this.day.events.push(ev);
    if (ev.backfire) setTimeout(() => this.toast(`${order.target} 好像被激励了……（知耻后勇）`, ''), 1500);
    return ev;
  }

  consume(order) { const inv = this.state.inventory; const i = inv.indexOf(order); if (i >= 0) inv.splice(i, 1); }

  useItem(order, hqId) {
    const item = ITEMS.find(i => i.id === order.item), hq = this.city.hq[hqId];
    const support = order.kind === 'support';
    this.consume(order);
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
      case 'graffiti': { const g = this.props.graffiti(hq, order.text); this.props.addSubject(g, { eventId: ev.id, label, text: true, weight: 1.3 }); this.audio.noise(1.5, { f: 5000, type: 'highpass', gain: 0.25 }); break; }
      case 'eggs': this.throwEggs(hq, ev, label); break;
      case 'fireworks': this.fireworks(hq, ev, label); break;
      case 'drone': {
        const d = this.props.droneShow(new THREE.Vector3(hq.cx, 45, hq.face + hq.dir * 10), order.text, support ? '#ff7ab0' : '#ff2d55');
        d.rotation.y = face; this.props.addSubject(d, { eventId: ev.id, label, text: true, glow: true, weight: 1.5 });
        this.droneShowT = { obj: d, until: this.time + 40 };
        this.audio.whoosh(); break;
      }
      case 'bomb': this.plantBomb(hq, ev, label); break;
      case 'rpg': this.enterAim(hq, ev, label); break;
    }
    this.crowd.attract(hq.plaza, 80, item.ext ? 6 : 12, support ? 'cheer' : 'angry');
    if (!['bomb', 'rpg'].includes(item.prop)) this.toast(`${item.name} 已布置！掏出手机（C）拍照`, 'good');
    this.ui.saveSoon();
  }

  popIn(obj, delay = 0) { const s = obj.scale.clone(); obj.scale.setScalar(0.001); (this.anims ||= []).push({ obj, t: -delay, s }); }

  updateTimers(dt) {
    for (const a of this.anims || []) { a.t += dt; const k = THREE.MathUtils.clamp(a.t / 0.45, 0, 1); const e = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2); a.obj.scale.copy(a.s).multiplyScalar(Math.max(0.001, k > 0 ? e : 0.001)); }
    this.anims = (this.anims || []).filter(a => a.t < 0.5);
    if (this.bombTimer > 0) {
      const prev = this.bombTimer; this.bombTimer -= dt;
      if (Math.floor(prev * 2) !== Math.floor(this.bombTimer * 2)) this.audio.tone(this.bombTimer < 2 ? 1400 : 1000, 0.08, { type: 'square', gain: 0.1 });
      if (this.bombObj) this.bombObj.userData.fast = this.bombTimer < 2;
      if (this.bombTimer <= 0) this.detonate();
    }
    if (this.droneShowT && this.time < this.droneShowT.until && this.droneShowT.obj.userData.formed) this.lastSpectacle = { t: this.time, pos: this.droneShowT.obj.position.clone() };
    for (const r of this.rockets || []) this.updateRocket(r, dt);
    this.rockets = (this.rockets || []).filter(r => !r.dead);
    const sign = Object.values(this.city.hq).map(h => h.sign).find(s => s.userData.vel);
    if (sign) { const v = sign.userData.vel; v.y -= 20 * dt; sign.position.addScaledVector(v, dt); sign.rotation.x += dt * 1.5; if (sign.position.y < 1.5) { sign.position.y = 1.5; sign.userData.vel = null; this.fx.explosion(sign.position.clone().setY(0.2), 0.6); this.lastSpectacle = { t: this.time, pos: sign.position.clone() }; } }
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

  fireworks(hq, ev, label) {
    const base = hq.plaza.clone().add(new THREE.Vector3(0, 0, hq.dir * 2));
    const holder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 }));
    holder.position.copy(base).setY(0.43); this.props.place(holder);
    const sky = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 4), new THREE.MeshBasicMaterial({ visible: false }));
    sky.position.copy(base).setY(28); this.props.place(sky);
    this.props.addSubject(sky, { eventId: ev.id, label, glow: true, weight: 1.2 });
    for (let i = 0; i < 16; i++) setTimeout(() => { this.fx.firework(base); setTimeout(() => this.lastSpectacle = { t: this.time, pos: base.clone().setY(30) }, 1000); }, i * 550);
  }

  plantBomb(hq, ev, label) {
    const pos = hq.plaza.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, -hq.dir * 3));
    this.bombObj = this.props.bomb(pos);
    this.props.addSubject(this.bombObj, { eventId: ev.id, label, weight: 0.8 });
    this.bombEv = { hq, ev, label, pos };
    this.bombTimer = 8;
    this.toast('💣 炸弹已放置！8 秒后爆炸 —— 退到安全距离再拍！', 'big');
  }

  detonate() {
    const { hq, ev, label, pos } = this.bombEv;
    this.fx.explosion(pos, 1.3);
    this.props.blast(pos, 14);
    this.scene.remove(this.bombObj); this.props.list = this.props.list.filter(o => o !== this.bombObj);
    this.lastSpectacle = { t: this.time, pos: pos.clone().setY(3) };
    // 爆炸主体（烟尘区域）
    const zone = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ visible: false })); zone.position.copy(pos).setY(4);
    this.props.place(zone); this.props.addSubject(zone, { eventId: ev.id, label, weight: 1.4 });
    this.crowd.flee(pos, 30);
    const d = this.player.pos.distanceTo(pos);
    if (d < 7) { this.toast('你被炸伤了！住院一晚……', 'bad'); this.state.money -= 800000; setTimeout(() => this.endDay(), 1500); }
    hq.sign.userData.wobble = 1;
    this.callPolice(pos, 2);
  }

  enterAim(hq, ev, label) {
    this.aimCtx = { hq, ev, label, shots: 1 };
    this.mode = 'aim'; this.photo.enter(); this.photo.fov = 50;
    document.getElementById('photo-hint').textContent = '瞄准总部招牌 · 左键 发射 · 右键 取消';
    this.toast('🚀 火箭筒已上肩：瞄准招牌！', 'big');
  }

  fireRocket() {
    if (!this.aimCtx || this.aimCtx.shots <= 0) return;
    this.aimCtx.shots--;
    const cam = this.camera, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x445533, emissive: 0xff6600, emissiveIntensity: 0.4 }));
    m.position.copy(cam.position).addScaledVector(dir, 1.2); m.lookAt(m.position.clone().add(dir));
    this.scene.add(m);
    (this.rockets ||= []).push({ m, dir, speed: 45, life: 4, ctx: this.aimCtx });
    this.audio.whoosh();
    this.shake(0.4);
    setTimeout(() => this.exitPhoto(), 250);
  }

  updateRocket(r, dt) {
    r.life -= dt;
    const step = r.dir.clone().multiplyScalar(r.speed * dt);
    const ray = new THREE.Raycaster(r.m.position, r.dir.clone(), 0, step.length() + 0.5);
    const hits = ray.intersectObject(this.city.group, true);
    this.fx.sprite(this.fx.smoke, new THREE.Color(0.5, 0.5, 0.5), r.m.position.clone(), 0.8, 1.2, new THREE.Vector3(), { normal: true, grow: 3, opacity: 0.6 });
    if (hits.length || r.life <= 0) {
      const p = hits.length ? hits[0].point : r.m.position.clone();
      r.dead = true; this.scene.remove(r.m);
      this.fx.explosion(p, 1.4); this.props.blast(p, 12);
      this.lastSpectacle = { t: this.time, pos: p.clone() };
      const { hq, ev, label } = r.ctx;
      let hitSign = false;
      if (hits.length) { let o = hits[0].object; while (o) { if (o === hq.sign) hitSign = true; o = o.parent; } }
      if (hitSign) { hq.sign.userData.vel = new THREE.Vector3(0, 2, hq.dir * 4); this.toast('💥 招牌被轰下来了！！！', 'big'); ev.signDown = true; }
      else this.toast('没打中招牌……但场面还是很大', '');
      const zone = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 6), new THREE.MeshBasicMaterial({ visible: false })); zone.position.copy(p);
      this.props.place(zone); this.props.addSubject(zone, { eventId: ev.id, label, weight: hitSign ? 1.8 : 1.2 });
      if (hitSign) this.props.addSubject(hq.sign, { eventId: ev.id, label: label + '（招牌落地）', text: true, weight: 2 });
      this.crowd.flee(p, 35);
      this.callPolice(p, 3);
    } else r.m.position.add(step);
  }

  enterPhoto() { if (this.player.vehicle && Math.abs(this.player.vehicle.speed) > 2) return; this.mode = 'photo'; this.photo.enter(); document.getElementById('photo-hint').textContent = '左键 拍照 · 滚轮 变焦 · C/右键 退出'; }
  exitPhoto() { this.photo.exit(); this.mode = 'play'; this.aimCtx = null; this.player.snapCam = true; }

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
      const team = this.state.players[order.target].team; const hqId = this.city.hq[team] ? team : 'T0';
      const ev = this.newEvent(order, hqId);
      this.props.addSubject(v.root, { eventId: ev.id, label: `${item.name}→${order.target}`, text: true, glow: true, weight: 1.3 });
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
    this.props.addSubject(v.root, { eventId: ev.id, label: `${item.name}→${order.target}`, text: true, glow: true, weight: 1.4 });
    this.crowd.attract(v.root.position, 80, 12, order.kind === 'support' ? 'cheer' : 'angry');
    this.toast('卡车就位！LED 屏亮起来了 —— 拍照！', 'good');
  }

  // ================= 警察 =================
  callPolice(pos, n) {
    const s = this.state;
    n += s.patrol ? 1 : 0; n = Math.max(1, n - Math.floor(s.skills.stealth / 2));
    this.toast('🚨 有人报警了！警车正在赶来 —— 开车跑！', 'bad');
    const spawns = [[-150, 30], [150, 30], [0, -150], [0, 150], [-150, -90], [150, 90]];
    for (let i = 0; i < n; i++) {
      const [x, z] = spawns[(Math.random() * spawns.length) | 0];
      const v = new Vehicle('police', { speed: 19 + s.week * 0.3 - s.skills.stealth });
      v.root.position.set(x, 0, z); v.police = true; v.heading = Math.atan2(-x, -z);
      this.addVehicle(v); this.police.push(v);
    }
    this.chase = { t: 0, lost: 0, caught: 0 };
  }

  clearPolice() { for (const v of this.police) this.removeVehicle(v); this.police = []; this.chase = null; this.audio.setSiren(0, 0); }

  updatePolice(dt) {
    if (!this.police.length || this.mode === 'ui' || this.mode === 'menu') { if (this.audio.siren) this.audio.setSiren(0, 0); return; }
    const target = this.player.vehicle ? this.player.vehicle.root.position : this.player.pos;
    let minD = 1e9;
    for (const v of this.police) {
      const d = v.root.position.distanceTo(target); minD = Math.min(minD, d);
      // 简单追踪：朝目标转向，靠碰撞滑开
      const dx = target.x - v.root.position.x, dz = target.z - v.root.position.z;
      let diff = Math.atan2(dx, dz) - v.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      v.steer = THREE.MathUtils.clamp(diff * 2.5, -1, 1);
      const want = d < 8 ? 6 : v.maxSpeed;
      v.speed += THREE.MathUtils.clamp(want - v.speed, -12 * dt, v.T.accel * dt);
      if (v.stuck > 1.2) { v.speed = -6; v.stuck -= dt * 3; }
      v.integrate(dt, this.city);
      v.stuck = (v.lastHit > 0 || Math.abs(v.speed) < 1) ? (v.stuck || 0) + dt : 0;
    }
    const c = this.chase; c.t += dt;
    const mySpeed = this.player.vehicle ? Math.abs(this.player.vehicle.speed) : 0;
    if (minD < 5 && mySpeed < 6) c.caught += dt; else c.caught = Math.max(0, c.caught - dt * 0.5);
    if (minD > 70) c.lost += dt; else c.lost = Math.max(0, c.lost - dt);
    this.audio.setSiren(Math.max(0, 1 - minD / 120), this.time);
    if (c.caught > 1.6) {
      this.clearPolice();
      this.toast('🚔 你被抓住了！', 'bad');
      this.state.heat = Math.max(this.state.heat, B.heatArrest);
      setTimeout(() => this.endDay(), 1200);
    } else if (c.lost > 8) {
      this.clearPolice(); this.state.heat = Math.max(0, this.state.heat - 10);
      this.toast('✅ 成功甩掉警察！（关注度 -10）', 'good'); this.audio.coin();
    }
  }
}
