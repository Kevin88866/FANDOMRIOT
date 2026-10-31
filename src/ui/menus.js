// 发行级菜单：启动画面 → 标题（按任意键）→ 主菜单；存档位、分页设置、暂停菜单、制作人员、结局。
import { settings, setSetting, resetSettings } from '../engine/settings.js';
import { ACTIONS, codesFor, rebind, keyName } from '../engine/input.js';
import { readSlot, writeSlot, deleteSlot, allSlots, latestSlot } from '../engine/saves.js';
import { TEAMS, LEAGUE } from '../content/data.js';

export const VERSION = '1.0.0';
const native = window.native;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString();
const won = n => (n < 0 ? '-₩' : '₩') + Math.abs(Math.round(n)).toLocaleString();
const teamName = id => TEAMS.find(t => t.id === id)?.name || id;
const dur = sec => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h} 小时 ${m} 分` : `${m} 分钟`; };
const when = t => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const SLOT_NAME = { auto: '自动存档', 1: '存档 1', 2: '存档 2', 3: '存档 3' };
const DIFF = { easy: '轻松', normal: '普通', hard: '困难' };

// 分辨率选项：桌面版取显示器尺寸，常见分辨率里不超过它的都列出来
function resolutions() {
  const scr = native?.screen?.() || { w: screen.width * devicePixelRatio, h: screen.height * devicePixelRatio };
  const list = [[3840, 2160], [2560, 1440], [2560, 1080], [1920, 1200], [1920, 1080], [1680, 1050], [1600, 900], [1440, 900], [1366, 768], [1280, 800], [1280, 720], [1024, 576]]
    .filter(([w, h]) => w <= scr.w && h <= scr.h);
  return [['auto', `原生（${scr.w}×${scr.h}）`], ...list.map(([w, h]) => [`${w}x${h}`, `${w} × ${h}`])];
}
// 全屏：按选择的分辨率换算渲染倍率；窗口：直接改窗口大小
export function applyResolution() {
  const r = settings.resolution || 'auto';
  if (r === 'auto') { setSetting({ resScale: 1 }); return; }
  const [w, h] = r.split('x').map(Number);
  if (native?.setWindowSize && settings.display === 'windowed') { native.setWindowSize(w, h); setSetting({ resScale: 1 }); }
  else setSetting({ resScale: Math.min(2, w / (innerWidth * devicePixelRatio)) * devicePixelRatio });
}

export const Menus = {
  // ================= 启动画面 =================
  splash() {
    this.g.mode = 'menu'; this.showHud(false);
    const el = document.createElement('div'); el.id = 'splash';
    el.innerHTML = `<div class="sp-in"><div class="sp-mark">K</div><div class="sp-name">Kevin88866 出品</div><div class="sp-sub">一款首尔电竞饭圈模拟游戏</div></div>`;
    document.body.appendChild(el);
    let done = false;
    const go = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 700); removeEventListener('keydown', go); removeEventListener('mousedown', go); this.skipSplash = null; this.title(); };
    this.skipSplash = go;
    addEventListener('keydown', go); addEventListener('mousedown', go);
    setTimeout(go, 2600);
  },

  // ================= 标题：按任意键开始 =================
  title() {
    this.g.mode = 'menu'; this.showHud(false); this.g.day = null; this.g.state = this.g.state || null;
    this.g.audio.music('menu');
    this.open(`<div class="press-screen">
        <div class="logo">饭圈风云<small>FANDOM RIOT · SEOUL</small></div>
        <div class="press" data-nav>${this.g.input.device === 'pad' ? '按任意键开始' : '按任意键开始'}</div>
        <div class="ver dim">v${VERSION}</div>
      </div>`, { cinematic: true, cls: 'wide' });
    this.anyKey = () => { this.anyKey = null; this.g.audio.init(); this.g.audio.click(); this.mainMenu(); };
    this.modal.querySelector('.press-screen').onclick = () => this.anyKey?.();
  },

  // ================= 主菜单 =================
  mainMenu() {
    this.anyKey = null;
    this.g.mode = 'menu'; this.showHud(false); this.g.day = null;
    this.g.audio.music('menu');
    const last = latestSlot(), sv = last?.data;
    const card = sv ? this.slotCard(last.slot, sv, false) : `<div class="save-card"><div class="dim">还没有存档</div><b>开始你的饭圈生涯吧</b></div>`;
    this.open(`<div class="title-screen">
      <div class="ts-left">
        <div class="logo left">饭圈风云<small>FANDOM RIOT · SEOUL</small></div>
        <p class="tag">首尔夜晚的电竞饭圈。LED 卡车、花圈、烟花、无人机灯光秀……<br>用镜头把这一切变成流量。</p>
        <div class="title-menu left">
          ${sv ? '<button class="btn pri" id="cont">继续游戏</button>' : ''}
          <button class="btn ${sv ? '' : 'pri'}" id="new">新游戏</button>
          <button class="btn" id="load">读取存档</button>
          <button class="btn" id="set">设置</button>
          <button class="btn" id="howto">玩法说明</button>
          <button class="btn" id="ach">成就</button>
          <button class="btn" id="cred">制作人员</button>
          <button class="btn ghost" id="quit">退出游戏</button>
        </div>
        <div class="foot dim">v${VERSION} · 战队与选手为恶搞名 · 名字可在 src/content/data.js 修改</div>
      </div>
      <div class="ts-right">${card}</div>
    </div>`, { cinematic: true, cls: 'wide', esc: () => this.title() });
    if (sv) $('cont').onclick = () => this.loadSlot(last.slot);
    $('new').onclick = () => this.newGame();
    $('load').onclick = () => this.saveSlots('load', () => this.mainMenu());
    $('set').onclick = () => this.settings(() => this.mainMenu());
    $('howto').onclick = () => this.howto(() => this.mainMenu());
    $('ach').onclick = () => this.achievements(() => this.mainMenu());
    $('cred').onclick = () => this.credits(() => this.mainMenu());
    $('quit').onclick = () => this.confirm('确定要退出游戏吗？', () => this.quitGame(), () => this.mainMenu());
  },

  quitGame() { if (native?.quit) native.quit(); else { window.close(); this.toast('浏览器版请直接关闭标签页'); this.mainMenu(); } },

  // ================= 存档 =================
  meta() {
    const s = this.s;
    return { season: s.season, week: s.week, fans: s.fans, money: s.money, handle: s.handle, fav: s.fav, playTime: s.playTime || 0, savedAt: Date.now(), difficulty: s.difficulty || 'normal', thumb: this.g.lastThumb || s.thumb || null };
  },
  // 自动存档（每周开始、周结算后）；关掉自动存档后只存在内存里
  save(force = false) {
    if (!this.s) return;
    if (this.g.lastThumb) this.s.thumb = this.g.lastThumb;
    if (settings.autosave || force) writeSlot('auto', this.s, this.meta());
  },
  saveSoon() { clearTimeout(this.st); this.st = setTimeout(() => this.save(), 500); },
  saveTo(slot) {
    const ok = writeSlot(slot, this.s, this.meta());
    this.toast(ok ? `💾 已保存到「${SLOT_NAME[slot]}」` : '保存失败：磁盘空间不足或没有写入权限', ok ? 'good' : 'bad');
    return ok;
  },
  loadSlot(slot) {
    const d = readSlot(slot);
    if (!d) return this.toast('这个存档读不出来了', 'bad');
    const s = d.state;
    s.flags ||= {}; s.club ??= 30; s.storySeen ||= []; s.missions ||= []; s.missionsDone ??= 0; s.handle ||= '@饭圈观察员'; s.inventory ||= []; s.difficulty ||= 'normal'; s.playTime ||= 0;
    s.look ||= 'michelle'; s.stance ||= {}; s.goals ||= { fans: 20000 };
    this.g.state = s; this.g.lastThumb = s.thumb || null; this.g.setPlayerLook(s.look);
    this.close(false);
    this.g.fadeTo?.(() => this.matchDay(true)) ?? this.matchDay(true);
  },
  slotCard(slot, d, actions = true) {
    const m = d?.meta || {};
    if (!d) return `<div class="slot empty" data-slot="${slot}" data-nav><div class="slot-h">${SLOT_NAME[slot]}</div><div class="slot-empty">空</div></div>`;
    return `<div class="slot ${actions ? '' : 'big'}" data-slot="${slot}" ${actions ? 'data-nav' : ''}>
      <div class="slot-thumb" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}">${m.thumb ? '' : '<span>📷</span>'}</div>
      <div class="slot-body"><div class="slot-h">${SLOT_NAME[slot]} <span class="dim">${when(m.savedAt)}</span></div>
        <b>${esc(m.handle || '@饭圈观察员')}</b>
        <div class="kv2"><span>进度</span><b>S${m.season} · 第 ${m.week} 周</b><span>粉丝</span><b>${num(m.fans || 0)}</b><span>资金</span><b>${won(m.money || 0)}</b><span>主队</span><b>${esc(teamName(m.fav))}</b><span>时长</span><b>${dur(m.playTime)}</b><span>难度</span><b>${DIFF[m.difficulty] || '普通'}</b></div>
      </div></div>`;
  },
  // mode: load | save
  saveSlots(mode, back) {
    const list = allSlots().filter(x => mode === 'load' || x.slot !== 'auto');
    this.open(`<h2>${mode === 'load' ? '读取存档' : '保存游戏'}</h2><div class="sub">${mode === 'load' ? '选择一个存档继续。自动存档会在每周开始和周结算后更新。' : '选择一个存档位。已有存档会被覆盖。'}</div>
      <div class="slot-grid">${list.map(({ slot, data }) => this.slotCard(slot, data)).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="b">返回</button>${mode === 'load' ? '<span class="dim" style="font-size:12px;align-self:center">选中存档后按 Delete / 手柄 X 删除</span>' : ''}</div>`, { cinematic: this.g.mode === 'menu', esc: back });
    $('b').onclick = back;
    this.modal.querySelectorAll('.slot').forEach(el => {
      const slot = el.dataset.slot, has = !!readSlot(slot);
      el.onclick = () => {
        this.g.audio.click();
        if (mode === 'load') { if (has) this.loadSlot(slot); return; }
        const doSave = () => { this.saveTo(slot); this.saveSlots('save', back); };
        if (has) this.confirm(`覆盖「${SLOT_NAME[slot]}」？`, doSave, () => this.saveSlots('save', back)); else doSave();
      };
    });
    this.slotDelete = el => {
      const slot = el?.dataset?.slot; if (!slot || !readSlot(slot)) return;
      this.confirm(`删除「${SLOT_NAME[slot]}」？删除后无法恢复。`, () => { deleteSlot(slot); this.saveSlots(mode, back); }, () => this.saveSlots(mode, back));
    };
  },

  // ================= 设置 =================
  settings(back, tab = 'video') {
    const S = settings, desktop = !!native;
    const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button class="${S[k] === v ? 'on' : ''}" data-v='${JSON.stringify(v)}'>${l}</button>`).join('')}</div>`;
    const onoff = k => seg(k, [[true, '开'], [false, '关']]);
    const slider = (k, min, max, step, fmt) => `<div class="slw"><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"><span class="val" data-for="${k}">${fmt(S[k])}</span></div>`;
    const row = (label, ctl, hint = '') => `<div class="srow"><div class="sl-label">${label}${hint ? `<small>${hint}</small>` : ''}</div><div class="sl-ctl">${ctl}</div></div>`;
    const pct = v => Math.round(v * 100) + '%';
    const FMT = { brightness: pct, shadowDist: pct, viewDist: pct, crowd: pct, traffic: pct, vignette: pct, renderScale: pct, fov: v => Math.round(v) + '°', shake: pct, master: pct, music: pct, sfx: pct, ambience: pct, uiVol: pct, mouseSens: v => (+v).toFixed(2) + '×', padSens: v => (+v).toFixed(2) + '×', uiScale: pct };
    let body = '';
    const res = resolutions();
    if (tab === 'video') body = [
      desktop ? row('显示模式', seg('display', [['fullscreen', '全屏'], ['windowed', '窗口']]), 'F11 也可以切换') : '',
      row('分辨率', `<select class="txt sel" data-sk="resolution">${res.map(([v, l]) => `<option value="${v}" ${S.resolution === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`, S.display === 'fullscreen' || !desktop ? '全屏时按这个分辨率渲染再放大' : '窗口大小'),
      row('帧率上限', seg('fpsCap', [[0, '垂直同步'], [30, '30'], [60, '60'], [90, '90'], [120, '120'], [144, '144'], [165, '165'], [240, '240'], [-1, '不限']])),
      row('亮度', slider('brightness', 0.6, 1.5, 0.05, pct)),
      row('视野', slider('fov', 50, 100, 1, FMT.fov)),
      row('速度感视野', onoff('dynFov'), '开快车时视野略微变宽'),
      row('镜头晃动', slider('shake', 0, 1, 0.05, pct)),
      row('显示帧率', onoff('showFps')),
    ].join('');
    else if (tab === 'gfx') body = [
      row('画质预设', seg('preset', [['low', '低'], ['mid', '中'], ['high', '高'], ['ultra', '极高']]) + (S.preset === 'custom' ? '<span class="dim" style="margin-left:8px">自定义</span>' : '')),
      row('渲染倍率', slider('renderScale', 0.5, 2, 0.05, pct), '低于 100% 更流畅，高于 100% 更清晰'),
      row('阴影质量', seg('shadows', [['off', '关'], ['low', '低'], ['mid', '中'], ['high', '高'], ['ultra', '极高']])),
      row('阴影距离', slider('shadowDist', 0.5, 2, 0.1, pct)),
      row('视距', slider('viewDist', 0.5, 1.6, 0.05, pct), '远处的雾和路人显示距离'),
      row('环境光遮蔽', onoff('ao'), '缝隙和角落的柔和阴影，比较吃显卡'),
      row('辉光', onoff('bloom'), '霓虹灯、LED 屏的光晕'),
      row('抗锯齿', onoff('aa')),
      row('纹理过滤', seg('aniso', [[1, '关'], [4, '4×'], [8, '8×'], [16, '16×']])),
      row('路人密度', slider('crowd', 0.25, 1, 0.05, pct)),
      row('车流密度', slider('traffic', 0.25, 1, 0.05, pct)),
      row('胶片颗粒', onoff('grain')),
      row('暗角', slider('vignette', 0, 1, 0.05, pct)),
    ].join('');
    else if (tab === 'hud') body = [
      row('界面缩放', slider('uiScale', 0.8, 1.3, 0.05, pct)),
      row('小地图', onoff('hudMap')), row('目标面板', onoff('hudGoals')), row('底部按键提示', onoff('hudKeys')),
      row('手机通知', onoff('hudPush')), row('资金 / 粉丝栏', onoff('hudStats')),
    ].join('');
    else if (tab === 'audio') body = [
      row('主音量', slider('master', 0, 1, 0.05, pct)), row('音乐', slider('music', 0, 1, 0.05, pct)), row('音效', slider('sfx', 0, 1, 0.05, pct)),
      row('环境音', slider('ambience', 0, 1, 0.05, pct), '城市车流、引擎'), row('界面音', slider('uiVol', 0, 1, 0.05, pct), '按钮、通知'),
    ].join('');
    else if (tab === 'controls') body = [
      row('鼠标灵敏度', slider('mouseSens', 0.3, 2.5, 0.05, FMT.mouseSens)), row('反转 Y 轴', onoff('invertY')),
      row('手柄灵敏度', slider('padSens', 0.3, 2.5, 0.05, FMT.padSens)), row('手柄震动', onoff('vibration')),
      `<h3>键位（点击后按下新按键，Esc 取消）</h3><div class="keys-grid">${ACTIONS.map(([id, name, , , pad]) => `<div class="krow"><span>${name}</span><button class="btn kb" data-act="${id}">${keyName(codesFor(id)[0])}</button><span class="padk">${pad}</span></div>`).join('')}</div>`,
      `<div class="row" style="margin-top:8px"><button class="btn" id="kreset">恢复默认键位</button></div>`,
      `<div class="dim" style="font-size:12px;margin-top:10px">手柄：左摇杆 移动 · 右摇杆 视角 · RT 奔跑/油门/快门 · LT 刹车/倒车 · A 互动/确认 · B 返回/退出拍照 · X 上下车 · Y 拍照 · LB/RB 摆放旋转、拍照变焦 · ☰ 菜单</div>`,
    ].join('');
    else if (tab === 'game') body = [
      this.s ? row('难度（当前存档）', `<div class="seg" data-k="__diff">${Object.entries(DIFF).map(([v, l]) => `<button class="${(this.s.difficulty || 'normal') === v ? 'on' : ''}" data-v='"${v}"'>${l}</button>`).join('')}</div>`, '轻松：收入 +30%、争议度增长 -30%；困难：收入 -20%、争议度 +25%') : '',
      row('新手引导', onoff('tutorial'), '第一周按步骤提示'),
      row('自动存档', onoff('autosave'), '每周开始和周结算后自动保存'),
    ].join('');
    const tabs = [['video', '显示'], ['gfx', '图形'], ['audio', '音频'], ['controls', '操作'], ['hud', '界面'], ['game', '游戏']];
    this.open(`<h2>设置</h2>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}" data-nav>${l}</button>`).join('')}<span class="dim tab-hint">${this.g.input.device === 'pad' ? 'LB / RB 切换' : 'Q / E 切换'}</span></div>
      <div class="sbody">${body}</div>
      <div class="row" style="margin-top:16px"><button class="btn pri" id="b">返回</button><button class="btn ghost" id="rs">恢复本页默认</button></div>`, { cinematic: this.g.mode === 'menu', esc: back });
    this.settingsTab = { back, tab, list: tabs.map(t => t[0]) };
    $('b').onclick = () => { this.settingsTab = null; back(); };
    $('rs').onclick = () => { resetSettings(tab); this.settings(back, tab); };
    this.modal.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => this.settings(back, el.dataset.tab));
    this.modal.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(bt => bt.onclick = () => {
      const k = sg.dataset.k, v = JSON.parse(bt.dataset.v);
      this.g.audio.click();
      if (k === '__diff') { this.s.difficulty = v; this.save(); }
      else { setSetting({ [k]: v }); if (k === 'display') { native?.setDisplay?.(v); setTimeout(applyResolution, 300); } }
      if (k === 'preset' || ['renderScale', 'shadows', 'ao', 'bloom', 'aa'].includes(k)) return this.settings(back, tab);
      sg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === bt));
    }));
    this.modal.querySelectorAll('input[type=range]').forEach(el => {
      el.oninput = () => { const k = el.dataset.k, v = +el.value; this.modal.querySelector(`[data-for="${k}"]`).textContent = FMT[k](v); setSetting({ [k]: v }); };
      el.onchange = () => { if (el.dataset.k === 'renderScale') this.settings(back, tab); };
    });
    this.modal.querySelectorAll('select[data-sk]').forEach(el => el.onchange = () => {
      setSetting({ [el.dataset.sk]: el.value });
      if (el.dataset.sk === 'resolution') applyResolution();
    });
    this.modal.querySelectorAll('[data-act]').forEach(bt => bt.onclick = () => {
      bt.textContent = '按下新按键…'; bt.classList.add('wait');
      const cap = e => {
        e.preventDefault(); e.stopPropagation();
        removeEventListener('keydown', cap, true);
        if (e.code !== 'Escape') rebind(bt.dataset.act, e.code);
        setTimeout(() => this.settings(back, tab), 0);
      };
      addEventListener('keydown', cap, true);
    });
    $('kreset') && ($('kreset').onclick = () => { setSetting({ keys: {} }); this.settings(back, tab); });
  },
  cycleSettingsTab(d) {
    const t = this.settingsTab; if (!t) return false;
    const i = (t.list.indexOf(t.tab) + d + t.list.length) % t.list.length;
    this.settings(t.back, t.list[i]);
    return true;
  },

  // ================= 暂停 =================
  // back：从比赛日等界面打开时，"继续"回到那个界面；行动日里直接关掉回到游戏
  pause(back = null) {
    const inDay = !!this.g.day && !back, resume = back || (() => this.close()), again = () => this.pause(back);
    this.open(`<h2>暂停</h2><div class="sub">S${this.s.season} · 第 ${this.s.week} 周 · 游戏时长 ${dur(this.s.playTime)}</div>
      <div class="pause-menu">
      <button class="btn pri" id="r">继续</button><button class="btn" id="sv">保存游戏</button><button class="btn" id="ld">读取存档</button>
      <button class="btn" id="st">设置</button><button class="btn" id="h">玩法说明</button>
      ${inDay ? '<button class="btn" id="home">直接回家（结束今天）</button>' : ''}
      <button class="btn ghost" id="menu">保存并回到主菜单</button><button class="btn ghost" id="q">退出游戏</button></div>`, { cinematic: !inDay, esc: resume });
    $('r').onclick = resume;
    $('sv').onclick = () => this.saveSlots('save', again);
    $('ld').onclick = () => this.saveSlots('load', again);
    $('st').onclick = () => this.settings(again);
    $('h').onclick = () => this.howto(again);
    if (inDay) $('home').onclick = () => { this.close(); this.g.endDay(); };
    $('menu').onclick = () => { this.save(true); this.g.leaveToMenu(); };
    $('q').onclick = () => this.confirm('退出前会自动保存。确定退出游戏？', () => { this.save(true); this.quitGame(); }, again);
  },

  // ================= 制作人员 =================
  credits(back, ending = false) {
    const lines = [
      ['饭圈风云 · FANDOM RIOT', `v${VERSION}`],
      ['出品 / 策划', 'Kevin88866'],
      ['开发（程序、玩法、关卡）', 'Kevin88866 × Claude'],
      ['3D 建模', 'Blender（Python 脚本建模）'],
      ['音乐与音效', 'WebAudio 程序化合成'],
      ['引擎', 'three.js（MIT）· Electron（MIT）'],
      ['人物模型与动画', 'Mixamo 角色（three.js 官方示例，MIT）'],
      ['天空与环境光', 'Poly Haven（CC0）· @pmndrs/assets（CC0）'],
      ['特别感谢', '每一个在总部门口站过岗的粉丝'],
      ['声明', '战队、选手均为恶搞名，与现实中的任何人和组织无关。本作仅供个人娱乐。'],
    ];
    this.open(`<div class="credits ${ending ? 'ending-roll' : ''}"><div class="roll">${lines.map(([a, b]) => `<div class="cr"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}<div class="cr end">谢谢游玩</div></div></div>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn pri" id="b">${ending ? '进入无尽模式 →' : '返回'}</button></div>`, { cinematic: true, esc: back });
    $('b').onclick = back;
  },

  // ================= 结局（第 3 赛季结束） =================
  ending(next) {
    const s = this.s, champ = s.champion === s.fav, big = s.fans >= 100000, wild = (s.lawsuits || 0) >= 1 || (s.heat || 0) > 60;
    const kind = champ && big ? 'legend' : wild ? 'storm' : big ? 'star' : 'loyal';
    const T = {
      legend: ['传奇大粉', `${teamName(s.fav)} 举起了奖杯。镜头扫过观众席，你的 LED 卡车标语被直播导播切进了画面。那一晚，热搜前三都和你有关。`],
      storm: ['争议之王', '三个赛季，你被骂过、被封过、收过律师函，也被无数人转发过。有人说你毁了饭圈，也有人说没有你，这个联赛会无聊很多。'],
      star: ['顶流博主', '你的账号已经是联赛周边最有影响力的声音之一。选手们私下会刷你的帖子，俱乐部的公关也记住了你的名字。'],
      loyal: ['不变的粉丝', '热度来了又走，选手换了一茬又一茬。你还是会在比赛日的晚上，开着那辆小车，去总部门口看一眼。'],
    }[kind];
    this.achieve?.('ending');
    this.open(`<div class="ending"><div class="e-k">第 3 赛季 · 结局</div><h1>${T[0]}</h1><p>${T[1]}</p>
      <div class="kv"><span>最终粉丝</span><b>${num(s.fans)}</b><span>累计曝光</span><b>${num(s.totalViews || 0)}</b><span>爆款</span><b>${s.viralCount || 0} 次</b><span>律师函</span><b>${s.lawsuits || 0} 封</b><span>游戏时长</span><b>${dur(s.playTime)}</b></div>
      <div class="row" style="justify-content:center;margin-top:18px"><button class="btn pri" id="go">制作人员 →</button></div></div>`, { cinematic: true, cls: 'wide' });
    this.g.audio.music('result');
    $('go').onclick = () => this.credits(() => next(), true);
  },
};
