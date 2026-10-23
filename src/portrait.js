// Avatar portraits for Player Cards / VS splash. Renderer-side only: reads a loadout, never touches the world.
// One small offscreen WebGL renderer, results cached as data URLs keyed by loadout.
import * as THREE from 'three';
import { buildAvatar } from './avatar3d.js';

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
  const key = mode + '|' + JSON.stringify(loadout);
  if (cache.has(key)) return cache.get(key);
  if (!init()) return '';
  let url = '';
  const av = buildAvatar(loadout);
  try {
    av.rotation.y = -0.38;
    const u = av.userData;
    if (u.arms) { u.arms[0].rotation.z = 0.12; u.arms[1].rotation.z = -0.12; }
    if (u.head) u.head.rotation.x = -0.04;
    scene.add(av);
    if (mode === 'full') { camera.position.set(0.55, 0.85, 3.6); camera.lookAt(0, 0.66, 0); }
    else { camera.position.set(0.32, 1.22, 2.0); camera.lookAt(0, 1.06, 0); }
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
