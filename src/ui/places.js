// 地图上的功能地点：打印店、粉丝咖啡店、地铁站广告位、网吧（全明星投票）
import * as THREE from 'three';
import { TEAMS, SLOGANS } from '../content/data.js';
import * as Sim from '../sim/sim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const won = n => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString();
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const teamOf = id => TEAMS.find(t => t.id === id) || { name: id };

const MERCH = {
  sticker: { name: '贴纸', cost: 300000, stock: 200, unit: 6000 },
  slogan: { name: '手幅', cost: 600000, stock: 100, unit: 18000 },
  acrylic: { name: '亚克力立牌', cost: 1200000, stock: 80, unit: 35000 },
};

export const Places = {
  playerSelect(id = 'tgt') {
    const ps = Object.values(this.s.players).filter(p => !p.sub || !p.benched).sort((a, b) => b.heat - a.heat);
    return `<select class="txt" id="${id}" style="flex:1;min-width:0">${ps.map(p => `<option value="${esc(p.name)}">${esc(p.name)} · ${esc(teamOf(p.team).name)} ${p.role}</option>`).join('')}</select>`;
  },
  doneToday(key) { const d = this.g.day; return d && (d.done ||= {})[key]; },
  markToday(key) { (this.g.day.done ||= {})[key] = true; },

  // ---------- 打印店：精印标语 + 做周边 ----------
  printShop() {
    const s = this.s, m = s.merch;
    this.open(`<h2>🖨 打印店</h2><div class="sub">定制标语和周边。资金 ${won(s.money)}</div>
      <div class="cards">
        <div class="card" data-k="boost"><div class="t">精印标语</div><div class="d">接下来 3 件带字的道具用高清喷绘：照片里标语更清楚，曝光 ×1.15<br><b>${won(200000)}</b>${s.printBoost ? `<br>还剩 ${s.printBoost} 次` : ''}</div></div>
        ${Object.entries(MERCH).map(([k, v]) => `<div class="card" data-k="${k}"><div class="t">周边：${v.name}</div><div class="d">${v.stock} 个 · 每个卖 ${won(v.unit)}<br>做好后去粉丝咖啡店摆摊卖<br><b>${won(v.cost)}</b></div></div>`).join('')}
      </div>
      <h3>周边印谁</h3><div class="row">${this.playerSelect('mp')}</div>
      ${m?.stock ? `<div class="news">库存：${esc(m.player)} 的${MERCH[m.kind].name} × ${m.stock}</div>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn" id="x">离开</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
    this.on('[data-k]', 'click', (e, el) => {
      const k = el.dataset.k, cost = k === 'boost' ? 200000 : MERCH[k].cost;
      if (s.money < cost) return this.toast('钱不够', 'bad');
      s.money -= cost; this.g.audio.coin();
      if (k === 'boost') { s.printBoost = (s.printBoost || 0) + 3; this.toast('精印 ×3 已生效：接下来 3 件带字的道具', 'good'); }
      else { const v = MERCH[k]; s.merch = { player: $('mp').value, kind: k, stock: (s.merch?.kind === k && s.merch.player === $('mp').value ? s.merch.stock : 0) + v.stock }; this.toast(`${v.name} × ${v.stock} 做好了，去粉丝咖啡店摆摊`, 'good'); }
      this.saveSoon(); this.printShop();
    });
  },

  // ---------- 粉丝咖啡店：应援活动 + 摆摊卖周边 ----------
  fanCafe() {
    const s = this.s, m = s.merch;
    const ev1 = this.doneToday('cafe'), ev2 = this.doneToday('stall');
    this.open(`<h2>☕ 粉丝咖啡店</h2><div class="sub">包场办应援活动，或者摆摊卖周边。每样每晚一次。</div>
      <h3>应援咖啡活动（${won(1200000)}）</h3>
      <div class="d dim">杯套印选手照片，粉丝团来打卡。当晚涨粉，选手心态 +；门口会摆气球拱门，可以拍照发帖。</div>
      <div class="row">${this.playerSelect('ct')}<input class="txt" id="ctx" maxlength="20" style="flex:1;min-width:0"><button class="btn pri" id="ev" ${ev1 || s.money < 1200000 ? 'disabled' : ''}>${ev1 ? '今晚已办' : '包场'}</button></div>
      <h3>摆摊卖周边</h3>
      ${m?.stock ? `<div class="row"><span>${esc(m.player)} 的${MERCH[m.kind].name} × ${m.stock}</span><button class="btn pri" id="st" ${ev2 ? 'disabled' : ''}>${ev2 ? '今晚已摆' : '开卖'}</button></div>` : '<div class="dim">没有周边。去打印店做一批。</div>'}
      <div class="row" style="margin-top:14px"><button class="btn" id="x">离开</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
    const fillTxt = () => { const p = s.players[$('ct').value]; $('ctx').value = (SLOGANS.support[0] || '{p} 최고').replace('{p}', p.name).replace('{t}', teamOf(p.team).name); };
    $('ct').onchange = fillTxt; fillTxt(); $('ctx').onkeydown = e => e.stopPropagation();
    if ($('ev')) $('ev').onclick = () => {
      if (s.money < 1200000) return;
      const target = $('ct').value, text = $('ctx').value || '최고';
      s.money -= 1200000; this.markToday('cafe'); this.close(false);
      const g = this.g, pt = g.city.points.cafe;
      const ev = g.newEvent({ item: 'balloon', target, text, kind: 'support' }, 'CAFE');
      const arch = g.props.build('balloon', pt.pos.clone().add(new THREE.Vector3(0, 0, -0.5)), Math.PI, ev.text, 'support', teamOf(s.players[ev.target].team).color || '#ff7ab0');
      g.popIn?.(arch);
      g.props.addSubject(arch, { eventId: ev.id, label: `应援咖啡→${ev.target}`, text: true, weight: 1.2 });
      const gain = Math.round(300 + (s.club || 30) * 3 + s.fans * 0.012);
      s.fans += gain;
      g.crowd.attract(pt.pos.clone(), 50, 16, 'cheer');
      this.push('☕ 应援咖啡活动开始了', `粉丝团来打卡，粉丝 +${gain}。门口有气球拱门，记得拍照`, 'good');
      g.mode = 'play'; this.showHud(true); g.lockMouse(); this.saveSoon();
    };
    if ($('st')) $('st').onclick = () => {
      const v = MERCH[m.kind], p = s.players[m.player];
      const sold = Math.min(m.stock, Math.round(15 + (s.club || 30) * 0.5 + s.fans * 0.002 + (p?.heat || 0) * 0.3));
      m.stock -= sold; const money = sold * v.unit; s.money += money;
      if (p) { p.votes += sold * 60; p.heat = Math.min(100, p.heat + sold / 20); }
      this.markToday('stall'); this.g.audio.coin();
      this.push('🛍 周边卖出去了', `${v.name} 卖出 ${sold} 个，收入 ${won(money)}；${m.player} 的全明星票 +${num(sold * 60)}`, 'good');
      this.saveSoon(); this.fanCafe();
    };
  },

  // ---------- 地铁站广告位：租 2 周，每周被动曝光 ----------
  metroAd() {
    const s = this.s, ads = s.ads || [], cost = 2000000;
    this.open(`<h2>🚇 地铁站广告位</h2><div class="sub">租 2 周灯箱广告，每周结算时自动带来曝光、粉丝和收入；对手粉头可能会买下同一个位置把你盖掉。最多同时 2 个。</div>
      ${ads.map(a => `<div class="news">「${esc(a.text)}」→ ${esc(a.target)} · 还剩 ${a.weeks} 周</div>`).join('')}
      <div class="row"><select class="txt" id="ak" style="min-width:90px"><option value="support">应援</option><option value="attack">抗议</option></select>${this.playerSelect('at')}</div>
      <div class="row" style="margin-top:8px"><input class="txt" id="atx" maxlength="24" style="flex:1;min-width:0" placeholder="广告文字"></div>
      <div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn" id="x">离开</button><button class="btn pri" id="go" ${s.money < cost || ads.length >= 2 ? 'disabled' : ''}>租 2 周 ${won(cost)}</button></div>`, { esc: () => this.close() });
    $('x').onclick = () => this.close();
    const fill = () => { const p = s.players[$('at').value], k = $('ak').value; $('atx').value = (SLOGANS[k][0] || '{p}').replace('{p}', p.name).replace('{t}', teamOf(p.team).name); };
    $('at').onchange = fill; $('ak').onchange = fill; fill(); $('atx').onkeydown = e => e.stopPropagation();
    $('go').onclick = () => {
      if (s.money < cost) return;
      s.money -= cost; this.g.audio.coin();
      (s.ads ||= []).push({ target: $('at').value, kind: $('ak').value, text: $('atx').value.trim() || $('at').value, weeks: 2 });
      this.g.city.setMetroAd?.($('atx').value, $('ak').value);
      this.toast('广告已上线，每周结算时生效', 'good'); this.saveSoon(); this.metroAd();
    };
  },

  // ---------- 网吧：全明星投票打榜（8 秒连点） ----------
  pcBang() {
    const s = this.s;
    if (this.doneToday('vote')) return this.toast('今晚已经打过榜了，明天再来', '');
    const roles = Sim.allStar(s);
    this.open(`<h2>💻 网吧 · 全明星投票</h2><div class="sub">交 ₩100,000 网费，8 秒内疯狂点"投票"（或按空格）。粉丝团越大，每一票越值钱。</div>
      <div class="row">${this.playerSelect('vt')}</div><div class="news" id="rank"></div>
      <div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn" id="x">离开</button><button class="btn pri" id="go" ${s.money < 100000 ? 'disabled' : ''}>开始打榜</button></div>`, { esc: () => this.close() });
    const rank = () => { const p = s.players[$('vt').value], list = roles[p.role] || [], i = list.findIndex(x => x.name === p.name); $('rank').textContent = `${p.name} 目前 ${p.role} 位全明星投票第 ${i + 1} 名${i > 0 ? `，落后第一名 ${num(list[0].v - list[i].v)}` : ''}`; };
    $('vt').onchange = rank; rank();
    $('x').onclick = () => this.close();
    $('go').onclick = () => {
      const name = $('vt').value; s.money -= 100000;
      let clicks = 0, left = 8;
      this.open(`<h2>投给 ${esc(name)}！</h2><div class="vote-big"><button class="btn pri" id="vb">投票</button><div><b id="vc">0</b> 票 · <span id="vl">8.0</span> 秒</div></div>`, { esc: () => {} });
      const hit = () => { if (left <= 0) return; clicks++; $('vc').textContent = clicks; this.g.audio.click?.(); };
      $('vb').onclick = hit;
      const key = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); hit(); } };
      addEventListener('keydown', key, true);
      const t0 = performance.now();
      const tick = () => {
        left = Math.max(0, 8 - (performance.now() - t0) / 1000);
        if ($('vl')) $('vl').textContent = left.toFixed(1);
        if (left > 0) return requestAnimationFrame(tick);
        removeEventListener('keydown', key, true);
        const p = s.players[name], votes = Math.round(clicks * 900 * (1 + (s.club || 30) / 300));
        p.votes += votes; this.markToday('vote');
        const list = Sim.allStar(s)[p.role], i = list.findIndex(x => x.name === name);
        this.open(`<h2>打榜结束</h2><p>${clicks} 次点击 → ${esc(name)} 全明星票 +${num(votes)}</p><p>现在是 ${p.role} 位第 ${i + 1} 名。</p><div class="row"><button class="btn pri" id="x">好</button></div>`, { esc: () => this.close() });
        $('x').onclick = () => this.close();
        this.saveSoon();
      };
      requestAnimationFrame(tick);
    };
  },
};
