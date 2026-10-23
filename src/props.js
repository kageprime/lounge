// Prop registry: pure data. A prop TYPE says how big it is, which tiles are usable and what using it does.
// Local frame: the prop "faces" +y (south). Footprint tiles are (0..w-1, 0..d-1); a use tile at oy>=d is in front.
// A placed prop has a rotation r (0..3, quarter turns). Actions are what the game layer reacts to:
//   sit    -> avatar sits (seatH raises them)           play -> opens a game / activity (payload says which)
//   music  -> jukebox menu                              emote -> one-shot animation
export const PROPS = {
  cabinet:   { w: 1, d: 1, label: 'Arcade cabinet', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'play' }] },
  claw:      { w: 1, d: 1, label: 'Claw machine',   uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'play' }] },
  ludotable: { w: 2, d: 2, label: 'Ludo table',     uses: [
      { ox: 0, oy: 2, mode: 'stand', face: 'toward', action: 'play' }, { ox: 1, oy: 2, mode: 'stand', face: 'toward', action: 'play' },
      { ox: -1, oy: 0, mode: 'stand', face: 'toward', action: 'play' }, { ox: 2, oy: 1, mode: 'stand', face: 'toward', action: 'play' } ] },
  pool:      { w: 4, d: 2, label: 'Pool table',     uses: [
      { ox: 1, oy: 2, mode: 'stand', face: 'toward', action: 'play' }, { ox: 2, oy: 2, mode: 'stand', face: 'toward', action: 'play' },
      { ox: 1, oy: -1, mode: 'stand', face: 'toward', action: 'play' }, { ox: 2, oy: -1, mode: 'stand', face: 'toward', action: 'play' } ] },
  bar:       { w: 5, d: 1, label: 'Bar', uses: [] },
  stool:     { w: 1, d: 1, label: 'Bar stool',      seatTile: true, uses: [{ ox: 0, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.26 }] },
  couch:     { w: 3, d: 1, label: 'Couch',          seatTile: true, uses: [{ ox: 0, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.04 }, { ox: 1, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.04 }, { ox: 2, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.04 }] },
  jukebox:   { w: 1, d: 1, label: 'Jukebox',        uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'music' }] },
  plant:     { w: 1, d: 1, label: 'Plant', uses: [] },
  table:     { w: 1, d: 1, label: 'Table', uses: [] },
  rug:       { w: 4, d: 3, label: 'Rug', uses: [], flat: true },       // flat = drawn on the floor, never blocks
  vending:   { w: 1, d: 1, label: 'Snack machine', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'emote' }] },
  poster:    { w: 1, d: 1, label: 'Poster', uses: [], wall: true },
  sconce:    { w: 1, d: 1, label: 'Wall lamp', uses: [], wall: true },
  neon:      { w: 1, d: 1, label: 'Neon sign', uses: [], wall: true },  // wall decor: no footprint
  terminal:  { w: 1, d: 1, label: 'Subspace Terminal', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'terminal' }] },
  portal:    { w: 1, d: 1, label: 'Subspace Rift',     uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'terminal' }] },
  // Diner & Boba
  booth:         { w: 2, d: 2, label: 'Diner booth', seatTile: true, uses: [{ ox: 0, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.12 }, { ox: 1, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.12 }] },
  diner_counter: { w: 3, d: 1, label: 'Diner counter', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'food' }, { ox: 1, oy: 1, mode: 'stand', face: 'toward', action: 'food' }, { ox: 2, oy: 1, mode: 'stand', face: 'toward', action: 'food' }] },
  espresso:      { w: 1, d: 1, label: 'Espresso Bar', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'drink' }] },
  // Bodega & Mart
  shelf:    { w: 2, d: 1, label: 'Snack shelf', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'food' }, { ox: 1, oy: 1, mode: 'stand', face: 'toward', action: 'food' }] },
  cooler:   { w: 2, d: 1, label: 'Beverage cooler', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'drink' }, { ox: 1, oy: 1, mode: 'stand', face: 'toward', action: 'drink' }] },
  register: { w: 1, d: 1, label: 'Checkout register', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'shop' }] },
  gacha:    { w: 1, d: 1, label: 'Gacha capsule machine', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'play' }] },
  // Lofts & Apartments
  bed:      { w: 2, d: 2, label: 'Loft bed', seatTile: true, uses: [{ ox: 0, oy: 0, mode: 'sit', face: 'front', action: 'sleep', seatH: 0.1 }, { ox: 1, oy: 0, mode: 'sit', face: 'front', action: 'sleep', seatH: 0.1 }] },
  desk:     { w: 2, d: 1, label: 'Cyber desk', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'pc' }, { ox: 1, oy: 1, mode: 'stand', face: 'toward', action: 'pc' }] },
  wardrobe: { w: 1, d: 1, label: 'Wardrobe closet', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'dress' }] },
  mirror:   { w: 1, d: 1, label: 'Wardrobe Mirror', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'dress' }] },
  diorama_table: { w: 2, d: 1, label: 'Lunar Diorama Console', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'moonbase' }, { ox: 1, oy: 1, mode: 'stand', face: 'toward', action: 'moonbase' }] },
  // Street & Outdoors
  bench:       { w: 2, d: 1, label: 'Park bench', seatTile: true, uses: [{ ox: 0, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.08 }, { ox: 1, oy: 0, mode: 'sit', face: 'front', action: 'sit', seatH: 0.08 }] },
  streetlight: { w: 1, d: 1, label: 'Street lamp', uses: [] },
  hydrant:     { w: 1, d: 1, label: 'Fire hydrant', uses: [] },
  bin:         { w: 1, d: 1, label: 'Recycle bin', uses: [{ ox: 0, oy: 1, mode: 'stand', face: 'toward', action: 'scavenge' }] },
  tree:        { w: 1, d: 1, label: 'Street tree', uses: [] },
  palm_tree:   { w: 1, d: 1, label: 'Miami Palm Tree', uses: [] },
  retro_car:   { w: 3, d: 2, label: 'Vice Supercar', uses: [{ ox: 0, oy: 2, mode: 'stand', face: 'toward', action: 'admire' }, { ox: 2, oy: 2, mode: 'stand', face: 'toward', action: 'admire' }] },
  wall_seg:    { w: 1, d: 1, label: 'Wall segment', uses: [] },
  door_frame:  { w: 1, d: 1, label: 'Door frame', uses: [], flat: true },
};

