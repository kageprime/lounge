// Stage = read-only view of the World. It never changes simulation state; it only draws and answers "what is under the cursor".
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildProp, tick as tickScreens, resetAnimated, mat, radialTex } from './props3d.js';
import { buildAvatar, pose } from './avatar3d.js';
import { resolve, FACE } from './props.js';

const PITCH = 33 * Math.PI / 180;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class Stage {
  constructor(host, tagsEl, world, quality = 'high') {
    this.world = world; this.quality = quality; this.host = host; this.tagsEl = tagsEl;
    const r = this.r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0c0a16);
    this.isDistrict = !!(world.layout.buildings && world.layout.buildings.length);
    this.camMode = 'iso'; // default to classic crisp isometric view ('iso' | '3d')
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.perspCam = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
    this.cam = this.orthoCam;
    this.yaw = Math.PI / 4; this.yawTo = this.yaw; this.zoom = 12; this.zoomTo = 12;
    this.pitch3D = 24 * Math.PI / 180; this.pitch3DTo = this.pitch3D;
    this.dist3D = 9.5; this.dist3DTo = 9.5;
    this.target = new THREE.Vector3(world.layout.w / 2, 0.6, world.layout.h / 2); this.look = this.target.clone(); this.followId = null; this.pan = new THREE.Vector3();
    this.avatars = new Map(); this.tags = new Map(); this.propGroups = new Map(); this.t = 0;
    this.buildingMap = new Map();
    if (world.layout.buildings) {
      for (const b of world.layout.buildings) this.buildingMap.set(b.id, b);
    }
    this.theme = (world.layout.id === 'loft-1') ? 'loft' : 'arcade';
    this.phase = world.phase || 'normal'; this.phaseK = this.phase === 'twilight' ? 1 : 0;
    this.scene.fog = new THREE.FogExp2(0x0c0a16, this.isDistrict ? 0.007 : 0.012);
    this._lights(this.theme); this._room(this.theme); this._props(); this._markers(); this._env(this.theme);
    this.yaw = Math.PI / 4 - 0.7; this.zoom = 8; this._intro = true;       // intro: swing + pull back
    this._composer = null; this.setQuality(quality);
    this.ray = new THREE.Raycaster(); this.resize(); addEventListener('resize', () => this.resize());
    this._bindWorld(world);
  }
  _bindWorld(world) {
    if (this._unsubWorld) {
      this._unsubWorld();
      this._unsubWorld = null;
    }
    const handler = e => {
      if (e.type === 'leave') this._drop(e.id);
      if (e.type === 'loadout') this._drop(e.id, true);
      if (e.type === 'propPlaced') this._addPropMesh(e.prop);
      if (e.type === 'propMoved') this._movePropMesh(e.prop);
      if (e.type === 'propRemoved') this._removePropMesh(e.id);
      if (e.type === 'phaseChange') this.setPhase(e.phase);
    };
    world.on(handler);
    this._unsubWorld = () => {
      if (world.off) world.off(handler);
    };
  }
  setWorld(newWorld, theme) {
    if (this._unsubWorld) {
      this._unsubWorld();
      this._unsubWorld = null;
    }
    this._clearProps();
    this._clearRoom();
    this._clearEnv();
    this._clearAvatars();

    this.world = newWorld;
    this.theme = theme || (newWorld.layout.id === 'loft-1' ? 'loft' : 'arcade');
    this.isDistrict = !!(newWorld.layout.buildings && newWorld.layout.buildings.length);
    this.phase = newWorld.phase || 'normal';
    this.phaseK = this.phase === 'twilight' ? 1 : 0;
    this.scene.fog = new THREE.FogExp2(0x0c0a16, this.isDistrict ? 0.007 : 0.012);

    this._lights(this.theme);
    this._room(this.theme);
    this._props();
    this._env(this.theme);

    const spawn = newWorld.layout.spawn || { x: newWorld.layout.w / 2, y: newWorld.layout.h / 2 };
    this.teleportCamera(spawn.x, spawn.y);
    this._bindWorld(newWorld);
  }
  _clearProps() {
    for (const [id, g] of this.propGroups) {
      this.scene.remove(g);
      g.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    this.propGroups.clear();
  }
  _clearRoom() {
    const s = this.scene;
    if (this.floor) {
      s.remove(this.floor);
      if (this.floor.geometry) this.floor.geometry.dispose();
      this.floor = null;
    }
    if (this.districtFloors) {
      for (const m of this.districtFloors) {
        s.remove(m);
        if (m.geometry) m.geometry.dispose();
      }
      this.districtFloors = [];
    }
    if (this.walls) {
      for (const wl of this.walls) {
        if (wl.mesh) {
          s.remove(wl.mesh);
          if (wl.mesh.geometry) wl.mesh.geometry.dispose();
        }
      }
      this.walls = [];
    }
    if (this.baseboards) {
      for (const b of this.baseboards) {
        s.remove(b);
        if (b.geometry) b.geometry.dispose();
      }
      this.baseboards = [];
    }
    if (this.tubes) {
      for (const t of this.tubes) {
        s.remove(t);
        if (t.geometry) t.geometry.dispose();
      }
      this.tubes = [];
    }
    if (this.pendants) {
      for (const p of this.pendants) {
        s.remove(p);
        if (p.geometry) p.geometry.dispose();
      }
      this.pendants = [];
    }
  }
  _clearEnv() {
    const s = this.scene;
    if (this.softShadows) {
      s.remove(this.softShadows);
      this.softShadows.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.softShadows = null;
    }
    if (this.shadowMeshes) {
      this.shadowMeshes.clear();
    }
    if (this.backWallGradients) {
      for (const m of this.backWallGradients) {
        s.remove(m);
        if (m.geometry) m.geometry.dispose();
      }
      this.backWallGradients = [];
    }
    if (this.pools) {
      for (const p of this.pools) {
        s.remove(p);
        if (p.geometry) p.geometry.dispose();
      }
      this.pools = [];
    }
    if (this.sweep) {
      s.remove(this.sweep);
      if (this.sweep.geometry) this.sweep.geometry.dispose();
      this.sweep = null;
    }
    if (this.dust) {
      s.remove(this.dust);
      if (this.dust.geometry) this.dust.geometry.dispose();
      this.dust = null;
    }
    if (this.skyDome) {
      s.remove(this.skyDome);
      if (this.skyDome.geometry) this.skyDome.geometry.dispose();
      this.skyDome = null;
    }
    if (this.stars) {
      s.remove(this.stars);
      if (this.stars.geometry) this.stars.geometry.dispose();
      this.stars = null;
    }
    if (this.skyline) {
      s.remove(this.skyline);
      this.skyline.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.skyline = null;
    }
  }
  _clearAvatars() {
    for (const [id, av] of this.avatars) {
      this.scene.remove(av);
    }
    this.avatars.clear();
    for (const [id, tg] of this.tags) {
      tg.el.remove();
    }
    this.tags.clear();
  }
  setAtmosphere(tb) {
    if (!tb) return;
    if (this.sun) {
      this.sun.color.setHex(tb.sunColor);
      this.sun.intensity = tb.light;
    }
    if (this.scene) {
      this.scene.background.setHex(tb.skyColor);
      if (this.scene.fog) this.scene.fog.color.setHex(tb.fogColor || tb.skyColor);
    }
    this._drawSkyGradient(tb.id);
    if (this.starMat) {
      if (tb.id === 'day') this.starMat.opacity = 0.05;
      else if (tb.id === 'sunset') this.starMat.opacity = 0.35;
      else if (tb.id === 'dawn') this.starMat.opacity = 0.4;
      else if (tb.id === 'twilight') this.starMat.opacity = 1.0;
      else this.starMat.opacity = 0.85;
    }
  }
  setCamMode(mode) {
    if (this.camMode === mode) return;
    this.camMode = mode;
    this.cam = mode === '3d' ? this.perspCam : this.orthoCam;
    if (this.renderPass) this.renderPass.camera = this.cam;
    if (this.ceiling) this.ceiling.visible = !this.isDistrict && mode === '3d';
    this.resize();
  }
  setPhase(p) { this.phase = p; }
  _lights(theme) {
    const s = this.scene, W = this.world.layout.w, H = this.world.layout.h;
    const isLoft = (this.world.layout.id === 'loft-1') || (theme === 'loft') || (this.theme === 'loft');
    if (this.hemi) s.remove(this.hemi);
    if (this.sun) { s.remove(this.sun); s.remove(this.sun.target); }
    if (this.fill) { s.remove(this.fill); s.remove(this.fill.target); }
    if (this.pointLights) {
      for (const pl of this.pointLights) s.remove(pl);
    }
    this.pointLights = [];

    if (isLoft) {
      this.hemi = new THREE.HemisphereLight(0xb4a4eb, 0x2b2144, 1.4);
      s.add(this.hemi);
      const d = this.sun = new THREE.DirectionalLight(0xffecd2, 1.6);
      d.position.set(W / 2 - 8, 20, H / 2 - 10);
      d.target.position.set(W / 2, 0, H / 2);
      d.castShadow = true;
      d.shadow.mapSize.set(2048, 2048);
      const c = d.shadow.camera; c.left = -16; c.right = 16; c.top = 14; c.bottom = -14; c.near = 1; c.far = 60;
      d.shadow.bias = -0.0005; d.shadow.normalBias = 0.03;
      s.add(d, d.target);
      const fill = this.fill = new THREE.DirectionalLight(0x9db8ff, 0.5);
      fill.position.set(W / 2 + 10, 12, H / 2 + 8);
      fill.target.position.set(W / 2, 0, H / 2);
      s.add(fill, fill.target);

      [[5, 2.5, 0xffd166], [10, 2.5, 0x54e0ee], [15, 8.5, 0xffb84a], [4, 9, 0xff4d9a], [10, 12, 0x8a5cff]].forEach(([x, z, col]) => {
        const l = new THREE.PointLight(col, 12, 8, 1.6);
        l.position.set(x, 2.2, z);
        s.add(l);
        this.pointLights.push(l);
      });
    } else {
      this.hemi = new THREE.HemisphereLight(0xa994e8, 0x33254f, 1.5);
      s.add(this.hemi);
      const d = this.sun = new THREE.DirectionalLight(0xffe2c0, 1.7);
      d.position.set(W / 2 - 10, 24, H / 2 - 14);
      d.target.position.set(W / 2, 0, H / 2);
      d.castShadow = true;
      d.shadow.mapSize.set(2048, 2048);
      const c = d.shadow.camera; c.left = -20; c.right = 20; c.top = 18; c.bottom = -18; c.near = 1; c.far = 70;
      d.shadow.bias = -0.0005; d.shadow.normalBias = 0.03;
      s.add(d, d.target);
      const fill = this.fill = new THREE.DirectionalLight(0x8fb8ff, 0.55);
      fill.position.set(W / 2 + 12, 14, H / 2 + 10);
      fill.target.position.set(W / 2, 0, H / 2);
      s.add(fill, fill.target);

      [[6.5, 1.5, 0xff4d9a], [19.5, 1.5, 0x35e0ff], [12, 8, 0x8a5cff], [23, 8, 0xffb84a], [4, 13, 0x35e0c9]].forEach(([x, z, c]) => {
        const l = new THREE.PointLight(c, 14, 9, 1.6);
        l.position.set(x, 2.2, z);
        s.add(l);
        this.pointLights.push(l);
      });
    }
  }
  _room(theme) {
    const { w, h } = this.world.layout, s = this.scene;
    const isDistrict = !!(this.world.layout.buildings && this.world.layout.buildings.length);
    const isLoft = (this.world.layout.id === 'loft-1') || (theme === 'loft') || (this.theme === 'loft');
    this.districtFloors = [];
    this.baseboards = [];
    this.pendants = [];

    const ft = document.createElement('canvas'); ft.width = ft.height = 256; const g = ft.getContext('2d');
    if (isDistrict) {
      // Dark asphalt / promenade cobblestone texture
      g.fillStyle = '#161726'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 2;
      g.strokeRect(2, 2, 252, 252);
    } else if (isLoft) {
      // Polished dark walnut hardwood floor planks
      g.fillStyle = '#3a2415'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) {
        g.fillStyle = (Math.floor(y / 32) % 2 === 0) ? '#3e2717' : '#352012';
        g.fillRect(0, y, 256, 32);
        g.strokeStyle = '#231409'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
      }
      g.strokeStyle = '#231409'; g.lineWidth = 2;
      for (let row = 0; row < 8; row++) {
        const y = row * 32;
        const offset = (row % 3) * 80;
        for (let x = offset; x < 256; x += 128) {
          g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke();
        }
      }
      g.fillStyle = 'rgba(255, 235, 200, 0.03)';
      for (let i = 0; i < 24; i++) {
        g.fillRect(0, Math.random() * 256, 256, 1);
      }
    } else {
      for (let i = 0; i < 4; i++) { g.fillStyle = (i % 3 === 0) ? '#2e2a52' : '#27234a'; g.fillRect((i % 2) * 128, (i >> 1) * 128, 128, 128); }
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    }
    const tex = new THREE.CanvasTexture(ft); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(w / 2, h / 2); tex.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, h), new THREE.MeshStandardMaterial({
      map: tex,
      roughness: isLoft ? 0.35 : 0.45,
      metalness: isLoft ? 0.15 : 0.1
    }));
    floor.position.set(w / 2, -0.15, h / 2); floor.receiveShadow = true; s.add(floor); this.floor = floor;

    // Themed building floor insets for district
    if (isDistrict) {
      for (const b of this.world.layout.buildings) {
        const { x, y, w: bw, h: bh } = b.bounds;
        const bft = document.createElement('canvas'); bft.width = bft.height = 128; const bg = bft.getContext('2d');
        if (b.floor === 'diner') {
          bg.fillStyle = '#f5f5f5'; bg.fillRect(0, 0, 128, 128);
          bg.fillStyle = '#222222'; bg.fillRect(0, 0, 64, 64); bg.fillRect(64, 64, 64, 64);
        } else if (b.floor === 'bodega') {
          bg.fillStyle = '#eaeded'; bg.fillRect(0, 0, 128, 128);
          bg.strokeStyle = '#bdc3c7'; bg.lineWidth = 3; bg.strokeRect(1, 1, 126, 126);
        } else if (b.floor === 'lofts') {
          bg.fillStyle = '#5a3a24'; bg.fillRect(0, 0, 128, 128);
          bg.fillStyle = '#4a2f1c'; bg.fillRect(0, 0, 64, 128);
          bg.strokeStyle = 'rgba(0,0,0,0.2)'; bg.lineWidth = 2; bg.strokeRect(1, 1, 126, 126);
        } else if (b.floor === 'backrooms') {
          bg.fillStyle = '#141416'; bg.fillRect(0, 0, 128, 128);
          bg.fillStyle = '#22252a'; for (let k = 0; k < 128; k += 16) { bg.fillRect(0, k, 128, 2); bg.fillRect(k, 0, 2, 128); }
        } else {
          bg.fillStyle = '#261b40'; bg.fillRect(0, 0, 128, 128);
          bg.strokeStyle = 'rgba(255, 77, 154, 0.2)'; bg.lineWidth = 2; bg.strokeRect(1, 1, 126, 126);
        }
        const bTex = new THREE.CanvasTexture(bft); bTex.colorSpace = THREE.SRGBColorSpace; bTex.wrapS = bTex.wrapT = THREE.RepeatWrapping; bTex.repeat.set(bw / 2, bh / 2);
        const bMesh = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.2, bh - 0.2), new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.5, metalness: 0.1 }));
        bMesh.rotation.x = -Math.PI / 2;
        bMesh.position.set(x + bw / 2, 0.005, y + bh / 2);
        bMesh.receiveShadow = true;
        s.add(bMesh);
        this.districtFloors.push(bMesh);
      }
    }
    const wallColor = isLoft ? 0x282a3d : 0x4b3f80;
    const trimColor = isLoft ? 0x121420 : 0x1a1530;
    const wm = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 }), trim = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.7 });
    this.walls = [
      { n: [0, -1], H: 3.0, mesh: this._wall(w, 1, wm, w / 2, 0.5) , axis: 'z' },   // north (z=0..1)
      { n: [-1, 0], H: 3.0, mesh: this._wall(1, h, wm, 0.5, h / 2), axis: 'x' },    // west
      { n: [0, 1], H: 3.0, mesh: this._wall(w, 0.5, wm, w / 2, h + 0.25), axis: 'z' },   // south (outside)
      { n: [1, 0], H: 3.0, mesh: this._wall(0.5, h, wm, w + 0.25, h / 2), axis: 'x' },   // east (outside)
    ];
    for (const wl of this.walls) wl.cur = wl.H;
    // baseboard strips on the two inner walls
    const bb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.06), trim); bb.position.set(w / 2, 0.09, 1.03); s.add(bb);
    const bb2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, h), trim); bb2.position.set(1.03, 0.09, h / 2); s.add(bb2);
    this.baseboards = [bb, bb2];
    // neon tube strips along the top of the north + west walls
    const nt = (cx, cz, sx, sz, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2) })); m.position.set(cx, 2.7, cz); s.add(m); return m; };
    this.tubes = [nt(w / 2, 1.04, w - 1, 0.04, 0x8a5cff), nt(1.04, h / 2, 0.04, h - 1, 0x35e0ff)];

    // Pool table pendant lamps with soft downward lighting (arcade only)
    if (!isLoft && !isDistrict) {
      const makePendant = (px, pz) => {
        const shade = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.9), new THREE.MeshStandardMaterial({ color: 0x183324, roughness: 0.4, metalness: 0.4 }));
        shade.position.set(px, 2.2, pz);
        const underGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.75), new THREE.MeshBasicMaterial({ color: 0xfff6dd }));
        underGlow.rotation.x = Math.PI / 2; underGlow.position.set(px, 2.08, pz);
        const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8), new THREE.MeshBasicMaterial({ color: 0x333333 }));
        w1.position.set(px - 0.8, 2.65, pz);
        const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8), new THREE.MeshBasicMaterial({ color: 0x333333 }));
        w2.position.set(px + 0.8, 2.65, pz);
        s.add(shade, underGlow, w1, w2);
        this.pendants.push(shade, underGlow, w1, w2);
      };
      makePendant(16, 9);
      makePendant(16, 13);
    }
  }
  _wall(sx, sz, m, cx, cz) { const me = new THREE.Mesh(new THREE.BoxGeometry(sx, 1, sz), m); me.position.set(cx, 0, cz); me.castShadow = me.receiveShadow = true; this.scene.add(me); return me; }
  _buildSingleProp(r) {
    const g = buildProp(r); g.position.set(r.cx, 0, r.cy); g.rotation.y = -(r.r | 0) * Math.PI / 2;
    if (r.T.wall) { const side = r.side || 'n'; g.userData.side = side; if (side === 'n') { g.position.set(r.x + 0.5, 0, 1.02); g.rotation.y = 0; } else { g.position.set(1.02, 0, r.y + 0.5); g.rotation.y = Math.PI / 2; } }
    this.scene.add(g); this.propGroups.set(r.id, g);
    g.traverse(o => { if (o.isMesh) { o.userData.propId = r.id; o.castShadow = o.castShadow && !r.T.flat; if (r.T.flat) o.castShadow = false; } });
    this._rebuildContactShadow(r);
    return g;
  }
  _props() {
    resetAnimated();
    for (const r of this.world.props.values()) this._buildSingleProp(r);
  }
  _addPropMesh(r) {
    if (this.propGroups.has(r.id)) this._removePropMesh(r.id);
    this._buildSingleProp(r);
  }
  _movePropMesh(r) {
    const g = this.propGroups.get(r.id);
    if (!g) { this._addPropMesh(r); return; }
    g.position.set(r.cx, 0, r.cy); g.rotation.y = -(r.r | 0) * Math.PI / 2;
    if (r.T.wall) { const side = r.side || 'n'; g.userData.side = side; if (side === 'n') { g.position.set(r.x + 0.5, 0, 1.02); g.rotation.y = 0; } else { g.position.set(1.02, 0, r.y + 0.5); g.rotation.y = Math.PI / 2; } }
    this._rebuildContactShadow(r);
  }
  _removePropMesh(id) {
    const g = this.propGroups.get(id);
    if (g) {
      this.scene.remove(g);
      this.propGroups.delete(id);
      g.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    this._removeContactShadow(id);
  }
  _rebuildContactShadow(r) {
    this._removeContactShadow(r.id);
    if (!this.softShadows || !this.shadowTex) return;
    if (r.T.flat || r.T.wall || !r.foot || !r.foot.length) return;
    const xs = r.foot.map(t => t.x), ys = r.foot.map(t => t.y), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.9, y1 - y0 + 0.9), new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.013, (y0 + y1) / 2);
    this.softShadows.add(m);
    this.shadowMeshes.set(r.id, m);
  }
  _removeContactShadow(id) {
    const m = this.shadowMeshes && this.shadowMeshes.get(id);
    if (m) {
      this.softShadows.remove(m);
      if (m.geometry) m.geometry.dispose();
      this.shadowMeshes.delete(id);
    }
  }
  setGhost(p, valid) {
    if (!p) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (!this.ghost) {
      const g = this.ghost = new THREE.Group();
      this.ghostMatValid = new THREE.MeshBasicMaterial({ color: 0x5fe08a, transparent: true, opacity: 0.45, depthWrite: false });
      this.ghostMatInvalid = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.45, depthWrite: false });
      this.ghostFoot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ghostMatValid);
      this.ghostFoot.rotation.x = -Math.PI / 2;
      this.ghostFoot.position.y = 0.024;
      g.add(this.ghostFoot);
      this.ghostFace = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 16), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthWrite: false }));
      this.ghostFace.rotation.x = -Math.PI / 2;
      this.ghostFace.position.y = 0.035;
      g.add(this.ghostFace);
      this.scene.add(g);
    }
    this.ghost.visible = true;
    const r = resolve(p);
    this.ghostFoot.material = valid ? this.ghostMatValid : this.ghostMatInvalid;
    if (r.foot.length) {
      const xs = r.foot.map(t => t.x), ys = r.foot.map(t => t.y), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
      this.ghostFoot.scale.set(x1 - x0, y1 - y0, 1);
      this.ghostFoot.position.set((x0 + x1) / 2, 0.024, (y0 + y1) / 2);
    } else {
      this.ghostFoot.scale.set(1, 1, 1);
      this.ghostFoot.position.set(r.cx, 0.024, r.cy);
    }
    const f = FACE[(p.r || 0) & 3];
    this.ghostFace.position.set(r.cx + f[0] * 0.45, 0.035, r.cy + f[1] * 0.45);
    this.ghostFace.rotation.z = Math.atan2(f[0], f[1]) - Math.PI / 2;
  }
  _markers() {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 32), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; this.scene.add(ring); this.dest = ring;
    this.hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.3, depthWrite: false }));
    this.hl.rotation.x = -Math.PI / 2; this.hl.position.y = 0.025; this.hl.visible = false; this.scene.add(this.hl);
    this.useMarks = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.visible = false; this.scene.add(m); this.useMarks.push(m); }
  }
  setDest(x, y) { if (x == null) { this.dest.visible = false; return; } this.dest.visible = true; this.dest.position.x = x; this.dest.position.z = y; this.destT = this.t; }
  setHoverProp(id) {
    this.hover = id; const r = id && this.world.props.get(id);
    if (!r || r.T.flat || r.T.wall || !r.uses.length) { this.hl.visible = false; this.useMarks.forEach(m => m.visible = false); return; }
    const xs = r.foot.map(t => t.x), ys = r.foot.map(t => t.y), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    this.hl.visible = true; this.hl.scale.set(x1 - x0 + 0.1, y1 - y0 + 0.1, 1); this.hl.position.set((x0 + x1) / 2, 0.025, (y0 + y1) / 2);
    this.useMarks.forEach((m, i) => { const u = r.uses[i]; if (u && !this.world.occ.has(u.id)) { m.visible = true; m.position.set(u.tile.x + 0.5, 0.03, u.tile.y + 0.5); } else m.visible = false; });
  }

  // ---- camera -----------------------------------------------------------
  rotate(dir) { this.yawTo -= dir * Math.PI / 2; }
  orbit(dYaw, dPitch) {
    this.yawTo = (this.yawTo - dYaw) % (Math.PI * 2);
    if (this.camMode === '3d') {
      const minP = 4 * Math.PI / 180, maxP = 62 * Math.PI / 180;
      this.pitch3DTo = Math.max(minP, Math.min(maxP, this.pitch3DTo + dPitch));
    }
  }
  zoom3D(f) { this.dist3DTo = Math.max(2.5, Math.min(24.0, this.dist3DTo * f)); }
  zoomBy(f) {
    if (this.camMode === '3d') this.zoom3D(f);
    else this.zoomTo = Math.min(16, Math.max(4.5, this.zoomTo * f));
  }
  follow(id) { this.followId = id; if (!id) this.target.set(this.world.layout.w / 2, 0.6, this.world.layout.h / 2); }
  teleportCamera(x, z) {
    this.target.x = x;
    this.target.z = z;
    this.look.x = x;
    this.look.z = z;
    this.follow('me');
  }
  panBy(dx, dz) { this.followId = null; this.target.x = Math.min(this.world.layout.w, Math.max(0, this.target.x + dx)); this.target.z = Math.min(this.world.layout.h, Math.max(0, this.target.z + dz)); }
  resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    this.r.setSize(w, h);
    this.aspect = w / h;
    this.perspCam.aspect = this.aspect;
    this.perspCam.updateProjectionMatrix();
    this._fit();
    if (this._composer) { this._composer.setPixelRatio(this.r.getPixelRatio()); this._composer.setSize(w, h); }
  }
  _fit() { const z = this.zoom, a = this.aspect || 1; Object.assign(this.orthoCam, { left: -z * a, right: z * a, top: z, bottom: -z }); this.orthoCam.updateProjectionMatrix(); }
  _camUpdate(dt) {
    if (this._intro) { this.yawTo = Math.PI / 4; if (Math.abs(angDiff(this.yaw, this.yawTo)) < 0.02) this._intro = false; }
    this.yaw += angDiff(this.yaw, this.yawTo) * Math.min(1, dt * 8); if (Math.abs(angDiff(this.yaw, this.yawTo)) < 1e-4) this.yaw = this.yawTo;
    this.pitch3D += (this.pitch3DTo - this.pitch3D) * Math.min(1, dt * 8);
    this.dist3D += (this.dist3DTo - this.dist3D) * Math.min(1, dt * 8);
    this.zoom += (this.zoomTo - this.zoom) * Math.min(1, dt * 8); this._fit();
    const W = this.world.layout.w, H = this.world.layout.h;
    const f = this.followId && this.avatars.get(this.followId);
    if (f) { this.target.x = f.position.x; this.target.z = f.position.z; }
    this.look.lerp(new THREE.Vector3(this.target.x, this.camMode === '3d' ? 1.2 : 0.6, this.target.z), Math.min(1, dt * 8));

    if (this.camMode === '3d') {
      const cp = Math.cos(this.pitch3D), sp = Math.sin(this.pitch3D);
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      let cx = this.look.x + sy * cp * this.dist3D;
      let cyPos = this.look.y + sp * this.dist3D;
      let cz = this.look.z + cy * cp * this.dist3D;
      // Keep perspective camera inside boundaries with generous margin for zoom
      cx = Math.max(-10, Math.min(W + 10, cx));
      cz = Math.max(-10, Math.min(H + 10, cz));
      cyPos = Math.max(0.6, Math.min(18.0, cyPos));
      this.perspCam.position.set(cx, cyPos, cz);
      this.perspCam.lookAt(this.look);
      this.perspCam.updateMatrixWorld();
    } else {
      // Classic Isometric mode
      const d = 60, cy = Math.cos(PITCH);
      this.orthoCam.position.set(this.look.x + Math.sin(this.yaw) * cy * d, this.look.y + Math.sin(PITCH) * d, this.look.z + Math.cos(this.yaw) * cy * d);
      this.orthoCam.lookAt(this.look);
      this.orthoCam.updateMatrixWorld();
    }

    // Front wall cut-away: smoothly drop any walls facing the camera to a low 0.22 rail
    // so the interior of the lounge is never blocked
    const cx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
    for (const wl of this.walls) {
      const near = (cx * wl.n[0] + cz * wl.n[1]) > 0.2, want = near ? 0.22 : wl.H;
      wl.cur += (want - wl.cur) * Math.min(1, dt * 9);
      wl.mesh.scale.y = wl.cur;
      wl.mesh.position.y = wl.cur / 2;
    }
    this.tubes[0].visible = (cz * -1) <= 0.2;
    this.tubes[1].visible = (cx * -1) <= 0.2;
    for (const [id, g] of this.propGroups) {
      const r = this.world.props.get(id);
      if (r && r.T && r.T.wall) g.visible = g.userData.side === 'w' ? (cx * -1) <= 0.2 : (cz * -1) <= 0.2;
    }
  }

  // ---- quality / environment polish -------------------------------------
  setQuality(q) {
    this.quality = q; const r = this.r;
    if (this._composer) { this._composer.dispose?.(); this._composer = null; }
    if (this.dust) this.dust.visible = q !== 'low';
    this.softShadows && (this.softShadows.visible = true);
    this.sweep && (this.sweep.visible = q !== 'low');
    r.shadowMap.enabled = true; this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q === 'low' ? 1024 : 2048, q === 'low' ? 1024 : 2048); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    if (q === 'low') { r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25)); this.resize(); return; }
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 2 });
    const c = this._composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.cam);
    c.addPass(this.renderPass);
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), q === 'high' ? 0.62 : 0.5, 0.65, 0.88); c.addPass(bloom); this.bloom = bloom;
    c.addPass(new OutputPass()); this.resize();
  }
  _env(theme) {
    const { w, h } = this.world.layout, s = this.scene;
    const isLoft = (this.world.layout.id === 'loft-1') || (theme === 'loft') || (this.theme === 'loft');
    // soft contact shadows under every solid prop (cheap ambient occlusion)
    const cs = document.createElement('canvas'); cs.width = cs.height = 128; const g = cs.getContext('2d'); g.filter = 'blur(10px)'; g.fillStyle = '#000'; g.fillRect(26, 26, 76, 76);
    const ct = new THREE.CanvasTexture(cs); this.softShadows = new THREE.Group(); s.add(this.softShadows);
    this.shadowTex = ct; this.shadowMeshes = new Map();
    for (const r of this.world.props.values()) this._rebuildContactShadow(r);
    // darkening along the two back walls
    this.backWallGradients = [];
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 64; const gg = gc.getContext('2d'); const gr = gg.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 64);
    const gt = new THREE.CanvasTexture(gc), gm = () => new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false });
    const a = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, 1.4), gm()); a.rotation.x = -Math.PI / 2; a.position.set(1 + (w - 1) / 2, 0.012, 1.7); s.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(h - 1, 1.4), gm()); b.rotation.set(-Math.PI / 2, 0, Math.PI / 2); b.position.set(1.7, 0.012, 1 + (h - 1) / 2); s.add(b);
    this.backWallGradients.push(a, b);
    // additive light pools on the floor
    const pool = (x, z, c, size, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: radialTex(c), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); s.add(m); return m; };
    if (isLoft) {
      this.pools = [
        pool(3, 2.5, '#ffd166', 6, 0.35),
        pool(9.5, 2.5, '#35e0ff', 5, 0.35),
        pool(13.5, 2.5, '#38ada9', 5, 0.3),
        pool(4, 8.5, '#ff4d9a', 6, 0.28),
        pool(14, 8, '#ffb84a', 6, 0.32),
        pool(10, 11, '#8a5cff', 7, 0.25)
      ];
      this.sweep = pool(10, 8, '#35e0ff', 6, 0.22);
    } else {
      this.pools = [pool(4.5, 3.2, '#ff4d9a', 9, 0.4), pool(10, 3, '#6fe08a', 4, 0.35), pool(13.5, 3, '#ffb84a', 4.5, 0.4), pool(3, 6, '#4dd0ff', 5, 0.3), pool(21, 8, '#35e0ff', 6, 0.3), pool(12.5, 11, '#8a5cff', 8, 0.35), pool(17.5, 9.5, '#fff2c0', 6, 0.22), pool(17.5, 13.5, '#fff2c0', 6, 0.22), pool(20, 4, '#35e0c9', 5, 0.25)];
      this.sweep = pool(12, 10, '#ff4d9a', 6, 0.3);
    }
    // floating dust motes catch the bloom
    const N = isLoft ? 90 : 140, pos = new Float32Array(N * 3); this.dustSeed = [];
    for (let i = 0; i < N; i++) { pos[i * 3] = 1 + Math.random() * (w - 2); pos[i * 3 + 1] = 0.3 + Math.random() * 3; pos[i * 3 + 2] = 1 + Math.random() * (h - 2); this.dustSeed.push(Math.random() * 6.28); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, color: isLoft ? 0xffdfba : 0xcfc2ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })); s.add(this.dust);

    // City Sky, Distant Skyline & Stars (kept aside for classic lounge to prevent camera blockage)
    if (this.isDistrict) {
      this._createSkyAndSkyline();
    }
  }

  _createSkyAndSkyline() {
    const s = this.scene;
    const W = this.world.layout.w, H = this.world.layout.h;
    const centerX = W / 2, centerZ = H / 2;

    // 1. Procedural Gradient Sky Dome (inverted sphere)
    const skyGeo = new THREE.SphereGeometry(150, 32, 16);
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 128;
    this.skyCanvas.height = 256;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyMat = new THREE.MeshBasicMaterial({
      map: this.skyTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.position.set(centerX, 0, centerZ);
    s.add(this.skyDome);

    // Initial sky gradient render
    this._drawSkyGradient('night');

    // 2. Starfield Dome (upper hemisphere points)
    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    this.starSeeds = [];
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.1);
      const rad = 145;
      starPos[i * 3] = centerX + rad * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = rad * Math.cos(phi);
      starPos[i * 3 + 2] = centerZ + rad * Math.sin(phi) * Math.sin(theta);
      this.starSeeds.push(Math.random() * 6.28);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 2.2,
      sizeAttenuation: false,
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    s.add(this.stars);

    // 3. Distant City Skyline (low-poly skyscrapers in an outer perimeter ring)
    this.skyline = new THREE.Group();
    s.add(this.skyline);
    this.beacons = [];
    this.crowns = [];

    const numTowers = 46;
    const baseColors = [0x0d0b1a, 0x110f24, 0x15122b, 0x0f1426, 0x18132e];
    const neonAccents = [0x35e0ff, 0xff4d9a, 0x8a5cff, 0xffb84a, 0x33ff88, 0x00f0ff];

    // Texture for tower window facade grid
    const winCanvas = document.createElement('canvas');
    winCanvas.width = 64; winCanvas.height = 128;
    const wg = winCanvas.getContext('2d');
    wg.fillStyle = '#090814'; wg.fillRect(0, 0, 64, 128);
    wg.fillStyle = '#fffae0';
    for (let wy = 8; wy < 120; wy += 12) {
      for (let wx = 6; wx < 58; wx += 10) {
        if (Math.random() > 0.45) {
          wg.globalAlpha = 0.2 + Math.random() * 0.7;
          wg.fillRect(wx, wy, 5, 6);
        }
      }
    }
    wg.globalAlpha = 1.0;
    const winTex = new THREE.CanvasTexture(winCanvas);
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    winTex.colorSpace = THREE.SRGBColorSpace;

    for (let i = 0; i < numTowers; i++) {
      const angle = (i / numTowers) * Math.PI * 2 + (Math.sin(i * 3) * 0.05);
      const dist = (this.isDistrict ? 70 : 40) + (Math.sin(i * 7) * 12 + 10);
      const tx = centerX + Math.cos(angle) * dist;
      const tz = centerZ + Math.sin(angle) * dist;

      const tw = 4 + (i % 5) * 1.5;
      const td = 4 + ((i + 2) % 4) * 1.6;
      const th = (this.isDistrict ? 14 : 9) + ((i * 13) % 26);

      const bColor = baseColors[i % baseColors.length];
      const towerMat = new THREE.MeshStandardMaterial({
        color: bColor,
        roughness: 0.65,
        metalness: 0.3,
        map: winTex
      });
      const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), towerMat);
      tower.position.set(tx, th / 2, tz);
      tower.lookAt(centerX, th / 2, centerZ);
      this.skyline.add(tower);

      // Neon roof crown
      const accent = neonAccents[i % neonAccents.length];
      const crownMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2.0) });
      const crown = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.15, 0.4, td + 0.15), crownMat);
      crown.position.set(tx, th + 0.2, tz);
      crown.rotation.y = tower.rotation.y;
      this.skyline.add(crown);
      this.crowns.push(crown);

      // Spire antennas with aviation blink beacons on tall towers
      if (th > 20) {
        const spireH = 4 + (i % 4) * 2;
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.15, spireH, 8), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }));
        spire.position.set(tx, th + spireH / 2, tz);
        this.skyline.add(spire);

        const beaconMat = new THREE.MeshBasicMaterial({ color: (i % 2 === 0 ? 0xff3b30 : 0xffffff) });
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), beaconMat);
        beacon.position.set(tx, th + spireH + 0.15, tz);
        this.skyline.add(beacon);
        this.beacons.push({ mesh: beacon, phase: (i * 0.37) % 1 });
      }
    }
  }

  _drawSkyGradient(phaseId) {
    if (!this.skyCanvas) return;
    const g = this.skyCanvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);

    if (phaseId === 'dawn') {
      grad.addColorStop(0.0, '#0c071e');  // Tropical dawn zenith
      grad.addColorStop(0.4, '#241445');  // Lavender wash
      grad.addColorStop(0.7, '#ff4d9a');  // Hot pink neon band
      grad.addColorStop(0.88, '#ff9a76'); // Soft coral peach
      grad.addColorStop(1.0, '#ffd166');  // Amber sunrise horizon
    } else if (phaseId === 'day') {
      grad.addColorStop(0.0, '#0d2b52');  // Coastal sky zenith
      grad.addColorStop(0.45, '#1e73be'); // Miami electric blue
      grad.addColorStop(0.8, '#54e0ee');  // Bright turquoise horizon
      grad.addColorStop(1.0, '#dff9fb');  // Sunlit horizon
    } else if (phaseId === 'sunset') {
      grad.addColorStop(0.0, '#240a3d');  // Midnight violet
      grad.addColorStop(0.35, '#6a097d'); // Neon magenta purple
      grad.addColorStop(0.65, '#e03e52'); // Miami sunset rose
      grad.addColorStop(0.85, '#ff793f'); // Radiant tangerine
      grad.addColorStop(1.0, '#f9ca24');  // Golden hour rim
    } else if (phaseId === 'twilight') {
      grad.addColorStop(0.0, '#0d021a');  // Pitch obsidian
      grad.addColorStop(0.4, '#360940');  // Anomalous plum
      grad.addColorStop(0.75, '#7b1158'); // Glitched magenta
      grad.addColorStop(1.0, '#ff2a7a');  // Neon pink rift
    } else {
      // Night (Miami Nights default: electric neon horizon reflection)
      grad.addColorStop(0.0, '#060312');  // Deep velvet obsidian
      grad.addColorStop(0.38, '#140c2b'); // Night sky purple
      grad.addColorStop(0.7, '#2f124d');  // Neon violet haze
      grad.addColorStop(0.88, '#ff357a'); // Miami hot pink glow
      grad.addColorStop(0.96, '#35e0ff'); // Turquoise neon reflection
      grad.addColorStop(1.0, '#ffd166');  // Distant warm avenue rim
    }

    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    this.skyTex.needsUpdate = true;
  }

  _envUpdate(dt) {
    const t = this.t, sp = this.music ? 1.8 : 0.7, w = this.world.layout.w, h = this.world.layout.h;
    const hue = (t * 0.06 * sp) % 1; this.sweep.material.color.setHSL(hue, 0.9, 0.6); this.sweep.position.set(12.5 + Math.cos(t * 0.5 * sp) * 4, 0.022, 10 + Math.sin(t * 0.7 * sp) * 2.5);
    this.sweep.material.opacity = 0.28 + (this.music ? Math.abs(Math.sin(t * 7)) * 0.2 : 0);
    this.pools.forEach((p, i) => { p.material.opacity = (p.userData.base ??= p.material.opacity) * (0.9 + 0.1 * Math.sin(t * 1.3 + i)); });
    if (this.dust.visible) { const a = this.dust.geometry.attributes.position; for (let i = 0; i < this.dustSeed.length; i++) { a.array[i * 3 + 1] += Math.sin(t * 0.4 + this.dustSeed[i]) * dt * 0.05; a.array[i * 3] += Math.cos(t * 0.2 + this.dustSeed[i]) * dt * 0.04; } a.needsUpdate = true; }

    // Skyscraper aviation beacon blink animation
    if (this.beacons) {
      for (const b of this.beacons) {
        const on = ((this.t * 1.4 + b.phase) % 1) > 0.45;
        b.mesh.visible = on;
      }
    }
  }
  // camera focus on a prop (used when sitting down at a game) and release
  focus(x, z, zoom) { this._saved = this._saved || { follow: this.followId, zoom: this.zoomTo, dist: this.dist3DTo }; this.followId = null; this.target.set(x, 0.8, z); this.zoomTo = zoom; this.dist3DTo = 3.6; }
  unfocus() { if (!this._saved) return; const s = this._saved; this._saved = null; this.zoomTo = s.zoom; this.dist3DTo = s.dist || 9.5; this.follow(s.follow); }

  // ---- people -----------------------------------------------------------
  _ensure(p) {
    let av = this.avatars.get(p.id);
    if (!av) {
      av = buildAvatar(p.loadout); av.position.set(p.x, 0, p.y); this.scene.add(av); this.avatars.set(p.id, av);
      if (!this.tags.has(p.id)) { const el = document.createElement('div'); el.className = 'ntag' + (p.human ? ' me' : ''); el.innerHTML = '<div class="bub"></div><div class="nm"></div>'; el.querySelector('.nm').textContent = p.name;
      this.tagsEl.appendChild(el); this.tags.set(p.id, { el, bub: el.firstChild, text: '' }); }
    }
    return av;
  }
  _drop(id, rebuild) { const av = this.avatars.get(id); if (av) { this.scene.remove(av); this.avatars.delete(id); } if (!rebuild) { const t = this.tags.get(id); if (t) { t.el.remove(); this.tags.delete(id); } } }
  update(dt) {
    this.t += dt; const W = this.world;
    for (const p of W.people.values()) {
      const av = this._ensure(p);
      const dist = Math.hypot(p.x - av.position.x, p.y - av.position.z);
      if (dist > 3.0) { av.position.x = p.x; av.position.z = p.y; }
      else { av.position.x += (p.x - av.position.x) * Math.min(1, dt * 20); av.position.z += (p.y - av.position.z) * Math.min(1, dt * 20); }
      av.rotation.y = p.vis;
      pose(av, p, this.t, dt);
      const tg = this.tags.get(p.id), txt = p.say ? p.say.text : '';
      if (tg.text !== txt) { tg.text = txt; tg.bub.textContent = txt; tg.bub.style.display = txt ? 'block' : 'none'; }
    }
    tickScreens(this.t);
    if (this.dest.visible) { const k = (this.t - (this.destT || 0)); this.dest.scale.setScalar(1 + Math.sin(k * 8) * 0.08); }
    this._camUpdate(dt);
    // Twilight Phase shift interpolation
    const targetK = this.phase === 'twilight' ? 1 : 0;
    this.phaseK += (targetK - this.phaseK) * Math.min(1, dt * 2.2);
    if (this.sun && this.hemi) {
      this.sun.color.lerpColors(new THREE.Color(0xffe2c0), new THREE.Color(0xff5e36), this.phaseK);
      this.sun.intensity = 1.7 * (1 - this.phaseK * 0.45);
      this.hemi.color.lerpColors(new THREE.Color(0xa994e8), new THREE.Color(0x5a2d8c), this.phaseK);
      this.hemi.groundColor.lerpColors(new THREE.Color(0x33254f), new THREE.Color(0x0a0614), this.phaseK);
    }
    if (this.bloom) {
      this.bloom.threshold = 0.88 - this.phaseK * 0.18;
      this.bloom.strength = (this.quality === 'high' ? 0.62 : 0.5) + this.phaseK * 0.35;
    }
    if (this.phaseK > 0.4 && this.pointLights) {
      for (let i = 0; i < this.pointLights.length; i++) {
        const pl = this.pointLights[i];
        const flicker = Math.sin(this.t * 14 + i * 3.7) > 0.94 ? 0.35 : 1.0;
        pl.intensity = 14 * (1 - this.phaseK * 0.2) * flicker;
      }
    }
    for (const g of this.propGroups.values()) if (g.userData.jukebox) g.userData.jukebox.rotation.y += dt * (this.music ? 3 : 0.5);
    this._envUpdate(dt);
    this.useMarks.forEach(m => { if (m.visible) m.scale.setScalar(1 + Math.sin(this.t * 6) * 0.1); });
    // DOM tags
    const w = this.host.clientWidth, h = this.host.clientHeight, v = new THREE.Vector3();
    for (const [id, tg] of this.tags) {
      const av = this.avatars.get(id);
      if (!av) continue;
      v.set(av.position.x, 1.75 + (av.userData.hips.position.y - 0.44), av.position.z).project(this.cam);
      if (this.camMode === '3d' && (v.z > 1.0 || v.z < -1.0)) {
        tg.el.style.display = 'none';
        continue;
      }
      tg.el.style.display = 'block';
      tg.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px,${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
  render() { if (this._composer) this._composer.render(); else this.r.render(this.scene, this.cam); }

  // ---- picking ----------------------------------------------------------
  pick(cx, cy, allProps = false) {
    const rc = this.r.domElement.getBoundingClientRect(), nx = ((cx - rc.left) / rc.width) * 2 - 1, ny = -((cy - rc.top) / rc.height) * 2 + 1;
    this.ray.setFromCamera({ x: nx, y: ny }, this.cam);
    const meshes = []; for (const [id, g] of this.propGroups) { const r = this.world.props.get(id); if (r && (allProps || (!r.T.flat && !r.T.wall)) && g.visible) g.traverse(o => o.isMesh && meshes.push(o)); }
    const hit = this.ray.intersectObjects(meshes, false)[0];
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3(); const ok = this.ray.ray.intersectPlane(pl, pt);
    // avatar hit?
    let person = null; { const am = []; for (const [id, av] of this.avatars) av.traverse(o => { if (o.isMesh) { o.userData.pid = id; am.push(o); } }); const ah = this.ray.intersectObjects(am, false)[0]; if (ah && (!hit || ah.distance < hit.distance)) person = ah.object.userData.pid; }
    return { prop: hit ? hit.object.userData.propId : null, person, tile: ok ? { x: Math.floor(pt.x), y: Math.floor(pt.z), fx: pt.x, fy: pt.z } : null };
  }
}
