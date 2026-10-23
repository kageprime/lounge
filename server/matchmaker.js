// Authoritative Head-to-Head Multiplayer Matchmaker & Game Session Engine (Phase 3)
// Runs pure PoolPhysics + PoolGame (8-ball) and Ludo rules on the server so clients cannot spoof shots, dice, or winners.
// Automatically settles linked Escrow Contests and credits progression rewards when a match concludes.

import crypto from 'node:crypto';
import { PoolPhysics } from '../games/pool/src/physics.js';
import { PoolGame } from '../games/pool/src/pool-game.js';
import { newGame as newLudoGame, rollDie as ludoRollDie, applyMove as ludoApplyMove, passTurn as ludoPassTurn } from '../games/ludo/src/rules.js';
import { applyResult, refreshQuests, dayKey } from '../src/progression.js';
import { inTx } from './db.js';

export const MATCH_COMMANDS = new Set([
  'match.queue',
  'match.leaveQueue',
  'match.challenge',
  'match.accept',
  'match.decline',
  'match.aim',
  'match.placeCue',
  'match.shoot',
  'match.roll',
  'match.move',
  'match.spectate',
  'match.leave',
  'match.list'
]);

function snapshotPool(game) {
  return {
    state: game.state,
    turn: game.turn,
    groups: { ...game.groups },
    winner: game.winner,
    statusMessage: game.statusMessage,
    shotsCount: game.shotsCount,
    balls: game.balls.map(b => ({
      num: b.num,
      x: Math.round(b.x * 100) / 100,
      y: Math.round(b.y * 100) / 100,
      potted: !!b.potted
    }))
  };
}

function snapshotLudo(st) {
  return {
    seats: [...st.seats],
    tokens: st.tokens.map(t => [...t]),
    turn: st.turn,
    die: st.die,
    sixes: st.sixes,
    phase: st.phase,
    moves: st.moves.map(m => ({ ...m, captures: m.captures.map(c => ({ ...c })) })),
    winner: st.winner,
    turns: st.turns,
    stats: st.stats.map(s => ({ ...s }))
  };
}

