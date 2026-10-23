// High-Precision 2D Billiards Physics Engine
// Pure ES module: continuous collision detection, elastic ball-ball collisions,
// cushion restitution & friction, spin transfer, and pocket suction.

export const TABLE_W = 900;
export const TABLE_H = 450;
export const BALL_RADIUS = 14;
export const POCKET_RADIUS = 34;
export const POCKET_DROP_RADIUS = 20;

// 6 Pocket definitions with mouth positions and corner orientations
export const POCKETS = [
  { id: 'tl', x: 26, y: 26, type: 'corner', nx: 0.707, ny: 0.707 },
  { id: 'tm', x: TABLE_W / 2, y: 16, type: 'side', nx: 0, ny: 1 },
  { id: 'tr', x: TABLE_W - 26, y: 26, type: 'corner', nx: -0.707, ny: 0.707 },
  { id: 'bl', x: 26, y: TABLE_H - 26, type: 'corner', nx: 0.707, ny: -0.707 },
  { id: 'bm', x: TABLE_W / 2, y: TABLE_H - 16, type: 'side', nx: 0, ny: -1 },
  { id: 'br', x: TABLE_W - 26, y: TABLE_H - 26, type: 'corner', nx: -0.707, ny: -0.707 }
];

// Cushion segments with chamfered pocket mouths
export const CUSHIONS = [
  // Top-Left Cushion
  { id: 'tl', x1: 52, y1: 0, x2: TABLE_W / 2 - 30, y2: 0, nx: 0, ny: 1 },
  // Top-Right Cushion
  { id: 'tr', x1: TABLE_W / 2 + 30, y1: 0, x2: TABLE_W - 52, y2: 0, nx: 0, ny: 1 },
  // Bottom-Left Cushion
  { id: 'bl', x1: 52, y1: TABLE_H, x2: TABLE_W / 2 - 30, y2: TABLE_H, nx: 0, ny: -1 },
  // Bottom-Right Cushion
  { id: 'br', x1: TABLE_W / 2 + 30, y1: TABLE_H, x2: TABLE_W - 52, y2: TABLE_H, nx: 0, ny: -1 },
  // Left Cushion
  { id: 'l', x1: 0, y1: 52, x2: 0, y2: TABLE_H - 52, nx: 1, ny: 0 },
  // Right Cushion
  { id: 'r', x1: TABLE_W, y1: 52, x2: TABLE_W, y2: TABLE_H - 52, nx: -1, ny: 0 }
];

// Pocket chamfer lips (jaw angles)
export const JAW_CUSHIONS = [
  // Top-left jaws
  { x1: 0, y1: 52, x2: -12, y2: 38, nx: 0.707, ny: -0.707 },
  { x1: 52, y1: 0, x2: 38, y2: -12, nx: -0.707, ny: 0.707 },
  // Top-middle jaws
  { x1: TABLE_W / 2 - 30, y1: 0, x2: TABLE_W / 2 - 20, y2: -12, nx: -0.8, ny: 0.6 },
  { x1: TABLE_W / 2 + 30, y1: 0, x2: TABLE_W / 2 + 20, y2: -12, nx: 0.8, ny: 0.6 },
  // Top-right jaws
  { x1: TABLE_W - 52, y1: 0, x2: TABLE_W - 38, y2: -12, nx: 0.707, ny: 0.707 },
  { x1: TABLE_W, y1: 52, x2: TABLE_W + 12, y2: 38, nx: -0.707, ny: -0.707 },
  // Bottom-left jaws
  { x1: 0, y1: TABLE_H - 52, x2: -12, y2: TABLE_H - 38, nx: 0.707, ny: 0.707 },
  { x1: 52, y1: TABLE_H, x2: 38, y2: TABLE_H + 12, nx: -0.707, ny: -0.707 },
  // Bottom-middle jaws
  { x1: TABLE_W / 2 - 30, y1: TABLE_H, x2: TABLE_W / 2 - 20, y2: TABLE_H + 12, nx: -0.8, ny: -0.6 },
  { x1: TABLE_W / 2 + 30, y1: TABLE_H, x2: TABLE_W / 2 + 20, y2: TABLE_H + 12, nx: 0.8, ny: -0.6 },
  // Bottom-right jaws
  { x1: TABLE_W - 52, y1: TABLE_H, x2: TABLE_W - 38, y2: TABLE_H + 12, nx: 0.707, ny: -0.707 },
  { x1: TABLE_W, y1: TABLE_H - 52, x2: TABLE_W + 12, y2: TABLE_H - 38, nx: -0.707, ny: 0.707 }
];

export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return { dist: Math.hypot(px - cx, py - cy), cx, cy, t };
}

