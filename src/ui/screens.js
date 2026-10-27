// 比赛日（电竞直播风格）、发帖（社交 App 风格）、发帖结果（信息流）
import { TEAMS, PLATFORMS, TONES, LEAGUE, COMMENTS, BALANCE as B } from '../content/data.js';
import { STORIES, ACHIEVEMENTS, achLoad } from '../content/story.js';
import * as Sim from '../sim/sim.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const won = n => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString();
const teamOf = id => TEAMS.find(t => t.id === id) || { name: id, color: '#888', id };
const pick = a => a[Math.floor(Math.random() * a.length)];
const RESULT = { mvp: ['MVP', 'pos'], worst: ['背锅', 'neg'], win: ['赢了', 'pos'], lose: ['输了', 'neg'], bench: ['没上场', ''] };
const PLAT_STYLE = { x: { bg: '#0f1419', fg: '#fff', badge: '𝕏' }, tok: { bg: '#fe2c55', fg: '#fff', badge: '♪' }, dc: { bg: '#3b4890', fg: '#fff', badge: 'DC' } };

export const Screens = {
  // ================= 私信抉择（进入行动日前） =================
  beforeDay() {
    const s = this.s, ps = s.pendingStory;
    const st = ps && STORIES.find(x => x.id === ps.id);
    if (!st) { this.close(false); return this.g.startDay(); }
    const from = typeof st.from === 'function' ? st.from(s, ps.t) : st.from;
    this.open(`<div class="dm"><div class="dm-h"><span class="av" style="background:#2a3043">${st.av}</span><div><b>${esc(from)}</b><div class="dim">发来一条私信 · 刚刚</div></div></div>
      <div class="bubble in">${esc(st.text(s, ps.t))}</div>
      <div class="dm-opts">${st.options.map((o, i) => `<button class="opt" data-o="${i}"><b>${esc(o.label)}</b><span>${esc(o.desc)}</span></button>`).join('')}</div></div>`, { cinematic: true, cls: 'wide' });
    this.on('[data-o]', 'click', (e, el) => {
      const o = st.options[+el.dataset.o];
      const msg = o.run(s, ps.t);
      (s.storySeen ||= []).push(st.id); s.pendingStory = null; this.save();
      const box = this.modal.querySelector('.dm');
      box.querySelector('.dm-opts').innerHTML = `<div class="bubble out">${esc(o.label)}</div><div class="bubble sys">${esc(msg)}</div><button class="btn pri" id="cont" style="align-self:flex-end">进入行动日 →</button>`;
      $('cont').onclick = () => { this.close(false); this.g.startDay(); };
    });
  },

  achievements(back) {
    const got = achLoad();
    this.open(`<h2>🏆 成就 <span class="dim" style="font-size:14px">${Object.keys(got).length}/${ACHIEVEMENTS.length}</span></h2>
      <div class="cards">${ACHIEVEMENTS.map(a => `<div class="card ${got[a.id] ? '' : 'locked'}"><div class="t">${got[a.id] ? '🏆' : '🔒'} ${esc(a.name)}</div><div class="d">${esc(a.desc)}</div>${got[a.id] ? `<div class="dim" style="font-size:11px">${new Date(got[a.id]).toLocaleDateString()}</div>` : ''}</div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="b">返回</button></div>`, { cinematic: true, esc: back });
    $('b').onclick = back;
  },

  // ================= 比赛日 =================
  matchDayView() {
    const s = this.s, res = s.lastResults, P = s.players;
    const final = s.week === B.weeksPerSeason;
    const card = (m, i) => {
      const A = teamOf(m.a), Bt = teamOf(m.b), aw = m.winner === m.a, focus = m.a === s.fav || m.b === s.fav;
      const pips = side => Array.from({ length: final ? 3 : 2 }, (_, k) => `<i class="${k < (side === 'a' ? m.wa : m.wb) ? 'on' : ''}"></i>`).join('');
      return `<div class="mc ${focus ? 'fav' : ''}" style="--ca:${A.color};--cb:${Bt.color};animation-delay:${i * 0.12}s">
        <div class="side a ${aw ? 'win' : 'lose'}"><span class="tn">${esc(A.name)}</span><span class="pips">${pips('a')}</span></div>
        <div class="score"><b>${m.wa}</b><em>:</em><b>${m.wb}</b></div>
        <div class="side b ${aw ? 'lose' : 'win'}"><span class="pips">${pips('b')}</span><span class="tn">${esc(Bt.name)}</span></div>
        <div class="foot"><span class="pos">MVP ${esc(m.mvp)}</span> ${m.flavor.mvp} · <span class="neg">背锅 ${esc(m.worst)}</span> ${m.flavor.worst}</div></div>`;
    };
    const infl = Object.entries(s.lastInfluence || {});
    const inflHtml = infl.length ? `<div class="sec"><h3>🎯 你的行动 → 心态 → 表现</h3>${infl.map(([name, inf]) => {
      const p = P[name], t = teamOf(p.team), groups = {};
      for (const a of inf.acts) { const g = groups[a.label] ||= { n: 0, dm: 0, kind: a.kind }; g.n++; g.dm += a.dm; }
      const [rl, rc] = RESULT[inf.result] || ['', ''];
      return `<div class="infl"><div class="av" style="background:${t.color}">${esc(name[0])}</div><div class="body"><b>${esc(name)}</b> <span class="dim">${esc(t.name)} ${p.role}</span>
        <div class="chain">${Object.entries(groups).map(([l, g]) => `<span class="chip ${g.kind}">${esc(l)}${g.n > 1 ? '×' + g.n : ''} ${g.dm > 0 ? '+' : ''}${g.dm}</span>`).join('')}
        <span class="arr">→</span><span class="chip">心态 ${inf.moodBefore}→${inf.moodAtMatch ?? Math.round(p.mood)}</span>
        <span class="arr">→</span><span class="chip res ${rc}">${inf.rating != null ? '评分 ' + inf.rating + ' · ' : ''}${rl}</span></div></div></div>`;
    }).join('')}</div>` : '';
    const story = (s.weekStory || []).map(x => `<div class="news ${x.c}">${esc(x.t)}</div>`).join('');
    const trend = s.trending.length ? s.trending : Object.values(P).sort((a, b) => b.heat - a.heat).slice(0, 8).map(p => p.name);
    const st = Sim.standings(s);
    const feed = (s.playerPosts || []).map(x => { const t = teamOf(x.team); return `<div class="fp ${x.mine ? 'mine' : ''}"><div class="av sm" style="background:${t.color}">${esc(x.name[0])}</div><div><b>${esc(x.name)}</b> <span class="dim">@${esc(x.name.toLowerCase())}_${t.id.toLowerCase()} · 刚刚</span><div>${esc(x.text)}</div>${x.mine ? '<div class="dim" style="font-size:11px">↑ 和你有关</div>' : ''}</div></div>`; }).join('');
    return `<div class="bc">
      <div class="bc-top"><span class="live">● LIVE</span><b>${esc(LEAGUE.full)}</b><span class="wk">S${s.season} · WEEK ${s.week}</span>${final ? `<span class="final">GRAND FINAL · 冠军 ${esc(teamOf(s.champion).name)}</span>` : ''}</div>
      <div class="bc-grid">
        <div class="bc-main">
          <div class="matches">${res.map(card).join('')}</div>
          ${inflHtml}
          <div class="sec"><h3>📰 本周新闻</h3><div class="news ${s.lastEvent.id === 'rage' || s.lastEvent.id === 'injury' ? 'bad' : ''}">${esc(s.lastEvent.text)}</div>${story}</div>
        </div>
        <div class="bc-side">
          <div class="phone-card"><div class="pc-h">🔥 실시간 검색어 · 热搜</div>${trend.map((n, i) => { const p = P[n]; return `<div class="tr"><span class="rk ${i < 3 ? 'top' : ''}">${i + 1}</span><b>${esc(n)}</b><span class="dim">${esc(teamOf(p.team).name)}</span><span class="tg ${p.sentiment < -0.3 ? 'neg' : p.sentiment > 0.4 ? 'pos' : ''}">${p.sentiment < -0.3 ? '挨骂' : p.sentiment > 0.4 ? '被夸' : '平'}</span></div>`; }).join('')}</div>
          ${feed ? `<div class="phone-card"><div class="pc-h">📱 选手动态</div>${feed}</div>` : ''}
          <div class="phone-card"><div class="pc-h">🏆 积分榜</div><table class="t">${st.map((t, i) => `<tr class="${t.id === s.fav ? 'me' : ''}"><td>${i + 1}</td><td style="color:${teamOf(t.id).color}">${esc(teamOf(t.id).name)}</td><td>${t.w}-${t.l}</td></tr>`).join('')}</table></div>
        </div>
      </div>
      <div class="bc-bottom"><div class="goals">${this.goalLines().join(' · ')}</div>
        <div class="row"><button class="btn ghost" id="menu">标题</button><button class="btn" id="pl">选手一览</button><button class="btn pri" id="go">进入行动日 →</button></div></div>
    </div>`;
  },

  // ================= 发帖 =================
  caption(photo, ev, tone) {
    if (!ev) return photo.star ? `偶遇 ${photo.star} 本人！ #${photo.star}` : '今晚的首尔 🌃';
    const t = ev.target, txt = ev.text;
    if (ev.kind === 'support') return tone === 'mock' ? `${t} 看看别人家的粉丝 😏 ${txt} #${t}` : tone === 'calm' ? `${t} 本周表现稳定，送上应援。${txt} #${t}` : `${t} 永远支持你 ❤ 今天在门口送上${txt} #${t}응원해`;
    return tone === 'mock' ? `#${t}OUT 这就是职业选手？${txt} 😅` : tone === 'emo' ? `看了比赛真的心累……${txt} #${t}` : `${t} 最近的数据大家有目共睹，${txt} #LCK`;
  },

  postingView() {
    const s = this.s, g = this.g, photos = g.day.photos;
    const roll = photos.length ? photos.map((p, i) => {
      const sel = this.posts.findIndex(x => x.i === i);
      const chips = [p.reaction && '选手反应', p.star && !p.reaction && '本人入镜', p.press && '记者', p.tags.includes('explosion') && !p.reaction && '名场面', p.tags.includes('text') && '标语', p.tags.includes('logo') && '队标', p.tags.includes('crowd') && '人群'].filter(Boolean);
      return `<div class="rp ${sel >= 0 ? 'sel' : ''}" data-p="${i}"><img src="${p.img}">${sel >= 0 ? `<span class="no">${sel + 1}</span>` : ''}
        <div class="meta"><span class="stars">${'★'.repeat(Math.max(1, Math.round(p.q * 3))).padEnd(5, '☆')}</span> ${esc(p.label)}<div class="chips">${chips.map(c => `<i>${c}</i>`).join('')}</div></div></div>`;
    }).join('') : '<div class="empty">今天一张照片都没拍……</div>';
    const handle = s.handle || '@饭圈观察员';
    const cards = this.posts.map((x, k) => {
      const ph = photos[x.i], ev = g.day.events.find(e => e.id === ph.eventId) || null, P = PLATFORMS.find(p => p.id === x.platform), st = PLAT_STYLE[x.platform];
      return `<div class="pc">
        <div class="tabs">${PLATFORMS.map(pl => `<button class="ptab ${pl.id === x.platform ? 'on' : ''}" data-pl="${k}:${pl.id}" ${s.banned[pl.id] ? 'disabled' : ''} style="--pc:${PLAT_STYLE[pl.id].bg}">${pl.name}${s.banned[pl.id] ? ' 封号中' : ''}</button>`).join('')}<button class="rm" data-rm="${k}">✕</button></div>
        <div class="tones">${TONES.map(t => `<button class="tone ${t.id === x.tone ? 'on' : ''}" data-tn="${k}:${t.id}">${t.name}</button>`).join('')}<span class="dim">${esc(P.desc)}</span></div>
        <div class="preview" style="--pc:${st.bg}"><div class="ph"><span class="av sm" style="background:#ff2d55">我</span><b>${esc(handle)}</b><span class="badge">${st.badge}</span></div>
          <div class="cap">${esc(this.caption(ph, ev, x.tone))}</div><img src="${ph.img}"></div></div>`;
    }).join('');
    return `<div class="sns">
      <div class="roll"><div class="hd"><b>📷 今日相册</b><span class="dim">点选最多 3 张 · 同一件事发到多个平台热度会打折</span></div><div class="grid">${roll}</div></div>
      <div class="phone"><div class="notch"></div><div class="ph-h"><b>发布</b><span>${this.posts.length}/3</span></div>
        ${s.heat >= B.heatLimit ? '<div class="warnbar">⚠ 账号被限流中，曝光减半</div>' : ''}
        <div class="ph-body">${cards || '<div class="empty">← 从左边选择照片</div>'}</div>
        <div class="ph-f"><button class="btn ghost" id="skip">今天不发了</button><button class="btn pri" id="go" ${this.posts.length ? '' : 'disabled'}>发布 ${this.posts.length} 条</button></div></div>
    </div>`;
  },

  posting() {
    const s = this.s, g = this.g, photos = g.day.photos;
    g.audio.music('result');
    this.posts = this.posts || [];
    this.open(this.postingView(), { cls: 'wide' });
    this.on('[data-p]', 'click', (e, el) => {
      const i = +el.dataset.p, at = this.posts.findIndex(x => x.i === i);
      if (at >= 0) this.posts.splice(at, 1);
      else if (this.posts.length < 3) {
        const pl = PLATFORMS.find(p => !s.banned[p.id]); if (!pl) return this.toast('所有平台都把你封了', 'bad');
        const ev = g.day.events.find(e => e.id === photos[i].eventId);
        this.posts.push({ i, platform: pl.id, tone: ev?.kind === 'support' ? 'emo' : 'mock' });
      }
      this.posting();
    });
    this.on('[data-pl]', 'click', (e, el) => { const [k, id] = el.dataset.pl.split(':'); this.posts[+k].platform = id; this.posting(); });
    this.on('[data-tn]', 'click', (e, el) => { const [k, id] = el.dataset.tn.split(':'); this.posts[+k].tone = id; this.posting(); });
    this.on('[data-rm]', 'click', (e, el) => { this.posts.splice(+el.dataset.rm, 1); this.posting(); });
    $('go').onclick = () => this.publish();
    $('skip').onclick = () => { this.posts = []; this.weekSummary([]); };
  },

  // ================= 发帖结果（信息流） =================
  comments(r) {
    const ev = r.ev, out = [];
    const pool = r.viral ? COMMENTS.viral : r.flop ? COMMENTS.flop : null;
    if (pool) out.push(pick(pool));
    if (r.photo.reaction) out.push(pick(COMMENTS.reaction));
    if (r.photo.press) out.push(pick(COMMENTS.press));
    const main = !ev ? COMMENTS.generic : ev.kind === 'support' ? COMMENTS.support : r.backlash ? COMMENTS.attack_backlash : COMMENTS.attack_agree;
    while (out.length < 3) { const c = pick(main); if (!out.includes(c)) out.push(c); }
    return out.slice(0, 3).map((c, i) => ({ c, user: pick(['롤붕이', '直播间常客', '페이커장인', '吃瓜群众', 'lck_fan', '하루종일롤', '電競少女', '老粉']) + (100 + Math.random() * 900 | 0), likes: Math.round(r.views * (0.002 + Math.random() * 0.006) / (i + 1)) }));
  },

  showResults(results) {
    const s = this.s, handle = s.handle || '@饭圈观察员';
    const html = results.map((r, k) => {
      const st = PLAT_STYLE[r.platform], P = PLATFORMS.find(p => p.id === r.platform);
      const badge = r.viral ? '<span class="ob viral">🔥 爆款 · 上热搜</span>' : r.flop ? '<span class="ob flop">石沉大海</span>' : r.backlash ? '<span class="ob bad">评论区翻车</span>' : r.photo.reaction ? '<span class="ob viral">名场面</span>' : '';
      const chips = [['照片', r.parts.quality], ['话题', r.parts.topic], ['情绪', r.parts.match], ['新鲜', r.parts.fresh], ['平台', r.parts.platform], ['名场面', r.parts.moment], ['运气', r.parts.luck]].filter(([, v]) => v !== undefined && Math.abs(v - 1) > 0.01);
      return `<div class="fc" style="--pc:${st.bg};animation-delay:${k * 0.15}s">
        <div class="ph"><span class="av sm" style="background:#ff2d55">我</span><b>${esc(handle)}</b><span class="badge">${st.badge} ${P.name}</span>${badge}</div>
        <div class="cap">${esc(this.caption(r.photo, r.ev, r.tone))}</div>
        <img src="${r.photo.img}">
        <div class="counters"><span>👁 <b id="v${k}">0</b></span><span>♥ <b id="l${k}">0</b></span><span>🔁 <b id="r${k}">0</b></span><span>💬 <b id="c${k}">0</b></span></div>
        <canvas class="chart" id="ch${k}" width="600" height="120"></canvas>
        <div class="gain"><span class="${r.fans >= 0 ? 'pos' : 'neg'}">粉丝 ${r.fans >= 0 ? '+' : ''}${num(r.fans)}</span><span>收入 ${won(r.money)}</span></div>
        <div class="cmts">${this.comments(r).map(c => `<div class="cm"><b>${esc(c.user)}</b> ${esc(c.c)} <span class="dim">♥ ${num(c.likes)}</span></div>`).join('')}</div>
        <div class="mult">${chips.map(([n, v]) => `<i class="${v > 1 ? 'up' : 'down'}">${n} ×${v.toFixed(2)}</i>`).join('')}</div>
      </div>`;
    }).join('');
    this.open(`<div class="feed"><div class="hd"><b>📈 发帖结果</b><span class="dim">数字会在几秒内慢慢涨上来</span></div>${html || '<div class="empty">没有发帖。</div>'}
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="go">周结算 →</button></div></div>`, { cls: 'wide' });
    results.forEach((r, k) => this.animateChart($(`ch${k}`), [$(`v${k}`), $(`l${k}`), $(`r${k}`), $(`c${k}`)], r));
    if (results.some(r => r.viral)) this.g.audio.viral(); else this.g.audio.coin();
    $('go').onclick = () => this.weekSummary(results);
  },

  // 热度曲线：普通帖子慢慢涨，爆款中途突然起飞，沉底的很快走平
  animateChart(c, labels, r) {
    const x = c.getContext('2d'), W = c.width, H = c.height, N = 60;
    const pts = []; let v = 0;
    const jump = r.viral ? 15 + Math.random() * 25 | 0 : -1;
    for (let i = 0; i < N; i++) { const base = r.flop ? Math.exp(-i / 6) : Math.exp(-i / 18); v += base * (i === jump ? 30 : i > jump && jump > 0 ? 2.5 : 1); pts.push(v); }
    const max = pts[N - 1], col = r.viral ? '#38e08a' : r.flop ? '#ff4a4a' : '#27e1ff';
    const ratio = [1, 0.055, 0.012, 0.004];
    let f = 0;
    const draw = () => {
      f = Math.min(N, f + 1.2); x.clearRect(0, 0, W, H);
      const grad = x.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, col + '55'); grad.addColorStop(1, col + '00');
      x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i < f; i++) x.lineTo((i / (N - 1)) * W, H - 6 - (pts[i] / max) * (H - 12));
      x.lineTo(((f - 1) / (N - 1)) * W, H); x.closePath(); x.fillStyle = grad; x.fill();
      x.strokeStyle = col; x.lineWidth = 3; x.beginPath();
      for (let i = 0; i < f; i++) { const px = (i / (N - 1)) * W, py = H - 6 - (pts[i] / max) * (H - 12); i ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
      const k = pts[Math.max(0, Math.floor(f) - 1)] / max;
      labels.forEach((el, i) => { if (el) el.textContent = num(Math.round(r.views * ratio[i] * k)); });
      if (f < N) requestAnimationFrame(draw);
    };
    draw();
  },
};
