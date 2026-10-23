// Avatar = loadout JSON -> low-poly stylised figure built from primitives, posed procedurally.
// Skeleton contract (what a future glTF avatar would also expose): root > hips > {torso>{head,armL,armR}, legL, legR}.
import * as THREE from 'three';
import { mat } from './props3d.js';

const BODY = { slim: 0.88, regular: 1, broad: 1.14 };
function add(parent, geo, m, x = 0, y = 0, z = 0) { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; }

export function buildAvatar(lo) {
  const root = new THREE.Group(), w = BODY[lo.body] || 1;
  const skin = mat(lo.skin, { r: 0.7 }), top = mat(lo.topColor, { r: 0.75 }), bot = mat(lo.bottomColor, { r: 0.8 }), shoe = mat(lo.shoes, { r: 0.5 }), hair = mat(lo.hairColor, { r: 0.6 });
  const hips = new THREE.Group(); hips.position.y = 0.44; root.add(hips);

  const legs = [-1, 1].map(s => {
    const leg = new THREE.Group(); leg.position.set(s * 0.1 * w, 0, 0); hips.add(leg);
    const full = lo.bottom === 'jeans';
    add(leg, new THREE.CylinderGeometry(0.075 * w, 0.065 * w, 0.4, 12), bot, 0, -0.2, 0).scale.y = full ? 1 : 0.55;
    if (!full) { const m = add(leg, new THREE.CylinderGeometry(0.06, 0.055, 0.22, 10), skin, 0, -0.27, 0); m.scale.y = lo.bottom === 'skirt' ? 1.4 : 1; }
    add(leg, new THREE.BoxGeometry(0.13, 0.08, 0.2), shoe, 0, -0.4, 0.04);
    return leg;
  });
  if (lo.bottom === 'skirt') add(hips, new THREE.CylinderGeometry(0.13 * w, 0.24 * w, 0.2, 16), bot, 0, -0.06, 0);

  const torso = new THREE.Group(); torso.position.y = 0.0; hips.add(torso);
  add(torso, new THREE.CylinderGeometry(0.19 * w, 0.17 * w, 0.46, 16), top, 0, 0.23, 0);
  add(torso, new THREE.CylinderGeometry(0.17 * w, 0.17 * w, 0.06, 16), bot, 0, 0.02, 0);
  if (lo.top === 'hoodie') { const h = add(torso, new THREE.TorusGeometry(0.11, 0.04, 8, 16), top, 0, 0.5, -0.03); h.rotation.x = Math.PI / 2; add(torso, new THREE.BoxGeometry(0.2, 0.1, 0.02), mat(lo.topColor, { r: 0.9 }), 0, 0.12, 0.17 * w); }
  if (lo.top === 'jacket') { add(torso, new THREE.BoxGeometry(0.035, 0.44, 0.02), mat('#f4f4f4', { r: 0.6 }), 0, 0.24, 0.185 * w); add(torso, new THREE.BoxGeometry(0.4 * w, 0.05, 0.36 * w), mat('#f4f4f4', { r: 0.6 }), 0, 0.0, 0).scale.set(1, 0.5, 1); }

  const arms = [-1, 1].map(s => {
    const arm = new THREE.Group(); arm.position.set(s * 0.235 * w, 0.43, 0); torso.add(arm);
    const longSleeve = lo.top !== 'tee';
    add(arm, new THREE.CylinderGeometry(0.058, 0.052, 0.34, 10), longSleeve ? top : top, 0, -0.14, 0).scale.y = longSleeve ? 1 : 0.55;
    if (!longSleeve) add(arm, new THREE.CylinderGeometry(0.045, 0.04, 0.17, 10), skin, 0, -0.27, 0);
    add(arm, new THREE.SphereGeometry(0.052, 10, 8), skin, 0, -0.33, 0);
    return arm;
  });

  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  add(head, new THREE.SphereGeometry(0.19, 24, 18), skin, 0, 0.16, 0);
  const eye = mat('#16131f', { r: 0.3 });
  [-0.07, 0.07].forEach(x => add(head, new THREE.SphereGeometry(0.022, 8, 6), eye, x, 0.18, 0.17));
  add(head, new THREE.BoxGeometry(0.06, 0.014, 0.01), mat('#7a3b3b'), 0, 0.1, 0.18);
  const cap = (r = 0.205) => add(head, new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.17, -0.005);
  switch (lo.hair) {
    case 'short': cap(); break;
    case 'long': cap(); add(head, new THREE.BoxGeometry(0.36, 0.32, 0.12), hair, 0, 0.0, -0.13); break;
    case 'bun': cap(); add(head, new THREE.SphereGeometry(0.08, 12, 10), hair, 0, 0.4, -0.05); break;
    case 'mohawk': add(head, new THREE.BoxGeometry(0.06, 0.12, 0.3), hair, 0, 0.36, -0.02); break;
    case 'cap': cap(0.21); add(head, new THREE.BoxGeometry(0.28, 0.025, 0.18), hair, 0, 0.22, 0.2); break;
    case 'afro': add(head, new THREE.SphereGeometry(0.27, 16, 12), hair, 0, 0.24, -0.04); break;
  }
  if (lo.accessory === 'glasses') { [-0.07, 0.07].forEach(x => { const t = add(head, new THREE.TorusGeometry(0.045, 0.01, 6, 14), mat('#222', { m: 0.5 }), x, 0.18, 0.18); void t; }); }
  if (lo.accessory === 'shades') add(head, new THREE.BoxGeometry(0.3, 0.07, 0.05), mat('#0a0a10', { r: 0.2 }), 0, 0.18, 0.18);
  if (lo.accessory === 'headphones') { const b = add(head, new THREE.TorusGeometry(0.21, 0.018, 6, 20, Math.PI), mat('#222', { m: 0.4 }), 0, 0.17, 0); b.rotation.z = 0; [-1, 1].forEach(s => { const c = add(head, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), mat('#ff4d6d', { e: '#ff4d6d', ei: 0.4 }), s * 0.21, 0.17, 0); c.rotation.z = Math.PI / 2; }); }
  if (lo.accessory === 'halo') { const h = add(head, new THREE.TorusGeometry(0.18, 0.018, 8, 24), mat('#ffd166', { e: '#ffd166', ei: 2.2 }), 0, 0.46, 0); h.rotation.x = Math.PI / 2; }
  if (lo.accessory === 'crown') { const cr = add(head, new THREE.CylinderGeometry(0.12, 0.09, 0.08, 5, 1, true), mat('#ffb84a', { m: 0.8, r: 0.3, e: '#ffb84a', ei: 0.9 }), 0, 0.42, 0); cr.rotation.y = 0.3; }

  root.userData = { hips, torso, head, legs, arms, ph: Math.random() * 6, jump: 0 };
  return root;
}

