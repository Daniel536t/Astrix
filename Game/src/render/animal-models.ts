// Block models for every animal, from the owner's reference sheets
// (05_Noxel_Studio/Asset_Sheets/2026-11-24_animals). Plain colours only, three
// to five per species. Two construction styles, as the owner described:
//   domestic: chunky, big heads, large readable blocks (cattle, goat, pig, horse, chicken)
//             and one cube-cluster coat (sheep);
//   wildlife: more natural proportions from smaller blocks (deer, fox, wolf, hare, trout).
// Local space: +z forward, y up, ground at 0, metres.
import { ABox, AnimalModel, PART, bx } from './animal-kit';

const { body, legA, legB, head, tail, wing, wool, male } = PART;
/** Diagonal gait: front-left with back-right, front-right with back-left. */
const legSet = (x: number, z: number) => (x > 0) === (z > 0) ? legA : legB;

/** Four legs: a shaft, an optional foot block, hinged at the hip. */
function legs(spots: Array<[number, number]>, hip: number, w: number, shaft: number, shaftColour: string,
  foot?: { c: string; h: number; w?: number }): ABox[] {
  const out: ABox[] = [];
  for (const [x, z] of spots) {
    const part = legSet(x, z), pv: [number, number, number] = [x, hip, z];
    out.push(bx(w, shaft, w, x, hip - shaft / 2, z, shaftColour, part, pv));
    if (foot) out.push(bx(foot.w ?? w + 0.02, foot.h, (foot.w ?? w + 0.02) + 0.02, x, foot.h / 2, z + 0.01, foot.c, part, pv));
  }
  return out;
}

// ---------- domestic ----------

function cattle(): AnimalModel {
  const COAT = '#C58A47', DARK = '#8A5428', MUZZLE = '#E7AE93', HORN = '#EBD7B5', HOOF = '#4B2F1E';
  const P: [number, number, number] = [0, 1.3, 0.75];
  return {
    id: 'cattle', legLen: 0.66,
    boxes: [
      bx(0.92, 0.78, 1.5, 0, 1.0, -0.05, COAT),
      bx(0.94, 0.22, 0.8, 0, 1.32, 0.3, DARK),
      bx(0.7, 0.3, 0.4, 0, 0.78, -0.62, DARK),
      ...legs([[0.3, 0.5], [-0.3, 0.5], [0.3, -0.55], [-0.3, -0.55]], 0.66, 0.24, 0.5, COAT, { c: HOOF, h: 0.14, w: 0.26 }),
      bx(0.62, 0.58, 0.52, 0, 1.28, 1.1, COAT, head, P),
      bx(0.5, 0.3, 0.2, 0, 1.12, 1.42, MUZZLE, head, P),
      bx(0.5, 0.12, 0.34, 0, 1.6, 1.05, DARK, head, P),
      bx(0.12, 0.12, 0.03, 0.17, 1.34, 1.37, '#FFFFFF', head, P), bx(0.12, 0.12, 0.03, -0.17, 1.34, 1.37, '#FFFFFF', head, P),
      bx(0.06, 0.08, 0.035, 0.17, 1.33, 1.39, '#141414', head, P), bx(0.06, 0.08, 0.035, -0.17, 1.33, 1.39, '#141414', head, P),
      bx(0.08, 0.06, 0.03, 0.12, 1.16, 1.52, '#8A5A4A', head, P), bx(0.08, 0.06, 0.03, -0.12, 1.16, 1.52, '#8A5A4A', head, P),
      bx(0.22, 0.08, 0.14, 0.42, 1.42, 0.98, DARK, head, P), bx(0.22, 0.08, 0.14, -0.42, 1.42, 0.98, DARK, head, P),
      bx(0.1, 0.1, 0.14, 0.36, 1.52, 1.02, HORN, head, P), bx(0.1, 0.1, 0.14, -0.36, 1.52, 1.02, HORN, head, P),
      bx(0.1, 0.26, 0.1, 0.42, 1.7, 1.02, HORN, head + male, P), bx(0.1, 0.26, 0.1, -0.42, 1.7, 1.02, HORN, head + male, P),
      bx(0.1, 0.55, 0.1, 0, 1.05, -0.84, DARK, tail, [0, 1.3, -0.8]),
      bx(0.14, 0.16, 0.14, 0, 0.72, -0.84, DARK, tail, [0, 1.3, -0.8]),
    ],
  };
}

