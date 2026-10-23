// Interactive Arcade Claw Machine mini-game with freeform joystick control
// Zero build, native Canvas rendering, matching the Neon Arcade Lounge aesthetic.

export const PRIZES = [
  // Common (Tickets)
  { tier: 'common', type: 'tickets', amount: 30, name: '30 Arcade Tickets', color: '#ffb84a', icon: '🎟️' },
  { tier: 'common', type: 'tickets', amount: 60, name: '60 Arcade Tickets', color: '#ffb84a', icon: '🎟️' },
  { tier: 'common', type: 'tickets', amount: 100, name: '100 Tickets Jackpot!', color: '#ffb84a', icon: '🎟️' },
  // Uncommon (Cosmetics)
  { tier: 'uncommon', type: 'cosmetic', key: 'hairColor', value: '#54e0ee', name: 'Cyan Hair Tint', color: '#54e0ee', icon: '✨' },
  { tier: 'uncommon', type: 'cosmetic', key: 'topColor', value: '#ff4d6d', name: 'Crimson Jacket Dye', color: '#ff4d6d', icon: '✨' },
  { tier: 'uncommon', type: 'cosmetic', key: 'bottomColor', value: '#2e86ab', name: 'Electric Denim', color: '#2e86ab', icon: '✨' },
  // Rare (Exclusive Furniture)
  { tier: 'rare', type: 'furniture', prop: { type: 'plant', label: 'Bonsai Tree' }, name: 'Rare Bonsai Decor', color: '#5fe08a', icon: '🪴' },
  { tier: 'rare', type: 'furniture', prop: { type: 'stool', label: 'Gold Stool', color: '#ffd166' }, name: 'VIP Gold Stool', color: '#ffd166', icon: '🪑' },
  { tier: 'rare', type: 'furniture', prop: { type: 'neon', side: 'n', text: 'TWILIGHT', color: '#8a5cff' }, name: 'TWILIGHT Neon Sign', color: '#8a5cff', icon: '⚡' },
  // Cryptic (Mystery Relics)
  { tier: 'cryptic', type: 'relic', id: 'relic_tape0', name: 'Cassette: Track 00', desc: 'An unmarked audio tape that vibrates with strange frequencies.', color: '#d946ef', icon: '📼' },
  { tier: 'cryptic', type: 'relic', id: 'relic_key', name: 'Brass Skeleton Key', desc: 'A cold brass key that seems to match no normal door in the lounge.', color: '#d946ef', icon: '🗝️' },
];

export function getRandomPrize() {
  const r = Math.random();
  let pool;
  if (r < 0.50) pool = PRIZES.filter(p => p.tier === 'common');
  else if (r < 0.75) pool = PRIZES.filter(p => p.tier === 'uncommon');
  else if (r < 0.90) pool = PRIZES.filter(p => p.tier === 'rare');
  else pool = PRIZES.filter(p => p.tier === 'cryptic');
  return pool[Math.floor(Math.random() * pool.length)];
}

export class ClawGame {
  constructor(canvas, options = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.sound = options.sound;
    this.onWin = options.onWin || (() => {});
    this.onClose = options.onClose || (() => {});
    this.onToast = options.onToast || (() => {});
    this.width = canvas.width;
    this.height = canvas.height;

    // Arena bounds
    this.bounds = {
      x0: 55, x1: this.width - 55,
      y0: 75, y1: this.height - 110,
      chuteX: 68, chuteY: this.height - 130, chuteR: 38
    };

    // Crane gantry state
    this.crane = {
      x: 140, y: 140,
      z: 0,           // 0 = up, 1 = bottom
      vx: 0, vy: 0,
      open: 0.1,      // 0 = closed, 1 = open
      speed: 160
    };

    // Joystick state
    this.joy = { dx: 0, dy: 0, active: false };

    // Game state: 'idle' | 'dropping' | 'grabbing' | 'raising' | 'returning' | 'opening' | 'reward'
    this.state = 'idle';
    this.heldCapsule = null;
    this.stateTimer = 0;

    // Generate capsules
    this.capsules = [];
    this._spawnCapsules(18);

    this.running = false;
    this._animId = null;
    this.lastTime = performance.now();
  }

