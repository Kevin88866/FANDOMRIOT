// 剧情私信（每周一条，二选一/三选一）、每周商单任务、成就。
// 效果函数直接修改存档 s，返回一句结果说明。所有数值都可以在这里调。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = (s, k) => Math.round(s.fans * k);

// 找一个"最近被你骂过"的选手 / "最近被你捧过"的选手
export function storyTargets(s) {
  const inf = Object.entries(s.lastInfluence || {});
  const attacked = inf.filter(([, v]) => v.acts.some(a => a.kind === 'attack')).map(([n]) => n);
  const supported = inf.filter(([, v]) => v.acts.some(a => a.kind === 'support')).map(([n]) => n);
  return { attacked: attacked[0], supported: supported[0] || (s.goals?.route === 'support' ? s.goals.target : null) };
}

export const STORIES = [
  {
    id: 'bribe', w: 1, cond: (s, t) => t.attacked && s.fans > 2000,
    from: '俱乐部公关部', av: '🏢',
    text: (s, t) => `您好，我们注意到您最近发布了很多关于 ${t.attacked} 的内容。只要您删除这些帖子，我们愿意支付 ₩${(1500000 + s.fans * 40).toLocaleString()} 作为"合作费"。`,
    options: [
      { label: '收钱删帖', desc: '拿钱，但有人会截图', run: (s) => { const m = 1500000 + s.fans * 40; s.money += m; const f = pct(s, 0.08); s.fans -= f; s.flags.sellout = 3; return `收到 ₩${m.toLocaleString()}。消息走漏了，"恰饭博主"的帖子掉了你 ${f} 粉。`; } },
      { label: '公开聊天记录', desc: '流量爆炸，但俱乐部会盯上你', run: (s) => { const f = pct(s, 0.07) + 300; s.fans += f; s.heat = clamp(s.heat + 12, 0, 120); return `截图一发就上了热搜，粉丝 +${f}，争议度 +12。`; } },
      { label: '已读不回', desc: '什么也不发生', run: () => '你把手机扣在了桌上。' },
    ],
  },
  {
    id: 'player_dm', w: 1.2, cond: (s, t) => t.attacked && s.players[t.attacked]?.mood < 50,
    from: (s, t) => t.attacked, av: '🎮',
    text: (s, t) => `${t.attacked} 本人发来私信："我知道最近打得不好……能不能先停一停？我真的在努力。"`,
    options: [
      { label: '答应停手两周', desc: '他心态 +20。休战期间再骂他会被骂"出尔反尔"', run: (s, t) => { s.players[t.attacked].mood = clamp(s.players[t.attacked].mood + 20, 0, 100); s.flags.truce = { name: t.attacked, weeks: 2 }; return `${t.attacked} 回了一个"谢谢"。他的心态回升了。`; } },
      { label: '把私信挂出来', desc: '粉丝 +6%，争议度 +10，他心态 -10', run: (s, t) => { const f = pct(s, 0.06) + 200; s.fans += f; s.heat = clamp(s.heat + 10, 0, 120); s.players[t.attacked].mood = clamp(s.players[t.attacked].mood - 10, 0, 100); return `帖子很快被转疯了，粉丝 +${f}。也有人说你太狠了。`; } },
    ],
  },
  {
    id: 'alliance', w: 0.8, cond: (s) => s.week >= 2 && !s.flags.alliance,
    from: (s) => s.rival.name, av: '⚔',
    text: (s) => `${s.rival.name}："我们别互相抢热度了。联手两周，我每周分你一点流量，怎么样？"`,
    options: [
      { label: '联手', desc: '两周内每周粉丝 +5%（他可能背叛）', run: (s) => { s.flags.alliance = 2; return '你们互关了。圈内开始传你们是一伙的。'; } },
      { label: '拒绝', desc: '他会去举报你：下周争议度 +8', run: (s) => { s.heat = clamp(s.heat + 8, 0, 120); return `${s.rival.name} 冷笑了一声。你的几条帖子被举报了，争议度 +8。`; } },
    ],
  },
  {
    id: 'split', w: 1, cond: (s) => s.heat > 35 && s.club > 40,
    from: '粉丝团群聊', av: '👥',
    text: (s) => `粉丝团群里吵翻了：一半人觉得你最近太激进，要退群；另一半人说"不爽可以走"。群里现在 ${s.club} 人。`,
    options: [
      { label: '办线下聚会安抚（₩500,000）', desc: '粉丝团 +20%', run: (s) => { s.money -= 500000; const n = Math.round(s.club * 0.2); s.club += n; return `烤肉吃完，大家和好了。粉丝团 +${n} 人。`; } },
      { label: '清理群成员', desc: '粉丝团 -30%，但剩下的更铁，粉丝 +3%', run: (s) => { const n = Math.round(s.club * 0.3); s.club -= n; const f = pct(s, 0.03); s.fans += f; return `踢了 ${n} 个人。"纯度"提高了，粉丝 +${f}。`; } },
    ],
  },
  {
    id: 'sponsor', w: 0.9, cond: (s) => s.fans > 5000 && !s.flags.noExtreme,
    from: '能量饮料品牌 BOLT', av: '⚡',
    text: () => '我们想赞助您！₩2,000,000 预付款。条件：4 周内不能有臭鸡蛋、涂鸦这类行为，违约要退还双倍。',
    options: [
      { label: '签约', desc: '立刻 +₩2,000,000，4 周内禁用臭鸡蛋 / 涂鸦', run: (s) => { s.money += 2000000; s.flags.noExtreme = 4; return '合同签好了。接下来 4 周要克制一点。'; } },
      { label: '拒绝', desc: '保持自由', run: () => '你回复："我的风格不卖。"' },
    ],
  },
  {
    id: 'journalist', w: 0.8, cond: (s) => s.fans > 3000,
    from: '电视台记者', av: '📺',
    text: () => '我们在做一期"电竞饭圈"专题，想采访您 10 分钟，聊聊您做的那些应援和抗议。',
    options: [
      { label: '接受采访', desc: '粉丝 +8%，争议度 +5', run: (s) => { const f = pct(s, 0.08) + 300; s.fans += f; s.heat = clamp(s.heat + 5, 0, 120); return `节目播出了，你被剪成了"饭圈狠人"。粉丝 +${f}。`; } },
      { label: '婉拒', desc: '低调', run: () => '你说"我只是个普通粉丝"。' },
    ],
  },
  {
    id: 'leak', w: 0.7, cond: (s, t) => t.attacked,
    from: '匿名账号', av: '🕶',
    text: (s, t) => `有人匿名发给你一段视频，说是 ${t.attacked} 训练时在睡觉。真假不明。`,
    options: [
      { label: '转发', desc: '70% 是真的：粉丝 +10%；30% 是假的：粉丝 -15%', run: (s, t) => { s.heat = clamp(s.heat + 12, 0, 120); if (Math.random() < 0.7) { const f = pct(s, 0.1) + 300; s.fans += f; s.players[t.attacked].mood = clamp(s.players[t.attacked].mood - 15, 0, 100); return `视频是真的，舆论炸了。粉丝 +${f}，${t.attacked} 心态 -15。`; } const f = pct(s, 0.15); s.fans -= f; return `视频是剪辑过的假货！你被骂上热搜，粉丝 -${f}。`; } },
      { label: '不碰', desc: '安全', run: () => '你把视频删了。' },
    ],
  },
  {
    id: 'birthday', w: 1, cond: (s, t) => t.supported || s.goals?.route === 'support',
    from: '粉丝团群聊', av: '🎂',
    text: (s, t) => `下周是 ${t.supported || s.goals.target} 的生日！大家想众筹一个生日应援，问你要不要牵头。`,
    options: [
      { label: '牵头（₩1,000,000）', desc: '他心态 +15、人气大涨，粉丝 +5%', run: (s, t) => { const n = t.supported || s.goals.target, p = s.players[n]; s.money -= 1000000; p.mood = clamp(p.mood + 15, 0, 100); p.votes += 20000; const f = pct(s, 0.05) + 200; s.fans += f; return `生日应援刷屏了！${n} 发 ins 感谢粉丝，你的粉丝 +${f}。`; } },
      { label: '让别人来', desc: '省钱', run: () => '应援还是办了，只是没人记得你。' },
    ],
  },
  {
    id: 'haters', w: 1, cond: (s) => s.fans > 1500,
    from: 'DC 论坛', av: '💢',
    text: () => '有人在 DC 论坛开了个帖子专门骂你，已经 300 多楼了。',
    options: [
      { label: '亲自下场回怼', desc: '争议度 +8，粉丝 +4%', run: (s) => { const f = pct(s, 0.04) + 100; s.fans += f; s.heat = clamp(s.heat + 8, 0, 120); return `你在帖子里大战三百回合。吃瓜群众越来越多，粉丝 +${f}。`; } },
      { label: '冷处理', desc: '争议度 -5', run: (s) => { s.heat = clamp(s.heat - 5, 0, 120); return '帖子沉了。'; } },
      { label: '让律师发声明', desc: '需要签约律师：争议度 -15', run: (s) => { if (!s.lawyer) return '你还没签律师……对方笑得更开心了。'; s.heat = clamp(s.heat - 15, 0, 120); return '律师声明一出，帖子全删了。争议度 -15。'; } },
    ],
  },
  {
    id: 'charity', w: 0.7, cond: (s) => s.heat > 25 && s.money > 2000000,
    from: '一位老粉', av: '💌',
    text: () => '"与其天天骂人，不如把钱捐了做点好事？大家会看到的。"',
    options: [
      { label: '以粉丝团名义捐款（₩1,000,000）', desc: '争议度 -20，粉丝 +3%', run: (s) => { s.money -= 1000000; s.heat = clamp(s.heat - 20, 0, 120); const f = pct(s, 0.03); s.fans += f; return `捐款证明发出去了，评论区一片好评。争议度 -20，粉丝 +${f}。`; } },
      { label: '"关你什么事"', desc: '无事发生', run: () => '对方把你拉黑了。' },
    ],
  },
  {
    id: 'oldpost', w: 0.6, cond: (s) => s.fans > 8000,
    from: '热搜提醒', av: '📜',
    text: () => '你五年前的一条黑历史帖子被翻出来了，评论区正在发酵。',
    options: [
      { label: '真诚道歉', desc: '粉丝 -3%，争议度 -10', run: (s) => { const f = pct(s, 0.03); s.fans -= f; s.heat = clamp(s.heat - 10, 0, 120); return `道歉信写得很诚恳，风波过去了。粉丝 -${f}。`; } },
      { label: '"年轻不懂事，谁没有过去"', desc: '争议度 +10，粉丝 +2%', run: (s) => { const f = pct(s, 0.02); s.fans += f; s.heat = clamp(s.heat + 10, 0, 120); return `硬刚到底。骂你的人和挺你的人吵成一团，粉丝 +${f}。`; } },
    ],
  },
];

