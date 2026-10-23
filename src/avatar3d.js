// Avatar = loadout JSON -> 14-joint articulated stylized 3D streetwear figure, posed procedurally.
// Skeleton contract: root > hips > { torso > { head, arms:[armL, armR] }, legs:[legL, legR] }
// Each arm exposes arm.userData.forearm; each leg exposes leg.userData.shin.
import * as THREE from 'three';
import { mat } from './props3d.js';

const BODY = { slim: 0.9, regular: 1, broad: 1.13 };
const EYE_PALETTE = ['#3b2618', '#1f6f8b', '#2d7a4c', '#6e4594', '#b87624'];

function add(parent, geo, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

function hashStr(s = '') {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildAvatar(lo = {}) {
  const root = new THREE.Group();
  const w = BODY[lo.body] || 1;
  const seed = hashStr(JSON.stringify(lo));

  // Core palette materials
  const skinColor = lo.skin || '#e8b48a';
  const topColor = lo.topColor || '#ff4d6d';
  const botColor = lo.bottomColor || '#2f4a8a';
  const shoeColor = lo.shoes || '#d1495b';
  const hairColor = lo.hairColor || '#201814';
  const eyeHex = EYE_PALETTE[seed % EYE_PALETTE.length];

  const skin = mat(skinColor, { r: 0.62 });
  const skinWarm = mat(new THREE.Color(skinColor).lerp(new THREE.Color('#d96b6b'), 0.18).getStyle(), { r: 0.65 });
  const top = mat(topColor, { r: 0.72 });
  const topDark = mat(new THREE.Color(topColor).multiplyScalar(0.76).getStyle(), { r: 0.8 });
  const bot = mat(botColor, { r: 0.78 });
  const botDark = mat(new THREE.Color(botColor).multiplyScalar(0.75).getStyle(), { r: 0.82 });
  const shoe = mat(shoeColor, { r: 0.45 });
  const hair = mat(hairColor, { r: 0.58 });
  const whiteMat = mat('#f5f6fa', { r: 0.55 });
  const soleMat = mat('#e8eaf2', { r: 0.65 });
  const darkMat = mat('#181924', { r: 0.5 });
  const goldMat = mat('#ffd166', { m: 0.75, r: 0.28, e: '#ffd166', ei: 0.25 });
  const chromeMat = mat('#d8dee9', { m: 0.8, r: 0.25 });

  // ---------- HIPS (Root pelvis at y = 0.45) ----------
  const hips = new THREE.Group();
  hips.position.y = 0.45;
  root.add(hips);

  // Pelvis / shorts base block so hip joint never shows gaps
  const pelvisMat = lo.bottom === 'skirt' ? bot : botDark;
  add(hips, new THREE.CylinderGeometry(0.162 * w, 0.155 * w, 0.11, 18), pelvisMat, 0, -0.02, 0);

  // ---------- ARTICULATED LEGS (Thigh > Knee/Shin > Chunky Sneaker) ----------
  const isFullPants = lo.bottom === 'jeans' || lo.bottom === 'cargo' || !lo.bottom;
  const isSkirt = lo.bottom === 'skirt';

  const legs = [-1, 1].map(s => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.098 * w, -0.03, 0);
    hips.add(leg);

    // Hip joint ball
    add(leg, new THREE.SphereGeometry(0.068 * w, 12, 10), isSkirt ? skin : bot, 0, 0, 0);

    // Upper Leg (Thigh)
    const thighMat = isSkirt ? skin : bot;
    add(leg, new THREE.CylinderGeometry(0.076 * w, 0.064 * w, 0.21, 14), thighMat, 0, -0.105, 0);

    // Cargo side pocket detail
    if (lo.bottom === 'cargo') {
      add(leg, new THREE.BoxGeometry(0.028, 0.085, 0.072), botDark, s * 0.068 * w, -0.11, 0.01);
    }

    // Knee + Shin Group (pivots at y = -0.20)
    const shin = new THREE.Group();
    shin.position.set(0, -0.20, 0);
    leg.add(shin);

    // Rounded knee joint
    add(shin, new THREE.SphereGeometry(0.06 * w, 12, 10), isFullPants ? bot : skin, 0, 0, 0.005);

    if (isFullPants) {
      add(shin, new THREE.CylinderGeometry(0.064 * w, 0.054 * w, 0.19, 14), bot, 0, -0.095, 0);
      // Rolled denim / cargo ankle cuff
      const cuff = add(shin, new THREE.TorusGeometry(0.054 * w, 0.013, 8, 16), botDark, 0, -0.175, 0);
      cuff.rotation.x = Math.PI / 2;
    } else {
      // Bare calf + athletic crew sock
      add(shin, new THREE.CylinderGeometry(0.058 * w, 0.046 * w, 0.13, 12), skin, 0, -0.07, 0);
      add(shin, new THREE.CylinderGeometry(0.050 * w, 0.048 * w, 0.07, 12), whiteMat, 0, -0.155, 0);
      add(shin, new THREE.CylinderGeometry(0.051 * w, 0.051 * w, 0.014, 12), top, 0, -0.132, 0);
    }

    // Chunky Two-Tone Streetwear Sneaker (at y = -0.20 on shin)
    const foot = new THREE.Group();
    foot.position.set(0, -0.20, 0.032);
    shin.add(foot);
    // Outsole tread + thick white midsole
    add(foot, new THREE.BoxGeometry(0.118, 0.016, 0.215), darkMat, 0, -0.032, 0.01);
    add(foot, new THREE.BoxGeometry(0.116, 0.028, 0.21), soleMat, 0, -0.012, 0.01);
    // Sneaker upper vamp + collar
    add(foot, new THREE.BoxGeometry(0.104, 0.052, 0.135), shoe, 0, 0.024, -0.018);
    // Sculpted rounded toe box
    const toe = add(foot, new THREE.CylinderGeometry(0.050, 0.052, 0.038, 14), whiteMat, 0, 0.016, 0.068);
    toe.scale.set(1, 0.85, 1.25);
    // Tongue + white laces bar
    const tongue = add(foot, new THREE.BoxGeometry(0.062, 0.042, 0.018), shoe, 0, 0.052, 0.028);
    tongue.rotation.x = -0.35;
    add(foot, new THREE.BoxGeometry(0.068, 0.012, 0.042), whiteMat, 0, 0.042, 0.042);

    leg.userData = { shin, foot };
    return leg;
  });

  if (isSkirt) {
    add(hips, new THREE.CylinderGeometry(0.145 * w, 0.235 * w, 0.21, 20), bot, 0, -0.06, 0);
    const hem = add(hips, new THREE.TorusGeometry(0.23 * w, 0.012, 8, 22), botDark, 0, -0.16, 0);
    hem.rotation.x = Math.PI / 2;
  } else {
    // Belt + metallic buckle
    add(hips, new THREE.CylinderGeometry(0.168 * w, 0.168 * w, 0.036, 18), darkMat, 0, 0.02, 0);
    add(hips, new THREE.BoxGeometry(0.055, 0.038, 0.022), goldMat, 0, 0.02, 0.165 * w);
  }

  // ---------- TORSO & LAYERED STREETWEAR ----------
  const torso = new THREE.Group();
  torso.position.y = 0.02;
  hips.add(torso);

  // Tapered upper chest + waist silhouette
  add(torso, new THREE.CylinderGeometry(0.192 * w, 0.162 * w, 0.34, 20), top, 0, 0.28, 0);
  add(torso, new THREE.CylinderGeometry(0.162 * w, 0.168 * w, 0.14, 20), topDark, 0, 0.07, 0);

  // Rounded shoulder deltoid caps for smooth silhouette
  [-1, 1].forEach(s => {
    add(torso, new THREE.SphereGeometry(0.068 * w, 14, 12), top, s * 0.195 * w, 0.41, 0);
  });

  // Exposed collarbone / neckline skin
  add(torso, new THREE.CylinderGeometry(0.075 * w, 0.085 * w, 0.06, 16), skin, 0, 0.445, 0.01);

  const topStyle = lo.top || 'hoodie';
  if (topStyle === 'hoodie') {
    // Sculpted 3D hood resting around the back/sides of the neck
    const hood = add(torso, new THREE.TorusGeometry(0.122, 0.046, 10, 20), top, 0, 0.465, -0.028);
    hood.rotation.x = Math.PI / 2 + 0.18;
    // Kangaroo pocket
    const pkt = add(torso, new THREE.BoxGeometry(0.21 * w, 0.11, 0.036), topDark, 0, 0.13, 0.158 * w);
    pkt.rotation.x = 0.04;
    // Dual drawstrings + metal aglets
    [-0.042, 0.042].forEach(dx => {
      add(torso, new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), whiteMat, dx, 0.35, 0.182 * w);
      add(torso, new THREE.CylinderGeometry(0.007, 0.007, 0.022, 8), chromeMat, dx, 0.285, 0.182 * w);
    });
  } else if (topStyle === 'jacket' || topStyle === 'bomber') {
    // Open jacket over contrasting inner tee
    const innerMat = topStyle === 'bomber' ? darkMat : whiteMat;
    add(torso, new THREE.BoxGeometry(0.13 * w, 0.39, 0.032), innerMat, 0, 0.24, 0.162 * w);
    // Graphic chest bar on inner tee
    add(torso, new THREE.BoxGeometry(0.11 * w, 0.045, 0.036), goldMat, 0, 0.31, 0.165 * w);
    // Left & right jacket lapels / zipper tracks
    [-1, 1].forEach(s => {
      add(torso, new THREE.BoxGeometry(0.085 * w, 0.40, 0.042), top, s * 0.105 * w, 0.24, 0.162 * w);
      add(torso, new THREE.BoxGeometry(0.012, 0.39, 0.046), chromeMat, s * 0.062 * w, 0.24, 0.166 * w);
    });
    // Popped varsity / bomber collar
    const col = add(torso, new THREE.TorusGeometry(0.098, 0.026, 8, 18, Math.PI * 1.35), topStyle === 'bomber' ? goldMat : topDark, 0, 0.45, -0.01);
    col.rotation.x = Math.PI / 2;
    col.rotation.z = Math.PI * 0.825;
  } else {
    // Tee or Jersey: crew-neck collar ring + chest streetwear graphic stripe
    const collar = add(torso, new THREE.TorusGeometry(0.088, 0.016, 8, 18), topStyle === 'jersey' ? whiteMat : topDark, 0, 0.445, 0.01);
    collar.rotation.x = Math.PI / 2;
    add(torso, new THREE.BoxGeometry(0.22 * w, 0.055, 0.028), whiteMat, 0, 0.30, 0.172 * w);
    if (topStyle === 'jersey') {
      add(torso, new THREE.BoxGeometry(0.09 * w, 0.11, 0.032), goldMat, 0, 0.26, 0.174 * w);
    }
  }

  // ---------- ARTICULATED ARMS (UpperArm > Elbow/Forearm > Sculpted Hand) ----------
  const longSleeve = topStyle !== 'tee' && topStyle !== 'jersey';
  const arms = [-1, 1].map(s => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.225 * w, 0.41, 0);
    torso.add(arm);

    // Upper Arm sleeve
    const sleeveMat = topStyle === 'bomber' ? whiteMat : top;
    add(arm, new THREE.CylinderGeometry(0.060, 0.050, 0.18, 12), sleeveMat, 0, -0.085, 0);
    if (!longSleeve) {
      // Short sleeve cuff ring
      const sc = add(arm, new THREE.TorusGeometry(0.051, 0.009, 6, 14), topDark, 0, -0.165, 0);
      sc.rotation.x = Math.PI / 2;
    }

    // Elbow + Forearm Group (pivots at y = -0.17)
    const forearm = new THREE.Group();
    forearm.position.set(0, -0.17, 0);
    arm.add(forearm);

    add(forearm, new THREE.SphereGeometry(0.047, 10, 10), longSleeve ? sleeveMat : skin, 0, 0, 0);
    add(forearm, new THREE.CylinderGeometry(0.048, 0.038, 0.16, 12), longSleeve ? sleeveMat : skin, 0, -0.08, 0);

    if (longSleeve) {
      const cuff = add(forearm, new THREE.CylinderGeometry(0.042, 0.040, 0.035, 12), topDark, 0, -0.15, 0);
      void cuff;
    } else if (s === -1) {
      // Streetwear wristwatch / band on left wrist
      add(forearm, new THREE.CylinderGeometry(0.043, 0.043, 0.024, 12), darkMat, 0, -0.14, 0);
      add(forearm, new THREE.BoxGeometry(0.022, 0.026, 0.015), goldMat, -0.036, -0.14, 0);
    }

    // Sculpted Hand (palm + angled thumb)
    const hand = new THREE.Group();
    hand.position.set(0, -0.175, 0.008);
    forearm.add(hand);
    const palm = add(hand, new THREE.SphereGeometry(0.044, 12, 10), skin, 0, -0.01, 0);
    palm.scale.set(0.82, 1.12, 0.95);
    const thumb = add(hand, new THREE.CylinderGeometry(0.012, 0.014, 0.036, 8), skin, -s * 0.028, 0.0, 0.024);
    thumb.rotation.z = s * 0.55;
    thumb.rotation.x = 0.4;

    arm.userData = { forearm, hand };
    return arm;
  });

  // ---------- SCULPTED HEAD & EXPRESSIVE 3D FACE ----------
  const head = new THREE.Group();
  head.position.y = 0.56;
  torso.add(head);

  // Seamless Neck cylinder extending deep into collarbone/torso (zero gap on any outfit)
  add(head, new THREE.CylinderGeometry(0.062, 0.078, 0.24, 16), skin, 0, -0.05, 0);

  // Sculpted Cranium + Smooth Jawline Contour
  const cranium = add(head, new THREE.SphereGeometry(0.188, 32, 24), skin, 0, 0.165, 0);
  cranium.scale.set(0.96, 1.05, 0.98);

  // 3D Ears + Warm Inner Ear + Gold Stud
  [-1, 1].forEach(s => {
    const ear = add(head, new THREE.SphereGeometry(0.040, 12, 10), skin, s * 0.180, 0.155, -0.005);
    ear.scale.set(0.42, 1.12, 0.70);
    const inner = add(head, new THREE.SphereGeometry(0.024, 10, 8), skinWarm, s * 0.188, 0.155, 0.002);
    inner.scale.set(0.32, 0.90, 0.52);
    add(head, new THREE.SphereGeometry(0.011, 8, 8), goldMat, s * 0.190, 0.126, 0.008);
  });

  // Sculpted 3D Nose Bridge & Tip
  const nose = add(head, new THREE.CylinderGeometry(0.010, 0.018, 0.042, 10), skinWarm, 0, 0.148, 0.182);
  nose.rotation.x = -0.25;
  add(head, new THREE.SphereGeometry(0.016, 10, 10), skinWarm, 0, 0.134, 0.189);

  // Multi-Layer Expressive Eyes (Flush Sclera + Colored Iris + Pupil + Dual Catchlights + Blinking Eyelids + Brows)
  const scleraMat = mat('#f8f9fc', { r: 0.25 });
  const irisMat = mat(eyeHex, { r: 0.22 });
  const pupilMat = mat('#0d0d14', { r: 0.1 });
  const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lashMat = mat('#18141c', { r: 0.4 });

  const eyelids = [];
  const brows = [];
  [-1, 1].forEach(s => {
    const ex = s * 0.064, ey = 0.168, ez = 0.172;
    const eyeGrp = new THREE.Group();
    eyeGrp.position.set(ex, ey, ez);
    eyeGrp.rotation.y = s * 0.20;
    head.add(eyeGrp);

    // Sclera white oval flush with face curve
    const sc = add(eyeGrp, new THREE.SphereGeometry(0.032, 16, 12), scleraMat, 0, 0, 0);
    sc.scale.set(1.08, 0.88, 0.34);

    // Colored Iris disc
    const ir = add(eyeGrp, new THREE.CylinderGeometry(0.019, 0.019, 0.008, 16), irisMat, 0, 0, 0.009);
    ir.rotation.x = Math.PI / 2;

    // Dark Pupil
    const pu = add(eyeGrp, new THREE.CylinderGeometry(0.0105, 0.0105, 0.010, 14), pupilMat, 0, 0, 0.011);
    pu.rotation.x = Math.PI / 2;

    // Dual Specular Catchlights
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8), catchMat);
    c1.position.set(-0.006, 0.006, 0.016);
    eyeGrp.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.0030, 6, 6), catchMat);
    c2.position.set(0.005, -0.005, 0.016);
    eyeGrp.add(c2);

    // Upper Eyelash Arch
    const lash = add(eyeGrp, new THREE.TorusGeometry(0.031, 0.005, 6, 16, Math.PI), lashMat, 0, 0.002, 0.008);
    lash.scale.set(1.06, 0.84, 0.6);

    // Blinking Upper Eyelid Hood
    const lid = add(eyeGrp, new THREE.SphereGeometry(0.033, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), skin, 0, 0.002, 0.001);
    lid.scale.set(1.10, 0.15, 0.45);
    eyelids.push(lid);

    // Expressive Sculpted Eyebrow
    const brow = add(head, new THREE.BoxGeometry(0.060, 0.013, 0.016), hair, ex, ey + 0.044, ez + 0.006);
    brow.rotation.y = s * 0.20;
    brow.rotation.z = -s * 0.07;
    brows.push(brow);
  });

  // Expressive Mouth (Confident Smirk + Open Talk/Smile state)
  const mouthGrp = new THREE.Group();
  mouthGrp.position.set(0, 0.092, 0.176);
  head.add(mouthGrp);
  const lipMat = mat('#6b2d38', { r: 0.45 });
  const smirk = add(mouthGrp, new THREE.TorusGeometry(0.026, 0.0055, 8, 16, Math.PI * 0.85), lipMat, 0.003, 0.008, 0);
  smirk.rotation.z = Math.PI + 0.08;
  const mouthOpen = add(mouthGrp, new THREE.CylinderGeometry(0.022, 0.018, 0.012, 14), lipMat, 0, -0.002, 0);
  mouthOpen.rotation.x = Math.PI / 2;
  mouthOpen.scale.set(1, 1, 0.1);
  mouthOpen.visible = false;
  const teeth = add(mouthGrp, new THREE.BoxGeometry(0.028, 0.007, 0.008), scleraMat, 0, 0.003, 0.003);
  teeth.visible = false;

  // ---------- SCULPTED HAIRSTYLES ----------
  const capDome = (r = 0.198, arc = 0.56, m = hair) =>
    add(head, new THREE.SphereGeometry(r, 26, 16, 0, Math.PI * 2, 0, Math.PI * arc), m, 0, 0.18, -0.004);

  switch (lo.hair) {
    case 'none':
      break;
    case 'short': {
      capDome(0.198, 0.56);
      // Textured front waves / fringe
      [-0.07, 0, 0.07].forEach((x, i) => {
        const wv = add(head, new THREE.SphereGeometry(0.058 - i * 0.005, 12, 10), hair, x, 0.31, 0.145);
        wv.scale.set(1.2, 0.72, 0.9);
      });
      break;
    }
    case 'fade': {
      // High-top taper fade with sponge-curl top volume
      capDome(0.194, 0.48);
      const topBlock = add(head, new THREE.CylinderGeometry(0.158, 0.172, 0.11, 20), hair, 0, 0.34, -0.005);
      topBlock.scale.set(0.95, 1, 0.98);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add(head, new THREE.SphereGeometry(0.055, 10, 8), hair, Math.cos(a) * 0.085, 0.385, Math.sin(a) * 0.085 - 0.005);
      }
      break;
    }
    case 'locs': {
      // Sculpted dreadlocks / box braids with gold hair cuffs
      capDome(0.198, 0.52);
      const numLocs = 14;
      for (let i = 0; i < numLocs; i++) {
        const ang = -Math.PI * 0.78 + (i / (numLocs - 1)) * (Math.PI * 1.56);
        const rx = Math.sin(ang) * 0.178;
        const rz = -Math.cos(ang) * 0.178 - 0.01;
        const len = 0.24 + (i % 3) * 0.035;
        const loc = add(head, new THREE.CylinderGeometry(0.024, 0.019, len, 8), hair, rx, 0.16 - len * 0.35, rz);
        loc.rotation.z = -rx * 0.55;
        loc.rotation.x = rz * 0.35;
        if (i % 4 === 1) {
          add(loc, new THREE.CylinderGeometry(0.026, 0.026, 0.022, 8), goldMat, 0, -len * 0.2, 0);
        }
      }
      break;
    }
    case 'long': {
      capDome(0.20, 0.58);
      // Flowing back hair + face-framing front locks
      add(head, new THREE.BoxGeometry(0.36, 0.34, 0.14), hair, 0, 0.02, -0.13);
      [-1, 1].forEach(s => {
        const strand = add(head, new THREE.CylinderGeometry(0.034, 0.024, 0.28, 10), hair, s * 0.168, 0.08, 0.06);
        strand.rotation.z = s * 0.12;
      });
      break;
    }
    case 'bun': {
      capDome(0.198, 0.56);
      add(head, new THREE.SphereGeometry(0.092, 16, 14), hair, 0, 0.41, -0.055);
      const tie = add(head, new THREE.TorusGeometry(0.058, 0.012, 8, 16), goldMat, 0, 0.355, -0.045);
      tie.rotation.x = Math.PI / 2 - 0.2;
      [-1, 1].forEach(s => {
        const bang = add(head, new THREE.SphereGeometry(0.055, 12, 10), hair, s * 0.085, 0.29, 0.14);
        bang.scale.set(1.2, 0.65, 0.7);
      });
      break;
    }
    case 'mohawk': {
      capDome(0.192, 0.45);
      for (let i = 0; i < 5; i++) {
        const sp = add(head, new THREE.ConeGeometry(0.042, 0.13, 8), hair, 0, 0.38 - i * 0.015, 0.10 - i * 0.065);
        sp.rotation.x = -0.25 + i * 0.18;
      }
      break;
    }
    case 'cap': {
      capDome(0.204, 0.54, hair);
      // Curved streetwear visor + button + front emblem
      const visor = add(head, new THREE.CylinderGeometry(0.165, 0.165, 0.022, 20, 1, false, -Math.PI * 0.38, Math.PI * 0.76), hair, 0, 0.235, 0.065);
      visor.rotation.x = 0.16;
      add(head, new THREE.SphereGeometry(0.022, 8, 8), whiteMat, 0, 0.385, -0.005);
      add(head, new THREE.BoxGeometry(0.075, 0.042, 0.016), goldMat, 0, 0.285, 0.195);
      break;
    }
    case 'afro': {
      add(head, new THREE.SphereGeometry(0.255, 20, 16), hair, 0, 0.245, -0.035);
      const puffs = [
        [-0.14, 0.26, 0.04, 0.13], [0.14, 0.26, 0.04, 0.13],
        [0, 0.34, 0.05, 0.14], [-0.11, 0.33, -0.08, 0.14],
        [0.11, 0.33, -0.08, 0.14], [0, 0.22, -0.15, 0.15]
      ];
      puffs.forEach(([px, py, pz, pr]) => add(head, new THREE.SphereGeometry(pr, 14, 12), hair, px, py, pz));
      break;
    }
    default:
      capDome(0.198, 0.56);
      break;
  }

  // ---------- ACCESSORIES ----------
  if (lo.accessory === 'glasses') {
    [-0.068, 0.068].forEach(x => {
      add(head, new THREE.TorusGeometry(0.046, 0.008, 8, 20), goldMat, x, 0.172, 0.192);
    });
    add(head, new THREE.BoxGeometry(0.042, 0.008, 0.008), goldMat, 0, 0.178, 0.195);
  }
  if (lo.accessory === 'shades') {
    const shadeMat = mat('#090a10', { r: 0.12, m: 0.6 });
    add(head, new THREE.BoxGeometry(0.29, 0.068, 0.045), shadeMat, 0, 0.176, 0.188);
    add(head, new THREE.BoxGeometry(0.30, 0.012, 0.050), goldMat, 0, 0.208, 0.190);
  }
  if (lo.accessory === 'headphones') {
    const band = add(head, new THREE.TorusGeometry(0.212, 0.018, 8, 24, Math.PI), darkMat, 0, 0.175, 0);
    band.rotation.z = 0;
    [-1, 1].forEach(s => {
      const cup = add(head, new THREE.CylinderGeometry(0.062, 0.062, 0.048, 16), mat('#ff4d9a', { e: '#ff4d9a', ei: 0.65 }), s * 0.21, 0.165, 0);
      cup.rotation.z = Math.PI / 2;
      const ring = add(head, new THREE.TorusGeometry(0.048, 0.007, 6, 16), mat('#35e0ff', { e: '#35e0ff', ei: 1.4 }), s * 0.235, 0.165, 0);
      ring.rotation.y = Math.PI / 2;
    });
  }
  if (lo.accessory === 'halo') {
    const h = add(head, new THREE.TorusGeometry(0.185, 0.018, 10, 28), mat('#ffd166', { e: '#ffd166', ei: 2.2 }), 0, 0.47, 0);
    h.rotation.x = Math.PI / 2;
  }
  if (lo.accessory === 'crown') {
    const cr = add(head, new THREE.CylinderGeometry(0.125, 0.095, 0.085, 6, 1, false), mat('#ffb84a', { m: 0.85, r: 0.25, e: '#ffb84a', ei: 0.9 }), 0, 0.43, 0);
    cr.rotation.y = 0.3;
  }

  root.userData = {
    hips, torso, head, legs, arms,
    eyelids, brows, smirk, mouthOpen, teeth,
    ph: (seed % 600) / 100,
    jump: 0
  };
  return root;
}