// Rotate a local tile offset by r quarter-turns: (x,y) -> (-y, x). Facing +y becomes -x, +x, -y ... for r=1,2,3.
export function rotOff(x, y, r) { for (let k = 0; k < (r & 3); k++) [x, y] = [-y, x]; return [x, y]; }
export const FACE = [[0, 1], [-1, 0], [0, -1], [1, 0]];   // facing vector of a prop for r=0..3

// Resolve a placed prop {type,x,y,r} into world tiles. (x,y) is the min corner of the rotated footprint.
export function resolve(p) {
  const T = PROPS[p.type], r = p.r | 0;
  const fp = [];
  for (let ly = 0; ly < T.d; ly++) for (let lx = 0; lx < T.w; lx++) fp.push(rotOff(lx, ly, r));
  const uses = T.uses.map((u, i) => ({ ...u, i, off: rotOff(u.ox, u.oy, r) }));
  const all = fp.concat(uses.map(u => u.off));
  const minx = Math.min(...fp.map(t => t[0])), miny = Math.min(...fp.map(t => t[1]));
  void all;
  const ax = p.x - minx, ay = p.y - miny;          // add to a local offset to get world tile
  const foot = T.wall ? [] : fp.map(t => ({ x: t[0] + ax, y: t[1] + ay }));
  const wu = uses.map(u => {
    const tx = u.off[0] + ax, ty = u.off[1] + ay, f = FACE[r & 3];
    const face = u.face === 'toward' ? [-f[0], -f[1]] : f;
    return { id: `${p.id}#${u.i}`, prop: p.id, mode: u.mode, action: u.action, seatH: u.seatH || 0, tile: { x: tx, y: ty }, face: Math.atan2(face[0], face[1]) };
  });
  // centre of the footprint in world tile coords (for the renderer)
  const cx = foot.length ? foot.reduce((a, t) => a + t.x + 0.5, 0) / foot.length : p.x + 0.5;
  const cy = foot.length ? foot.reduce((a, t) => a + t.y + 0.5, 0) / foot.length : p.y + 0.5;
  return { ...p, T, foot, uses: wu, cx, cy };
}