function sheep(): AnimalModel {
  const FACE = '#E9D9B8', LEG = '#CDAA7D', DARK = '#3A322C', WOOLS = ['#F6F5F0', '#ECE9E0', '#FBFAF7'];
  const P: [number, number, number] = [0, 0.95, 0.5];
  const C: [number, number, number] = [0, 0.83, -0.11];
  const boxes: ABox[] = [
    bx(0.5, 0.4, 0.9, 0, 0.83, -0.11, '#DDD8CB', wool, C),
    ...legs([[0.2, 0.32], [-0.2, 0.32], [0.2, -0.34], [-0.2, -0.34]], 0.58, 0.11, 0.58, LEG),
  ];
  // The coat is a loose cluster of cubes with gaps, like the cube-built reference.
  const s = 0.23, xs = [-0.34, -0.11, 0.12, 0.35], ys = [0.62, 0.85, 1.08], zs = [-0.56, -0.33, -0.1, 0.13, 0.36];
  let k = 0;
  xs.forEach((x, ix) => ys.forEach((y, iy) => zs.forEach((z, iz) => {
    const shell = ix === 0 || ix === xs.length - 1 || iy === 0 || iy === ys.length - 1 || iz === 0 || iz === zs.length - 1;
    if (!shell) return;
    k++;
    if (iy < ys.length - 1 && (k * 7919) % 11 === 0) return;      // gaps in the sides
    // Cubes sit a little in or out so the coat has a stepped, cube-built surface.
    const j = (n: number) => (((k * n) % 5) - 2) * 0.025;
    boxes.push(bx(s, s, s, x + (ix === 0 || ix === xs.length - 1 ? j(13) : 0), y + (iy === ys.length - 1 ? j(7) : 0), z + (iz === 0 || iz === zs.length - 1 ? j(11) : 0), WOOLS[(k * 31) % 3], wool, C));
  })));
  boxes.push(
    bx(0.3, 0.32, 0.34, 0, 0.9, 0.66, FACE, head, P),
    bx(0.34, 0.14, 0.32, 0, 1.1, 0.6, WOOLS[0], head, P),
    bx(0.14, 0.12, 0.06, 0, 0.85, 0.845, DARK, head, P),
    bx(0.07, 0.07, 0.03, 0.08, 0.96, 0.835, DARK, head, P), bx(0.07, 0.07, 0.03, -0.08, 0.96, 0.835, DARK, head, P),
    bx(0.16, 0.06, 0.1, 0.2, 0.98, 0.6, FACE, head, P, { rz: -0.4 }), bx(0.16, 0.06, 0.1, -0.2, 0.98, 0.6, FACE, head, P, { rz: 0.4 }),
    bx(0.09, 0.2, 0.09, 0.2, 1.1, 0.62, '#B9A07A', head + male, P), bx(0.09, 0.09, 0.2, 0.2, 1.2, 0.54, '#B9A07A', head + male, P),
    bx(0.09, 0.2, 0.09, -0.2, 1.1, 0.62, '#B9A07A', head + male, P), bx(0.09, 0.09, 0.2, -0.2, 1.2, 0.54, '#B9A07A', head + male, P),
    bx(0.13, 0.13, 0.13, 0, 0.85, -0.7, WOOLS[1], tail, [0, 0.85, -0.66]),
  );
  return { id: 'sheep', legLen: 0.58, boxes };
}

