import { TEAMS, ITEMS, PLATFORMS, TONES, SKILLS, VEHICLES, LEAGUE, SLOGANS, BALANCE as B } from '../content/data.js';
import * as Sim from '../sim/sim.js';

const $ = id => document.getElementById(id);
const won = n => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString();
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const teamOf = id => TEAMS.find(t => t.id === id) || { name: id, color: '#888' };
const itemOf = id => ITEMS.find(i => i.id === id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNLOCK = [0, 1500, 6000, 15000, 35000, 60000, 100000];
export const unlockLevel = fans => UNLOCK.filter(x => fans >= x).length - 1;
const SAVE = 'fr_save_v1';
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
  open(html, { cinematic = false, esc: escFn = null } = {}) {
    if (this.g.mode !== 'menu') this.g.mode = 'ui';
    this.cinematic = cinematic; this.escape = escFn;
    this.g.releaseMouse();
    this.modal.innerHTML = `<div class="panel">${html}</div>`; this.modal.classList.remove('hidden');
    this.modal.querySelector('.panel').scrollTop = 0;
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

  save() { try { localStorage.setItem(SAVE, JSON.stringify(this.s)); } catch (e) { console.warn(e); } }
  saveSoon() { clearTimeout(this.st); this.st = setTimeout(() => this.save(), 500); }
  load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); return s && s.v === 1 ? s : null; } catch { return null; } }

  // ================= HUD =================
  hud() {
    const s = this.s, g = this.g; if (!g.day) return;
    if (!this.h) this.h = { money: $('hud-money'), fans: $('hud-fans'), heat: $('hud-heat'), time: $('hud-time'), week: $('hud-week'), phase: $('hud-phase'), obj: $('objective'), inv: $('inventory') };
    const h = this.h, now = performance.now();
    h.money.textContent = won(s.money); h.money.style.color = s.money < 0 ? 'var(--bad)' : '';
    h.fans.textContent = num(s.fans);
    h.heat.style.width = Math.min(100, s.heat) + '%';
    const m = Math.floor(g.clockMin); h.time.textContent = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    h.week.textContent = `S${s.season} · 第${s.week}周`;
    h.phase.textContent = g.police.length ? '🚨 被追捕中' : g.mode === 'photo' ? '拍照中' : g.mode === 'aim' ? '瞄准中' : '行动日';
    if (now - (this.lastSlow || 0) > 400) {
      this.lastSlow = now;
      h.obj.innerHTML = `<h4>赛季目标</h4>${this.goalLines().join('<br>')}<div class="sub" style="margin-top:6px">今日：照片 ${g.day.photos.length} 张 · 行动 ${g.day.events.length} 次 · 关注度 ${Math.round(s.heat)}</div>`;
      h.inv.innerHTML = s.inventory.slice(0, 6).map(o => `<div class="inv"><b>${itemOf(o.item).name}</b> → ${esc(o.target)}</div>`).join('') + (s.inventory.length > 6 ? `<div class="inv">+${s.inventory.length - 6}</div>` : '');
      this.minimap();
    }
  }

  minimap() {
    const c = $('minimap-c'), x = c.getContext('2d'), g = this.g, big = g.bigMap;
    const el = $('minimap'), size = big ? 420 : 180;
    if (c.width !== size) { el.style.width = el.style.height = size + 'px'; el.style.borderRadius = big ? '16px' : '50%'; c.width = c.height = size; }
    const W = size, sc = big ? W / 340 : W / 160;
    const me = g.player.vehicle ? g.player.vehicle.root.position : g.player.pos;
    const cx = big ? 0 : me.x, cz = big ? 0 : me.z;
    const P = (px, pz) => [W / 2 + (px - cx) * sc, W / 2 + (pz - cz) * sc];
    x.fillStyle = '#0d1018'; x.fillRect(0, 0, W, W);
    x.fillStyle = '#2b3040';
    for (const r of [-150, -90, -30, 30, 90, 150]) {
      const w = (r === 30 ? 26 : 14) * sc; let [a, b] = P(0, r); x.fillRect(0, b - w / 2, W, w);
      [a, b] = P(r, 0); x.fillRect(a - 7 * sc, 0, 14 * sc, W);
    }
    const pts = g.city.points, col = { shop: '#ff4f9a', garage: '#27e1ff', home: '#ffd34d', hq: '#ff2d55' };
    for (const k in pts) {
      const p = pts[k]; if (!col[p.kind]) continue; const [a, b] = P(p.pos.x, p.pos.z);
      x.fillStyle = col[p.kind]; x.beginPath(); x.arc(a, b, big ? 7 : 5, 0, 7); x.fill();
      if (big) { x.fillStyle = '#fff'; x.font = '12px sans-serif'; x.fillText(p.label, a + 9, b + 4); }
    }
    for (const v of g.vehicles) { if (v === g.player.vehicle) continue; const [a, b] = P(v.root.position.x, v.root.position.z); x.fillStyle = v.police ? (Math.floor(g.time * 4) % 2 ? '#f00' : '#04f') : v.order || v.shown || v.ai ? '#ff8a00' : '#888'; x.fillRect(a - 3, b - 3, 6, 6); }
    const [a, b] = P(me.x, me.z), hd = g.player.vehicle ? g.player.vehicle.heading : g.player.facing;
    x.save(); x.translate(a, b); x.rotate(-hd + Math.PI); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 6); x.lineTo(-5, 6); x.fill(); x.restore();
  }

  // ================= 目标 =================
  goals() {
    const s = this.s, G = s.goals || {}, out = [];
    if (s.season === 1) {
      const p = s.players[G.target];
      if (G.route === 'attack') out.push({ t: `让 ${G.target} 被下放替补`, done: !!p?.benched, sub: p ? `心态 ${Math.round(p.mood)} · 连续低迷 ${p.weeksBad} 周（心态<28 且低迷≥2 周会被下放）` : '' });
      else { const as = Sim.allStar(s)[p.role === 'SUB' ? 'MID' : p.role]; const rank = as.findIndex(x => x.name === G.target) + 1; out.push({ t: `把 ${G.target} 捧进全明星`, done: rank === 1, sub: `${p.role} 位置投票排名第 ${rank}` }); }
      out.push({ t: `粉丝达到 ${num(G.fans)}`, done: s.fans >= G.fans, sub: `当前 ${num(s.fans)}` });
    } else if (s.season === 2) {
      out.push({ t: `粉丝数超过对手粉头 ${s.rival.name}`, done: s.fans > s.rival.fans, sub: `你 ${num(s.fans)} vs ${num(s.rival.fans)}` });
      out.push({ t: '本赛季至少 2 次爆款', done: (s.seasonViral || 0) >= 2, sub: `已 ${s.seasonViral || 0} 次` });
    } else if (s.season === 3) {
      out.push({ t: `让主队 ${teamOf(s.fav).name} 夺冠`, done: s.champion === s.fav, sub: s.week < B.weeksPerSeason ? '第 10 周决赛（前两名进决赛）' : '' });
      out.push({ t: '粉丝达到 150K', done: s.fans >= 150000, sub: `当前 ${num(s.fans)}` });
    } else {
      const tgt = 150000 * Math.pow(2, s.season - 3);
      out.push({ t: `无尽模式：粉丝达到 ${num(tgt)}`, done: s.fans >= tgt, sub: `当前 ${num(s.fans)}` });
    }
    return out;
  }
  goalLines() { return this.goals().map(g => `<span class="${g.done ? 'done' : ''}">${g.done ? '✔' : '○'} ${esc(g.t)}</span>${g.sub ? `<div class="sub">${esc(g.sub)}</div>` : ''}`); }

  // ================= 标题 =================
  title() {
    this.g.mode = 'menu'; this.showHud(false); this.g.day = null;
    const has = !!this.load();
    this.open(`<div style="text-align:center;padding:20px 0">
      <div class="logo">饭圈风云<small>FANDOM RIOT · SEOUL</small></div>
      <p class="sub" style="margin-top:18px">你是首尔的一个电竞粉丝博主。开卡车、送花圈、放烟花……甚至扛火箭筒。<br>用镜头把这一切变成流量。（战队与选手均为虚构）</p>
      <div class="title-menu">
        ${has ? '<button class="btn pri" id="cont">继续游戏</button>' : ''}
        <button class="btn ${has ? '' : 'pri'}" id="new">新游戏</button>
        <button class="btn" id="howto">玩法说明</button>
        <button class="btn" id="set">设置</button>
      </div></div>`, { cinematic: true });
    this.modal.querySelector('.panel').style.background = 'rgba(10,12,20,.55)';
    if (has) $('cont').onclick = () => { this.g.state = this.load(); this.s.inventory ||= []; this.close(false); this.matchDay(true); };
    $('new').onclick = () => (has ? this.confirm('开始新游戏会覆盖现有存档，确定？', () => this.newGame(), () => this.title()) : this.newGame());
    $('howto').onclick = () => this.howto(() => this.title());
    $('set').onclick = () => this.settings(() => this.title());
  }

  howto(back) {
    this.open(`<h2>玩法说明</h2>
      <div class="news">每周流程：<b>比赛日</b>（看赛果，谁打崩了、谁封神）→ <b>行动日</b>（18:00-24:00 在首尔街头行动）→ <b>发帖</b>（挑照片发到平台，换曝光、粉丝和钱）→ <b>周结算</b>。</div>
      <div class="news">曝光 = 道具冲击力 × 照片质量 × 话题热度 × <b>情绪匹配</b> × 新鲜度 × 平台偏好 × 运气。骂刚打崩的人，大家认同；骂刚拿 MVP 的人，会被反噬掉粉。同一招反复用，看的人越来越少。偶尔会莫名其妙爆火，也会石沉大海。</div>
      <div class="news">照片质量看：主体是否在画面里、标语能否看清、队标和总部招牌有没有入镜、有没有围观人群、有没有拍到爆炸或烟花的瞬间。</div>
      <div class="news bad">关注度：极端道具会让关注度飙升。≥50 限流，≥75 封号，≥100 被捕。被捕 3 次游戏结束。用了炸弹和火箭筒，警察会来追你 —— 开车甩开他们（距离 70 米以上坚持 8 秒）。</div>
      <div class="news good">你的行动会影响选手心态 → 影响比赛 → 影响热度。把选手骂到下放替补、把喜欢的选手捧进全明星、帮主队夺冠，都靠你。</div>
      <div class="news">操作：WASD 移动/开车 · Shift 跑 · 空格 刹车 · F 上下车 · E 互动 · C 手机拍照 · Tab 背包 · M 大地图 · 鼠标 视角 · 滚轮 拉近拉远/变焦 · Esc 菜单</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: true, esc: back });
    $('b').onclick = back;
  }

  settings(back) {
    const q = this.g.renderer.quality;
    this.open(`<h2>设置</h2>
      <h3>画质</h3><div class="row"><button class="btn ${q === 'high' ? 'pri' : ''}" data-q="high">高（环境光遮蔽）</button><button class="btn ${q === 'mid' ? 'pri' : ''}" data-q="mid">中（更流畅）</button></div>
      <h3>音量</h3><input type="range" min="0" max="1" step="0.05" value="${this.g.audio.vol}" id="vol" style="width:300px;pointer-events:auto">
      <div class="row" style="margin-top:18px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: this.g.mode === 'menu', esc: back });
    this.on('[data-q]', 'click', (e, el) => { if (el.dataset.q !== q) { if (this.s) this.save(); this.g.renderer.setQuality(el.dataset.q); } });
    $('vol').oninput = e => this.g.audio.setVol(+e.target.value);
    $('b').onclick = back;
  }

  pause() {
    this.open(`<h2>暂停</h2><div class="row" style="flex-direction:column;align-items:stretch;max-width:320px">
      <button class="btn pri" id="r">继续</button><button class="btn" id="h">玩法说明</button><button class="btn" id="st">设置</button>
      <button class="btn" id="home">直接回家（结束今天）</button><button class="btn ghost" id="q">保存并回到标题</button></div>`, { esc: () => this.close() });
    $('r').onclick = () => this.close();
    $('h').onclick = () => this.howto(() => this.pause());
    $('st').onclick = () => this.settings(() => this.pause());
    $('home').onclick = () => { this.close(); this.g.endDay(); };
    $('q').onclick = () => { this.save(); location.reload(); };
  }

  // ================= 新游戏 =================
  newGame() {
    this.open(`<h2>选择你的主队</h2><div class="sub">你是谁的粉丝？主队决定第 3 赛季的目标。${teamOf(LEAGUE.hqA).name} 和 ${teamOf(LEAGUE.hqB).name} 的总部就在地图中央，其余战队在 ${LEAGUE.arena}。</div>
      <div class="cards">${TEAMS.map(t => `<div class="card" data-t="${t.id}" style="border-left:4px solid ${t.color}"><div class="t">${esc(t.name)}</div><div class="d">${esc(t.full)}<br>${t.players.map(p => esc(p[0])).join(' · ')}</div></div>`).join('')}</div>`, { cinematic: true, esc: () => this.title() });
    this.on('[data-t]', 'click', (e, el) => this.pickRoute(el.dataset.t));
  }

  pickRoute(fav) {
    this.g.state = Sim.newGame(fav); this.s.inventory = [];
    const all = Object.values(this.s.players).filter(p => !p.sub);
    const opts = all.map(p => `<option value="${esc(p.name)}">${esc(p.name)}（${esc(teamOf(p.team).name)} ${p.role}）</option>`).join('');
    this.open(`<h2>第 1 赛季：选择你的路线</h2><div class="sub">两条路线都要求赛季结束时粉丝 ≥ 20,000。选好目标后点击卡片。</div>
      <div class="cards" style="grid-template-columns:1fr 1fr">
        <div class="card" data-r="attack"><span class="tag evil">黑粉路线</span><div class="t">把某人骂下首发</div><div class="d">持续给目标施压，让他心态崩掉、状态低迷，直到教练把他下放替补。</div><select class="txt" id="ta">${opts}</select></div>
        <div class="card" data-r="support"><span class="tag good">真爱粉路线</span><div class="t">把某人捧进全明星</div><div class="d">用应援提升他的人气和心态，让他在赛季末全明星投票里拿到所在位置第一。</div><select class="txt" id="ts">${opts}</select></div>
      </div>`, { cinematic: true, esc: () => this.newGame() });
    const ta = $('ta'), ts = $('ts');
    ta.value = all.find(p => p.team === LEAGUE.hqB && p.role === 'ADC')?.name || all[0].name;
    ts.value = all.find(p => p.team === fav && p.role === 'MID')?.name || all[0].name;
    for (const sel of [ta, ts]) sel.onclick = e => e.stopPropagation();
    this.on('[data-r]', 'click', (e, el) => {
      const r = el.dataset.r; this.s.goals = { route: r, target: r === 'attack' ? ta.value : ts.value, fans: 20000 };
      this.save(); this.intro();
    });
  }

  intro() {
    const s = this.s;
    this.open(`<h2>欢迎来到首尔</h2>
      <div class="news">你刚搬进战队总部附近的一间单间，手上有 ${won(s.money)} 存款和 ${s.fans} 个粉丝。</div>
      <div class="news">${s.goals.route === 'attack' ? `你的目标：让 <b>${esc(s.goals.target)}</b> 被下放替补。` : `你的目标：把 <b>${esc(s.goals.target)}</b> 捧进全明星。`}</div>
      <div class="news">第一周建议：去用品店（地图粉色点）买花圈或横幅 → 去目标所在的总部门口布置 → 按 C 掏手机拍照（让标语、队标和围观的人都入镜）→ 回家发帖。</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="go">看第 1 周比赛</button></div>`, { cinematic: true });
    $('go').onclick = () => this.matchDay();
  }

  gameOver(msg) {
    const s = this.s;
    localStorage.removeItem(SAVE);
    this.open(`<h2>游戏结束</h2><div class="news bad">${msg}</div>
      <div class="kv"><span>坚持到</span><b>第 ${s.season} 赛季 第 ${s.week} 周</b><span>最高粉丝</span><b>${num(s.fans)}</b><span>总曝光</span><b>${num(s.totalViews)}</b><span>爆款次数</span><b>${s.viralCount}</b></div>
      <div class="row" style="margin-top:16px"><button class="btn pri" id="t">回到标题</button></div>`, { cinematic: true });
    $('t').onclick = () => this.title();
  }

  // ================= 比赛日 =================
  matchDay(resume = false) {
    const s = this.s;
    this.showHud(false); this.g.day = null;
    if (s.arrests >= 3) return this.gameOver('你第三次被捕，被禁止接近任何战队总部。博主生涯结束。');
    if (s.money < -5000000) return this.gameOver('你欠了太多钱，只能卖掉设备回老家。');
    if (!resume || !s.lastResults) {
      s.lastResults = Sim.playWeek(s);
      s.lastEvent = Sim.weeklyEvent(s);
      s.unlocked = unlockLevel(s.fans);
      if (s.week === B.weeksPerSeason) s.champion = s.lastResults[0].winner;
      this.save();
    }
    const res = s.lastResults, P = s.players;
    const row = m => {
      const A = teamOf(m.a), Bt = teamOf(m.b), focus = m.a === s.fav || m.b === s.fav;
      return `<div class="match ${focus ? 'focus' : ''}"><div><b style="color:${A.color}">${esc(A.name)}</b></div><div class="sc">${m.wa} : ${m.wb}</div><div class="r"><b style="color:${Bt.color}">${esc(Bt.name)}</b></div>
        <div style="grid-column:1/4;font-size:12px;color:var(--dim)">MVP <span class="pos">${esc(m.mvp)}</span>（${m.flavor.mvp}）· 背锅 <span class="neg">${esc(m.worst)}</span>（${m.flavor.worst}）</div></div>`;
    };
    const trend = s.trending.length ? s.trending : Object.values(P).sort((a, b) => b.heat - a.heat).slice(0, 8).map(p => p.name);
    const st = Sim.standings(s);
    const final = s.week === B.weeksPerSeason;
    this.open(`<h2>${final ? '🏆 总决赛' : `第 ${s.week} 周 比赛结果`}</h2><div class="sub">S${s.season} · ${LEAGUE.full}${final ? ` · 冠军：<b style="color:${teamOf(s.champion).color}">${esc(teamOf(s.champion).name)}</b>` : ''}</div>
      ${res.map(row).join('')}
      <div class="news ${s.lastEvent.id === 'rage' || s.lastEvent.id === 'injury' ? 'bad' : ''}">📰 ${esc(s.lastEvent.text)}</div>
      <div class="row" style="align-items:flex-start;gap:18px">
        <div style="flex:1;min-width:300px"><h3>🔥 热搜榜</h3>${trend.map((n, i) => { const p = P[n]; return `<div class="pl" style="display:flex;justify-content:space-between"><span>${i + 1}. <b>${esc(n)}</b> <span style="color:var(--dim)">${esc(teamOf(p.team).name)}</span></span><span>${sentTag(p)} 评分 <b>${p.rating}</b> 热度 ${meter(p.heat, 'var(--acc)')}</span></div>`; }).join('')}</div>
        <div style="width:260px"><h3>积分榜</h3><table class="t">${st.slice(0, 10).map((t, i) => `<tr class="${t.id === s.fav ? 'me' : ''}"><td>${i + 1}</td><td style="color:${teamOf(t.id).color}">${esc(teamOf(t.id).name)}</td><td>${t.w}-${t.l}</td></tr>`).join('')}</table></div>
      </div>
      <h3>赛季目标</h3><div style="font-size:13px;line-height:1.6">${this.goalLines().join('<br>')}</div>
      <div class="row" style="margin-top:16px"><button class="btn pri" id="go">进入行动日 →</button><button class="btn" id="pl">查看所有选手</button><button class="btn ghost" id="menu">回到标题</button></div>`, { cinematic: true });
    $('go').onclick = () => { this.close(false); this.g.startDay(); };
    $('pl').onclick = () => this.playerList(() => this.matchDay(true));
    $('menu').onclick = () => { this.save(); this.title(); };
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
    const s = this.s, lvl = unlockLevel(s.fans);
    const cards = ITEMS.map(it => {
      const locked = it.unlock > lvl, cost = Sim.itemCost(s, it);
      const tag = it.ext ? '<span class="tag ext">极端</span>' : it.kind === 'support' ? '<span class="tag good">应援</span>' : it.kind === 'both' ? '<span class="tag">黑/捧</span>' : '<span class="tag evil">抗议</span>';
      return `<div class="card ${locked ? 'locked' : ''} ${sel === it.id ? 'sel' : ''}" data-i="${it.id}">${tag}<div class="t">${it.name}</div><div class="d">${it.desc}</div>
        <div class="p">${locked ? `🔒 粉丝 ${num(UNLOCK[it.unlock])} 解锁` : won(cost)}</div><div class="sub" style="font-size:11px">曝光力 ${it.impact} · 关注度 +${it.heat}</div></div>`;
    }).join('');
    this.open(`<h2>응원·항의 용품 SHOP</h2><div class="sub">资金 ${won(s.money)} · 选一件道具，再选目标选手和标语。卡车类道具买完去车行提车。</div>
      <div class="cards">${cards}</div><div id="order"></div>
      <div class="row" style="margin-top:14px"><button class="btn" id="x">离开</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
    this.on('.card[data-i]', 'click', (e, el) => { const it = itemOf(el.dataset.i); if (it.unlock > lvl) return; this.shop(it.id); });
    if (sel) this.orderForm(itemOf(sel));
  }

  orderForm(it) {
    const s = this.s, cost = Sim.itemCost(s, it);
    const ps = Object.values(s.players).filter(p => !p.sub || !p.benched).sort((a, b) => b.heat - a.heat);
    const both = it.kind === 'both';
    const box = $('order');
    box.innerHTML = `<h3>下单：${it.name}（${won(cost)}）</h3>
      <div class="row">${both ? `<select class="txt" id="kind" style="min-width:120px"><option value="attack">抗议</option><option value="support">应援</option></select>` : ''}
      <select class="txt" id="tgt">${ps.map(p => `<option value="${esc(p.name)}">${esc(p.name)} · ${esc(teamOf(p.team).name)} ${p.role} · ${p.sentiment < -0.3 ? '挨骂中' : p.sentiment > 0.4 ? '被夸中' : '平静'} · 热度 ${Math.round(p.heat)}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:8px"><input class="txt" id="txt" maxlength="24" style="min-width:420px"><button class="btn" id="rnd">换一句</button></div>
      <div class="sub" id="hint" style="margin-top:6px"></div>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="buy" ${s.money < cost ? 'disabled' : ''}>购买 ${won(cost)}</button></div>`;
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
      this.toast(`已购买 ${it.name}`, 'good'); this.saveSoon();
      this.shop();
    };
    box.scrollIntoView({ behavior: 'smooth' });
  }

  // ================= 车行 =================
  garage() {
    const s = this.s, trucks = s.inventory.filter(o => it