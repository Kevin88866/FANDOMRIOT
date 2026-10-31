// 纯逻辑模拟（不依赖浏览器，可在 node 里跑平衡测试）
import { TEAMS, ITEMS, PLATFORMS, TONES, LEAGUE, PLAYER_POSTS, BALANCE as B } from '../content/data.js';

export const rand = {
  r: Math.random,
  normal() { let u = 0, v = 0; while (!u) u = this.r(); while (!v) v = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
  pick(a) { return a[Math.floor(this.r() * a.length)]; },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- 新游戏 ----------
export function newGame(fav = LEAGUE.defaultFav) {
  const players = {};
  for (const t of TEAMS) for (const [name, role, skill] of t.players) {
    players[name] = { name, team: t.id, role, skill, mood: 70, form: 0, heat: 10, sentiment: 0, rating: 6, lastRatings: [], benched: false, votes: 0, popularity: skill * 10 + (t.popular || 0), weeksBad: 0 };
  }
  // 每队一个替补
  for (const t of TEAMS) { const sub = { name: t.id + '-Sub', team: t.id, role: 'SUB', skill: 70, mood: 70, form: 0, heat: 2, sentiment: 0, rating: 6, lastRatings: [], benched: true, votes: 0, popularity: 50, sub: true, weeksBad: 0 }; players[sub.name] = sub; }
  return {
    v: 1, season: 1, week: 1, phase: 'match', fav,
    money: B.startMoney, fans: B.startFans, heat: 0, lawsuits: 0,
    skills: { photo: 0, edit: 0, net: 0, stealth: 0 }, skillPoints: 1, nextSkillAt: B.skillPointEvery,
    vehicle: 'scooter', owned: ['scooter'], burner: 0, lawyer: false,
    banned: {}, used: {}, unlocked: 1,
    teams: Object.fromEntries(TEAMS.map(t => [t.id, { w: 0, l: 0, gw: 0, gl: 0 }])),
    players, schedule: makeSchedule(), results: [], news: [], trending: [],
    rival: { name: '王者大粉_Chan', fans: 3000, stance: 'attack' },
    flags: {}, club: 30, storySeen: [], missions: [], missionsDone: 0, handle: '@饭圈观察员',
    goals: null, history: [], trendTopic: null, totalViews: 0, bestPost: null, viralCount: 0,
  };
}

function makeSchedule() {
  // 10 队单循环 9 轮 + 第 10 周决赛
  const ids = TEAMS.map(t => t.id), n = ids.length, rounds = [];
  const arr = ids.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs = []; for (let i = 0; i < n / 2; i++) pairs.push([arr[i], arr[n - 1 - i]]);
    rounds.push(pairs); arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

export const teamPlayers = (s, tid) => Object.values(s.players).filter(p => p.team === tid && !p.benched);
export const starters = teamPlayers;

function teamPower(s, tid) {
  const ps = teamPlayers(s, tid);
  return ps.reduce((a, p) => a + p.skill * (0.82 + p.mood / 100 * 0.32) + p.form * 1.4, 0) / Math.max(1, ps.length);
}

// ---------- 比赛 ----------
export function playWeek(s) {
  const out = [];
  const inf = s.influence || {};
  for (const name in inf) inf[name].moodAtMatch = Math.round(s.players[name].mood);
  let pairs = s.schedule[s.week - 1];
  if (s.week === B.weeksPerSeason) { const st = standings(s); pairs = [[st[0].id, st[1].id]]; }
  for (const [a, b] of pairs) out.push(playMatch(s, a, b, s.week === B.weeksPerSeason));
  s.results.push(out);
  updateTopics(s, out);
  // 因果链：你的行动 → 心态 → 本场表现
  for (const name in inf) {
    const p = s.players[name], m = out.find(r => r.perf[name] !== undefined);
    inf[name].rating = m ? m.perf[name] : null;
    inf[name].result = !m ? 'bench' : m.mvp === name ? 'mvp' : m.worst === name ? 'worst' : (m.winner === p.team ? 'win' : 'lose');
  }
  s.lastInfluence = inf; s.influence = {};
  s.playerPosts = makePlayerPosts(s, out);
  return out;
}

function playMatch(s, a, b, final) {
  const pa = teamPower(s, a), pb = teamPower(s, b);
  const pWin = 1 / (1 + Math.pow(10, -(pa - pb) / 9));
  let wa = 0, wb = 0; const need = final ? 3 : 2;
  while (wa < need && wb < need) (rand.r() < pWin ? wa++ : wb++);
  const winner = wa > wb ? a : b;
  const T = s.teams; T[a].gw += wa; T[a].gl += wb; T[b].gw += wb; T[b].gl += wa;
  if (!final) { T[winner].w++; T[winner === a ? b : a].l++; }
  // 选手评分
  const perf = {};
  for (const tid of [a, b]) for (const p of teamPlayers(s, tid)) {
    const exp = 4 + (p.skill - 70) / 6;          // 预期评分
    const won = tid === winner;
    let r = exp + (p.mood - 60) / 25 + p.form * 0.15 + rand.normal() * 1.25 + (won ? 0.8 : -0.8);
    r = clamp(r, 1, 10);
    p.rating = Math.round(r * 10) / 10;
    p.lastRatings.push(p.rating); if (p.lastRatings.length > 5) p.lastRatings.shift();
    p.sentiment = clamp((r - exp) / 2.2, -1, 1);
    p.form = clamp(p.form * 0.6 + (r - exp) * 0.8, -10, 10);
    perf[p.name] = p.rating;
  }
  const all = Object.entries(perf).sort((x, y) => y[1] - x[1]);
  const mvp = all[0][0], worst = all[all.length - 1][0];
  s.players[mvp].sentiment = Math.max(s.players[mvp].sentiment, 0.8);
  s.players[worst].sentiment = Math.min(s.players[worst].sentiment, -0.6);
  return { a, b, wa, wb, winner, mvp, worst, final, perf, flavor: flavor(s.players[worst], s.players[mvp]) };
}

function flavor(worst, mvp) {
  const bad = ['被单杀 4 次', '团战闪现撞墙', '大龙团送了关键人头', '对线被压 60 刀', '把对面 ADC 送成超神'];
  const good = ['五杀', '一级抢龙', '全场 0 死', '极限偷家翻盘', '一打三'];
  return { worst: rand.pick(bad), mvp: rand.pick(good) };
}

function updateTopics(s, results) {
  for (const p of Object.values(s.players)) p.heat *= 0.55;
  for (const m of results) {
    for (const [name, r] of Object.entries(m.perf)) {
      const p = s.players[name];
      const big = Math.abs(p.sentiment);
      p.heat = clamp(p.heat + big * 35 + (p.popularity / 100) + (m.final ? 25 : 0), 0, 100);
      if (name === m.worst) p.heat = clamp(p.heat + 25, 0, 100);
      if (name === m.mvp) p.heat = clamp(p.heat + 20, 0, 100);
      p.weeksBad = p.sentiment < -0.3 ? p.weeksBad + 1 : Math.max(0, p.weeksBad - 1);
    }
  }
}

function makePlayerPosts(s, results) {
  const posts = [], pick = a => a[Math.floor(rand.r() * a.length)];
  const fill = (t, p, i) => t.replace('{p}', p.name).replace('{t}', TEAMS.find(x => x.id === p.team)?.name || p.team).replace('{i}', i || '应援');
  for (const [name, inf] of Object.entries(s.lastInfluence || {})) {
    const p = s.players[name], item = inf.acts[0]?.label;
    const net = inf.acts.reduce((a, x) => a + x.dm, 0);
    const good = inf.result === 'mvp' || inf.result === 'win';
    let key = inf.result === 'bench' ? 'benched' : net < 0 ? (good ? 'attacked_good' : 'attacked_bad') : (good ? 'supported_good' : 'supported_bad');
    posts.push({ name, team: p.team, text: fill(pick(PLAYER_POSTS[key]), p, item), mine: true, key });
  }
  for (const m of results.slice(0, 2)) if (!posts.some(x => x.name === m.mvp)) { const p = s.players[m.mvp]; posts.push({ name: m.mvp, team: p.team, text: fill(pick(PLAYER_POSTS.mvp), p) }); }
  return posts.slice(0, 4);
}

export function standings(s) {
  return Object.entries(s.teams).map(([id, t]) => ({ id, ...t })).sort((x, y) => (y.w - x.w) || ((y.gw - y.gl) - (x.gw - x.gl)));
}

// ---------- 行动效果 ----------
// 难度：收入倍率、争议度增长倍率
export const DIFFICULTY = { easy: { income: 1.3, heat: 0.7 }, normal: { income: 1, heat: 1 }, hard: { income: 0.8, heat: 1.25 } };
const diff = s => DIFFICULTY[s.difficulty] || DIFFICULTY.normal;

export function itemCost(s, item) { return Math.round(item.price * (1 - 0.08 * s.skills.net)); }

export function applyAction(s, ev) {
  // ev: {item, target(player name), kind}
  const item = ITEMS.find(i => i.id === ev.item), p = s.players[ev.target];
  const stealthK = 1 - 0.12 * s.skills.stealth;
  s.heat = clamp(s.heat + item.heat * (s.patrol && ev.kind !== 'support' ? 1.5 : 1) * stealthK * (ev.kind === 'support' ? 0.3 : 1) * diff(s).heat, 0, 120);
  if (p && item.mood) {
    // 记录你对这名选手的态度；态度反转（粉转黑 / 黑转粉）会成为话题
    const st = (s.stance ||= {})[p.name] ||= { atk: 0, sup: 0, last: null };
    const k = ev.kind === 'support' ? 'support' : 'attack';
    if (st.last && st.last !== k) { ev.flip = k === 'attack' ? '粉转黑' : '黑转粉'; p.heat = clamp(p.heat + 25, 0, 100); }
    st.last = k; if (k === 'support') st.sup++; else st.atk++;
  }
  if (p) {
    let dm = (ev.kind === 'support' ? Math.abs(item.mood) : -Math.abs(item.mood)) * (ev.hq === 'PARK' ? 0.5 : 1);
    // 知耻后勇：被骂有概率反而振作（心态好时概率高）
    if (dm < 0 && rand.r() < 0.12 + p.mood / 600) { dm = Math.abs(dm) * 0.5; ev.backfire = true; }
    noteInfluence(s, p.name, item.name, ev.kind, dm);
    p.mood = clamp(p.mood + dm, 0, 100);
    if (ev.kind === 'support') p.votes += item.impact * 120;
    else p.votes = Math.max(0, p.votes - item.impact * 30);
    p.heat = clamp(p.heat + item.impact / 6, 0, 100);
  }
  const key = ev.item + ':' + ev.target;
  ev.repeat = s.used[key] || 0;
  s.used[key] = ev.repeat + 1;
  return ev;
}

// 记录玩家这周对某个选手做了什么（比赛日展示因果链）
export function noteInfluence(s, name, label, kind, dm) {
  const p = s.players[name]; if (!p) return;
  const inf = (s.influence ||= {})[name] ||= { moodBefore: Math.round(p.mood), acts: [] };
  inf.acts.push({ label, kind, dm: Math.round(dm) });
}

// ---------- 发帖曝光 ----------
// 返回 {views, fans, money, viral, flop, backlash, parts}
// 汉江公园有加成的道具（大场面）
export const PARK_PROPS = ['rally', 'fireworks', 'drone', 'lightsticks', 'lightboard', 'balloon'];

export function evaluatePost(s, { photo, ev, platform, tone, extraPlatform = 0, captionK = 1 }) {
  const P = PLATFORMS.find(x => x.id === platform), T = TONES.find(x => x.id === tone);
  const item = ev ? ITEMS.find(i => i.id === ev.item) : null;
  const p = ev ? s.players[ev.target] : null;
  const kind = ev?.kind || 'none';
  const parts = {};
  parts.impact = item ? item.impact : 3;
  parts.quality = photo.q;
  parts.topic = p ? 0.5 + p.heat / 50 : 0.5;
  // 情绪匹配
  let match = 1, backlash = 0;
  if (p) {
    if (kind === 'attack') { match = 1 + (-p.sentiment) * 1.0; if (p.sentiment > 0.4) backlash = p.sentiment; }
    else { match = 1.25 + p.sentiment * 0.6; }
  }
  match *= kind === 'attack' ? T.attack : T.support;
  parts.match = Math.max(0.15, match);
  parts.fresh = Math.pow(B.repeatDecay, ev?.repeat || 0) * Math.pow(0.7, extraPlatform);
  // 平台偏好
  const tags = photo.tags;
  let pref = kind === 'support' ? P.pref.support : P.pref.attack;
  if (tags.includes('explosion')) pref *= P.pref.explosion; if (tags.includes('crowd')) pref *= P.pref.crowd; if (tags.includes('text')) pref *= P.pref.text;
  parts.platform = pref;
  parts.trend = p && s.trendTopic === p.name ? 1.8 : (p && s.trending[0] === p.name ? 1.4 : 1);
  parts.limit = s.heat >= B.heatLimit ? 0.5 : 1;
  parts.club = 1 + Math.min(0.5, (s.club || 0) / 2000);   // 粉丝团帮你转发
  parts.caption = captionK;                                  // 自己写的文案
  parts.venue = ev?.hq === 'PARK' && PARK_PROPS.includes(item?.prop) ? 1.35 : ev?.hq === 'CAFE' ? 1.1 : 1;
  parts.print = ev?.printed ? 1.15 : 1;                      // 打印店精印的标语更清楚
  // 名场面：选手亲眼看到你的道具 / 记者入镜 / 拍到选手本人 / 堵门
  parts.moment = (photo.reaction ? 1.8 : 1) * (photo.press ? 1.4 : 1) * (photo.star && !photo.reaction ? 1.15 : 1) * (ev?.blockDoor ? 1.3 : 1) * (photo.broadcast ? 1.6 : 1) * (photo.exclusive ? 1.7 : 1);
  // 运气
  const editK = s.skills.edit;
  let luck = Math.exp(rand.normal() * B.luckSigma);
  luck = Math.max(luck, 0.5 + editK * 0.08);
  let viral = false, flop = false;
  const roll = rand.r();
  const qualityBoost = Math.max(0, photo.q - 0.9) * 0.05;
  if (roll < B.viralChance + qualityBoost) { viral = true; luck *= B.viralMin + rand.r() * (B.viralMax - B.viralMin); }
  else if (roll > 1 - B.flopChance * (1 - editK * 0.15)) { flop = true; luck *= B.flopMul; }
  parts.luck = luck;
  // 粉丝带来的基础触达是次线性的，避免滚雪球式指数增长
  const base = parts.impact * B.viewsPerImpact + B.fanReach * Math.pow(s.fans, B.fanReachExp);
  let views = base * parts.quality * parts.topic * parts.match * parts.fresh * parts.platform * parts.trend * parts.limit * parts.moment * parts.club * parts.caption * parts.venue * parts.print * luck;
  views = Math.round(views);
  // 涨粉：观点越被认同涨得越多；反噬会掉粉
  let fans = Math.round(views * B.fanConv * Math.min(1.6, parts.match) / (1 + s.fans / B.fanSoftCap));
  if (backlash > 0) { const lost = Math.round(s.fans * backlash * 0.12 * T.backlash); fans = Math.round(fans * 0.4) - lost; }
  const money = Math.round(views * B.wonPerView * P.cpm * diff(s).income);
  return { views, fans, money, viral, flop, backlash, parts };
}

export function commitPost(s, r) {
  s.fans = Math.max(0, s.fans + r.fans); s.money += r.money; s.totalViews += r.views;
  if (r.viral) s.viralCount++;
  if (!s.bestPost || r.views > s.bestPost.views) s.bestPost = { views: r.views, week: s.week, season: s.season };
  while (s.fans >= s.nextSkillAt) { s.skillPoints++; s.nextSkillAt = Math.round(s.nextSkillAt * 2.1); }
}

// ---------- 周结算 ----------
export function endOfWeek(s, dayViews) {
  const log = [];
  // 商单：粉丝多且关注度不高
  if (s.fans >= 5000) {
    const k = s.heat > 60 ? 0 : s.heat > 35 ? 0.5 : 1;
    const inc = Math.round(s.fans * 12 * k * (1 + 0.1 * s.skills.net) * diff(s).income);
    if (inc > 0) { s.money += inc; log.push({ t: `品牌商单收入 ₩${inc.toLocaleString()}`, c: 'good' }); }
    else log.push({ t: '关注度太高，品牌方暂停了合作', c: 'bad' });
  }
  // 物业清洁费（臭鸡蛋 / 涂鸦）
  if (s.cleanupDue) { s.money -= s.cleanupDue; log.push({ t: `物业清洁费 -₩${s.cleanupDue.toLocaleString()}`, c: 'bad' }); s.cleanupDue = 0; }
  // 生活费
  const rent = 250000 + s.week * 10000; s.money -= rent; log.push({ t: `房租和生活费 -₩${rent.toLocaleString()}`, c: '' });
  // 关注度后果
  if (s.heat >= B.heatArrest) {
    s.lawsuits++; const fine = Math.round(Math.max(2000000, s.money * 0.3) * (s.lawyer ? 0.5 : 1) * (1 - 0.08 * s.skills.stealth));
    s.money -= fine; s.heat = 45; s.fans = Math.round(s.fans * 0.85);
    log.push({ t: `⚖ 俱乐部对你发了律师函，赔偿 ₩${fine.toLocaleString()}，粉丝流失 15%（累计 ${s.lawsuits}/3，满 3 次会被全网封杀）`, c: 'bad' });
  } else if (s.heat >= B.heatBan) {
    const ok = ['x', 'tok', 'dc'].filter(id => !s.banned[id]);
    if (ok.length) { const id = rand.pick(ok); s.banned[id] = 2; log.push({ t: `⛔ ${PLATFORMS.find(p => p.id === id).name} 封了你的号（2 周）`, c: 'bad' }); }
  } else if (s.heat >= B.heatLimit) log.push({ t: '⚠ 你的账号被限流（曝光减半）', c: 'bad' });
  for (const k in s.banned) if (--s.banned[k] <= 0) delete s.banned[k];
  s.heat = Math.max(0, s.heat - B.heatDecay - (s.lawyer ? 6 : 0));
  // 选手心态自然回归 & 替补
  for (const p of Object.values(s.players)) {
    p.mood += (65 - p.mood) * 0.12;
    if (!p.sub && !p.benched && p.mood < 28 && p.weeksBad >= 2) {
      p.benched = true; const sub = s.players[p.team + '-Sub']; sub.benched = false; sub.role = p.role; sub.replacing = p.name;
      log.push({ t: `📰 ${p.team} 宣布：${p.name} 因状态问题下放替补，${sub.name} 首发`, c: 'bad', benched: p.name });
    } else if (p.benched && !p.sub && p.mood > 55) {
      p.benched = false; const sub = s.players[p.team + '-Sub']; if (sub.replacing === p.name) { sub.benched = true; sub.replacing = null; }
      log.push({ t: `📰 ${p.name} 调整好状态，重回首发`, c: 'good' });
    }
  }
  // 剧情状态：休战 / 赞助禁令 / 联手
  const F = s.flags ||= {};
  if (F.truce && --F.truce.weeks <= 0) { log.push({ t: `和 ${F.truce.name} 的休战期结束了`, c: '' }); delete F.truce; }
  if (F.noExtreme && --F.noExtreme <= 0) { log.push({ t: '赞助合同的"文明条款"到期了', c: '' }); delete F.noExtreme; }
  if (F.sellout && --F.sellout <= 0) delete F.sellout;
  if (F.alliance) {
    const g = Math.round(s.fans * 0.05) + 100; s.fans += g; log.push({ t: `和 ${s.rival.name} 联手互推，粉丝 +${g}`, c: 'good' });
    if (--F.alliance <= 0) { delete F.alliance; if (rand.r() < 0.3) { const l = Math.round(s.fans * 0.08); s.fans -= l; s.rival.fans += l; log.push({ t: `${s.rival.name} 背叛了你，把你的黑料全发了出来！粉丝 -${l}`, c: 'bad' }); } else log.push({ t: `和 ${s.rival.name} 的联手和平结束`, c: '' }); }
  }
  // 粉丝团：跟着粉丝增长，争议太大会有人退
  const gained = Math.max(0, s.fans - (s.weekStartFans ?? s.fans));
  const club0 = s.club ?? 30;
  s.club = Math.round(club0 + gained * 0.015 + 2);
  if (s.heat > 60) s.club = Math.round(s.club * 0.94);
  if (s.club !== club0) log.push({ t: `粉丝团 ${club0} → ${s.club} 人`, c: s.club > club0 ? 'good' : 'bad' });
  // 地铁站广告：每周被动曝光，可能被对手粉头的广告盖掉
  for (const ad of s.ads || []) {
    const p = s.players[ad.target];
    const views = Math.round((15000 + s.fans * 0.25) * diff(s).income);
    const fans = Math.round(views * B.fanConv * 0.4 / (1 + s.fans / B.fanSoftCap));
    const money = Math.round(views * B.wonPerView * 0.4);
    s.fans += fans; s.money += money; s.totalViews += views;
    if (p) { const dm = ad.kind === 'support' ? 3 : -3; p.mood = clamp(p.mood + dm, 0, 100); if (ad.kind === 'support') p.votes += 1500; noteInfluence(s, p.name, '地铁广告', ad.kind, dm); }
    log.push({ t: `🚇 地铁广告「${ad.text}」本周曝光 ${views.toLocaleString()}，粉丝 +${fans}，收入 ₩${money.toLocaleString()}`, c: 'good' });
    ad.weeks--;
    if (ad.weeks > 0 && rand.r() < 0.2) { ad.weeks = 0; log.push({ t: `${s.rival.name} 买下了同一个广告位，把你的广告盖掉了`, c: 'bad' }); }
  }
  s.ads = (s.ads || []).filter(a => a.weeks > 0);
  // 对手粉头
  const rg = Math.round(s.rival.fans * (0.08 + rand.r() * 0.2) + 400);
  s.rival.fans += rg;
  // 热搜榜
  s.trending = Object.values(s.players).sort((a, b) => b.heat - a.heat).slice(0, 8).map(p => p.name);
  return log;
}

// 每周随机事件
export const EVENTS = [
  { id: 'apology', w: 1, run: (s, p) => { p.mood = clamp(p.mood + 15, 0, 100); p.sentiment += 0.3; return `${p.name} 开直播道歉："我会更努力的。" 舆论有所缓和`; } },
  { id: 'rage', w: 1, run: (s, p) => { p.heat = 100; p.sentiment -= 0.5; return `${p.name} 直播时怼粉丝"不懂别乱说"，话题瞬间爆炸！`; } },
  { id: 'meme', w: 1.2, run: (s, p) => { s.trendTopic = p.name; return `梗图「${p.name}的一生」突然爆火，本周和 ${p.name} 相关的帖子曝光 ×1.8`; } },
  { id: 'lawyer', w: 0.7, run: (s) => { s.heat += 8; return `俱乐部发布声明：将对恶意粉丝追究法律责任。（争议度 +8）`; } },
  { id: 'watch', w: 0.6, run: (s) => { s.patrol = true; return `俱乐部开始监控粉丝账号，本周抗议类行动争议度 +50%`; } },
  { id: 'sponsor', w: 0.9, run: (s) => { const m = 300000 + Math.round(s.fans * 20); s.money += m; return `某外卖平台找你接广告，收入 ₩${m.toLocaleString()}`; } },
  { id: 'rival', w: 0.8, run: (s) => { s.rival.fans += 2000; return `${s.rival.name} 的应援视频上了热门，他又涨了 2000 粉`; } },
  { id: 'injury', w: 0.4, run: (s, p) => { p.mood -= 15; p.form -= 3; return `传闻 ${p.name} 手腕旧伤复发，状态堪忧`; } },
  { id: 'transfer', w: 0.5, run: (s, p) => { p.heat += 40; return `转会市场传闻：${p.name} 可能下赛季离队！话题度飙升`; } },
];

export function weeklyEvent(s) {
  s.trendTopic = null; s.patrol = false;
  const tot = EVENTS.reduce((a, e) => a + e.w, 0); let r = rand.r() * tot, e = EVENTS[0];
  for (const x of EVENTS) { r -= x.w; if (r <= 0) { e = x; break; } }
  const cands = Object.values(s.players).filter(p => !p.sub).sort((a, b) => b.heat - a.heat).slice(0, 8);
  const p = rand.pick(cands);
  return { id: e.id, text: e.run(s, p), player: p.name };
}

// ---------- 全明星 ----------
export function allStar(s) {
  const roles = ['TOP', 'JG', 'MID', 'ADC', 'SUP'], out = {};
  for (const r of roles) {
    const c = Object.values(s.players).filter(p => p.role === r && !p.sub).map(p => ({ name: p.name, v: p.popularity * 80 + p.skill * 400 + p.votes + p.lastRatings.reduce((a, b) => a + b, 0) * 300 })).sort((a, b) => b.v - a.v);
    out[r] = c;
  }
  return out;
}
