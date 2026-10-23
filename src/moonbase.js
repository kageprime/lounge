// Moon Base Tabletop Diorama Stage: "Artemis Outpost Alpha"
// Pure Three.js tabletop diorama with living simulation, animated structures, 
// day/night Earthrise, particle effects, elevated rail loop, and interactive controls.
import * as THREE from 'three';

const matStd = (col, r = 0.4, m = 0.2) => new THREE.MeshStandardMaterial({ color: col, roughness: r, metalness: m });
const matGlow = (col, intensity = 2.2) => new THREE.MeshStandardMaterial({
  color: col,
  emissive: col,
  emissiveIntensity: intensity,
  roughness: 0.2
});

export class MoonBaseStage {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.sound = options.sound || null;
    this.onReturn = options.onReturn || (() => {});
    this.onToast = options.onToast || ((msg) => console.log(msg));

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    // Simulation settings & time
    this.simSpeed = 1.0;
    this.isPaused = false;
    this.timeOfDay = 0.25; // 0..1 (0 = dawn, 0.25 = noon, 0.75 = night)
    this.autoDayCycle = true;
    this.dayDuration = 120; // seconds for a full lunar day
    this.simTime = 0;
    this.lightsOn = true;
    this.shadowsEnabled = true;
    this.showLabels = true;

    // Animation & Entity states
    this.rocketState = 'ready'; // ready | countdown | launching | resetting
    this.rocketLaunchT = 0;
    this.hopperState = 'idle'; // idle | flying
    this.hopperFlightT = 0;
    this.growLightMode = 0; // 0 = magenta, 1 = cyan, 2 = solar
    this.roverPatrolActive = false;
    this.trainFollowMode = false;
    this.meteorShowerActive = false;
    this.meteorTimer = 0;
    this.dustStormActive = false;

    // Camera orbit parameters (Tabletop diorama default view)
    this.defaultCam = {
      yaw: Math.PI / 4,
      pitch: 34 * Math.PI / 180,
      dist: 28,
      target: new THREE.Vector3(0, 1.2, 0)
    };
    this.camYaw = this.defaultCam.yaw;
    this.camYawTo = this.camYaw;
    this.camPitch = this.defaultCam.pitch;
    this.camPitchTo = this.camPitch;
    this.camDist = this.defaultCam.dist;
    this.camDistTo = this.camDist;
    this.camTarget = this.defaultCam.target.clone();
    this.camTargetTo = this.camTarget.clone();

    // Interaction & drag state
    this.isDragging = false;
    this.dragButton = 0; // 0 = left orbit, 2 = right pan
    this.lastMouse = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.mouseVec = new THREE.Vector2();

    // Scene & Renderer
    this._initScene();
    this._buildRoomAndTable();
    this._buildTerrain();
    this._buildBaseArchitecture();
    this._buildRailAndTrain();
    this._buildEntities();
    this._buildParticleSystems();
    this._buildLabels();
    this._setupInput();