function goat(): AnimalModel {
  const COAT = '#B09B78', LIGHT = '#D7C9A5', PALE = '#E4E0C8', HORN = '#4A4A4C', WHITE = '#F2F0E6', PINK = '#E89AA0';
  const P: [number, number, number] = [0, 1.0, 0.5];
  return {
    id: 'goat', legLen: 0.55,
    boxes: [
      bx(0.42, 0.46, 1.0, 0, 0.78, -0.02, COAT),
      bx(0.2, 0.06, 0.95, 0, 1.04, -0.02, LIGHT),
      bx(0.36, 0.06, 0.8, 0, 0.53, 0, PALE),
      ...legs([[0.15, 0.34], [-0.15, 0.34], [0.15, -0.38], [-0.15, -0.38]], 0.55, 0.1, 0.46, COAT, { c: WHITE, h: 0.1 }),
      bx(0.24, 0.4, 0.24, 0, 1.1, 0.5, COAT, head, P),
      bx(0.3, 0.32, 0.34, 0, 1.28, 0.7, COAT, head, P),
      bx(0.18, 0.18, 0.2, 0, 1.18, 0.95, LIGHT, head, P),
      bx(0.16, 0.05, 0.06, 0, 1.08, 1.02, PINK, head, P),
      bx(0.1, 0.06, 0.04, 0, 1.24, 1.06, '#1A1A1A', head, P),
      bx(0.07, 0.14, 0.07, 0, 0.99, 0.97, WHITE, head, P),
      bx(0.07, 0.12, 0.07, 0, 0.88, 0.97, WHITE, head + male, P),
      bx(0.05, 0.1, 0.02, 0.1, 1.31, 0.875, '#FFFFFF', head, P), bx(0.05, 0.1, 0.02, -0.1, 1.31, 0.875, '#FFFFFF', head, P),
      bx(0.03, 0.1, 0.03, 0.1, 1.31, 0.885, '#141414', head, P), bx(0.03, 0.1, 0.03, -0.1, 1.31, 0.885, '#141414', head, P),
      bx(0.07, 0.2, 0.07, 0.09, 1.55, 0.64, HORN, head, P), bx(0.07, 0.2, 0.07, -0.09, 1.55, 0.64, HORN, head, P),
      bx(0.07, 0.07, 0.17, 0.09, 1.67, 0.58, HORN, head, P), bx(0.07, 0.07, 0.17, -0.09, 1.67, 0.58, HORN, head, P),
      bx(0.1, 0.06, 0.16, 0.2, 1.3, 0.66, COAT, head, P, { rz: -0.35 }), bx(0.1, 0.06, 0.16, -0.2, 1.3, 0.66, COAT, head, P, { rz: 0.35 }),
      bx(0.08, 0.2, 0.08, 0, 0.98, -0.55, COAT, tail, [0, 0.95, -0.52]),
    ],
  };
}

function pig(): AnimalModel {
  const PINK = '#F2A9A3', SNOUT = '#E8827D', EAR = '#E58B86', INNER = '#F06B66', HOOF = '#E0706A';
  const P: [number, number, number] = [0, 0.7, 0.5];
  return {
    id: 'pig', legLen: 0.34,
    boxes: [
      bx(0.7, 0.55, 1.0, 0, 0.62, -0.05, PINK),
      ...legs([[0.2, 0.3], [-0.2, 0.3], [-0.2, -0.32], [0.2, -0.32]], 0.34, 0.17, 0.26, PINK, { c: HOOF, h: 0.1 }),
      bx(0.52, 0.46, 0.44, 0, 0.66, 0.7, PINK, head, P),
      bx(0.34, 0.24, 0.16, 0, 0.58, 0.98, SNOUT, head, P),
      bx(0.05, 0.08, 0.03, 0.07, 0.58, 1.075, '#B8504C', head, P), bx(0.05, 0.08, 0.03, -0.07, 0.58, 1.075, '#B8504C', head, P),
      bx(0.1, 0.12, 0.03, 0.17, 0.76, 0.925, '#141414', head, P), bx(0.1, 0.12, 0.03, -0.17, 0.76, 0.925, '#141414', head, P),
      bx(0.2, 0.06, 0.2, 0.2, 0.94, 0.64, EAR, head, P), bx(0.2, 0.06, 0.2, -0.2, 0.94, 0.64, EAR, head, P),
      bx(0.12, 0.03, 0.12, 0.2, 0.975, 0.64, INNER, head, P), bx(0.12, 0.03, 0.12, -0.2, 0.975, 0.64, INNER, head, P),
      bx(0.08, 0.14, 0.08, 0, 0.78, -0.58, PINK, tail, [0, 0.7, -0.55]),
      bx(0.12, 0.07, 0.08, 0.04, 0.88, -0.6, PINK, tail, [0, 0.7, -0.55]),
    ],
  };
}

