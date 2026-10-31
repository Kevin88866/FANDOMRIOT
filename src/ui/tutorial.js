// 新手引导：第一周按步骤提示（走动 → 用品店 → 下单 → 去总部使用 → 摆放 → 拍照 → 回家 → 发帖）。
// 玩家提前做了后面的事会自动跳过前面的步骤。进度存在存档里（state.tut），设置里可以关掉。
import { settings } from '../engine/settings.js';

const STEPS = [
  { until: 'moved', kbd: K => `用 ${K('up')}${K('left')}${K('down')}${K('right')} 走动，移动鼠标转视角，按住 ${K('run')} 奔跑`, pad: () => '左摇杆走动，右摇杆转视角，按住 <kbd class="pad">RT</kbd> 奔跑' },
  { until: 'shopOpen', kbd: K => `去「应援 & 抗议用品店」—— 小地图上的<b class="pk">粉色点</b>，到门口按 ${K('interact')}` },
  { until: 'ordered', kbd: () => '挑一个道具下单。第一次建议买<b>花圈</b>或<b>横幅</b>，写上你的标语' },
  { until: 'used', kbd: K => `道具在哪都能用（按 ${K('useHere')}），但去目标选手的总部门口（小地图上的菱形）按 ${K('interact')} 用效果最好` },
  { until: 'placed', kbd: K => `摆放：移动鼠标选位置，左键放下，${K('rotL')} ${K('rotR')} 旋转。排整齐、正对街道排面更好`, pad: K => `摆放：左摇杆移动，${K('interact')} 放下，${K('rotL')} ${K('rotR')} 旋转` },
  { until: 'photo', kbd: K => `按 ${K('photo')} 掏出手机，让道具和标语进入黄框，"画面质量"条越满越好，然后拍照`, pad: K => `按 ${K('photo')} 掏出手机，让道具和标语进入黄框，<kbd class="pad">RT</kbd> 拍照` },
  { until: 'dayEnd', kbd: K => `拍到满意的照片就回家 —— 小地图上的<b class="yl">黄点</b>，按 ${K('interact')} 结束今天` },
  { until: 'posted', kbd: () => '挑一张最好的照片，选平台和语气发出去。曝光会换成粉丝和钱' },
];

export class Tutorial {
  constructor(game) {
    this.g = game;
    this.el = document.createElement('div'); this.el.id = 'tutorial'; this.el.className = 'hidden';
    document.body.appendChild(this.el);
    this.moved = 0;
    game.input.onDevice(() => this.render());
  }
  get s() { return this.g.state; }
  get active() {
    const s = this.s;
    return !!s && settings.tutorial && s.season === 1 && s.week <= 2 && (s.tut ?? 0) < STEPS.length;
  }
  event(name) {
    if (!this.active) return;
    const i = STEPS.findIndex(st => st.until === name);
    if (i < 0 || i < (this.s.tut ?? 0)) return;
    this.s.tut = i + 1;
    this.g.audio?.notify();
    if (this.s.tut >= STEPS.length) { this.g.ui.toast('新手引导完成！之后就靠你自己了 💪', 'good'); this.g.ui.achieve?.('tutorial'); }
    this.render();
  }
  // 每帧：统计走动距离；根据当前模式显示 / 隐藏
  update(dt) {
    if (!this.active) { this.el.classList.add('hidden'); return; }
    const g = this.g, step = this.s.tut ?? 0;
    if (step === 0 && g.mode === 'play' && g.player) {
      const p = g.player.pos;
      if (this.last) this.moved += Math.hypot(p.x - this.last.x, p.z - this.last.z);
      this.last = { x: p.x, z: p.z };
      if (this.moved > 10) this.event('moved');
    }
    const show = g.day && (g.mode === 'play' || g.mode === 'place' || g.mode === 'photo' || (g.mode === 'ui' && step >= 2 && step <= 2))
      || (step === 7 && g.mode === 'ui');
    this.el.classList.toggle('hidden', !show);
    if (show && this.shown !== step) this.render();
  }
  render() {
    if (!this.active) return;
    const step = this.s.tut ?? 0, st = STEPS[step], K = a => this.g.input.K(a);
    const txt = this.g.input.device === 'pad' && st.pad ? st.pad(K) : st.kbd(K);
    this.el.innerHTML = `<div class="tut-h">新手引导 <span>${step + 1} / ${STEPS.length}</span><i style="width:${(step / STEPS.length) * 100}%"></i></div><div class="tut-t">${txt}</div>`;
    this.shown = step;
  }
}
