// Top-Down Billiards Canvas Renderer
// Renders rich tournament felt, mahogany cushions, diamond sights,
// 3D-shaded numbered balls with drop shadows, aiming guides, and cue stick.

import { TABLE_W, TABLE_H, BALL_RADIUS, POCKET_RADIUS, POCKETS, CUSHIONS } from './physics.js';

export const BALL_COLORS = {
  1: '#f1c40f', 9: '#f1c40f',   // Yellow
  2: '#2980b9', 10: '#2980b9',  // Blue
  3: '#e74c3c', 11: '#e74c3c',  // Red
  4: '#8e44ad', 12: '#8e44ad',  // Purple
  5: '#e67e22', 13: '#e67e22',  // Orange
  6: '#27ae60', 14: '#27ae60',  // Green
  7: '#78281f', 15: '#78281f',  // Maroon
  8: '#141414',                  // 8-Ball Black
  0: '#f8f9fa'                   // Cue Ball
};

export class PoolRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Table display settings
    this.borderThick = 52; // Wooden rail thickness
    this.totalW = TABLE_W + this.borderThick * 2;
    this.totalH = TABLE_H + this.borderThick * 2;

    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;

    // Felt theme: 'classic' | 'neon' | 'purple' | 'onyx'
    this.theme = 'classic';
    this.feltColors = {
      classic: { bed: '#137547', bedDark: '#0e5a36', headString: 'rgba(255,255,255,0.18)', cushion: '#0d5332' },
      neon: { bed: '#0b4f6c', bedDark: '#073b52', headString: 'rgba(84,224,238,0.25)', cushion: '#083e56' },
      purple: { bed: '#4a154b', bedDark: '#310d32', headString: 'rgba(235,160,255,0.22)', cushion: '#380f39' },
      onyx: { bed: '#1e2430', bedDark: '#131720', headString: 'rgba(255,255,255,0.18)', cushion: '#151a24' }
    };

    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const winW = this.canvas.clientWidth || window.innerWidth;
    const winH = this.canvas.clientHeight || window.innerHeight;

    this.canvas.width = winW * dpr;
    this.canvas.height = winH * dpr;

    // Maintain 2:1 table ratio with margins
    const margin = 28;
    const availW = winW - margin * 2;
    const availH = winH - margin * 2;

    const scaleX = availW / this.totalW;
    const scaleY = availH / this.totalH;
    this.scale = Math.min(scaleX, scaleY);

    this.offsetX = (winW - this.totalW * this.scale) / 2;
    this.offsetY = (winH - this.totalH * this.scale) / 2;
  }

  // Convert screen coordinates to table coordinates
  screenToTable(sx, sy) {
    const tx = (sx - this.offsetX) / this.scale - this.borderThick;
    const ty = (sy - this.offsetY) / this.scale - this.borderThick;
    return { x: tx, y: ty };
  }

  render(game) {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 1. Draw Table Frame & Rails
    this._drawTableFrame(ctx);

    // Offset to inner felt playing area
    ctx.translate(this.borderThick, this.borderThick);

    // 2. Draw Felt Bed & Markings
    this._drawFeltBed(ctx);

    // 3. Draw Pockets
    this._drawPockets(ctx);

    // 4. Draw Ball Contact Drop Shadows
    this._drawBallShadows(ctx, game.balls);

    // 5. Draw Aiming Guide & Ghost Ball
    if (game.state === 'aiming' || game.state === 'charging') {
      this._drawAimGuide(ctx, game);
    }

    // 6. Draw Billiard Balls
    this._drawBalls(ctx, game.balls);

    // 7. Draw Cue Stick
    if ((game.state === 'aiming' || game.state === 'charging') && game.cueBall && !game.cueBall.potted) {
      this._drawCueStick(ctx, game);
    }

    // 8. Ball-in-hand placement indicator
    if (game.state === 'ballInHand' && game.cueBall) {
      this._drawBallInHandRing(ctx, game);
    }

    ctx.restore();
    ctx.restore();
  }

  _drawTableFrame(ctx) {
    const tw = this.totalW;
    const th = this.totalH;
    const bt = this.borderThick;

    // Rich dark mahogany wood gradient
    const woodGrad = ctx.createLinearGradient(0, 0, tw, th);
    woodGrad.addColorStop(0, '#381e11');
    woodGrad.addColorStop(0.5, '#2b160c');
    woodGrad.addColorStop(1, '#1e0e07');

    ctx.fillStyle = woodGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, tw, th, 18);
    ctx.fill();

    // Wood edge bevel shadow & highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, tw - 2, th - 2, 17);
    ctx.stroke();

    // Brass corner castings (4 corners)
    ctx.fillStyle = '#d4af37';
    const corners = [
      [0, 0, bt, bt],
      [tw - bt, 0, bt, bt],
      [0, th - bt, bt, bt],
      [tw - bt, th - bt, bt, bt]
    ];
    corners.forEach(([cx, cy, cw, ch]) => {
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 10);
      ctx.fillStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.fill();
    });

    // Inlaid Mother-of-Pearl Diamond Sights (Rails)
    ctx.fillStyle = '#f5f6fa';
    const sightR = 3;

    // Top and Bottom Rail Sights (6 sights per rail)
    for (let i = 1; i <= 3; i++) {
      const x1 = bt + (TABLE_W / 4) * i;
      // Top rail
      ctx.beginPath();
      ctx.arc(x1, bt / 2, sightR, 0, Math.PI * 2);
      ctx.fill();
      // Bottom rail
      ctx.beginPath();
      ctx.arc(x1, th - bt / 2, sightR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Left and Right Rail Sights (3 sights per rail)
    for (let j = 1; j <= 2; j++) {
      const y1 = bt + (TABLE_H / 3) * j;
      // Left rail
      ctx.beginPath();
      ctx.arc(bt / 2, y1, sightR, 0, Math.PI * 2);
      ctx.fill();
      // Right rail
      ctx.beginPath();
      ctx.arc(tw - bt / 2, y1, sightR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawFeltBed(ctx) {
    const t = this.feltColors[this.theme];

    // Felt bed background with subtle gradient
    const feltGrad = ctx.createRadialGradient(
      TABLE_W / 2, TABLE_H / 2, 80,
      TABLE_W / 2, TABLE_H / 2, TABLE_W * 0.65
    );
    feltGrad.addColorStop(0, t.bed);
    feltGrad.addColorStop(1, t.bedDark);

    ctx.fillStyle = feltGrad;
    ctx.fillRect(0, 0, TABLE_W, TABLE_H);

    // Cushion rubber borders with bevel shading & pocket chamfers
    const cushionColor = t.cushion || (this.theme === 'classic' ? '#0d5332' : '#083e56');
    const cushionShadow = 'rgba(0, 0, 0, 0.32)';
    const cushionHighlight = 'rgba(255, 255, 255, 0.14)';

    ctx.fillStyle = cushionColor;
    for (const c of CUSHIONS) {
      if (c.ny === 1) {
        // Top cushions
        ctx.beginPath();
        ctx.moveTo(c.x1 - 12, 0);
        ctx.lineTo(c.x2 + 10, 0);
        ctx.lineTo(c.x2, 8);
        ctx.lineTo(c.x1, 8);
        ctx.closePath();
        ctx.fill();
        // Nose highlight
        ctx.fillStyle = cushionHighlight;
        ctx.fillRect(c.x1, 7, c.x2 - c.x1, 1.5);
        ctx.fillStyle = cushionColor;
      } else if (c.ny === -1) {
        // Bottom cushions
        ctx.beginPath();
        ctx.moveTo(c.x1 - 12, TABLE_H);
        ctx.lineTo(c.x2 + 10, TABLE_H);
        ctx.lineTo(c.x2, TABLE_H - 8);
        ctx.lineTo(c.x1, TABLE_H - 8);
        ctx.closePath();
        ctx.fill();
        // Nose highlight
        ctx.fillStyle = cushionHighlight;
        ctx.fillRect(c.x1, TABLE_H - 8.5, c.x2 - c.x1, 1.5);
        ctx.fillStyle = cushionColor;
      } else if (c.nx === 1) {
        // Left cushion
        ctx.beginPath();
        ctx.moveTo(0, c.y1 - 12);
        ctx.lineTo(0, c.y2 + 12);
        ctx.lineTo(8, c.y2);
        ctx.lineTo(8, c.y1);
        ctx.closePath();
        ctx.fill();
        // Nose highlight
        ctx.fillStyle = cushionHighlight;
        ctx.fillRect(7, c.y1, 1.5, c.y2 - c.y1);
        ctx.fillStyle = cushionColor;
      } else if (c.nx === -1) {
        // Right cushion
        ctx.beginPath();
        ctx.moveTo(TABLE_W, c.y1 - 12);
        ctx.lineTo(TABLE_W, c.y2 + 12);
        ctx.lineTo(TABLE_W - 8, c.y2);
        ctx.lineTo(TABLE_W - 8, c.y1);
        ctx.closePath();
        ctx.fill();
        // Nose highlight
        ctx.fillStyle = cushionHighlight;
        ctx.fillRect(TABLE_W - 8.5, c.y1, 1.5, c.y2 - c.y1);
        ctx.fillStyle = cushionColor;
      }
    }

    // Head String (Baulk Line) & Head Spot
    ctx.strokeStyle = t.headString;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(TABLE_W * 0.25, 0);
    ctx.lineTo(TABLE_W * 0.25, TABLE_H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Head spot
    ctx.fillStyle = t.headString;
    ctx.beginPath();
    ctx.arc(TABLE_W * 0.25, TABLE_H / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Foot spot (Racking apex spot)
    ctx.beginPath();
    ctx.arc(TABLE_W * 0.75, TABLE_H / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Soft ambient contact shadow under cushions
    ctx.fillStyle = cushionShadow;
    ctx.fillRect(40, 8, TABLE_W - 80, 10);
    ctx.fillRect(40, TABLE_H - 18, TABLE_W - 80, 10);
    ctx.fillRect(8, 40, 10, TABLE_H - 80);
    ctx.fillRect(TABLE_W - 18, 40, 10, TABLE_H - 80);
  }

  _drawPockets(ctx) {
    for (const p of POCKETS) {
      // Leather pocket mouth opening
      ctx.fillStyle = '#050508';
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Deep shadow inside pocket hole
      const holeGrad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, POCKET_RADIUS);
      holeGrad.addColorStop(0, '#000000');
      holeGrad.addColorStop(0.7, '#07070b');
      holeGrad.addColorStop(1, 'rgba(20, 20, 30, 0.8)');
      ctx.fillStyle = holeGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS * 0.95, 0, Math.PI * 2);
      ctx.fill();

      // Metal rim casting highlight
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawBallShadows(ctx, balls) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    for (const b of balls) {
      if (b.potted) continue;
      ctx.beginPath();
      ctx.arc(b.x + 3.5, b.y + 4.5, b.r * b.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBalls(ctx, balls) {
    for (const b of balls) {
      if (b.potted) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.scale, b.scale);
      ctx.globalAlpha = b.opacity;

      const r = b.r;
      const baseColor = BALL_COLORS[b.num];

      if (b.isCue()) {
        // Cue ball: Pearl white with subtle shading
        const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.7, '#f1f2f6');
        grad.addColorStop(1, '#ced6e0');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Red dot English indicator
        ctx.fillStyle = '#ff4757';
        ctx.beginPath();
        ctx.arc(b.spinX * r * 0.45, b.spinY * r * 0.45, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.isSolid() || b.isEight()) {
        // Solid colored ball
        const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, baseColor);
        grad.addColorStop(1, '#0c0d11');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // White circular number badge
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
        ctx.fill();

        // Number
        ctx.fillStyle = '#111111';
        ctx.font = '800 10px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.num), 0, 0.5);
      } else if (b.isStripe()) {
        // Stripe ball: White base with colored band across middle
        const whiteGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
        whiteGrad.addColorStop(0, '#ffffff');
        whiteGrad.addColorStop(0.8, '#f1f2f6');
        whiteGrad.addColorStop(1, '#747d8c');
        ctx.fillStyle = whiteGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Colored stripe band
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = baseColor;
        ctx.fillRect(-r, -r * 0.55, r * 2, r * 1.1);
        ctx.restore();

        // White circular number badge
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, 0, Math.PI * 2);
        ctx.fill();

        // Number
        ctx.fillStyle = '#111111';
        ctx.font = '800 10px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.num), 0, 0.5);
      }

      // Specular glare reflection dot (overhead lighting)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  _drawAimGuide(ctx, game) {
    const cue = game.cueBall;
    if (!cue || cue.potted) return;

    const hit = game.physics.raycastAim(cue.x, cue.y, game.aimAngle, cue);
    if (!hit) return;

    // 1. Aim Line from cue ball to ghost ball
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(hit.ghostX, hit.ghostY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Ghost Ball at impact location
    ctx.strokeStyle = 'rgba(84, 224, 238, 0.85)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(84, 224, 238, 0.12)';
    ctx.beginPath();
    ctx.arc(hit.ghostX, hit.ghostY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Target Ball Trajectory Path
    if (hit.hitBall && hit.targetDir) {
      const targetLen = 120;
      const endX = hit.hitBall.x + hit.targetDir.x * targetLen;
      const endY = hit.hitBall.y + hit.targetDir.y * targetLen;

      ctx.strokeStyle = '#5fe08a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(hit.hitBall.x, hit.hitBall.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrow head on target ball path
      const arrAngle = Math.atan2(hit.targetDir.y, hit.targetDir.x);
      ctx.fillStyle = '#5fe08a';
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 10 * Math.cos(arrAngle - 0.4), endY - 10 * Math.sin(arrAngle - 0.4));
      ctx.lineTo(endX - 10 * Math.cos(arrAngle + 0.4), endY - 10 * Math.sin(arrAngle + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    // 4. Cue Ball Deflection Line
    if (hit.cueDeflectDir) {
      const cueLen = 65;
      const cEndX = hit.ghostX + hit.cueDeflectDir.x * cueLen;
      const cEndY = hit.ghostY + hit.cueDeflectDir.y * cueLen;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(hit.ghostX, hit.ghostY);
      ctx.lineTo(cEndX, cEndY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawCueStick(ctx, game) {
    const cue = game.cueBall;
    const angle = game.aimAngle;
    const pullBack = (game.state === 'charging' ? game.power : game.pullBackPower) * 65;

    ctx.save();
    ctx.translate(cue.x, cue.y);
    ctx.rotate(angle);

    const stickLen = 320;
    const stickDist = BALL_RADIUS + 6 + pullBack;

    // Cue stick body (Maple wood grain with inlays)
    const stickGrad = ctx.createLinearGradient(-stickDist - stickLen, 0, -stickDist, 0);
    stickGrad.addColorStop(0, '#1e110b');
    stickGrad.addColorStop(0.35, '#2e1910');
    stickGrad.addColorStop(0.75, '#c79d6e');
    stickGrad.addColorStop(1, '#edd3b1');

    ctx.fillStyle = stickGrad;
    ctx.beginPath();
    ctx.moveTo(-stickDist - stickLen, -4.5);
    ctx.lineTo(-stickDist, -2.5);
    ctx.lineTo(-stickDist, 2.5);
    ctx.lineTo(-stickDist - stickLen, 4.5);
    ctx.closePath();
    ctx.fill();

    // Brass ferrule & blue chalk tip
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(-stickDist - 5, -2.5, 5, 5);

    ctx.fillStyle = '#0984e3'; // Blue chalk tip
    ctx.fillRect(-stickDist - 2, -2.5, 2, 5);

    ctx.restore();
  }

  _drawBallInHandRing(ctx, game) {
    const cue = game.cueBall;
    const isValid = game.isCueBallPlacementValid(cue.x, cue.y);

    ctx.strokeStyle = isValid ? '#35e0ff' : '#ff4757';
    ctx.fillStyle = isValid ? 'rgba(53, 224, 255, 0.15)' : 'rgba(255, 71, 87, 0.2)';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(cue.x, cue.y, BALL_RADIUS + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