function chicken(): AnimalModel {
  const WHITE = '#F3F1EA', SHADE = '#E3E0D6', RED = '#B8242B', ORANGE = '#F29A2E', LEG = '#C98C5A', FEATHER = '#3E4B52';
  const P: [number, number, number] = [0, 0.5, 0.2];
  const wingPivot = (x: number): [number, number, number] => [x, 0.46, -0.02];
  return {
    id: 'chicken', legLen: 0.18, youngTint: '#F3D94A',
    boxes: [
      bx(0.34, 0.32, 0.42, 0, 0.34, -0.02, WHITE),
      bx(0.3, 0.14, 0.1, 0, 0.26, 0.2, SHADE),
      bx(0.04, 0.18, 0.04, 0.07, 0.09, 0, LEG, legA, [0.07, 0.18, 0]), bx(0.04, 0.18, 0.04, -0.07, 0.09, 0, LEG, legB, [-0.07, 0.18, 0]),
      bx(0.1, 0.03, 0.12, 0.07, 0.015, 0.03, LEG, legA, [0.07, 0.18, 0]), bx(0.1, 0.03, 0.12, -0.07, 0.015, 0.03, LEG, legB, [-0.07, 0.18, 0]),
      bx(0.05, 0.2, 0.28, 0.2, 0.38, -0.02, SHADE, wing, wingPivot(0.18)), bx(0.05, 0.2, 0.28, -0.2, 0.38, -0.02, SHADE, wing, wingPivot(-0.18)),
      bx(0.22, 0.24, 0.22, 0, 0.6, 0.2, WHITE, head, P),
      bx(0.06, 0.08, 0.18, 0, 0.76, 0.2, RED, head, P),
      bx(0.07, 0.14, 0.22, 0, 0.82, 0.2, RED, head + male, P),
      bx(0.1, 0.06, 0.1, 0, 0.58, 0.34, ORANGE, head, P),
      bx(0.05, 0.07, 0.05, 0, 0.5, 0.32, RED, head, P),
      bx(0.03, 0.07, 0.02, 0.08, 0.64, 0.31, '#141414', head, P), bx(0.03, 0.07, 0.02, -0.08, 0.64, 0.31, '#141414', head, P),
      bx(0.2, 0.16, 0.07, 0, 0.46, -0.25, WHITE, tail, [0, 0.4, -0.22]),
      ...[-0.09, -0.03, 0.03, 0.09].map((x, i) => bx(0.04, 0.32, 0.04, x, 0.66, -0.3 - (i % 2) * 0.03, FEATHER, tail + male, [0, 0.4, -0.22])),
    ],
  };
}

function horse(): AnimalModel {
  const COAT = '#8E4F27', MANE = '#3B2218', MUZZLE = '#5A3320', HOOF = '#33201A', PINK = '#E9A3A0';
  const P: [number, number, number] = [0, 1.45, 0.8];
  return {
    id: 'horse', legLen: 0.95,
    boxes: [
      bx(0.62, 0.66, 1.5, 0, 1.22, -0.05, COAT),
      bx(0.5, 0.1, 1.2, 0, 0.9, -0.05, '#A06235'),
      ...legs([[0.2, 0.55], [-0.2, 0.55], [0.2, -0.6], [-0.2, -0.6]], 0.95, 0.17, 0.82, COAT, { c: HOOF, h: 0.13, w: 0.19 }),
      bx(0.3, 0.7, 0.34, 0, 1.7, 0.9, COAT, head, P),
      bx(0.32, 0.36, 0.62, 0, 2.0, 1.15, COAT, head, P),
      bx(0.3, 0.26, 0.2, 0, 1.88, 1.5, MUZZLE, head, P),
      bx(0.06, 0.05, 0.03, 0.08, 1.92, 1.605, '#141414', head, P), bx(0.06, 0.05, 0.03, -0.08, 1.92, 1.605, '#141414', head, P),
      bx(0.1, 0.1, 0.03, 0.09, 2.08, 1.465, '#FFFFFF', head, P), bx(0.1, 0.1, 0.03, -0.09, 2.08, 1.465, '#FFFFFF', head, P),
      bx(0.05, 0.06, 0.035, 0.09, 2.07, 1.48, '#141414', head, P), bx(0.05, 0.06, 0.035, -0.09, 2.07, 1.48, '#141414', head, P),
      bx(0.1, 0.2, 0.08, 0.1, 2.27, 1.0, COAT, head, P), bx(0.1, 0.2, 0.08, -0.1, 2.27, 1.0, COAT, head, P),
      bx(0.05, 0.12, 0.02, 0.1, 2.26, 1.045, PINK, head, P), bx(0.05, 0.12, 0.02, -0.1, 2.26, 1.045, PINK, head, P),
      bx(0.1, 0.7, 0.12, 0, 1.92, 0.7, MANE, head, P),
      bx(0.14, 0.14, 0.14, 0, 2.22, 1.12, MANE, head, P),
      bx(0.12, 0.75, 0.12, 0, 1.0, -0.85, MANE, tail, [0, 1.5, -0.8]),
    ],
  };
}