export function pickStory(s) {
  const t = storyTargets(s);
  const seen = s.storySeen || [];
  const c = STORIES.filter(x => x.cond(s, t) && !seen.slice(-4).includes(x.id));
  if (!c.length || Math.random() < 0.25) return null;
  const tot = c.reduce((a, x) => a + x.w, 0); let r = Math.random() * tot;
  for (const x of c) { r -= x.w; if (r <= 0) return { story: x, t }; }
  return { story: c[0], t };
}

// ---------- 每周商单任务 ----------
// check(ctx) 在周结算时调用：ctx = { s, photos, events, results, heat }
export const MISSIONS = [
  { id: 'reaction', name: '拍到选手亲眼看到你道具的瞬间', reward: { money: 1500000 }, check: c => c.photos.some(p => p.reaction) },
  { id: 'views', name: '单条帖子曝光超过 {n}', n: s => 20000 * s.season + s.week * 3000, reward: { money: 1000000, fans: 300 }, check: c => c.results.some(r => r.views >= c.n) },
  { id: 'lowheat', name: '周结算时争议度不超过 30', reward: { money: 800000 }, check: c => c.s.heat <= 30 },
  { id: 'variety', name: '一晚用 3 种不同的道具', reward: { skill: 1 }, check: c => new Set(c.events.map(e => e.item)).size >= 3 },
  { id: 'slogan', name: '拍到 LED 屏标语正好在中间的卡车', reward: { money: 1000000 }, check: c => c.photos.some(p => p.truckSlogan) },
  { id: 'support', name: '这周只做应援，不做抗议', reward: { fans: 800 }, check: c => c.events.length > 0 && c.events.every(e => e.kind === 'support') },
  { id: 'press', name: '让电视台记者和你的现场同框', reward: { money: 1000000 }, check: c => c.photos.some(p => p.press) },
  { id: 'layout', name: '摆出五星排面', reward: { money: 600000 }, check: c => c.events.some(e => e.layout >= 1.18) },
  { id: 'star', name: '拍到下班的选手本人', reward: { money: 700000 }, check: c => c.photos.some(p => p.star) },
  { id: 'trio', name: '发满 3 条帖子', reward: { money: 500000 }, check: c => c.results.length >= 3 },
];

