// Main Controller for Top-Down Billiards
// Connects physics, renderer, audio, game rules, and GTA VI tactile controls.

import { PoolPhysics } from './physics.js';
import { PoolAudio } from './audio.js';
import { PoolRenderer, BALL_COLORS } from './renderer.js';
import { PoolGame } from './pool-game.js';
import { PoolAI } from './ai.js';

class BilliardsApp {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.physics = new PoolPhysics();
    this.audio = new PoolAudio();
    this.renderer = new PoolRenderer(this.canvas);
    this.game = new PoolGame(this.physics, this.audio);
    this.ai = new PoolAI(this.game);

    // Interaction state
    this.isPointerDown = false;
    this.pointerStart = { x: 0, y: 0 };
    this.isDraggingCueBall = false;
    this.isPullingBack = false;
    this.isChargingSpace = false;
    this.spaceChargeDir = 1;

    // Keys for continuous fine-tune aim
    this.keys = {};

    // Toast notification timer
    this.toastTimer = null;
    this.lastStatus = '';

    // Contextual prompt bar idle fade
    this.lastActionTime = performance.now();

    // Online Head-to-Head Multiplayer State (Phase 3)
    this.online = null; // { sessionId, mySeat (1|2|0=spectator), players }
    this.pendingOutcome = null;
    this.lastAimSent = 0;

    // Direct Challenge Opponent Names (?p1=You&p2=Obi)
    const qs = new URLSearchParams(location.search);
    this.customNames = qs.has('p2') ? [qs.get('p1') || 'You', qs.get('p2')] : null;
    if (this.customNames) {
      this.game.mode = '8ball_cpu';
      const bMode = document.getElementById('bQuickMode');
      if (bMode) bMode.style.display = 'none';
    }

    this._setupDOM();
    this._setupInput();
    this._setupMultiplayerBridge();

