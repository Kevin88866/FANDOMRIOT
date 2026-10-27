// 菜单焦点导航：方向键 / 手柄十字键 / 左摇杆在可点的元素之间移动，Enter / A 确认，Esc / B 返回。
// 鼠标用户不显示焦点框；一旦用键盘方向键或手柄操作，焦点框出现。
const SEL = 'button:not([disabled]), .card, [data-nav], input[type=range], select, .slot';

export class Focus {
  constructor(ui) { this.ui = ui; this.cur = null; this.repeatAt = 0; this.lastDir = null; }
  get root() { return this.ui.modal.classList.contains('hidden') ? null : this.ui.modal; }
  items() {
    const r = this.root; if (!r) return [];
    return [...r.querySelectorAll(SEL)].filter(el => el.offsetParent !== null && !el.classList.contains('nofocus'));
  }
  clear() { if (this.cur) this.cur.classList.remove('focus'); this.cur = null; }
  set(el, sound = false) {
    if (this.cur === el) return;
    if (this.cur) this.cur.classList.remove('focus');
    this.cur = el || null;
    if (el) { el.classList.add('focus'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (sound) this.ui.g.audio?.hover?.(); }
  }
  // 打开新面板后：手柄 / 键盘用户自动聚焦到主按钮
  reset(force = false) {
    this.clear();
    if (!force && this.ui.g.input?.device !== 'pad') return;
    const list = this.items();
    this.set(list.find(el => el.classList.contains('pri')) || list[0]);
  }
  move(dx, dy) {
    const list = this.items(); if (!list.length) return;
    if (!this.cur || !list.includes(this.cur)) return this.set(list.find(el => el.classList.contains('pri')) || list[0], true);
    const el = this.cur;
    if (dx && el.type === 'range') {   // 滑条：左右调数值
      const st = +el.step || 0.05; el.value = Math.min(+el.max, Math.max(+el.min, +el.value + dx * st));
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (dx && el.tagName === 'SELECT') {
      el.selectedIndex = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + dx));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const a = el.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const o of list) {
      if (o === el) continue;
      const b = o.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = dx ? (bx - ax) * dx : (by - ay) * dy;
      if (along <= 2) continue;
      // 同一行/列优先：横向距离权重更大
      const across = dx ? Math.max(0, Math.abs(by - ay) - a.height / 2) : Math.max(0, Math.abs(bx - ax) - Math.max(a.width, b.width) / 2);
      const score = along + across * 3;
      if (score < bs) { bs = score; best = o; }
    }
    if (best) this.set(best, true);
  }
  activate() {
    const el = this.cur; if (!el) return false;
    if (el.type === 'range') return true;
    if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'text')) { el.focus(); return true; }
    el.click();
    return true;
  }
  // 手柄 / 摇杆的方向（带按住连发）
  stick(dx, dy, now) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (Math.abs(dx) > 0.5 ? [Math.sign(dx), 0] : null) : (Math.abs(dy) > 0.5 ? [0, Math.sign(dy)] : null);
    const k = dir ? dir.join() : null;
    if (!k) { this.lastDir = null; return; }
    if (k !== this.lastDir) { this.lastDir = k; this.repeatAt = now + 380; this.move(...dir); }
    else if (now > this.repeatAt) { this.repeatAt = now + 110; this.move(...dir); }
  }
}
