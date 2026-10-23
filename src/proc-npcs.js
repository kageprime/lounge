// Procedural Citizens & Social Simulation.
// Pure deterministic simulation module: no DOM, no Three.js.
// Generates named citizens with archetypes, daily schedules, and relationship progression.

import { mulberry32, randomLoadout } from './avatar-data.js';

export const ARCHETYPES = [
  {
    role: 'Gamer',
    favoritePlace: 'arcade',
    favProp: 'arc_cab_0',
    schedule: [
      { start: 0, end: 8, target: 'loft_bed2', line: 'Zzz... one more level...' },
      { start: 8, end: 12, target: 'din_counter', line: 'Need caffeine before the tournament.' },
      { start: 12, end: 20, target: 'arc_cab_0', line: 'Nobody is beating my Ludo record!' },
      { start: 20, end: 24, target: 'arc_couch1', line: 'Good session today. GG everyone.' }
    ],
    dialogue: {
      stranger: 'Hey! Are you here to challenge the cabinet records?',
      pal: 'Yo! You should jump in on the next multiplayer match with me.',
      bestie: 'You are legendary! Here, take this secret tip: check the glitched cabinet after 2 AM.',
      gossip: 'I swear cabinet 3 had a distorted screen earlier. A glitch or a secret?'
    }
  },
  {
    role: 'Barista',
    favoritePlace: 'diner',
    favProp: 'din_espresso',
    schedule: [
      { start: 0, end: 6, target: 'loft_bed3', line: 'Resting up for the morning rush.' },
      { start: 6, end: 14, target: 'din_espresso', line: 'Fresh espresso and warm boba ready!' },
      { start: 14, end: 18, target: 'st_bench_2', line: 'Nothing beats fresh air on break.' },
      { start: 18, end: 24, target: 'arc_pool', line: 'Time to unwind with some pool.' }
    ],
    dialogue: {
      stranger: 'Welcome to the Neon Diner! Try our dark roast espresso.',
      pal: 'Hey friend! Coming in for your usual drink?',
      bestie: 'Best customer award goes to you! Have an extra treat on the house.',
      gossip: 'Late at night, the alley terminal prints out weird frequency logs.'
    }
  },
  {
    role: 'Clerk',
    favoritePlace: 'bodega',
    favProp: 'bod_reg',
    schedule: [
      { start: 0, end: 7, target: 'loft_bed3', line: 'Catching sleep between shifts.' },
      { start: 7, end: 16, target: 'bod_reg', line: 'Welcome to Night Owl Mart. Snacks in aisle 2.' },
      { start: 16, end: 21, target: 'arc_claw_1', line: 'Going to win a rare capsule today!' },
      { start: 21, end: 24, target: 'st_bench_1', line: 'The promenade neon is relaxing.' }
    ],
    dialogue: {
      stranger: 'Need snacks or energy drinks? We have got everything.',
      pal: 'Always good to see you! Check out the new gacha capsules.',
      bestie: 'You have got the best taste in town! I reserved the rarest plush for you.',
      gossip: 'Someone hid a mysterious relic in the claw machine pit. A cryptic key!'
    }
  },
  {
    role: 'Investigator',
    favoritePlace: 'backrooms',
    favProp: 'back_term',
    schedule: [
      { start: 0, end: 5, target: 'back_term', line: 'Accessing archive sector 1989...' },
      { start: 5, end: 13, target: 'loft_bed2', line: 'Sleeping while the city is awake.' },
      { start: 13, end: 17, target: 'din_booth1', line: 'Deciphering frequency notes over lunch.' },
      { start: 17, end: 24, target: 'back_rift', line: 'Monitoring the subspace barrier stability.' }
    ],
    dialogue: {
      stranger: 'Be careful wandering into the back alley after dark.',
      pal: 'You have keen eyes. Have you felt the air change at 2 AM?',
      bestie: 'I trust you with this: the Twilight Phase is real. The terminal knows.',
      gossip: 'When the clock strikes 02:00, the walls thin and the rift pulses purple.'
    }
  }
];

const CITIZEN_NAMES = [
  'Aria', 'Kael', 'Nova', 'Ren', 'Maya', 'Dante', 'Vesper', 'Sora',
  'Echo', 'Zane', 'Lyra', 'Kai', 'Shiloh', 'Orion', 'Sloan', 'Juno'
];

export function generateCitizens(world, count = 8, seed = 42) {
  const rng = mulberry32(seed);
  const citizens = [];

  for (let i = 0; i < count; i++) {
    const id = `npc_${i}`;
    const name = CITIZEN_NAMES[i % CITIZEN_NAMES.length];
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const loadout = randomLoadout(rng);

    // Initial position near spawn or their favorite place
    const prop = world.props.get(arch.favProp);
    const startTile = prop && prop.uses.length ? prop.uses[0].tile : world.layout.spawn;

    const citizen = {
      id,
      name,
      role: arch.role,
      archetype: arch,
      loadout,
      affinity: 10 + Math.floor(rng() * 20),
      currentTask: null,
      dialogue: arch.dialogue
    };

    // Join world simulation
    const person = world.command({
      t: 'join',
      person: {
        id,
        name: `${name} [${arch.role}]`,
        loadout,
        x: startTile.x + 0.5,
        y: startTile.y + 0.5
      }
    });

    if (person) {
      person.citizen = citizen;
      citizens.push(citizen);
    }
  }

  return citizens;
}

export function getRelationshipTier(affinity) {
  if (affinity >= 75) return 'Bestie';
  if (affinity >= 50) return 'Pal';
  if (affinity >= 25) return 'Acquaintance';
  return 'Stranger';
}

export function getDialogue(citizen, type = 'talk') {
  const tier = getRelationshipTier(citizen.affinity);
  const d = citizen.dialogue;
  if (type === 'gossip') return d.gossip;
  if (tier === 'Bestie') return d.bestie;
  if (tier === 'Pal') return d.pal;
  return d.stranger;
}