// ---------- wildlife ----------

function deer(): AnimalModel {
  const COAT = '#A5622E', DARK = '#7C4521', BELLY = '#D8B98A', CREAM = '#EBD9B4', ANTLER = '#D9CBA8', HOOF = '#2A1A12';
  const P: [number, number, number] = [0, 1.1, 0.42];
  return {
    id: 'deer', legLen: 0.85,
    boxes: [
      bx(0.34, 0.38, 0.62, 0, 1.0, 0.18, COAT),
      bx(0.32, 0.36, 0.5, 0, 1.02, -0.34, COAT),
      bx(0.2, 0.06, 0.9, 0, 1.22, -0.1, DARK),
      bx(0.26, 0.08, 0.85, 0, 0.82, -0.03, BELLY),
      bx(0.2, 0.14, 0.04, 0, 1.02, -0.6, CREAM),
      ...[[0.1, 0.3], [-0.1, 0.3], [0.1, -0.5], [-0.1, -0.5]].flatMap(([x, z]) => {
        const part = legSet(x, z), pv: [number, number, number] = [x, 0.85, z];
        return [bx(0.1, 0.42, 0.1, x, 0.64, z, COAT, part, pv), bx(0.07, 0.38, 0.07, x, 0.26, z, DARK, part, pv), bx(0.08, 0.07, 0.1, x, 0.035, z + 0.01, HOOF, part, pv)];
      }),
      bx(0.16, 0.42, 0.18, 0, 1.36, 0.5, COAT, head, P, { rx: -0.3 }),
      bx(0.18, 0.2, 0.3, 0, 1.62, 0.64, COAT, head, P),
      bx(0.12, 0.12, 0.14, 0, 1.56, 0.84, CREAM, head, P),
      bx(0.08, 0.06, 0.04, 0, 1.59, 0.92, '#141414', head, P),
      bx(0.03, 0.05, 0.03, 0.085, 1.67, 0.72, '#141414', head, P), bx(0.03, 0.05, 0.03, -0.085, 1.67, 0.72, '#141414', head, P),
      bx(0.06, 0.14, 0.04, 0.12, 1.75, 0.56, COAT, head, P, { rz: -0.3 }), bx(0.06, 0.14, 0.04, -0.12, 1.75, 0.56, COAT, head, P, { rz: 0.3 }),
      bx(0.04, 0.3, 0.04, 0.07, 1.88, 0.58, ANTLER, head + male, P), bx(0.04, 0.3, 0.04, -0.07, 1.88, 0.58, ANTLER, head + male, P),
      bx(0.14, 0.04, 0.04, 0.13, 1.95, 0.58, ANTLER, head + male, P), bx(0.14, 0.04, 0.04, -0.13, 1.95, 0.58, ANTLER, head + male, P),
      bx(0.04, 0.16, 0.04, 0.2, 2.03, 0.58, ANTLER, head + male, P), bx(0.04, 0.16, 0.04, -0.2, 2.03, 0.58, ANTLER, head + male, P),
      bx(0.04, 0.14, 0.04, 0.07, 2.12, 0.58, ANTLER, head + male, P), bx(0.04, 0.14, 0.04, -0.07, 2.12, 0.58, ANTLER, head + male, P),
      bx(0.08, 0.12, 0.08, 0, 1.08, -0.62, CREAM, tail, [0, 1.0, -0.6]),
    ],
  };
}

