// 自己写的帖子文案：按规则打分（不联网）。返回曝光系数 k（0.6–1.5）、逐项说明和额外争议度。
import { TEAMS } from '../content/data.js';

export const LIMITS = { x: 140, tok: 60, dc: 300 };
const IDEAL_MIN = { x: 12, tok: 4, dc: 20 };

const WORDS = {
  mock: ['笑死', '就这', 'OUT', 'out', '下饭', '演员', '退役', '白给', '离谱', '绷不住', '😅', '🤡', '😂', '🙄', '呵呵', '送分', '梦游'],
  emo: ['心疼', '哭', '❤', '♥', '永远', '加油', '支持', '辛苦', '泪', '感动', '守护', '一直在', '🥺', '😭', '应援', '爱你'],
  calm: ['数据', '分析', '客观', '表现', '建议', '理性', 'KDA', '经济', '视野', '对线', '复盘', '%'],
};
const INSULT = ['滚', '废物', '傻', 'sb', 'SB', '去死', '垃圾', '脑残', '狗'];
const ITEM_WORDS = {
  wreath: ['花圈'], truck: ['卡车', 'LED'], banner: ['横幅'], fireworks: ['烟花'], drone: ['无人机'], coffee: ['咖啡'],
  billboard: ['大屏', '生日'], flowers: ['花篮'], eggs: ['鸡蛋', '蛋'], graffiti: ['涂鸦', '喷漆'], rally: ['集会'],
  slogan: ['手幅', '灯牌'], lightstick: ['应援棒', '手环'], cake: ['蛋糕'], balloon: ['气球'], projector: ['投影'],
  lunch: ['便当', '饮料'], busad: ['公交', '车身'], megaphone: ['喇叭', '喊话'],
};

const count = (t, list) => list.reduce((n, w) => n + (t.split(w).length - 1), 0);
const emojiCount = t => (t.match(/\p{Extended_Pictographic}/gu) || []).length;
const bigrams = t => { const s = new Set(); const c = [...t.replace(/\s+/g, '')]; for (let i = 0; i < c.length - 1; i++) s.add(c[i] + c[i + 1]); return s; };
function similarity(a, b) {
  const A = bigrams(a), Bs = bigrams(b); if (!A.size || !Bs.size) return 0;
  let n = 0; for (const x of A) if (Bs.has(x)) n++;
  return n / (A.size + Bs.size - n);
}

// 文案读起来是什么语气（用来和选的语气、事件立场比对）
export function detectTone(text) {
  const sc = Object.fromEntries(Object.entries(WORDS).map(([k, l]) => [k, count(text, l)]));
  const best = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

export function scoreCaption(text, { platform, tone, ev, s, history = [] }) {
  const t = (text || '').trim(), notes = [];
  let k = 1, heat = 0;
  const add = (v, msg) => { k += v; notes.push({ v, t: msg }); };
  const len = [...t].length, lim = LIMITS[platform] || 140;
  if (!len) { add(-0.25, '没有配文'); return { k: Math.max(0.6, k), notes, heat, len }; }

  // 1. 提到目标选手 / 战队
  if (ev) {
    const team = TEAMS.find(tm => tm.players.some(p => p[0] === ev.target));
    const hit = t.includes(ev.target) || (team && (t.includes(team.name) || t.includes(team.id)));
    hit ? add(0.12, `提到了 ${ev.target}`) : add(-0.1, `没提到 ${ev.target}，路人看不懂在说谁`);
  }
  // 2. 话题标签和风口
  const tags = t.match(/#[^\s#]+/g) || [];
  if (tags.length >= 1 && tags.length <= 3) add(platform === 'x' ? 0.1 : 0.06, `${tags.length} 个话题标签`);
  else if (tags.length > 5) add(-0.08, '标签刷屏');
  const trend = s?.trendTopic || s?.trending?.[0];
  if (trend && t.includes(trend) && trend !== ev?.target) add(0.15, `蹭上了风口「${trend}」`);
  // 3. 字数
  if (len > lim) add(-0.15, `超过 ${lim} 字，被折叠`);
  else if (len < (IDEAL_MIN[platform] || 8)) add(-0.06, '太短了，没信息量');
  else add(0.06, '长度合适');
  // 4. 语气
  const tt = detectTone(t);
  if (tt && tt === tone) add(0.08, '文案语气和选的一致');
  else if (tt && tone && tt !== tone) add(-0.05, '文案语气和选的不一致');
  if (ev && tt) {
    if (ev.kind === 'support' && tt === 'mock') add(-0.12, '应援照配嘲讽文案，粉丝看懵了');
    if (ev.kind === 'attack' && tt === 'emo' && tone !== 'emo') add(-0.04, '骂人帖写得太煽情');
  }
  if (platform === 'dc' && tt === 'mock') add(0.06, 'DC 就爱看这种');
  if (platform === 'dc' && tt === 'calm') add(0.04, '分析帖在 DC 有人认真看');
  // 5. 表情和标点
  const em = emojiCount(t);
  if (em >= 1 && em <= 4) add(platform === 'tok' ? 0.07 : 0.04, '表情用得刚好');
  else if (em > 8) add(-0.06, '表情太多');
  if ((t.match(/[!！?？]/g) || []).length > 6) add(-0.04, '感叹号太多');
  // 6. 和照片内容对不上
  if (ev) {
    const own = ITEM_WORDS[ev.item] || [];
    if (own.some(w => t.includes(w))) add(0.05, '文案和照片对得上');
    const wrong = Object.entries(ITEM_WORDS).find(([id, ws]) => id !== ev.item && ws.some(w => t.includes(w) && !own.some(o => o.includes(w) || w.includes(o))));
    if (wrong) add(-0.1, `照片里没有「${wrong[1][0]}」`);
  }
  // 7. 和之前的帖子重复
  const sim = Math.max(0, ...history.map(h => similarity(t, h)));
  if (sim > 0.85) add(-0.3, '和之前的帖子几乎一样');
  else if (sim > 0.6) add(-0.18, '和之前的帖子很像');
  // 8. 人身攻击：有流量，但争议度上涨
  const ins = count(t, INSULT);
  if (ins) { heat += Math.min(9, ins * 3); add(ev?.kind === 'support' ? -0.1 : 0.05, `人身攻击（争议度 +${Math.min(9, ins * 3)}）`); }

  return { k: Math.min(1.5, Math.max(0.6, k)), notes, heat, len, tags, tone: tt };
}
