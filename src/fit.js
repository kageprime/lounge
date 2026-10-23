// Pure helpers for dropping arbitrary glTF models into the lounge. No Three.js, so they are unit tested.
// Contract for a prop model: centred on its footprint, floor at y=0, FRONT facing +z. Real-world models
// come in any scale/orientation, so each manifest entry says how to correct them and this works out the rest.

// Pick the manifest entry for a placed prop. Most specific wins: "type:id" (one instance) then "type".
// An entry may list several `files`; one is chosen deterministically from the prop id (variety without randomness).
export function pickEntry(manifest, r) {
  const e = manifest && (manifest[`${r.type}:${r.id}`] || manifest[r.type]);
  if (!e || e.enabled === false) return null;
  const files = e.files && e.files.length ? e.files : e.file ? [e.file] : null;
  if (!files) return null;
  // variant: the number at the end of the id (cab0, cab1, cab2 ... cycle through the files, so neighbours differ); else a hash
  const num = /(\d+)$/.exec(String(r.id)); let h = 0; for (const ch of String(r.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...e, file: files[(num ? +num[1] : h) % files.length] };
}

// Given a model's bounding box (after any rotY correction), return uniform scale + position so it sits on the
// floor, centred on x/z. Scale precedence: explicit `scale`; else `height` (still clamped to the footprint
// unless `clamp:false`); else fit the footprint (T.w x T.d tiles, with a small margin).
// `anchor:"back"` puts the model's back (min z) flush with the back edge of its tile (or at the wall surface for wall props)
// instead of centring it, so deep models (cabinets with a control panel) don't poke into the wall.
export function fitPlan(min, max, e = {}, T = { w: 1, d: 1 }) {
  const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
  const margin = e.margin ?? 0.92;
  const foot = Math.min(sx > 1e-6 ? T.w * margin / sx : Infinity, sz > 1e-6 ? T.d * margin / sz : Infinity);
  let s;
  if (e.scale != null) s = e.scale;
  else if (e.height && sy > 1e-6) { s = e.height / sy; if (e.clamp !== false) s = Math.min(s, foot); }
  else s = Number.isFinite(foot) ? foot : 1;
  const o = e.offset || [0, 0, 0];
  const pz = e.anchor === 'back' ? (T.wall ? 0 : -T.d / 2) - min[2] * s : -(min[2] + max[2]) / 2 * s;
  return { scale: s, pos: [-(min[0] + max[0]) / 2 * s + o[0], -min[1] * s + o[1], pz + o[2]] };
}
