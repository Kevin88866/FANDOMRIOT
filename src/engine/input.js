// 输入层：键盘 / 鼠标 / 手柄统一成"动作"。键位可在设置里改（只改主键，方向键等副键固定）。
import { settings, setSetting } from './settings.js';

export const ACTIONS = [
  // [动作, 名称, 默认主键, 副键, 手柄按键说明]
  ['up', '前进', 'KeyW', 'ArrowUp', '左摇杆'],
  ['down', '后退', 'KeyS', 'ArrowDown', '左摇杆'],
  ['left', '向左', 'KeyA', 'ArrowLeft', '左摇杆'],
  ['right', '向右', 'KeyD', 'ArrowRight', '左摇杆'],
  ['run', '奔跑 / 油门', 'ShiftLeft', 'ShiftRight', 'RT'],
  ['brake', '刹车', 'Space', null, 'LT'],
  ['interact', '互动', 'KeyE', null, 'A'],
  ['vehicle', '上车 / 下车', 'KeyF', null, 'X'],
  ['photo', '手机拍照', 'KeyC', null, 'Y'],
  ['inventory', '背包', 'Tab', null, '十字键↓'],
  ['map', '大地图', 'KeyM', null, 'View'],
  ['objective', '收起目标', 'KeyH', null, '十字键↑'],
  ['rotL', '摆放：左转', 'KeyQ', null, 'LB'],
  ['rotR', '摆放：右转', 'KeyR', null, 'RB'],
  ['pause', '菜单', 'Escape', null, 'Menu'],
];
const DEF = Object.fromEntries(ACTIONS.map(a => [a[0], a]));

// 当前键位：主键（可改）+ 副键
export function codesFor(action) {
  const a = DEF[action]; if (!a) return [];
  const main = settings.keys[action] || a[2];
  const out = [main]; if (a[3]) out.push(a[3]);
  if (action === 'rotR') out.push('KeyE');   // 摆放模式下 E 也能右转（老玩家习惯）
  return out;
}
export function actionOf(code) {
  for (const [id] of ACTIONS) if (codesFor(id).includes(code)) return id;
  return null;
}
export function rebind(action, code) {
  const keys = { ...settings.keys };
  // 别的动作占了这个键就互换
  for (const [id] of ACTIONS) if (id !== action && (keys[id] || DEF[id][2]) === code) keys[id] = settings.keys[action] || DEF[action][2];
  keys[action] = code;
  setSetting({ keys });
}

const NICE = { Space: '空格', Escape: 'Esc', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', Tab: 'Tab', Enter: 'Enter', Backspace: '退格', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps' };
export const keyName = code => NICE[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, '小键盘');

// 手柄按键（标准布局，Xbox 命名）
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const PAD_OF = { interact: 'A', vehicle: 'X', photo: 'Y', inventory: 'DOWN', map: 'VIEW', objective: 'UP', rotL: 'LB', rotR: 'RB', pause: 'MENU' };
const PAD_GLYPH = { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', VIEW: '⧉', MENU: '☰', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' };

export class Input {
  constructor() {
    this.device = 'kbd';           // 最后使用的设备：kbd | pad
    this.up = this.down = this.left = this.right = this.run = this.brake = 0; this.mouseActive = false;   // 本帧移动状态（0..1）
    this.pad = null; this.prev = []; this.axes = [0, 0, 0, 0];
    this.listeners = new Set();
    addEventListener('keydown', () => this.setDevice('kbd'), true);
    addEventListener('mousedown', () => this.setDevice('kbd'), true);
    addEventListener('gamepadconnected', e => { this.toastPad?.(`🎮 已连接手柄：${e.gamepad.id.split('(')[0].trim()}`); });
  }
  setDevice(d) {
    if (this.device === d) return;
    this.device = d; document.body.classList.toggle('pad', d === 'pad');
    for (const fn of this.listeners) fn(d);
  }
  onDevice(fn) { this.listeners.add(fn); }

  // 界面上的按键提示：<kbd>E</kbd> 或手柄的 <kbd class="pad">A</kbd>
  K(action) {
    if (this.device === 'pad') { const b = PAD_OF[action] || ({ run: 'RT', brake: 'LT' })[action]; if (b) return `<kbd class="pad p-${b}">${PAD_GLYPH[b]}</kbd>`; }
    return `<kbd>${keyName(codesFor(action)[0])}</kbd>`;
  }

  // 每帧轮询手柄：返回本帧"刚按下"的按键集合
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(g => g && g.connected);
    this.pad = p || null;
    if (!p) { this.axes = [0, 0, 0, 0]; return new Set(); }
    const dz = v => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
    this.axes = [dz(p.axes[0] || 0), dz(p.axes[1] || 0), dz(p.axes[2] || 0), dz(p.axes[3] || 0)];
    const down = new Set(), now = p.buttons.map(b => b.pressed || b.value > 0.4);
    now.forEach((v, i) => { if (v && !this.prev[i]) down.add(i); });
    this.held = now; this.prev = now;
    this.lt = p.buttons[6]?.value || 0; this.rt = p.buttons[7]?.value || 0;
    if (down.size || this.axes.some(a => Math.abs(a) > 0.3)) this.setDevice('pad');
    return down;
  }
  isHeld(btn) { return !!this.held?.[btn]; }

  rumble(strong = 0.5, weak = 0.3, ms = 120) {
    if (!settings.vibration || !this.pad?.vibrationActuator) return;
    this.pad.vibrationActuator.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => {});
  }
}
export const PAD_ACTION = PAD_OF;
