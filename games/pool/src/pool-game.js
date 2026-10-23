// 8-Ball & Practice Billiards Game Rules & State Machine
// Handles 15-ball triangle rack, turns, solid/stripe group assignment,
// fouls, scratches, ball-in-hand, and win/loss resolution.

import { Ball, TABLE_W, TABLE_H, BALL_RADIUS } from './physics.js';

export class PoolGame {
  constructor(physics, audio) {
    this.physics = physics;
    this.audio = audio;

    // Game modes: '8ball_cpu' (You vs AI), '8ball_2p' (Pass & Play), 'practice' (Solo Run)
    this.mode = '8ball_cpu';

    // Game state: 'aiming' | 'charging' | 'rolling' | 'ballInHand' | 'gameOver'
    this.state = 'aiming';

    // 16 balls
    this.balls = [];
    this.cueBall = null;

    // Aiming & Power state
    this.aimAngle = 0; // Radians
    this.power = 0.5; // 0..1
    this.pullBackPower = 0; // During mouse drag pull-back
    this.spinX = 0; // -1..+1 English
    this.spinY = 0; // -1..+1 English (draw/follow)

    // Player turns & group assignments
    this.turn = 1; // 1 = Player 1, 2 = Player 2 (or CPU)
    this.groups = { 1: null, 2: null }; // 'solids' | 'stripes' | null (open table)
    this.winner = null;
    this.statusMessage = 'Break shot: Drag to aim, pull back or click SHOOT';

    // Statistics & Turn Tracking
    this.shotsCount = 0;
    this.runStreak = 0;
    this.score = 0;

    // Per-shot event trackers
    this.firstBallHit = null;
    this.pottedThisShot = [];
    this.cushionHitAfterBall = false;

    // Wire physics audio callbacks
    this.physics.onBallHit = (speed, b1, b2) => {
      if (this.audio) this.audio.ballClack(speed);
      if (!this.firstBallHit && (b1.isCue() || b2.isCue())) {
        this.firstBallHit = b1.isCue() ? b2 : b1;
      }
    };

    this.physics.onCushionHit = (speed, b) => {
      if (this.audio) this.audio.cushionBounce(speed);
      if (this.firstBallHit) {
        this.cushionHitAfterBall = true;
      }
    };

    this.physics.onPocketed = (b, p) => {
      if (this.audio) this.audio.pocketDrop();
      this.pottedThisShot.push(b);
    };

    this.rackBalls();
  }

  // Standard 15-ball triangle pyramid rack at foot spot
  rackBalls() {
    this.balls = [];
    this.pottedThisShot = [];
    this.firstBallHit = null;
    this.cushionHitAfterBall = false;
    this.winner = null;
    this.groups = { 1: null, 2: null };
    this.turn = 1;
    this.shotsCount = 0;
    this.runStreak = 0;
    this.score = 0;

    // 1. Cue Ball placed at head string (1/4 table width)
    this.cueBall = new Ball(0, TABLE_W * 0.25, TABLE_H / 2);
    this.balls.push(this.cueBall);

    // 2. 15 Object Balls racked at foot spot (3/4 table width)
    const apexX = TABLE_W * 0.72;
    const apexY = TABLE_H / 2;
    const r = BALL_RADIUS;
    const dx = r * Math.sqrt(3) + 0.4;
    const dy = r * 2 + 0.4;

    // Standard official rack order: 8 in center, solids and stripes at back corners
    const rackOrder = [
      1,                     // Row 1 (apex)
      9, 2,                  // Row 2
      3, 8, 10,              // Row 3 (8 ball in center)
      11, 4, 12, 5,          // Row 4
      6, 13, 7, 14, 15       // Row 5 (corners have 1 solid, 1 stripe)
    ];

    let ballIdx = 0;
    for (let row = 0; row < 5; row++) {
      const rx = apexX + row * dx;
      const startY = apexY - (row * dy) / 2;
      for (let col = 0; col <= row; col++) {
        const ry = startY + col * dy;
        const num = rackOrder[ballIdx++];
        this.balls.push(new Ball(num, rx, ry));
      }
    }

    this.physics.setBalls(this.balls);
    this.state = 'aiming';
    this.aimAngle = 0; // Pointing directly towards the rack
    this.statusMessage = 'Break shot: Point mouse to aim, pull back to shoot';
  }