export function createMatchmaker(economy, opts = {}) {
  const now = opts.now || (() => Date.now());
  const rngDie = opts.rngDie || (() => crypto.randomInt(1, 7));

  // clientId -> client session object ({ id, userId, name, send(msg) })
  const clientsByUser = new Map();
  const queues = { pool: [], ludo: [] };
  const challenges = new Map(); // challengeId -> { id, game, fromClientId, toClientId, contestId, createdAt }
  const sessions = new Map();   // sessionId -> session state

  function registerClient(client) {
    if (client && client.userId) {
      clientsByUser.set(client.userId, client);
    }
  }

  function unregisterClient(client) {
    if (!client) return;
    if (client.userId && clientsByUser.get(client.userId) === client) {
      clientsByUser.delete(client.userId);
    }
    for (const g of ['pool', 'ludo']) {
      queues[g] = queues[g].filter(c => c.id !== client.id);
    }
    // Forfeit active session if player disconnects
    for (const s of sessions.values()) {
      if (s.status === 'active') {
        const idx = s.players.findIndex(p => p.client.id === client.id);
        if (idx !== -1) {
          const winnerSeat = idx === 0 ? 2 : 1;
          finishSession(s, winnerSeat, 'Opponent disconnected (forfeit)');
        }
      }
      s.spectators.delete(client);
    }
  }

  function broadcastSession(s, payload) {
    for (const p of s.players) {
      p.client.send(payload);
    }
    for (const spec of s.spectators) {
      spec.send(payload);
    }
  }

  function publicSessionInfo(s) {
    return {
      id: s.id,
      game: s.game,
      propId: s.propId || null,
      contestId: s.contestId || null,
      status: s.status,
      players: s.players.map(p => ({
        seat: p.seat,
        userId: p.userId,
        clientId: p.client.id,
        name: p.name
      })),
      spectatorCount: s.spectators.size,
      snapshot: s.game === 'pool' ? snapshotPool(s.poolGame) : snapshotLudo(s.ludoState)
    };
  }

  function startSession({ game, p1, p2, propId = null, contestId = null }) {
    registerClient(p1);
    registerClient(p2);
    const id = 'ms_' + crypto.randomBytes(8).toString('hex');
    const u1 = economy.accounts.getUser(p1.userId);
    const u2 = economy.accounts.getUser(p2.userId);

    const s = {
      id,
      game,
      propId,
      contestId,
      status: 'active',
      createdAt: now(),
      players: [
        { seat: 1, client: p1, userId: p1.userId, name: u1?.name || p1.name || 'Player 1' },
        { seat: 2, client: p2, userId: p2.userId, name: u2?.name || p2.name || 'Player 2' }
      ],
      spectators: new Set(),
      poolPhysics: null,
      poolGame: null,
      ludoState: null
    };

    if (game === 'pool') {
      s.poolPhysics = new PoolPhysics();
      s.poolGame = new PoolGame(s.poolPhysics, null);
      s.poolGame.mode = '8ball_2p';
      s.poolGame.rackBalls();
    } else if (game === 'ludo') {
      // In 2-player head-to-head Ludo, Player 1 is Red (0) and Player 2 is Yellow (2, opposite corner) or Green (1)
      s.ludoState = newLudoGame(['human', 'human', 'off', 'off'], 0);
    } else {
      throw new Error(`Unsupported multiplayer game: ${game}`);
    }

    sessions.set(id, s);
    const info = publicSessionInfo(s);
    for (const p of s.players) {
      p.client.send({
        type: 'match.start',
        session: info,
        mySeat: p.seat
      });
    }
    return s;
  }

  function finishSession(s, winnerSeat, reason = null) {
    if (s.status !== 'active') return null;
    s.status = 'finished';
    const winner = s.players.find(p => p.seat === winnerSeat) || s.players[0];
    const loser = s.players.find(p => p.seat !== winner.seat) || s.players[1];
    const today = dayKey(now());

    const ceremonies = {};
    let contestSettlement = null;

    inTx(economy.db, () => {
      const profW = economy.accounts.getProfile(winner.userId);
      const profL = economy.accounts.getProfile(loser.userId);
      const rW = profW?.rating?.[s.game] ?? 1200;
      const rL = profL?.rating?.[s.game] ?? 1200;

      // Apply winner progression + mint rewards
      if (profW) {
        const cW = applyResult(profW, { game: s.game, won: true, opponentRating: rL }, today);
        if (cW) {
          if (cW.reward.coins > 0) economy.ledger.mint(winner.userId, 'COIN', cW.reward.coins, 'pvp_reward', `pvp:${s.id}:${winner.userId}:COIN`, s.game);
          if (cW.reward.tickets > 0) economy.ledger.mint(winner.userId, 'TICKET', cW.reward.tickets, 'pvp_reward', `pvp:${s.id}:${winner.userId}:TICKET`, s.game);
          economy.accounts.saveProfile(winner.userId, { ...cW.profile, inventory: profW.inventory });
          const { profile: _p, ...rest } = cW;
          ceremonies[winner.userId] = rest;
        }
      }

      // Apply loser progression + mint consolation rewards
      if (profL) {
        const cL = applyResult(profL, { game: s.game, won: false, opponentRating: rW }, today);
        if (cL) {
          if (cL.reward.coins > 0) economy.ledger.mint(loser.userId, 'COIN', cL.reward.coins, 'pvp_reward', `pvp:${s.id}:${loser.userId}:COIN`, s.game);
          if (cL.reward.tickets > 0) economy.ledger.mint(loser.userId, 'TICKET', cL.reward.tickets, 'pvp_reward', `pvp:${s.id}:${loser.userId}:TICKET`, s.game);
          economy.accounts.saveProfile(loser.userId, { ...cL.profile, inventory: profL.inventory });
          const { profile: _p, ...rest } = cL;
          ceremonies[loser.userId] = rest;
        }
      }

      // Automatically settle linked escrow contest if present
      if (s.contestId) {
        try {
          contestSettlement = economy.contests.settleContest(s.contestId, [
            { userId: winner.userId, shareBps: 10000 }
          ]);
        } catch (_) {}
      }
    });

    // Push updated wallets & profiles to both players
    for (const p of s.players) {
      if (p.userId) {
        const wallet = economy.getWallet(p.userId);
        const profile = economy.accounts.getProfile(p.userId);
        p.client.send({ type: 'wallet', wallet });
        p.client.send({ type: 'profile', profile });
      }
    }

    const overPayload = {
      type: 'match.over',
      sessionId: s.id,
      game: s.game,
      winnerSeat: winner.seat,
      winnerUserId: winner.userId,
      winnerName: winner.name,
      loserName: loser.name,
      reason,
      ceremonies,
      contestSettlement: contestSettlement ? {
        contestId: s.contestId,
        pot: contestSettlement.pot,
        rake: contestSettlement.rake,
        payouts: contestSettlement.payouts
      } : null,
      snapshot: s.game === 'pool' ? snapshotPool(s.poolGame) : snapshotLudo(s.ludoState)
    };

    broadcastSession(s, overPayload);
    return overPayload;
  }

  function handle(client, msg) {
    if (!client || !client.userId) return { ok: false, error: 'unauthenticated' };
    registerClient(client);
    const t = msg.t;

    if (t === 'match.queue') {
      const game = msg.game === 'ludo' ? 'ludo' : 'pool';
      const q = queues[game];
      // Remove if already in queue
      const existingIdx = q.findIndex(c => c.userId === client.userId);
      if (existingIdx !== -1) q.splice(existingIdx, 1);

      // Check if an opponent is waiting
      const opponent = q.shift();
      if (opponent && opponent.userId !== client.userId) {
        const s = startSession({ game, p1: opponent, p2: client, propId: msg.propId || null });
        return { ok: true, matched: true, session: publicSessionInfo(s), mySeat: 2 };
      }

      q.push(client);
      return { ok: true, matched: false, queued: game, position: q.length };
    }

    if (t === 'match.leaveQueue') {
      for (const g of ['pool', 'ludo']) {
        queues[g] = queues[g].filter(c => c.userId !== client.userId);
      }
      return { ok: true };
    }

    if (t === 'match.challenge') {
      const game = msg.game === 'ludo' ? 'ludo' : 'pool';
      let targetClient = null;
      if (msg.toUserId && clientsByUser.has(msg.toUserId)) {
        targetClient = clientsByUser.get(msg.toUserId);
      } else if (msg.toClientId && opts.getClientById) {
        targetClient = opts.getClientById(msg.toClientId);
      }
      if (!targetClient || !targetClient.userId || targetClient.userId === client.userId) {
        return { ok: false, error: 'target_unavailable' };
      }

      const cid = 'ch_' + crypto.randomBytes(6).toString('hex');
      const uFrom = economy.accounts.getUser(client.userId);
      const ch = {
        id: cid,
        game,
        fromClient: client,
        toClient: targetClient,
        fromUserId: client.userId,
        fromName: uFrom?.name || 'Challenger',
        contestId: msg.contestId || null,
        createdAt: now()
      };
      challenges.set(cid, ch);

      targetClient.send({
        type: 'challenge.invite',
        challengeId: cid,
        game,
        fromClientId: client.id,
        fromUserId: client.userId,
        fromName: ch.fromName,
        contestId: ch.contestId
      });
      return { ok: true, challengeId: cid };
    }

    if (t === 'match.accept') {
      const ch = challenges.get(String(msg.challengeId || ''));
      if (!ch || ch.toClient.userId !== client.userId) {
        return { ok: false, error: 'challenge_not_found' };
      }
      challenges.delete(ch.id);
      const s = startSession({
        game: ch.game,
        p1: ch.fromClient,
        p2: ch.toClient,
        contestId: ch.contestId
      });
      return { ok: true, session: publicSessionInfo(s), mySeat: 2 };
    }

    if (t === 'match.decline') {
      const ch = challenges.get(String(msg.challengeId || ''));
      if (ch) {
        challenges.delete(ch.id);
        ch.fromClient.send({ type: 'challenge.declined', challengeId: ch.id });
      }
      return { ok: true };
    }

    if (t === 'match.list') {
      const active = [...sessions.values()]
        .filter(s => s.status === 'active')
        .map(s => publicSessionInfo(s));
      return { ok: true, sessions: active };
    }

    if (t === 'match.spectate') {
      const s = sessions.get(String(msg.sessionId || ''));
      if (!s || s.status !== 'active') return { ok: false, error: 'session_not_found' };
      s.spectators.add(client);
      return { ok: true, session: publicSessionInfo(s), mySeat: 0 };
    }

    if (t === 'match.leave') {
      const s = sessions.get(String(msg.sessionId || ''));
      if (!s) return { ok: true };
      s.spectators.delete(client);
      if (s.status === 'active') {
        const pIdx = s.players.findIndex(p => p.userId === client.userId);
        if (pIdx !== -1) {
          const winnerSeat = pIdx === 0 ? 2 : 1;
          finishSession(s, winnerSeat, 'Opponent left the table');
        }
      }
      return { ok: true };
    }

    // ---------- Active Session Gameplay Actions ----------
    const s = sessions.get(String(msg.sessionId || ''));
    if (!s || s.status !== 'active') return { ok: false, error: 'no_active_session' };
    const player = s.players.find(p => p.userId === client.userId);
    if (!player) return { ok: false, error: 'not_in_session' };

    if (s.game === 'pool') {
      const g = s.poolGame;
      if (g.turn !== player.seat) return { ok: false, error: 'not_your_turn' };

      if (t === 'match.aim') {
        g.aimAngle = Number(msg.aimAngle) || 0;
        g.power = Math.max(0.05, Math.min(1, Number(msg.power) || 0.5));
        g.spinX = Math.max(-1, Math.min(1, Number(msg.spinX) || 0));
        g.spinY = Math.max(-1, Math.min(1, Number(msg.spinY) || 0));
        for (const p of s.players) {
          if (p.seat !== player.seat) {
            p.client.send({
              type: 'match.aim',
              sessionId: s.id,
              seat: player.seat,
              aimAngle: g.aimAngle,
              power: g.power,
              spinX: g.spinX,
              spinY: g.spinY
            });
          }
        }
        for (const spec of s.spectators) {
          spec.send({
            type: 'match.aim',
            sessionId: s.id,
            seat: player.seat,
            aimAngle: g.aimAngle,
            power: g.power,
            spinX: g.spinX,
            spinY: g.spinY
          });
        }
        return { ok: true };
      }

      if (t === 'match.placeCue') {
        if (g.state !== 'ballInHand') return { ok: false, error: 'not_ball_in_hand' };
        const x = Number(msg.x), y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !g.isCueBallPlacementValid(x, y)) {
          return { ok: false, error: 'invalid_cue_position' };
        }
        g.cueBall.x = x;
        g.cueBall.y = y;
        g.state = 'aiming';
        broadcastSession(s, {
          type: 'match.cuePlaced',
          sessionId: s.id,
          seat: player.seat,
          x,
          y,
          snapshot: snapshotPool(g)
        });
        return { ok: true, snapshot: snapshotPool(g) };
      }

      if (t === 'match.shoot') {
        if (g.state !== 'aiming' && g.state !== 'charging' && g.state !== 'ballInHand') {
          return { ok: false, error: 'invalid_state' };
        }
        if (msg.cueX != null && msg.cueY != null && g.state === 'ballInHand') {
          const cx = Number(msg.cueX), cy = Number(msg.cueY);
          if (g.isCueBallPlacementValid(cx, cy)) {
            g.cueBall.x = cx;
            g.cueBall.y = cy;
          }
        }
        g.state = 'aiming';
        g.aimAngle = Number(msg.aimAngle) || 0;
        g.power = Math.max(0.08, Math.min(1, Number(msg.power) || 0.5));
        g.spinX = Math.max(-1, Math.min(1, Number(msg.spinX) || 0));
        g.spinY = Math.max(-1, Math.min(1, Number(msg.spinY) || 0));

        const shotInput = {
          seat: player.seat,
          aimAngle: g.aimAngle,
          power: g.power,
          spinX: g.spinX,
          spinY: g.spinY,
          cueX: g.cueBall.x,
          cueY: g.cueBall.y
        };

        g.shoot();
        // Step authoritative physics to rest (cap at 1800 steps = 30 simulated seconds)
        const dt = 1 / 60;
        let steps = 0;
        while (g.state === 'rolling' && steps < 1800) {
          g.update(dt);
          steps++;
        }
        if (g.state === 'rolling') {
          for (const b of g.balls) b.stop();
          g.update(dt);
        }

        const outcome = snapshotPool(g);
        broadcastSession(s, {
          type: 'match.shot',
          sessionId: s.id,
          shot: shotInput,
          outcome
        });

        if (g.state === 'gameOver' && g.winner) {
          finishSession(s, g.winner);
        }
        return { ok: true, shot: shotInput, outcome };
      }
    }

    if (s.game === 'ludo') {
      const st = s.ludoState;
      const myColor = player.seat - 1; // seat 1 -> 0 (Red), seat 2 -> 1 (Green)
      if (st.turn !== myColor) return { ok: false, error: 'not_your_turn' };

      if (t === 'match.roll') {
        if (st.phase !== 'roll') return { ok: false, error: 'not_roll_phase' };
        const power = Math.max(0.1, Math.min(1, Number(msg.power) || 0.6));
        const face = rngDie();
        const ph = ludoRollDie(st, face);
        let autoMove = null;
        let moveRes = null;

        if (ph === 'forfeit' || ph === 'nomove') {
          ludoPassTurn(st);
        } else if (ph === 'pick' && st.moves.length === 1) {
          // Single legal move auto-applies
          autoMove = st.moves[0];
          moveRes = ludoApplyMove(st, autoMove);
        }

        const snap = snapshotLudo(st);
        broadcastSession(s, {
          type: 'match.rolled',
          sessionId: s.id,
          seat: player.seat,
          color: myColor,
          face,
          power,
          phaseAfterRoll: ph,
          autoMove,
          moveRes,
          snapshot: snap
        });

        if (st.phase === 'over' && st.winner != null) {
          finishSession(s, st.winner + 1);
        }
        return { ok: true, face, phaseAfterRoll: ph, autoMove, snapshot: snap };
      }

      if (t === 'match.move') {
        if (st.phase !== 'pick') return { ok: false, error: 'not_pick_phase' };
        const token = Number(msg.token);
        const move = st.moves.find(m => m.token === token) || st.moves[0];
        if (!move) return { ok: false, error: 'illegal_move' };
        const result = ludoApplyMove(st, move);
        const snap = snapshotLudo(st);
        broadcastSession(s, {
          type: 'match.moved',
          sessionId: s.id,
          seat: player.seat,
          color: myColor,
          move,
          result,
          snapshot: snap
        });

        if (st.phase === 'over' && st.winner != null) {
          finishSession(s, st.winner + 1);
        }
        return { ok: true, move, result, snapshot: snap };
      }
    }

    return { ok: false, error: 'unknown_match_command' };
  }

  return {
    registerClient,
    unregisterClient,
    startSession,
    finishSession,
    handle,
    sessions,
    queues,
    challenges,
    clientsByUser
  };
}
