// 全部用 WebAudio 合成，无需音频文件
import { settings, onSettings } from './settings.js';
import { SFX } from './sfx_list.js';

// 分组音量：主音量 → 音乐 / 音效 / 环境 / 界面
export class Audio {
  constructor() { this.ctx = null; this.vol = settings.master; onSettings(() => this.applyVolumes()); }
  applyVolumes() {
    this.vol = settings.master;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(settings.ambience, t, 0.05);
    this.uiBus.gain.setTargetAtTime(settings.uiVol, t, 0.05);
    if (this.mus?.T) this.mus.bus.gain.setTargetAtTime(this.musVol, t, 0.1);
  }
  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = settings.master; this.master.connect(C.destination);
    const bus = v => { const g = C.createGain(); g.gain.value = v; g.connect(this.master); return g; };
    this.sfxBus = bus(settings.sfx); this.ambBus = bus(settings.ambience); this.uiBus = bus(settings.uiVol);
    // 混响
    this.verb = C.createConvolver(); const len = C.sampleRate * 2.2, b = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb.buffer = b; const vg = C.createGain(); vg.gain.value = 0.25; this.verb.connect(vg); vg.connect(this.sfxBus);
    this.noiseBuf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.loadSamples();
    if (this.wantMusic) { const w = this.wantMusic; this.wantMusic = null; this.music(w); }
  }

  noise(dur, { f = 1000, q = 1, type = 'lowpass', gain = 0.5, attack = 0.005, verb = true, f2 = null, bus = null } = {}) {
    const C = this.ctx; if (!C) return; const t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus || this.sfxBus); if (verb) g.connect(this.verb);
    s.start(t); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, { type = 'sine', gain = 0.2, slide = null, delay = 0, bus = null } = {}) {
    const C = this.ctx; if (!C) return; const t = C.currentTime + delay;
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  // ---------- 录音样本 ----------
  loadSamples() {
    this.buf = {};
    for (const [k, files] of Object.entries(SFX)) this.buf[k] = [];
    for (const [k, files] of Object.entries(SFX)) for (const f of files) {
      fetch(f).then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a)).then(b => { this.buf[k].push(b); if (k === 'ambience' || k === 'engine' || k === 'traffic') this.startLoops(); }).catch(() => {});
    }
  }
  // 播放一个样本：返回 true 表示播出去了（没加载好时返回 false，调用方可以退回合成音）
  sample(name, vol = 1, rate = 1, bus = null) {
    const list = this.buf?.[name]; if (!this.ctx || !list?.length) return false;
    const s = this.ctx.createBufferSource(); s.buffer = list[Math.random() * list.length | 0]; s.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(bus || this.sfxBus); s.start();
    return true;
  }
  // 循环样本：城市环境声、引擎声
  startLoops() {
    const loop = (name, bus, vol) => {
      if (this.loops?.[name] || !this.buf[name]?.length) return;
      const s = this.ctx.createBufferSource(); s.buffer = this.buf[name][0]; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(bus); s.start();
      (this.loops ||= {})[name] = { s, g };
    };
    loop('ambience', this.ambBus, 0.5); loop('traffic', this.ambBus, 0.25); loop('engine', this.sfxBus, 0);
    if (this.loops?.ambience && this.amb) this.amb.gain.value = 0;   // 有录音就关掉合成的底噪
  }

  pop() { if (this.sample('fireworks', 0.6)) return; this.noise(0.9, { f: 2500, f2: 300, gain: 0.5 }); this.noise(1.6, { f: 6000, type: 'highpass', gain: 0.12, attack: 0.15 }); }
  shutter() { if (this.sample('shutter', 0.7)) return; this.noise(0.05, { f: 3000, type: 'bandpass', q: 2, gain: 0.5, verb: false }); setTimeout(() => this.noise(0.06, { f: 2000, type: 'bandpass', q: 2, gain: 0.4, verb: false }), 70); }
  click() { this.tone(900, 0.06, { type: 'triangle', gain: 0.12, bus: this.uiBus }); }
  hover() { this.tone(1400, 0.03, { type: 'sine', gain: 0.04, bus: this.uiBus }); }
  coin() { this.tone(988, 0.08, { type: 'square', gain: 0.07 }); this.tone(1318, 0.25, { type: 'square', gain: 0.07, delay: 0.08 }); }
  bad() { this.tone(220, 0.3, { type: 'sawtooth', gain: 0.08, slide: 110 }); }
  notify() { if (this.sample('notify', 0.5, 1, this.uiBus)) return; this.tone(1046, 0.12, { gain: 0.15, bus: this.uiBus }); this.tone(1568, 0.2, { gain: 0.12, delay: 0.1, bus: this.uiBus }); }
  splat() { if (this.sample('egg', 0.8)) return; this.noise(0.25, { f: 600, gain: 0.6, verb: false }); }
  whoosh() { this.noise(1.2, { f: 300, f2: 3000, type: 'bandpass', q: 3, gain: 0.5 }); }
  viral() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.15, delay: i * 0.09 })); }

  // 城市环境音：远处车流 + 低频嗡鸣
  startAmbience() {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = C.createGain(); g.gain.value = 0.06; s.connect(f); f.connect(g); g.connect(this.ambBus); s.start();
    this.amb = g;
    // 引擎声（开车时调节）
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
    const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 300;
    const eg = C.createGain(); eg.gain.value = 0; o.connect(ef); ef.connect(eg); eg.connect(this.sfxBus); o.start();
    this.engine = { o, g: eg };
  }
  setEngine(on, speed) {
    const L = this.loops?.engine;
    if (L) { const t = this.ctx.currentTime; L.g.gain.setTargetAtTime(on ? 0.25 + Math.min(0.3, speed * 0.015) : 0, t, 0.15); L.s.playbackRate.setTargetAtTime(0.7 + Math.min(1.3, speed * 0.05), t, 0.15); if (this.engine) this.engine.g.gain.setTargetAtTime(0, t, 0.1); return; }
    if (!this.engine) return; const t = this.ctx.currentTime; this.engine.g.gain.setTargetAtTime(on ? 0.05 + Math.min(0.06, speed * 0.003) : 0, t, 0.1); this.engine.o.frequency.setTargetAtTime(35 + speed * 3.5, t, 0.1); }

  // ================= 背景音乐（程序化合成，循环） =================
  // 菜单：慢速 lo-fi；行动日：夜晚城市律动；结算：明快一点。
  music(name) {
    this.wantMusic = name;
    if (!this.ctx) return;
    if (!this.mus) this.startMusicEngine();
    if (this.mus.name === name) return;
    const T = TRACKS[name]; if (!T) return;
    const now = this.ctx.currentTime;
    this.mus.bus.gain.setTargetAtTime(0, now, 0.35);
    setTimeout(() => {
      Object.assign(this.mus, { name, T, step: 0, next: this.ctx.currentTime + 0.05 });
      this.mus.bus.gain.setTargetAtTime(this.musVol, this.ctx.currentTime, 0.6);
    }, 700);
  }
  get musVol() { return 0.22 * settings.music; }

  startMusicEngine() {
    const C = this.ctx, bus = C.createGain(); bus.gain.value = 0;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    bus.connect(lp); lp.connect(this.master);
    const send = C.createGain(); send.gain.value = 0.35; bus.connect(send); send.connect(this.verb);
    this.mus = { bus, name: null, T: null, step: 0, next: 0 };
    setInterval(() => this.schedule(), 30);
  }

  schedule() {
    const m = this.mus; if (!m?.T) return;
    const C = this.ctx, T = m.T, spb = 60 / T.bpm / 4;   // 16 分音符
    while (m.next < C.currentTime + 0.15) {
      const s = m.step % 64, bar = Math.floor(s / 16), chord = T.chords[bar % T.chords.length], t = m.next;
      if (s % 16 === 0) for (const n of chord) this.pad(midi(n + 12), t, spb * 16 * 0.98, T.pad);
      const bn = T.bass[s % 16]; if (bn != null) this.bassNote(midi(chord[0] - 12 + bn), t, spb * 1.8);
      const an = T.arp[s % T.arp.length]; if (an != null) this.pluck(midi(chord[an % chord.length] + 24 + (an >= 3 ? 12 : 0)), t, T.pluck);
      if (T.kick[s % 16]) this.kick(t); if (T.snare[s % 16]) this.snare(t); if (T.hat[s % 16]) this.hat(t, T.hat[s % 16]);
      m.next += spb * (s % 2 ? 1 - T.swing : 1 + T.swing); m.step++;
    }
  }

  voice(type, freq, t, dur, gain, cutoff, attack = 0.01) {
    const C = this.ctx, o = C.createOscillator(), f = C.createBiquadFilter(), g = C.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
    o.connect(f); f.connect(g); g.connect(this.mus.bus); o.start(t); o.stop(t + dur + 0.5);
    return { o, f };
  }
  pad(f, t, dur, cut) { for (const d of [-6, 0, 7]) { const v = this.voice('sawtooth', f, t, dur, 0.018, cut, 0.6); v.o.detune.value = d; } }
  bassNote(f, t, dur) { this.voice('triangle', f, t, dur, 0.16, 600); }
  pluck(f, t, cut) { const v = this.voice('square', f, t, 0.18, 0.035, cut); v.f.frequency.exponentialRampToValueAtTime(400, t + 0.18); }
  kick(t) { const C = this.ctx, o = C.createOscillator(), g = C.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(this.mus.bus); o.start(t); o.stop(t + 0.32); }
  snare(t) { this.hitNoise(t, 0.16, 'bandpass', 1900, 0.16); this.hitNoise(t, 0.08, 'highpass', 5000, 0.06); }
  hat(t, v) { this.hitNoise(t, 0.04, 'highpass', 8000, 0.035 * v); }
  hitNoise(t, dur, type, f, gain) {
    const C = this.ctx, s = C.createBufferSource(), fl = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.mus.bus); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
}

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// 和弦用 MIDI 音高（根音在第 0 位）；bass 是相对根音的偏移；arp 是和弦内音序号
const TRACKS = {
  menu: { bpm: 78, swing: 0.12, pad: 900, pluck: 2200,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],
    bass: [0, null, null, null, null, null, 7, null, 0, null, null, null, null, null, null, null],
    arp: [0, null, 2, null, 1, null, 3, null, 2, null, null, 1, null, 0, null, null],
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 0.6, 0, 0, 0, 0.6, 0, 0, 0, 0.6, 0, 0, 0, 0.6, 0.3] },
  night: { bpm: 104, swing: 0.04, pad: 1300, pluck: 3200,
    chords: [[50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 58], [45, 48, 52, 55]],
    bass: [0, null, 0, null, null, 0, null, 7, 0, null, 0, null, 12, null, 7, null],
    arp: [0, 2, 1, 3, 2, 0, 3, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0.4, 0.3, 1, 0.3, 0.4, 0.3, 1, 0.3, 0.4, 0.3, 1, 0.3, 0.4, 0.3, 1, 0.6] },
  result: { bpm: 112, swing: 0.06, pad: 1600, pluck: 3800,
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]],
    bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, 12, null, null],
    arp: [0, 1, 2, 3, 2, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0] },
};