  shoot() {
    if (this.state !== 'aiming' && this.state !== 'charging') return;
    if (!this.cueBall || this.cueBall.potted) return;

    this.state = 'rolling';
    this.shotsCount++;
    this.firstBallHit = null;
    this.pottedThisShot = [];
    this.cushionHitAfterBall = false;

    const actualPower = Math.max(0.08, this.power);
    if (this.audio) this.audio.cueStrike(actualPower);

    this.physics.strikeCueBall(this.cueBall, this.aimAngle, actualPower, this.spinX, this.spinY);
    this.pullBackPower = 0;
  }

  update(dt) {
    this.physics.step(dt);

    if (this.state === 'rolling') {
      if (this.physics.allStopped()) {
        this._resolveShot();
      }
    }
  }

  _resolveShot() {
    const cueScratched = this.pottedThisShot.some(b => b.isCue());
    const eightPotted = this.pottedThisShot.some(b => b.isEight());
    const objectBallsPotted = this.pottedThisShot.filter(b => !b.isCue() && !b.isEight());

    // 1. PRACTICE MODE RESOLUTION
    if (this.mode === 'practice') {
      if (cueScratched) {
        if (this.audio) this.audio.foul();
        this.runStreak = 0;
        this.statusMessage = 'Scratch! Place Cue Ball anywhere on the table';
        this._resetCueBallInHand();
        return;
      }
      if (eightPotted) {
        const remaining = this.balls.filter(b => !b.isCue() && !b.isEight() && !b.potted);
        if (remaining.length === 0) {
          this.winner = 1;
          this.state = 'gameOver';
          this.score += 500;
          if (this.audio) this.audio.victory();
          this.statusMessage = `🏆 TABLE CLEARED! Final Score: ${this.score}`;
        } else {
          this.state = 'gameOver';
          if (this.audio) this.audio.foul();
          this.statusMessage = 'Eight Ball pocketed prematurely! Game Over';
        }
        return;
      }
      if (objectBallsPotted.length > 0) {
        this.runStreak += objectBallsPotted.length;
        this.score += objectBallsPotted.length * 100 * this.runStreak;
        this.statusMessage = `Potted ${objectBallsPotted.length} ball(s)! Streak x${this.runStreak}`;
      } else {
        this.runStreak = 0;
        this.statusMessage = 'Aim for the next shot!';
      }
      this.state = 'aiming';
      return;
    }

    // 2. STANDARD 8-BALL RULES RESOLUTION
    const curPlayer = this.turn;
    const opponent = curPlayer === 1 ? 2 : 1;
    let foul = false;
    let foulReason = '';

    // Check Cue Ball Scratch
    if (cueScratched) {
      foul = true;
      foulReason = 'Cue Ball Scratch!';
    }

    // Check Legal First Contact
    if (!foul) {
      if (!this.firstBallHit) {
        foul = true;
        foulReason = 'Cue ball hit no balls!';
      } else {
        const curGroup = this.groups[curPlayer];
        if (curGroup) {
          const myBallsLeft = this.getRemainingBalls(curPlayer).length;
          if (myBallsLeft > 0) {
            if ((curGroup === 'solids' && !this.firstBallHit.isSolid()) ||
                (curGroup === 'stripes' && !this.firstBallHit.isStripe())) {
              foul = true;
              foulReason = `Did not hit own group (${curGroup}) first!`;
            }
          } else {
            // Must hit 8-ball first when own group is cleared
            if (!this.firstBallHit.isEight()) {
              foul = true;
              foulReason = 'Group cleared: Must hit Eight-Ball first!';
            }
          }
        }
      }
    }

    // Check 8-Ball pocketing
    if (eightPotted) {
      const myBallsLeft = this.getRemainingBalls(curPlayer).length;
      if (foul || myBallsLeft > 0) {
        // Pocketed 8-ball while fouling or with balls remaining -> LOSS
        this.winner = opponent;
        this.state = 'gameOver';
        if (this.audio) this.audio.foul();
        this.statusMessage = `Player ${opponent} WINS! Player ${curPlayer} pocketed 8-ball illegally.`;
      } else {
        // Legally pocketed 8-ball -> WIN!
        this.winner = curPlayer;
        this.state = 'gameOver';
        if (this.audio) this.audio.victory();
        this.statusMessage = `🏆 Player ${curPlayer} WINS the match!`;
      }
      return;
    }

    // Check Open Table Group Assignment
    if (!this.groups[1] && objectBallsPotted.length > 0) {
      const firstPotted = objectBallsPotted[0];
      if (firstPotted.isSolid()) {
        this.groups[curPlayer] = 'solids';
        this.groups[opponent] = 'stripes';
      } else if (firstPotted.isStripe()) {
        this.groups[curPlayer] = 'stripes';
        this.groups[opponent] = 'solids';
      }
    }

    // Resolve Turn Transition or Continuation
    if (foul) {
      if (this.audio) this.audio.foul();
      this.turn = opponent;
      this.statusMessage = `Foul: ${foulReason} Ball in Hand for Player ${opponent}`;
      this._resetCueBallInHand();
      return;
    }

    // Player continues if they pocketed their own assigned ball
    let continueTurn = false;
    const curGroup = this.groups[curPlayer];
    if (curGroup && objectBallsPotted.length > 0) {
      const pottedOwn = objectBallsPotted.some(b => (curGroup === 'solids' && b.isSolid()) || (curGroup === 'stripes' && b.isStripe()));
      if (pottedOwn) {
        continueTurn = true;
      }
    } else if (!curGroup && objectBallsPotted.length > 0) {
      continueTurn = true; // Open table potted ball continues
    }

    if (continueTurn) {
      this.statusMessage = `Player ${curPlayer} potted a ball! Continue turn.`;
      this.state = 'aiming';
    } else {
      this.turn = opponent;
      this.statusMessage = `Player ${this.turn}'s turn`;
      this.state = 'aiming';
    }
  }

