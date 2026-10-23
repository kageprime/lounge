import test from 'node:test'; import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js'; import { World } from '../src/sim.js'; import { LOUNGE, LOFT } from '../src/layout.js';
import { resolve, PROPS } from '../src/props.js'; import { spawnBots } from '../src/bots.js';
import { sanitize, randomLoadout, mulberry32, OPTIONS } from '../src/avatar-data.js';

test('A* finds shortest path and respects walls', () => {
  const g = new Grid(6, 6); for (let y = 0; y < 5; y++) g.setBlock(3, y);
  const p = g.path(0, 0, 5, 0); assert.ok(p); assert.ok(p.some(t => t.y > 4), 'goes around the wall'); assert.deepEqual(p.at(-1), { x: 5.5, y: 0.5 });
  g.setBlock(3, 5); assert.equal(g.path(0, 0, 5, 0), null);
});
test('no corner cutting', () => {
  const g = new Grid(3, 3); g.setBlock(1, 0); g.setBlock(0, 1);
  assert.equal(g.path(0, 0, 1, 1), null);
});
test('rotation: footprint, use tile and facing are consistent for all 4 rotations', () => {
  for (let r = 0; r < 4; r++) {
    const p = resolve({ id: 'c', type: 'cabinet', x: 5, y: 5, r });
    assert.equal(p.foot.length, 1); const u = p.uses[0];
    const dx = u.tile.x - p.foot[0].x, dy = u.tile.y - p.foot[0].y;
    assert.equal(Math.abs(dx) + Math.abs(dy), 1, 'use tile is adjacent');
    assert.ok(Math.abs(Math.sin(u.face) + dx) < 1e-9 && Math.abs(Math.cos(u.face) + dy) < 1e-9, 'user faces the prop');
  }
  const t = resolve({ id: 't', type: 'pool', x: 4, y: 4, r: 1 }); assert.equal(t.foot.length, 8);
  assert.equal(Math.min(...t.foot.map(f => f.x)), 4); assert.equal(Math.min(...t.foot.map(f => f.y)), 4);
});
test('layout: no overlapping footprints, every use tile reachable from spawn', () => {
  const w = new World(LOUNGE); const seen = new Set();
  for (const p of w.props.values()) for (const t of p.foot) { if (p.T.flat) continue; const k = t.x + ',' + t.y; assert.ok(!seen.has(k), 'overlap at ' + k + ' ' + p.id); seen.add(k); assert.ok(w.grid.inside(t.x, t.y)); assert.ok(t.x > 0 && t.y > 0 || p.T.wall, 'in a wall: ' + p.id); }
  for (const u of w.uses.values()) assert.ok(w.grid.path(LOUNGE.spawn.x, LOUNGE.spawn.y, u.tile.x, u.tile.y), 'unreachable ' + u.id);
  assert.ok(Object.keys(PROPS).length > 8);
});
test('loft layout: no overlapping footprints, every use tile reachable from spawn', () => {
  const w = new World(LOFT); const seen = new Set();
  for (const p of w.props.values()) for (const t of p.foot) {
    if (p.T.flat) continue;
    const k = t.x + ',' + t.y;
    assert.ok(!seen.has(k), 'overlap at ' + k + ' ' + p.id);
    seen.add(k);
    assert.ok(w.grid.inside(t.x, t.y));
    assert.ok(t.x > 0 && t.y > 0 || p.T.wall, 'in a wall: ' + p.id);
  }
  for (const u of w.uses.values()) {
    assert.ok(w.grid.path(LOFT.spawn.x, LOFT.spawn.y, u.tile.x, u.tile.y), 'unreachable ' + u.id);
  }
  assert.equal(LOFT.w, 20);
  assert.equal(LOFT.h, 16);
});
test('use: walk, arrive, occupy; second person denied; stand frees it', () => {
  const w = new World(LOUNGE); const ev = []; w.on(e => ev.push(e.type));
  w.command({ t: 'join', person: { id: 'a', human: true } }); w.command({ t: 'join', person: { id: 'b' } });
  assert.ok(w.command({ t: 'use', id: 'a', use: 'cab0#0' }));
  for (let i = 0; i < 400 && w.people.get('a').state !== 'use'; i++) w.step(1 / 30);
  assert.equal(w.people.get('a').state, 'use'); assert.ok(ev.includes('use'));
  assert.equal(w.command({ t: 'use', id: 'b', use: 'cab0#0' }), false); assert.ok(ev.includes('denied'));
  w.command({ t: 'stand', id: 'a' }); assert.equal(w.people.get('a').state, 'idle'); assert.ok(w.command({ t: 'use', id: 'b', use: 'cab0#0' }));
});
test('sitting: seat tiles are goals only and standing lands on a walkable tile', () => {
  const w = new World(LOUNGE); w.command({ t: 'join', person: { id: 'a' } });
  assert.ok(w.command({ t: 'use', id: 'a', use: 'couch1#1' }));
  for (let i = 0; i < 600 && w.people.get('a').state !== 'sit'; i++) w.step(1 / 30);
  const p = w.people.get('a'); assert.equal(p.state, 'sit'); assert.ok(p.seatH > 0);
  w.command({ t: 'stand', id: 'a' }); assert.ok(w.grid.walkable(Math.floor(p.x), Math.floor(p.y)));
});
test('bots are deterministic for a seed and never get stuck in walls', () => {
  const run = () => { const w = new World(LOUNGE); spawnBots(w, 8, 7); for (let i = 0; i < 3000; i++) w.step(1 / 30); return [...w.people.values()].map(p => [p.x.toFixed(2), p.y.toFixed(2), p.state]); };
  const a = run(), b = run(); assert.deepEqual(a, b);
  const w = new World(LOUNGE); spawnBots(w, 8, 3);
  for (let i = 0; i < 4000; i++) { w.step(1 / 30); for (const p of w.people.values()) assert.ok(!w.grid.solid(Math.floor(p.x), Math.floor(p.y)), 'inside a solid tile'); }
  assert.ok([...w.people.values()].some(p => p.state === 'use' || p.state === 'sit' || p.state === 'walk'));
});
test('avatar sanitize clamps junk', () => {
  const s = sanitize({ skin: 'javascript:alert(1)', hair: 'long', top: 5 }); assert.equal(s.skin, OPTIONS.skin[0]); assert.equal(s.hair, 'long'); assert.equal(s.top, 'tee');
  const l = randomLoadout(mulberry32(3)); assert.deepEqual(sanitize(l), l);
});

