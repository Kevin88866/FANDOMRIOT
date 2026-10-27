import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Audio } from './engine/audio.js';
import { City } from './world/city.js';
import { loadActors } from './world/actors.js';
import { loadModels, MODEL_LIST, model } from './engine/assets.js';
import { settings, onSettings } from './engine/settings.js';
import { Input, actionOf, codesFor, PAD } from './engine/input.js';
import { migrateOldSave } from './engine/saves.js';
import { Focus } from './ui/focus.js';
import { Tutorial } from './ui/tutorial.js';
import { Crowd } from './world/npc.js';
import { Props } from './world/props.js';
import { FX } from './fx/fx.js';
import { Player } from './player/player.js';
import { Vehicle } from './player/vehicle.js';
import { PhotoMode } from './player/photo.js';
import { Placer } from './player/placer.js';
import { Opportunities, Walker } from './world/opportunities.js';
import { Actor } from './world/actors.js';
import { Traffic } from './world/traffic.js';
import { buildStreetDetails } from './world/details.js';
import { ITEMS, TEAMS, VEHICLES, LEAGUE, BALANCE as B } from './content/data.js';
import * as Sim from './sim/sim.js';
import { UI } from './ui/ui.js';

export class Game {
  constructor() {
    this.renderer = new Renderer(document.getElementById('gl'));
    this.scene = this.renderer.scene; this.camera = this.renderer.camera;
    this.audio = new Audio();
    this.time = 0; this.charScale = 1;
    this.input = new Input();      // 键鼠 + 手柄（同时也是本帧的移动状态：up/down/left/right/run/brake）
    this.keyState = {};
    this.mode = 'menu';           // menu | play | photo | place | ui
    this.vehicles = [];           // 场景内车辆（玩家载具、订购卡车、警车）
    this.ui = new UI(this);
    this.focus = new Focus(this.ui);
    this.tutorial = new Tutorial(this);
    this.input.toastPad = t => this.ui.toast(t, 'good');
    const keysBar = () => {
      document.getElementById('keys').innerHTML = this.ui.keysLine();
      const K = a => this.input.K(a);
      document.getElementById('photo-hint').innerHTML = this.input.device === 'pad' ? `${K('run')} 或 <kbd class="pad">A</kbd> 拍照 · ${K('rotL')}${K('rotR')} 变焦 · <kbd class="pad">B</kbd> 退出` : `鼠标左键 拍照 · 滚轮 变焦 · ${K('photo')} / 右键 退出`;
    };
    keysBar(); this.input.onDevice(keysBar); onSettings(keysBar);
    this.applyUiSettings(); onSettings(() => this.applyUiSettings());
  }

  // 界面缩放、帧率显示
  applyUiSettings() {
    document.documentElement.style.setProperty('--ui-scale', settings.uiScale);
    let f = document.getElementById('fps');
    if (settings.showFps && !f) { f = document.createElement('div'); f.id = 'fps'; document.body.appendChild(f); }
    if (f) f.classList.toggle('hidden', !settings.showFps);
  }

  async boot() {
    const bar = document.getElementById('lbar'), txt = document.getElementById('ltext');
    const step = (p, t) => { bar.style.width = (p * 100) + '%'; txt.textContent = t; };
    migrateOldSave();
    this.startTips();
    step(0.05, '加载天空…');
    await this.renderer.loadEnv('assets/hdr/venice_sunset_1k.hdr', 'assets/hdr/night.exr');
    step(0.15, '加载模型…');
    await loadModels(MODEL_LIST, p => step(0.15 + p * 0.15, '加载模型…'));
    step(0.3, '加载角色…');
    await loadActors(p => step(0.3 + p * 0.4, '加载角色…'));
    step(0.75, '建造首尔街区…');
    await new Promise(r => setTimeout(r, 30));
    this.city = new City(this.scene);
    this.city.finalizeTrees();
    buildStreetDetails(this);
    this.traffic = new Traffic(this, 12);
    this.fx = new FX(this.scene, this);
    this.props = new Props(this);
    step(0.85, '路人出门中…');
    this.crowd = new Crowd(this, 36);
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
    clearInterval(this.tipTimer);
    if (sessionStorage.getItem('fr_to_menu')) { sessionStorage.removeItem('fr_to_menu'); this.ui.mainMenu(); }
    else this.ui.splash();
  }

