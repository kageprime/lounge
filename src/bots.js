// Bot "brains": tiny state machines driven through the same command seam as a human.
// Swap this file for a server and the same Person records would arrive from other players instead.
import { mulberry32, randomLoadout, EMOTES } from './avatar-data.js';

const NAMES = ['Kemi', 'Tunde', 'Ada', 'Zed', 'Mira', 'Obi', 'Lex', 'Nia', 'Rafa', 'Juno', 'Sade', 'Kai'];
const LINES = ['good game!', 'who wants Ludo?', 'high score incoming', 'one more round', 'this jukebox slaps', 'anyone for pool?', 'brb snacks', 'ha, nice one', 'rematch?', 'that was close'];

export function spawnBots(world, n, seed = 1) {
  const rng = mulberry32(seed), ids = [];
  for (let i = 0; i < n; i++) {
    const id = 'bot' + i;
    let x, y; do { x = 2 + Math.floor(rng() * (world.layout.w - 3)); y = 2 + Math.floor(rng() * (world.layout.h - 3)); } while (!world.grid.walkable(x, y));
    const p = world.command({ t: 'join', person: { id, name: NAMES[i % NAMES.length], loadout: randomLoadout(rng), x: x + 0.5, y: y + 0.5 } });
    let wake = rng() * 3;
    p.brain = (w, me) => {
      if (w.t < wake) return;
      if (me.use) {                                   // finished using something -> stand and drift on
        w.command({ t: 'stand', id }); wake = w.t + 0.5 + rng() * 2; return;
      }
      if (me.state === 'walk') { wake = w.t + 0.5; return; }
      const r = rng();
      if (r < 0.42) {
        const free = w.freeUses(u => (u.action === 'play' || u.action === 'sit' || u.action === 'music') && !(w.props.get(u.prop).type === 'cabinet' && w.props.get(u.prop).game));
        if (free.length && w.command({ t: 'use', id, use: free[Math.floor(rng() * free.length)].id })) { wake = w.t + 9 + rng() * 14; return; }
      }
      if (r < 0.72) { w.command({ t: 'move', id, x: 1 + rng() * (w.layout.w - 1), y: 1 + rng() * (w.layout.h - 1) }); wake = w.t + 1; return; }
      if (r < 0.84) { w.command({ t: 'emote', id, name: EMOTES[Math.floor(rng() * EMOTES.length)] }); wake = w.t + 3 + rng() * 3; return; }
      if (r < 0.92) { w.command({ t: 'say', id, text: LINES[Math.floor(rng() * LINES.length)] }); wake = w.t + 4 + rng() * 4; return; }
      wake = w.t + 2 + rng() * 4;
    };
    ids.push(id);
  }
  return ids;
}

export function spawnCitizenBots(world, lifeSim, citizens, seed = 42) {
  const rng = mulberry32(seed);
  for (const c of citizens) {
    const p = world.people.get(c.id);
    if (!p) continue;

    let wake = 1 + rng() * 3;
    let lastTarget = null;

    p.brain = (w, me) => {
      if (w.t < wake) return;

      // 0. Player Loft Hangout Override
      if (c.hangoutTarget) {
        if (lastTarget !== c.hangoutTarget) {
          const targetProp = w.props.get(c.hangoutTarget);
          if (targetProp && targetProp.uses.length) {
            const u = targetProp.uses[0];
            if (!w.occ.has(u.id) || w.occ.get(u.id) === me.id) {
              if (me.use) w.command({ t: 'stand', id: me.id });
              if (w.command({ t: 'use', id: me.id, use: u.id })) {
                lastTarget = c.hangoutTarget;
                w.command({ t: 'say', id: me.id, text: 'Love what you have done with Unit 101!' });
                wake = w.t + 30 + rng() * 20;
                return;
              }
            }
          }
        } else if (me.use) {
          wake = w.t + 10;
          return;
        }
      }

      const hour = lifeSim ? lifeSim.hour : 12;
      const sched = c.archetype.schedule.find(s => hour >= s.start && hour < s.end);

      // 1. Follow Scheduled Routine
      if (sched && sched.target && sched.target !== lastTarget) {
        const targetProp = w.props.get(sched.target);
        if (targetProp && targetProp.uses.length) {
          const u = targetProp.uses[0];
          if (!w.occ.has(u.id) || w.occ.get(u.id) === me.id) {
            if (me.use) w.command({ t: 'stand', id: me.id });
            if (w.command({ t: 'use', id: me.id, use: u.id })) {
              lastTarget = sched.target;
              if (sched.line && rng() < 0.6) {
                w.command({ t: 'say', id: me.id, text: sched.line });
              }
              wake = w.t + 12 + rng() * 10;
              return;
            }
          }
        }
      }

      // 2. If currently using something, finish and stand after a while
      if (me.use) {
        if (rng() < 0.3) {
          w.command({ t: 'stand', id: me.id });
          wake = w.t + 1 + rng() * 2;
          return;
        }
        wake = w.t + 4 + rng() * 4;
        return;
      }

      if (me.state === 'walk') {
        wake = w.t + 0.5;
        return;
      }

      // 3. Ambient life actions
      const r = rng();
      if (r < 0.35) {
        // Find free activity or seat in current area
        const free = w.freeUses(u => u.action === 'sit' || u.action === 'food' || u.action === 'drink' || u.action === 'play');
        if (free.length) {
          const chosen = free[Math.floor(rng() * free.length)];
          if (w.command({ t: 'use', id: me.id, use: chosen.id })) {
            wake = w.t + 10 + rng() * 10;
            return;
          }
        }
      } else if (r < 0.65) {
        // Stroll around nearby tiles in the district
        const dx = (rng() - 0.5) * 8;
        const dy = (rng() - 0.5) * 8;
        const tx = Math.floor(Math.max(2, Math.min(w.layout.w - 3, me.x + dx)));
        const ty = Math.floor(Math.max(2, Math.min(w.layout.h - 3, me.y + dy)));
        if (w.grid.walkable(tx, ty)) {
          w.command({ t: 'move', id: me.id, x: tx, y: ty });
          wake = w.t + 2;
          return;
        }
      } else if (r < 0.8) {
        w.command({ t: 'emote', id: me.id, name: EMOTES[Math.floor(rng() * EMOTES.length)] });
        wake = w.t + 3;
        return;
      } else if (r < 0.92) {
        const text = sched ? sched.line : LINES[Math.floor(rng() * LINES.length)];
        w.command({ t: 'say', id: me.id, text });
        wake = w.t + 4;
        return;
      }

      wake = w.t + 2 + rng() * 3;
    };
  }
}