// ---- model pipeline (pure parts) ----
import { pickEntry, fitPlan } from '../src/fit.js'; import fs from 'node:fs';
test('manifest: instance entry beats type entry, disabled/missing -> null, variants are deterministic', () => {
  const m = { stool: { file: 'a.glb' }, 'stool:st7': { file: 'b.glb' }, off: { file: 'x.glb', enabled: false }, couch: { files: ['c1.glb', 'c2.glb', 'c3.glb'] } };
  assert.equal(pickEntry(m, { type: 'stool', id: 'st6' }).file, 'a.glb'); assert.equal(pickEntry(m, { type: 'stool', id: 'st7' }).file, 'b.glb');
  assert.equal(pickEntry(m, { type: 'off', id: 'o' }), null); assert.equal(pickEntry(m, { type: 'plant', id: 'p' }), null); assert.equal(pickEntry({}, { type: 'x', id: 'y' }), null);
  assert.equal(pickEntry(m, { type: 'couch', id: 'couch1' }).file, pickEntry(m, { type: 'couch', id: 'couch1' }).file);
});
test('fitPlan: footprint fit, height fit clamped by footprint, floor + centring, explicit scale/offset', () => {
  let p = fitPlan([-50, 0, -25], [50, 100, 25], {}, { w: 3, d: 1 });          // a 100x100x50 "centimetre" model into 3x1 tiles
  assert.ok(Math.abs(p.scale - Math.min(3 * 0.92 / 100, 0.92 / 50)) < 1e-9);
  p = fitPlan([10, 5, 10], [11, 7, 11], { height: 1.8 }, { w: 1, d: 1 }); assert.ok(p.scale <= 0.92 + 1e-9, 'clamped to footprint');
  p = fitPlan([10, 5, 10], [11, 7, 11], { height: 1.8, clamp: false }, { w: 1, d: 1 }); assert.ok(Math.abs(p.scale - 0.9) < 1e-9);
  p = fitPlan([2, 3, 4], [4, 5, 8], { scale: 2, offset: [0, 0.1, 0] }, { w: 1, d: 1 });
  assert.deepEqual(p.pos.map(v => +v.toFixed(6)), [-6, -6 + 0.1, -12]);        // centre x=3,z=6 -> 0 ; min y=3 -> 0 (+offset)
  assert.equal(fitPlan([0, 0, 0], [0, 0, 0], {}, { w: 1, d: 1 }).scale, 1, 'degenerate bbox does not give NaN');
});
test('vending.glb is a valid, outward-facing GLB', () => {
  const b = fs.readFileSync(new URL('../assets/models/vending.glb', import.meta.url));
  assert.equal(b.readUInt32LE(0), 0x46546c67); assert.equal(b.readUInt32LE(8), b.length);
  const jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString()), bo = 20 + jl + 8, bin = b.subarray(bo);
  assert.ok(j.materials.some(m => m.name === 'body') && j.materials.some(m => m.name === 'sign'));
  const pa = j.accessors[0], pv = j.bufferViews[0], na = j.accessors[1];
  const pos = new Float32Array(bin.buffer.slice(bin.byteOffset + pv.byteOffset, bin.byteOffset + pv.byteOffset + pa.count * 12));
  const nor = new Float32Array(bin.buffer.slice(bin.byteOffset + j.bufferViews[1].byteOffset, bin.byteOffset + j.bufferViews[1].byteOffset + na.count * 12));
  let tris = 0;
  for (const prim of j.meshes[0].primitives) {
    const a = j.accessors[prim.indices], iv = j.bufferViews[a.bufferView], o = bin.byteOffset + iv.byteOffset + (a.byteOffset || 0);
    const idx = new Uint32Array(bin.buffer.slice(o, o + a.count * 4));
    for (let t = 0; t < idx.length; t += 3) {
      const [i0, i1, i2] = [idx[t], idx[t + 1], idx[t + 2]]; assert.ok(Math.max(i0, i1, i2) < pa.count);
      const A = [0, 1, 2].map(k => pos[i0 * 3 + k]), B = [0, 1, 2].map(k => pos[i1 * 3 + k]), C = [0, 1, 2].map(k => pos[i2 * 3 + k]);
      const u = B.map((v, k) => v - A[k]), w = C.map((v, k) => v - A[k]), c = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      assert.ok(c[0] * nor[i0 * 3] + c[1] * nor[i0 * 3 + 1] + c[2] * nor[i0 * 3 + 2] > 0, 'triangle winds outward'); tris++;
    }
  }
  assert.ok(tris > 400); assert.ok(pa.min[1] >= -1e-6 && pa.max[1] > 1.7, 'floor at y=0, ~1.8 tall');
});

