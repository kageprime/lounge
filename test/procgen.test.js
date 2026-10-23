import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDistrict, hashSeed, DISTRICT_BUILDINGS } from '../src/procgen.js';
import { World } from '../src/sim.js';
import { LifeSim } from '../src/lifesim.js';
import { generateCitizens, getRelationshipTier, getDialogue } from '../src/proc-npcs.js';
import { spawnCitizenBots } from '../src/bots.js';

test('procgen: deterministic given a seed', () => {
  const d1 = generateDistrict(1337);
  const d2 = generateDistrict(1337);
  const d3 = generateDistrict(9999);

  assert.equal(d1.props.length, d2.props.length);
  assert.deepEqual(d1.props.map(p => p.id), d2.props.map(p => p.id));
  assert.notEqual(d1.id, d3.id);
});

test('procgen: valid building bounds, doors, and no overlapping footprints', () => {
  const dist = generateDistrict(42);
  const w = new World(dist);

  // Check no overlapping footprints among solid props
  const seen = new Set();
  for (const p of w.props.values()) {
    if (p.T.flat) continue;
    for (const t of p.foot) {
      const k = `${t.x},${t.y}`;
      assert.ok(!seen.has(k), `Collision overlap at ${k} on prop ${p.id}`);
      seen.add(k);
      assert.ok(w.grid.inside(t.x, t.y), `Tile ${k} is out of bounds for prop ${p.id}`);
    }
  }

  // Check that spawn is walkable
  assert.ok(w.grid.walkable(dist.spawn.x, dist.spawn.y), 'Spawn point must be walkable');

  // Check that every building door is reachable from spawn
  for (const b of DISTRICT_BUILDINGS) {
    const doorX = b.door.x;
    const doorY = b.door.y;
    const path = w.grid.path(dist.spawn.x, dist.spawn.y, doorX, doorY);
    assert.ok(path, `Path from spawn to building ${b.id} door at (${doorX},${doorY}) must exist`);
  }

  // Check that interactive key props are reachable from spawn
  const keyProps = ['arc_cab_0', 'arc_pool', 'din_counter', 'din_booth1', 'bod_reg', 'loft_bed1', 'loft_diorama', 'back_term'];
  for (const pid of keyProps) {
    const p = w.props.get(pid);
    assert.ok(p, `Prop ${pid} must exist in generated district`);
    assert.ok(p.uses.length > 0, `Prop ${pid} must have use slots`);
    const u = p.uses[0];
    const path = w.grid.path(dist.spawn.x, dist.spawn.y, u.tile.x, u.tile.y);
    assert.ok(path, `Prop ${pid} use tile (${u.tile.x},${u.tile.y}) must be reachable from spawn`);
  }
});

test('lifesim: time progression, day-night cycle, and vibe mechanics', () => {
  const sim = new LifeSim({ startHour: 11, startMinute: 45, speed: 2.0 });
  assert.equal(sim.getClockString(), '11:45');
  assert.equal(sim.getTimeBand().id, 'day');
  assert.equal(sim.isTwilightHour(), false);

  // Advance time by 30 seconds (* 2.0 = 60 game minutes) -> 12:45
  sim.step(30);
  assert.equal(sim.hour, 12);
  assert.equal(sim.getClockString(), '12:45');

  // Test prop interaction effects on vibes
  const initialHunger = sim.vibes.hunger;
  const foodRes = sim.interact('food', 'diner_counter', 'din_counter');
  assert.ok(foodRes.success);
  assert.ok(sim.vibes.hunger > initialHunger, 'Hunger vibe increased after eating');

  const drinkRes = sim.interact('drink', 'espresso', 'din_espresso');
  assert.ok(drinkRes.success);

  // Twilight hour detection at 03:00
  sim.hour = 3;
  assert.equal(sim.isTwilightHour(), true);
  assert.equal(sim.getTimeBand().id, 'twilight');
});

test('lifesim: gigs reward progression', () => {
  const sim = new LifeSim();
  sim.activeGig = {
    id: 'diner_shift',
    title: 'Diner Barista Shift',
    rewardCoins: 45,
    rewardTickets: 15,
    reqTarget: 'din_counter'
  };

  const res = sim.interact('food', 'diner_counter', 'din_counter');
  assert.equal(res.coins, 45);
  assert.equal(res.tickets, 15);
  assert.equal(sim.activeGig, null);
  assert.ok(sim.completedGigs.has('diner_shift'));
});

