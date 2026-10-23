// Procedural 3D props. One builder per prop type; everything is authored in the prop's local frame:
// centred on its footprint, floor at y=0, FRONT facing +z. The stage rotates/places the group.
// To use real glTF models later, register a loader here that returns a Group with the same contract.
import * as THREE from 'three';
import { upgradeProp } from './assets.js';

const mats = new Map();
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.6, metalness: o.m ?? 0, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.a, opacity: o.a ?? 1 }));
  return mats.get(k);
}
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f);
function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y + h / 2, z); me.castShadow = me.receiveShadow = true; parent && parent.add(me); return me;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, parent, seg = 20) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); me.position.set(x, y + h / 2, z); me.castShadow = me.receiveShadow = true; parent && parent.add(me); return me;
}
function sph(r, m, x, y, z, parent) { const me = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); me.position.set(x, y, z); me.castShadow = true; parent && parent.add(me); return me; }

function canvasTex(w, h, draw, nearest = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.userData = { c, g }; return t;
}
function textTex(text, color, bg, w = 256, h = 64, glow = false) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.font = `800 ${Math.floor(h * 0.62)}px Inter, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = color; g.shadowBlur = 14; }
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2); if (glow) { g.fillText(text, w / 2, h / 2 + 2); }
  });
}

const animated = [];   // screens redrawn at low frame-rate by tick()
const holoMeshes = [];
function screenTex(color, kind) {
  const S = 48;
  const tex = canvasTex(S, S, () => {}, true); tex.userData.kind = kind; tex.userData.color = color; tex.userData.seed = Math.random() * 100; animated.push(tex);
  drawScreen(tex, 0); return tex;
}
function drawScreen(tex, t) {
  const { g } = tex.userData, S = 48, col = tex.userData.color, kind = tex.userData.kind; g.fillStyle = '#05060f'; g.fillRect(0, 0, S, S);
  if (kind === 'ludo') {   // mini Ludo board
    const q = ['#e0493a', '#35b25a', '#f2c230', '#3a74e0'];
    g.fillStyle = '#f4efe2'; g.fillRect(4, 4, 40, 40);
    [[4, 4], [28, 4], [28, 28], [4, 28]].forEach((p, i) => { g.fillStyle = q[i]; g.fillRect(p[0], p[1], 16, 16); g.fillStyle = '#f4efe2'; g.fillRect(p[0] + 4, p[1] + 4, 8, 8); });
    g.fillStyle = '#fff'; g.fillRect(20, 4, 8, 40); g.fillRect(4, 20, 40, 8);
    const k = Math.floor(t * 2) % 4; g.fillStyle = q[k]; g.fillRect(21, 8 + k * 8, 6, 6); g.fillStyle = '#111'; g.fillRect(22, 9 + k * 8, 2, 2);
    return;
  }
  if (kind === 'proto89') {
    g.fillStyle = '#041108'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(51, 255, 136, 0.12)';
    for (let y = 0; y < S; y += 2) g.fillRect(0, y, S, 1);
    const glitch = Math.sin(t * 14 + tex.userData.seed) > 0.75;
    g.fillStyle = glitch ? '#ff3366' : '#33ff88';
    g.font = '700 7px monospace';
    g.fillText('>1989', 4 + (glitch ? 2 : 0), 14);
    g.fillText('ANOMALY', 4, 23);
    g.beginPath();
    for (let x = 4; x < 44; x++) {
      const y = 35 + Math.sin(x * 0.45 + t * 9) * 4 * (glitch ? 1.6 : 1);
      if (x === 4) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = glitch ? '#ff3366' : '#33ff88';
    g.lineWidth = 1.5;
    g.stroke();
    return;
  }
  const r = (i) => { const x = Math.sin(i * 12.9898 + tex.userData.seed + Math.floor(t * 3) * 7.13) * 43758.5453; return x - Math.floor(x); };
  g.fillStyle = col; g.globalAlpha = 0.9;
  for (let i = 0; i < 26; i++) { const x = Math.floor(r(i) * 11) * 4, y = Math.floor(r(i + 40) * 11) * 4; g.fillRect(x, y, 4, 4); }
  g.globalAlpha = 1; g.fillStyle = '#fff'; const px = Math.floor((Math.sin(t * 1.7 + tex.userData.seed) * 0.5 + 0.5) * 38); g.fillRect(px, 40, 8, 3); g.fillRect(px + 3, 37, 2, 3);
}
export function tick(t) {
  for (const tex of animated) { drawScreen(tex, t); tex.needsUpdate = true; }
  for (const h of holoMeshes) {
    if (h.moon) h.moon.rotation.y = t * 0.8;
    if (h.ring) { h.ring.rotation.z = t * 1.2; h.ring.rotation.x = Math.PI / 3 + Math.sin(t * 0.9) * 0.15; }
  }
}
export function resetAnimated() { animated.length = 0; holoMeshes.length = 0; }

const B = {};
B.cabinet = (p, g) => {
  const c = p.color || '#4dd0ff', dark = mat(shade(c, 0.28), { r: 0.5 }), side = mat(c, { r: 0.45 });
  box(0.78, 0.12, 0.7, dark, 0, 0, 0, g);
  box(0.74, 0.9, 0.62, side, 0, 0.12, -0.02, g);                                     // lower body
  const cp = box(0.74, 0.1, 0.34, mat('#1b1d2e', { r: 0.4 }), 0, 0.88, 0.2, g); cp.rotation.x = 0.35;   // control panel
  sph(0.045, mat('#111'), -0.15, 1.0, 0.27, g); cyl(0.012, 0.012, 0.09, mat('#ddd', { m: 0.8, r: 0.3 }), -0.15, 0.98, 0.27, g);
  [['#ff4d6d', 0.08], ['#ffd166', 0.2], ['#35e0c9', 0.14]].forEach(([k, x], i) => { const b = cyl(0.035, 0.035, 0.03, mat(k, { e: k, ei: 0.5 }), x, 0.99, 0.25 + (i % 2) * 0.06, g); b.rotation.x = 0.35; });
  box(0.74, 0.8, 0.5, side, 0, 0.98, -0.12, g);                                      // upper body
  const scKind = p.game === 'ludo' ? 'ludo' : p.game === 'proto89' ? 'proto89' : 'arcade';
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.56), new THREE.MeshStandardMaterial({ map: screenTex(c, scKind), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, roughness: 0.3 }));
  sc.material.emissiveMap = sc.material.map; sc.material.emissiveIntensity = p.game === 'proto89' ? 2.4 : 1.9;
  sc.position.set(0, 1.4, 0.14); sc.rotation.x = -0.12; g.add(sc);
  const mqTitle = p.game === 'ludo' ? 'LUDO' : p.game === 'proto89' ? 'PROTO-89' : 'ARCADE';
  const mq = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.16), new THREE.MeshStandardMaterial({ map: textTex(mqTitle, p.game === 'proto89' ? '#33ff88' : '#fff', c, 192, 48, false), emissive: 0xffffff, emissiveIntensity: 0.9 }));
  mq.material.emissiveMap = mq.material.map; mq.position.set(0, 1.86, 0.2); g.add(mq);
  box(0.8, 0.08, 0.56, dark, 0, 1.78, -0.1, g);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.012, 0.75); glow.userData.keep = true; g.add(glow);
};
B.claw = (p, g) => {
  const c = p.color || '#ff6fb5', frame = mat(c, { r: 0.4 }), glass = mat('#bfe9ff', { a: 0.18, r: 0.1 });
  box(0.88, 0.5, 0.88, frame, 0, 0, 0, g);
  [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].forEach(([x, z]) => box(0.06, 1.35, 0.06, frame, x, 0.5, z, g));
  box(0.88, 0.14, 0.88, frame, 0, 1.85, 0, g);
  const gl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.32, 0.8), glass); gl.position.y = 1.16; g.add(gl);
  ['#ff6b6b', '#ffd166', '#6bcB77', '#4d96ff', '#c77dff', '#ff9f1c'].forEach((k, i) => sph(0.11, mat(k, { r: 0.9 }), -0.28 + (i % 3) * 0.28, 0.62 + Math.floor(i / 3) * 0.14, -0.2 + (i % 2) * 0.38, g));
  cyl(0.01, 0.01, 0.55, mat('#ccc', { m: 0.8 }), 0, 1.25, 0, g); const cl = cyl(0.07, 0.03, 0.1, mat('#ddd', { m: 0.7, r: 0.3 }), 0, 1.15, 0, g); void cl;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.12), new THREE.MeshStandardMaterial({ map: textTex('CLAW', '#fff', '#222', 160, 32), emissive: 0xffffff, emissiveIntensity: 0.6 })); lbl.material.emissiveMap = lbl.material.map; lbl.position.set(0, 1.9, 0.45); g.add(lbl);
  const cp = box(0.5, 0.06, 0.2, mat('#222'), 0, 0.5, 0.5, g); sph(0.04, mat('#ff4d6d', { e: '#ff4d6d', ei: 0.6 }), -0.1, 0.58, 0.5, g); void cp;
};
B.ludotable = (p, g) => {
  const wood = mat('#6b4a2e', { r: 0.55 });
  [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].forEach(([x, z]) => box(0.12, 0.62, 0.12, wood, x, 0, z, g));
  box(1.96, 0.1, 1.96, wood, 0, 0.62, 0, g);
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: screenTex('#fff', 'ludo'), roughness: 0.7 }));
  bd.material.map.magFilter = THREE.LinearFilter; bd.rotation.x = -Math.PI / 2; bd.position.y = 0.725; bd.receiveShadow = true; g.add(bd);
  const d = box(0.1, 0.1, 0.1, mat('#fff', { r: 0.3 }), 0.5, 0.73, 0.5, g); d.rotation.y = 0.5;
};
B.pool = (p, g) => {
  const wood = mat('#4a2c1a', { r: 0.5 }), felt = mat(p.color || '#1f6f4f', { r: 0.95 });
  [[-1.7, -0.7], [1.7, -0.7], [-1.7, 0.7], [1.7, 0.7]].forEach(([x, z]) => box(0.2, 0.72, 0.2, wood, x, 0, z, g));
  box(3.9, 0.16, 1.9, wood, 0, 0.72, 0, g); box(3.5, 0.04, 1.5, felt, 0, 0.88, 0, g);
  box(3.9, 0.1, 0.2, wood, 0, 0.88, 0.95 - 0.1, g); box(3.9, 0.1, 0.2, wood, 0, 0.88, -0.95 + 0.1, g); box(0.2, 0.1, 1.7, wood, 1.95 - 0.1, 0.88, 0, g); box(0.2, 0.1, 1.7, wood, -1.95 + 0.1, 0.88, 0, g);
  [[-1.72, -0.72], [1.72, -0.72], [-1.72, 0.72], [1.72, 0.72], [0, -0.74], [0, 0.74]].forEach(([x, z]) => cyl(0.1, 0.1, 0.02, mat('#050505'), x, 0.9, z, g));
  const cols = ['#ffd166', '#3a74e0', '#e0493a', '#7a4fd0', '#ff8a3d', '#35b25a', '#7a1f2a', '#111'];
  let k = 0; for (let r = 0; r < 4; r++) for (let j = 0; j <= r; j++) sph(0.05, mat(cols[k++ % 8], { r: 0.2 }), 0.9 + r * 0.09, 0.95, (j - r / 2) * 0.1, g);
  sph(0.05, mat('#f4f4f4', { r: 0.2 }), -0.9, 0.95, 0.05, g);
};
B.bar = (p, g) => {
  const body = mat(p.color || '#5a3a24', { r: 0.6 }), top = mat('#b8a07a', { r: 0.4 });
  box(5, 1.0, 0.8, body, 0, 0, 0.05, g); box(5.1, 0.08, 1.0, top, 0, 1.0, 0.0, g);
  box(4.8, 0.05, 0.05, mat('#35e0ff', { e: '#35e0ff', ei: 1.4 }), 0, 0.25, 0.46, g);
  const cs = ['#8fd694', '#d1495b', '#ffd166', '#7aa7ff', '#c77dff'];
  for (let i = 0; i < 12; i++) { const x = -2.1 + i * 0.38; cyl(0.05, 0.06, 0.26, mat(cs[i % 5], { a: 0.75, r: 0.2 }), x, 1.08, -0.2, g, 10); cyl(0.022, 0.03, 0.1, mat(cs[i % 5], { a: 0.75, r: 0.2 }), x, 1.34, -0.2, g, 10); }
  cyl(0.07, 0.05, 0.12, mat('#dff6ff', { a: 0.5, r: 0.1 }), -1.0, 1.08, 0.15, g, 12); cyl(0.07, 0.05, 0.12, mat('#dff6ff', { a: 0.5, r: 0.1 }), 0.5, 1.08, 0.1, g, 12);
};
B.stool = (p, g) => { const c = mat(p.color || '#c0392b', { r: 0.5 }), m = mat('#2b2b36', { m: 0.7, r: 0.3 }); cyl(0.2, 0.2, 0.1, c, 0, 0.52, 0, g); cyl(0.04, 0.04, 0.52, m, 0, 0, 0, g); cyl(0.2, 0.22, 0.04, m, 0, 0, 0, g); };
B.couch = (p, g) => {
  const c = mat(p.color || '#d1495b', { r: 0.85 }), d = mat(shade(p.color || '#d1495b', 0.8), { r: 0.85 });
  box(3, 0.22, 0.95, d, 0, 0.05, 0, g); box(3, 0.5, 0.26, c, 0, 0.2, -0.34, g); box(0.26, 0.4, 0.95, c, -1.37, 0.2, 0, g); box(0.26, 0.4, 0.95, c, 1.37, 0.2, 0, g);
  for (let i = 0; i < 3; i++) box(0.82, 0.14, 0.62, c, -0.9 + i * 0.9, 0.27, 0.1, g);
  [[-1.4, -0.4], [1.4, -0.4], [-1.4, 0.4], [1.4, 0.4]].forEach(([x, z]) => box(0.07, 0.07, 0.07, mat('#222'), x, 0, z, g));
};
B.jukebox = (p, g) => {
  const c = p.color || '#ffb84a', body = mat('#a8502d', { r: 0.4 }), glow = mat(c, { e: c, ei: 1.4 });
  box(0.8, 1.2, 0.6, body, 0, 0, 0, g);
  const arch = cyl(0.4, 0.4, 0.6, body, 0, 1.2, 0, g, 24); arch.rotation.x = Math.PI / 2; arch.position.y = 1.2; arch.scale.set(1, 1, 1);
  box(0.6, 0.55, 0.05, mat('#101018', { r: 0.2 }), 0, 0.55, 0.31, g);
  box(0.64, 0.06, 0.06, glow, 0, 0.5, 0.33, g); box(0.64, 0.06, 0.06, glow, 0, 1.12, 0.33, g);
  const dsc = cyl(0.26, 0.26, 0.02, mat('#111', { r: 0.3 }), 0, 0.58, 0.34, g, 28); dsc.rotation.x = Math.PI / 2; dsc.position.y = 0.82;
  box(0.18, 0.18, 0.06, glow, 0, 0.12, 0.32, g);
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, depthWrite: false })); hl.rotation.x = -Math.PI / 2; hl.position.set(0, 0.012, 0.7); hl.userData.keep = true; g.add(hl);
  g.userData.jukebox = dsc;
};
B.plant = (p, g) => { cyl(0.2, 0.15, 0.3, mat('#b5654a', { r: 0.8 }), 0, 0, 0, g); const l = mat('#3fa35b', { r: 0.8 }), l2 = mat('#2c8548', { r: 0.8 }); [[0, 0.6, 0, 0.26], [0.15, 0.85, 0.05, 0.2], [-0.13, 0.78, -0.08, 0.22], [0.02, 1.05, -0.02, 0.17]].forEach(([x, y, z, r], i) => sph(r, i % 2 ? l : l2, x, y, z, g)); };
// the two glasses are tagged keep: they stay on the table when a model replaces it
B.table = (p, g) => { const m = mat(p.color || '#2d2438', { r: 0.4 }); cyl(0.05, 0.04, 0.12, mat('#9fe8ff', { a: 0.6, r: 0.1 }), -0.12, 0.45, 0.05, g, 10).userData.keep = true; cyl(0.05, 0.04, 0.12, mat('#ffd9a0', { a: 0.6, r: 0.1 }), 0.14, 0.45, -0.04, g, 10).userData.keep = true; cyl(0.04, 0.04, 0.4, mat('#222', { m: 0.6 }), 0, 0, 0, g); cyl(0.36, 0.36, 0.05, m, 0, 0.4, 0, g, 28); cyl(0.22, 0.22, 0.03, mat('#222', { m: 0.6 }), 0, 0, 0, g); };
B.rug = (p, g) => {
  const w = p.T.w, d = p.T.d, c = p.color || '#5b2a86';
  const t = canvasTex(256, 192, (x, W, H) => { x.fillStyle = c; x.fillRect(0, 0, W, H); x.strokeStyle = '#ffd166'; x.lineWidth = 6; x.strokeRect(14, 14, W - 28, H - 28); x.strokeStyle = '#ffffff55'; x.lineWidth = 3; x.strokeRect(28, 28, W - 56, H - 56); x.fillStyle = '#ffd16655'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(W / 2, 46 + i * 0); x.arc(W / 2, H / 2, 70 - i * 12, 0, Math.PI * 2); x.stroke(); } });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, d - 0.1), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.receiveShadow = true; g.add(m);
};
B.vending = (p, g) => {
  const c = p.color || '#e0493a', body = mat(shade(c, 0.55), { r: 0.4 });
  box(0.86, 1.8, 0.7, body, 0, 0, 0, g);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.0), new THREE.MeshStandardMaterial({ map: canvasTex(64, 112, (x, W, H) => { x.fillStyle = '#10131f'; x.fillRect(0, 0, W, H); const cs = ['#ff6b6b', '#ffd166', '#6bcb77', '#4d96ff', '#c77dff']; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) { x.fillStyle = cs[(r * 3 + k) % 5]; x.fillRect(6 + k * 18, 6 + r * 21, 12, 14); } }), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 }));
  win.material.emissiveMap = win.material.map; win.position.set(-0.08, 1.05, 0.36); g.add(win);
  box(0.16, 0.7, 0.05, mat('#222'), 0.3, 0.8, 0.36, g); box(0.5, 0.18, 0.04, mat('#111'), -0.08, 0.2, 0.36, g);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshStandardMaterial({ map: textTex('SNACKS', '#fff', c, 160, 40), emissive: 0xffffff, emissiveIntensity: 0.8 })); top.material.emissiveMap = top.material.map; top.position.set(0, 1.7, 0.36); g.add(top);
};
B.poster = (p, g) => {
  const S = (p.style | 0) % 4, pal = [['#ff4d9a', '#7a6bff', 'INSERT COIN'], ['#35e0ff', '#2a2f7a', 'HIGH SCORE'], ['#ffd166', '#d1495b', 'PLAYER 1'], ['#6bcb77', '#1f4f6f', 'GAME ON']][S];
  const t = canvasTex(160, 224, (x, W, H) => {
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[1]); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.9)';
    if (S === 0) { x.beginPath(); x.arc(W / 2, 92, 46, 0, 7); x.fill(); x.fillStyle = pal[1]; for (let i = 0; i < 6; i++) x.fillRect(30, 70 + i * 12, 100, 4 + i); }
    if (S === 1) { for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) if ((r * 7 + k) % 3) x.fillRect(22 + k * 18, 40 + r * 18, 14, 12); }
    if (S === 2) { x.fillRect(70, 50, 20, 70); x.beginPath(); x.arc(80, 50, 22, 0, 7); x.fill(); x.fillStyle = pal[1]; x.fillRect(40, 130, 80, 10); }
    if (S === 3) { x.fillRect(30, 60, 100, 60); x.fillStyle = pal[1]; x.fillRect(40, 70, 80, 40); x.fillStyle = '#fff'; x.fillRect(60, 120, 40, 12); }
    x.fillStyle = '#fff'; x.font = '800 20px Inter, Arial'; x.textAlign = 'center'; x.fillText(pal[2], W / 2, 190);
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })); m.position.y = 1.5; g.add(m);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.18, 0.03), mat('#15121f')); fr.position.set(0, 1.5, -0.016); g.add(fr);
};
B.sconce = (p, g) => {
  const c = p.color || '#ffb84a'; box(0.14, 0.3, 0.08, mat('#1a1530'), 0, 1.7, 0.02, g);
  box(0.1, 0.24, 0.05, mat(c, { e: c, ei: 3 }), 0, 1.73, 0.08, g);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: radialTex(c), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })); gl.position.set(0, 1.85, 0.06); gl.userData.keep = true; g.add(gl);
};
export function radialTex(color) {
  return canvasTex(128, 128, (x, W) => { const gr = x.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2); gr.addColorStop(0, color); gr.addColorStop(0.35, color + '66'); gr.addColorStop(1, color + '00'); x.fillStyle = gr; x.fillRect(0, 0, W, W); });
}
B.neon = (p, g) => {
  const t = textTex(p.text || 'NEON', p.color || '#ff4d9a', 'rgba(0,0,0,0)', 512, 128, true);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: new THREE.Color(2.4, 2.4, 2.4) })); m.position.y = 2.15; g.add(m);
};

B.terminal = (p, g) => {
  const c = p.color || '#33ff88', body = mat('#1a1c26', { r: 0.5 });
  box(0.84, 0.78, 0.74, body, 0, 0, 0, g);
  const deck = box(0.8, 0.08, 0.32, mat('#11131c', { r: 0.3 }), 0, 0.74, 0.18, g);
  deck.rotation.x = 0.3;
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 6; k++) {
      box(0.08, 0.03, 0.06, mat('#2d3142', { r: 0.4 }), -0.25 + k * 0.1, 0.8 + r * 0.02, 0.1 + r * 0.08, g);
    }
  }
  box(0.76, 0.7, 0.42, body, 0, 0.82, -0.12, g);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.48), new THREE.MeshStandardMaterial({
    map: textTex('SUBSPACE // 1989', '#33ff88', '#051108', 256, 128, true),
    emissive: 0x33ff88,
    emissiveIntensity: 1.8,
    roughness: 0.2
  }));
  sc.position.set(0, 1.22, 0.1);
  sc.rotation.x = -0.15;
  g.add(sc);
  [-0.2, 0.2].forEach(x => {
    const reel = cyl(0.09, 0.09, 0.02, mat('#ddd', { m: 0.6, r: 0.2 }), x, 1.62, -0.06, g, 16);
    reel.rotation.x = Math.PI / 2;
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.15, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.012, 0.6); glow.userData.keep = true; g.add(glow);
};

B.portal = (p, g) => {
  const c = p.color || '#8a5cff';
  const pillarMat = mat('#14101e', { r: 0.3, m: 0.4 });
  box(0.18, 2.3, 0.18, pillarMat, -0.4, 0, 0, g);
  box(0.18, 2.3, 0.18, pillarMat, 0.4, 0, 0, g);
  box(0.98, 0.18, 0.18, pillarMat, 0, 2.22, 0, g);
  const rift = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 2.05), new THREE.MeshBasicMaterial({
    map: radialTex(c),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  rift.position.set(0, 1.15, 0);
  g.add(rift);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.015, 0); glow.userData.keep = true; g.add(glow);
};

// ---- Life Sim & District Builders ----
B.booth = (p, g) => {
  const c = p.color || '#e74c3c', vinyl = mat(c, { r: 0.5 }), chrome = mat('#ddd', { m: 0.8, r: 0.2 }), wood = mat('#2c1e14', { r: 0.6 });
  // Seat back 1 & seat back 2 (facing each other in 2x2 footprint)
  box(1.8, 0.9, 0.3, vinyl, 0, 0, -0.7, g);
  box(1.8, 0.42, 0.45, vinyl, 0, 0, -0.4, g);
  box(1.8, 0.9, 0.3, vinyl, 0, 0, 0.7, g);
  box(1.8, 0.42, 0.45, vinyl, 0, 0, 0.4, g);
  // Table in middle
  cyl(0.04, 0.04, 0.68, chrome, 0, 0, 0, g);
  box(1.6, 0.06, 0.65, wood, 0, 0.68, 0, g);
};

B.diner_counter = (p, g) => {
  const c = p.color || '#4a2f1c', body = mat(c, { r: 0.5 }), top = mat('#f5efe6', { r: 0.3 });
  box(2.9, 0.88, 0.75, body, 0, 0, 0, g);
  box(3.0, 0.08, 0.85, top, 0, 0.88, 0, g); // polished counter overhang
  // Footrail
  cyl(0.02, 0.02, 2.9, mat('#ddd', { m: 0.85, r: 0.2 }), 0, 0.12, 0.4, g, 12);
};

B.espresso = (p, g) => {
  const chrome = mat('#eef0ff', { m: 0.85, r: 0.2 }), dark = mat('#11131c', { r: 0.4 });
  box(0.7, 0.65, 0.6, chrome, 0, 0.88, 0, g); // sits on counter or stand
  box(0.72, 0.88, 0.65, dark, 0, 0, 0, g);
  // Coffee hoppers on top
  [-0.18, 0.18].forEach(x => {
    cyl(0.1, 0.07, 0.25, mat('#bfe9ff', { a: 0.4, r: 0.1 }), x, 1.53, -0.05, g, 16);
  });
  // Glowing status lights
  const led = cyl(0.025, 0.025, 0.02, mat('#35e0ff', { e: '#35e0ff', ei: 2.0 }), 0.2, 1.35, 0.31, g);
  led.rotation.x = Math.PI / 2;
};

B.shelf = (p, g) => {
  const frame = mat('#2c3e50', { r: 0.4 }), shelfMat = mat('#7f8c8d', { r: 0.5 });
  box(1.9, 1.6, 0.6, frame, 0, 0, 0, g);
  // Add 3 shelves with colorful items
  const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#3498db'];
  for (let s = 0; s < 3; s++) {
    const sy = 0.25 + s * 0.45;
    box(1.82, 0.04, 0.56, shelfMat, 0, sy, 0, g);
    for (let i = 0; i < 6; i++) {
      const col = colors[(s * 3 + i) % colors.length];
      box(0.18, 0.24, 0.18, mat(col, { r: 0.5 }), -0.7 + i * 0.28, sy + 0.04, 0, g);
    }
  }
};

B.cooler = (p, g) => {
  const c = p.color || '#2980b9', body = mat(c, { r: 0.4 }), glass = mat('#bfe9ff', { a: 0.28, r: 0.1 });
  box(1.9, 1.9, 0.75, body, 0, 0, 0, g);
  // Glass front door
  const gl = box(1.75, 1.65, 0.04, glass, 0, 0.15, 0.36, g);
  // Glowing shelves inside
  for (let s = 0; s < 3; s++) {
    const sy = 0.35 + s * 0.48;
    for (let i = 0; i < 7; i++) {
      const bCol = ['#2ecc71', '#e74c3c', '#3498db', '#f1c40f'][i % 4];
      cyl(0.04, 0.04, 0.2, mat(bCol, { e: bCol, ei: 0.8 }), -0.65 + i * 0.22, sy, 0.1, g, 12);
    }
  }
};

B.register = (p, g) => {
  const wood = mat('#2c3e50', { r: 0.5 }), dark = mat('#151722', { r: 0.3 });
  box(0.85, 0.88, 0.75, wood, 0, 0, 0, g);
  // Screen
  const sc = box(0.35, 0.25, 0.04, mat('#222', { e: '#35e0c9', ei: 0.6 }), 0, 0.98, 0.1, g);
  sc.rotation.x = -0.3;
  // Pinpad
  box(0.14, 0.04, 0.18, dark, 0.22, 0.89, 0.2, g);
};

B.gacha = (p, g) => {
  const c = p.color || '#ff4d6d', base = mat(c, { r: 0.4 });
  box(0.65, 0.75, 0.65, base, 0, 0, 0, g);
  // Transparent globe
  sph(0.32, mat('#bfe9ff', { a: 0.25, r: 0.1 }), 0, 1.08, 0, g);
  // Colorful toy capsules inside
  const capColors = ['#ff4d6d', '#ffd166', '#35e0c9', '#8a5cff'];
  for (let i = 0; i < 6; i++) {
    sph(0.08, mat(capColors[i % capColors.length]), (Math.sin(i * 1.3) * 0.16), 1.0 + (i % 2) * 0.12, (Math.cos(i * 1.3) * 0.16), g);
  }
  // Turn knob
  cyl(0.06, 0.06, 0.05, mat('#ddd', { m: 0.8 }), 0, 0.55, 0.33, g);
};

B.bed = (p, g) => {
  const c = p.color || '#4a69bd', frameMat = mat('#2c1e14', { r: 0.6 }), sheetMat = mat(c, { r: 0.7 });
  // Bed frame (2x2 footprint)
  box(1.85, 0.25, 1.85, frameMat, 0, 0, 0, g);
  box(1.85, 0.75, 0.15, frameMat, 0, 0.25, -0.85, g); // headboard
  // Mattress & duvet
  box(1.7, 0.24, 1.7, sheetMat, 0, 0.25, 0.05, g);
  // Pillows
  [-0.45, 0.45].forEach(x => {
    box(0.55, 0.12, 0.35, mat('#f8f9fa', { r: 0.6 }), x, 0.48, -0.55, g);
  });
};

B.desk = (p, g) => {
  const dark = mat('#1e272e', { r: 0.4 }), top = mat('#2f3640', { r: 0.3 });
  box(1.85, 0.06, 0.85, top, 0, 0.72, 0, g);
  [-0.85, 0.85].forEach(x => box(0.08, 0.72, 0.75, dark, x, 0, 0, g));
  // Dual monitors
  [-0.35, 0.35].forEach((x, i) => {
    const sc = box(0.55, 0.36, 0.03, mat('#111', { e: i === 0 ? '#35e0ff' : '#8a5cff', ei: 1.2 }), x, 0.78, -0.2, g);
    sc.rotation.y = (i === 0 ? 0.12 : -0.12);
  });
  // Keyboard & mouse
  box(0.42, 0.02, 0.15, mat('#000', { e: '#ff4d9a', ei: 0.5 }), 0, 0.75, 0.15, g);
};

B.wardrobe = (p, g) => {
  const c = p.color || '#3c6382', wood = mat(c, { r: 0.6 });
  box(0.88, 1.85, 0.75, wood, 0, 0, 0, g);
  cyl(0.015, 0.015, 0.22, mat('#ddd', { m: 0.8 }), 0.06, 0.95, 0.39, g);
};

B.mirror = (p, g) => {
  const frameColor = p.color || '#ffb84a';
  const frameMat = mat(frameColor, { m: 0.85, r: 0.25 });
  const standMat = mat('#1a1a24', { m: 0.6, r: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xe6f4ff,
    metalness: 0.95,
    roughness: 0.08,
  });
  const glowMat = mat('#54e0ee', { e: '#54e0ee', ei: 1.2 });

  // Stand Base & A-frame struts
  box(0.72, 0.04, 0.42, standMat, 0, 0.02, 0, g);
  cyl(0.018, 0.018, 1.35, standMat, -0.32, 0.04, 0, g);
  cyl(0.018, 0.018, 1.35, standMat, 0.32, 0.04, 0, g);
  const rearStrut = cyl(0.014, 0.014, 1.05, standMat, 0, 0.04, -0.15, g);
  rearStrut.rotation.x = 0.25;

  // Mirror Frame Pivot
  const mirrorGroup = new THREE.Group();
  mirrorGroup.position.set(0, 0.72, 0.02);
  mirrorGroup.rotation.x = -0.06;

  // Outer Gilded Frame
  const fW = 0.62, fH = 1.32, fT = 0.035;
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(fW, 0.04, fT), frameMat);
  topRail.position.set(0, fH / 2 - 0.02, 0);
  const btmRail = new THREE.Mesh(new THREE.BoxGeometry(fW, 0.04, fT), frameMat);
  btmRail.position.set(0, -fH / 2 + 0.02, 0);
  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, fH, fT), frameMat);
  leftRail.position.set(-fW / 2 + 0.02, 0, 0);
  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, fH, fT), frameMat);
  rightRail.position.set(fW / 2 - 0.02, 0, 0);

  // Silvered Glass Surface
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(fW - 0.08, fH - 0.08), glassMat);
  glass.position.set(0, 0, fT / 2 + 0.002);

  // Neon Backlight Outline Trim
  const neonBacklight = new THREE.Mesh(new THREE.PlaneGeometry(fW + 0.04, fH + 0.04), glowMat);
  neonBacklight.position.set(0, 0, -fT / 2 - 0.002);

  mirrorGroup.add(topRail, btmRail, leftRail, rightRail, glass, neonBacklight);
  g.add(mirrorGroup);

  // Floor reflection pool (soft cyan light glow on ground)
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
    map: radialTex('#54e0ee'),
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.015, 0.35);
  g.add(pool);
};

B.bench = (p, g) => {
  const wood = mat('#5a3a24', { r: 0.5 }), iron = mat('#1a1a1a', { m: 0.7, r: 0.4 });
  // Slats
  for (let i = 0; i < 4; i++) box(1.8, 0.04, 0.1, wood, 0, 0.36, -0.2 + i * 0.14, g);
  for (let i = 0; i < 3; i++) box(1.8, 0.1, 0.04, wood, 0, 0.48 + i * 0.12, -0.26, g);
  // Cast iron legs
  [-0.75, 0.75].forEach(x => {
    box(0.06, 0.4, 0.6, iron, x, 0, 0, g);
    box(0.06, 0.75, 0.06, iron, x, 0, -0.28, g);
  });
};

B.streetlight = (p, g) => {
  const c = p.color || '#ffd166', metal = mat('#1e272e', { m: 0.6, r: 0.3 });
  cyl(0.09, 0.12, 0.3, metal, 0, 0, 0, g); // base
  cyl(0.04, 0.06, 2.7, metal, 0, 0.3, 0, g); // pole
  box(0.45, 0.04, 0.04, metal, 0.18, 2.95, 0, g); // arm
  // Glowing lamp head
  const lamp = box(0.25, 0.12, 0.2, mat('#ffffff', { e: c, ei: 2.8 }), 0.35, 2.85, 0, g);
  // Additive floor light pool under the lamp
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5), new THREE.MeshBasicMaterial({
    map: radialTex(c),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.35, 0.015, 0);
  pool.userData.keep = true;
  g.add(pool);
};

B.hydrant = (p, g) => {
  const red = mat('#e74c3c', { r: 0.4 }), metal = mat('#bbb', { m: 0.8, r: 0.2 });
  cyl(0.14, 0.16, 0.55, red, 0, 0, 0, g);
  sph(0.14, red, 0, 0.55, 0, g);
  cyl(0.05, 0.05, 0.36, metal, 0, 0.35, 0, g);
};

B.bin = (p, g) => {
  const c = p.color || '#27ae60', body = mat(c, { r: 0.4 }), lid = mat('#1e272e', { r: 0.3 });
  box(0.55, 0.72, 0.55, body, 0, 0, 0, g);
  box(0.58, 0.08, 0.58, lid, 0, 0.72, 0, g);
};

B.tree = (p, g) => {
  const planter = mat('#34495e', { r: 0.6 }), trunk = mat('#5a3a24', { r: 0.7 }), leaf = mat('#27ae60', { r: 0.5 });
  box(0.85, 0.35, 0.85, planter, 0, 0, 0, g);
  cyl(0.08, 0.1, 1.1, trunk, 0, 0.35, 0, g);
  sph(0.55, leaf, 0, 1.6, 0, g);
  sph(0.42, leaf, 0.1, 2.0, -0.05, g);
};

B.palm_tree = (p, g) => {
  const planter = mat('#2c2242', { r: 0.5, m: 0.2 }),
        trunk = mat('#4a2f1c', { r: 0.7 }),
        ringMat = mat('#ff4d9a', { e: '#ff4d9a', ei: 1.8 }),
        frondMat = mat('#16a085', { r: 0.4 }),
        frondGlow = mat('#35e0c9', { e: '#35e0c9', ei: 1.2 });
  // Hexagonal neon planter base
  cyl(0.48, 0.54, 0.35, planter, 0, 0, 0, g, 8);
  // Curved trunk made of 5 staggered segments leaning gently
  let curY = 0.35, curX = 0, curZ = 0;
  for (let i = 0; i < 5; i++) {
    const segH = 0.55;
    const nextX = curX + 0.05 * Math.sin(i * 0.7);
    const nextZ = curZ - 0.04 * (i + 1);
    const seg = cyl(0.12 - i * 0.015, 0.14 - i * 0.015, segH, trunk, curX, curY, curZ, g, 10);
    seg.rotation.x = -0.08 * (i + 1);
    // Neon pink accent ring between trunk segments
    if (i < 4) {
      const ring = cyl(0.14 - i * 0.01, 0.14 - i * 0.01, 0.03, ringMat, curX, curY + segH, curZ, g, 10);
      ring.rotation.x = seg.rotation.x;
    }
    curY += segH * 0.95;
    curX = nextX;
    curZ = nextZ;
  }
  // Crown of 7 cascading tropical palm fronds
  const numFronds = 7;
  for (let f = 0; f < numFronds; f++) {
    const angle = (f / numFronds) * Math.PI * 2;
    const frondGroup = new THREE.Group();
    frondGroup.position.set(curX, curY + 0.08, curZ);
    frondGroup.rotation.y = angle;

    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 1.4), (f % 2 === 0 ? frondMat : frondGlow));
    leaf.rotation.x = -Math.PI / 3;
    leaf.position.set(0, 0.35, 0.65);
    frondGroup.add(leaf);

    const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.7), frondMat);
    tip.rotation.x = -Math.PI / 2.2;
    tip.position.set(0, 0.15, 1.35);
    frondGroup.add(tip);

    g.add(frondGroup);
  }
  // Soft magenta floor pool under palm
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({
    map: radialTex('#ff4d9a'),
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(curX, 0.015, curZ);
  g.add(pool);
};

B.retro_car = (p, g) => {
  const bodyColor = p.color || '#f5f6fa',
        bodyMat = mat(bodyColor, { r: 0.25, m: 0.4 }),
        blackMat = mat('#11131a', { r: 0.3, m: 0.8 }),
        glassMat = mat('#070912', { r: 0.1, m: 0.9, e: '#1e3799', ei: 0.2 }),
        wheelMat = mat('#181a20', { r: 0.8 }),
        rimMat = mat('#dcdde1', { m: 0.9, r: 0.2 }),
        tailGlow = mat('#ff1744', { e: '#ff1744', ei: 3.0 }),
        headGlow = mat('#e0f7fa', { e: '#e0f7fa', ei: 2.5 });

  // Aerodynamic 1980s wedge supercar: 2.7 long (z), 1.35 wide (x), 0.72 high
  box(1.35, 0.32, 2.7, bodyMat, 0, 0.12, 0, g);
  // Slanted front nose wedge
  const nose = box(1.32, 0.22, 1.0, bodyMat, 0, 0.12, 0.95, g);
  nose.rotation.x = 0.16;
  // Cabin greenhouse / roof
  box(1.15, 0.38, 1.25, glassMat, 0, 0.42, -0.15, g);
  box(1.18, 0.04, 0.9, bodyMat, 0, 0.8, -0.15, g);
  // Rear deck louvers
  box(1.28, 0.18, 0.75, blackMat, 0, 0.42, -1.0, g);
  // Rear spoiler wing
  box(1.38, 0.05, 0.25, bodyMat, 0, 0.68, -1.35, g);
  box(0.08, 0.18, 0.12, bodyMat, -0.55, 0.52, -1.35, g);
  box(0.08, 0.18, 0.12, bodyMat, 0.55, 0.52, -1.35, g);

  // Wheels (4)
  const addWheel = (wx, wz) => {
    const tire = cyl(0.24, 0.24, 0.16, wheelMat, wx, 0.12, wz, g, 14);
    tire.rotation.z = Math.PI / 2;
    const rim = cyl(0.14, 0.14, 0.17, rimMat, wx, 0.12, wz, g, 8);
    rim.rotation.z = Math.PI / 2;
  };
  addWheel(-0.68, 0.85);
  addWheel(0.68, 0.85);
  addWheel(-0.68, -0.85);
  addWheel(0.68, -0.85);

  // Pop-up headlights
  box(0.32, 0.06, 0.08, headGlow, -0.42, 0.34, 1.38, g);
  box(0.32, 0.06, 0.08, headGlow, 0.42, 0.34, 1.38, g);

  // Full-width continuous 80s neon taillight bar
  box(1.3, 0.09, 0.06, tailGlow, 0, 0.36, -1.38, g);

  // Neon pink underglow puddle
  const underglow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.9), new THREE.MeshBasicMaterial({
    map: radialTex('#ff4d9a'),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.set(0, 0.015, 0);
  g.add(underglow);
};

B.diorama_table = (p, g) => {
  const tableMat = mat('#141824', { r: 0.35, m: 0.6 }),
        trimMat = mat('#283149', { r: 0.2, m: 0.8 }),
        glassMat = mat('#0d1b2a', { r: 0.1, m: 0.2, e: '#00d2d3', ei: 0.4 }),
        neonCyan = mat('#00d2d3', { e: '#00d2d3', ei: 2.5 }),
        holoMoonMat = mat('#dcdde1', { r: 0.8, m: 0.1, e: '#54a0ff', ei: 0.6 }),
        ringMat = mat('#5f27cd', { e: '#ff4d9a', ei: 2.2, a: 0.75 });

  // Main console chassis (1.8m wide, 0.7m tall, 0.9m deep)
  box(1.8, 0.12, 0.9, tableMat, 0, 0.64, 0, g);
  box(1.84, 0.04, 0.94, trimMat, 0, 0.62, 0, g);

  // 4 high-tech angled pedestal legs
  box(0.12, 0.64, 0.12, trimMat, -0.78, 0, -0.36, g);
  box(0.12, 0.64, 0.12, trimMat, 0.78, 0, -0.36, g);
  box(0.12, 0.64, 0.12, trimMat, -0.78, 0, 0.36, g);
  box(0.12, 0.64, 0.12, trimMat, 0.78, 0, 0.36, g);

  // Lower foot brace
  box(1.6, 0.04, 0.68, trimMat, 0, 0.12, 0, g);

  // Recessed holographic projection surface
  box(1.4, 0.02, 0.66, glassMat, 0, 0.76, 0, g);

  // Holographic projection emitter rings
  cyl(0.36, 0.38, 0.03, neonCyan, 0, 0.77, 0, g, 24);

  // Miniature floating holographic Moon sphere
  const moon = sph(0.22, holoMoonMat, 0, 1.15, 0, g);
  moon.userData.isHoloMoon = true;

  // Thin orbital gimbal ring around the moon
  const ringGeo = new THREE.TorusGeometry(0.32, 0.012, 8, 32);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 3;
  ring.position.set(0, 1.15, 0);
  ring.userData.isHoloRing = true;
  g.add(ring);
  holoMeshes.push({ moon, ring });

  // Miniature outpost beacon on the moon surface
  box(0.03, 0.03, 0.03, neonCyan, 0.08, 1.32, 0.12, g);

  // Front telemetry / keyboard strip
  box(1.5, 0.015, 0.12, neonCyan, 0, 0.765, 0.38, g);

  // Cyan projection light pool below the table
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({
    map: radialTex('#00d2d3'),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.015, 0);
  g.add(pool);
};

B.wall_seg = (p, g) => {
  const c = p.color || '#4b3f80', wallMat = mat(c, { r: 0.85 }), trimMat = mat('#1a1530', { r: 0.7 });
  // 1x1x2.8 wall block
  box(1.0, 2.8, 1.0, wallMat, 0, 0, 0, g);
  // Baseboard trim
  box(1.02, 0.18, 1.02, trimMat, 0, 0, 0, g);
};

B.door_frame = (p, g) => {
  // Flat threshold decal on the floor
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({
    color: 0x35e0ff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false
  }));
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.015;
  g.add(decal);
};

export function buildProp(r) {
  const g = new THREE.Group(); (B[r.type] || (() => {}))(r, g);
  g.traverse(o => { if (o.isMesh) o.userData.propId = r.id; });
  upgradeProp(r, g, { screenTex });   // async: swaps in a glTF if the manifest has one for this prop
  return g;
}