test('fitPlan: anchor back puts the model flush with the tile back (or the wall surface)', () => {
  let p = fitPlan([-1, 0, -1], [1, 4, 2], { scale: 0.5, anchor: 'back' }, { w: 1, d: 1 });      // back at z=-1 -> -0.5 at scale .5 -> pos so back sits at -0.5
  assert.ok(Math.abs(p.pos[2] - (-0.5 + 0.5)) < 1e-9);
  p = fitPlan([0, 0, 0], [1, 1, 0.5], { scale: 1, anchor: 'back', offset: [0, 1.6, 0] }, { w: 1, d: 1, wall: true });
  assert.deepEqual(p.pos, [-0.5, 1.6, 0]);
});
test('pickEntry: ids ending in a number cycle through the variant files', () => {
  const m = { cabinet: { files: ['a', 'b', 'c', 'd'] } };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => pickEntry(m, { type: 'cabinet', id: 'cab' + i }).file), ['a', 'b', 'c', 'd', 'a', 'b']);
});
test('manifest.json: every file exists, is a GLB, and every material / node it names is really in that file', () => {
  const dir = new URL('../assets/models/', import.meta.url), man = JSON.parse(fs.readFileSync(new URL('manifest.json', dir))).models;
  const glb = f => { const b = fs.readFileSync(new URL(f, dir)); assert.equal(b.readUInt32LE(0), 0x46546c67, f + ' is a GLB'); assert.equal(b.readUInt32LE(8), b.length, f + ' length'); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()); };
  const propsSrc = fs.readFileSync(new URL('../src/props.js', import.meta.url), 'utf8');
  for (const [key, e] of Object.entries(man)) {
    assert.ok(new RegExp('\\b' + key.split(':')[0] + ':\\s*\\{').test(propsSrc), 'manifest key is a real prop type: ' + key);
    for (const f of e.files || [e.file]) {
      const j = glb(f), mats = new Set(j.materials.map(m => m.name)), nodes = new Set(j.nodes.map(n => n.name));
      const need = [...(e.tint || []).map(t => t.material), ...Object.keys(e.emissive || {}), ...(e.screen ? [e.screen] : [])];
      for (const n of need) assert.ok(mats.has(n), `${f}: material "${n}" exists (has ${[...mats]})`);
      if (e.spin) assert.ok(nodes.has(e.spin), `${f}: node "${e.spin}" exists`);
    }
  }
});
test('cabinet GLBs: embedded textures decode, UVs in range, screen UVs span 0..1', () => {
  for (const f of ['cab_alientox', 'cab_hotlava', 'cab_xoxoxo', 'cab_police']) {
    const b = fs.readFileSync(new URL(`../assets/models/${f}.glb`, import.meta.url)), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
    assert.equal(j.images.length, 3); for (const im of j.images) { const v = j.bufferViews[im.bufferView]; assert.equal(bin.subarray(v.byteOffset, v.byteOffset + 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature'); }
    const uvOf = p => { const a = j.accessors[p.attributes.TEXCOORD_0], v = j.bufferViews[a.bufferView]; return new Float32Array(bin.buffer.slice(bin.byteOffset + v.byteOffset, bin.byteOffset + v.byteOffset + a.count * 8)); };
    const [body, screen] = j.meshes[0].primitives.map(uvOf);
    assert.ok(body.every(v => v >= -1e-4 && v <= 1.0001), 'body UVs in 0..1');
    assert.ok(Math.min(...screen) < 1e-4 && Math.max(...screen) > 0.9999, 'screen UVs cover the whole screen image');
    assert.equal(j.materials.find(m => m.name === 'screen') !== undefined && j.meshes[0].primitives[1].material, 1);
  }
});

test('decorator mode: placeProp, moveProp, removeProp update collision, occupancy and layout', () => {
  const w = new World(LOUNGE);
  // 1. Can't place outside bounds or overlapping existing
  assert.equal(w.command({ t: 'placeProp', prop: { id: 'bad1', type: 'couch', x: 25, y: 17, r: 0 } }), false);
  assert.equal(w.command({ t: 'placeProp', prop: { id: 'bad2', type: 'couch', x: 10, y: 8, r: 0 } }), false);

  // 2. Can place in an open tile
  assert.ok(w.grid.walkable(13, 14));
  const placed = w.command({ t: 'placeProp', prop: { id: 'couchNew', type: 'couch', x: 13, y: 14, r: 0, color: '#ff00ff' } });
  assert.ok(placed);
  assert.ok(w.props.has('couchNew'));
  assert.ok(!w.grid.walkable(13, 14));
  assert.ok(w.layout.props.some(p => p.id === 'couchNew'));

  // Place a cabinet to verify solid block
  assert.ok(w.grid.walkable(5, 14));
  assert.ok(w.command({ t: 'placeProp', prop: { id: 'cabNew', type: 'cabinet', x: 5, y: 14, r: 0 } }));
  assert.ok(w.grid.solid(5, 14));

  // 3. Move prop to new location (away from spawn point 13, 16)
  const moved = w.command({ t: 'moveProp', propId: 'couchNew', x: 8, y: 14, r: 0 });
  assert.ok(moved);
  assert.ok(w.grid.walkable(13, 14));
  assert.ok(!w.grid.walkable(8, 14));

  // 4. Seating and removal: person sits on prop, prop removed -> person stands cleanly
  const p = w.command({ t: 'join', person: { id: 'tester', human: true, x: 8.5, y: 13.5 } });
  const useId = w.props.get('couchNew').uses[0].id;
  assert.ok(w.command({ t: 'use', id: 'tester', use: useId }));
  for (let i = 0; i < 60; i++) w.step(1 / 30);
  assert.equal(p.state, 'sit');
  assert.equal(p.use, useId);

  // Removing couchNew unseats tester cleanly to a walkable tile
  assert.ok(w.command({ t: 'removeProp', propId: 'couchNew' }));
  assert.equal(p.state, 'idle');
  assert.equal(p.use, null);
  assert.ok(w.grid.walkable(Math.floor(p.x), Math.floor(p.y)));
  assert.ok(!w.props.has('couchNew'));
  assert.ok(!w.layout.props.some(p => p.id === 'couchNew'));
});

test('phase system: setPhase switches between normal and twilight with events', () => {
  const w = new World(LOUNGE);
  assert.equal(w.phase, 'normal');
  const events = [];
  w.on(e => { if (e.type === 'phaseChange') events.push(e); });

  // Switch to twilight
  assert.ok(w.command({ t: 'setPhase', phase: 'twilight' }));
  assert.equal(w.phase, 'twilight');
  assert.equal(events.length, 1);
  assert.equal(events[0].phase, 'twilight');

  // No-op if phase does not change
  assert.ok(w.command({ t: 'setPhase', phase: 'twilight' }));
  assert.equal(events.length, 1);

  // Switch back to normal
  assert.ok(w.command({ t: 'setPhase', phase: 'normal' }));
  assert.equal(w.phase, 'normal');
  assert.equal(events.length, 2);
  assert.equal(events[1].phase, 'normal');
});

import { PRIZES, getRandomPrize } from '../src/claw.js';
test('claw machine prizes: contains 4 tiers (common, uncommon, rare, cryptic) and valid properties', () => {
  assert.ok(Array.isArray(PRIZES) && PRIZES.length >= 8);
  const tiers = new Set(PRIZES.map(p => p.tier));
  assert.ok(tiers.has('common'), 'has common tier');
  assert.ok(tiers.has('uncommon'), 'has uncommon tier');
  assert.ok(tiers.has('rare'), 'has rare tier');
  assert.ok(tiers.has('cryptic'), 'has cryptic tier');
  for (const p of PRIZES) {
    assert.ok(p.name, 'prize has name');
    assert.ok(p.tier, 'prize has tier');
    assert.ok(p.color, 'prize has color');
  }

  // getRandomPrize produces valid prizes
  for (let i = 0; i < 50; i++) {
    const p = getRandomPrize();
    assert.ok(p && p.name && p.tier);
  }
});

import { NetClient } from '../src/net.js';
test('multiplayer net client: handles graceful offline fallback and sending', () => {
  let statusReport = null;
  const net = new NetClient({
    url: 'ws://localhost:9999/ws',
    onStatus: s => { statusReport = s; }
  });
  assert.equal(net.connected, false);
  // Sending while disconnected gracefully returns false
  const sent = net.send({ t: 'move', x: 10, y: 10 });
  assert.equal(sent, false);
  net.close();
  assert.equal(net.connected, false);
});

test('diorama table: prop resolution, footprint, uses, and 4 rotations', () => {
  for (let r = 0; r < 4; r++) {
    const p = resolve({ id: 'dt', type: 'diorama_table', x: 5, y: 5, r });
    assert.equal(p.foot.length, 2);
    assert.equal(p.uses.length, 2);
    for (const u of p.uses) {
      assert.equal(u.action, 'moonbase');
    }
  }
});

test('warp: instantly teleports avatar, clears path and releases uses', () => {
  const w = new World(LOUNGE);
  w.command({ t: 'join', person: { id: 'p1', human: true } });
  w.command({ t: 'use', id: 'p1', use: 'cab0#0' });
  for (let i = 0; i < 400 && w.people.get('p1').state !== 'use'; i++) w.step(1 / 30);
  assert.equal(w.people.get('p1').state, 'use');

  const evs = [];
  w.on(e => evs.push(e));
  assert.ok(w.command({ t: 'warp', id: 'p1', x: 18, y: 12 }));
  const p = w.people.get('p1');
  assert.equal(p.state, 'idle');
  assert.equal(p.use, null);
  assert.equal(p.x, 18.5);
  assert.equal(p.y, 12.5);
  assert.equal(p.path.length, 0);
  assert.ok(evs.some(e => e.type === 'warp' && e.id === 'p1'));
});

// The browser-only files (they import 'three' so no test can load them) must at least parse. A stray // comment mid-line once swallowed a brace.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('every browser source file parses as an ES module', () => {
  for (const dir of ['../src', '../games/ludo/src', '../games/pool/src']) {
    const d = new URL(dir + '/', import.meta.url); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter(n => n.endsWith('.js'))) {
      const r = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(f, d))], { encoding: 'utf8' }); assert.equal(r.status, 0, f + ': ' + r.stderr.split('\n').slice(0, 4).join(' | '));
    }
  }
});
