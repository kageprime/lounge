// Camera shots. Only decides where the camera sits / looks; the Stage smooths the motion.
//   auto   close on the tray while a die is being thrown, back to the whole table while pawns move
//   board  whole table: board plus dice tray
//   dice   tight on the tray
//   top    straight down
//   orbit  free: arrow keys / drag rotate, [ ] or wheel zoom
import * as THREE from 'three';

export const CAMS = ['auto', 'board', 'dice', 'top', 'orbit'];
export const CAM_LABEL = { auto: 'Auto', board: 'Table', dice: 'Dice', top: 'Top', orbit: 'Orbit' };
const V3 = THREE.Vector3, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CameraRig {
  constructor(layout) {
    this.L = layout;                       // { boardX, trayX }
    this.mode = 'auto';
    this.orbit = { yaw: 0, pitch: 0.95, dist: 1.25 };
  }
  set(m) { if (CAMS.includes(m)) this.mode = m; }
  next() { this.mode = CAMS[(CAMS.indexOf(this.mode) + 1) % CAMS.length]; return this.mode; }
  nudge(dyaw, dpitch, ddist) {
    const o = this.orbit;
    o.yaw += dyaw; o.pitch = clamp(o.pitch + dpitch, 0.2, 1.5); o.dist = clamp(o.dist + ddist, 0.45, 2.4);
  }
  resolve(phase) { return this.mode !== 'auto' ? this.mode : (phase === 'roll' ? 'rollcam' : 'board'); }

  // frame a horizontal span `w` (metres) and vertical span `h` at the given elevation angle
  _frame(look, w, h, elev, fov, aspect, yawOff = 0) {
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const dist = Math.max(w / (2 * t * aspect), h / (2 * t)) * 1.06;
    const pos = new V3(look.x + Math.sin(yawOff) * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist, look.z + Math.cos(yawOff) * Math.cos(elev) * dist);
    return { pos, look, fov };
  }

  compute(phase, aspect) {
    const mode = this.resolve(phase), L = this.L, fov = 42;
    let shot, k = 3.2;
    switch (mode) {
      case 'rollcam': shot = this._frame(new V3(L.trayX * 0.5, 0, 0.02), 1.3, 0.9, 1.0, fov, aspect); k = 2.6; break;
      case 'dice': shot = this._frame(new V3(L.trayX, 0, 0.02), 0.5, 0.5, 1.12, fov, aspect); k = 3.2; break;
      case 'top': shot = this._frame(new V3((L.boardX + L.trayX) / 2 + 0.1, 0, 0.03), 1.45, 0.88, Math.PI / 2 - 0.02, fov, aspect); break;
      case 'orbit': {
        const o = this.orbit, look = new V3(0.2, 0, 0);
        shot = { look, fov: 46, pos: new V3(look.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, Math.sin(o.pitch) * o.dist, look.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist) };
        k = 8; break;
      }
      default: shot = this._frame(new V3((L.boardX + L.trayX) / 2 + 0.04, 0, 0.0), 1.56, 0.9, 1.0, fov, aspect); break;
    }
    return { mode, ...shot, k };
  }
}