  // 加载界面的小贴士
  startTips() {
    const TIPS = ['骂刚打崩的选手，大家会认同；骂刚拿 MVP 的选手，会被反噬掉粉。', 'LED 卡车的标语是滚动的，等它滚到屏幕中间再按快门。', '拍到选手亲眼看到你的道具，是最值钱的名场面。',
      '争议度太高会被限流、封号，甚至收到律师函。每周会自然回落。', '花圈排成一排、正对街道，"排面"会更好看。', '同一招反复用，看的人越来越少——换着花样来。',
      '偶尔会莫名其妙爆火，也会石沉大海。这就是流量。', '粉丝团人数越多，集会和应援的场面越大。', '手柄也能玩：A 互动、Y 拍照、X 上下车、☰ 菜单。'];
    const el = document.getElementById('ltip'); if (!el) return;
    let i = Math.random() * TIPS.length | 0;
    const show = () => { el.style.opacity = 0; setTimeout(() => { el.textContent = '💡 ' + TIPS[i++ % TIPS.length]; el.style.opacity = 1; }, 300); };
    show(); this.tipTimer = setInterval(show, 3600);
  }

  // 回到主菜单：重新载入页面（场景、车辆、道具全部复位），跳过启动画面
  leaveToMenu() { sessionStorage.setItem('fr_to_menu', '1'); location.reload(); }