export class Ball {
  constructor(num, x, y) {
    this.num = num; // 0 = Cue ball, 1-7 = Solids, 8 = Eight-ball, 9-15 = Stripes
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = BALL_RADIUS;

    // Spin / English parameters
    this.spinX = 0; // side english: -1 (left) .. +1 (right)
    this.spinY = 0; // follow/draw: -1 (backspin) .. +1 (topspin)
    this.spinDecay = 0.985;

    // State
    this.potted = false;
    this.inPocketAnim = false;
    this.scale = 1.0;
    this.opacity = 1.0;
    this.pocketTarget = null;
  }

  isCue() { return this.num === 0; }
  isEight() { return this.num === 8; }
  isSolid() { return this.num >= 1 && this.num <= 7; }
  isStripe() { return this.num >= 9 && this.num <= 15; }

  getSpeed() {
    return Math.hypot(this.vx, this.vy);
  }

  stop() {
    this.vx = 0;
    this.vy = 0;
    this.spinX = 0;
    this.spinY = 0;
  }
}

export class PoolPhysics {
  constructor() {
    this.balls = [];
    this.restitution = 0.94; // Ball-to-ball elasticity
    this.cushionRestitution = 0.82; // Cushion bounce elasticity
    this.cushionFriction = 0.08; // Cushion tangent grip
    this.rollingFriction = 68.0; // px/s^2 deceleration
    this.stopThreshold = 2.5; // px/s cutoff speed

    this.allCushions = [...CUSHIONS, ...JAW_CUSHIONS];

    // Collision events for audio
    this.onBallHit = null; // (speed, ballA, ballB) => {}
    this.onCushionHit = null; // (speed, ball) => {}
    this.onPocketed = null; // (ball, pocket) => {}
  }

  setBalls(balls) {
    this.balls = balls;
  }

  allStopped() {
    for (const b of this.balls) {
      if (!b.potted && (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01 || b.inPocketAnim)) {
        return false;
      }
    }
    return true;
  }

  strikeCueBall(cueBall, angle, power, spinX = 0, spinY = 0) {
    if (!cueBall || cueBall.potted) return;
    const speed = power * 1350; // max speed ~1350 px/s
    cueBall.vx = Math.cos(angle) * speed;
    cueBall.vy = Math.sin(angle) * speed;
    cueBall.spinX = spinX;
    cueBall.spinY = spinY;
  }