    // Start Animation Loop
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);

    window.poolApp = this;
  }

  showToast(msg, duration = 2800) {
    const toast = document.getElementById('toastNotification');
    const toastText = document.getElementById('toastText');
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  cycleFelt() {
    const themes = ['classic', 'neon', 'purple', 'onyx'];
    const idx = themes.indexOf(this.renderer.theme);
    const next = themes[(idx + 1) % themes.length];
    this.renderer.theme = next;
    const names = { classic: 'GREEN', neon: 'TEAL', purple: 'PURPLE', onyx: 'ONYX' };
    this.showToast(`FELT: ${names[next] || next.toUpperCase()}`);
    this.audio.unlock();
    if (this.audio) this.audio.cushionBounce(30);
  }

  cycleCamera() {
    const modes = ['dynamic', 'close', 'overhead'];
    const idx = modes.indexOf(this.renderer.camMode || 'dynamic');
    const next = modes[(idx + 1) % modes.length];
    this.renderer.camMode = next;
    const names = { dynamic: 'DYNAMIC BROADCAST', close: 'ACTION CLOSE-UP', overhead: 'STATIC OVERHEAD' };
    this.showToast(`CAMERA: ${names[next]}`);
    this.audio.unlock();
    const bCam = document.getElementById('bQuickCam');
    if (bCam) bCam.textContent = `🎥 ${next.toUpperCase()}`;
  }

  cycleMode() {
    if (this.online || this.customNames) return;
    const modes = ['8ball_cpu', '8ball_2p', 'practice'];
    const idx = modes.indexOf(this.game.mode);
    const next = modes[(idx + 1) % modes.length];
    this.game.mode = next;
    this.game.rackBalls();
    const names = { '8ball_cpu': 'VS CPU', '8ball_2p': '2-PLAYER', 'practice': 'SOLO PRACTICE' };
    this.showToast(`MODE: ${names[next]}`);
    this.updateHUD();
  }

  _setupDOM() {
    const $ = id => document.getElementById(id);

    // Quick Actions Bar (Top-Right)
    const bRack = $('bQuickRack');
    if (bRack) {
      bRack.onclick = () => {
        if (this.online) return;
        this.audio.unlock();
        this.game.rackBalls();
        this.updateHUD();
        this.showToast('TABLE RE-RACKED');
      };
      if (bRack.parentElement && !$('bQuickCam')) {
        const bCam = document.createElement('button');
        bCam.id = 'bQuickCam';
        bCam.className = bRack.className || 'quickBtn';
        bCam.textContent = '🎥 DYNAMIC';
        bCam.title = 'Cycle Camera Angle (V)';
        bCam.onclick = () => this.cycleCamera();
        bRack.parentElement.insertBefore(bCam, bRack);
      }
    }

    const bFelt = $('bQuickFelt');
    if (bFelt) bFelt.onclick = () => this.cycleFelt();

    const bMode = $('bQuickMode');
    if (bMode) bMode.onclick = () => this.cycleMode();

    const matchBadge = $('matchModeBadge');
    if (matchBadge) matchBadge.onclick = () => this.cycleMode();

    // English / Spin Selector Disc (bottom left)
    const spinWidget = $('spinWidget');
    const spinDisc = $('spinDisc');
    const spinPip = $('spinPip');
    if (spinDisc && spinPip) {
      const updateSpin = (e) => {
        const rect = spinDisc.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxR = rect.width / 2 - 5;

        let dx = clientX - centerX;
        let dy = clientY - centerY;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR) {
          dx = (dx / dist) * maxR;
          dy = (dy / dist) * maxR;
        }

        const normX = dx / maxR;
        const normY = dy / maxR;
        this.game.spinX = normX;
        this.game.spinY = -normY; // Up = topspin, Down = backspin

        spinPip.style.transform = `translate(${dx}px, ${dy}px)`;
      };

      spinDisc.addEventListener('mousedown', (e) => {
        updateSpin(e);
        const onMove = ev => updateSpin(ev);
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      spinDisc.addEventListener('touchstart', (e) => {
        updateSpin(e);
        const onTouchMove = ev => updateSpin(ev);
        const onTouchEnd = () => {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove);
        window.addEventListener('touchend', onTouchEnd);
      }, { passive: true });

      // Double click spin widget to reset to center
      if (spinWidget) {
        spinWidget.ondblclick = () => {
          this.game.spinX = 0;
          this.game.spinY = 0;
          spinPip.style.transform = 'translate(0px, 0px)';
        };
      }
    }

    // Modal Play Again
    const bPlayAgain = $('bPlayAgain');
    if (bPlayAgain) {
      bPlayAgain.onclick = () => {
        $('gameOverModal')?.classList.add('hidden');
        this.game.rackBalls();
        this.updateHUD();
      };
    }
  }

  _setupInput() {
    const canvas = this.canvas;
    const powerMeter = document.getElementById('verticalPowerMeter');
    const powerFillGauge = document.getElementById('powerFillGauge');
    const powerPercent = document.getElementById('powerPercent');

    const updatePowerMeterUI = (power) => {
      if (powerMeter) powerMeter.classList.remove('hidden');
      if (powerFillGauge) powerFillGauge.style.height = `${Math.round(power * 100)}%`;
      if (powerPercent) powerPercent.textContent = `${Math.round(power * 100)}%`;
    };

    const hidePowerMeterUI = () => {
      if (powerMeter) powerMeter.classList.add('hidden');
    };

    const onPointerStart = (clientX, clientY) => {
      if (this.online && this.game.turn !== this.online.mySeat) return;
      this.lastActionTime = performance.now();
      const promptBar = document.getElementById('gtaPromptBar');
      if (promptBar) promptBar.classList.remove('faded');

      this.audio.unlock();
      this.isPointerDown = true;
      this.pointerStart = { x: clientX, y: clientY };

      const rect = canvas.getBoundingClientRect();
      const pt = this.renderer.screenToTable(clientX - rect.left, clientY - rect.top);

      // Check if clicking cue ball in Ball-in-Hand state
      if (this.game.state === 'ballInHand' && this.game.cueBall) {
        const d = Math.hypot(pt.x - this.game.cueBall.x, pt.y - this.game.cueBall.y);
        if (d < 36) {
          this.isDraggingCueBall = true;
          return;
        }
      }

      // Check if clicking behind cue ball to pull back cue stick
      if (this.game.state === 'aiming' && this.game.cueBall && !this.game.cueBall.potted) {
        const cue = this.game.cueBall;
        const angleToCue = Math.atan2(pt.y - cue.y, pt.x - cue.x);
        const angleDiff = Math.abs((angleToCue - this.game.aimAngle + Math.PI * 3) % (Math.PI * 2) - Math.PI);

        // Clicked behind the cue stick to pull back
        if (angleDiff > Math.PI * 0.6) {
          this.isPullingBack = true;
          return;
        }

        // Otherwise update aim angle towards clicked point
        this.game.aimAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
      }
    };

    const onPointerMove = (clientX, clientY) => {
      if (this.online && this.game.turn !== this.online.mySeat) return;
      this.lastActionTime = performance.now();
      const promptBar = document.getElementById('gtaPromptBar');
      if (promptBar) promptBar.classList.remove('faded');

      const rect = canvas.getBoundingClientRect();
      const pt = this.renderer.screenToTable(clientX - rect.left, clientY - rect.top);

      // 1. Dragging Cue Ball in Ball-in-Hand state
      if (this.isDraggingCueBall && this.game.cueBall) {
        this.game.cueBall.x = Math.max(20, Math.min(880, pt.x));
        this.game.cueBall.y = Math.max(20, Math.min(430, pt.y));
        return;
      }

      // 2. Pulling back cue stick to charge shot power
      if (this.isPullingBack && this.game.cueBall) {
        const cue = this.game.cueBall;
        const dist = Math.hypot(pt.x - cue.x, pt.y - cue.y);
        const power = Math.max(0.06, Math.min(1.0, (dist - 15) / 150));
        this.game.power = power;
        this.game.pullBackPower = power;
        updatePowerMeterUI(power);
        return;
      }

      // 3. Pointer move updates aim angle when aiming
      if (this.game.state === 'aiming' && this.game.cueBall && !this.game.cueBall.potted && !this.isChargingSpace) {
        const cue = this.game.cueBall;
        this.game.aimAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
        this._sendAimUpdate();
      }
    };

    const onPointerEnd = () => {
      if (this.online && this.game.turn !== this.online.mySeat) {
        this.isDraggingCueBall = false;
        this.isPullingBack = false;
        this.isPointerDown = false;
        return;
      }
      if (this.isDraggingCueBall) {
        this.isDraggingCueBall = false;
        if (this.game.isCueBallPlacementValid(this.game.cueBall.x, this.game.cueBall.y)) {
          this.game.state = 'aiming';
          this.showToast('CUE BALL PLACED • AIM & STRIKE');
          this.updateHUD();
          if (this.online) {
            this._postMpAction({
              t: 'match.placeCue',
              sessionId: this.online.sessionId,
              x: this.game.cueBall.x,
              y: this.game.cueBall.y
            });
          }
        }
      }

      if (this.isPullingBack) {
        this.isPullingBack = false;
        hidePowerMeterUI();
        if (this.game.power > 0.08) {
          this._executeShot();
        }
      }

      this.isPointerDown = false;
    };

    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) onPointerStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', e => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => onPointerEnd());

    // Touch Support
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length > 0) onPointerStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (e.touches.length > 0) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', () => onPointerEnd());

    // Mouse Wheel Micro Fine-Tune Aim
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.lastActionTime = performance.now();
      if (this.game.state === 'aiming' && !this.isPullingBack) {
        this.game.aimAngle += e.deltaY * 0.0007;
      }
    }, { passive: false });

    // Keyboard Controls
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      this.lastActionTime = performance.now();
      const promptBar = document.getElementById('gtaPromptBar');
      if (promptBar) promptBar.classList.remove('faded');

      if (k === 'r') {
        this.game.rackBalls();
        this.updateHUD();
        this.showToast('TABLE RE-RACKED');
        return;
      }

      if (k === 'f') {
        this.cycleFelt();
        return;
      }

      if (k === 'm') {
        this.cycleMode();
        return;
      }

      if (k === 'v') {
        this.cycleCamera();
        return;
      }

      if (k === 'c') {
        // Reset spin
        this.game.spinX = 0;
        this.game.spinY = 0;
        const spinPip = document.getElementById('spinPip');
        if (spinPip) spinPip.style.transform = 'translate(0px, 0px)';
        this.showToast('SPIN CENTERED');
        return;
      }

      if (e.key === 'Escape') {
        const modal = document.getElementById('gameOverModal');
        if (modal && !modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
        }
        return;
      }

      // HOLD SPACE TO CHARGE SHOT POWER
      if (e.code === 'Space' && !e.repeat && this.game.state === 'aiming' && !this.isChargingSpace) {
        if (this.online && this.game.turn !== this.online.mySeat) return;
        e.preventDefault();
        this.isChargingSpace = true;
        this.game.power = 0.1;
        this.spaceChargeDir = 1;
        this.audio.unlock();
        updatePowerMeterUI(this.game.power);
      }

      this.keys[k] = true;
    });

    window.addEventListener('keyup', e => {
      const k = e.key.toLowerCase();
      this.keys[k] = false;

      // RELEASE SPACE TO STRIKE
      if (e.code === 'Space' && this.isChargingSpace) {
        e.preventDefault();
        this.isChargingSpace = false;
        hidePowerMeterUI();
        if (this.game.power > 0.08) {
          this._executeShot();
        }
      }
    });

    window.addEventListener('resize', () => {
      this.renderer.resize();
    });
  }

  _loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Continuous fine-tune aim with Arrow keys or A / D
    if (this.game.state === 'aiming' && !this.isPullingBack) {
      if (this.keys['a'] || this.keys['arrowleft']) {
        this.game.aimAngle -= 0.015;
      }
      if (this.keys['d'] || this.keys['arrowright']) {
        this.game.aimAngle += 0.015;
      }
    }

    // HOLD SPACE TO CHARGE SHOT (smooth oscillation between 0.1 and 1.0)
    if (this.isChargingSpace) {
      const chargeRate = 1.35 * dt;
      this.game.power += chargeRate * this.spaceChargeDir;
      if (this.game.power >= 1.0) {
        this.game.power = 1.0;
        this.spaceChargeDir = -1;
      } else if (this.game.power <= 0.08) {
        this.game.power = 0.08;
        this.spaceChargeDir = 1;
      }
      this.game.pullBackPower = this.game.power;

      const powerFillGauge = document.getElementById('powerFillGauge');
      const powerPercent = document.getElementById('powerPercent');
      const powerMeter = document.getElementById('verticalPowerMeter');
      if (powerMeter) powerMeter.classList.remove('hidden');
      if (powerFillGauge) powerFillGauge.style.height = `${Math.round(this.game.power * 100)}%`;
      if (powerPercent) powerPercent.textContent = `${Math.round(this.game.power * 100)}%`;
    }

    // AI Turn in VS CPU mode
    if (this.game.mode === '8ball_cpu' && this.game.turn === 2 && this.game.state === 'aiming') {
      this.ai.takeTurn();
    }

    // Step physics & game rules
    this.game.update(dt);

    // If an authoritative server outcome is waiting and balls have stopped, snap to authoritative state
    if (this.online && this.pendingOutcome && this.game.state !== 'rolling') {
      this._applySnapshot(this.pendingOutcome);
      this.pendingOutcome = null;
    }

    // Render Canvas
    this.renderer.render(this.game);

    // Update Telemetry
    this.updateHUD();

    // Context prompt bar idle fade
    if (now - this.lastActionTime > 4000) {
      const promptBar = document.getElementById('gtaPromptBar');
      if (promptBar) promptBar.classList.add('faded');
    }

    requestAnimationFrame(this._loop);
  }

  updateHUD() {
    const $ = id => document.getElementById(id);

    // 1. Turn Indicator Rows (Top-Left Match Card)
    const p1Row = $('p1Row');
    const p2Row = $('p2Row');
    if (p1Row && p2Row) {
      p1Row.classList.toggle('active', this.game.turn === 1);
      p2Row.classList.toggle('active', this.game.turn === 2);
    }

    // Player 1 & Player 2 Names
    const p1Name = $('p1Name');
    const p2Name = $('p2Name');
    if (this.online && Array.isArray(this.online.players)) {
      const p1 = this.online.players.find(p => p.seat === 1);
      const p2 = this.online.players.find(p => p.seat === 2);
      if (p1Name && p1) p1Name.textContent = p1.name.toUpperCase();
      if (p2Name && p2) p2Name.textContent = p2.name.toUpperCase();
    } else if (this.customNames) {
      if (p1Name) p1Name.textContent = (this.customNames[0] || 'YOU').toUpperCase();
      if (p2Name) p2Name.textContent = (this.customNames[1] || 'OPPONENT').toUpperCase();
    } else if (p2Name) {
      p2Name.textContent = this.game.mode === '8ball_cpu' ? 'AI BOT' : this.game.mode === '8ball_2p' ? 'PLAYER 2' : 'PRACTICE';
    }

    // Mode Tag
    const modeBadge = $('matchModeBadge');
    if (modeBadge) {
      modeBadge.textContent = this.online
        ? (this.online.mySeat === 0 ? 'SPECTATING' : 'ONLINE 1V1')
        : this.customNames
          ? `VS ${this.customNames[1].toUpperCase()}`
          : (this.game.mode === '8ball_cpu' ? 'VS CPU' : this.game.mode === '8ball_2p' ? '2-PLAYER' : 'SOLO');
    }

    // 2. Group Labels & Ball Pips
    const g1 = this.game.groups[1];
    const g2 = this.game.groups[2];
    const p1GroupLabel = $('p1GroupLabel');
    const p2GroupLabel = $('p2GroupLabel');

    if (p1GroupLabel) {
      p1GroupLabel.textContent = !g1 ? 'OPEN' : g1 === 'solids' ? 'SOLIDS' : 'STRIPES';
      p1GroupLabel.className = 'pGroup ' + (g1 === 'solids' ? 'solids' : g1 === 'stripes' ? 'stripes' : '');
    }
    if (p2GroupLabel) {
      p2GroupLabel.textContent = !g2 ? 'OPEN' : g2 === 'solids' ? 'SOLIDS' : 'STRIPES';
      p2GroupLabel.className = 'pGroup ' + (g2 === 'solids' ? 'solids' : g2 === 'stripes' ? 'stripes' : '');
    }

    // Update P1 Ball Pips
    const p1Pips = document.querySelectorAll('#p1Pips .pip');
    p1Pips.forEach((pip, idx) => {
      let ballNum = 1 + idx; // Default 1-7 (Solids)
      if (g1 === 'stripes') ballNum = 9 + idx;
      pip.dataset.ball = ballNum;

      const ball = this.game.balls.find(b => b.num === ballNum);
      const isPotted = ball ? ball.potted : false;

      if (isPotted) {
        pip.classList.add('potted');
        const col = BALL_COLORS[ballNum] || '#fff';
        pip.style.backgroundColor = col;
        pip.style.color = col;
      } else {
        pip.classList.remove('potted');
        pip.style.backgroundColor = '';
        pip.style.color = '';
      }
    });

    // Update P2 Ball Pips
    const p2Pips = document.querySelectorAll('#p2Pips .pip');
    p2Pips.forEach((pip, idx) => {
      let ballNum = 9 + idx; // Default 9-15 (Stripes)
      if (g2 === 'solids') ballNum = 1 + idx;
      pip.dataset.ball = ballNum;

      const ball = this.game.balls.find(b => b.num === ballNum);
      const isPotted = ball ? ball.potted : false;

      if (isPotted) {
        pip.classList.add('potted');
        const col = BALL_COLORS[ballNum] || '#fff';
        pip.style.backgroundColor = col;
        pip.style.color = col;
      } else {
        pip.classList.remove('potted');
        pip.style.backgroundColor = '';
        pip.style.color = '';
      }
    });

    // 3. Status Notification Trigger (Toast)
    if (this.game.statusMessage && this.game.statusMessage !== this.lastStatus) {
      this.lastStatus = this.game.statusMessage;
      // Show cinematic toast if foul, scratch, or key event
      if (this.lastStatus.toLowerCase().includes('scratch') || this.lastStatus.toLowerCase().includes('foul') || this.lastStatus.toLowerCase().includes('victory') || this.lastStatus.toLowerCase().includes('break shot')) {
        this.showToast(this.lastStatus.toUpperCase());
      }
    }

    // 4. Game Over Modal
    if (this.game.state === 'gameOver') {
      const modal = $('gameOverModal');
      const title = $('gameOverTitle');
      const desc = $('gameOverDesc');
      if (modal && modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        if (title) title.textContent = this.game.winner === 1 ? 'VICTORY!' : 'GAME OVER';
        if (desc) desc.textContent = this.game.statusMessage;

        // Post message to parent lounge (only for local games; online matches are settled by the server)
        if (!this.online && window.parent && window.parent !== window) {
          // Standard lounge result contract: the game reports WHAT happened, the lounge/server decides rewards.
          // Only VS CPU is ranked; hot-seat 2-player and practice can't be farmed for rewards.
          window.parent.postMessage({
            type: 'game_result',
            game: 'pool',
            mode: this.game.mode,
            ranked: this.game.mode === '8ball_cpu',
            won: this.game.winner === 1,
            score: this.game.score
          }, '*');
        }
      }
    }
  }

  _executeShot() {
    if (this.online) {
      if (this.game.turn !== this.online.mySeat) return;
      this._postMpAction({
        t: 'match.shoot',
        sessionId: this.online.sessionId,
        aimAngle: this.game.aimAngle,
        power: this.game.power,
        spinX: this.game.spinX,
        spinY: this.game.spinY,
        cueX: this.game.cueBall?.x,
        cueY: this.game.cueBall?.y
      });
      return;
    }
    this.game.shoot();
  }

  _postMpAction(cmd) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'mp_action', cmd }, '*');
    }
  }

  _sendAimUpdate() {
    if (!this.online || this.game.turn !== this.online.mySeat) return;
    const now = performance.now();
    if (now - this.lastAimSent < 65) return;
    this.lastAimSent = now;
    this._postMpAction({
      t: 'match.aim',
      sessionId: this.online.sessionId,
      aimAngle: this.game.aimAngle,
      power: this.game.power,
      spinX: this.game.spinX,
      spinY: this.game.spinY
    });
  }

  _applySnapshot(snap) {
    if (!snap) return;
    this.game.state = snap.state;
    this.game.turn = snap.turn;
    if (snap.groups) this.game.groups = { ...snap.groups };
    this.game.winner = snap.winner;
    if (snap.statusMessage) this.game.statusMessage = snap.statusMessage;
    if (Array.isArray(snap.balls)) {
      for (const sb of snap.balls) {
        const b = this.game.balls.find(x => x.num === sb.num);
        if (b) {
          b.x = sb.x;
          b.y = sb.y;
          b.potted = !!sb.potted;
          b.inPocketAnim = false;
          b.scale = b.potted ? 0 : 1;
          b.opacity = b.potted ? 0 : 1;
          b.stop();
        }
      }
    }
    this.updateHUD();
  }

  _setupMultiplayerBridge() {
    window.addEventListener('message', ev => {
      const d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'mp_init' && d.session) {
        this.online = {
          sessionId: d.session.id,
          mySeat: d.mySeat,
          players: d.session.players || []
        };
        this.game.mode = '8ball_2p';
        this.game.rackBalls();
        if (d.session.snapshot) this._applySnapshot(d.session.snapshot);
        const myTurn = this.game.turn === this.online.mySeat;
        this.showToast(this.online.mySeat === 0 ? 'SPECTATING LIVE MATCH' : (myTurn ? 'YOUR BREAK SHOT!' : 'OPPONENT BREAKING...'));
        this.updateHUD();
      } else if (d.type === 'mp_event' && d.event && this.online && d.event.sessionId === this.online.sessionId) {
        const e = d.event;
        if (e.type === 'match.aim' && e.seat !== this.online.mySeat) {
          this.game.aimAngle = e.aimAngle;
          this.game.power = e.power;
          this.game.spinX = e.spinX;
          this.game.spinY = e.spinY;
        } else if (e.type === 'match.cuePlaced') {
          this._applySnapshot(e.snapshot);
        } else if (e.type === 'match.shot') {
          if (this.game.cueBall && e.shot.cueX != null && e.shot.cueY != null) {
            this.game.cueBall.x = e.shot.cueX;
            this.game.cueBall.y = e.shot.cueY;
          }
          this.game.state = 'aiming';
          this.game.aimAngle = e.shot.aimAngle;
          this.game.power = e.shot.power;
          this.game.spinX = e.shot.spinX;
          this.game.spinY = e.shot.spinY;
          this.pendingOutcome = e.outcome;
          this.game.shoot();
        }
      }
    });
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'mp_ready', game: 'pool' }, '*');
    }
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new BilliardsApp();
});