export function rollMissions(s) {
  const pool = MISSIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
  s.missions = pool.map(m => ({ id: m.id, n: m.n ? m.n(s) : null, done: false }));
}

export function missionText(m) { const d = MISSIONS.find(x => x.id === m.id); return d.name.replace('{n}', m.n ? m.n.toLocaleString() : ''); }
export function rewardText(r) { return [r.money && `₩${(r.money / 10000).toLocaleString()}万`, r.fans && `粉丝 +${r.fans}`, r.skill && `技能点 +${r.skill}`].filter(Boolean).join(' · '); }

// ---------- 成就 ----------
export const ACHIEVEMENTS = [
  { id: 'tutorial', name: '入坑', desc: '完成新手引导' },
  { id: 'first_post', name: '初出茅庐', desc: '发出第一条帖子' },
  { id: 'viral', name: '一夜爆红', desc: '第一次爆款' },
  { id: 'viral5', name: '流量密码', desc: '累计 5 次爆款' },
  { id: 'reaction', name: '他看到了', desc: '拍到选手亲眼看到你道具的名场面' },
  { id: 'layout', name: '排面大师', desc: '摆出五星排面' },
  { id: 'door', name: '堵门专业户', desc: '堵住总部大门，惊动保安' },
  { id: 'press', name: '上电视了', desc: '和电视台记者同框' },
  { id: 'rival', name: '抢镜王', desc: '在抢镜对决中赢过对手粉头' },
  { id: 'stream', name: '直播间常客', desc: '接受街头主播的采访' },
  { id: 'lawsuit', name: '收到律师函', desc: '这不是什么值得骄傲的事' },
  { id: 'fans10k', name: '小有名气', desc: '粉丝达到 1 万' },
  { id: 'fans100k', name: '饭圈顶流', desc: '粉丝达到 10 万' },
  { id: 'rich', name: '财务自由', desc: '资金达到 ₩5,000 万' },
  { id: 'benched', name: '一言定首发', desc: '让目标选手被下放替补' },
  { id: 'allstar', name: '造星', desc: '把目标选手捧进全明星' },
  { id: 'champion', name: '冠军粉', desc: '主队拿下总冠军' },
  { id: 'missions', name: '商单达人', desc: '累计完成 10 个商单' },
  { id: 'ending', name: '饭圈风云', desc: '打完三个赛季，看到结局' },
];

const ACH_KEY = 'fr_ach_v1';
export function achLoad() { try { return JSON.parse(localStorage.getItem(ACH_KEY)) || {}; } catch { return {}; } }
export function achGrant(id) {
  const a = achLoad(); if (a[id]) return false;
  a[id] = Date.now(); try { localStorage.setItem(ACH_KEY, JSON.stringify(a)); } catch { /* 无痕模式 */ }
  return ACHIEVEMENTS.find(x => x.id === id);
}
