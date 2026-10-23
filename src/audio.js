// Tiny procedural audio: UI blips, footsteps, a few synthwave jukebox loops. No asset files.
export class Sound {
  constructor() { this.unlocked = false; this.ctx = null; this.master = null; this.muted = false; this.track = -1; this.timer = null; this.seq = 0; }
  unlock() { this.unlocked = true; }
  _ctx() {
    if (!this.unlocked) return null;
    if (!this.ctx) { try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); this.music = this.ctx.createGain(); this.music.gain.value = 0.35; this.music.connect(this.master); } catch (e) { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  tone(f, d = 0.12, type = 'sine', v = 0.2, dest, when = 0, slide = 0) {
    const c = this._ctx(); if (!c) return; const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + d + 0.02);
  }
  click() { this.tone(660, 0.07, 'triangle', 0.15); }
  dest() { this.tone(440, 0.09, 'sine', 0.12, null, 0, 1.5); }
  coin() { this.tone(988, 0.07, 'square', 0.08); this.tone(1319, 0.2, 'square', 0.08, null, 0.07); }
  win() {
    this.tone(523, 0.09, 'triangle', 0.12, null, 0);
    this.tone(659, 0.09, 'triangle', 0.12, null, 0.08);
    this.tone(784, 0.09, 'triangle', 0.12, null, 0.16);
    this.tone(1047, 0.28, 'triangle', 0.18, null, 0.24);
  }
  clawDrop() { this.tone(300, 0.22, 'sine', 0.1, null, 0, 0.5); }
  clawGrab() { this.tone(140, 0.08, 'square', 0.12); this.tone(220, 0.1, 'triangle', 0.12, null, 0.04); }
  sit() { this.tone(180, 0.15, 'sine', 0.2, null, 0, 0.6); }
  deny() { this.tone(200, 0.15, 'sawtooth', 0.1); this.tone(150, 0.2, 'sawtooth', 0.1, null, 0.12); }
  pop() { this.tone(520, 0.1, 'sine', 0.12, null, 0, 1.8); }
  phoneOpen() { this.tone(587, 0.08, 'sine', 0.12, null, 0); this.tone(880, 0.12, 'triangle', 0.14, null, 0.06); }
  phoneClose() { this.tone(784, 0.08, 'sine', 0.1, null, 0); this.tone(523, 0.1, 'triangle', 0.1, null, 0.05); }
  warp() {
    this.tone(220, 0.45, 'sawtooth', 0.12, null, 0, 4.0);
    this.tone(440, 0.35, 'sine', 0.15, null, 0.1, 2.5);
    this.tone(880, 0.25, 'triangle', 0.18, null, 0.2, 0.5);
  }
  rocket() {
    const c = this._ctx(); if (!c) return;
    const dur = 1.8, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, Math.sin((i / n) * Math.PI));
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(180, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(1400, c.currentTime + dur * 0.7);
    g.gain.setValueAtTime(0.001, c.currentTime);
    g.gain.linearRampToValueAtTime(0.28, c.currentTime + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    s.buffer = b; s.connect(f); f.connect(g); g.connect(this.master); s.start();
    this.tone(60, dur * 0.9, 'sawtooth', 0.2, null, 0, 2.5);
  }
  thruster() {
    this.tone(140, 0.22, 'sawtooth', 0.12, null, 0, 0.4);
    this.tone(220, 0.18, 'sine', 0.08, null, 0.03, 0.6);
  }
  craterImpact() {
    this.tone(90, 0.3, 'sine', 0.25, null, 0, 0.3);
    this.tone(240, 0.12, 'triangle', 0.1, null, 0.02, 0.5);
  }
  beacon() {
    this.tone(1200, 0.06, 'sine', 0.08);
    this.tone(1600, 0.09, 'sine', 0.07, null, 0.06);
  }
  servo() {
    this.tone(320, 0.15, 'triangle', 0.06, null, 0, 1.3);
  }
  tick() {
    this.tone(920, 0.035, 'triangle', 0.06);
  }
  versus() {
    this.tone(110, 0.28, 'sawtooth', 0.16, null, 0, 0.6);
    this.tone(330, 0.12, 'triangle', 0.14, null, 0.08);
    this.tone(440, 0.12, 'triangle', 0.14, null, 0.18);
    this.tone(660, 0.32, 'sawtooth', 0.16, null, 0.28);
  }
  levelUp() {
    this.tone(523.25, 0.1, 'triangle', 0.15, null, 0);
    this.tone(659.25, 0.1, 'triangle', 0.15, null, 0.09);
    this.tone(783.99, 0.1, 'triangle', 0.16, null, 0.18);
    this.tone(1046.5, 0.14, 'triangle', 0.18, null, 0.27);
    this.tone(1318.5, 0.38, 'sine', 0.22, null, 0.38);
  }
  // spatial: gain falls with distance from the listener, pan follows the screen-space side
  blipAt(f, dist, pan) { const g = 0.05 * Math.max(0, 1 - dist / 10); if (g < 0.003) return; const c = this._ctx(); if (!c) return; const o = c.createOscillator(), e = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null, t = c.currentTime;
    o.type = 'square'; o.frequency.value = f; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); o.connect(e); e.connect(p); p.connect(this.master); } else { o.connect(e); e.connect(this.master); } o.start(t); o.stop(t + 0.09); }
  step() { const c = this._ctx(); if (!c) return; const n = Math.floor(c.sampleRate * 0.05), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 200; g.gain.value = 0.18; s.buffer = b; s.connect(f); f.connect(g); g.connect(this.master); s.start(); }
  ambience() { if (this.amb) return; const c = this._ctx(); if (!c) return; const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { l = l * 0.98 + (Math.random() * 2 - 1) * 0.02; d[i] = l * 3; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; s.loop = true; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.06; s.connect(f); f.connect(g); g.connect(this.master); s.start(); this.amb = s; }
  blip() { const f = [523, 659, 784, 880, 1047][Math.floor(Math.random() * 5)]; this.tone(f, 0.05, 'square', 0.025); }
  // jukebox: 0 = off
  play(i) {
    clearInterval(this.timer); this.track = i; if (!i && i !== 0) return; if (i < 0) return;
    const c = this._ctx(); if (!c) return; this.seq = 0;
    const T = [
      { bpm: 104, root: 45, ch: [0, 0, 5, 7], arp: [0, 7, 12, 7, 15, 12, 7, 12] },
      { bpm: 92, root: 48, ch: [0, 3, 5, 3], arp: [0, 12, 7, 12, 3, 12, 7, 15] },
      { bpm: 118, root: 43, ch: [0, 5, 3, 7], arp: [0, 0, 12, 7, 0, 12, 15, 7] },
      { bpm: 80, root: 45, ch: [0, 3, 7, 2], arp: [0, 7, 12, 15, 7, 12, 15, 19] },
    ][i % 4];
    const hz = n => 440 * Math.pow(2, (n - 69) / 12), dt = 60 / T.bpm / 2;
    this.timer = setInterval(() => {
      if (!this.ctx) return; const s = this.seq++, bar = Math.floor(s / 8) % 4, ch = T.ch[bar], n = T.root + ch + T.arp[s % 8];
      this.tone(hz(n + 12), dt * 1.6, 'sawtooth', 0.05, this.music);
      if (s % 8 === 0) { this.tone(hz(T.root + ch - 12), dt * 7, 'triangle', 0.16, this.music); this.tone(hz(T.root + ch + 3), dt * 7, 'sine', 0.05, this.music); }
      if (s % 4 === 0) this.tone(90, 0.12, 'sine', 0.35, this.music, 0, 0.4);
      if (s % 4 === 2) this.tone(6000, 0.03, 'square', 0.015, this.music);
    }, dt * 1000);
  }
  setTwilight(active) {
    const c = this._ctx(); if (!c) return;
    if (active) {
      if (this.droneOsc) return;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), flt = c.createBiquadFilter();
      o1.type = 'sawtooth'; o1.frequency.value = 55;
      o2.type = 'sine'; o2.frequency.value = 55.4;
      flt.type = 'lowpass'; flt.frequency.value = 260;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 2.0);
      o1.connect(flt); o2.connect(flt); flt.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.droneOsc = [o1, o2, g];
    } else {
      if (!this.droneOsc) return;
      const [o1, o2, g] = this.droneOsc;
      g.gain.setValueAtTime(g.gain.value, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
      setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 1400);
      this.droneOsc = null;
    }
  }
  stop() { clearInterval(this.timer); this.track = -1; }
}
export const TRACKS = ['Neon Drive', 'Last Quarter', 'Turbo Lounge', 'Midnight Shift · 444Hz'];
