// Avatars are just JSON loadouts. The renderer turns a loadout into a mesh; a server only ever stores/sends this JSON.
export const OPTIONS = {
  skin:   ['#f5d0b0', '#e8b48a', '#c98a5e', '#a5673f', '#7a4a2c', '#4f2f1c'],
  hair:   ['short', 'long', 'bun', 'mohawk', 'cap', 'afro', 'none'],
  hairColor: ['#201814', '#5a3a22', '#b5793a', '#e6c27a', '#d1495b', '#4d7cff', '#8a5cff', '#e9e9ee'],
  top:    ['tee', 'hoodie', 'jacket'],
  topColor: ['#ff4d6d', '#35e0c9', '#ffd166', '#7a6bff', '#ff8a3d', '#4dd0ff', '#e9e9ee', '#2b2f44'],
  bottom: ['jeans', 'shorts', 'skirt'],
  bottomColor: ['#2f4a8a', '#2b2f44', '#6b4f3a', '#3a3a3a', '#7a2f5a', '#d9d2c3'],
  shoes:  ['#f2f2f2', '#d1495b', '#222222', '#ffd166'],
  accessory: ['none', 'glasses', 'shades', 'headphones', 'halo', 'crown'],
  body:   ['slim', 'regular', 'broad'],
};
export const EMOTES = ['wave', 'dance', 'cheer', 'think'];
const pick = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
export function randomLoadout(rng = Math.random) {
  const l = {}; for (const k of Object.keys(OPTIONS)) l[k] = pick(rng, OPTIONS[k]); return l;
}
// Anything arriving from storage / a network peer is clamped to known values.
export function sanitize(l = {}) {
  const out = {};
  for (const k of Object.keys(OPTIONS)) out[k] = OPTIONS[k].includes(l[k]) ? l[k] : OPTIONS[k][0];
  return out;
}
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
