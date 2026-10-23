// AI Billiards Opponent
// Evaluates candidate target balls, tests pocket lines of sight,
// solves ghost ball cut angles, checks obstacle paths, and executes shots.

import { POCKETS, BALL_RADIUS } from './physics.js';

export class PoolAI {
  constructor(game) {
    this.game = game;
    this.thinking = false;
    this.thinkTimer = null;
  }

  isMyTurn() {
    return this.game.mode === '8ball_cpu' && this.game.turn === 2 && this.game.state === 'aiming';
  }

  thinkAndShoot(onAimUpdate, onShoot) {
    if (this.thinking || !this.isMyTurn()) return;
    this.thinking = true;

    // Small delay to simulate human decision making
    this.thinkTimer = setTimeout(() => {
      this.thinking = false;
      if (!this.isMyTurn()) return;

      const shot = this.calculateBestShot();
      if (!shot) {
        // Fallback: hit nearest legal ball
        this._fallbackShot(onAimUpdate, onShoot);
        return;
      }

      // Smooth aim update
      if (onAimUpdate) {
        onAimUpdate(shot.angle, shot.power, shot.spinX, shot.spinY);
      }

      // Delay strike for visual cue animation
      setTimeout(() => {
        if (onShoot) onShoot();
      }, 450);
    }, 700);
  }

  calculateBestShot() {
    const cue = this.game.cueBall;
    if (!cue || cue.potted) return null;

    const candidateBalls = this.game.getRemainingBalls(2);
    if (candidateBalls.length === 0) {
      // Group cleared: Target 8-Ball
      const eight = this.game.balls.find(b => b.isEight() && !b.potted);
      if (eight) candidateBalls.push(eight);
    }

    if (candidateBalls.length === 0) return null;

    let bestShot = null;
    let highestScore = -Infinity;

    for (const ball of candidateBalls) {
      for (const pocket of POCKETS) {
        // 1. Check path from ball to pocket
        const ballToPocketDist = Math.hypot(pocket.x - ball.x, pocket.y - ball.y);
        const dirToPocketX = (pocket.x - ball.x) / ballToPocketDist;
        const dirToPocketY = (pocket.y - ball.y) / ballToPocketDist;

        if (this._isPathBlocked(ball.x, ball.y, pocket.x, pocket.y, [cue, ball])) {
          continue;
        }

        // 2. Calculate Ghost Ball Position
        const ghostX = ball.x - dirToPocketX * (BALL_RADIUS * 2);
        const ghostY = ball.y - dirToPocketY * (BALL_RADIUS * 2);

        // 3. Check path from Cue Ball to Ghost Ball
        const cueToGhostDist = Math.hypot(ghostX - cue.x, ghostY - cue.y);
        const dirCueX = (ghostX - cue.x) / cueToGhostDist;
        const dirCueY = (ghostY - cue.y) / cueToGhostDist;

        if (this._isPathBlocked(cue.x, cue.y, ghostX, ghostY, [cue, ball])) {
          continue;
        }

        // 4. Calculate Cut Angle (Dot product of cue direction and pocket direction)
        const dot = dirCueX * dirToPocketX + dirCueY * dirToPocketY;
        if (dot < 0.15) {
          // Cut angle > ~80 degrees is too thin, unreliable
          continue;
        }

        // Score this shot: prefer high dot (straight shot), shorter distance
        const totalDist = cueToGhostDist + ballToPocketDist;
        const score = dot * 100 - (totalDist * 0.05);

        if (score > highestScore) {
          highestScore = score;
          // Add tiny humanized aim variance (~0.008 rad)
          const aimError = (Math.random() - 0.5) * 0.016;
          const shotAngle = Math.atan2(dirCueY, dirCueX) + aimError;

          // Power scaled to distance
          const power = Math.min(0.9, Math.max(0.3, totalDist / 1200 + 0.2));

          bestShot = {
            targetBall: ball,
            pocket,
            angle: shotAngle,
            power,
            spinX: 0,
            spinY: (Math.random() - 0.5) * 0.2
          };
        }
      }
    }

    return bestShot;
  }

  _fallbackShot(onAimUpdate, onShoot) {
    const cue = this.game.cueBall;
    const candidates = this.game.getRemainingBalls(2);
    if (!cue || candidates.length === 0) return;

    // Pick closest ball
    let closest = candidates[0];
    let minDist = Infinity;
    for (const b of candidates) {
      const d = Math.hypot(b.x - cue.x, b.y - cue.y);
      if (d < minDist) {
        minDist = d;
        closest = b;
      }
    }

    const angle = Math.atan2(closest.y - cue.y, closest.x - cue.x);
    if (onAimUpdate) onAimUpdate(angle, 0.45, 0, 0);
    setTimeout(() => {
      if (onShoot) onShoot();
    }, 450);
  }

  _isPathBlocked(x1, y1, x2, y2, excludeBalls = []) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return false;

    const dirX = dx / dist;
    const dirY = dy / dist;

    for (const b of this.game.balls) {
      if (b.potted || excludeBalls.includes(b)) continue;

      const ocX = b.x - x1;
      const ocY = b.y - y1;
      const proj = ocX * dirX + ocY * dirY;

      // Only check obstacles between start and end point
      if (proj > BALL_RADIUS && proj < dist - BALL_RADIUS) {
        const perpDistSq = (ocX * ocX + ocY * ocY) - proj * proj;
        if (perpDistSq < Math.pow(BALL_RADIUS * 2 + 2, 2)) {
          return true; // Obstacle blocks path
        }
      }
    }
    return false;
  }
}