function fox(): AnimalModel {
  const COAT = '#D96A1E', CREAM = '#F1E2C4', DARK = '#3A2218';
  const P: [number, number, number] = [0, 0.5, 0.32];
  const T: [number, number, number] = [0, 0.42, -0.3];
  return {
    id: 'fox', legLen: 0.3,
    boxes: [
      bx(0.22, 0.2, 0.62, 0, 0.4, 0, COAT),
      bx(0.2, 0.14, 0.14, 0, 0.34, 0.3, CREAM),
      ...[[0.08, 0.22], [-0.08, 0.22], [0.08, -0.2], [-0.08, -0.2]].flatMap(([x, z]) => {
        const part = legSet(x, z), pv: [number, number, number] = [x, 0.3, z];
        return [bx(0.07, 0.17, 0.07, x, 0.215, z, COAT, part, pv), bx(0.08, 0.13, 0.09, x, 0.065, z + 0.01, DARK, part, pv)];
      }),
      bx(0.2, 0.18, 0.22, 0, 0.5, 0.45, COAT, head, P),
      bx(0.12, 0.1, 0.14, 0, 0.45, 0.62, CREAM, head, P),
      bx(0.06, 0.05, 0.04, 0, 0.47, 0.7, '#111111', head, P),
      bx(0.03, 0.04, 0.02, 0.07, 0.54, 0.565, '#111111', head, P), bx(0.03, 0.04, 0.02, -0.07, 0.54, 0.565, '#111111', head, P),
      bx(0.06, 0.12, 0.04, 0.08, 0.66, 0.4, COAT, head, P), bx(0.06, 0.12, 0.04, -0.08, 0.66, 0.4, COAT, head, P),
      bx(0.06, 0.04, 0.04, 0.08, 0.74, 0.4, DARK, head, P), bx(0.06, 0.04, 0.04, -0.08, 0.74, 0.4, DARK, head, P),
      bx(0.12, 0.12, 0.2, 0, 0.42, -0.4, COAT, tail, T), bx(0.15, 0.15, 0.2, 0, 0.4, -0.58, COAT, tail, T), bx(0.12, 0.12, 0.12, 0, 0.38, -0.72, CREAM, tail, T),
    ],
  };
}

function wolf(): AnimalModel {
  const COAT = '#7B7F86', DARK = '#4E5258', LIGHT = '#B8BCC2', NOSE = '#15171A';
  const P: [number, number, number] = [0, 0.85, 0.5];
  const T: [number, number, number] = [0, 0.75, -0.42];
  return {
    id: 'wolf', legLen: 0.58,
    boxes: [
      bx(0.3, 0.36, 0.85, 0, 0.76, 0, COAT),
      bx(0.26, 0.08, 0.8, 0, 0.98, -0.02, DARK),
      bx(0.24, 0.1, 0.7, 0, 0.57, 0, LIGHT),
      ...[[0.11, 0.32], [-0.11, 0.32], [0.11, -0.3], [-0.11, -0.3]].flatMap(([x, z]) => {
        const part = legSet(x, z), pv: [number, number, number] = [x, 0.58, z];
        return [bx(0.11, 0.46, 0.11, x, 0.35, z, COAT, part, pv), bx(0.12, 0.08, 0.16, x, 0.04, z + 0.02, LIGHT, part, pv)];
      }),
      bx(0.22, 0.28, 0.2, 0, 0.92, 0.5, COAT, head, P),
      bx(0.28, 0.28, 0.3, 0, 0.98, 0.68, COAT, head, P),
      bx(0.16, 0.14, 0.2, 0, 0.92, 0.9, LIGHT, head, P),
      bx(0.08, 0.06, 0.04, 0, 0.95, 1.01, NOSE, head, P),
      bx(0.05, 0.05, 0.02, 0.08, 1.03, 0.83, '#E0B040', head, P), bx(0.05, 0.05, 0.02, -0.08, 1.03, 0.83, '#E0B040', head, P),
      bx(0.04, 0.05, 0.025, 0.08, 1.03, 0.84, NOSE, head, P), bx(0.04, 0.05, 0.025, -0.08, 1.03, 0.84, NOSE, head, P),
      bx(0.09, 0.12, 0.06, 0.1, 1.17, 0.6, COAT, head, P), bx(0.09, 0.12, 0.06, -0.1, 1.17, 0.6, COAT, head, P),
      bx(0.05, 0.08, 0.04, 0.1, 1.27, 0.6, DARK, head, P), bx(0.05, 0.08, 0.04, -0.1, 1.27, 0.6, DARK, head, P),
      bx(0.11, 0.11, 0.36, 0, 0.7, -0.6, COAT, tail, T), bx(0.11, 0.11, 0.14, 0, 0.6, -0.84, DARK, tail, T),
    ],
  };
}