  step(dt) {
    // Sub-stepping for stable, continuous collision detection at high speed
    const subSteps = 8;
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this._subStep(subDt);
    }
  }

  _subStep(dt) {
    const activeBalls = this.balls.filter(b => !b.potted);

    // 1. Move balls and apply rolling deceleration & spin dynamics
    for (const b of activeBalls) {
      if (b.inPocketAnim) {
        this._updatePocketAnim(b, dt);
        continue;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Friction deceleration
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        const decel = this.rollingFriction * dt;
        const newSpeed = Math.max(0, speed - decel);
        if (newSpeed <= this.stopThreshold) {
          b.stop();
        } else {
          b.vx = (b.vx / speed) * newSpeed;
          b.vy = (b.vy / speed) * newSpeed;
        }
      }

      // Spin decay
      b.spinX *= Math.pow(b.spinDecay, dt * 60);
      b.spinY *= Math.pow(b.spinDecay, dt * 60);

      // Check pocket capture
      this._checkPockets(b);
    }

    // 2. Ball-to-cushion collisions
    for (const b of activeBalls) {
      if (b.potted || b.inPocketAnim) continue;
      this._checkCushions(b);
    }

    // 3. Ball-to-ball collisions (CCD with elastic momentum transfer)
    for (let i = 0; i < activeBalls.length; i++) {
      for (let j = i + 1; j < activeBalls.length; j++) {
        const b1 = activeBalls[i];
        const b2 = activeBalls[j];
        if (b1.potted || b2.potted || b1.inPocketAnim || b2.inPocketAnim) continue;
        this._checkBallCollision(b1, b2);
      }
    }
  }

  _checkCushions(b) {
    // 1. Check line-segment collisions against all cushions & pocket jaws
    for (const seg of this.allCushions) {
      const { dist, cx, cy } = distToSegment(b.x, b.y, seg.x1, seg.y1, seg.x2, seg.y2);
      if (dist < b.r) {
        let nx = b.x - cx;
        let ny = b.y - cy;
        let nLen = Math.hypot(nx, ny);
        if (nLen < 0.0001) {
          nx = seg.nx || 0;
          ny = seg.ny || 1;
          nLen = 1;
        } else {
          nx /= nLen;
          ny /= nLen;
        }

        // Relative velocity along normal
        const vDotN = b.vx * nx + b.vy * ny;
        if (vDotN < 0) {
          // Push ball outside cushion surface
          const overlap = b.r - dist;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const impactSpeed = Math.abs(vDotN);

          // Normal reflection with cushion restitution
          b.vx -= (1 + this.cushionRestitution) * vDotN * nx;
          b.vy -= (1 + this.cushionRestitution) * vDotN * ny;

          // Tangential friction
          const tx = -ny;
          const ty = nx;
          const vDotT = b.vx * tx + b.vy * ty;
          b.vx -= vDotT * this.cushionFriction * tx;
          b.vy -= vDotT * this.cushionFriction * ty;

          // Side spin kick on cushion impact
          if (Math.abs(b.spinX) > 0.05) {
            const spinKick = b.spinX * 70;
            b.vx += tx * spinKick;
            b.vy += ty * spinKick;
            b.spinX *= 0.55;
          }

          if (this.onCushionHit && impactSpeed > 18) {
            this.onCushionHit(impactSpeed, b);
          }
        }
      }
    }

    // 2. Hard table boundary failsafe: balls can NEVER pass through wooden outer frame
    if (!b.potted && !b.inPocketAnim) {
      let inPocketMouth = false;
      for (const p of POCKETS) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_RADIUS + 4) {
          inPocketMouth = true;
          break;
        }
      }

      if (!inPocketMouth) {
        if (b.x < b.r) {
          b.x = b.r;
          if (b.vx < 0) {
            b.vx = -b.vx * this.cushionRestitution;
            if (this.onCushionHit) this.onCushionHit(Math.abs(b.vx), b);
          }
        } else if (b.x > TABLE_W - b.r) {
          b.x = TABLE_W - b.r;
          if (b.vx > 0) {
            b.vx = -b.vx * this.cushionRestitution;
            if (this.onCushionHit) this.onCushionHit(Math.abs(b.vx), b);
          }
        }

        if (b.y < b.r) {
          b.y = b.r;
          if (b.vy < 0) {
            b.vy = -b.vy * this.cushionRestitution;
            if (this.onCushionHit) this.onCushionHit(Math.abs(b.vy), b);
          }
        } else if (b.y > TABLE_H - b.r) {
          b.y = TABLE_H - b.r;
          if (b.vy > 0) {
            b.vy = -b.vy * this.cushionRestitution;
            if (this.onCushionHit) this.onCushionHit(Math.abs(b.vy), b);
          }
        }
      } else {
        // Near pocket mouth: if ball wanders behind the wooden pocket casing, drop it into the pocket
        if (b.x < b.r * 0.4 || b.x > TABLE_W - b.r * 0.4 || b.y < b.r * 0.4 || b.y > TABLE_H - b.r * 0.4) {
          let closestP = POCKETS[0], minD = 9999;
          for (const p of POCKETS) {
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d < minD) { minD = d; closestP = p; }
          }
          if (minD < POCKET_RADIUS * 1.6) {
            b.inPocketAnim = true;
            b.pocketTarget = closestP;
            b.vx *= 0.1;
            b.vy *= 0.1;
            if (this.onPocketed) this.onPocketed(b, closestP);
          } else {
            b.x = Math.max(b.r, Math.min(TABLE_W - b.r, b.x));
            b.y = Math.max(b.r, Math.min(TABLE_H - b.r, b.y));
            b.vx = -b.vx * 0.5;
            b.vy = -b.vy * 0.5;
          }
        }
      }
    }
  }

  _checkBallCollision(b1, b2) {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const distSq = dx * dx + dy * dy;
    const minDist = b1.r + b2.r;

    if (distSq < minDist * minDist && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;

      // Separate overlapping balls
      const overlap = (minDist - dist) * 0.5;
      b1.x -= nx * overlap;
      b1.y -= ny * overlap;
      b2.x += nx * overlap;
      b2.y += ny * overlap;

      // Normal and tangent relative velocity
      const kx = b1.vx - b2.vx;
      const ky = b1.vy - b2.vy;
      const p = 2 * (nx * kx + ny * ky) / 2; // Equal masses (m1 = m2 = 1)

      if (p > 0) {
        const impactSpeed = Math.abs(p);

        // Elastic impulse along normal
        const impulse = p * this.restitution;
        b1.vx -= impulse * nx;
        b1.vy -= impulse * ny;
        b2.vx += impulse * nx;
        b2.vy += impulse * ny;

        // Apply cue ball follow/draw spin after collision
        if (b1.isCue() && Math.abs(b1.spinY) > 0.05) {
          const spinImpulse = b1.spinY * 260;
          b1.vx += nx * spinImpulse;
          b1.vy += ny * spinImpulse;
          b1.spinY *= 0.25;
        }

        if (this.onBallHit && impactSpeed > 15) {
          this.onBallHit(impactSpeed, b1, b2);
        }
      }
    }
  }

  _checkPockets(b) {
    for (const p of POCKETS) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < POCKET_RADIUS) {
        // Gravitational suction toward pocket center
        const suction = (1 - d / POCKET_RADIUS) * 220;
        const angle = Math.atan2(p.y - b.y, p.x - b.x);
        b.vx += Math.cos(angle) * suction * 0.016;
        b.vy += Math.sin(angle) * suction * 0.016;

        if (d < POCKET_DROP_RADIUS) {
          b.inPocketAnim = true;
          b.pocketTarget = p;
          b.vx *= 0.2;
          b.vy *= 0.2;
          if (this.onPocketed) {
            this.onPocketed(b, p);
          }
          break;
        }
      }
    }
  }

  _updatePocketAnim(b, dt) {
    if (!b.pocketTarget) return;
    // Shrink and slide directly into the pocket hole
    b.x += (b.pocketTarget.x - b.x) * 8 * dt;
    b.y += (b.pocketTarget.y - b.y) * 8 * dt;
    b.scale = Math.max(0.1, b.scale - 3.2 * dt);
    b.opacity = Math.max(0, b.opacity - 3.0 * dt);

    if (b.scale <= 0.15 || b.opacity <= 0.05) {
      b.potted = true;
      b.inPocketAnim = false;
      b.stop();
    }
  }

  // Raycast to find first ball or cushion hit for aim line & ghost ball
  raycastAim(startX, startY, angle, excludeBall = null) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let minT = 1800; // max ray distance
    let hitBall = null;
    let hitCushion = null;

    // Check all object balls
    for (const b of this.balls) {
      if (b === excludeBall || b.potted) continue;
      const ocX = b.x - startX;
      const ocY = b.y - startY;
      const proj = ocX * dirX + ocY * dirY;
      if (proj <= 0) continue;

      const perpSq = (ocX * ocX + ocY * ocY) - proj * proj;
      const minDist = BALL_RADIUS * 2;
      if (perpSq < minDist * minDist) {
        const d = Math.sqrt(minDist * minDist - perpSq);
        const t = proj - d;
        if (t > 0 && t < minT) {
          minT = t;
          hitBall = b;
          hitCushion = null;
        }
      }
    }

    // Check table cushions if no ball was hit closer
    const testPoints = [
      { t: (BALL_RADIUS - startY) / dirY, nx: 0, ny: 1 }, // top
      { t: (TABLE_H - BALL_RADIUS - startY) / dirY, nx: 0, ny: -1 }, // bottom
      { t: (BALL_RADIUS - startX) / dirX, nx: 1, ny: 0 }, // left
      { t: (TABLE_W - BALL_RADIUS - startX) / dirX, nx: -1, ny: 0 } // right
    ];

    for (const tp of testPoints) {
      if (tp.t > 0 && tp.t < minT) {
        const hitX = startX + dirX * tp.t;
        const hitY = startY + dirY * tp.t;
        if (hitX >= 0 && hitX <= TABLE_W && hitY >= 0 && hitY <= TABLE_H) {
          minT = tp.t;
          hitBall = null;
          hitCushion = { nx: tp.nx, ny: tp.ny };
        }
      }
    }

    const ghostX = startX + dirX * minT;
    const ghostY = startY + dirY * minT;

    let targetDir = null;
    let cueDeflectDir = null;

    if (hitBall) {
      // Normal from ghost ball to hit ball center
      const nx = (hitBall.x - ghostX) / (BALL_RADIUS * 2);
      const ny = (hitBall.y - ghostY) / (BALL_RADIUS * 2);
      targetDir = { x: nx, y: ny };

      // Cue ball deflection along tangent
      const tx = -ny;
      const ty = nx;
      const dotT = dirX * tx + dirY * ty;
      cueDeflectDir = { x: tx * dotT, y: ty * dotT };
    } else if (hitCushion) {
      // Cue ball bank shot bounce off cushion
      const dotN = dirX * hitCushion.nx + dirY * hitCushion.ny;
      cueDeflectDir = {
        x: dirX - 2 * dotN * hitCushion.nx,
        y: dirY - 2 * dotN * hitCushion.ny
      };
    }

    return {
      t: minT,
      ghostX,
      ghostY,
      hitBall,
      hitCushion,
      targetDir,
      cueDeflectDir
    };
  }
}