const lerp = (a, b, k) => a + (b - a) * k;
// Pose from simulation state. Pure function of (person, time): the renderer never decides anything.
export function pose(av, p, t, dt) {
  const u = av.userData, [lL, lR] = u.legs, [aL, aR] = u.arms, k = Math.min(1, dt * 12);
  let ll = 0, lr = 0, al = 0, ar = 0, alz = 0, arz = 0, hipY = 0, bob = 0, headX = 0, torsoY = 0, torsoX = 0;
  const e = p.emote && p.emote.name, et = p.emote ? (2.2 - p.emote.t) : 0;
  if (p.state === 'walk') { u.ph += dt * 9.5; const s = Math.sin(u.ph); ll = s * 0.75; lr = -s * 0.75; al = -s * 0.6; ar = s * 0.6; bob = Math.abs(Math.cos(u.ph)) * 0.05; }
  else if (p.state === 'sit') { ll = lr = -Math.PI / 2 + 0.1; al = ar = -0.5; hipY = p.seatH - 0.0; torsoX = 0.05; }
  else if (p.state === 'use') { al = -1.15 + Math.sin(t * 9 + u.ph) * 0.05; ar = -1.1 + Math.sin(t * 11 + u.ph) * 0.06; headX = -0.15; torsoX = 0.06; }
  else { bob = Math.sin(t * 2 + u.ph) * 0.008; al = Math.sin(t * 1.4 + u.ph) * 0.05; ar = -al; }
  if (e === 'wave') { arz = 2.7; ar = 0; arz += Math.sin(t * 12) * 0.35; }
  else if (e === 'cheer') { alz = -2.8; arz = 2.8; al = ar = 0; bob += Math.abs(Math.sin(et * 9)) * 0.16; }
  else if (e === 'dance') { al = Math.sin(t * 9) * 1.0 - 0.5; ar = -Math.sin(t * 9) * 1.0 - 0.5; alz = -0.5; arz = 0.5; bob += Math.abs(Math.sin(t * 9)) * 0.07; torsoY = Math.sin(t * 4.5) * 0.45; ll = Math.sin(t * 9) * 0.3; lr = -ll; }
  else if (e === 'think') { ar = -2.3; headX = 0.2; }
  const set = (o, a, b) => { o.rotation.x = lerp(o.rotation.x, a, k); o.rotation.z = lerp(o.rotation.z, b, k); };
  set(lL, ll, 0); set(lR, lr, 0); set(aL, al, alz); set(aR, ar, arz);
  u.hips.position.y = lerp(u.hips.position.y, 0.44 + hipY + bob, Math.min(1, dt * 18));
  u.head.rotation.x = lerp(u.head.rotation.x, headX, k); u.torso.rotation.y = lerp(u.torso.rotation.y, torsoY, k); u.torso.rotation.x = lerp(u.torso.rotation.x, torsoX, k);
}