const lerp = (a, b, k) => a + (b - a) * k;

// Pose from simulation state. Pure function of (person, time): the renderer never decides anything.
export function pose(av, p, t, dt) {
  const u = av.userData;
  const [lL, lR] = u.legs;
  const [aL, aR] = u.arms;
  const shinL = lL.userData?.shin, shinR = lR.userData?.shin;
  const foreL = aL.userData?.forearm, foreR = aR.userData?.forearm;
  const k = Math.min(1, dt * 12);

  let ll = 0, lr = 0, kneeL = 0, kneeR = 0;
  let al = 0, ar = 0, alz = 0.06, arz = -0.06, elbL = -0.18, elbR = -0.18;
  let hipY = 0, bob = 0, headX = 0, headY = 0, torsoY = 0, torsoX = 0;

  const e = p.emote && p.emote.name;
  const et = p.emote ? (2.2 - p.emote.t) : 0;

  if (p.state === 'walk') {
    u.ph += dt * 9.5;
    const s = Math.sin(u.ph);
    ll = s * 0.68;
    lr = -s * 0.68;
    // Natural knee bend on the trailing/lifting leg
    kneeL = Math.max(0.05, -Math.sin(u.ph - 0.5) * 0.85);
    kneeR = Math.max(0.05, Math.sin(u.ph - 0.5) * 0.85);
    al = -s * 0.52;
    ar = s * 0.52;
    elbL = -0.35 - Math.max(0, -s) * 0.35;
    elbR = -0.35 - Math.max(0, s) * 0.35;
    torsoY = s * 0.08;
    bob = Math.abs(Math.cos(u.ph)) * 0.045;
  } else if (p.state === 'sit') {
    // Thighs forward, knees bent 90 degrees downward so sneakers hang naturally
    ll = lr = -Math.PI / 2 + 0.12;
    kneeL = kneeR = Math.PI / 2 - 0.16;
    al = ar = -0.32;
    elbL = elbR = -0.55;
    hipY = (p.seatH || 0) - 0.02;
    torsoX = 0.04;
  } else if (p.state === 'use') {
    al = -0.78 + Math.sin(t * 9 + u.ph) * 0.05;
    ar = -0.75 + Math.sin(t * 11 + u.ph) * 0.06;
    elbL = -0.65 + Math.cos(t * 10) * 0.08;
    elbR = -0.65 - Math.cos(t * 10) * 0.08;
    headX = -0.12;
    torsoX = 0.06;
  } else {
    // Relaxed breathing & subtle head look
    bob = Math.sin(t * 2.2 + u.ph) * 0.009;
    al = Math.sin(t * 1.5 + u.ph) * 0.04;
    ar = -al;
    elbL = -0.18 + Math.sin(t * 1.5 + u.ph) * 0.03;
    elbR = -0.18 + Math.cos(t * 1.5 + u.ph) * 0.03;
    headY = Math.sin(t * 0.7 + u.ph) * 0.08;
  }

  if (e === 'wave') {
    arz = -2.45 + Math.sin(t * 12) * 0.32;
    ar = -0.2;
    elbR = -0.45 + Math.cos(t * 12) * 0.25;
  } else if (e === 'cheer') {
    alz = 2.6;
    arz = -2.6;
    al = ar = -0.15;
    elbL = elbR = -0.35;
    bob += Math.abs(Math.sin(et * 9)) * 0.15;
  } else if (e === 'dance') {
    al = Math.sin(t * 9) * 0.85 - 0.4;
    ar = -Math.sin(t * 9) * 0.85 - 0.4;
    alz = 0.45;
    arz = -0.45;
    elbL = -0.6 + Math.sin(t * 9) * 0.35;
    elbR = -0.6 - Math.sin(t * 9) * 0.35;
    bob += Math.abs(Math.sin(t * 9)) * 0.065;
    torsoY = Math.sin(t * 4.5) * 0.42;
    ll = Math.sin(t * 9) * 0.28;
    lr = -ll;
    kneeL = Math.max(0, -ll * 1.4);
    kneeR = Math.max(0, -lr * 1.4);
  } else if (e === 'think') {
    ar = -1.25;
    elbR = -1.35;
    headX = 0.16;
    headY = -0.12;
  }

  const set = (o, rx, rz) => {
    o.rotation.x = lerp(o.rotation.x, rx, k);
    o.rotation.z = lerp(o.rotation.z, rz, k);
  };
  set(lL, ll, 0);
  set(lR, lr, 0);
  if (shinL) shinL.rotation.x = lerp(shinL.rotation.x, kneeL, k);
  if (shinR) shinR.rotation.x = lerp(shinR.rotation.x, kneeR, k);
  set(aL, al, alz);
  set(aR, ar, arz);
  if (foreL) foreL.rotation.x = lerp(foreL.rotation.x, elbL, k);
  if (foreR) foreR.rotation.x = lerp(foreR.rotation.x, elbR, k);

  u.hips.position.y = lerp(u.hips.position.y, 0.45 + hipY + bob, Math.min(1, dt * 18));
  u.head.rotation.x = lerp(u.head.rotation.x, headX, k);
  u.head.rotation.y = lerp(u.head.rotation.y || 0, headY, k);
  u.torso.rotation.y = lerp(u.torso.rotation.y, torsoY, k);
  u.torso.rotation.x = lerp(u.torso.rotation.x, torsoX, k);

  // Live Eye Blinking (every ~3.8s for 0.13s)
  if (u.eyelids) {
    const blinkCycle = (t + u.ph * 1.7) % 3.8;
    const isBlinking = blinkCycle < 0.13;
    const targetLidY = isBlinking ? 1.05 : 0.15;
    for (const lid of u.eyelids) {
      lid.scale.y = lerp(lid.scale.y, targetLidY, Math.min(1, dt * 28));
    }
  }

  // Live Talking / Cheering Mouth Animation
  const isTalking = !!(p.say && p.say.text) || e === 'cheer';
  if (u.smirk && u.mouthOpen && u.teeth) {
    u.smirk.visible = !isTalking;
    u.mouthOpen.visible = isTalking;
    u.teeth.visible = isTalking;
    if (isTalking) {
      const openAmt = 0.65 + Math.abs(Math.sin(t * 15 + u.ph)) * 0.65;
      u.mouthOpen.scale.y = openAmt;
    }
  }
}
