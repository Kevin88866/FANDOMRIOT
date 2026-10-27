// 全部用 WebAudio 合成，无需音频文件
export class Audio {
  constructor() { this.ctx = null; this.vol = +(localStorage.getItem('fr_vol') ?? 0.7); }
  init() {
    if (this.ctx) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = this.vol; this.master.connect(C.destination);
    // 混响
    this.verb = C.createConvolver(); const len = C.sampleRate * 2.2, b = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    this.verb.buffer = b; const vg = C.createGain(); vg.gain.value = 0.25; this.verb.connect(vg); vg.connect(this.master);
    this.noiseBuf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }
  setVol(v) { this.vol = v; localStorage.setItem('fr_vol', v); if (this.master) this.master.gain.value = v; }

  noise(dur, { f = 1000, q = 1, type = 'lowpass', gain = 0.5, attack = 0.005, verb = true, f2 = null } = {}) {
    const C = this.ctx; if (!C) return; const t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); if (verb) g.connect(this.verb);
    s.start(t); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, { type = 'sine', gain = 0.2, slide = null, delay = 0 } = {}) {
    const C = this.ctx; if (!C) return; const t = C.currentTime + delay;
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  boom(s = 1) { this.noise(2.5, { f: 900, f2: 60, gain: 1.2 * s, q: 0.7 }); this.tone(70, 1.4, { type: 'sine', gain: 0.9 * s, slide: 30 }); this.noise(0.3, { f: 4000, type: 'highpass', gain: 0.4 * s }); }
  pop() { this.noise(0.9, { f: 2500, f2: 300, gain: 0.5 }); this.noise(1.6, { f: 6000, type: 'highpass', gain: 0.12, attack: 0.15 }); }
  shutter() { this.noise(0.05, { f: 3000, type: 'bandpass', q: 2, gain: 0.5, verb: false }); setTimeout(() => this.noise(0.06, { f: 2000, type: 'bandpass', q: 2, gain: 0.4, verb: false }), 70); }
  click() { this.tone(900, 0.06, { type: 'triangle', gain: 0.12 }); }
  coin() { this.tone(988, 0.08, { type: 'square', gain: 0.07 }); this.tone(1318, 0.25, { type: 'square', gain: 0.07, delay: 0.08 }); }
  bad() { this.tone(220, 0.3, { type: 'sawtooth', gain: 0.08, slide: 110 }); }
  notify() { this.tone(1046, 0.12, { gain: 0.15 }); this.tone(1568, 0.2, { gain: 0.12, delay: 0.1 }); }
  whoosh() { this.noise(1.2, { f: 300, f2: 3000, type: 'bandpass', q: 3, gain: 0.5 }); }
  splat() { this.noise(0.25, { f: 600, gain: 0.6, verb: false }); }
  viral() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.15, delay: i * 0.09 })); }

  // 城市环境音：远处车流 + 低频嗡鸣
  startAmbience() {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = C.createGain(); g.gain.value = 0.06; s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.amb = g;
    // 引擎声（开车时调节）
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
    const ef = C.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 300;
    const eg = C.createGain(); eg.gain.value = 0; o.connect(ef); ef.connect(eg); eg.connect(this.master); o.start();
    this.engine = { o, g: eg };
    // 警笛
    const so = C.createOscillator(); so.type = 'triangle'; const sg = C.createGain(); sg.gain.value = 0; so.connect(sg); sg.connect(this.master); so.start();
    this.siren = { o: so, g: sg };
  }
  setEngine(on, speed) { if (!this.engine) return; const t = this.ctx.currentTime; this.engine.g.gain.setTargetAtTime(on ? 0.05 + Math.min(0.06, speed * 0.003) : 0, t, 0.1); this.engine.o.frequency.setTargetAtTime(35 + speed * 3.5, t, 0.1); }
  setSiren(level, time) { if (!this.siren) return; const t = this.ctx.currentTime; this.siren.g.gain.setTargetAtTime(level * 0.05, t, 0.2); this.siren.o.frequency.setTargetAtTime(Math.sin(time * 3) > 0 ? 960 : 720, t, 0.05); }
}