function hare(): AnimalModel {
  const COAT = '#A88A62', LIGHT = '#E8DCC4', PINK = '#E9A3A0';
  const P: [number, number, number] = [0, 0.25, 0.15];
  return {
    id: 'hare', legLen: 0.12,
    boxes: [
      bx(0.2, 0.18, 0.34, 0, 0.2, -0.02, COAT),
      bx(0.22, 0.2, 0.2, 0, 0.24, -0.12, COAT),
      bx(0.16, 0.05, 0.3, 0, 0.12, 0, LIGHT),
      bx(0.05, 0.12, 0.05, 0.06, 0.07, 0.1, COAT, legA, [0.06, 0.14, 0.1]), bx(0.05, 0.12, 0.05, -0.06, 0.07, 0.1, COAT, legB, [-0.06, 0.14, 0.1]),
      bx(0.07, 0.12, 0.16, 0.07, 0.07, -0.14, COAT, legB, [0.07, 0.14, -0.14]), bx(0.07, 0.12, 0.16, -0.07, 0.07, -0.14, COAT, legA, [-0.07, 0.14, -0.14]),
      bx(0.14, 0.14, 0.16, 0, 0.3, 0.24, COAT, head, P),
      bx(0.1, 0.08, 0.06, 0, 0.26, 0.33, LIGHT, head, P),
      bx(0.04, 0.03, 0.02, 0, 0.28, 0.365, PINK, head, P),
      bx(0.025, 0.04, 0.02, 0.055, 0.34, 0.31, '#141414', head, P), bx(0.025, 0.04, 0.02, -0.055, 0.34, 0.31, '#141414', head, P),
      bx(0.04, 0.2, 0.05, 0.04, 0.48, 0.2, COAT, head, P), bx(0.04, 0.2, 0.05, -0.04, 0.48, 0.2, COAT, head, P),
      bx(0.02, 0.14, 0.02, 0.04, 0.48, 0.225, PINK, head, P), bx(0.02, 0.14, 0.02, -0.04, 0.48, 0.225, PINK, head, P),
      bx(0.09, 0.09, 0.09, 0, 0.27, -0.27, '#FFFFFF', tail, [0, 0.27, -0.24]),
    ],
  };
}

function trout(): AnimalModel {
  const T: [number, number, number] = [0, 0, -0.1];
  return {
    id: 'trout', legLen: 0,
    boxes: [
      bx(0.08, 0.09, 0.26, 0, 0, 0.04, 'fauna_trout'),
      bx(0.07, 0.04, 0.24, 0, -0.035, 0.04, 'fauna_trout_belly'),
      bx(0.02, 0.05, 0.08, 0, 0.065, 0.02, 'fauna_trout'),
      bx(0.05, 0.06, 0.1, 0, 0, -0.14, 'fauna_trout', tail, T),
      bx(0.02, 0.11, 0.06, 0, 0, -0.2, 'fauna_trout', tail, T),
    ],
  };
}

export const ANIMAL_MODELS = {
  cattle: cattle(), sheep: sheep(), goat: goat(), pig: pig(), chicken: chicken(), horse: horse(),
  deer: deer(), fox: fox(), wolf: wolf(), rabbit: hare(), trout: trout(),
} as const;
export type AnimalModelId = keyof typeof ANIMAL_MODELS;
