// Three.js stage: table, board, pawns, felt dice tray. Read-only with respect to game state:
// the controller tells it what to show (setP / movePawn / setDie / ...), it never decides anything.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLOR_HEX, COLOR_CSS, LOOP, START_IDX, STAR_IDX, HOME_RED, YARD_RED, rotCell, rotPt, cellOf, yardSlot, P_HOME } from './board.js';
import { TRAY, quatFaceUp } from './dicetray.js';
import { CameraRig } from './cameras.js';

export const CELL = 0.05, BOARD = CELL * 15, BOARD_Y = 0.03;
export const LAYOUT = { boardX: 0, trayX: 0.68 };
const V3 = THREE.Vector3;

// board units (0..15) -> world
export const bx = (u) => (u - 7.5) * CELL;

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, { nearest = false, repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; return t;
}
function rnd(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function woodTex(base = [92, 58, 32], seed = 5, repeat = [3, 2]) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rnd(seed);
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const k = 0.78 + r() * 0.4, a = r() < 0.12 ? 0.4 : 0.14;
      g.fillStyle = `rgba(${base.map((v) => Math.round(v * k * 0.55))},${a})`; g.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,10,4,${0.1 + r() * 0.15})`; g.fillRect(r() * w, r() * h, 6 + r() * 40, 1); }
  }, { repeat });
}

function boardTex() {
  const U = 64;
  return canvasTex(U * 15, U * 15, (g) => {
    const paper = '#f3e7c9', line = '#6b5436';
    g.fillStyle = '#e8d9b5'; g.fillRect(0, 0, U * 15, U * 15);
    const dark = (c, a) => { const x = parseInt(c.slice(1), 16); const m = (v) => Math.round(v * a); return `rgb(${m(x >> 16)},${m((x >> 8) & 255)},${m(x & 255)})`; };
    // yards
    for (let c = 0; c < 4; c++) {
      const [x0, y0] = rotCell([0, 0], c), corner = [[0, 0], [9, 0], [9, 9], [0, 9]][c];
      void x0; void y0;
      g.fillStyle = COLOR_CSS[c]; g.fillRect(corner[0] * U, corner[1] * U, 6 * U, 6 * U);
      g.fillStyle = dark(COLOR_CSS[c], 0.55); g.fillRect((corner[0] + 0.5) * U, (corner[1] + 0.5) * U, 5 * U, 5 * U);
      g.fillStyle = '#f6ecd3'; g.fillRect((corner[0] + 1) * U, (corner[1] + 1) * U, 4 * U, 4 * U);
      g.strokeStyle = line; g.lineWidth = 3; g.strokeRect((corner[0] + 1) * U, (corner[1] + 1) * U, 4 * U, 4 * U);
      for (let t = 0; t < 4; t++) {
        const [px, py] = yardSlot(c, t);
        g.beginPath(); g.arc(px * U, py * U, 0.62 * U, 0, 7); g.fillStyle = COLOR_CSS[c]; g.fill();
        g.beginPath(); g.arc(px * U, py * U, 0.44 * U, 0, 7); g.fillStyle = dark(COLOR_CSS[c], 0.5); g.fill();
      }
    }
    // path cells
    const homeCol = new Map();
    for (let c = 0; c < 4; c++) for (let i = 0; i < 5; i++) homeCol.set(rotCell(HOME_RED[i], c).join(','), c);
    const startCell = new Map(START_IDX.map((idx, c) => [LOOP[idx].join(','), c]));
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const inArm = (x >= 6 && x <= 8) || (y >= 6 && y <= 8);
      if (!inArm || (x >= 6 && x <= 8 && y >= 6 && y <= 8)) continue;
      const key = x + ',' + y;
      g.fillStyle = homeCol.has(key) ? COLOR_CSS[homeCol.get(key)] : startCell.has(key) ? COLOR_CSS[startCell.get(key)] : paper;
      g.fillRect(x * U, y * U, U, U);
      g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(x * U + 1.5, y * U + 1.5, U - 3, U - 3);
    }
    // stars on safe squares
    for (const idx of STAR_IDX) {
      const [x, y] = LOOP[idx], cx = (x + 0.5) * U, cy = (y + 0.5) * U;
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 0.14 : 0.36) * U; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fillStyle = '#c99a2e'; g.fill(); g.strokeStyle = line; g.lineWidth = 2; g.stroke();
    }
    // start squares get an arrow-ish dot
    for (let c = 0; c < 4; c++) { const [x, y] = LOOP[START_IDX[c]]; g.beginPath(); g.arc((x + 0.5) * U, (y + 0.5) * U, 0.17 * U, 0, 7); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
    // centre triangles: red left, green top, yellow right, blue bottom
    const C = [7.5 * U, 7.5 * U], corners = [[6 * U, 6 * U], [9 * U, 6 * U], [9 * U, 9 * U], [6 * U, 9 * U]];
    const tri = [[3, 0], [0, 1], [1, 2], [2, 3]];       // colour -> corner pair (left: BL,TL ; top: TL,TR ; right: TR,BR ; bottom: BR,BL)
    for (let c = 0; c < 4; c++) {
      const [a, b] = tri[c]; g.beginPath(); g.moveTo(...corners[a]); g.lineTo(...corners[b]); g.lineTo(...C); g.closePath();
      g.fillStyle = COLOR_CSS[c]; g.fill(); g.strokeStyle = line; g.lineWidth = 3; g.stroke();
    }
  });
}

function pipTex(n) {
  return canvasTex(64, 64, (x) => {
    const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, '#fbf6e6'); g.addColorStop(1, '#e9e0c6');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.fillStyle = n === 1 ? '#c93a2a' : '#17130f';
    const a = 16, m = 32, b = 48;
    const P = { 1: [[m, m]], 2: [[a, a], [b, b]], 3: [[a, a], [m, m], [b, b]], 4: [[a, a], [b, a], [a, b], [b, b]], 5: [[a, a], [b, a], [m, m], [a, b], [b, b]], 6: [[a, a], [b, a], [a, m], [b, m], [a, b], [b, b]] };
    for (const [px, py] of P[n]) { x.beginPath(); x.arc(px, py, n === 1 ? 9 : 5.6, 0, 7); x.fill(); }
  });
}

// ---------------------------------------------------------------- stage
export class Stage {
  constructor(canvas) {
    this.canvas = canvas; this.time = 0; this.speed = 1;
    this.camPos = new V3(0.3, 1.1, 0.6); this.camLook = new V3(0.3, 0, 0); this.camFov = 42;
    this.tgtPos = this.camPos.clone(); this.tgtLook = this.camLook.clone(); this.tgtFov = 42; this.camK = 3;
    this.rig = new CameraRig(LAYOUT); this.phase = 'roll';
    this.pawns = []; this.hints = []; this.flash = 0; this.flashColor = new THREE.Color(1, 0.2, 0.1);
  }

  init() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0a0705, 1);
    this.renderer = renderer;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x0a0705, 2.2, 4.5);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.02, 20);
    this.resize();
    this._lights(); this._table(); this._board(); this._pawns(); this._tray(); this._markers();
    this.setCameraTarget(this.camPos, this.camLook, { snap: true });
    return this;
  }

  // crisp rendering: native resolution (up to 2x device pixels), real antialiasing, soft shadows
  setPixelHeight() {}
  resize() {
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.aspect = w / h; this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xfff0dc, 0x2a1a10, 0.6));
    const sp = new THREE.SpotLight(0xfff0d8, 30, 5, 0.75, 0.7, 1.4);
    sp.position.set(0.28, 1.7, 0.5); sp.target.position.set(0.28, 0, 0);
    sp.castShadow = true; sp.shadow.mapSize.set(2048, 2048); sp.shadow.bias = -0.0003; sp.shadow.radius = 3; sp.shadow.camera.near = 0.8; sp.shadow.camera.far = 3.2;
    this.scene.add(sp, sp.target); this.lamp = sp;
    const fill = new THREE.DirectionalLight(0xa8c0ff, 0.35); fill.position.set(-1, 1, 1.2); this.scene.add(fill);
  }

  _table() {
    const wood = woodTex([88, 54, 30], 7, [4, 2.5]);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.5), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 }));
    top.position.set(0.25, -0.05, 0.0); top.receiveShadow = true; this.scene.add(top);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.8; this.scene.add(floor);
    for (const [x, z] of [[-0.95, -0.55], [1.45, -0.55], [-0.95, 0.55], [1.45, 0.55]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.75, 0.09), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 })); l.position.set(x, -0.475, z); this.scene.add(l);
    }
  }

  _board() {
    const g = new THREE.Group(); g.position.set(LAYOUT.boardX, 0, 0); this.scene.add(g); this.boardGroup = g;
    const rimMat = new THREE.MeshStandardMaterial({ map: woodTex([62, 36, 18], 21, [3, 1]), roughness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.07, BOARD_Y, BOARD + 0.07), rimMat); slab.position.y = BOARD_Y / 2; slab.castShadow = slab.receiveShadow = true; g.add(slab);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.85 }));
    face.rotation.x = -Math.PI / 2; face.position.y = BOARD_Y + 0.0005; face.receiveShadow = true; g.add(face);
    const lip = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), rimMat); m.position.set(x, BOARD_Y + 0.004, z); m.castShadow = true; g.add(m); };
    const e = BOARD / 2 + 0.017;
    lip(BOARD + 0.07, 0.02, 0, -e); lip(BOARD + 0.07, 0.02, 0, e); lip(0.02, BOARD, -e, 0); lip(0.02, BOARD, e, 0);
  }

  // ----- pawns
  _pawns() {
    const pts = [[0, 0], [0.0165, 0], [0.0165, 0.004], [0.0125, 0.0085], [0.0085, 0.02], [0.0072, 0.03], [0.0115, 0.033], [0.0085, 0.0365], [0, 0.0365]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(pts, 12), head = new THREE.SphereGeometry(0.0105, 10, 8);
    for (let c = 0; c < 4; c++) {
      const mat = new THREE.MeshStandardMaterial({ color: COLOR_HEX[c], roughness: 0.38, metalness: 0.08 });
      const rim = new THREE.MeshBasicMaterial({ color: 0xffd25a, toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      for (let t = 0; t < 4; t++) {
        const grp = new THREE.Group(), m = new THREE.Group();
        const b = new THREE.Mesh(body, mat), h = new THREE.Mesh(head, mat); h.position.y = 0.0435; b.castShadow = h.castShadow = true;
        m.add(b, h); grp.add(m);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.0195, 0.0255, 24), rim); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.0015; ring.visible = false; grp.add(ring);
        this.scene.add(grp);
        const p = { c, t, grp, m, ring, p: -1, x: 0, z: 0, y: 0, anim: null, sel: false, hover: false, phase: Math.random() * 6, cur: null };
        b.userData.pawn = h.userData.pawn = p;
        const [ux, uz] = yardSlot(c, t); p.x = bx(ux); p.z = bx(uz);
        this.pawns.push(p);
      }
    }
    this.pawnMeshes = this.pawns.flatMap((p) => p.m.children);
    this._applyPawns(0, true);
  }
  pawn(c, t) { return this.pawns[c * 4 + t]; }

  // destination markers for the pawns that can move
  _markers() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd25a, toneMapped: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.021, 4, 1, Math.PI / 4), mat); m.rotation.x = -Math.PI / 2; m.visible = false; this.scene.add(m); this.hints.push(m);
    }
  }

  // world xz (board-unit centre) of a pawn at progress p, before stacking offsets
  homeSpot(c, t) {      // finished pawns line up on their own centre triangle
    const dir = [[-1, 0], [0, -1], [1, 0], [0, 1]][c], perp = [-dir[1], dir[0]];
    return [7.5 + dir[0] * 0.95 + perp[0] * (t - 1.5) * 0.3, 7.5 + dir[1] * 0.95 + perp[1] * (t - 1.5) * 0.3];
  }
  unitPos(c, t, p) {
    if (p < 0) return yardSlot(c, t);
    if (p >= P_HOME) return this.homeSpot(c, t);
    const [x, y] = cellOf(c, p); return [x + 0.5, y + 0.5];
  }

  _targetFor(pw) {
    const [ux, uz] = this.unitPos(pw.c, pw.t, pw.p);
    if (pw.p < 0 || pw.p >= P_HOME) return { x: bx(ux), z: bx(uz), s: 1 };
    // stack share: pawns on the same cell fan out
    const mates = this.pawns.filter((o) => !o.anim && o.p === pw.p && o.c === pw.c);
    const others = this.pawns.filter((o) => !o.anim && o.p >= 0 && o.p < P_HOME && (o.c !== pw.c || o.p !== pw.p) && Math.abs(this.unitPosKey(o) - this.unitPosKey(pw)) < 1e-9);
    const group = [...mates, ...others].sort((a, b) => a.c * 4 + a.t - (b.c * 4 + b.t));
    const n = group.length, i = Math.max(0, group.indexOf(pw));
    const o = n <= 1 ? [0, 0] : n === 2 ? [(i ? 1 : -1) * 0.2, 0] : [[-0.2, -0.17], [0.2, -0.17], [-0.2, 0.2], [0.2, 0.2]][i % 4];
    return { x: bx(ux + o[0]), z: bx(uz + o[1]), s: n > 1 ? 0.82 : 1 };
  }
  unitPosKey(pw) { const [x, y] = this.unitPos(pw.c, pw.t, pw.p); return x * 100 + y; }

  setP(c, t, p) { const pw = this.pawn(c, t); pw.p = p; }
  setAllP(tokens, snap = true) { tokens.forEach((row, c) => row.forEach((p, t) => { this.pawn(c, t).p = p; this.pawn(c, t).anim = null; })); this._applyPawns(0, snap); }
  setActive(colors) { this.pawns.forEach((pw) => { pw.grp.visible = colors.includes(pw.c); }); }

  // hop from progress `from` to `to` (a Promise that resolves when it lands)
  movePawn(c, t, from, to) {
    const pw = this.pawn(c, t);
    const pts = [];
    if (from < 0) pts.push(this.unitPos(c, t, 0));
    else for (let p = from + 1; p <= to; p++) pts.push(this.unitPos(c, t, p));
    const legs = []; let cur = [pw.x, pw.z];
    for (const [ux, uz] of pts) { const nx = bx(ux), nz = bx(uz); legs.push({ a: cur, b: [nx, nz] }); cur = [nx, nz]; }
    return new Promise((res) => { pw.anim = { kind: 'hop', legs, i: 0, t: 0, dur: from < 0 ? 0.42 : 0.17, done: () => { pw.p = to; res(); }, step: 0 }; pw.p = from; });
  }
  // flung back to the yard
  sendHome(c, t) {
    const pw = this.pawn(c, t), [ux, uz] = yardSlot(c, t);
    return new Promise((res) => { pw.anim = { kind: 'fly', a: [pw.x, pw.z], b: [bx(ux), bx(uz)], t: 0, dur: 0.6, done: () => { pw.p = -1; res(); } }; });
  }

  setSelectable(list) {            // list: [{color, token, to}]
    this.pawns.forEach((pw) => { pw.sel = false; });
    this.hints.forEach((h) => { h.visible = false; });
    list.forEach((m, i) => {
      this.pawn(m.color, m.token).sel = true;
      const h = this.hints[i]; if (!h) return;
      const [ux, uz] = this.unitPos(m.color, m.token, m.to); h.position.set(bx(ux), BOARD_Y + 0.003, bx(uz)); h.visible = true;
    });
  }
  setHover(c, t) { this.pawns.forEach((pw) => { pw.hover = pw.c === c && pw.t === t; }); }

  _applyPawns(dt, snap = false) {
    const k = 1 - Math.exp(-dt * 16 * this.speed);
    for (const pw of this.pawns) {
      const bobbing = pw.sel ? Math.abs(Math.sin(this.time * 7 + pw.phase)) * 0.012 : 0;
      let ty = pw.p < 0 ? BOARD_Y : BOARD_Y;
      const a = pw.anim;
      if (a) {
        a.t += dt * this.speed;
        if (a.kind === 'hop') {
          const leg = a.legs[a.i], u = Math.min(1, a.t / a.dur), e = u * u * (3 - 2 * u);
          pw.x = leg.a[0] + (leg.b[0] - leg.a[0]) * e; pw.z = leg.a[1] + (leg.b[1] - leg.a[1]) * e;
          pw.y = Math.sin(u * Math.PI) * (a.dur > 0.3 ? 0.07 : 0.028);
          if (u >= 1) {
            this.onHop?.(a.step++, pw);
            a.i++; a.t = 0;
            if (a.i >= a.legs.length) { pw.anim = null; pw.y = 0; a.done(); }
          }
        } else if (a.kind === 'fly') {
          const u = Math.min(1, a.t / a.dur), e = u * u * (3 - 2 * u);
          pw.x = a.a[0] + (a.b[0] - a.a[0]) * e; pw.z = a.a[1] + (a.b[1] - a.a[1]) * e;
          pw.y = Math.sin(u * Math.PI) * 0.16; pw.m.rotation.z = Math.sin(u * Math.PI * 4) * 0.6 * (1 - u);
          if (u >= 1) { pw.anim = null; pw.y = 0; pw.m.rotation.z = 0; a.done(); this.onLand?.(pw); }
        }
      } else {
        const tg = this._targetFor(pw);
        if (snap) { pw.x = tg.x; pw.z = tg.z; } else { pw.x += (tg.x - pw.x) * k; pw.z += (tg.z - pw.z) * k; }
        pw.y *= snap ? 0 : 1 - k;
        pw.sc = tg.s;
      }
      const s = (pw.sc || 1) * (pw.hover ? 1.14 : 1);
      pw.grp.position.set(pw.x, ty + pw.y, pw.z);
      pw.m.position.y = bobbing; pw.m.scale.setScalar(s);
      pw.ring.visible = pw.sel; if (pw.sel) { const q = 1 + Math.sin(this.time * 7 + pw.phase) * 0.12; pw.ring.scale.setScalar(q); pw.ring.position.y = 0.0015 - pw.y; }
    }
  }

  // ----- dice tray
  _tray() {
    const T = TRAY, g = new THREE.Group(); g.position.set(LAYOUT.trayX, 0, 0); this.scene.add(g); this.trayGroup = g;
    const cz = (T.z0 + T.z1) / 2, dz = T.z1 - T.z0;
    this.feltMat = new THREE.MeshStandardMaterial({ color: 0x0f7a45, roughness: 0.97 });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(T.hx * 2 + 0.06, dz + 0.06), this.feltMat); felt.rotation.x = -Math.PI / 2; felt.position.set(0, 0.0015, cz); felt.receiveShadow = true; g.add(felt);
    const railMat = new THREE.MeshStandardMaterial({ map: woodTex([70, 40, 20], 33, [2, 1]), roughness: 0.55 });
    const box = (w, h, d, x, y, z, m = railMat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    box(T.hx * 2 + 0.14, 0.05, 0.035, 0, 0.025, T.z0 - 0.0275); box(T.hx * 2 + 0.14, 0.05, 0.035, 0, 0.025, T.z1 + 0.0275);
    box(0.035, 0.05, dz + 0.09, -T.hx - 0.0475, 0.025, cz); box(0.035, 0.05, dz + 0.09, T.hx + 0.0475, 0.025, cz);
    // a lamp strip in the current player's colour along the near rail
    this.turnBar = new THREE.Mesh(new THREE.BoxGeometry(T.hx * 2 + 0.1, 0.006, 0.008), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.turnBar.position.set(0, 0.052, T.z1 + 0.04); g.add(this.turnBar);
    // the die
    const nums = [2, 5, 1, 6, 3, 4];
    const mats = nums.map((n) => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.3 }));
    this.die = new THREE.Mesh(new RoundedBoxGeometry(T.half * 2, T.half * 2, T.half * 2, 3, 0.007), mats);
    this.die.castShadow = this.die.receiveShadow = true; g.add(this.die);
    g.updateMatrixWorld(true);
    this.setDie(null);
  }
  setDie(s) {
    const d = this.die;
    if (!s) { d.position.set(TRAY.rest.x, TRAY.half, TRAY.rest.z); d.quaternion.copy(new THREE.Quaternion(...(Object.values(quatFaceUp(6, 0.3))))); return; }
    d.position.set(s.x, s.y, s.z); d.quaternion.set(s.qx, s.qy, s.qz, s.qw);
  }
  setTurnColor(c) {
    const col = new THREE.Color(COLOR_HEX[c]);
    this.turnBar.material.color.copy(col);
    this.feltTarget = new THREE.Color(0x0f7a45).lerp(col, 0.08);
  }
  trayLocal(x, y, z) { return this.trayGroup.localToWorld(new V3(x, y, z)); }
  boardPoint(ux, uz, y = BOARD_Y + 0.05) { return new V3(bx(ux), y, bx(uz)); }

  // ----- camera
  setCameraTarget(pos, look, { fov = this.tgtFov, k = this.camK, snap = false } = {}) {
    this.tgtPos.copy(pos); this.tgtLook.copy(look); this.tgtFov = fov; this.camK = k;
    if (snap) { this.camPos.copy(pos); this.camLook.copy(look); this.camFov = fov; }
  }
  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, ok: p.z < 1 && p.z > -1 };
  }
  pickPawn(ndc) {
    const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const hit = r.intersectObjects(this.pawnMeshes.filter((m) => m.parent.parent.visible), false)[0];
    return hit ? hit.object.userData.pawn : null;
  }
  doFlash(color = 0xff4030, amt = 0.35) { this.flashColor.set(color); this.flash = amt; }

  update(dt) {
    this.time += dt;
    const movingPawn = this.pawns.find((p) => p.anim) || null;
    const shot = this.rig.compute(this.phase, this.aspect || 1.78, movingPawn);
    this.setCameraTarget(shot.pos, shot.look, { fov: shot.fov, k: shot.k });
    const a = 1 - Math.exp(-dt * this.camK);
    this.camPos.lerp(this.tgtPos, a); this.camLook.lerp(this.tgtLook, a); this.camFov += (this.tgtFov - this.camFov) * a;
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - this.camFov) > 0.01) { this.camera.fov = this.camFov; this.camera.updateProjectionMatrix(); }
    this._applyPawns(dt);
    this.hints.forEach((h, i) => { if (h.visible) { h.rotation.z = this.time * 1.5; h.scale.setScalar(1 + Math.sin(this.time * 6 + i) * 0.12); } });
    if (this.feltTarget) this.feltMat.color.lerp(this.feltTarget, 1 - Math.exp(-dt * 4));
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
