// 数值平衡模拟：node tools/simulate.mjs [局数]
// 一个简单的"机器人玩家"每周买得起的最好道具、拍 0.6~1.3 质量的照片、发 2~3 帖，统计经济和粉丝曲线。
import { ITEMS, BALANCE as B } from '../src/content/data.js';
import * as Sim from '../src/sim/sim.js';

const RUNS = +process.argv[2] || 300;
const UNLOCK = [0, 1500, 6000, 15000, 35000, 60000, 100000];
const lvl = f => UNLOCK.filter(x => f >= x).length - 1;

function playSeason(style) {
  const s = Sim.newGame('T0'); s.inventory = [];
  const weekly = [];
  for (let season = 1; season <= 3; season++) {
    for (s.week = 1; s.week <= B.weeksPerSeason; s.week++) {
      Sim.playWeek(s); Sim.weeklyEvent(s);
      const ps = Object.values(s.players).filter(p => !p.sub && !p.benched);
      const evs = [];
      // 每晚做 2 件事
      for (let k = 0; k < 2; k++) {
        const kind = style === 'mix' ? (k ? 'support' : 'attack') : style;
        const tgt = kind === 'attack' ? ps.sort((a, b) => a.sentiment - b.sentiment)[0] : ps.sort((a, b) => b.sentiment - a.sentiment)[0];
        const opts = ITEMS.filter(i => !i.truck || true).filter(i => (i.kind === kind || i.kind === 'both') && i.unlock <= lvl(s.fans) && Sim.itemCost(s, i) <= s.money * 0.6);
        if (!opts.length) continue;
        const it = opts.sort((a, b) => b.impact - a.impact)[0];
        s.money -= Sim.itemCost(s, it);
        evs.push(Sim.applyAction(s, { item: it.id, target: tgt.name, kind }));
      }
      for (const ev of evs) {
        const tags = ['subject']; if (Math.random() < 0.5) tags.push('text'); if (Math.random() < 0.4) tags.push('logo'); if (Math.random() < 0.3) tags.push('crowd');
        const photo = { q: 0.6 + Math.random() * 0.7, tags };
        for (const [i, pl] of ['x', 'tok'].entries()) {
          if (s.banned[pl]) continue;
          const r = Sim.evaluatePost(s, { photo, ev, platform: pl, tone: ev.kind === 'support' ? 'emo' : 'mock', extraPlatform: i });
          Sim.commitPost(s, r);
        }
      }
      Sim.endOfWeek(s, []);
      for (const k of ['photo', 'edit', 'net', 'stealth']) while (s.skillPoints > 0 && s.skills[k] < 5) { s.skillPoints--; s.skills[k]++; }
      weekly.push({ season, week: s.week, money: s.money, fans: s.fans, heat: s.heat });
      if (s.money < -5e6 || s.lawsuits >= 3) return { s, weekly, dead: true };
    }
  }
  return { s, weekly, dead: false };
}

for (const style of ['attack', 'support', 'mix']) {
  const res = Array.from({ length: RUNS }, () => playSeason(style));
  const at = (season, week) => res.map(r => r.weekly.find(w => w.season === season && w.week === week)).filter(Boolean);
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)] ?? 0; };
  const line = (season, week) => { const w = at(season, week); return `S${season}W${week} 粉丝中位 ${Math.round(med(w.map(x => x.fans)))} 资金中位 ${Math.round(med(w.map(x => x.money)) / 1e4)}万`; };
  console.log(`\n== ${style} ==  死亡率 ${(res.filter(r => r.dead).length / RUNS * 100).toFixed(0)}%  律师函平均 ${(res.reduce((a, r) => a + r.s.lawsuits, 0) / RUNS).toFixed(2)}`);
  for (const [s, w] of [[1, 3], [1, 10], [2, 10], [3, 10]]) console.log('  ' + line(s, w));
  console.log(`  S1 结束粉丝 ≥ 2万 的比例 ${(at(1, 10).filter(w => w.fans >= 20000).length / RUNS * 100).toFixed(0)}%`);
}
