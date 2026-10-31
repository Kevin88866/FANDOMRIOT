import { TEAMS, ITEMS, PLATFORMS, TONES, SKILLS, VEHICLES, LEAGUE, SLOGANS, BALANCE as B } from '../content/data.js';
import * as Sim from '../sim/sim.js';
import { scoreCaption } from '../sim/caption.js';
import { Screens } from './screens.js';
import { Menus } from './menus.js';
import { Places } from './places.js';
import { deleteSlot } from '../engine/saves.js';
import { itemThumb, charThumb } from './thumbs.js';
import { REAL, CHAR_LABEL } from '../world/actors.js';
import { ROADS, HALF } from '../world/city.js';
import { pickStory, STORIES, rollMissions, missionText, rewardText, MISSIONS, ACHIEVEMENTS, achGrant, achLoad } from '../content/story.js';

const $ = id => document.getElementById(id);
const won = n => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString();
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const teamOf = id => TEAMS.find(t => t.id === id) || { name: id, color: '#888' };
const itemOf = id => ITEMS.find(i => i.id === id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNLOCK = [0, 1500, 6000, 15000, 35000, 60000, 100000];
export const unlockLevel = fans => UNLOCK.filter(x => fans >= x).length - 1;
const DRIVER_FEE = 300000;
const sentTag = p => p.sentiment < -0.3 ? '<span class="neg">挨骂中</span>' : p.sentiment > 0.4 ? '<span class="pos">被夸中</span>' : '<span style="color:var(--dim)">平静</span>';
const meter = (v, col) => `<span class="meter"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></span>`;

export class UI {
  constructor(game) { this.g = game; this.modal = $('modal'); }
  get s() { return this.g.state; }

  // ================= 基础 =================
  toast(text, cls = '') {
    const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = text;
    $('toasts').appendChild(el); if (cls === 'big') this.g.audio?.notify();
    setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = 0; setTimeout(() => el.remove(), 500); }, cls === 'big' ? 3800 : 2800);
  }
  showHud(on) { $('hud').classList.toggle('hidden', !on); }

  // 手机推送式通知
  push(title, sub = '', cls = '') {
    const el = document.createElement('div'); el.className = 'push ' + cls;
    const m = Math.floor(this.g.clockMin || 0);
    el.innerHTML = `<div class="app"><span>${cls === 'bad' ? '⚠ 饭圈热搜' : '📱 饭圈热搜'}</span><span>${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}</span></div><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    const box = $('pushes'); box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    this.g.audio?.notify();
    setTimeout(() => { el.style.transition = 'opacity .6s, transform .6s'; el.style.opacity = 0; el.style.transform = 'translateX(-20px)'; setTimeout(() => el.remove(), 600); }, cls === 'big' ? 7000 : 5500);
  }

  // 街头主播的直播采访：一句话选择
  streamerInterview(e) {
    const s = this.s;
    e.interviewed = true;
    this.achieve('stream');
    const hot = s.trending[0] || Object.keys(s.players)[0];
    this.open(`<h2>🔴 直播采访</h2><div class="sub">"各位家人们，我在战队总部门口遇到一位大粉！来聊两句？" —— 直播间 ${num(2000 + Math.random() * 8000)} 人在线</div>
      <div class="cards" style="grid-template-columns:1fr 1fr 1fr">
        <div class="card" data-a="praise"><span class="tag good">夸</span><div class="t">"${esc(hot)} 最近真的很拼"</div><div class="d">温和、讨喜，涨粉稳定</div></div>
        <div class="card" data-a="rant"><span class="tag evil">骂</span><div class="t">"${esc(hot)} 再这样打就别上了"</div><div class="d">直播间炸锅，涨粉多，争议度 +8</div></div>
        <div class="card" data-a="no"><span class="tag">婉拒</span><div class="t">"不好意思，不方便露脸"</div><div class="d">什么也不发生</div></div>
      </div>`, { esc: () => this.close() });
    this.on('[data-a]', 'click', (ev, el) => {
      const a = el.dataset.a, base = 200 + s.fans * 0.03;
      if (a === 'praise') { const f = Math.round(base); s.fans += f; this.toast(`直播间好评如潮，粉丝 +${f}`, 'good'); }
      if (a === 'rant') { const f = Math.round(base * (1.4 + Math.random())); s.fans += f; s.heat = Math.min(120, s.heat + 8); this.toast(`直播间吵翻了，粉丝 +${f}，争议度 +8`, 'bad'); }
      this.close();
    });
  }
  open(html, { cinematic = false, esc: escFn = null, cls = '' } = {}) {
    if (this.g.mode !== 'menu') this.g.mode = 'ui';
    this.cinematic = cinematic; this.escape = escFn;
    this.g.releaseMouse();
    this.modal.innerHTML = `<div class="panel ${cls}">${html}</div>`; this.modal.classList.remove('hidden');
    this.modal.querySelector('.panel').scrollTop = 0;
    this.settingsTab = null; this.slotDelete = null;
    this.g.focus?.reset();
    return this.modal.querySelector('.panel');
  }
  // 关闭面板；inDay=true 时回到 3D 行动
  close(inDay = true) {
    this.modal.classList.add('hidden'); this.modal.innerHTML = ''; this.escape = null; this.cinematic = false;
    if (inDay && this.g.day && this.g.mode === 'ui') { this.g.mode = 'play'; this.g.lockMouse(); }
  }
  on(sel, ev, fn) { this.modal.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => { this.g.audio?.click(); fn(e, el); })); }
  confirm(msg, yes, no = () => this.close()) {
    this.open(`<h2>确认</h2><p>${msg}</p><div class="row"><button class="btn pri" id="y">确定</button><button class="btn" id="n">取消</button></div>`, { esc: no });
    $('y').onclick = () => { this.close(false); yes(); }; $('n').onclick = no;
  }

  achieve(id) {
    const a = achGrant(id); if (!a) return;
    if (!$('hud').classList.contains('hidden')) this.push(`🏆 成就解锁：${a.name}`, a.desc, 'big');
    else this.toast(`🏆 成就解锁：${a.name}`, 'big');
  }

  // ================= HUD =================
  hud() {
    const s = this.s, g = this.g; if (!g.day) return;
    if (!this.h) this.h = { money: $('hud-money'), fans: $('hud-fans'), heat: $('hud-heat'), time: $('hud-time'), week: $('hud-week'), phase: $('hud-phase'), obj: $('objective'), inv: $('inventory') };
    const h = this.h, now = performance.now();
    h.money.textContent = won(s.money); h.money.style.color = s.money < 0 ? 'var(--bad)' : '';
    h.fans.textContent = num(s.fans);
    (h.club ||= $('hud-club')).textContent = s.club ?? 0;
    h.heat.style.width = Math.min(100, s.heat) + '%';
    const m = Math.floor(g.clockMin); h.time.textContent = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    h.week.textContent = `S${s.season} · 第${s.week}周`;
    h.phase.textContent = g.mode === 'photo' ? '拍照中' : '行动日';
    if (now - (this.lastSlow || 0) > 400) {
      this.lastSlow = now;
      h.obj.innerHTML = `<h4>赛季目标</h4>${this.goalLines().join('<br>')}${s.missions?.length ? `<h4 style="margin-top:8px">本周商单</h4>${this.missionLines().join('<br>')}` : ''}<div class="sub" style="margin-top:6px">今日：照片 ${g.day.photos.length} 张 · 行动 ${g.day.events.length} 次 · 争议度 ${Math.round(s.heat)}</div>`;
      h.inv.innerHTML = s.inventory.slice(0, 6).map(o => `<div class="inv"><b>${itemOf(o.item).name}</b> → ${esc(o.target)}</div>`).join('') + (s.inventory.length > 6 ? `<div class="inv">+${s.inventory.length - 6}</div>` : '');
      this.minimap();
      const opps = g.opps.hudList();
      $('opps').innerHTML = opps.map(o => `<div class="opp ${o.live ? 'live' : ''}"><span class="ic">${o.icon}</span><div><b>${esc(o.title)}</b><div class="w">${o.live ? '进行中 · ' : o.time + ' · '}${esc(o.where)}</div></div></div>`).join('');
      $('opps').style.top = (h.obj.offsetHeight + 28) + 'px';
    }
  }

  minimap() {
    const c = $('minimap-c'), x = c.getContext('2d'), g = this.g, big = g.bigMap;
    const el = $('minimap'), size = big ? 420 : 180;
    if (c.width !== size) { el.style.width = el.style.height = size + 'px'; el.style.borderRadius = big ? '16px' : '50%'; c.width = c.height = size; }
    const W = size, sc = big ? W / 470 : W / 160;
    const me = g.player.vehicle ? g.player.vehicle.root.position : g.player.pos;
    const cx = big ? 0 : me.x, cz = big ? 0 : me.z;
    const P = (px, pz) => [W / 2 + (px - cx) * sc, W / 2 + (pz - cz) * sc];
    x.fillStyle = '#0d1018'; x.fillRect(0, 0, W, W);
    x.fillStyle = '#2b3040';
    for (const r of ROADS) {
      const w = (r === 30 ? 26 : 14) * sc; let [a, b] = P(0, r); x.fillRect(0, b - w / 2, W, w);
      [a, b] = P(r, 0); x.fillRect(a - 7 * sc, 0, 14 * sc, W);
    }
    const pts = g.city.points, col = { shop: '#ff4f9a', garage: '#27e1ff', home: '#ffd34d', hq: '#ff2d55', print: '#b36bff', cafe: '#ff9f43', metro: '#4cc3ff', pcbang: '#38e08a' };
    for (const k in pts) {
      const p = pts[k]; if (!col[p.kind]) continue; const [a, b] = P(p.pos.x, p.pos.z);
      x.fillStyle = col[p.kind]; x.beginPath(); x.arc(a, b, big ? 7 : 5, 0, 7); x.fill();
      if (big) { x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.fillText(p.label, a + 9, b + 4); }
    }
    for (const o of g.opps.hudList()) {
      if (!o.pos) continue; const [a, b] = P(o.pos.x, o.pos.z);
      const pulse = o.live ? 6 + Math.sin(g.time * 6) * 2 : 5;
      x.strokeStyle = o.type === 'rival' ? '#27e1ff' : '#ffd34d'; x.lineWidth = 2; x.beginPath(); x.arc(a, b, pulse + 3, 0, 7); x.stroke();
      x.font = `${big ? 16 : 12}px sans-serif`; x.fillText(o.icon, a - 7, b + 5);
    }
    for (const t of g.trackers || []) { if (g.clockMin > t.until || !t.obj.parent) continue; const [a, b] = P(t.obj.position.x, t.obj.position.z); x.fillStyle = t.color; x.beginPath(); x.arc(a, b, big ? 7 : 5, 0, 7); x.fill(); }
    for (const v of g.vehicles) { if (v === g.player.vehicle) continue; const [a, b] = P(v.root.position.x, v.root.position.z); x.fillStyle = v.order || v.shown || v.ai ? '#ff8a00' : '#888'; x.fillRect(a - 3, b - 3, 6, 6); }
    const [a, b] = P(me.x, me.z), hd = g.player.vehicle ? g.player.vehicle.heading : g.player.facing;
    x.save(); x.translate(a, b); x.rotate(-hd + Math.PI); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(-5, 6); x.fill(); x.restore();
  }

  // ================= 目标 =================
  goals() {
    const s = this.s, G = s.goals || {}, out = [];
    if (s.season === 1) {
      const st = s.stance || {}, as = Sim.allStar(s);
      const benched = Object.values(s.players).find(p => p.benched && !p.sub && st[p.name]?.atk);
      const star = Object.entries(as).map(([, l]) => l[0]).find(p => st[p.name]?.sup);
      const done = !!(benched || star);
      out.push({ t: '让一名你骂过的选手被下放替补，或把一名你捧过的选手送进全明星', done, sub: done ? (benched ? `${benched.name} 被下放了` : `${star.name} 全明星投票第一`) : '心态<28 且低迷≥2 周会被下放；全明星看赛季末投票' });
      out.push({ t: `粉丝达到 ${num(G.fans || 20000)}`, done: s.fans >= (G.fans || 20000), sub: `当前 ${num(s.fans)}` });
    } else if (s.season === 2) {
      out.push({ t: `粉丝数超过对手粉头 ${s.rival.name}`, done: s.fans > s.rival.fans, sub: `你 ${num(s.fans)} vs ${num(s.rival.fans)}` });
      out.push({ t: '本赛季至少 2 次爆款', done: (s.seasonViral || 0) >= 2, sub: `已 ${s.seasonViral || 0} 次` });
    } else if (s.season === 3) {
      out.push({ t: `让主队 ${teamOf(s.fav).name} 夺冠`, done: s.champion === s.fav, sub: s.week < B.weeksPerSeason ? '第 10 周决赛（前两名进决赛）' : '' });
      out.push({ t: '粉丝达到 100K', done: s.fans >= 100000, sub: `当前 ${num(s.fans)}` });
    } else {
      const tgt = 100000 * Math.pow(2, s.season - 3);
      out.push({ t: `无尽模式：粉丝达到 ${num(tgt)}`, done: s.fans >= tgt, sub: `当前 ${num(s.fans)}` });
    }
    return out;
  }
  missionLines() {
    return (this.s.missions || []).map(m => { const d = MISSIONS.find(x => x.id === m.id); return `<span class="${m.done ? 'done' : ''}">${m.done ? '✔' : '◇'} ${esc(missionText(m))}</span> <span class="dim" style="font-size:11px">${rewardText(d.reward)}</span>`; });
  }

  goalLines() { return this.goals().map(g => `<span class="${g.done ? 'done' : ''}">${g.done ? '✔' : '○'} ${esc(g.t)}</span>${g.sub ? `<div class="sub">${esc(g.sub)}</div>` : ''}`); }

  // ================= 标题 =================
  keysLine() {
    const K = a => this.g.input.K(a);
    return this.g.input.device === 'pad'
      ? `左摇杆 移动 · 右摇杆 视角 · RT 奔跑/油门 · LT 刹车 · ${K('vehicle')} 上下车 · ${K('interact')} 互动/跳 · ${K('photo')} 拍照 · ${K('inventory')} 背包 · ${K('map')} 地图 · ${K('pause')} 菜单`
      : `${K('up')}${K('left')}${K('down')}${K('right')} 移动 · ${K('run')} 跑 · ${K('brake')} 跳（开车时刹车）· ${K('vehicle')} 上下车 · ${K('interact')} 互动 · ${K('photo')} 拍照 · ${K('inventory')} 背包 · ${K('map')} 地图 · ${K('objective')} 收起目标 · 滚轮 拉近/变焦 · ${K('pause')} 菜单`;
  }

  howto(back) {
    this.open(`<h2>玩法说明</h2>
      <div class="news"><b>每周</b>：看比赛 → 晚上 18:00–24:00 在首尔街头行动 → 回家发帖 → 周结算。</div>
      <div class="news"><b>行动</b>：去用品店买花圈、横幅、LED 卡车等道具，到选手所在的战队总部门口布置；骂谁、捧谁由你决定，随时可以粉转黑、黑转粉。</div>
      <div class="news"><b>拍照发帖</b>：掏出手机，把道具和标语拍进黄框；回家挑最好的照片，自己写文案发到社交平台，换粉丝和钱。</div>
      <div class="news"><b>更多玩法</b>：比赛日可以去现场举牌上直播；选手下班后可以跟着保姆车拍独家；打印店做周边、咖啡店办活动摆摊、地铁站租广告、网吧打榜全明星；汉江公园适合集会和放烟花。</div>
      <div class="news"><b>小心争议度</b>：太出格会被限流、封号，收到 3 封律师函就出局。</div>
      <div class="news">操作：${this.keysLine()}</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: true, esc: back });
    $('b').onclick = back;
  }

  // ================= 新游戏 =================
  newGame() {
    this.open(`<h2>选择你的主队</h2><div class="sub">你是谁的粉丝？主队决定第 3 赛季的目标。${teamOf(LEAGUE.hqA).name} 和 ${teamOf(LEAGUE.hqB).name} 的总部就在地图中央，其余战队在 ${LEAGUE.arena}。</div>
      <div class="cards">${TEAMS.map(t => `<div class="card" data-t="${t.id}" style="border-left:4px solid ${t.color}"><div class="t">${esc(t.name)}</div><div class="d">${t.players.map(p => esc(p[0])).join(' · ')}</div></div>`).join('')}</div>`, { cinematic: true, esc: () => this.mainMenu() });
    this.on('[data-t]', 'click', (e, el) => this.pickRoute(el.dataset.t));
  }

  // 选完主队直接选形象（不再选路线：骂谁、捧谁随时可以变，粉转黑、黑转粉都行）
  pickRoute(fav) {
    this.g.state = Sim.newGame(fav); this.s.inventory = [];
    this.s.goals = { fans: 20000 }; this.s.stance = {};
    this.pickLook();
  }

  pickLook(back = () => this.newGame()) {
    const s = this.s;
    s.look ||= 'josh';
    this.open(`<h2>选择你的形象</h2><div class="sub">路人不会和你撞脸。</div>
      <div class="looks">${[...REAL, 'michelle'].map(k => `<div class="card look ${s.look === k ? 'sel' : ''}" data-look="${k}"><img src="${charThumb(this.g, k)}" alt=""><div class="t">${CHAR_LABEL[k]}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="ok">就这个</button></div>`, { cinematic: true, esc: back, cls: 'wide2' });
    this.on('[data-look]', 'click', (e, el) => { s.look = el.dataset.look; this.modal.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('sel', x === el)); this.g.setPlayerLook(s.look); });
    $('ok').onclick = () => { this.g.setPlayerLook(s.look); this.save(); this.intro(); };
  }

  intro() {
    const s = this.s;
    this.open(`<h2>欢迎来到首尔</h2>
      <div class="news">你刚搬进战队总部附近的一间单间，手上有 ${won(s.money)} 存款和 ${s.fans} 个粉丝。</div>
      <div class="news">第 1 赛季目标：粉丝达到 2 万；再让一名你骂过的选手被下放替补，或者把一名你捧过的选手送进全明星（任选其一）。骂谁、捧谁随时可以变。</div>
      <h3>你的账号名</h3><input class="txt" id="handle" maxlength="16" value="@饭圈观察员">
      <h3>难度</h3><div class="seg" id="diff"><button data-d="easy">轻松</button><button data-d="normal" class="on">普通</button><button data-d="hard">困难</button></div>
      <div class="dim" style="font-size:12px;margin-top:6px">轻松：收入 +30%、争议度增长 -30% · 困难：收入 -20%、争议度增长 +25%（之后可以在设置里改）</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="go">看第 1 周比赛</button></div>`, { cinematic: true });
    s.difficulty = 'normal';
    this.modal.querySelectorAll('#diff button').forEach(b => b.onclick = () => { s.difficulty = b.dataset.d; this.modal.querySelectorAll('#diff button').forEach(x => x.classList.toggle('on', x === b)); this.g.audio.click(); });
    $('handle').onkeydown = e => e.stopPropagation();
    $('go').onclick = () => { const h = $('handle').value.trim(); s.handle = h ? (h.startsWith('@') ? h : '@' + h) : '@饭圈观察员'; s.playTime = 0; this.save(true); this.matchDay(); };
  }

  gameOver(msg) {
    const s = this.s;
    deleteSlot('auto');
    this.open(`<h2>游戏结束</h2><div class="news bad">${msg}</div>
      <div class="kv"><span>坚持到</span><b>第 ${s.season} 赛季 第 ${s.week} 周</b><span>最高粉丝</span><b>${num(s.fans)}</b><span>总曝光</span><b>${num(s.totalViews)}</b><span>爆款次数</span><b>${s.viralCount}</b></div>
      <div class="row" style="margin-top:16px"><button class="btn pri" id="t">回到标题</button></div>`, { cinematic: true });
    $('t').onclick = () => this.mainMenu();
  }

  // ================= 比赛日 =================
  matchDay(resume = false) {
    const s = this.s;
    this.showHud(false); this.g.day = null;
    this.g.audio.music('menu');
    if ((s.lawsuits || 0) >= 3) return this.gameOver('你第三次收到律师函，所有平台同时封杀了你的账号。博主生涯结束。');
    if (s.money < -5000000) return this.gameOver('你欠了太多钱，只能卖掉设备回老家。');
    if (!resume || !s.lastResults) {
      s.lastResults = Sim.playWeek(s);
      s.lastEvent = Sim.weeklyEvent(s);
      s.unlocked = unlockLevel(s.fans);
      if (s.week === B.weeksPerSeason) s.champion = s.lastResults[0].winner;
      s.weekStartFans = s.fans; s.weekStartMoney = s.money;
      rollMissions(s);
      const st = pickStory(s);
      s.pendingStory = st ? { id: st.story.id, t: st.t } : null;
      this.save();
    }
    this.open(this.matchDayView(), { cinematic: true, cls: 'wide' });
    $('go').onclick = () => this.beforeDay();
    $('pl').onclick = () => this.playerList(() => this.matchDay(true));
    if ($('live')) $('live').onclick = () => this.arenaLive(() => this.matchDay(true));
    $('menu').onclick = () => this.pause(() => this.matchDay(true));
  }

  playerList(back) {
    const s = this.s;
    const html = TEAMS.map(t => `<h3 style="color:${t.color}">${esc(t.name)}</h3>` + Object.values(s.players).filter(p => p.team === t.id && (!p.sub || !p.benched)).map(p =>
      `<span class="pl">${p.benched ? '🪑' : ''}<b>${esc(p.name)}</b> ${p.role} · 心态 ${meter(p.mood, p.mood < 30 ? 'var(--bad)' : 'var(--good)')} · ${sentTag(p)} · 评分 ${p.rating}</span>`).join('')).join('');
    this.open(`<h2>选手一览</h2><div class="sub">🪑 = 已被下放替补</div>${html}<div class="row" style="margin-top:14px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: true, esc: back });
    $('b').onclick = back;
  }

  // ================= 商店 =================
  shop(sel = null) {
    this.g.tutorial?.event('shopOpen');
    const s = this.s, lvl = unlockLevel(s.fans);
    sel = sel || (this.shopSel && itemOf(this.shopSel).unlock <= lvl ? this.shopSel : ITEMS.find(it => it.unlock <= lvl).id);
    this.shopSel = sel;
    const thumb = id => { try { return itemThumb(this.g, id); } catch (e) { console.warn(e); return ''; } };
    const cards = ITEMS.map(it => {
      const locked = it.unlock > lvl, cost = Sim.itemCost(s, it);
      const tag = it.kind === 'support' ? '<span class="tag good">应援</span>' : it.kind === 'both' ? '<span class="tag">黑/捧</span>' : '<span class="tag evil">抗议</span>';
      return `<div class="sc ${locked ? 'locked' : ''} ${sel === it.id ? 'sel' : ''}" data-i="${it.id}">${tag}<img src="${thumb(it.id)}" alt=""><div class="nm">${it.name}</div><div class="pr">${locked ? `🔒 粉丝 ${num(UNLOCK[it.unlock])}` : won(cost)}</div></div>`;
    }).join('');
    this.open(`<div class="shop"><div class="shop-l"><div class="hd"><b>应援 & 抗议用品店</b><span class="dim">资金 ${won(s.money)}</span></div><div class="sgrid">${cards}</div></div>
      <div class="shop-r" id="order"></div></div>`, { cls: 'wide', esc: () => this.close() });
    this.on('.sc[data-i]', 'click', (e, el) => { const it = itemOf(el.dataset.i); if (it.unlock > lvl) return; this.shop(it.id); });
    this.orderForm(itemOf(sel));
  }

  orderForm(it) {
    const s = this.s, cost = Sim.itemCost(s, it);
    const ps = Object.values(s.players).filter(p => !p.sub || !p.benched).sort((a, b) => b.heat - a.heat);
    const both = it.kind === 'both';
    const box = $('order');
    const bar = (label, v, max, col) => `<div class="sbar"><span>${label}</span><div><i style="width:${Math.min(100, Math.abs(v) / max * 100)}%;background:${col}"></i></div><b>${v > 0 && label !== '曝光力' ? '+' : ''}${v}</b></div>`;
    const warn = s.flags?.noExtreme && (it.id === 'eggs' || it.id === 'graffiti') ? '<div class="news bad">⚠ 你和 BOLT 签了"文明条款"，使用它会违约（-₩4,000,000）</div>' : '';
    box.innerHTML = `<img class="big" src="${itemThumb(this.g, it.id)}" alt="">
      <div class="ttl"><b>${it.name}</b><span class="pr">${won(cost)}</span></div>
      <div class="dim" style="font-size:13px;line-height:1.6">${it.desc}</div>
      <div class="stats">${bar('曝光力', it.impact, 120, 'var(--acc2)')}${bar('争议度', it.heat, 20, 'var(--bad)')}${bar('心态', it.kind === 'support' ? Math.abs(it.mood) : it.kind === 'both' ? Math.abs(it.mood) : -Math.abs(it.mood), 20, 'var(--warn)')}${it.cleanup ? `<div class="dim" style="font-size:12px">物业清洁费 ${won(it.cleanup)}（周结算扣除）</div>` : ''}</div>
      ${warn}
      <h3>目标</h3>
      <div class="row">${both ? `<select class="txt" id="kind" style="min-width:90px"><option value="attack">抗议</option><option value="support">应援</option></select>` : ''}
      <select class="txt" id="tgt" style="flex:1;min-width:0">${ps.map(p => `<option value="${esc(p.name)}">${esc(p.name)} · ${esc(teamOf(p.team).name)} ${p.role} · ${p.sentiment < -0.3 ? '挨骂中' : p.sentiment > 0.4 ? '被夸中' : '平静'} · 热度 ${Math.round(p.heat)}</option>`).join('')}</select></div>
      <h3>标语</h3>
      <div class="row"><input class="txt" id="txt" maxlength="24" style="flex:1;min-width:0"><button class="btn" id="rnd">换一句</button></div>
      <div class="sub" id="hint" style="margin-top:8px"></div>
      <div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn ghost" id="x">离开</button><button class="btn pri" id="buy" ${s.money < cost ? 'disabled' : ''}>购买 ${won(cost)}</button></div>`;
    $('x').onclick = () => this.close();
    $('txt').onkeydown = e => e.stopPropagation();
    const kindOf = () => both ? $('kind').value : it.kind;
    let si = 0;
    const fill = () => {
      const p = s.players[$('tgt').value], list = SLOGANS[kindOf()];
      $('txt').value = list[si % list.length].replace('{p}', p.name).replace('{t}', teamOf(p.team).name);
      const hqId = this.g.city.hq[p.team] ? p.team : 'ARENA';
      const where = hqId === 'ARENA' ? LEAGUE.arena : `${teamOf(p.team).name} 总部`;
      const match = kindOf() === 'attack' ? (p.sentiment < -0.3 ? '<span class="pos">他刚打崩，骂他大家会认同</span>' : p.sentiment > 0.4 ? '<span class="neg">他刚打得很好，骂他会被反噬</span>' : '舆论平静') : (p.sentiment > 0.4 ? '<span class="pos">他正被夸，应援很应景</span>' : '应援总是受欢迎的');
      $('hint').innerHTML = `使用地点：<b>${esc(where)}</b> · ${match}${it.truck ? ' · 买完去<b>车行</b>提车' : ''}`;
    };
    $('tgt').onchange = fill; if (both) $('kind').onchange = fill;
    $('rnd').onclick = () => { si++; fill(); };
    fill();
    $('buy').onclick = () => {
      if (s.money < cost) return;
      s.money -= cost; this.g.audio.coin();
      s.inventory.push({ item: it.id, target: $('tgt').value, text: $('txt').value.trim() || it.name, kind: kindOf() });
      this.toast(`已购买 ${it.name}`, 'good'); this.saveSoon(); this.g.tutorial?.event('ordered');
      this.shop(it.id);
    };
  }


  // ================= 车行 =================
  garage() {
    const s = this.s;
    const trucks = s.inventory.filter(o => itemOf(o.item).truck);
    const veh = VEHICLES.map(v => {
      const own = s.owned.includes(v.id), cur = s.vehicle === v.id;
      return `<div class="card ${cur ? 'sel' : ''}" data-v="${v.id}"><div class="t">${v.name}</div><div class="d">${v.desc} · 极速 ${v.speed}</div><div class="p">${cur ? '使用中' : own ? '切换（明天生效）' : won(v.price)}</div></div>`;
    }).join('');
    this.open(`<h2>车行 · 代驾</h2><div class="sub">资金 ${won(s.money)}</div>
      <h3>卡车订单</h3>${trucks.length ? trucks.map((o, i) => `<div class="news"><b>${itemOf(o.item).name}</b> → ${esc(o.target)} · “${esc(o.text)}”
        <div class="row" style="margin-top:8px"><button class="btn pri" data-self="${i}">自己开过去</button><button class="btn" data-drv="${i}" ${s.money < DRIVER_FEE ? 'disabled' : ''}>雇司机沿大路巡游（${won(DRIVER_FEE)}）</button></div></div>`).join('') : '<div class="sub">没有待提的卡车。LED 抗议卡车和咖啡应援车在用品店下单。</div>'}
      <h3>我的座驾</h3><div class="cards">${veh}</div>
      <h3>中介服务</h3><div class="cards">
        <div class="card" data-svc="lawyer"><div class="t">签约律师</div><div class="d">律师函赔偿减半，争议度每周多降 6 点。一次签约，长期有效。</div><div class="p">${s.lawyer ? '已签约' : won(5000000)}</div></div>
        <div class="card" data-svc="recruit"><div class="t">招募粉丝团（+25 人）</div><div class="d">在社区发招募帖。粉丝团越大，集会越有气势，帖子转发越多。当前 ${s.club} 人。</div><div class="p">${won(400000)}</div></div>
        <div class="card" data-svc="burner"><div class="t">买小号</div><div class="d">立刻解除所有平台的封号。</div><div class="p">${won(1000000)}</div></div>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn" id="x">离开</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
    this.on('[data-self]', 'click', (e, el) => { this.close(); this.g.spawnOrderTruck(trucks[+el.dataset.self], false); });
    this.on('[data-drv]', 'click', (e, el) => { if (s.money < DRIVER_FEE) return; s.money -= DRIVER_FEE; this.close(); this.g.spawnOrderTruck(trucks[+el.dataset.drv], true); });
    this.on('[data-v]', 'click', (e, el) => {
      const v = VEHICLES.find(x => x.id === el.dataset.v);
      if (!s.owned.includes(v.id)) { if (s.money < v.price) return this.toast('钱不够', 'bad'); s.money -= v.price; s.owned.push(v.id); this.g.audio.coin(); }
      s.vehicle = v.id; this.toast(`明天起使用 ${v.name}`, 'good'); this.saveSoon(); this.garage();
    });
    this.on('[data-svc]', 'click', (e, el) => {
      if (el.dataset.svc === 'lawyer' && !s.lawyer) { if (s.money < 5000000) return this.toast('钱不够', 'bad'); s.money -= 5000000; s.lawyer = true; }
      if (el.dataset.svc === 'recruit') { if (s.money < 400000) return this.toast('钱不够', 'bad'); s.money -= 400000; s.club += 25; this.toast(`粉丝团 +25 人（现在 ${s.club} 人）`, 'good'); }
      if (el.dataset.svc === 'burner') { if (s.money < 1000000) return this.toast('钱不够', 'bad'); s.money -= 1000000; s.banned = {}; this.toast('所有平台都能发帖了', 'good'); }
      this.g.audio.coin(); this.saveSoon(); this.garage();
    });
  }

  // ================= 在总部使用道具 =================
  locationOf(o) {
    if (o.item === 'billboard') return 'ARENA';
    const team = this.s.players[o.target]?.team;
    return this.g.city.hq[team] ? team : 'ARENA';
  }

  useItems(hqId) {
    const s = this.s, hq = this.g.city.hq[hqId];
    const here = o => hqId === 'PARK' ? Sim.PARK_PROPS.includes(itemOf(o.item).prop) : this.locationOf(o) === hqId;
    const list = s.inventory.filter(o => !itemOf(o.item).truck && here(o));
    const other = s.inventory.filter(o => !itemOf(o.item).truck && !here(o)).length;
    this.open(`<h2>${esc(hq.team.name)} ${hqId === 'ARENA' || hqId === 'PARK' ? '' : '总部门口'}</h2>${hqId === 'PARK' ? '<div class="news">集会、烟花、无人机、应援棒、灯牌、气球在这里曝光 ×1.35；但选手看不到，心态影响减半。</div>' : ''}
      <div class="sub">${list.length ? '选择要使用的道具。布置好后记得掏手机拍照（C）。' : '背包里没有能在这里用的道具。'}${other ? ` 还有 ${other} 件道具要去别的地点用。` : ''}</div>
      <div class="cards">${list.map((o, i) => { const it = itemOf(o.item); return `<div class="card" data-u="${i}"><span class="tag ${o.kind === 'support' ? 'good' : 'evil'}">${o.kind === 'support' ? '应援' : '抗议'}</span><div class="t">${it.name}</div><div class="d">→ ${esc(o.target)}<br>“${esc(o.text)}”</div></div>`; }).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn" id="x">离开</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
    this.on('[data-u]', 'click', (e, el) => { const o = list[+el.dataset.u]; this.close(false); this.g.useItem(o, hqId); });
  }

  inventory() {
    const s = this.s;
    this.open(`<h2>背包</h2>${s.inventory.length ? s.inventory.map(o => { const it = itemOf(o.item); const loc = it.truck ? '车行提车' : this.locationOf(o) === 'ARENA' ? LEAGUE.arena : teamOf(this.locationOf(o)).name + ' 总部'; return `<div class="news"><b>${it.name}</b> → ${esc(o.target)} · “${esc(o.text)}” <span style="color:var(--dim)">· 使用地点：${esc(loc)}</span></div>`; }).join('') : '<div class="sub">空的。去用品店买点东西吧。</div>'}
      <h3>今日照片（${this.g.day?.photos.length || 0}）</h3><div class="photos">${(this.g.day?.photos || []).map(p => `<div class="photo"><img src="${p.img}"><span class="q">${'★'.repeat(Math.max(1, Math.round(p.q * 3)))} ${esc(p.label)}</span></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="x">关闭</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
  }

  // ================= 发帖 =================
  publish() {
    const s = this.s, g = this.g, photos = g.day.photos, seen = {};
    const results = this.posts.map(x => {
      const photo = photos[x.i], ev = g.day.events.find(e => e.id === photo.eventId) || null;
      const key = ev?.id || 'none'; const extra = seen[key] || 0; seen[key] = extra + 1;
      const text = (x.text ?? '').trim();
      const cap = scoreCaption(text, { platform: x.platform, tone: x.tone, ev, s, history: s.capHistory || [] });
      const r = Sim.evaluatePost(s, { photo, ev, platform: x.platform, tone: x.tone, extraPlatform: extra, captionK: cap.k });
      Sim.commitPost(s, r);
      if (cap.heat) s.heat = Math.min(100, s.heat + cap.heat);
      s.capHistory = [...(s.capHistory || []), text].slice(-5);
      if (r.viral) s.seasonViral = (s.seasonViral || 0) + 1;
      return { ...r, photo, platform: x.platform, tone: x.tone, ev, text, cap };
    });
    this.posts = [];
    if (results.length) { this.achieve('first_post'); this.g.tutorial?.event('posted'); }
    if (results.some(r => r.viral)) this.achieve('viral'); if ((s.viralCount || 0) >= 5) this.achieve('viral5');
    this.save();
    this.showResults(results);
  }

  // ================= 周结算 =================
  weekSummary(results) {
    const s = this.s;
    const g = this.g, lawsuits0 = s.lawsuits || 0;
    // 商单
    const ctx = { s, photos: g.day?.photos || [], events: g.day?.events || [], results };
    const mlog = [];
    for (const m of s.missions || []) {
      if (m.done) continue;
      const d = MISSIONS.find(x => x.id === m.id);
      if (d.check({ ...ctx, n: m.n })) {
        m.done = true; s.missionsDone = (s.missionsDone || 0) + 1;
        if (d.reward.money) s.money += d.reward.money; if (d.reward.fans) s.fans += d.reward.fans; if (d.reward.skill) s.skillPoints += d.reward.skill;
        mlog.push({ t: `✅ 商单完成：${missionText(m)}（${rewardText(d.reward)}）`, c: 'good' });
      }
    }
    const log = [...mlog, ...Sim.endOfWeek(s, results)];
    s.unlocked = unlockLevel(s.fans);
    if ((s.lawsuits || 0) > lawsuits0) this.achieve('lawsuit');
    if (s.fans >= 10000) this.achieve('fans10k'); if (s.fans >= 100000) this.achieve('fans100k');
    if (s.money >= 50000000) this.achieve('rich'); if (s.missionsDone >= 10) this.achieve('missions');
    if (s.season === 1 && Object.values(s.players).some(p => p.benched && !p.sub && s.stance?.[p.name]?.atk)) this.achieve('benched');
    this.save();
    this.weekSummaryView(log);
  }

  weekSummaryView(log) {
    const s = this.s;
    const lines = log.map(l => `<div class="ledger ${l.c}">${esc(l.t)}</div>`).join('');
    const delta = (v, v0, fmt) => v0 == null ? '' : `<em class="${v - v0 >= 0 ? 'pos' : 'neg'}">${v - v0 >= 0 ? '+' : '-'}${fmt(Math.abs(v - v0))}</em>`;
    const kpi = (label, val, d, extra = '') => `<div class="kpi"><span>${label}</span><b>${val}</b>${d}${extra}</div>`;
    const tot = Math.max(1, s.fans + s.rival.fans), mine = s.fans / tot * 100;
    this.open(`<div class="wsum">
      <div class="wk-l">
        <div class="hd"><b>第 ${s.week} 周结算</b><span class="dim">S${s.season}</span></div>
        <div class="kpis">${kpi('资金', won(s.money), delta(s.money, s.weekStartMoney, v => '₩' + num(v)))}${kpi('粉丝', num(s.fans), delta(s.fans, s.weekStartFans, num))}${kpi('粉丝团', s.club ?? 0, '')}${kpi('争议度', Math.round(s.heat), '', `<div class="hb"><i style="width:${Math.min(100, s.heat)}%"></i></div>`)}</div>
        <div class="vs"><span>你 ${num(s.fans)}</span><div class="vsbar"><i style="width:${mine}%"></i></div><span>${esc(s.rival.name)} ${num(s.rival.fans)}</span></div>
        <h3>本周账单与动态</h3>${lines || '<div class="dim">平静的一周。</div>'}
      </div>
      <div class="wk-r">
        <h3>技能 <span class="dim">可用 ${s.skillPoints} 点 · 下一点在 ${num(s.nextSkillAt)} 粉</span></h3>
        <div class="skills">${SKILLS.map(k => { const lv = s.skills[k.id], cost = k.cost[lv], can = lv < k.max && s.skillPoints >= cost; return `<div class="sk ${can ? 'can' : ''}" data-k="${k.id}"><div><b>${k.name}</b> <span class="pips">${'●'.repeat(lv)}${'○'.repeat(k.max - lv)}</span><div class="dim">${k.desc}</div></div><span class="cost">${lv >= k.max ? 'MAX' : `${cost} 点`}</span></div>`; }).join('')}</div>
        <h3>赛季目标</h3><div class="goals2">${this.goalLines().join('<br>')}</div>
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn pri" id="go">${s.week >= B.weeksPerSeason ? '赛季结算 →' : '下一周 →'}</button></div>
      </div></div>`, { cinematic: true, cls: 'wide' });
    this.on('[data-k]', 'click', (e, el) => {
      const k = SKILLS.find(x => x.id === el.dataset.k), lv = s.skills[k.id], cost = k.cost[lv];
      if (lv >= k.max || s.skillPoints < cost) return;
      s.skillPoints -= cost; s.skills[k.id]++; this.save(); this.weekSummaryView(log);
    });
    $('go').onclick = () => {
      if (s.week >= B.weeksPerSeason) return this.seasonEnd();
      s.week++; s.lastResults = null; this.save(); this.matchDay();
    };
  }

  // ================= 赛季结算 =================
  seasonEnd() {
    const s = this.s, goals = this.goals(), done = goals.filter(g => g.done).length;
    const grade = done === goals.length ? 'S' : done > 0 ? 'B' : 'C';
    const as = Sim.allStar(s);
    const reward = grade === 'S' ? 10000000 : grade === 'B' ? 3000000 : 0;
    if (s.champion === s.fav) this.achieve('champion');
    if (s.season === 1 && goals[0]?.done && !Object.values(s.players).some(p => p.benched && s.stance?.[p.name]?.atk)) this.achieve('allstar');
    this.open(`<h2>第 ${s.season} 赛季结束 · 评级 <span style="color:${grade === 'S' ? 'var(--good)' : grade === 'B' ? 'var(--warn)' : 'var(--bad)'}">${grade}</span></h2>
      <div class="news">🏆 冠军：<b style="color:${teamOf(s.champion).color}">${esc(teamOf(s.champion)?.name || '-')}</b></div>
      <h3>目标</h3><div style="font-size:14px;line-height:1.7">${this.goalLines().join('<br>')}</div>
      <h3>全明星首发</h3><div>${Object.entries(as).map(([r, l]) => `<span class="pl">${r} <b>${esc(l[0].name)}</b></span>`).join('')}</div>
      <h3>本季数据</h3><div class="kv"><span>粉丝</span><b>${num(s.fans)}</b><span>累计曝光</span><b>${num(s.totalViews)}</b><span>爆款</span><b>${s.seasonViral || 0} 次</b><span>赛季奖励（商单续约）</span><b>${won(reward)}</b></div>
      <div class="row" style="margin-top:16px"><button class="btn pri" id="go">进入第 ${s.season + 1} 赛季 →</button></div>`, { cinematic: true });
    $('go').onclick = () => {
      s.money += reward;
      s.season++; s.week = 1; s.lastResults = null; s.seasonViral = 0; s.champion = null; s.results = [];
      for (const k in s.teams) Object.assign(s.teams[k], { w: 0, l: 0, gw: 0, gl: 0 });
      for (const p of Object.values(s.players)) { p.mood = 70; p.form = 0; p.votes = 0; p.weeksBad = 0; if (!p.sub) p.benched = false; else { p.benched = true; p.replacing = null; } p.skill = Math.max(60, Math.min(97, p.skill + Math.round((Math.random() - 0.5) * 6))); }
      s.rival.fans = Math.max(s.rival.fans, Math.round(s.fans * 1.1));
      if (s.season === 4 && !s.endingSeen) { s.endingSeen = true; this.save(); return this.ending(() => this.matchDay()); }
      this.save(); this.matchDay();
    };
  }
}

Object.assign(UI.prototype, Screens, Menus, Places);