  _resetCueBallInHand() {
    this.cueBall.potted = false;
    this.cueBall.inPocketAnim = false;
    this.cueBall.scale = 1.0;
    this.cueBall.opacity = 1.0;
    this.cueBall.stop();

    // Place cue ball safely behind head string
    let px = TABLE_W * 0.25;
    let py = TABLE_H / 2;
    if (!this.isCueBallPlacementValid(px, py)) {
      py += 40;
    }
    this.cueBall.x = px;
    this.cueBall.y = py;
    this.state = 'ballInHand';
  }

  isCueBallPlacementValid(x, y) {
    if (x < BALL_RADIUS + 12 || x > TABLE_W - BALL_RADIUS - 12) return false;
    if (y < BALL_RADIUS + 12 || y > TABLE_H - BALL_RADIUS - 12) return false;

    // Check no overlap with existing object balls
    for (const b of this.balls) {
      if (b.isCue() || b.potted) continue;
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < BALL_RADIUS * 2 + 2) return false;
    }
    return true;
  }

  getRemainingBalls(player) {
    const group = this.groups[player];
    if (!group) {
      return this.balls.filter(b => !b.isCue() && !b.isEight() && !b.potted);
    }
    return this.balls.filter(b => {
      if (b.potted) return false;
      return group === 'solids' ? b.isSolid() : b.isStripe();
    });
  }
}
