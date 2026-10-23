// Procedural Web Audio Engine for Top-Down Billiards
// Zero asset files: ball clacks, cushion thuds, cue strikes, pocket drops, fouls, and fanfare.

export class PoolAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.muted = false;
  }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this._getCtx();
  }

  _getCtx() {
    if (!this.unlocked) return null;
    if (!this.ctx) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.value = m ? 0 : 0.55;
    }
  }

  // Wooden cue stick striking the cue ball
  cueStrike(power = 0.5) {
    const c = this._getCtx();
    if (!c || this.muted) return;
    const t = c.currentTime;

    // Fast filtered noise burst
    const dur = 0.045;
    const n = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    }

    const src = c.createBufferSource();
    src.buffer = b;

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600 + power * 800;
    filter.Q.value = 3.5;

    const gain = c.createGain();
    const vol = 0.15 + power * 0.45;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);

    // Deep wood body thud
    const osc = c.createOscillator();
    const oscG = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.06);
    oscG.gain.setValueAtTime(vol * 0.5, t);
    oscG.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(oscG);
    oscG.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // Phenolic resin billiard balls colliding (Crisp high-Q clack)
  ballClack(relSpeed = 100) {
    const c = this._getCtx();
    if (!c || this.muted) return;
    const t = c.currentTime;

    const normSpeed = Math.min(1.0, Math.max(0.1, relSpeed / 600));
    const dur = 0.035;

    // Dual resonant frequencies characteristic of solid phenolic balls
    const f1 = 2800 + Math.random() * 300;
    const f2 = 4200 + Math.random() * 400;

    [f1, f2].forEach((freq, idx) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur);

      const vol = normSpeed * (idx === 0 ? 0.35 : 0.2);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    });

    // Tiny noise click
    const n = Math.floor(c.sampleRate * 0.012);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = b;
    const g = c.createGain();
    g.gain.setValueAtTime(normSpeed * 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    s.connect(g);
    g.connect(this.master);
    s.start(t);
  }

  // Rubber cushion thud
  cushionBounce(speed = 100) {
    const c = this._getCtx();
    if (!c || this.muted) return;
    const t = c.currentTime;
    const normSpeed = Math.min(1.0, Math.max(0.1, speed / 500));
    const dur = 0.06;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + dur);

    gain.gain.setValueAtTime(normSpeed * 0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  // Ball dropping into leather/netting pocket
  pocketDrop() {
    const c = this._getCtx();
    if (!c || this.muted) return;
    const t = c.currentTime;

    // Leather rattle thud
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  // Foul buzzer
  foul() {
    const c = this._getCtx();
    if (!c || this.muted) return;
    const t = c.currentTime;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.setValueAtTime(120, t + 0.12);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Victory Fanfare
  victory() {
    const c = this._getCtx();
    if (!c || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const t = c.currentTime + i * 0.09;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }
}
