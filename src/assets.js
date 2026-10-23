// glTF model pipeline. buildProp() still returns the procedural prop instantly (the placeholder);
// if assets/models/manifest.json has an entry for that prop, the .glb loads in the background and replaces it.
// Missing manifest / missing file / bad model => the procedural prop simply stays. Nothing here can break the room.
// Disable with ?models=0. Debug: window.G.assets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pickEntry, fitPlan } from './fit.js';

const BASE = 'assets/models/';
export const status = { loaded: [], failed: [], manifest: false };
const cache = new Map(), loader = new GLTFLoader();
let manifest = {};

const ready = (async () => {
  if (new URLSearchParams(location.search).get('models') === '0') return;
  try { const r = await fetch(BASE + 'manifest.json', { cache: 'no-cache' }); if (r.ok) { manifest = (await r.json()).models || {}; status.manifest = true; } } catch (e) { /* no manifest: fine */ }
})();

function load(file) {
  if (!cache.has(file)) cache.set(file, loader.loadAsync(BASE + file).then(g => g.scene));
  return cache.get(file);
}

// hooks.screenTex(color, kind) -> animated CanvasTexture (supplied by props3d so this file stays decoupled)
export async function upgradeProp(r, g, hooks = {}) {
  await ready;
  const e = pickEntry(manifest, r); if (!e) return;
  try {
    const model = (await load(e.file)).clone(true);
    const inner = new THREE.Group(); inner.add(model); inner.rotation.y = THREE.MathUtils.degToRad(e.rotY || 0);
    const holder = new THREE.Group(); holder.add(inner); holder.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(holder);
    const plan = fitPlan(bb.min.toArray(), bb.max.toArray(), e, r.T);
    holder.scale.setScalar(plan.scale); holder.position.fromArray(plan.pos);

    const own = new Map();   // materials cloned per instance so tints don't leak between props
    const mine = m => { if (!own.has(m)) own.set(m, m.clone()); return own.get(m); };
    let spin = null;
    model.traverse(o => {
      if (e.spin && o.name === e.spin) spin = o;
      if (!o.isMesh) return;
      o.userData.propId = r.id; o.castShadow = !r.T.flat; o.receiveShadow = true;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => {
        let c = m;
        for (const t of e.tint || []) if (m.name === t.material && r.color) { c = mine(m); c.color.set(r.color).multiplyScalar(t.scale ?? 1); if (t.emissive) { c.emissive.set(r.color); c.emissiveIntensity = t.emissive; } }
        // screen: glTF UVs have v down, so the canvas texture must not be flipped (flipY = false below)
        if (e.screen && m.name === e.screen && hooks.screenTex) { c = mine(m); c.map = hooks.screenTex(r.color || '#4dd0ff', r.game === 'ludo' ? 'ludo' : 'arcade'); c.map.flipY = false; c.emissiveMap = c.map; c.emissive.set(0xffffff); c.emissiveIntensity = 1.9; c.needsUpdate = true; }
        if (e.emissive && e.emissive[m.name] != null) { c = mine(c); if (!c.emissiveMap && c.emissive.getHex() === 0) c.emissive.copy(c.color); c.emissiveIntensity = e.emissive[m.name]; }
        return c;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });

    for (const ch of [...g.children]) if (!ch.userData.keep) { g.remove(ch); ch.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }   // keep glow pools etc.
    holder.userData.model = true; g.add(holder);
    if (spin) g.userData.jukebox = spin; else if (e.spin !== undefined || g.userData.jukebox) delete g.userData.jukebox;
    status.loaded.push(r.id);
  } catch (err) { status.failed.push(r.id + ' (' + e.file + ')'); console.info('[assets] kept procedural', r.id, '-', e.file, err && err.message || err); }
}