  _spawnCapsules(count) {
    this.capsules = [];
    const b = this.bounds;
    for (let i = 0; i < count; i++) {
      let x, y, dist;
      // ensure capsules don't spawn inside the drop chute
      do {
        x = b.x0 + 20 + Math.random() * (b.x1 - b.x0 - 40);
        y = b.y0 + 30 + Math.random() * (b.y1 - b.y0 - 50);
        dist = Math.hypot(x - b.chuteX, y - b.chuteY);
      } while (dist < b.chuteR + 15);

      const prize = getRandomPrize();
      this.capsules.push({
        id: i,
        x, y,
        r: 16,
        prize,
        color: prize.color,
        angle: Math.random() * Math.PI * 2
      });
    }
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.render();
      this._animId = requestAnimationFrame(loop);
    };
    this._animId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._animId) cancelAnimationFrame(this._animId);
  }

  setJoystick(dx, dy) {
    if (this.state !== 'idle') return;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.joy.dx = dx;
    this.joy.dy = dy;
  }

  dropClaw() {
    if (this.state !== 'idle') return;
    this.state = 'dropping';
    this.stateTimer = 0;
    this.joy.dx = 0;
    this.joy.dy = 0;
    if (this.sound) this.sound.clawDrop();
  }

  update(dt) {
    const c = this.crane, b = this.bounds;

    if (this.state === 'idle') {
      c.x += this.joy.dx * c.speed * dt;
      c.y += this.joy.dy * c.speed * dt;
      c.x = Math.max(b.x0, Math.min(b.x1, c.x));
      c.y = Math.max(b.y0, Math.min(b.y1, c.y));
      c.open = 0.25;
    } else if (this.state === 'dropping') {
      c.z += dt * 1.1;
      c.open += (0.95 - c.open) * Math.min(1, dt * 10);
      if (c.z >= 1.0) {
        c.z = 1.0;
        this.state = 'grabbing';
        this.stateTimer = 0.45;
        if (this.sound) this.sound.clawGrab();
      }
    } else if (this.state === 'grabbing') {
      this.stateTimer -= dt;
      c.open += (0.05 - c.open) * Math.min(1, dt * 12);
      if (this.stateTimer <= 0) {
        // Test catch
        let closest = null, closestDist = 28;
        for (const cap of this.capsules) {
          const d = Math.hypot(cap.x - c.x, cap.y - c.y);
          if (d < closestDist) {
            closest = cap;
            closestDist = d;
          }
        }
        if (closest) {
          this.heldCapsule = closest;
          // remove capsule from arena floor
          this.capsules = this.capsules.filter(cap => cap !== closest);
        }
        this.state = 'raising';
      }
    } else if (this.state === 'raising') {
      c.z -= dt * 0.9;
      if (c.z <= 0) {
        c.z = 0;
        this.state = 'returning';
      }
    } else if (this.state === 'returning') {
      const tx = b.chuteX, ty = b.chuteY - 20;
      const dx = tx - c.x, dy = ty - c.y, dist = Math.hypot(dx, dy);
      if (dist < 3) {
        c.x = tx; c.y = ty;
        this.state = 'opening';
        this.stateTimer = 0.5;
        if (this.sound) this.sound.clawDrop();
      } else {
        c.x += (dx / dist) * c.speed * 0.9 * dt;
        c.y += (dy / dist) * c.speed * 0.9 * dt;
      }
    } else if (this.state === 'opening') {
      c.open += (0.9 - c.open) * Math.min(1, dt * 8);
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.heldCapsule) {
          const winPrize = this.heldCapsule.prize;
          this.heldCapsule = null;
          this.state = 'reward';
          if (this.sound) this.sound.win();
          this.onWin(winPrize);
          setTimeout(() => {
            this.state = 'idle';
            c.open = 0.25;
          }, 1800);
        } else {
          this.onToast('The claw slipped! Try again.');
          if (this.sound) this.sound.deny();
          this.state = 'idle';
          c.open = 0.25;
        }
      }
    }
  }

  render() {
    const ctx = this.ctx, W = this.width, H = this.height, b = this.bounds, c = this.crane;
    ctx.clearRect(0, 0, W, H);

    // 1. Cabinet backdrop & lighting
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#100c22');
    bgGrad.addColorStop(1, '#070512');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Rear wall mirrors & grid
    ctx.strokeStyle = 'rgba(138, 92, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let x = b.x0; x <= b.x1; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, b.y0); ctx.lineTo(x, b.y1); ctx.stroke();
    }
    for (let y = b.y0; y <= b.y1; y += 30) {
      ctx.beginPath(); ctx.moveTo(b.x0, y); ctx.lineTo(b.x1, y); ctx.stroke();
    }

    // Floor of prize pit
    ctx.fillStyle = '#181432';
    ctx.fillRect(b.x0 - 10, b.y0, (b.x1 - b.x0) + 20, (b.y1 - b.y0) + 10);

    // Prize chute (collection bin)
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.chuteX, b.chuteY, b.chuteR, 0, Math.PI * 2);
    ctx.fillStyle = '#06040d';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff4d6d';
    ctx.stroke();
    ctx.restore();

    // 2. Prize Capsules on floor
    for (const cap of this.capsules) {
      // capsule drop shadow
      ctx.beginPath();
      ctx.ellipse(cap.x + 2, cap.y + 4, cap.r, cap.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();

      // bottom half
      ctx.save();
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, cap.r, 0, Math.PI);
      ctx.fillStyle = cap.color;
      ctx.fill();

      // top half (semi-transparent clear dome)
      ctx.beginPath();
      ctx.arc(cap.x, cap.y, cap.r, Math.PI, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();

      // capsule rim
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#120f24';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cap.x - cap.r, cap.y);
      ctx.lineTo(cap.x + cap.r, cap.y);
      ctx.stroke();

      // item icon hint inside
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cap.prize.icon || '🎁', cap.x, cap.y - 4);
      ctx.restore();
    }

    // 3. Overhead Gantry Rails
    ctx.strokeStyle = '#44386b';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(b.x0 - 15, c.y); ctx.lineTo(b.x1 + 15, c.y); ctx.stroke();
    ctx.strokeStyle = '#272044';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(c.x, b.y0 - 15); ctx.lineTo(c.x, b.y1 + 15); ctx.stroke();

    // Gantry carriage trolley
    ctx.fillStyle = '#5fe08a';
    ctx.fillRect(c.x - 12, c.y - 12, 24, 24);
    ctx.strokeStyle = '#1a1530';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x - 12, c.y - 12, 24, 24);

    // 4. Claw cable and mechanism
    const clawFloorY = c.y + 10;
    const clawCeilY = c.y - 40;
    const curClawY = clawCeilY + (clawFloorY - clawCeilY) * c.z;

    // Cable line
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x, curClawY);
    ctx.stroke();

    // Claw motor base
    ctx.fillStyle = '#ffb84a';
    ctx.beginPath();
    ctx.arc(c.x, curClawY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#33254f';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3 Mechanical Claw Fingers
    const spread = 8 + c.open * 18;
    const fingerLen = 22;
    const angles = [-Math.PI / 2 - 0.7, -Math.PI / 2 + 0.7, Math.PI / 2];

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#e0e0ff';
    ctx.lineCap = 'round';

    for (let i = 0; i < 3; i++) {
      const a = (i * (Math.PI * 2 / 3)) + Math.PI / 2;
      const fx = c.x + Math.cos(a) * spread;
      const fy = curClawY + 6 + Math.sin(a) * (spread * 0.4);
      ctx.beginPath();
      ctx.moveTo(c.x, curClawY + 4);
      ctx.lineTo(fx, fy);
      ctx.lineTo(fx + Math.cos(a) * 6, fy + fingerLen * (0.8 + c.z * 0.2));
      ctx.stroke();
    }

    // If holding a capsule while raising/returning
    if (this.heldCapsule) {
      const hx = c.x, hy = curClawY + 24;
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, 15, 0, Math.PI);
      ctx.fillStyle = this.heldCapsule.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy, 15, Math.PI, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#120f24';
      ctx.stroke();
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.heldCapsule.prize.icon || '🎁', hx, hy - 4);
      ctx.restore();
    }

    // 5. Glass Reflection & Frame Highlights
    ctx.save();
    const glassGrad = ctx.createLinearGradient(0, 0, W, H);
    glassGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    glassGrad.addColorStop(0.4, 'rgba(255,255,255,0.01)');
    glassGrad.addColorStop(0.7, 'rgba(84,224,238,0.05)');
    glassGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(b.x0 - 15, b.y0 - 20, (b.x1 - b.x0) + 30, (b.y1 - b.y0) + 40);

    // Neon Frame Border
    ctx.strokeStyle = '#54e0ee';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x0 - 15, b.y0 - 20, (b.x1 - b.x0) + 30, (b.y1 - b.y0) + 40);
    ctx.restore();
  }
}
