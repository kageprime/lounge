// Writes assets/models/vending.glb: a snack machine with vent slats on both sides, so it reads from every camera angle.
// Pure Node, no dependencies. Run: node tools/make-vending-glb.mjs
// Local frame: floor y=0, front +z. Material names ("body", "sign", ...) are what manifest.json tints / boosts.
import fs from 'node:fs';
const mats = {};   // name -> { def, boxes: [] }
const M = (name, color, o = {}) => (mats[name] ??= { def: { name, pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: o.m ?? 0, roughnessFactor: o.r ?? 0.6 }, ...(o.e ? { emissiveFactor: o.e } : {}) }, boxes: [] });
const box = (m, w, h, d, x, y, z) => mats[m].boxes.push([w, h, d, x, y + h / 2, z]);   // y = bottom, like props3d

M('body', [0.55, 0.2, 0.17], { r: 0.45 }); M('trim', [0.1, 0.1, 0.13], { r: 0.5, m: 0.3 }); M('dark', [0.04, 0.04, 0.05], { r: 0.4 });
M('vent', [0.03, 0.03, 0.04], { r: 0.5, m: 0.4 }); M('sign', [0.9, 0.9, 0.9], { r: 0.4, e: [0.8, 0.8, 0.8] });
M('glass', [0.06, 0.08, 0.12], { r: 0.15, e: [0.05, 0.07, 0.1] });
const prod = [[1, 0.42, 0.42], [1, 0.82, 0.4], [0.42, 0.8, 0.43], [0.3, 0.6, 1], [0.78, 0.49, 1]];
prod.forEach((c, i) => M('prod' + i, c, { r: 0.7, e: c.map(v => v * 0.55) }));

box('body', 0.86, 1.72, 0.7, 0, 0.04, 0);                       // main cabinet
box('trim', 0.9, 0.08, 0.74, 0, 0, 0);                           // plinth
box('trim', 0.9, 0.08, 0.74, 0, 1.76, 0);                        // top cap
box('glass', 0.62, 1.02, 0.03, -0.08, 0.55, 0.352);              // window backing
for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) box('prod' + ((r * 3 + k) % 5), 0.14, 0.15, 0.05, -0.28 + k * 0.2, 0.62 + r * 0.19, 0.378);
for (let r = 0; r < 5; r++) box('trim', 0.6, 0.015, 0.06, -0.08, 0.6 + r * 0.19, 0.378);   // shelves
box('trim', 0.18, 0.74, 0.05, 0.3, 0.52, 0.365);                 // selector panel
box('dark', 0.5, 0.18, 0.05, -0.08, 0.12, 0.362);                // pickup flap
box('sign', 0.78, 0.18, 0.03, 0, 1.58, 0.356);                   // glowing header
for (const sx of [-1, 1]) {                                      // sides: recessed panel + vent slats + handle strip
  box('trim', 0.012, 1.3, 0.5, sx * 0.436, 0.25, -0.02);
  for (let i = 0; i < 9; i++) box('vent', 0.02, 0.025, 0.36, sx * 0.44, 0.34 + i * 0.075, -0.02);
  box('vent', 0.02, 0.5, 0.03, sx * 0.44, 1.0, 0.26);
}

// ---- pack to GLB ----
const P = [], N = [], I = [], prims = [], materials = [];
let vOff = 0;
for (const [name, { def, boxes }] of Object.entries(mats)) {
  if (!boxes.length) continue;
  const start = I.length, pStart = P.length / 3; void pStart;
  for (const [w, h, d, cx, cy, cz] of boxes) {
    const faces = [[0, 0, 1, [-1, -1], [1, -1], [1, 1], [-1, 1]], [0, 0, -1, [1, -1], [-1, -1], [-1, 1], [1, 1]]];   // placeholders, replaced below
    void faces;
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const F = [   // normal, 4 corners CCW seen from outside
      [[0, 0, 1], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],
      [[0, 0, -1], [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]],
      [[1, 0, 0], [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],
      [[-1, 0, 0], [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]],
      [[0, 1, 0], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],
      [[0, -1, 0], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]],
    ];
    for (const [n, ...c] of F) { for (const v of c) { P.push(v[0] + cx, v[1] + cy, v[2] + cz); N.push(...n); } I.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3); vOff += 4; }
  }
  prims.push({ start, count: I.length - start, material: materials.length }); materials.push(def);
}
const pos = new Float32Array(P), nor = new Float32Array(N), idx = new Uint32Array(I);
const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nor.buffer), Buffer.from(idx.buffer)]);
const min = [0, 1, 2].map(a => Math.min(...P.filter((_, i) => i % 3 === a))), max = [0, 1, 2].map(a => Math.max(...P.filter((_, i) => i % 3 === a)));
const json = {
  asset: { version: '2.0', generator: 'neon-lounge make-vending-glb' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'vending', mesh: 0 }],
  meshes: [{ name: 'vending', primitives: prims.map((p, i) => ({ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 + i, material: p.material })) }],
  materials,
  accessors: [
    { bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: N.length / 3, type: 'VEC3' },
    ...prims.map((p, i) => ({ bufferView: 2, byteOffset: p.start * 4, componentType: 5125, count: p.count, type: 'SCALAR' })),
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: pos.byteLength, target: 34962 },
    { buffer: 0, byteOffset: pos.byteLength, byteLength: nor.byteLength, target: 34962 },
    { buffer: 0, byteOffset: pos.byteLength + nor.byteLength, byteLength: idx.byteLength, target: 34963 },
  ],
  buffers: [{ byteLength: bin.length }],
};
const pad = (b, v) => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4, v)]);
const j = pad(Buffer.from(JSON.stringify(json)), 0x20), b = pad(bin, 0), head = Buffer.alloc(12), ch = (len, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(t, 4); return h; };
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
fs.mkdirSync(new URL('../assets/models/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../assets/models/vending.glb', import.meta.url), Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(b.length, 0x004e4942), b]));
console.log('vending.glb', head.readUInt32LE(8), 'bytes,', materials.length, 'materials,', P.length / 3, 'verts, bbox', min.map(v => +v.toFixed(2)), max.map(v => +v.toFixed(2)));