    this.clock = new THREE.Clock();
    this.animFrameId = null;
    this.active = true;
  }

  // ==========================================
  // SCENE & LIGHTING
  // ==========================================
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060713);
    this.scene.fog = new THREE.FogExp2(0x060713, 0.008);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 200);
    this._updateCameraPosition();

    // Lighting: cool cosmic fill and balanced regolith bounce
    this.hemiLight = new THREE.HemisphereLight(0x7f8fa6, 0x2f3640, 1.1);
    this.scene.add(this.hemiLight);

    // Directional Sun Light (Drives dramatic sharp lunar shadows)
    this.sunLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 70;
    const d = 22;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    // Cool fill light reflecting from Earth
    this.earthLight = new THREE.DirectionalLight(0x3584e4, 0.45);
    this.earthLight.position.set(-15, 12, -20);
    this.scene.add(this.earthLight);

    // Dynamic Base Point Lights & Floodlights
    this.baseLights = [];
  }

  // ==========================================
  // ROOM, STARFIELD WALLS, AND WOODEN TABLE
  // ==========================================
  _buildRoomAndTable() {
    const s = this.scene;

    // 1. Pixel-Art Starfield Room Enclosure
    const roomW = 60, roomH = 34, roomD = 50;

    // Starfield Canvas Texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 1024;
    starCanvas.height = 512;
    const ctx = starCanvas.getContext('2d');
    ctx.fillStyle = '#050612';
    ctx.fillRect(0, 0, 1024, 512);

    // Nebula dust clouds
    const nebulae = [
      { x: 300, y: 180, r: 160, col: 'rgba(92, 45, 145, 0.18)' },
      { x: 740, y: 240, r: 210, col: 'rgba(28, 90, 160, 0.16)' },
      { x: 512, y: 320, r: 130, col: 'rgba(255, 77, 154, 0.12)' }
    ];
    nebulae.forEach(n => {
      const grad = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
      grad.addColorStop(0, n.col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Twinkling pixel stars
    const starColors = ['#ffffff', '#a8d8ea', '#ffdda1', '#ff92a5', '#bbf2f6'];
    for (let i = 0; i < 900; i++) {
      const sx = Math.floor(Math.random() * 1024);
      const sy = Math.floor(Math.random() * 512);
      const size = Math.random() < 0.1 ? 2 : 1;
      ctx.fillStyle = starColors[Math.floor(Math.random() * starColors.length)];
      ctx.fillRect(sx, sy, size, size);
    }

    const starTex = new THREE.CanvasTexture(starCanvas);
    starTex.colorSpace = THREE.SRGBColorSpace;
    starTex.wrapS = THREE.RepeatWrapping;
    starTex.repeat.set(2, 1);

    const roomMat = new THREE.MeshBasicMaterial({
      map: starTex,
      side: THREE.BackSide
    });
    const roomBox = new THREE.Mesh(new THREE.BoxGeometry(roomW, roomH, roomD), roomMat);
    roomBox.position.set(0, roomH / 2 - 4, 0);
    s.add(roomBox);

    // 2. Pixel-Art Animated Earth ("The Blue Marble" rising on back wall)
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 256;
    earthCanvas.height = 256;
    const eCtx = earthCanvas.getContext('2d');
    this.earthCanvas = earthCanvas;
    this.eCtx = eCtx;
    this._drawPixelEarth(0);

    const earthTex = new THREE.CanvasTexture(earthCanvas);
    earthTex.colorSpace = THREE.SRGBColorSpace;
    this.earthTex = earthTex;

    const earthGeo = new THREE.SphereGeometry(3.6, 32, 24);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTex,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x1a3d6d,
      emissiveIntensity: 0.45
    });
    this.earthMesh = new THREE.Mesh(earthGeo, earthMat);
    this.earthMesh.position.set(-14, 15, -22);
    s.add(this.earthMesh);

    // Glowing atmospheric halo around Earth
    const earthGlowMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(0.3, 0.65, 1.0, 1.0) * intensity * 1.5;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true
    });
    const earthHalo = new THREE.Mesh(new THREE.SphereGeometry(3.9, 32, 24), earthGlowMat);
    this.earthMesh.add(earthHalo);

    // 3. Wooden Table Frame & Bevel
    const tableW = 34, tableD = 24, tableH = 1.0;
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x2a1b12,
      roughness: 0.42,
      metalness: 0.15
    });
    const tableTrimMat = new THREE.MeshStandardMaterial({
      color: 0x3d281a,
      roughness: 0.35,
      metalness: 0.25
    });

    // Table body
    const tableBody = new THREE.Mesh(new THREE.BoxGeometry(tableW, tableH, tableD), woodMat);
    tableBody.position.set(0, -tableH / 2, 0);
    tableBody.receiveShadow = true;
    s.add(tableBody);

    // Beveled raised table rim/lip
    const rimH = 0.22, rimThick = 0.6;
    // North & South rims
    const rN = new THREE.Mesh(new THREE.BoxGeometry(tableW + rimThick * 2, rimH, rimThick), tableTrimMat);
    rN.position.set(0, rimH / 2, -tableD / 2 - rimThick / 2);
    rN.receiveShadow = true;
    const rS = new THREE.Mesh(new THREE.BoxGeometry(tableW + rimThick * 2, rimH, rimThick), tableTrimMat);
    rS.position.set(0, rimH / 2, tableD / 2 + rimThick / 2);
    rS.receiveShadow = true;
    // East & West rims
    const rE = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimH, tableD), tableTrimMat);
    rE.position.set(tableW / 2 + rimThick / 2, rimH / 2, 0);
    rE.receiveShadow = true;
    const rW = new THREE.Mesh(new THREE.BoxGeometry(rimThick, rimH, tableD), tableTrimMat);
    rW.position.set(-tableW / 2 - rimThick / 2, rimH / 2, 0);
    rW.receiveShadow = true;
    s.add(rN, rS, rE, rW);

    // 4 Sturdy wooden table pedestal legs
    const legGeo = new THREE.BoxGeometry(1.4, 7.5, 1.4);
    const legPositions = [
      [-tableW / 2 + 2, -tableH - 3.75, -tableD / 2 + 2],
      [tableW / 2 - 2, -tableH - 3.75, -tableD / 2 + 2],
      [-tableW / 2 + 2, -tableH - 3.75, tableD / 2 - 2],
      [tableW / 2 - 2, -tableH - 3.75, tableD / 2 - 2]
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, ly, lz);
      s.add(leg);
    });
  }

  _drawPixelEarth(rot) {
    const ctx = this.eCtx, S = 256;
    ctx.clearRect(0, 0, S, S);

    // Base deep ocean blue
    ctx.fillStyle = '#0a235c';
    ctx.fillRect(0, 0, S, S);

    // Pixel continents & landmasses
    ctx.fillStyle = '#2d6a4f';
    const landBlobs = [
      [30, 60, 50, 40], [45, 95, 35, 55], [110, 40, 75, 45],
      [130, 80, 60, 60], [170, 110, 40, 45], [210, 85, 30, 30]
    ];
    landBlobs.forEach(([bx, by, bw, bh]) => {
      const sx = ((bx + rot * 180) % S + S) % S;
      ctx.fillRect(sx, by, bw, bh);
      // Pixel coastlines / mountain highlands
      ctx.fillStyle = '#52b788';
      ctx.fillRect(sx + 6, by + 6, bw - 12, bh - 12);
      ctx.fillStyle = '#d8f3dc';
      ctx.fillRect(sx + 12, by + 10, bw - 24, bh - 20);
      ctx.fillStyle = '#2d6a4f';
    });

    // Swirling white clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    const clouds = [
      [15, 35, 60, 12], [90, 65, 80, 16], [160, 45, 70, 14],
      [40, 160, 95, 18], [140, 180, 110, 20], [200, 140, 50, 14]
    ];
    clouds.forEach(([cx, cy, cw, ch]) => {
      const sx = ((cx + rot * 240) % S + S) % S;
      ctx.fillRect(sx, cy, cw, ch);
      ctx.fillRect(sx + 10, cy - 4, cw - 20, ch + 8);
    });

    // Polar ice caps
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, S, 24);
    ctx.fillRect(0, S - 26, S, 26);
  }

  // ==========================================
  // LUNAR REGOLITH TERRAIN & CRATERS
  // ==========================================
  _buildTerrain() {
    const s = this.scene;
    const tw = 33.6, td = 23.6;
    const segX = 96, segZ = 68;

    const geo = new THREE.PlaneGeometry(tw, td, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo && geo.attributes ? geo.attributes.position : null;

    // Define major craters on the tabletop diorama
    const craters = [
      { x: 9.5, z: 5.5, r: 3.8, depth: 1.1 },    // Mining excavation crater
      { x: -10.0, z: -4.5, r: 2.8, depth: 0.75 }, // North-west boulder crater
      { x: -3.5, z: 6.2, r: 2.0, depth: 0.55 },  // South-central crater
      { x: 11.2, z: -6.5, r: 2.4, depth: 0.62 }, // North-east survey crater
      { x: -12.5, z: 6.8, r: 1.7, depth: 0.45 }, // West outpost crater
      { x: 0.5, z: -8.0, r: 1.5, depth: 0.38 }   // Far North crater
    ];
    this.craters = craters;

    // Perturb vertices for lunar undulating hills and crater depressions
    if (pos && typeof pos.count === 'number') {
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vz = pos.getZ(i);

        // Micro-rolling regolith noise
        let vy = Math.sin(vx * 0.45) * Math.cos(vz * 0.45) * 0.22 +
                 Math.sin(vx * 0.95 + 1.2) * Math.cos(vz * 0.85) * 0.12;

        // Flatten areas around main outpost base structures (around center: x: -5..6, z: -4..3)
        const distFromCenter = Math.hypot(vx, vz);
        if (distFromCenter < 7.0) {
          vy *= Math.pow(distFromCenter / 7.0, 2);
        }

        // Apply crater depressions with elevated rim ridges
        for (const c of craters) {
          if (!c) continue;
          const d = Math.hypot(vx - c.x, vz - c.z);
          if (d < c.r * 1.5) {
            const normD = d / c.r;
            if (normD < 1.0) {
              // Depression inside crater floor
              const craterShape = Math.cos(normD * Math.PI * 0.5);
              vy -= c.depth * Math.pow(craterShape, 1.8);
            } else if (normD < 1.45) {
              // Raised outer rim
              const rimShape = Math.sin((normD - 1.0) / 0.45 * Math.PI);
              vy += (c.depth * 0.22) * rimShape;
            }
          }
        }

        pos.setY(i, vy);
      }
      geo.computeVertexNormals();
    }

    // Regolith Canvas Texture with micro-gravel and rover tracks
    const regCanvas = document.createElement('canvas');
    regCanvas.width = 512;
    regCanvas.height = 512;
    const rCtx = regCanvas.getContext('2d');
    rCtx.fillStyle = '#9aa0a6';
    rCtx.fillRect(0, 0, 512, 512);

    // Stippled gravel dust
    for (let i = 0; i < 8000; i++) {
      const rx = Math.random() * 512;
      const ry = Math.random() * 512;
      const shade = 135 + Math.floor(Math.random() * 45);
      rCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
      rCtx.fillRect(rx, ry, 2, 2);
    }

    // Rover tire tracks (dual parallel indented tread stripes)
    rCtx.strokeStyle = 'rgba(60, 64, 67, 0.45)';
    rCtx.lineWidth = 3;
    rCtx.setLineDash([4, 4]);

    // Path between Garage, Hab, and Launchpad
    rCtx.beginPath();
    rCtx.moveTo(120, 240);
    rCtx.lineTo(260, 240);
    rCtx.lineTo(380, 290);
    rCtx.stroke();
    rCtx.beginPath();
    rCtx.moveTo(120, 248);
    rCtx.lineTo(260, 248);
    rCtx.lineTo(380, 298);
    rCtx.stroke();

    const regTex = new THREE.CanvasTexture(regCanvas);
    regTex.colorSpace = THREE.SRGBColorSpace;
    regTex.wrapS = regTex.wrapT = THREE.RepeatWrapping;
    regTex.repeat.set(4, 3);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: regTex,
      roughness: 0.92,
      metalness: 0.05
    });

    const terrainMesh = new THREE.Mesh(geo, terrainMat);
    terrainMesh.position.set(0, 0.02, 0);
    terrainMesh.receiveShadow = true;
    terrainMesh.userData.isGround = true;
    s.add(terrainMesh);
    this.terrainMesh = terrainMesh;

    // Scattered Lunar Boulders
    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x757b82,
      roughness: 0.88,
      metalness: 0.1
    });
    const boulderGeo = new THREE.DodecahedronGeometry(0.3, 1);
    this.boulders = [];

    const boulderSpots = [
      [-11, -5.5], [-9.2, -3.8], [-10.8, -3.2],
      [10.8, 4.2], [8.2, 7.1], [11.5, 6.8],
      [-5.2, -7.5], [-7.1, 7.8], [4.5, -8.2], [13.2, -4.5]
    ];
    boulderSpots.forEach(([bx, bz], i) => {
      const b = new THREE.Mesh(boulderGeo, boulderMat);
      const scale = 0.6 + (i % 5) * 0.35;
      b.scale.set(scale, scale * (0.7 + Math.random() * 0.4), scale);
      b.position.set(bx, 0.15 * scale, bz);
      b.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      b.castShadow = true;
      b.receiveShadow = true;
      s.add(b);
      this.boulders.push(b);
    });
  }

  // ==========================================
  // BASE ARCHITECTURE & INTERACTIVE STRUCTURES
  // ==========================================
  _buildBaseArchitecture() {
    const s = this.scene;
    this.interactiveObjects = [];

    // 1. HABITAT COMPLEX (Connected geodesic domes)
    this.habGroup = new THREE.Group();
    this.habGroup.position.set(-3.5, 0, 0);

    const domeMat = new THREE.MeshStandardMaterial({
      color: 0xe8eaed,
      roughness: 0.3,
      metalness: 0.45
    });
    const frameMat = matStd(0x3c4043, 0.6, 0.8);
    const windowMat = matGlow(0x35e0ff, 2.0);

    // Central Dome (Main Hub)
    const d1 = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), domeMat);
    d1.position.set(0, 0, 0);
    d1.castShadow = true;
    d1.receiveShadow = true;
    this.habGroup.add(d1);

    // Glowing window strips on central dome
    const win1 = new THREE.Mesh(new THREE.CylinderGeometry(2.21, 2.21, 0.2, 24, 1, true), windowMat);
    win1.position.set(0, 0.9, 0);
    this.habGroup.add(win1);

    // Dome 2 (Crew Quarters - West)
    const d2 = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), domeMat);
    d2.position.set(-3.2, 0, -1.0);
    d2.castShadow = true;
    d2.receiveShadow = true;
    this.habGroup.add(d2);

    // Dome 3 (Science Lab - East)
    const d3 = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), domeMat);
    d3.position.set(0.5, 0, -3.0);
    d3.castShadow = true;
    d3.receiveShadow = true;
    this.habGroup.add(d3);

    // Pressurized Connecting Tunnels
    const makeTunnel = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const angle = Math.atan2(z2 - z1, x2 - x1);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, len, 16), domeMat);
      t.rotation.z = Math.PI / 2;
      t.rotation.y = -angle;
      t.position.set((x1 + x2) / 2, 0.45, (z1 + z2) / 2);
      t.castShadow = true;
      this.habGroup.add(t);
      // Neon guide strip along top
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.08), windowMat);
      strip.rotation.y = -angle;
      strip.position.set((x1 + x2) / 2, 0.94, (z1 + z2) / 2);
      this.habGroup.add(strip);
    };
    makeTunnel(0, 0, -3.2, -1.0);
    makeTunnel(0, 0, 0.5, -3.0);
    makeTunnel(0, 0, 2.2, 1.2); // Tunnel toward Command Tower

    this.habGroup.userData = { id: 'domes', name: 'Habitat Domes & Labs' };
    this._registerInteractive(this.habGroup);
    s.add(this.habGroup);

    // 2. CENTRAL COMMAND TOWER
    this.towerGroup = new THREE.Group();
    this.towerGroup.position.set(1.5, 0, 1.2);

    // Base pylons & shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 4.2, 16), matStd(0x5f6368, 0.4, 0.5));
    shaft.position.y = 2.1;
    shaft.castShadow = true;
    this.towerGroup.add(shaft);

    // Observation bridge / cupola
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 1.4, 0.9, 20), domeMat);
    cupola.position.y = 4.4;
    cupola.castShadow = true;
    this.towerGroup.add(cupola);

    // Panoramic observation glass strip
    const obsGlass = new THREE.Mesh(new THREE.CylinderGeometry(2.12, 1.6, 0.35, 20, 1, true), matGlow(0x54e0ee, 2.2));
    obsGlass.position.y = 4.4;
    this.towerGroup.add(obsGlass);

    // Mast & Radar Array
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.2, 8), matStd(0x3c4043, 0.3, 0.9));
    mast.position.y = 5.8;
    this.towerGroup.add(mast);

    // Blinking command beacon on top of tower
    this.towerBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), matGlow(0xff3838, 3.0));
    this.towerBeacon.position.y = 6.9;
    this.towerGroup.add(this.towerBeacon);

    this.towerGroup.userData = { id: 'tower', name: 'Command Tower' };
    this._registerInteractive(this.towerGroup);
    s.add(this.towerGroup);

    // Recon Drone circling tower
    this.droneMesh = new THREE.Group();
    const droneBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.35), matStd(0x2d3436, 0.3, 0.7));
    const droneScanner = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), matGlow(0x35e0ff, 2.5));
    droneScanner.position.set(0, -0.06, 0.12);
    this.droneMesh.add(droneBody, droneScanner);

    // Drone searchlight cone
    const droneConeMat = new THREE.MeshBasicMaterial({
      color: 0x35e0ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const droneCone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 16, 1, true), droneConeMat);
    droneCone.rotation.x = Math.PI;
    droneCone.position.set(0, -1.3, 0.15);
    this.droneMesh.add(droneCone);

    this.droneMesh.position.set(1.5, 4.8, 1.2);
    s.add(this.droneMesh);

    // 3. HYDROPONIC GREENHOUSES (Toggleable Grow-Lights)
    this.greenhouseGroup = new THREE.Group();
    this.greenhouseGroup.position.set(-6.5, 0, 3.2);

    const ghMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      roughness: 0.15,
      metalness: 0.1
    });
    this.growLightMat = matGlow(0xff007f, 2.8); // Magenta grow light

    for (let gIdx = 0; gIdx < 2; gIdx++) {
      const zOffset = gIdx * 2.2;
      // Arched greenhouse tube
      const ghGeo = new THREE.CylinderGeometry(0.9, 0.9, 3.2, 16, 1, false, 0, Math.PI);
      const gh = new THREE.Mesh(ghGeo, ghMat);
      gh.rotation.z = Math.PI / 2;
      gh.position.set(0, 0, zOffset);
      gh.castShadow = true;
      this.greenhouseGroup.add(gh);

      // Interior glowing plant beds & grow-light strip
      const bed = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 1.2), matStd(0x27ae60, 0.8));
      bed.position.set(0, 0.1, zOffset);
      const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.15), this.growLightMat);
      lightStrip.position.set(0, 0.85, zOffset);
      this.greenhouseGroup.add(bed, lightStrip);
    }

    this.greenhouseGroup.userData = { id: 'greenhouse', name: 'Hydroponic Greenhouses' };
    this._registerInteractive(this.greenhouseGroup);
    s.add(this.greenhouseGroup);

    // 4. LAUNCH COMPLEX & ORBITAL ROCKET
    this.launchPadGroup = new THREE.Group();
    this.launchPadGroup.position.set(8.5, 0, -4.5);

    // Octagonal concrete launch pad with flame deflector trench
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.45, 8), matStd(0x3d434d, 0.7, 0.4));
    pad.position.y = 0.22;
    pad.receiveShadow = true;
    this.launchPadGroup.add(pad);

    // Umbilical service tower
    const towerTruss = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.5, 0.8), matStd(0xeb3b5a, 0.5, 0.6));
    towerTruss.position.set(-1.8, 3.25, 0);
    towerTruss.castShadow = true;
    this.launchPadGroup.add(towerTruss);

    // Swing-arms to rocket
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.2), matStd(0xd1d8e0, 0.4));
    arm1.position.set(-0.9, 4.8, 0);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.2), matStd(0xd1d8e0, 0.4));
    arm2.position.set(-0.9, 3.2, 0);
    this.launchPadGroup.add(arm1, arm2);

    // The Orbital Rocket (Apollo/Artemis style heavy vehicle)
    this.rocketMesh = new THREE.Group();
    this.rocketMesh.position.set(0, 0.45, 0);

    const rocketMat = matStd(0xf5f6fa, 0.25, 0.3);
    const darkBand = matStd(0x1e272e, 0.3);
    const engineMat = matStd(0x2f3640, 0.3, 0.9);

    // Stage 1 booster body
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 3.4, 20), rocketMat);
    s1.position.y = 1.7;
    s1.castShadow = true;
    // Stage 1 striping
    const s1Stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.4, 20), darkBand);
    s1Stripe.position.y = 2.4;
    // 4 base fins
    for (let f = 0; f < 4; f++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.5), darkBand);
      fin.rotation.y = f * Math.PI / 2;
      fin.position.set(Math.cos(f * Math.PI / 2) * 0.75, 0.4, Math.sin(f * Math.PI / 2) * 0.75);
      this.rocketMesh.add(fin);
    }
    // Rocket Engine Nozzles (4)
    for (let en = 0; en < 4; en++) {
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 12, 1, true), engineMat);
      nozzle.position.set(Math.cos(en * Math.PI / 2) * 0.32, -0.05, Math.sin(en * Math.PI / 2) * 0.32);
      this.rocketMesh.add(nozzle);
    }
    // Stage 2 upper body
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.8, 20), rocketMat);
    s2.position.y = 4.3;
    s2.castShadow = true;
    // Orion/Crew capsule nose cone
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 20), rocketMat);
    cone.position.y = 5.8;
    cone.castShadow = true;
    // Launch abort tower needle
    const abortTower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.2, 8), darkBand);
    abortTower.position.y = 6.9;
    this.rocketMesh.add(s1, s1Stripe, s2, cone, abortTower);

    // Rocket launch flame & exhaust plume (hidden until launched)
    this.rocketFlameMat = matGlow(0xff9f1a, 4.0);
    this.rocketFlame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.5, 16), this.rocketFlameMat);
    this.rocketFlame.rotation.x = Math.PI;
    this.rocketFlame.position.y = -1.3;
    this.rocketFlame.visible = false;
    this.rocketMesh.add(this.rocketFlame);

    this.launchPadGroup.add(this.rocketMesh);
    this.launchPadGroup.userData = { id: 'rocket', name: 'Orbital Launch Complex' };
    this._registerInteractive(this.launchPadGroup);
    s.add(this.launchPadGroup);

    // 5. SUBORBITAL HOPPER & HOPPER PAD
    this.hopperPadGroup = new THREE.Group();
    this.hopperPadGroup.position.set(4.5, 0, -6.8);

    const hPad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.25, 16), matStd(0x4a5568, 0.6));
    hPad.position.y = 0.12;
    hPad.receiveShadow = true;
    // Neon circular landing target
    const ringTarget = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 8, 24), matGlow(0xffb84a, 2.2));
    ringTarget.rotation.x = -Math.PI / 2;
    ringTarget.position.y = 0.26;
    this.hopperPadGroup.add(hPad, ringTarget);

    // Secondary Hopper Destination Pad (East)
    this.hopperAuxPad = new THREE.Vector3(-9.5, 0.2, -6.2);
    const auxPad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.25, 16), matStd(0x4a5568, 0.6));
    auxPad.position.copy(this.hopperAuxPad);
    auxPad.position.y = 0.12;
    const auxRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 8, 24), matGlow(0x35e0ff, 2.2));
    auxRing.rotation.x = -Math.PI / 2;
    auxRing.position.set(this.hopperAuxPad.x, 0.26, this.hopperAuxPad.z);
    s.add(auxPad, auxRing);

    // The Suborbital Hopper Vessel
    this.hopperMesh = new THREE.Group();
    this.hopperMesh.position.set(4.5, 0.25, -6.8);

    const hopperBody = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.2, 12), matStd(0xdfe6e9, 0.3, 0.5));
    hopperBody.position.y = 0.8;
    hopperBody.castShadow = true;
    const hopperTop = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), matStd(0x2d3436, 0.3));
    hopperTop.position.y = 1.4;
    // 4 Landing leg struts
    for (let l = 0; l < 4; l++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), matStd(0x636e72, 0.4));
      leg.rotation.z = 0.4;
      leg.rotation.y = l * Math.PI / 2;
      leg.position.set(Math.cos(l * Math.PI / 2) * 0.78, 0.35, Math.sin(l * Math.PI / 2) * 0.78);
      this.hopperMesh.add(leg);
    }
    // Hopper thruster flare
    this.hopperFlame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 12), matGlow(0x35e0ff, 3.5));
    this.hopperFlame.rotation.x = Math.PI;
    this.hopperFlame.position.y = -0.4;
    this.hopperFlame.visible = false;
    this.hopperMesh.add(hopperBody, hopperTop, this.hopperFlame);

    this.hopperPadGroup.userData = { id: 'hopper', name: 'Suborbital Hopper Pad' };
    this._registerInteractive(this.hopperPadGroup);
    s.add(this.hopperPadGroup, this.hopperMesh);

    // 6. SOLAR FARM (Tracking Photovoltaic Arrays)
    this.solarPanels = [];
    const solarGroup = new THREE.Group();
    solarGroup.position.set(-11.5, 0, -0.5);

    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1b2838,
      roughness: 0.15,
      metalness: 0.85,
      emissive: 0x0a192f,
      emissiveIntensity: 0.4
    });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const mastP = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), matStd(0x718096, 0.4));
        mastP.position.set(col * 2.2, 0.6, row * 1.8);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 1.1), panelMat);
        panel.position.set(col * 2.2, 1.25, row * 1.8);
        panel.castShadow = true;
        solarGroup.add(mastP, panel);
        this.solarPanels.push(panel);
      }
    }
    solarGroup.userData = { id: 'solar', name: 'Photovoltaic Solar Farm' };
    this._registerInteractive(solarGroup);
    s.add(solarGroup);

    // 7. NUCLEAR FISSION REACTOR & COOLING RADIATORS
    this.reactorGroup = new THREE.Group();
    this.reactorGroup.position.set(-6.5, 0, -4.5);

    // Containment cylinder
    const reactorCore = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 2.2, 16), matStd(0x4a5568, 0.4, 0.7));
    reactorCore.position.y = 1.1;
    reactorCore.castShadow = true;
    // Glowing radiation hazard band
    const hazBand = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, 0.3, 16), matGlow(0xffb84a, 2.0));
    hazBand.position.y = 1.5;
    this.reactorGroup.add(reactorCore, hazBand);

    // Vertical cooling radiator fins (Heat dissipation glow)
    const radMat = matGlow(0xff4757, 1.8);
    for (let rf = 0; rf < 4; rf++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 1.2), radMat);
      fin.rotation.y = rf * Math.PI / 4;
      fin.position.set(Math.cos(rf * Math.PI / 4) * 1.8, 1.4, Math.sin(rf * Math.PI / 4) * 1.8);
      this.reactorGroup.add(fin);
    }
    this.reactorGroup.userData = { id: 'reactor', name: 'Nuclear Fission Power Plant' };
    this._registerInteractive(this.reactorGroup);
    s.add(this.reactorGroup);

    // 8. CRYOGENIC PROPELLANT TANKS
    this.tanksGroup = new THREE.Group();
    this.tanksGroup.position.set(4.2, 0, -2.5);

    const tankMat = matStd(0xf1f2f6, 0.2, 0.4);
    // 2 Large Spherical LOX tanks
    const t1 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 16), tankMat);
    t1.position.set(0, 1.35, 0);
    t1.castShadow = true;
    const t2 = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 16), tankMat);
    t2.position.set(2.4, 1.35, 0);
    t2.castShadow = true;
    // Horizontal LH2 cylinder
    const t3 = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.8, 16), tankMat);
    t3.rotation.z = Math.PI / 2;
    t3.position.set(1.2, 0.9, 1.8);
    t3.castShadow = true;
    this.tanksGroup.add(t1, t2, t3);
    this.tanksGroup.userData = { id: 'tanks', name: 'Cryogenic Fuel Depot' };
    this._registerInteractive(this.tanksGroup);
    s.add(this.tanksGroup);

    // 9. REGOLITH PROCESSING & ISRU REFINERY
    this.plantGroup = new THREE.Group();
    this.plantGroup.position.set(8.5, 0, 1.2);

    const plantMat = matStd(0x34495e, 0.5, 0.6);
    // Industrial silos & processing towers
    const silo1 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 16), plantMat);
    silo1.position.set(0, 1.6, 0);
    silo1.castShadow = true;
    const silo2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 4.0, 16), plantMat);
    silo2.position.set(1.8, 2.0, -0.6);
    silo2.castShadow = true;
    // Overhead conveyor chute
    const chute = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.45), matStd(0xf39c12, 0.4));
    chute.rotation.z = -0.22;
    chute.position.set(0.9, 2.8, -0.3);
    this.plantGroup.add(silo1, silo2, chute);
    this.plantGroup.userData = { id: 'plant', name: 'Regolith ISRU Refinery' };
    this._registerInteractive(this.plantGroup);
    s.add(this.plantGroup);

    // 10. ROTATING RADIO COMMUNICATIONS DISHES
    this.radioDishes = [];
    const dishPositions = [[-1.2, 5.2], [12.5, -1.8]];
    dishPositions.forEach(([dx, dz]) => {
      const dg = new THREE.Group();
      dg.position.set(dx, 0, dz);
      const mastP = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.6, 8), matStd(0x4a5568, 0.4));
      mastP.position.y = 0.8;
      dg.add(mastP);

      // Rotating dish bowl
      const dishBowl = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), matStd(0xf5f6fa, 0.3, 0.5));
      dishBowl.rotation.x = Math.PI * 0.7;
      dishBowl.position.y = 1.7;
      dishBowl.castShadow = true;
      // Feed horn
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 8), matStd(0xff4757, 0.4));
      horn.position.set(0, 1.7, 0.7);
      horn.rotation.x = -Math.PI / 2;
      dg.add(dishBowl, horn);

      dg.userData = { id: 'dish', name: 'Deep Space Comm Dish', bowl: dishBowl };
      this._registerInteractive(dg);
      s.add(dg);
      this.radioDishes.push(dg);
    });

    // 11. ROVER GARAGE & MAINTENANCE HANGAR
    this.garageGroup = new THREE.Group();
    this.garageGroup.position.set(-6.5, 0, -1.2);

    const hangarGeo = new THREE.BoxGeometry(4.2, 1.8, 3.2);
    const hangar = new THREE.Mesh(hangarGeo, matStd(0x2d3436, 0.4, 0.4));
    hangar.position.y = 0.9;
    hangar.castShadow = true;
    // 2 Illuminated roll-up hangar bay doors
    const bayDoorMat = matGlow(0x35e0c9, 1.8);
    const bay1 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.3), bayDoorMat);
    bay1.position.set(-1.1, 0.7, 1.61);
    const bay2 = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.3), bayDoorMat);
    bay2.position.set(1.1, 0.7, 1.61);
    this.garageGroup.add(hangar, bay1, bay2);

    this.garageGroup.userData = { id: 'garage', name: 'Rover Garage & Hangars' };
    this._registerInteractive(this.garageGroup);
    s.add(this.garageGroup);

    // 12. CONTAINER YARDS & ACTIVE GANTRY CRANE
    this.containerYard = new THREE.Group();
    this.containerYard.position.set(1.8, 0, -4.5);

    // Stacks of colored ISO space shipping containers
    const boxColors = [0xeb4d4b, 0x30336b, 0x22a6b3, 0xf0932b, 0x6ab04c];
    const containerGeo = new THREE.BoxGeometry(1.6, 0.8, 0.8);
    for (let cRow = 0; cRow < 3; cRow++) {
      for (let cLevel = 0; cLevel < 2; cLevel++) {
        const cBox = new THREE.Mesh(containerGeo, matStd(boxColors[(cRow + cLevel) % boxColors.length], 0.5, 0.2));
        cBox.position.set(cRow * 1.8 - 1.8, 0.4 + cLevel * 0.82, (cRow % 2) * 0.3);
        cBox.castShadow = true;
        this.containerYard.add(cBox);
      }
    }

    // Overhead Container Crane Gantry
    this.craneGantry = new THREE.Group();
    const gantryLegMat = matStd(0xf1c40f, 0.4);
    // 2 Inverted U-frames
    const u1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.2, 2.8), gantryLegMat);
    u1.position.set(-2.5, 1.6, 0);
    const u2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.2, 2.8), gantryLegMat);
    u2.position.set(2.5, 1.6, 0);
    // Overhead bridge beam
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.5), gantryLegMat);
    bridge.position.set(0, 3.1, 0);
    this.craneGantry.add(u1, u2, bridge);

    // Crane Trolley & Cable Hoist
    this.craneTrolley = new THREE.Group();
    this.craneTrolley.position.set(0, 2.9, 0);
    const trolleyBox = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), matStd(0x34495e, 0.3));
    this.craneCable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), matStd(0x111111, 0.2));
    this.craneCable.position.y = -0.7;
    // Spreader bar container grabber
    this.craneSpreader = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.7), matStd(0xe74c3c, 0.3));
    this.craneSpreader.position.y = -1.4;
    this.craneTrolley.add(trolleyBox, this.craneCable, this.craneSpreader);
    this.craneGantry.add(this.craneTrolley);

    this.containerYard.add(this.craneGantry);
    this.containerYard.userData = { id: 'crane', name: 'Logistics Yard & Gantry Crane' };
    this._registerInteractive(this.containerYard);
    s.add(this.containerYard);

    // 13. MINING ROBOT / EXCAVATOR IN EXCAVATION CRATER
    this.minerGroup = new THREE.Group();
    this.minerGroup.position.set(9.5, -0.65, 5.5); // Inside crater

    const minerBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1.2), matStd(0xf39c12, 0.4));
    minerBase.position.y = 0.3;
    minerBase.castShadow = true;
    // Continuous caterpillar treads
    const treadMat = matStd(0x1e272e, 0.8);
    const tr1 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.3), treadMat);
    tr1.position.set(0, 0.2, 0.65);
    const tr2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.3), treadMat);
    tr2.position.set(0, 0.2, -0.65);
    this.minerGroup.add(minerBase, tr1, tr2);

    // Articulated excavator boom & bucket
    this.minerBoom = new THREE.Group();
    this.minerBoom.position.set(0.6, 0.5, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.22), matStd(0xd35400, 0.4));
    arm.position.x = 0.7;
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), matStd(0x7f8c8d, 0.3, 0.7));
    bucket.position.set(1.4, -0.2, 0);
    this.minerBoom.add(arm, bucket);
    this.minerGroup.add(this.minerBoom);

    this.minerGroup.userData = { id: 'miner', name: 'Autonomous Mining Excavator' };
    this._registerInteractive(this.minerGroup);
    s.add(this.minerGroup);

    // 14. BASE FLOODLIGHT MASTS
    const floodlightSpots = [
      [-13.5, -9.5], [13.5, -9.5], [-13.5, 9.5], [13.5, 9.5],
      [0, -10.5], [0, 10.5]
    ];
    this.floodlights = [];
    floodlightSpots.forEach(([fx, fz]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.5, 8), matStd(0x718096, 0.4));
      pole.position.set(fx, 2.25, fz);
      pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.3), matGlow(0xfff5cc, 3.0));
      head.position.set(fx, 4.4, fz);
      head.rotation.x = Math.atan2(-fz, -fx);
      s.add(pole, head);

      const pLight = new THREE.PointLight(0xfff5cc, 1.2, 14, 1.8);
      pLight.position.set(fx, 4.2, fz);
      s.add(pLight);
      this.floodlights.push({ head, pLight });
    });
  }

  // ==========================================
  // ELEVATED MONORAIL LOOP & RUNNING TRAIN
  // ==========================================
  _buildRailAndTrain() {
    const s = this.scene;

    // Define the elevated track loop path (Smooth rounded rectangle circling outpost)
    const curvePoints = [
      new THREE.Vector3(-14.0, 1.8, -9.5),
      new THREE.Vector3(0.0, 1.8, -9.8),
      new THREE.Vector3(14.0, 1.8, -9.5),
      new THREE.Vector3(14.8, 1.8, 0.0),
      new THREE.Vector3(14.0, 1.8, 9.5),
      new THREE.Vector3(0.0, 1.8, 9.8),
      new THREE.Vector3(-14.0, 1.8, 9.5),
      new THREE.Vector3(-14.8, 1.8, 0.0)
    ];
    this.railCurve = new THREE.CatmullRomCurve3(curvePoints, true, 'catmullrom', 0.25);

    // Track Geometry (Extruded along curve)
    const trackGeo = new THREE.TubeGeometry(this.railCurve, 160, 0.18, 8, true);
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.3,
      metalness: 0.8
    });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.castShadow = true;
    trackMesh.receiveShadow = true;
    s.add(trackMesh);

    // Elevated Support Pylons (Pillar supports every ~10% around loop)
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.6 });
    for (let i = 0; i < 20; i++) {
      const u = i / 20;
      const pt = this.railCurve.getPointAt(u);
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, pt.y, 8), pylonMat);
      pylon.position.set(pt.x, pt.y / 2, pt.z);
      pylon.castShadow = true;
      s.add(pylon);
    }

    // Transit Station at front edge
    const station = new THREE.Group();
    station.position.set(0, 0, 9.8);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 }));
    platform.position.y = 1.4;
    platform.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.15, 2.6), new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.3 }));
    roof.position.y = 2.9;
    station.add(platform, roof);
    station.userData = { id: 'station', name: 'Lunar Transit Station' };
    this._registerInteractive(station);
    s.add(station);

    // The Lunar Transport Train (Locomotive Engine + 3 Ore Hopper Cars)
    this.trainGroup = new THREE.Group();
    this.trainCars = [];
    this.trainProgress = 0;

    const locoMat = new THREE.MeshStandardMaterial({ color: 0x0984e3, roughness: 0.3, metalness: 0.5 });
    const carMat = new THREE.MeshStandardMaterial({ color: 0x636e72, roughness: 0.4, metalness: 0.6 });
    const oreMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.9 });
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.5 });

    // 1. Locomotive Engine
    const loco = new THREE.Group();
    const locoBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.7), locoMat);
    locoBody.position.y = 0.35;
    const headLamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), headlightMat);
    headLamp.position.set(0.82, 0.35, 0);
    loco.add(locoBody, headLamp);
    this.trainCars.push({ mesh: loco, offsetDist: 0 });
    this.trainGroup.add(loco);

    // 2. Three Ore Cars
    for (let c = 1; c <= 3; c++) {
      const car = new THREE.Group();
      const carBody = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.65), carMat);
      carBody.position.y = 0.3;
      const oreMound = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.5), oreMat);
      oreMound.position.y = 0.5;
      car.add(carBody, oreMound);
      this.trainCars.push({ mesh: car, offsetDist: c * 1.5 });
      this.trainGroup.add(car);
    }

    this.trainGroup.userData = { id: 'train', name: 'Lunar Transport Train' };
    this._registerInteractive(this.trainGroup);
    s.add(this.trainGroup);
  }

  // ==========================================
  // LIVING ENTITIES (ASTRONAUTS & ROVERS)
  // ==========================================
  _buildEntities() {
    const s = this.scene;

    // 1. Tiny EVA Astronauts
    this.astronauts = [];
    const suitMat = new THREE.MeshStandardMaterial({ color: 0xf1f2f6, roughness: 0.4 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0xffb84a, roughness: 0.1, metalness: 0.9, emissive: 0xff9f1a, emissiveIntensity: 0.4 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0x747d8c, roughness: 0.6 });

    const astroRoutes = [
      [
        new THREE.Vector3(-3.5, 0.2, 0.8),
        new THREE.Vector3(-1.5, 0.2, 1.0),
        new THREE.Vector3(0.5, 0.2, 1.2),
        new THREE.Vector3(2.5, 0.2, 0.5),
        new THREE.Vector3(6.5, 0.2, -3.2)
      ],
      [
        new THREE.Vector3(-3.5, 0.2, -0.5),
        new THREE.Vector3(-5.5, 0.2, 1.5),
        new THREE.Vector3(-6.5, 0.2, 3.2),
        new THREE.Vector3(-4.5, 0.2, 2.0)
      ],
      [
        new THREE.Vector3(1.5, 0.2, 0.5),
        new THREE.Vector3(3.2, 0.2, -2.0),
        new THREE.Vector3(5.5, 0.2, -3.0),
        new THREE.Vector3(2.0, 0.2, -1.0)
      ]
    ];

    astroRoutes.forEach((route, idx) => {
      const aGroup = new THREE.Group();
      // Torso
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.35, 0.18), suitMat);
      body.position.y = 0.32;
      body.castShadow = true;
      // Helmet with golden visor
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), suitMat);
      head.position.y = 0.58;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.12), visorMat);
      visor.position.set(0, 0.58, 0.08);
      // Life support backpack
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.12), packMat);
      pack.position.set(0, 0.34, -0.12);

      // Limbs for walking & waving animation
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), suitMat);
      armR.position.set(0.17, 0.3, 0);
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.07), suitMat);
      armL.position.set(-0.17, 0.3, 0);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), suitMat);
      legR.position.set(0.07, 0.11, 0);
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), suitMat);
      legL.position.set(-0.07, 0.11, 0);

      aGroup.add(body, head, visor, pack, armR, armL, legR, legL);
      aGroup.position.copy(route[0]);
      aGroup.userData = {
        id: `astronaut_${idx}`,
        name: `Astronaut ${['Armstrong', 'Aldrin', 'Collins'][idx]}`,
        isAstronaut: true,
        route,
        routeIdx: 0,
        progress: 0,
        waving: false,
        waveTimer: 0,
        armR, armL, legR, legL
      };
      this._registerInteractive(aGroup);
      s.add(aGroup);
      this.astronauts.push(aGroup);
    });

    // 2. Lunar Exploration Rovers
    this.rovers = [];
    const roverMat = new THREE.MeshStandardMaterial({ color: 0xdfe6e9, roughness: 0.4, metalness: 0.3 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.8 });

    const makeRover = (startPos, patrolRoute) => {
      const r = new THREE.Group();
      const chass = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.6), roverMat);
      chass.position.y = 0.25;
      chass.castShadow = true;
      const mastP = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), matStd(0x718096, 0.4));
      mastP.position.set(0.3, 0.55, 0);
      const camEye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.15), matGlow(0x35e0ff, 2.0));
      camEye.position.set(0.32, 0.75, 0);
      r.add(chass, mastP, camEye);

      // 6 Wire-mesh lunar wheels
      for (let w = 0; w < 6; w++) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), wheelMat);
        wh.rotation.x = Math.PI / 2;
        const wx = (w % 3) * 0.32 - 0.32;
        const wz = w < 3 ? 0.36 : -0.36;
        wh.position.set(wx, 0.14, wz);
        wh.castShadow = true;
        r.add(wh);
      }
      r.position.copy(startPos);
      r.userData = {
        id: 'rover',
        name: 'Lunar Exploration Rover',
        route: patrolRoute,
        routeIdx: 0,
        speed: 1.8
      };
      this._registerInteractive(r);
      s.add(r);
      return r;
    };

    // Primary rover route
    this.rovers.push(makeRover(new THREE.Vector3(-5.0, 0.1, 0), [
      new THREE.Vector3(-5.0, 0.1, 0),
      new THREE.Vector3(-1.0, 0.1, 0),
      new THREE.Vector3(3.0, 0.1, 1.5),
      new THREE.Vector3(7.0, 0.1, 3.5),
      new THREE.Vector3(4.0, 0.1, -1.0)
    ]));

    // Secondary patrol rover (spawned from garage on patrol)
    this.rovers.push(makeRover(new THREE.Vector3(-6.5, 0.1, -1.2), [
      new THREE.Vector3(-6.5, 0.1, -1.2),
      new THREE.Vector3(-8.5, 0.1, -4.0),
      new THREE.Vector3(-4.0, 0.1, -6.5),
      new THREE.Vector3(1.0, 0.1, -6.0),
      new THREE.Vector3(-3.0, 0.1, -2.5)
    ]));
  }

  // ==========================================
  // PARTICLE SYSTEMS (DUST, SMOKE, METEORS)
  // ==========================================
  _buildParticleSystems() {
    const s = this.scene;

    // 1. Rocket Smoke & Flame Particles
    const smokeCount = 120;
    const smokeGeo = new THREE.BufferGeometry();
    const smokePositions = new Float32Array(smokeCount * 3);
    this.smokeVelocities = [];
    this.smokeLifetimes = new Float32Array(smokeCount);

    for (let i = 0; i < smokeCount; i++) {
      smokePositions[i * 3 + 0] = 8.5;
      smokePositions[i * 3 + 1] = 0.5;
      smokePositions[i * 3 + 2] = -4.5;
      this.smokeVelocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 3
      ));
      this.smokeLifetimes[i] = 0;
    }
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));

    const smokeMat = new THREE.PointsMaterial({
      color: 0xffaa44,
      size: 0.6,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.rocketPlumeParticles = new THREE.Points(smokeGeo, smokeMat);
    s.add(this.rocketPlumeParticles);

    // 2. Rover Dust Puff Particles
    const dustCount = 80;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    this.dustPuffs = [];
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3 + 0] = 0;
      dustPositions[i * 3 + 1] = -10;
      dustPositions[i * 3 + 2] = 0;
      this.dustPuffs.push({ x: 0, y: -10, z: 0, life: 0, maxLife: 1.0 });
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dustParticles = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xbdc3c7,
      size: 0.25,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    }));
    s.add(this.dustParticles);

    // 3. Meteor Shower Particle System
    const meteorCount = 40;
    const meteorGeo = new THREE.BufferGeometry();
    const meteorPos = new Float32Array(meteorCount * 3);
    this.meteors = [];
    for (let i = 0; i < meteorCount; i++) {
      meteorPos[i * 3 + 0] = 0;
      meteorPos[i * 3 + 1] = -50;
      meteorPos[i * 3 + 2] = 0;
      this.meteors.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    }
    meteorGeo.setAttribute('position', new THREE.BufferAttribute(meteorPos, 3));
    this.meteorParticles = new THREE.Points(meteorGeo, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    s.add(this.meteorParticles);

    // 4. Ground Click Dust Ripple Rings
    this.dustRipples = [];
  }

  // ==========================================
  // 3D WAYPOINT LABELS & PINS
  // ==========================================
  _buildLabels() {
    this.labels = [
      { text: 'COMMAND TOWER', pos: new THREE.Vector3(1.5, 7.5, 1.2), color: '#54e0ee' },
      { text: 'HABITAT HUB', pos: new THREE.Vector3(-3.5, 3.2, 0), color: '#35e0ff' },
      { text: 'ORBITAL LAUNCH PAD', pos: new THREE.Vector3(8.5, 7.2, -4.5), color: '#ffb84a' },
      { text: 'GREENHOUSES', pos: new THREE.Vector3(-6.5, 1.8, 3.2), color: '#5fe08a' },
      { text: 'TRANSIT STATION', pos: new THREE.Vector3(0, 3.2, 9.8), color: '#8a5cff' },
      { text: 'ISRU REFINERY', pos: new THREE.Vector3(8.5, 4.6, 1.2), color: '#ff9f1a' },
      { text: 'MINING CRATER', pos: new THREE.Vector3(9.5, 1.2, 5.5), color: '#f39c12' }
    ];

    this.labelElements = [];
    const container = document.getElementById('moonbaseLabels');
    if (!container) return;
    container.innerHTML = '';

    this.labels.forEach(l => {
      const el = document.createElement('div');
      el.className = 'mbLabelPin';
      el.innerHTML = `<span class="mbPinDot" style="background:${l.color}"></span><span class="mbPinText">${l.text}</span>`;
      container.appendChild(el);
      this.labelElements.push({ el, pos: l.pos });
    });
  }

  _registerInteractive(obj) {
    obj.traverse(child => {
      if (child.isMesh) {
        child.userData.parentEntity = obj;
        this.interactiveObjects.push(child);
      }
    });
  }

  // ==========================================
  // INPUT & INTERACTIVE CAMERA CONTROLS
  // ==========================================
  _setupInput() {
    const el = this.renderer.domElement;

    // Mouse drag orbit & pan
    el.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragButton = e.button;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse = { x: e.clientX, y: e.clientY };

      if (this.dragButton === 0) {
        // Left button: Damped orbit
        this.camYawTo -= dx * 0.006;
        this.camPitchTo = Math.max(0.12, Math.min(Math.PI * 0.48, this.camPitchTo + dy * 0.006));
      } else if (this.dragButton === 2) {
        // Right button: Pan target across table
        const forward = new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
        const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
        const panSpeed = this.camDist * 0.0012;
        this.camTargetTo.addScaledVector(right, -dx * panSpeed);
        this.camTargetTo.addScaledVector(forward, dy * panSpeed);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Prevent default context menu on right-click pan
    el.addEventListener('contextmenu', e => e.preventDefault());

    // Wheel zoom: smoothly zoom from astronaut closeup (dist ~ 4) out to full room (dist ~ 45)
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.022;
      this.camDistTo = Math.max(3.8, Math.min(48.0, this.camDistTo + zoomDelta));
    }, { passive: false });

    // Double-click reset view
    el.addEventListener('dblclick', () => {
      this.resetView();
    });

    // Click handler for 3D picking & interactions
    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect();
      this.mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouseVec, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactiveObjects.concat([this.terrainMesh]));

      if (hits.length > 0) {
        const hit = hits[0];
        const ent = hit.object.userData.parentEntity;

        if (ent && ent.userData) {
          this._handleEntityClick(ent, hit.point);
        } else if (hit.object.userData.isGround) {
          // Ground click: spawn expanding dust ripple
          this._spawnDustRipple(hit.point);
          if (this.sound) this.sound.blip();
        }
      }
    });

    // Keyboard preset views (1..6) and shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === '1') this.resetView(); // Overview
      if (e.key === '2') this.focusView(new THREE.Vector3(8.5, 3.0, -4.5), 14, Math.PI / 3, 26 * Math.PI / 180); // Rocket
      if (e.key === '3') this.focusView(new THREE.Vector3(-3.5, 1.5, 0), 12, Math.PI / 4, 32 * Math.PI / 180); // Domes
      if (e.key === '4') this.focusView(new THREE.Vector3(1.5, 3.5, 1.2), 11, Math.PI / 5, 24 * Math.PI / 180); // Tower
      if (e.key === '5') this.focusView(new THREE.Vector3(0, 1.8, 9.8), 12, 0, 28 * Math.PI / 180); // Train station
      if (e.key === '6') this.focusView(new THREE.Vector3(9.5, 0.5, 5.5), 10, Math.PI * 0.7, 38 * Math.PI / 180); // Mining crater
      if (e.key === 'l' || e.key === 'L') this.launchRocket();
      if (e.key === 'h' || e.key === 'H') this.callHopper();
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if (e.key === 't' || e.key === 'T') this.toggleLights();
      if (e.key === 'Escape') this.exitStage();
    });

    // Resize handler
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  _handleEntityClick(ent, hitPt) {
    const id = ent.userData.id;
    if (this.sound) this.sound.click();

    // 1. Rocket Pad Click
    if (id === 'rocket') {
      this.focusView(ent.position, 14);
      this.launchRocket();
      return;
    }

    // 2. Command Tower Click: Toggle Floodlights
    if (id === 'tower') {
      this.focusView(ent.position, 12);
      this.toggleLights();
      this.onToast(this.lightsOn ? '💡 Command Tower: Perimeter Floodlights Online' : '🌑 Command Tower: Perimeter Floodlights Standby');
      return;
    }

    // 3. Rover Garage Click: Dispatch patrol
    if (id === 'garage') {
      this.focusView(ent.position, 11);
      this.triggerRoverPatrol();
      return;
    }

    // 4. Hopper Pad Click: Call suborbital flight
    if (id === 'hopper') {
      this.focusView(this.hopperMesh.position, 12);
      this.callHopper();
      return;
    }

    // 5. Greenhouse Click: Toggle grow light spectrum
    if (id === 'greenhouse') {
      this.focusView(ent.position, 10);
      this.cycleGrowLights();
      return;
    }

    // 6. Astronaut Click: Wave and walk off
    if (ent.userData.isAstronaut) {
      ent.userData.waving = true;
      ent.userData.waveTimer = 3.0;
      if (this.sound) this.sound.blip();
      this.onToast(`👋 ${ent.userData.name} waves at the observation diorama!`);
      this.focusView(ent.position, 6.5);
      return;
    }

    // 7. Train Click: Toggle Follow Mode
    if (id === 'train' || id === 'station') {
      this.trainFollowMode = !this.trainFollowMode;
      this.onToast(this.trainFollowMode ? '🚂 Following Lunar Transport Train (Click again to unlock)' : '🔓 Train follow camera unlocked');
      return;
    }

    // Default: fly camera smoothly to inspected module
    this.focusView(ent.position, 12);
    this.onToast(`🔭 Inspecting: ${ent.userData.name || id}`);
  }

  // ==========================================
  // CAMERA ACTIONS & PRESETS
  // ==========================================
  resetView() {
    this.trainFollowMode = false;
    this.camYawTo = this.defaultCam.yaw;
    this.camPitchTo = this.defaultCam.pitch;
    this.camDistTo = this.defaultCam.dist;
    this.camTargetTo.copy(this.defaultCam.target);
    this.onToast('🎥 Camera reset to Tabletop Diorama overview');
  }

  focusView(pos, dist = 12, yaw = null, pitch = null) {
    this.trainFollowMode = false;
    this.camTargetTo.set(pos.x, Math.max(0.6, pos.y), pos.z);
    this.camDistTo = dist;
    if (yaw !== null) this.camYawTo = yaw;
    if (pitch !== null) this.camPitchTo = pitch;
  }

  // ==========================================
  // INTERACTIVE TRIGGER METHODS
  // ==========================================
  launchRocket() {
    if (this.rocketState !== 'ready') return;
    this.rocketState = 'countdown';
    this.rocketLaunchT = 0;
    this.rocketFlame.visible = true;
    if (this.sound) this.sound.rocket();
    this.onToast('🚀 T-minus 0: Orbital Rocket Launch Sequence Initiated!');
  }

  callHopper() {
    if (this.hopperState !== 'idle') return;
    this.hopperState = 'flying';
    this.hopperFlightT = 0;
    this.hopperFlame.visible = true;
    if (this.sound) this.sound.thruster();
    this.onToast('🛸 Suborbital Hopper Flight Departing Pad!');
  }

  cycleGrowLights() {
    this.growLightMode = (this.growLightMode + 1) % 3;
    const colors = [0xff007f, 0x00d2d3, 0xffd166];
    const names = ['Photosynthetic Magenta (Vegetative)', 'Deep Cyan (Chlorophyll-A)', 'Solar Spectrum Gold (Flowering)'];
    const chosen = colors[this.growLightMode];
    this.growLightMat.color.setHex(chosen);
    this.growLightMat.emissive.setHex(chosen);
    if (this.sound) this.sound.click();
    this.onToast(`🌱 Greenhouse Grow-Lights: ${names[this.growLightMode]}`);
  }

  triggerRoverPatrol() {
    this.roverPatrolActive = !this.roverPatrolActive;
    if (this.sound) this.sound.servo();
    this.onToast(this.roverPatrolActive ? '🚙 Rover Garage: Recon Patrol Units Dispatched!' : '🚙 Rover Units Returning to Garage Hangar');
  }

  triggerMeteorShower() {
    this.meteorShowerActive = !this.meteorShowerActive;
    if (this.sound) this.sound.beacon();
    this.onToast(this.meteorShowerActive ? '🌠 Meteor Shower Active! Look to the Starfield' : '🌠 Meteor Shower Passed');
  }

  toggleDustStorm() {
    this.dustStormActive = !this.dustStormActive;
    if (this.sound) this.sound.dust();
    this.onToast(this.dustStormActive ? '🌪 Electrostatic Lunar Dust Swarm Inbound!' : '🌪 Electrostatic Dust Swarm Dissipated');
  }

  toggleLights() {
    this.lightsOn = !this.lightsOn;
    this.floodlights.forEach(fl => {
      fl.pLight.intensity = this.lightsOn ? 1.2 : 0;
      fl.head.material.emissiveIntensity = this.lightsOn ? 3.0 : 0.2;
    });
    if (this.sound) this.sound.click();
  }

  toggleShadows() {
    this.shadowsEnabled = !this.shadowsEnabled;
    this.sunLight.castShadow = this.shadowsEnabled;
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.onToast(this.shadowsEnabled ? '🌑 Soft Lunar Shadows: Enabled' : '🌑 Soft Lunar Shadows: Disabled');
  }

  toggleLabels() {
    this.showLabels = !this.showLabels;
    const container = document.getElementById('moonbaseLabels');
    if (container) container.style.display = this.showLabels ? 'block' : 'none';
    this.onToast(this.showLabels ? '🏷 Module Labels: Shown' : '🏷 Module Labels: Hidden');
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.onToast(this.isPaused ? '⏸ Simulation Paused' : '▶ Simulation Resumed');
  }

  setSpeed(s) {
    this.simSpeed = s;
    this.onToast(`⚡ Simulation Speed: ${s}x`);
  }

  _spawnDustRipple(pt) {
    if (!pt || typeof pt.x !== 'number' || typeof pt.z !== 'number') return;
    const geo = new THREE.RingGeometry(0.1, 0.25, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xecf0f1,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pt.x, 0.05, pt.z);
    this.scene.add(ring);
    this.dustRipples.push({ mesh: ring, radius: 0.25, life: 1.0 });
  }

  exitStage() {
    if (this.sound) this.sound.warp();
    this.onToast('🌌 Warping back to Skyline Micro-Lofts Unit 101...');
    this.dispose();
    this.onReturn();
  }

  // ==========================================
  // MAIN ANIMATION & SIMULATION TICK
  // ==========================================
  tick() {
    if (!this.active) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const dt = this.isPaused ? 0 : delta * this.simSpeed;
    this.simTime += dt;

    // 1. Day / Night Cycle & Earthrise
    if (this.autoDayCycle && dt > 0) {
      this.timeOfDay = (this.timeOfDay + dt / this.dayDuration) % 1.0;
    }
    const sunAngle = this.timeOfDay * Math.PI * 2;
    const sunHeight = Math.sin(sunAngle);
    const sunDist = 34;

    this.sunLight.position.set(
      Math.cos(sunAngle) * sunDist,
      Math.max(2.0, sunHeight * sunDist),
      Math.sin(sunAngle * 0.7) * 16
    );
    // Sun intensity based on altitude
    this.sunLight.intensity = Math.max(0.15, Math.max(0, sunHeight) * 2.8);

    // Earth slowly rises and orbits in the starfield
    const earthRiseY = 12 + Math.sin(this.simTime * 0.05) * 6;
    const earthOrbitX = -14 + Math.cos(this.simTime * 0.03) * 8;
    this.earthMesh.position.set(earthOrbitX, earthRiseY, -22);
    this.earthMesh.rotation.y = this.simTime * 0.08;

    // 2. Solar Panel Sun-Tracking
    this.solarPanels.forEach(p => {
      p.rotation.z = Math.sin(sunAngle) * 0.45;
      p.rotation.y = -sunAngle * 0.2;
    });

    // 3. Rotating Radio Dishes & Beacons
    this.radioDishes.forEach((rd, i) => {
      rd.userData.bowl.rotation.y = Math.sin(this.simTime * 0.4 + i) * 0.8;
      rd.userData.bowl.rotation.x = Math.PI * 0.65 + Math.cos(this.simTime * 0.3) * 0.15;
    });
    this.towerBeacon.material.emissiveIntensity = 2.0 + Math.sin(this.simTime * 8) * 1.8;

    // 4. Recon Drone Orbiting Command Tower
    const droneAngle = this.simTime * 0.9;
    const droneRad = 2.4;
    this.droneMesh.position.set(
      1.5 + Math.cos(droneAngle) * droneRad,
      5.2 + Math.sin(this.simTime * 1.5) * 0.35,
      1.2 + Math.sin(droneAngle) * droneRad
    );
    this.droneMesh.rotation.y = -droneAngle + Math.PI / 2;

    // 5. Autonomous Mining Excavator Digging
    this.minerBoom.rotation.z = Math.sin(this.simTime * 2.2) * 0.35 - 0.2;

    // 6. Gantry Crane Movement
    this.craneTrolley.position.x = Math.sin(this.simTime * 0.5) * 1.6;
    const cableH = 1.0 + Math.sin(this.simTime * 0.8) * 0.45;
    this.craneCable.scale.y = cableH;
    this.craneCable.position.y = -cableH * 0.7;
    this.craneSpreader.position.y = -cableH * 1.4;

    // 7. Elevated Monorail Train Simulation
    if (this.railCurve) {
      this.trainProgress = (this.trainProgress + dt * 0.038) % 1.0;
      this.trainCars.forEach(car => {
        const u = ((this.trainProgress - car.offsetDist / 92) % 1.0 + 1.0) % 1.0;
        const pt = this.railCurve.getPointAt(u);
        const tangent = this.railCurve.getTangentAt(u);
        car.mesh.position.copy(pt);
        car.mesh.lookAt(pt.clone().add(tangent));
      });

      // Follow-train camera tracking mode
      if (this.trainFollowMode) {
        const leadPt = this.trainCars[0].mesh.position;
        this.camTargetTo.copy(leadPt);
      }
    }

    // 8. Astronaut Walking & Waving
    this.astronauts.forEach(a => {
      const u = a.userData;
      if (u.waving) {
        u.waveTimer -= dt;
        u.armR.rotation.z = Math.PI * 0.85 + Math.sin(this.simTime * 14) * 0.35;
        if (u.waveTimer <= 0) {
          u.waving = false;
          u.armR.rotation.z = 0;
        }
      } else if (dt > 0) {
        const p1 = u.route[u.routeIdx];
        const nextIdx = (u.routeIdx + 1) % u.route.length;
        const p2 = u.route[nextIdx];
        const legDist = p1.distanceTo(p2);
        u.progress += (dt * 0.6) / legDist;
        if (u.progress >= 1.0) {
          u.progress = 0;
          u.routeIdx = nextIdx;
        }
        a.position.lerpVectors(p1, p2, u.progress);
        a.lookAt(p2.x, a.position.y, p2.z);

        // Walking leg swing
        const walkPhase = this.simTime * 7;
        u.legR.rotation.x = Math.sin(walkPhase) * 0.55;
        u.legL.rotation.x = -Math.sin(walkPhase) * 0.55;
        u.armR.rotation.x = -Math.sin(walkPhase) * 0.45;
        u.armL.rotation.x = Math.sin(walkPhase) * 0.45;
      }
    });

    // 9. Rover Driving & Dust Puff Generation
    this.rovers.forEach(rv => {
      if (dt > 0) {
        const u = rv.userData;
        const p1 = u.route[u.routeIdx];
        const nextIdx = (u.routeIdx + 1) % u.route.length;
        const p2 = u.route[nextIdx];
        const dist = p1.distanceTo(p2);
        const step = (dt * u.speed) / dist;
        u.routeIdx = (u.routeIdx + (step >= 1 ? 1 : 0)) % u.route.length;
        rv.position.lerpVectors(p1, p2, Math.min(1, step));
        rv.lookAt(p2.x, rv.position.y, p2.z);

        // Emit dust puffs
        if (Math.random() < 0.25) {
          this._emitDustPuff(rv.position);
        }
      }
    });

    // 10. Rocket Launch Animation
    if (this.rocketState === 'countdown') {
      this.rocketLaunchT += dt;
      // Countdown vibration
      this.rocketMesh.position.x = (Math.random() - 0.5) * 0.06;
      this.rocketMesh.position.z = (Math.random() - 0.5) * 0.06;
      this._emitRocketPlume();
      if (this.rocketLaunchT > 2.0) {
        this.rocketState = 'launching';
        this.rocketLaunchT = 0;
      }
    } else if (this.rocketState === 'launching') {
      this.rocketLaunchT += dt;
      const ascSpeed = Math.pow(this.rocketLaunchT, 2) * 2.8;
      this.rocketMesh.position.y += ascSpeed * dt;
      this._emitRocketPlume();
      if (this.rocketMesh.position.y > 45) {
        this.rocketState = 'resetting';
        this.rocketFlame.visible = false;
        setTimeout(() => {
          this.rocketMesh.position.set(0, 0.45, 0);
          this.rocketState = 'ready';
          this.onToast('🚀 Launch vehicle safely returned to pad.');
        }, 3000);
      }
    }

    // 11. Suborbital Hopper Flight Arc
    if (this.hopperState === 'flying') {
      this.hopperFlightT += dt * 0.55;
      const startP = new THREE.Vector3(4.5, 0.25, -6.8);
      const endP = this.hopperAuxPad.clone().setY(0.25);
      const t = Math.min(1.0, this.hopperFlightT);

      // Parabolic flight arc
      const curP = new THREE.Vector3().lerpVectors(startP, endP, t);
      curP.y = 0.25 + Math.sin(t * Math.PI) * 7.5;
      this.hopperMesh.position.copy(curP);

      if (t >= 1.0) {
        this.hopperState = 'idle';
        this.hopperFlame.visible = false;
        if (this.sound) this.sound.craterImpact();
        this._spawnDustRipple(this.hopperAuxPad);
        this.onToast('🛸 Hopper touched down smoothly at Auxiliary Pad.');
      }
    }

    // 12. Update Particle Systems
    this._updateParticles(dt);

    // 13. Smooth Damped Camera Interpolation
    this.camYaw += (this.camYawTo - this.camYaw) * 0.12;
    this.camPitch += (this.camPitchTo - this.camPitch) * 0.12;
    this.camDist += (this.camDistTo - this.camDist) * 0.14;
    this.camTarget.lerp(this.camTargetTo, 0.12);
    this._updateCameraPosition();

    // 14. Project 3D Waypoint Labels to Screen
    this._updateLabelPositions();

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  _updateCameraPosition() {
    const cx = this.camTarget.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = this.camTarget.y + Math.sin(this.camPitch) * this.camDist;
    const cz = this.camTarget.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.camTarget);
  }

  _updateLabelPositions() {
    if (!this.showLabels || this.labelElements.length === 0) return;
    const w = this.width, h = this.height;

    this.labelElements.forEach(item => {
      const v = item.pos.clone().project(this.camera);
      // If behind camera
      if (v.z > 1.0) {
        item.el.style.display = 'none';
        return;
      }
      item.el.style.display = 'flex';
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      item.el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`;
    });
  }

  _emitDustPuff(pos) {
    if (!pos || typeof pos.x !== 'number') return;
    if (!this.dustPuffs || !this.dustPuffs.length) return;
    const p = this.dustPuffs.find(d => d.life <= 0);
    if (!p) return;
    p.x = pos.x + (Math.random() - 0.5) * 0.3;
    p.y = 0.12;
    p.z = pos.z + (Math.random() - 0.5) * 0.3;
    p.life = 1.0;
  }

  _emitRocketPlume() {
    const pos = this.rocketPlumeParticles.geometry.attributes.position;
    for (let i = 0; i < 6; i++) {
      const idx = Math.floor(Math.random() * pos.count);
      pos.setXYZ(idx,
        8.5 + (Math.random() - 0.5) * 1.5,
        Math.max(0.2, this.rocketMesh.position.y - 0.8),
        -4.5 + (Math.random() - 0.5) * 1.5
      );
      this.smokeLifetimes[idx] = 1.0;
    }
    pos.needsUpdate = true;
    this.rocketPlumeParticles.material.opacity = 0.85;
  }

  _updateParticles(dt) {
    // 1. Dust Puffs
    const dPos = this.dustParticles.geometry.attributes.position;
    for (let i = 0; i < this.dustPuffs.length; i++) {
      const dp = this.dustPuffs[i];
      if (dp.life > 0) {
        dp.life -= dt * 1.4;
        dp.y += dt * 0.35;
        dPos.setXYZ(i, dp.x, dp.y, dp.z);
      } else {
        dPos.setY(i, -10);
      }
    }
    dPos.needsUpdate = true;

    // 2. Meteor Shower
    if (this.meteorShowerActive && dt > 0) {
      this.meteorTimer -= dt;
      if (this.meteorTimer <= 0) {
        this.meteorTimer = 0.25;
        const m = this.meteors.find(mt => !mt.active);
        if (m) {
          m.active = true;
          m.x = (Math.random() - 0.5) * 36;
          m.y = 24;
          m.z = (Math.random() - 0.5) * 26;
          m.vx = -12 - Math.random() * 8;
          m.vy = -28 - Math.random() * 10;
          m.vz = 8 + Math.random() * 6;
          m.life = 1.0;
        }
      }
    }
    const mPos = this.meteorParticles.geometry.attributes.position;
    for (let i = 0; i < this.meteors.length; i++) {
      const m = this.meteors[i];
      if (m.active) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.z += m.vz * dt;
        mPos.setXYZ(i, m.x, m.y, m.z);
        if (m.y <= 0.2) {
          m.active = false;
          mPos.setY(i, -50);
          this._spawnDustRipple(new THREE.Vector3(m.x, 0.2, m.z));
          if (this.sound) this.sound.craterImpact();
        }
      }
    }
    mPos.needsUpdate = true;

    // 3. Ground Click Dust Ripples
    for (let i = this.dustRipples.length - 1; i >= 0; i--) {
      const r = this.dustRipples[i];
      r.life -= dt * 1.8;
      r.radius += dt * 1.6;
      r.mesh.scale.set(r.radius, r.radius, 1);
      r.mesh.material.opacity = Math.max(0, r.life * 0.7);
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.dustRipples.splice(i, 1);
      }
    }
  }

  resize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  dispose() {
    this.active = false;
    cancelAnimationFrame(this.animFrameId);
    if (this.renderer && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