  // ================= 输入 =================
  bindInput() {
    const MOVE = ['up', 'down', 'left', 'right', 'run', 'brake'];
    addEventListener('keydown', e => {
      this.audio.init();
      if (this.ui.skipSplash) return;
      if (this.ui.anyKey) { e.preventDefault(); this.ui.anyKey(); return; }
      const act = actionOf(e.code);
      // 菜单 / 面板：方向键移动焦点，回车确认，Esc 返回
      if ((this.mode === 'ui' || this.mode === 'menu') && !this.ui.modal.classList.contains('hidden')) {
        const t = e.target, typing = t && ((t.tagName === 'INPUT' && t.type === 'text') || t.tagName === 'TEXTAREA');
        if (!typing) {
          const nav = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
          if (nav) { e.preventDefault(); this.focus.move(...nav); return; }
          if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.focus.cur) { e.preventDefault(); this.focus.activate(); return; }
          if (e.code === 'Delete' && this.ui.slotDelete && this.focus.cur) { this.ui.slotDelete(this.focus.cur); return; }
          if (this.ui.settingsTab && (e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) { this.ui.cycleSettingsTab(e.code === 'KeyQ' ? -1 : 1); return; }
        }
        if (e.code === 'Escape' && !e.repeat) this.ui.escape?.();
        if (e.code === 'Tab') e.preventDefault();
        return;
      }
      if (MOVE.includes(act)) { this.keyState[act] = 1; if (e.code === 'Space') e.preventDefault(); }
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      if (this.mode === 'play') {
        if (act === 'interact') this.interact();
        else if (act === 'vehicle') this.toggleVehicle();
        else if (act === 'photo') this.enterPhoto();
        else if (act === 'inventory') this.ui.inventory();
        else if (act === 'map') this.bigMap = !this.bigMap;
        else if (act === 'objective') document.getElementById('objective').classList.toggle('collapsed');
        else if (act === 'pause') this.ui.pause();
      } else if (this.mode === 'photo') {
        if (act === 'photo' || act === 'pause') this.exitPhoto();
      } else if (this.mode === 'place') {
        if (codesFor('rotL').includes(e.code)) this.placer.rotate(0.2618);
        else if (codesFor('rotR').includes(e.code)) this.placer.rotate(-0.2618);
        else if (act === 'pause') this.placer.cancel();
      }
    });
    addEventListener('keyup', e => { const act = actionOf(e.code); if (MOVE.includes(act)) this.keyState[act] = 0; });
    addEventListener('blur', () => { this.keyState = {}; });
    addEventListener('pointerdown', () => this.audio.init());   // 浏览器要求用户交互后才能出声
    const cv = this.renderer.r.domElement;
    cv.addEventListener('mousedown', e => {
      this.audio.init();
      if (this.ui.anyKey) return this.ui.anyKey();
      if (this.mode === 'place') return this.placer.click(e.button);
      if (this.mode === 'play' || this.mode === 'photo') {
        if (document.pointerLockElement !== cv) { cv.requestPointerLock?.(); return; }
        if (this.mode === 'photo') { if (e.button === 0) this.photo.shoot(); else if (e.button === 2) this.exitPhoto(); }
      }
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== cv) return;
      const k = settings.mouseSens, iy = settings.invertY ? -1 : 1;
      if (this.mode === 'play') { this.player.look(e.movementX * k, e.movementY * k * iy); this.input.mouseActive = true; clearTimeout(this.mt); this.mt = setTimeout(() => this.input.mouseActive = false, 1200); }
      else if (this.mode === 'photo') this.photo.look(e.movementX * k, e.movementY * k * iy);
    });
    addEventListener('wheel', e => { if (this.mode === 'place') this.placer.rotate(Math.sign(e.deltaY) * 0.2618); else if (this.mode === 'photo') this.photo.zoom(e.deltaY); else if (this.mode === 'play') this.player.camDist = THREE.MathUtils.clamp(this.player.camDist + e.deltaY * 0.005, 2.5, 18); });
  }

  // 每帧：合并键盘和手柄的移动输入；处理手柄按键（游戏内动作 / 菜单导航）
  pollPad(dt, now) {
    const I = this.input, down = I.poll(), [lx, ly, rx, ry] = I.axes, ks = this.keyState;
    if (this.ui.skipSplash) { if (down.size) this.ui.skipSplash(); return; }
    if (this.ui.anyKey) { if (down.size) this.ui.anyKey(); return; }
    const veh = !!this.player?.vehicle;
    I.up = Math.max(ks.up || 0, ly < 0 ? -ly : 0, veh ? I.rt || 0 : 0);
    I.down = Math.max(ks.down || 0, ly > 0 ? ly : 0, veh ? I.lt || 0 : 0);
    I.left = Math.max(ks.left || 0, lx < 0 ? -lx : 0);
    I.right = Math.max(ks.right || 0, lx > 0 ? lx : 0);
    I.run = Math.max(ks.run || 0, !veh && (I.rt || 0) > 0.5 ? 1 : 0);
    I.brake = Math.max(ks.brake || 0, veh && I.isHeld(PAD.B) ? 1 : 0);
    if (!I.pad) return;
    const menuOpen = (this.mode === 'ui' || this.mode === 'menu') && !this.ui.modal.classList.contains('hidden');
    if (menuOpen) {
      const dx = lx || (I.isHeld(PAD.RIGHT) ? 1 : I.isHeld(PAD.LEFT) ? -1 : 0), dy = ly || (I.isHeld(PAD.DOWN) ? 1 : I.isHeld(PAD.UP) ? -1 : 0);
      this.focus.stick(dx, dy, now);
      if (down.has(PAD.A)) this.focus.activate();
      if (down.has(PAD.B) || down.has(PAD.MENU)) this.ui.escape?.();
      if (down.has(PAD.X) && this.ui.slotDelete && this.focus.cur) this.ui.slotDelete(this.focus.cur);
      if (down.has(PAD.LB)) this.ui.cycleSettingsTab(-1);
      if (down.has(PAD.RB)) this.ui.cycleSettingsTab(1);
      if (Math.abs(ry) > 0.2) { const p = this.ui.modal.querySelector('.panel'); if (p) p.scrollTop += ry * 900 * dt; }
      return;
    }
    const sens = settings.padSens, iy = settings.invertY ? -1 : 1;
    if (this.mode === 'play') {
      if (rx || ry) { this.player.look(rx * 950 * dt * sens, ry * 650 * dt * sens * iy); I.mouseActive = true; clearTimeout(this.mt); this.mt = setTimeout(() => I.mouseActive = false, 1200); }
      if (down.has(PAD.A)) this.interact();
      if (down.has(PAD.X)) this.toggleVehicle();
      if (down.has(PAD.Y)) this.enterPhoto();
      if (down.has(PAD.DOWN)) this.ui.inventory();
      if (down.has(PAD.VIEW)) this.bigMap = !this.bigMap;
      if (down.has(PAD.UP)) document.getElementById('objective').classList.toggle('collapsed');
      if (down.has(PAD.MENU)) this.ui.pause();
    } else if (this.mode === 'photo') {
      const ax = rx || lx, ay = ry || ly;
      if (ax || ay) this.photo.look(ax * 700 * dt * sens, ay * 480 * dt * sens * iy);
      if (I.isHeld(PAD.LB)) this.photo.zoom(500 * dt);
      if (I.isHeld(PAD.RB)) this.photo.zoom(-500 * dt);
      if (down.has(PAD.RT) || down.has(PAD.A)) { this.photo.shoot(); I.rumble(0.15, 0.35, 70); }
      if (down.has(PAD.B) || down.has(PAD.Y) || down.has(PAD.MENU)) this.exitPhoto();
    } else if (this.mode === 'place') {
      const m = this.placer.mouse;
      m.x = THREE.MathUtils.clamp(m.x + lx * dt * 1.1 * sens, -1, 1); m.y = THREE.MathUtils.clamp(m.y - ly * dt * 1.1 * sens, -1, 1);
      if (down.has(PAD.A) || down.has(PAD.RT)) this.placer.click(0);
      if (down.has(PAD.B)) this.placer.click(2);
      if (down.has(PAD.LB)) this.placer.rotate(0.2618);
      if (down.has(PAD.RB)) this.placer.rotate(-0.2618);
      if (down.has(PAD.MENU)) this.placer.cancel();
    }
  }

  releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }
  lockMouse() { this.renderer.r.domElement.requestPointerLock?.(); }

  // ================= 主循环 =================
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    if (settings.fpsCap && now - (this.lastDraw || 0) < 1000 / settings.fpsCap - 1.5) return;
    this.lastDraw = now;
    const raw = (now - this.last) / 1000, dt = Math.min(0.05, raw); this.last = now;
    this.pollPad(dt, now);
    if (this.state && this.mode !== 'menu') this.state.playTime = (this.state.playTime || 0) + Math.min(raw, 1);
    this.tutorial.update(dt);
    if (settings.showFps) { this.fpsT = (this.fpsT || 0) + raw; this.fpsF = (this.fpsF || 0) + 1; if (this.fpsT > 0.5) { const f = document.getElementById('fps'); if (f) f.textContent = Math.round(this.fpsF / this.fpsT) + ' FPS'; this.fpsT = 0; this.fpsF = 0; } }
    this.watchFps(raw);
    this.time += dt;
    if (this.mode === 'play' || this.mode === 'photo') this.tickDay(dt);
    if (this.mode === 'play') this.player.update(dt, this.input);
    else this.player.actor.update(dt);
    for (const v of this.vehicles) {
      if (v.ai && !v.traffic) this.updateAIVehicle(v, dt);
      v.update(dt, this.time);
    }
    this.crowd.update(dt);
    this.traffic.update(dt);
    this.bumpTraffic();
    this.details?.update(this.time);
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
  }

  // 高画质下持续卡顿（<30 帧）时，提示一次切换到中画质
  watchFps(raw) {
    if (this.fpsHinted || !['high', 'ultra'].includes(settings.preset) || this.mode !== 'play') return;
    this.fpsAcc = (this.fpsAcc || 0) + raw; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 6) {
      const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
      if (fps < 30) { this.fpsHinted = true; this.ui.push('画面有点卡？', `当前约 ${Math.round(fps)} 帧。可以在 菜单 → 设置 → 画面 里降低画质预设或渲染分辨率`, ''); }
    }
  }

  cinematicCam(dt) {
    // 沿大路缓慢移动的航拍镜头，看向两栋总部
    const t = this.time * 0.035, x = Math.sin(t) * 110, dir = Math.cos(t) >= 0 ? 1 : -1;
    this.camera.position.set(x, 7 + Math.sin(t * 1.7) * 1.5, 30 + Math.sin(t * 0.8) * 5);
    this.camera.lookAt(x + dir * 45, 10 + Math.sin(t * 1.3) * 2, 30 + Math.sin(t * 0.6) * 10);
    if (this.renderer.hour !== 21) { this.renderer.setTime(21); this.city.updateNight(this.renderer.night); }
  }

  shake(amount, pos) {
    const d = pos ? pos.distanceTo(this.camera.position) : 0;
    this.player.shake = Math.max(this.player.shake || 0, amount * settings.shake * Math.max(0.1, 1 - d / 120));
    if (amount > 0.2) this.input.rumble(Math.min(1, amount), Math.min(1, amount * 0.6), 160);
  }

  // ================= 一天的流程 =================
  startDay() {
    const s = this.state;
    this.day = { photos: [], events: [], startMin: 18 * 60 };
    this.clockMin = 18 * 60;
    this.props.clearAll(); this.fx.clearDecals();
    for (const v of this.vehicles.slice()) if (!v.traffic) this.removeVehicle(v);
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
    this.audio.music('night');
    this.toast(`第 ${s.week} 周 · 行动日开始（18:00 - 24:00）`, 'big');
    if (s.week === 1 && s.season === 1 && !this.tutorial.active) setTimeout(() => this.toast('先去「应援 & 抗议用品店」买东西（地图上的粉色点）', ''), 2500);
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
    this.tutorial.event('dayEnd');
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

  // 玩家开的车撞到 AI 车：互相推开、减速
  bumpTraffic() {
    const pv = this.player.vehicle; if (!pv) return;
    for (const v of this.vehicles) {
      if (v === pv || !v.npc) continue;
      const d = pv.root.position.clone().sub(v.root.position); d.y = 0;
      const min = pv.radius + v.T.len * 0.42, L = d.length();
      if (L < min && L > 0.01) {
        pv.root.position.addScaledVector(d.normalize(), (min - L));
        if (Math.abs(pv.speed) > 4) { this.shake(0.25); this.audio.tone(90, 0.2, { type: 'sawtooth', gain: 0.12 }); }
        pv.speed *= -0.3;
      }
    }
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
    if (!this.player.vehicle && this.opps.nearStreamer(this.player.pos)) txt = `${this.input.K('interact')}接受街头主播的直播采访`;
    else if (pt) {
      if (pt.kind === 'hq') txt = this.player.vehicle?.order ? `${this.input.K('interact')}把卡车停在 ${pt.label} 门口展示` : `${this.input.K('interact')}在 ${pt.label} 使用道具`;
      else if (pt.kind === 'shop') txt = `${this.input.K('interact')}进入 ${pt.label}`;
      else if (pt.kind === 'garage') txt = `${this.input.K('interact')}${pt.label}`;
      else if (pt.kind === 'home') txt = `${this.input.K('interact')}回家（结束今天，去发帖）`;
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
    this.tutorial.event('used');
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
    this.tutorial.event('placed');
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
    const glb = model('pr_fireworks');
    const holder = glb || new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.6 }));
    holder.position.copy(base).setY(glb ? base.y : 0.43); this.props.place(holder);
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
      this.toast(`开着卡车去目标总部门口，按 ${this.input.K('interact')} 停车展示`, 'good');
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
