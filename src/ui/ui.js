import { TEAMS, ITEMS, PLATFORMS, TONES, SKILLS, VEHICLES, BALANCE as B } from '../content/data.js';
import * as Sim from '../sim/sim.js';

const $ = id => document.getElementById(id);
const won = n => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString();
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const teamOf = id => TEAMS.find(t => t.id === id);
const UNLOCK = [0, 1500, 6000, 15000, 35000, 60000, 100000];
export const unlockLevel = fans => UNLOCK.filter(x => fans >= x).length - 1;
const SAVE = 'fr_save_v1';

export class UI {
  constructor(game) { this.g = game; this.modal = $('modal'); }

  get s() { return this.g.state; }

  // ---------- 基础 ----------
  toast(text, cls = '') {
    const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = text;
    $('toasts').appendChild(el); if (cls === 'big') this.g.audio?.notify();
    setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = 0; setTimeout(() => el.remove(), 500); }, cls === 'big' ? 3800 : 2800);
  }
  showHud(on) { $('hud').classList.toggle('hidden', !on); }
  open(html, { cinematic = false, esc = null } = {}) {
    this.g.mode = this.g.mode === 'menu' ? 'menu' : 'ui';
    this.cinematic = cinematic; this.escape = esc;
    this.g.releaseMouse();
    this.modal.innerHTML = `<div class="panel">${html}</div>`; this.modal.classList.remove('hidden');
    return this.modal.querySelector('.panel');
  }
  close(back = true) {
    this.modal.classList.add('hidden'); this.modal.innerHTML = ''; this.escape = null;
    if (back && this.g.day && this.g.mode === 'ui') { this.g.mode = 'play'; this.g.lockMouse(); }
  }
  on(sel, ev, fn) { this.modal.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => { this.g.audio?.click(); fn(e, el); })); }
  confirm(msg, yes) {
    this.open(`<h2>确认</h2><p>${msg}</p><div class="row"><button class="btn pri" id="y">确定</button><button class="btn" id="n">取消</button></div>`, { esc: () => this.close() });
    $('y').onclick = () => { this.close(false); yes(); }; $('n').onclick = () => this.close();
  }

  save() { try { localStorage.setItem(SAVE, JSON.stringify(this.s)); } catch (e) { console.warn(e); } }
  saveSoon() { clearTimeout(this.st); this.st = setTimeout(() => this.save(), 500); }
  load() { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } }

  // ---------- HUD ----------
  hud() {
    const s = this.s, g = this.g;
    if (!this.h) this.h = { money: $('hud-money'), fans: $('hud-fans'), heat: $('hud-heat'), time: $('hud-time'), week: $('hud-week'), phase: $('hud-phase'), obj: $('objective'), inv: $('inventory') };
    const h = this.h, now = performance.now();
    h.money.textContent = won(s.money); h.money.style.color = s.money < 0 ? 'var(--bad)' : '';
    h.fans.textContent = num(s.fans);
    h.heat.style.width = Math.min(100, s.heat) + '%';
    const m = Math.floor(g.clockMin); h.time.textContent = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    h.week.textContent = `S${s.season} · 第${s.week}周`;
    h.phase.textContent = g.police.length ? '🚨 被追捕中' : g.mode === 'photo' ? '拍照中' : '行动日';
    if (now - (this.lastSlow || 0) > 400) {
      this.lastSlow = now;
      h.obj.innerHTML = `<h4>赛季目标</h4>${this.goalLines().join('<br>')}<div class="sub" style="margin-top:6px">今日：照片 ${g.day.photos.length} 张 · 行动 ${g.day.events.length} 次</div>`;
      h.inv.innerHTML = s.inventory.slice(0, 6).map(o => `<div class="inv"><b>${ITEMS.find(i => i.id === o.item).name}</b> → ${o.target}</div>`).join('') + (s.inventory.length > 6 ? `<div class="inv">+${s.inventory.length - 6}</div>` : '');
      this.minimap();
    }
  }

  minimap() {
    const c = $('minimap-c'), x = c.getContext('2d'), g = this.g, big = g.bigMap;
    const el = $('minimap'); el.style.width = el.style.height = big ? '420px' : '180px'; c.width = c.height = big ? 420 : 180;
    const W = c.width, sc = big ? W / 340 : W / 160;
    const me = g.player.vehicle ? g.player.vehicle.root.position : g.player.pos;
    const cx = big ? 0 : me.x, cz = big ? 0 : me.z;
    const P = (px, pz) => [W / 2 + (px - cx) * sc, W / 2 + (pz - cz) * sc];
    x.fillStyle = '#0d1018'; x.fillRect(0, 0, W, W);
    x.fillStyle = '#2b3040';
    for (const r of [-150, -90, -30, 30, 90, 150]) {
      const w = (r === 30 ? 26 : 14) * sc; let [a, b] = P(-170, r); x.fillRect(0, b - w / 2, W, w);
      [a, b] = P(r, -170); x.fillRect(a - 7 * sc, 0, 14 * sc, W);
    }
    const pts = g.city.points, col = { shop: '#ff4f9a', garage: '#27e1ff', home: '#ffd34d', hq: '#ff2d55' };
    for (const k in pts) { const p = pts[k]; if (!col[p.kind]) continue; const [a, b] = P(p.pos.x, p.pos.z); x.fillStyle = col[p.kind]; x.beginPath(); x.arc(a, b, big ? 7 : 5, 0, 7); x.fill(); if (big) { x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.fillText(p.label, a + 9, b + 4); } }
    for (const v of g.vehicles) { if (v === g.player.vehicle) continue; const [a, b] = P(v.root.position.x, v.root.position.z); x.fillStyle = v.police ? (Math.floor(g.time * 4) % 2 ? '#f00' : '#04f') : v.order || v.shown ? '#ff8a00' : '#888'; x.fillRect(a - 3, b - 3, 6, 6); }
    const [a, b] = P(me.x, me.z), hd = g.player.vehicle ? g.player.vehicle.heading : g.player.facing;
    x.save(); x.translate(a, b); x.rotate(-hd + Math.PI); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(-5, 6); x.fill(); x.restore();
  }

  // ---------- 标题 ----------
  title() {
    this.g.mode = 'menu'; this.showHud(false);
    const has = !!this.load();
    this.open(`<div style="text-align:center;padding:20px 0">
      <div class="logo">饭圈风云<small>FANDOM RIOT · SEOUL</small></div>
      <p class="sub" style="margin-top:18px">你是一个电竞粉丝博主。开卡车、送花圈、放烟花……甚至扛火箭筒。<br>用镜头把这一切变成流量。</p>
      <div class="title-menu">
        ${has ? '<button class="btn pri" id="cont">继续游戏</button>' : ''}
        <button class="btn ${has ? '' : 'pri'}" id="new">新游戏</button>
        <button class="btn" id="howto">玩法说明</button>
        <button class="btn" id="set">设置</button>
      </div></div>`, { cinematic: true });
    this.modal.querySelector('.panel').style.background = 'rgba(10,12,20,.55)';
    if (has) $('cont').onclick = () => { this.g.state = this.load(); this.g.state.inventory ||= []; this.close(false); this.matchDay(true); };
    $('new').onclick = () => (has ? this.confirm('开始新游戏会覆盖现有存档，确定？', () => this.newGame()) : this.newGame());
    $('howto').onclick = () => this.howto(() => this.title());
    $('set').onclick = () => this.settings(() => this.title());
  }

  howto(back) {
    this.open(`<h2>玩法说明</h2>
      <div class="news">每周流程：<b>比赛日</b>（看赛果，谁打崩了谁封神）→ <b>行动日</b>（18:00-24:00 在首尔街头行动）→ <b>发帖</b>（挑照片发到平台，换曝光、粉丝、钱）→ <b>周结算</b>。</div>
      <div class="news">曝光 = 道具冲击力 × 照片质量 × 话题热度 × <b>情绪匹配</b> × 新鲜度 × 平台偏好 × 运气。骂刚打崩的人，大家认同；骂刚拿 MVP 的人，会被反噬掉粉。同一招反复用会越来越没人看。</div>
      <div class="news">照片质量看：主体是否在画面中央、标语能否看清、队标/总部招牌有没有入镜、有没有围观人群、有没有拍到爆炸/烟花的瞬间。</div>
      <div class="news bad">关注度：极端道具会让关注度飙升。≥50 限流，≥75 封号，≥100 被捕。被捕 3 次游戏结束。用了炸弹和火箭筒，警察会来追你 —— 开车甩掉他们（距离 70 米以上坚持 8 秒）。</div>
      <div class="news good">你的行动会影响选手心态 → 影响比赛 → 影响热度。把选手骂到下放替补、把喜欢的选手捧进全明星、帮主队夺冠，都靠你。</div>
      <div class="news">操作：WASD 移动/开车 · Shift 跑 · 空格 刹车 · F 上下车 · E 互动 · C 手机拍照 · Tab 背包 · M 大地图 · 鼠标 视角 · 滚轮 拉近拉远/变焦</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: true });
    $('b').onclick = back;
  }

  settings(back) {
    const q = this.g.renderer.quality;
    this.open(`<h2>设置</h2>
      <h3>画质</h3><div class="row"><button class="btn ${q === 'high' ? 'pri' : ''}" data-q="high">高（环境光遮蔽）</button><button class="btn ${q === 'mid' ? 'pri' : ''}" data-q="mid">中（更流畅）</button></div>
      <h3>音量</h3><input type="range" min="0" max="1" step="0.05" value="${this.g.audio.vol}" id="vol" style="width:300px;pointer-events:auto">
      <div class="row" style="margin-top:18px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: this.g.mode === 'menu' });
    this.on('[data-q]', 'click', (e, el) => { if (el.dataset.q !== q) { this.save(); this.g.renderer.setQuality(el.dataset.q); } });
    $('vol').oninput = e => this.g.audio.setVol(+e.target.value);
    $('b').onclick = back;
  }

  // ---------- 新游戏 ----------
  newGame() {
    this.open(`<h2>选择你的主队</h2><div class="sub">你是谁的粉丝？主队影响第 3 赛季的目标。T0 和 汉华 的总部就在地图中央。</div>
      <div class="cards">${TEAMS.map(t => `<div class="card" data-t="${t.id}" style="border-left:4px solid ${t.color}"><div class="t">${t.name}</div><div class="d">${t.full}<br>${t.players.map(p => p[0]).join(' · ')}</div></div>`).join('')}</div>`, { cinematic: true });
    this.on('[data-t]', 'click', (e, el) => this.pickRoute(el.dataset.t));
  }

  pickRoute(fav) {
    this.g.state = Sim.newGame(fav); this.s.inventory = [];
    const t = teamOf(fav);
    const all = Object.values(this.s.players).filter(p => !p.sub);
    const opts = all.map(p => `<option value="${p.name}">${p.name}（${teamOf(p.team).name} ${p.role}）</option>`).join('');
    this.open(`<h2>第 1 赛季：选择你的路线</h2><div class="sub">两条路线都要求赛季结束时粉丝 ≥ 20,000。</div>
      <div class="cards" style="grid-template-columns:1fr 1fr">
        <div class="card" data-r="attack"><span class="tag evil">黑粉路线</span><div class="t">把某人骂下首发</div><div class="d">持续给目标施压，让他心态崩掉、状态低迷，直到教练把他下放替补。</div>
          <select class="txt" id="ta">${opts}</select></div>
        <div class="card" data-r="support"><span class="tag good">真爱粉路线</span><div class="t">把某人捧进全明星</div><div class="d">用应援提升他的人气和心态，让他在赛季末的全明星投票里拿到所在位置第一。</div>
          <select class="txt" id="ts">${opts}</select></div>
      </div>`, { cinematic: true });
    const ta = $('ta'), ts = $('ts');
    ta.value = Object.values(this.s.players).find(p => p.team === 'HWL' && p.role === 'ADC')?.name || all[0].name;
    ts.value = Object.values(this.s.players).find(p => p.team === fav && p.role === 'MID')?.name || all[0].name;
    for (const sel of [ta, ts]) sel.onclick = e => e.stopPropagation();
    this.on('[data-r]', 'click', (e, el) => {
      const r = el.dataset.r; this.s.goals = { route: r, target: r === 'attack' ? ta.value : ts.value, fans: 20000 };
      this.save(); this.intro();
    });
  }

  intro() {
    const s = this.s;
    this.open(`<h2>欢迎来到首尔</h2>
      <div class="news">你刚搬进 T0 总部附近的一间原룸，手上有 ${won(s.money)} 存款和 ${s.fans} 个粉丝。</div>
      <div class="news">${s.goals.route === 'attack' ? `你的目标：让 <b>${s.goals.target}</b> 被下放替补。` : `你的目标：把 <b>${s.goals.target}</b> 捧进全明星。`}</div>
      <div class="news">建议第一周：去用品店买花圈或横幅 → 去总部门口布置 → 按 C 掏手机拍照（让标语、队标和围观的人都入镜）→ 回家发帖。</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="go">看第 1 周比赛</button></div>`, { cinematic: true });
    $('go').onclick = () => this.matchDay();
  }

  // ---------- 比赛日 ----------
  matchDay(resume = false) {
    const s = this.s, g = this.g;
    if (s.arrests >= 3) return this.gameOver('你第三次被捕，被判了缓刑并禁止接近俱乐部总部。博主生涯结束。');
    if (s.money < -5000000) return this.gameOver('你欠了太多钱，只能卖掉设备回老家。');
    if (!resume || !s.lastResults) {
      s.lastResults = Sim.playWeek(s);
      s.lastEvent = Sim.weeklyEvent(s);
      s.unlocked = unlockLevel(s.fans);
      this.save();
    }
    const res = s.lastResults, fav = s.fav;
    const st = Sim.standings(s);
    const P = s.players;
    const row = m