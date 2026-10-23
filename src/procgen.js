// Procedural District Generator.
// Pure module: deterministic given a seed, no DOM, no Three.js.
// Generates a multi-building life simulation layout ("The Twilight District")
// with interconnected streets, buildings, doorways, and pathfinding guarantees.

import { mulberry32 } from './avatar-data.js';

export function hashSeed(s) {
  if (typeof s === 'number') return s | 0;
  let h = 0x811c9dc5;
  const str = String(s || 'twilight');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const DISTRICT_BUILDINGS = [
  {
    id: 'arcade',
    name: 'The Twilight Arcade',
    theme: 'arcade',
    bounds: { x: 3, y: 3, w: 22, h: 15 },
    door: { x: 13, y: 17, w: 2 },   // opening south onto the promenade
    color: '#ff4d9a',
    sign: 'TWILIGHT ARCADE',
    floor: 'arcade'
  },
  {
    id: 'diner',
    name: 'Neon Noodle & Boba Bar',
    theme: 'diner',
    bounds: { x: 29, y: 3, w: 18, h: 14 },
    door: { x: 37, y: 16, w: 2 },   // opening south onto the promenade
    color: '#35e0ff',
    sign: 'NEON DINER',
    floor: 'diner'
  },
  {
    id: 'bodega',
    name: 'Night Owl Mart',
    theme: 'bodega',
    bounds: { x: 29, y: 22, w: 18, h: 15 },
    door: { x: 29, y: 28, h: 2, side: 'w' }, // opening west onto the avenue
    color: '#ffd166',
    sign: 'NIGHT OWL MART',
    floor: 'bodega'
  },
  {
    id: 'lofts',
    name: 'Skyline Micro-Lofts',
    theme: 'lofts',
    bounds: { x: 3, y: 22, w: 22, h: 17 },
    door: { x: 13, y: 22, w: 2 },   // opening north onto the promenade
    color: '#8a5cff',
    sign: 'SKYLINE LOFTS',
    floor: 'lofts'
  },
  {
    id: 'backrooms',
    name: 'Subspace Alley',
    theme: 'backrooms',
    bounds: { x: 51, y: 3, w: 9, h: 36 },
    door: { x: 51, y: 19, h: 2, side: 'w' }, // opening west onto the east walkway
    color: '#33ff88',
    sign: 'SUBSPACE 1989',
    floor: 'backrooms'
  }
];

export function generateDistrict(rawSeed = 1337, options = {}) {
  const seed = hashSeed(rawSeed);
  const rng = mulberry32(seed);
  const w = options.w || 62, h = options.h || 42;
  const spawn = { x: 26, y: 19 };

  const props = [];
  const add = p => props.push(p);

  // Helper to test if a tile is inside any building's perimeter wall
  const isWallTile = (bx, by, b) => {
    const isPerim = (bx === b.bounds.x || bx === b.bounds.x + b.bounds.w - 1 ||
                     by === b.bounds.y || by === b.bounds.y + b.bounds.h - 1);
    if (!isPerim) return false;
    // Check if it's in the door opening
    if (b.door.w) {
      if (by === b.door.y && bx >= b.door.x && bx < b.door.x + b.door.w) return false;
    }
    if (b.door.h) {
      if (bx === b.door.x && by >= b.door.y && by < b.door.y + b.door.h) return false;
    }
    return true;
  };

  // Build building perimeter walls as wall_seg props
  for (const b of DISTRICT_BUILDINGS) {
    const { x, y, w: bw, h: bh } = b.bounds;
    for (let cy = y; cy < y + bh; cy++) {
      for (let cx = x; cx < x + bw; cx++) {
        if (isWallTile(cx, cy, b)) {
          add({
            id: `w_${b.id}_${cx}_${cy}`,
            type: 'wall_seg',
            x: cx, y: cy, r: 0,
            buildingId: b.id,
            color: b.color
          });
        }
      }
    }
    // Add door frames over the door openings
    if (b.door.w) {
      for (let dx = 0; dx < b.door.w; dx++) {
        add({ id: `dr_${b.id}_${dx}`, type: 'door_frame', x: b.door.x + dx, y: b.door.y, r: 0, buildingId: b.id });
      }
    } else if (b.door.h) {
      for (let dy = 0; dy < b.door.h; dy++) {
        add({ id: `dr_${b.id}_${dy}`, type: 'door_frame', x: b.door.x, y: b.door.y + dy, r: 1, buildingId: b.id });
      }
    }
  }

  // 1. POPULATE THE TWILIGHT ARCADE
  {
    const b = DISTRICT_BUILDINGS[0];
    // Arcade Cabinets on north wall
    const cabs = ['ludo', null, null, 'proto89', null, null];
    const cabColors = ['#ff4d6d', '#35e0c9', '#ffd166', '#33ff88', '#7a6bff', '#ff8a3d'];
    for (let i = 0; i < 6; i++) {
      add({ id: `arc_cab_${i}`, type: 'cabinet', x: b.bounds.x + 2 + i * 2, y: b.bounds.y + 1, r: 0, game: cabs[i], color: cabColors[i], buildingId: b.id });
    }
    // Claw machines
    add({ id: 'arc_claw_1', type: 'claw', x: b.bounds.x + 15, y: b.bounds.y + 1, r: 0, color: '#ff6fb5', buildingId: b.id });
    add({ id: 'arc_claw_2', type: 'claw', x: b.bounds.x + 17, y: b.bounds.y + 1, r: 0, color: '#6fe08a', buildingId: b.id });
    // Jukebox
    add({ id: 'arc_juke', type: 'jukebox', x: b.bounds.x + 19, y: b.bounds.y + 1, r: 0, color: '#ffb84a', buildingId: b.id });
    // Ludo table & Pool table
    add({ id: 'arc_ludo', type: 'ludotable', x: b.bounds.x + 14, y: b.bounds.y + 5, r: 0, game: 'ludo', color: '#2f6b4a', buildingId: b.id });
    add({ id: 'arc_pool', type: 'pool', x: b.bounds.x + 14, y: b.bounds.y + 9, r: 0, game: 'pool', color: '#1f6f4f', buildingId: b.id });
    // Bar & Stools
    add({ id: 'arc_bar', type: 'bar', x: b.bounds.x + 2, y: b.bounds.y + 6, r: 1, color: '#5a3a24', buildingId: b.id });
    for (let sy = 0; sy < 5; sy++) {
      add({ id: `arc_st_${sy}`, type: 'stool', x: b.bounds.x + 3, y: b.bounds.y + 6 + sy, r: 3, color: '#c0392b', buildingId: b.id });
    }
    // Central Lounge Seating & Rug
    add({ id: 'arc_rug', type: 'rug', x: b.bounds.x + 6, y: b.bounds.y + 8, r: 0, color: '#5b2a86', buildingId: b.id });
    add({ id: 'arc_couch1', type: 'couch', x: b.bounds.x + 6, y: b.bounds.y + 7, r: 2, color: '#d1495b', buildingId: b.id });
    add({ id: 'arc_couch2', type: 'couch', x: b.bounds.x + 6, y: b.bounds.y + 12, r: 0, color: '#2e86ab', buildingId: b.id });
    add({ id: 'arc_table', type: 'table', x: b.bounds.x + 7, y: b.bounds.y + 9, r: 0, color: '#2d2438', buildingId: b.id });
    // Decor
    add({ id: 'arc_plant1', type: 'plant', x: b.bounds.x + 1, y: b.bounds.y + 13, r: 0, buildingId: b.id });
    add({ id: 'arc_plant2', type: 'plant', x: b.bounds.x + 20, y: b.bounds.y + 13, r: 0, buildingId: b.id });
  }

  // 2. POPULATE NEON DINER & BOBA BAR
  {
    const b = DISTRICT_BUILDINGS[1];
    // Diner counter & stools
    add({ id: 'din_counter', type: 'diner_counter', x: b.bounds.x + 4, y: b.bounds.y + 3, r: 0, color: '#4a2f1c', buildingId: b.id });
    for (let sx = 0; sx < 3; sx++) {
      add({ id: `din_st_${sx}`, type: 'stool', x: b.bounds.x + 4 + sx, y: b.bounds.y + 4, r: 0, color: '#35e0ff', buildingId: b.id });
    }
    // Espresso Machine & Jukebox
    add({ id: 'din_espresso', type: 'espresso', x: b.bounds.x + 8, y: b.bounds.y + 2, r: 0, color: '#d35400', buildingId: b.id });
    add({ id: 'din_juke', type: 'jukebox', x: b.bounds.x + 15, y: b.bounds.y + 2, r: 0, color: '#35e0ff', buildingId: b.id });
    // Dining booths along the back & side
    add({ id: 'din_booth1', type: 'booth', x: b.bounds.x + 2, y: b.bounds.y + 8, r: 0, color: '#e74c3c', buildingId: b.id });
    add({ id: 'din_booth2', type: 'booth', x: b.bounds.x + 6, y: b.bounds.y + 8, r: 0, color: '#e74c3c', buildingId: b.id });
    add({ id: 'din_booth3', type: 'booth', x: b.bounds.x + 10, y: b.bounds.y + 8, r: 0, color: '#e74c3c', buildingId: b.id });
    // Vending machine
    add({ id: 'din_vend', type: 'vending', x: b.bounds.x + 15, y: b.bounds.y + 6, r: 3, color: '#ff4d6d', buildingId: b.id });
    add({ id: 'din_plant', type: 'plant', x: b.bounds.x + 15, y: b.bounds.y + 11, r: 0, buildingId: b.id });
  }

  // 3. POPULATE NIGHT OWL MART / BODEGA
  {
    const b = DISTRICT_BUILDINGS[2];
    // Checkout register
    add({ id: 'bod_reg', type: 'register', x: b.bounds.x + 3, y: b.bounds.y + 3, r: 0, color: '#34495e', buildingId: b.id });
    // Beverage Coolers against north wall
    add({ id: 'bod_cool1', type: 'cooler', x: b.bounds.x + 7, y: b.bounds.y + 1, r: 0, color: '#2980b9', buildingId: b.id });
    add({ id: 'bod_cool2', type: 'cooler', x: b.bounds.x + 10, y: b.bounds.y + 1, r: 0, color: '#27ae60', buildingId: b.id });
    // Snack Shelves in aisles
    add({ id: 'bod_sh1', type: 'shelf', x: b.bounds.x + 7, y: b.bounds.y + 5, r: 0, color: '#f39c12', buildingId: b.id });
    add({ id: 'bod_sh2', type: 'shelf', x: b.bounds.x + 7, y: b.bounds.y + 8, r: 0, color: '#e67e22', buildingId: b.id });
    add({ id: 'bod_sh3', type: 'shelf', x: b.bounds.x + 12, y: b.bounds.y + 5, r: 0, color: '#9b59b6', buildingId: b.id });
    // Gacha machine
    add({ id: 'bod_gacha', type: 'gacha', x: b.bounds.x + 3, y: b.bounds.y + 8, r: 0, color: '#ff4d6d', buildingId: b.id });
  }

  // 4. POPULATE SKYLINE MICRO-LOFTS
  {
    const b = DISTRICT_BUILDINGS[3];
    // Unit 101: Player Loft (NW corner of lofts building)
    add({ id: 'loft_bed1', type: 'bed', x: b.bounds.x + 2, y: b.bounds.y + 2, r: 0, color: '#4a69bd', buildingId: b.id });
    add({ id: 'loft_desk1', type: 'desk', x: b.bounds.x + 5, y: b.bounds.y + 2, r: 0, color: '#1e272e', buildingId: b.id });
    add({ id: 'loft_ward1', type: 'wardrobe', x: b.bounds.x + 8, y: b.bounds.y + 2, r: 0, color: '#3c6382', buildingId: b.id });
    add({ id: 'loft_couch1', type: 'couch', x: b.bounds.x + 3, y: b.bounds.y + 7, r: 2, color: '#eb2f06', buildingId: b.id });
    add({ id: 'loft_rug1', type: 'rug', x: b.bounds.x + 3, y: b.bounds.y + 9, r: 0, color: '#6a89cc', buildingId: b.id });
    add({ id: 'loft_diorama', type: 'diorama_table', x: b.bounds.x + 1, y: b.bounds.y + 5, r: 0, color: '#38ada9', buildingId: b.id });

    // Unit 102: Resident Loft (NE corner)
    add({ id: 'loft_bed2', type: 'bed', x: b.bounds.x + 14, y: b.bounds.y + 2, r: 0, color: '#78e08f', buildingId: b.id });
    add({ id: 'loft_desk2', type: 'desk', x: b.bounds.x + 17, y: b.bounds.y + 2, r: 0, color: '#1e272e', buildingId: b.id });
    add({ id: 'loft_ward2', type: 'wardrobe', x: b.bounds.x + 19, y: b.bounds.y + 5, r: 3, color: '#38ada9', buildingId: b.id });

    // Unit 103: Resident Studio (South sector)
    add({ id: 'loft_bed3', type: 'bed', x: b.bounds.x + 2, y: b.bounds.y + 13, r: 2, color: '#e55039', buildingId: b.id });
    add({ id: 'loft_desk3', type: 'desk', x: b.bounds.x + 6, y: b.bounds.y + 14, r: 2, color: '#1e272e', buildingId: b.id });
    add({ id: 'loft_plant', type: 'plant', x: b.bounds.x + 18, y: b.bounds.y + 13, r: 0, buildingId: b.id });
  }

  // 5. POPULATE SUBSPACE ALLEY / BACKROOMS
  {
    const b = DISTRICT_BUILDINGS[4];
    // Recycling bins / dumpsters
    add({ id: 'back_bin1', type: 'bin', x: b.bounds.x + 2, y: b.bounds.y + 4, r: 0, color: '#2c3e50', buildingId: b.id });
    add({ id: 'back_bin2', type: 'bin', x: b.bounds.x + 2, y: b.bounds.y + 6, r: 0, color: '#27ae60', buildingId: b.id });
    // Glitched Terminal
    add({ id: 'back_term', type: 'terminal', x: b.bounds.x + 4, y: b.bounds.y + 12, r: 0, color: '#33ff88', buildingId: b.id });
    // Subspace Rift
    add({ id: 'back_rift', type: 'portal', x: b.bounds.x + 4, y: b.bounds.y + 28, r: 0, color: '#8a5cff', buildingId: b.id });
  }

  // 6. POPULATE OUTDOOR STREETS & CENTRAL PROMENADE
  {
    // Streetlamps along the main promenade
    const lamps = [
      [7, 19], [17, 19], [34, 18], [44, 18],
      [27, 8], [27, 33], [48, 8], [48, 30]
    ];
    lamps.forEach(([lx, ly], i) => {
      add({ id: `st_lamp_${i}`, type: 'streetlight', x: lx, y: ly, r: 0, color: '#ffd166' });
    });

    // Park benches along sidewalks
    add({ id: 'st_bench_1', type: 'bench', x: 20, y: 20, r: 0, color: '#4a5568' });
    add({ id: 'st_bench_2', type: 'bench', x: 32, y: 19, r: 2, color: '#4a5568' });
    add({ id: 'st_bench_3', type: 'bench', x: 42, y: 19, r: 2, color: '#4a5568' });

    // Miami Neon Palm Trees
    add({ id: 'st_palm_1', type: 'palm_tree', x: 2, y: 18, r: 0 });
    add({ id: 'st_palm_2', type: 'palm_tree', x: 23, y: 18, r: 0 });
    add({ id: 'st_palm_3', type: 'palm_tree', x: 28, y: 15, r: 0 });
    add({ id: 'st_palm_4', type: 'palm_tree', x: 28, y: 24, r: 0 });
    add({ id: 'st_palm_5', type: 'palm_tree', x: 48, y: 24, r: 0 });
    add({ id: 'st_palm_6', type: 'palm_tree', x: 48, y: 35, r: 0 });

    // 1980s Miami Vice Supercar (White Wedge Coupe with pop-up headlights)
    add({ id: 'st_car_1', type: 'retro_car', x: 26, y: 10, r: 0, color: '#f5f6fa' });

    // Trees & Planters
    add({ id: 'st_tree_1', type: 'tree', x: 2, y: 20, r: 0 });
    add({ id: 'st_tree_2', type: 'tree', x: 25, y: 2, r: 0 });
    add({ id: 'st_tree_3', type: 'tree', x: 25, y: 40, r: 0 });
    add({ id: 'st_tree_4', type: 'tree', x: 48, y: 40, r: 0 });

    // Fire hydrants
    add({ id: 'st_hydrant_1', type: 'hydrant', x: 26, y: 16, r: 0, color: '#e74c3c' });
    add({ id: 'st_hydrant_2', type: 'hydrant', x: 48, y: 16, r: 0, color: '#e74c3c' });
  }

  return {
    id: `district-${seed}`,
    name: 'The Twilight District',
    w,
    h,
    spawn,
    seed,
    buildings: DISTRICT_BUILDINGS,
    props
  };
}
