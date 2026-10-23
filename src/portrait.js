// Avatar portraits for Player Cards / VS splash. Renderer-side only: reads a loadout, never touches the world.
// One small offscreen WebGL renderer, results cached as data URLs keyed by loadout.
import * as THREE from 'three';
import { buildAvatar, pose } from './avatar3d.js';

const W = 320, H = 400;
let renderer = null, scene = null, camera = null, failed = false;
const cache = new Map();

function init() {
  if (renderer || failed) return !!renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xb7a6ff, 0x2a1f45, 1.6));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.2); key.position.set(1.2, 2.2, 2.4); scene.add(key);
    const rimL = new THREE.PointLight(0xff4d9a, 6, 6, 1.6); rimL.position.set(-1.4, 1.4, -0.8); scene.add(rimL);
    const rimR = new THREE.PointLight(0x35e0ff, 6, 6, 1.6); rimR.position.set(1.4, 1.2, -0.8); scene.add(rimR);
    camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 20);
    return true;
  } catch (e) {
    failed = true; renderer = null;
    return false;
  }
}

// mode: 'bust' (head + shoulders, cards) or 'full' (whole figure, VS splash)
export function portrait(loadout, mode = 'bust') {
  if (!loadout) return '';
  const key = 'v3|' + mode + '|' + JSON.stringify(loadout);
  if (cache.has(key)) return cache.get(key);
  if (!init()) return '';
  let url = '';
  const av = buildAvatar(loadout);
  try {
    av.rotation.y = -0.30;
    const u = av.userData;
    if (u.torso) u.torso.rotation.y = -0.05;
    if (u.head) {
      u.head.rotation.y = 0.20;
      u.head.rotation.x = -0.02;
    }
    if (u.arms) {
      u.arms[0].rotation.z = 0.10;
      u.arms[0].rotation.x = -0.12;
      u.arms[1].rotation.z = -0.14;
      u.arms[1].rotation.x = 0.08;
      if (u.arms[0].userData?.forearm) u.arms[0].userData.forearm.rotation.x = -0.38;
      if (u.arms[1].userData?.forearm) u.arms[1].userData.forearm.rotation.x = -0.25;
    }
    scene.add(av);
    if (mode === 'full') { camera.position.set(0.48, 0.84, 3.4); camera.lookAt(0, 0.66, 0); }
    else { camera.position.set(0.28, 1.24, 1.72); camera.lookAt(0, 0.98, 0); }
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/png');
  } catch (e) {
    url = '';
  } finally {
    scene.remove(av);
    av.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });   // materials are shared via mat() cache
  }
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  cache.set(key, url);
  return url;
}

// Live full-body 3D character showcase stage rendered next to the Player Card.
// Reuses the shared offscreen WebGLRenderer and blits to a 2D canvas (zero extra WebGL contexts).
export function mountAvatarStage(canvas, loadout) {
  if (!canvas || !init()) return { triggerEmote() {}, triggerSay() {}, dispose() {} };
  const ctx = canvas.getContext('2d');
  let av = buildAvatar(loadout);

  // Neon Holo-Pedestal under the standing character
  const ped = new THREE.Group();
  const baseGeo = new THREE.CylinderGeometry(0.46, 0.52, 0.05, 32);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x141829, metalness: 0.7, roughness: 0.3 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = -0.025;
  ped.add(baseMesh);

  const ringGeo = new THREE.TorusGeometry(0.47, 0.014, 10, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x54e0ee });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = 0.004;
  ped.add(ringMesh);

  const innerRingGeo = new THREE.TorusGeometry(0.34, 0.008, 8, 32);
  const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xff4d9a });
  const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.005;
  ped.add(innerRing);

  const personState = {
    state: 'idle',
    emote: { name: 'wave', t: 1.4 },
    say: null
  };

  let yaw = -0.22;
  let dragging = false;
  let lastX = 0;
  let alive = true;
  let rafId = 0;
  let lastT = performance.now();

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    yaw += dx * 0.012;
  };
  const onUp = () => { dragging = false; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function tick(now) {
    if (!alive) return;
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = now / 1000;

    if (personState.emote) {
      personState.emote.t -= dt;
      if (personState.emote.t <= 0) personState.emote = null;
    }
    if (personState.say) {
      personState.say.t -= dt;
      if (personState.say.t <= 0) personState.say = null;
    }

    av.rotation.y = yaw;
    pose(av, personState, t, dt);
    ringMesh.scale.setScalar(1 + Math.sin(t * 3.5) * 0.025);

    scene.add(ped);
    scene.add(av);
    camera.position.set(0.0, 0.80, 3.50);
    camera.lookAt(0, 0.58, 0);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    scene.remove(av);
    scene.remove(ped);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }
  rafId = requestAnimationFrame(tick);

  return {
    triggerEmote(name) {
      personState.emote = { name, t: 2.2 };
    },
    triggerSay(text) {
      personState.say = { text, t: 3.0 };
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      av.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      baseGeo.dispose();
      ringGeo.dispose();
      innerRingGeo.dispose();
    }
  };
}