test('proc-npcs: generation, relationship progression, and dialogue', () => {
  const dist = generateDistrict(777);
  const w = new World(dist);
  const citizens = generateCitizens(w, 6, 777);

  assert.equal(citizens.length, 6);
  for (const c of citizens) {
    assert.ok(c.name);
    assert.ok(c.role);
    assert.ok(c.archetype);
    assert.ok(w.people.has(c.id));
  }

  // Relationship tier checks
  assert.equal(getRelationshipTier(10), 'Stranger');
  assert.equal(getRelationshipTier(35), 'Acquaintance');
  assert.equal(getRelationshipTier(60), 'Pal');
  assert.equal(getRelationshipTier(90), 'Bestie');

  const c0 = citizens[0];
  c0.affinity = 15;
  const strangerLine = getDialogue(c0, 'talk');
  assert.ok(strangerLine.length > 0);

  c0.affinity = 85;
  const bestieLine = getDialogue(c0, 'talk');
  assert.notEqual(strangerLine, bestieLine);
  assert.ok(getDialogue(c0, 'gossip').length > 0);
});

test('sim: life-sim command seam extensions (talk, gift, consume, workGig)', () => {
  const dist = generateDistrict(123);
  const w = new World(dist);
  const events = [];
  w.on(e => events.push(e));

  const p1 = w.command({ t: 'join', person: { id: 'player1', human: true } });
  const p2 = w.command({ t: 'join', person: { id: 'player2' } });

  assert.ok(w.command({ t: 'talk', id: 'player1', targetId: 'player2', text: 'Hello neighbor!' }));
  assert.ok(events.some(e => e.type === 'talk' && e.fromId === 'player1' && e.targetId === 'player2'));

  assert.ok(w.command({ t: 'gift', id: 'player1', targetId: 'player2', item: 'ramen' }));
  assert.ok(events.some(e => e.type === 'gift' && e.item === 'ramen'));

  assert.ok(w.command({ t: 'consume', id: 'player1', item: 'boba' }));
  assert.ok(events.some(e => e.type === 'consume' && e.item === 'boba'));

  assert.ok(w.command({ t: 'workGig', id: 'player1', gigId: 'diner_shift' }));
  assert.ok(events.some(e => e.type === 'workGig' && e.gigId === 'diner_shift'));
});

test('bots: spawnCitizenBots executes without error or wall collisions', () => {
  const dist = generateDistrict(888);
  const w = new World(dist);
  const lifeSim = new LifeSim();
  const citizens = generateCitizens(w, 4, 888);
  spawnCitizenBots(w, lifeSim, citizens, 888);

  // Step 200 simulation ticks
  for (let i = 0; i < 200; i++) {
    lifeSim.step(1 / 30);
    w.step(1 / 30);
  }

  for (const c of citizens) {
    const p = w.people.get(c.id);
    assert.ok(!w.grid.solid(Math.floor(p.x), Math.floor(p.y)), `Citizen ${c.id} inside solid tile`);
  }
});

test('housing: overnight sleep in loft_bed1 fast-forwards to 07:00 AM Dawn', () => {
  const sim = new LifeSim({ startHour: 23, startMinute: 30 });
  sim.vibes.energy = 15;
  sim.vibes.hunger = 70;

  const res = sim.interact('sleep', 'bed', 'loft_bed1');
  assert.equal(res.morning, true);
  assert.equal(sim.hour, 7);
  assert.equal(sim.minute, 0);
  assert.equal(sim.vibes.energy, 100);
  assert.equal(sim.getTimeBand().id, 'dawn');
  assert.ok(sim.vibes.hunger <= 50, 'Hunger increased after sleeping overnight');
});

test('housing: citizen hangoutTarget navigates bot to player loft prop', () => {
  const dist = generateDistrict(999);
  const w = new World(dist);
  const lifeSim = new LifeSim();
  const citizens = generateCitizens(w, 2, 999);
  spawnCitizenBots(w, lifeSim, citizens, 999);

  const c0 = citizens[0];
  c0.hangoutTarget = 'loft_couch1';

  // Step simulation until bot reacts
  for (let i = 0; i < 150; i++) {
    lifeSim.step(1 / 30);
    w.step(1 / 30);
  }

  const p0 = w.people.get(c0.id);
  // Citizen should now either be at or moving towards loft_couch1 in Unit 101
  const couch = w.props.get('loft_couch1');
  assert.ok(couch, 'loft_couch1 must exist');
  assert.ok(!w.grid.solid(Math.floor(p0.x), Math.floor(p0.y)), 'Citizen bot must not be in solid wall');
});

