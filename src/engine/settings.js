// 全局设置：画面 / 音频 / 操作 / 游戏。保存在 localStorage，改动即时生效（订阅者自己应用）。
const KEY = 'fr_settings_v1';

export const PRESETS = {
  low:   { renderScale: 0.75, shadows: 'low',  ao: false, bloom: false, aa: true },
  mid:   { renderScale: 1.0,  shadows: 'mid',  ao: false, bloom: true,  aa: true },
  high:  { renderScale: 1.0,  shadows: 'high', ao: false, bloom: true,  aa: true },
  ultra: { renderScale: 1.25, shadows: 'ultra', ao: true, bloom: true,  aa: true },
};

export const DEFAULTS = {
  // 画面
  display: 'fullscreen',   // fullscreen | borderless | windowed（桌面版）
  preset: 'high', ...PRESETS.high,
  fpsCap: 0,               // 0 = 跟随显示器刷新率
  fov: 60, shake: 1, showFps: false, dynFov: true, brightness: 1, resolution: 'auto', resScale: 1,
  shadowDist: 1, viewDist: 1, aniso: 8, crowd: 0.75, traffic: 0.75, grain: true, vignette: 0.5,
  hudMap: true, hudGoals: true, hudKeys: true, hudPush: true, hudStats: true,
  // 音频（0..1）
  master: 0.8, music: 0.7, sfx: 1, ambience: 0.8, uiVol: 0.8,
  // 操作
  mouseSens: 1, invertY: false, keys: {}, padSens: 1, vibration: true,
  // 游戏
  uiScale: 1, tutorial: true, autosave: true, subtitlesBig: false,
};

const listeners = new Set();
export const settings = load();

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { s = {}; }
  // 旧版本的画质 / 音量设置迁移过来
  if (!s.preset) {
    const q = localStorage.getItem('fr_quality');
    if (q === 'mid') Object.assign(s, { preset: 'mid', ...PRESETS.mid });
    const v = localStorage.getItem('fr_vol'), mv = localStorage.getItem('fr_mvol');
    if (v !== null) s.master = +v;
    if (mv !== null) s.music = +mv;
  }
  // v1.3：高画质不再默认 1.25 倍渲染和环境光遮蔽（笔记本上太吃性能）
  if (!s.v13 && s.preset === 'high') { s.renderScale = 1.0; s.ao = false; }
  s.v13 = true;
  return { ...DEFAULTS, ...s, keys: { ...(s.keys || {}) } };
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 存不了就算了 */ }
}

// 改一项或多项；预设会带动相关的几项
export function setSetting(patch) {
  if (patch.preset && PRESETS[patch.preset]) Object.assign(settings, PRESETS[patch.preset]);
  Object.assign(settings, patch);
  // 手动改了画面细项，预设显示为"自定义"
  if (!patch.preset && ['renderScale', 'shadows', 'ao', 'bloom', 'aa'].some(k => k in patch)) {
    const match = Object.entries(PRESETS).find(([, p]) => Object.entries(p).every(([k, v]) => settings[k] === v));
    settings.preset = match ? match[0] : 'custom';
  }
  saveSettings();
  for (const fn of listeners) fn(settings, patch);
}

export function resetSettings(group) {
  const keys = {
    video: ['display', 'resolution', 'resScale', 'fpsCap', 'fov', 'dynFov', 'shake', 'showFps', 'brightness'],
    gfx: ['preset', 'renderScale', 'shadows', 'shadowDist', 'viewDist', 'ao', 'bloom', 'aa', 'aniso', 'crowd', 'traffic', 'grain', 'vignette'],
    hud: ['uiScale', 'hudMap', 'hudGoals', 'hudKeys', 'hudPush', 'hudStats'],
    audio: ['master', 'music', 'sfx', 'ambience', 'uiVol'],
    controls: ['mouseSens', 'invertY', 'keys', 'padSens', 'vibration'],
    game: ['tutorial', 'autosave', 'subtitlesBig'],
  }[group] || Object.keys(DEFAULTS);
  const patch = {};
  for (const k of keys) patch[k] = k === 'keys' ? {} : DEFAULTS[k];
  setSetting(patch);
}

export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
