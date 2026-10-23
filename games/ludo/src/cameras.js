// Camera shots. Only decides where the camera sits / looks; the Stage smooths the motion.
//   auto   close on the tray while a die is being thrown, back to the whole table while pawns move
//   board  whole table: board plus dice tray
//   dice   tight on the tray
//   top    straight down
//   orbit  free: arrow keys / drag rotate, [ ] or wheel zoom
import * as THREE from 'three';

export const CAMS = ['auto', 'action', 'board', 'dice', 'top', 'orbit'];
export const CAM_LABEL = { auto: 'Cinema Auto', action: 'Close Action', board: 'Club Table', dice: 'Dice Tray', top: 'Overhead', orbit: 'Free Orbit' };
const V3 = THREE.Vector3, clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CameraRig {
  constructor(layout) {
    this.L = layout;                       // { boardX, trayX }
    this.mode = 'auto';
    this.orbit = { yaw: 0, pitch: 0.82, dist: 1.25 };
  }
  set(m) { if (CAMS.includes(m)) this.mode = m; }
  next() { this.mode = CAMS[(CAMS.indexOf(this.mode) + 1) % CAMS.length]; return this.mode; }
  nudge(dyaw, dpitch, ddist) {
    const o = this.orbit;
    o.yaw += dyaw; o.pitch = clamp(o.pitch + dpitch, 0.2, 1.5); o.dist = clamp(o.dist + ddist, 0.45, 2.4);
  }
  resolve(phase, movingPawn) {
    if (this.mode !== 'auto') return this.mode;
    if (movingPawn) return 'pawnfollow';
    return phase === 'roll' ? 'rollcam' : 'board';
  }

  // frame a horizontal span `w` (metres) and vertical span `h` at the given elevation angle
  _frame(look, w, h, elev, fov, aspect, yawOff = 0) {
    const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const dist = Math.max(w / (2 * t * aspect), h / (2 * t)) * 1.06;
    const pos = new V3(look.x + Math.sin(yawOff) * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist, look.z + Math.cos(yawOff) * Math.cos(elev) * dist);
    return { pos, look, fov };
  }

  compute(phase, aspect, movingPawn = null) {
    const mode = this.resolve(phase, movingPawn), L = this.L, fov = 40;
    let shot, k = 3.6;
    switch (mode) {
      case 'pawnfollow': {
        const px = movingPawn ? movingPawn.x : L.boardX;
        const pz = movingPawn ? movingPawn.z : 0;
        const isFly = movingPawn?.anim?.kind === 'fly';
        shot = this._frame(new V3(px * 0.65 + L.boardX * 0.35, 0.03, pz * 0.65), isFly ? 0.72 : 0.92, isFly ? 0.48 : 0.6, 0.68, 38, aspect, 0.14);
        k = 4.8;
        break;
      }
      case 'action':
        shot = this._frame(new V3(L.boardX + 0.08, 0.02, 0.04), 1.05, 0.68, 0.64, 38, aspect, 0.18);
        k = 4.0;
        break;
      case 'rollcam':
        shot = this._frame(new V3((L.boardX + L.trayX) * 0.5 + 0.06, 0.01, 0.03), 1.44, 0.84, 0.78, fov, aspect, -0.08);
        k = 3.2;
        break;
      case 'dice':
        shot = this._frame(new V3(L.trayX, 0.01, 0.02), 0.48, 0.46, 0.88, 38, aspect, -0.1);
        k = 4.2;
        break;
      case 'top':
        shot = this._frame(new V3((L.boardX + L.trayX) / 2 + 0.1, 0, 0.03), 1.45, 0.88, Math.PI / 2 - 0.02, fov, aspect);
        break;
      case 'orbit': {
        const o = this.orbit, look = new V3(0.2, 0, 0);
        shot = { look, fov: 44, pos: new V3(look.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, Math.sin(o.pitch) * o.dist, look.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist) };
        k = 8; break;
      }
      default:
        shot = this._frame(new V3((L.boardX + L.trayX) / 2 + 0.02, 0.01, 0.02), 1.48, 0.84, 0.84, fov, aspect, 0.06);
        break;
    }
    return { mode, ...shot, k };
  }
}
