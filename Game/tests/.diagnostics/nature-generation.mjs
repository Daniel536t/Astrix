// Diagnostic-only shim for terrain-view generation counters.
function ensureChunk(world, cx, cz, neighbours) { return null; }
function generateChunk(world, cx, cz) { return null; }
function evictChunk(world, key) { return false; }
function generateEntityChunk(world, cx, cz) {}

// Game/src/render/nature.ts
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Game/src/data/palette.json
var palette_default = {
  schema: "palette_v2",
  date: "2026-10-22",
  status: "proposed",
  source: "REF-002 (hybrid world reference), values sampled by eye; numeric verification pending",
  note: "One material palette. Time of day is expressed by the lighting presets below, not by repainting materials.",
  materials: {
    grass_top: {
      hex: "#79B94C",
      role: "terrain top, low elevation"
    },
    grass_high: {
      hex: "#8FC95E",
      role: "terrain top, mid elevation"
    },
    grass_peak: {
      hex: "#9AD06A",
      role: "terrain top, high elevation"
    },
    grass_cap: {
      hex: "#5E9440",
      role: "side band 0.0-0.4 m below top"
    },
    strata_ochre: {
      hex: "#C99A5F",
      role: "side band 0.4-0.62 m below top"
    },
    strata_rust: {
      hex: "#B4633C",
      role: "side band 0.62-0.80 m below top"
    },
    stone_top: {
      hex: "#E6DFCC",
      role: "bare stone top surface"
    },
    stone_body_a: {
      hex: "#DCD3BE",
      role: "side body, even 4.5 m band"
    },
    stone_body_b: {
      hex: "#D1C7AF",
      role: "side body, odd 4.5 m band"
    },
    stone_shade: {
      hex: "#B9AE96",
      role: "crevice / recessed stone accent"
    },
    sand: {
      hex: "#E3D3A6",
      role: "shore cells"
    },
    water_shallow: {
      hex: "#67CFD8",
      role: "water depth <= 0.5 m"
    },
    water_mid: {
      hex: "#3AAFC4",
      role: "water depth ~1.5 m"
    },
    water_deep: {
      hex: "#2A8FA8",
      role: "water depth >= 4.0 m"
    },
    water_rim: {
      hex: "#BFEAF0",
      role: "shoreline rim / foam tint"
    },
    canopy_green_a: {
      hex: "#5FA83F",
      role: "green canopy, shade mass"
    },
    canopy_green_b: {
      hex: "#6FB84A",
      role: "green canopy, main mass"
    },
    canopy_green_c: {
      hex: "#7FC356",
      role: "green canopy, highlight mass"
    },
    canopy_pink: {
      hex: "#F2A6C4",
      role: "blossom accent species only"
    },
    canopy_pink_b: {
      hex: "#E88FB2",
      role: "blossom shade mass"
    },
    trunk: {
      hex: "#6B4A33",
      role: "tree trunks"
    },
    bark_dark: {
      hex: "#4E3626",
      role: "trunk shade, stumps"
    },
    ore_crystal: {
      hex: "#7B5AD6",
      role: "ore deposit accent (proposed, replaces teal)"
    },
    ore_crystal_b: {
      hex: "#9B7BE8",
      role: "ore highlight facet"
    },
    noxel_stone: {
      hex: "#E6DFCC",
      role: "Noxel architecture main stone"
    },
    noxel_stone_b: {
      hex: "#D3C9B4",
      role: "Noxel secondary stone / recess"
    },
    accent_blue: {
      hex: "#3E7FB8",
      role: "banner / cloth accent"
    },
    accent_teal: {
      hex: "#2FA6A0",
      role: "secondary accent"
    },
    emissive_fire: {
      hex: "#FF9E4A",
      role: "campfire / warm emissive (effects only)"
    },
    emissive_magic: {
      hex: "#D24BFF",
      role: "reserved: magic effects only, never materials"
    }
  },
  lighting: {
    dawn: {
      sunElevationDeg: 12,
      sunAzimuthDeg: 105,
      sunColor: "#FFC79A",
      sunIntensity: 2.2,
      hemiSky: "#8FA6C8",
      hemiGround: "#4E5F6E",
      hemiIntensity: 0.6,
      sky: "#A8BED6",
      fog: "#A8BED6",
      fogDensity: 5e-3,
      exposure: 1.1
    },
    noon: {
      sunElevationDeg: 38,
      sunAzimuthDeg: 50,
      sunColor: "#FFF4DC",
      sunIntensity: 2.75,
      hemiSky: "#BFD9F2",
      hemiGround: "#7A8F55",
      hemiIntensity: 0.55,
      sky: "#9ED2EE",
      fog: "#DCEFF8",
      fogDensity: 28e-4,
      exposure: 1.05
    },
    dusk: {
      sunElevationDeg: 9,
      sunAzimuthDeg: 250,
      sunColor: "#FFB27A",
      sunIntensity: 3.2,
      hemiSky: "#8E7C9E",
      hemiGround: "#5A4A50",
      hemiIntensity: 1.1,
      sky: "#C98E86",
      fog: "#C0908A",
      fogDensity: 36e-4,
      exposure: 1.32
    },
    night: {
      sunElevationDeg: 40,
      sunAzimuthDeg: 220,
      sunColor: "#AFC8FF",
      sunIntensity: 1,
      hemiSky: "#3A4C7A",
      hemiGround: "#1C2540",
      hemiIntensity: 1.05,
      sky: "#101736",
      fog: "#151C3C",
      fogDensity: 45e-4,
      exposure: 1.5
    }
  }
};

// Game/src/sim/world.ts
var WORLD_SIZE = 2048;
var HALF = WORLD_SIZE / 2;
var CHUNK_SIZE = 32;
var CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
var Y_MIN = -16;
var Y_MAX = 112;
var WORLD_HEIGHT = Y_MAX - Y_MIN;
var CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;
var CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Game/src/render/nature.ts
var M = palette_default.materials;
var H = (k) => M[k].hex;
var GREEN = [H("canopy_green_a"), H("canopy_green_b"), H("canopy_green_c")];
var PINK = [H("canopy_pink_b"), H("canopy_pink")];
var TRUNK = H("trunk");
var BARK = H("bark_dark");
var STONE = H("stone_top");
var STONE_B = H("stone_body_b");
var STONE_SHADE = H("stone_shade");
var ORE = H("ore_crystal");
var ORE_B = H("ore_crystal_b");
var OCHRE = H("strata_ochre");
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const color = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
function box(cx, cy, cz, sx, sy, sz, hex) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}
function column(cx, cz, y0, h, r, sides, yawDeg, hex) {
  const g = new THREE.CylinderGeometry(r, r, h, sides, 1, false);
  g.translate(cx, y0 + h / 2, cz);
  g.rotateY(yawDeg * Math.PI / 180);
  const out = paint(g, hex);
  out.computeVertexNormals();
  return out;
}
function massGeometry(m) {
  const pos = [];
  const nrm = [];
  const D = Math.PI / 180;
  const lon = (k) => m.yawDeg * D + k * 2 * Math.PI / m.sides;
  const row = (phiDeg) => {
    const phi = phiDeg * D, c = Math.cos(phi), s = Math.sin(phi);
    const out = [];
    for (let k = 0; k < m.sides; k++) {
      const t = lon(k);
      out.push([
        m.cx + m.rx * c * Math.cos(t),
        m.cy + m.ry * s,
        m.cz + m.rz * c * Math.sin(t)
      ]);
    }
    return out;
  };
  const pole = (sign) => [m.cx, m.cy + sign * m.ry, m.cz];
  const capCentre = (phiDeg) => [m.cx, m.cy + m.ry * Math.sin(phiDeg * D), m.cz];
  const tri = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L;
    ny /= L;
    nz /= L;
    const fx = (a[0] + b[0] + c[0]) / 3 - m.cx;
    const fy = (a[1] + b[1] + c[1]) / 3 - m.cy;
    const fz = (a[2] + b[2] + c[2]) / 3 - m.cz;
    if (nx * fx + ny * fy + nz * fz < 0) {
      const t = b;
      b = c;
      c = t;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(nx, ny, nz);
    }
  };
  const band = (r0, r1) => {
    for (let k = 0; k < m.sides; k++) {
      const j = (k + 1) % m.sides;
      tri(r0[k], r0[j], r1[k]);
      tri(r0[j], r1[j], r1[k]);
    }
  };
  const fan = (ring, apex) => {
    for (let k = 0; k < m.sides; k++) tri(ring[k], ring[(k + 1) % m.sides], apex);
  };
  const cap = (ring, centre) => {
    for (let k = 0; k < m.sides; k++) tri(ring[(k + 1) % m.sides], ring[k], centre);
  };
  if (m.shape === "orb") {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]);
    band(r[1], r[2]);
    fan(r[0], pole(-1));
    fan(r[2], pole(1));
  } else if (m.shape === "dome") {
    const r = [row(0), row(45)];
    band(r[0], r[1]);
    fan(r[1], pole(1));
    cap(r[0], capCentre(0));
  } else {
    const r = [row(-45), row(0), row(45)];
    band(r[0], r[1]);
    band(r[1], r[2]);
    cap(r[0], capCentre(-45));
    cap(r[2], capCentre(45));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return paint(geo, m.hex);
}
function assembly(parts) {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("Styl geometry merge failed");
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
var T1 = {
  trunkR: 0.28,
  trunkH: 4.9,
  flareR: 0.38,
  flareH: 0.3,
  masses: [
    { cx: 0, cy: 5.45, cz: 0, rx: 2.1, ry: 1, rz: 2.05, sides: 9, shape: "orb", yawDeg: 0, hex: GREEN[0] },
    { cx: 0.2, cy: 6.85, cz: -0.2, rx: 1.45, ry: 0.95, rz: 1.35, sides: 7, shape: "orb", yawDeg: 15, hex: GREEN[1] },
    { cx: -0.15, cy: 7.85, cz: 0.15, rx: 0.95, ry: 0.65, rz: 0.9, sides: 7, shape: "orb", yawDeg: 30, hex: GREEN[2] }
  ],
  satellite: { cx: 2.4, cy: 5.55, cz: 0.75, sx: 0.8, sy: 0.5, sz: 0.8, hex: GREEN[2] }
};
var T2 = {
  trunkR: 0.34,
  trunkH: 3.85,
  flareR: 0.46,
  flareH: 0.28,
  masses: [
    { cx: 0, cy: 3.5, cz: 0, rx: 2.95, ry: 1.3, rz: 2.3, sides: 11, shape: "dome", yawDeg: 0, hex: GREEN[0] },
    { cx: 1.35, cy: 4, cz: -0.6, rx: 1.45, ry: 0.95, rz: 1.25, sides: 9, shape: "dome", yawDeg: 15, hex: GREEN[1] },
    { cx: -0.35, cy: 5.2, cz: 0.25, rx: 1.35, ry: 0.95, rz: 1.25, sides: 9, shape: "orb", yawDeg: 30, hex: GREEN[2] },
    { cx: -1.45, cy: 4.05, cz: 0.95, rx: 1.1, ry: 0.75, rz: 1, sides: 7, shape: "dome", yawDeg: 45, hex: GREEN[1] }
  ]
};
var T3 = {
  trunkR: 0.26,
  trunkH: 3.6,
  flareR: 0.36,
  flareH: 0.26,
  masses: [
    { cx: 0, cy: 4.55, cz: 0, rx: 1.45, ry: 1.3, rz: 1.4, sides: 9, shape: "orb", yawDeg: 0, hex: GREEN[0] },
    { cx: 1.25, cy: 4.05, cz: 0.3, rx: 0.95, ry: 0.8, rz: 0.9, sides: 7, shape: "orb", yawDeg: 15, hex: GREEN[1] },
    { cx: -1.3, cy: 4.45, cz: -0.45, rx: 0.85, ry: 0.75, rz: 0.85, sides: 7, shape: "orb", yawDeg: 30, hex: GREEN[1] },
    { cx: 0.1, cy: 5.7, cz: -0.1, rx: 1, ry: 0.9, rz: 0.95, sides: 7, shape: "orb", yawDeg: 45, hex: GREEN[2] }
  ],
  satellite: { cx: 2.35, cy: 3.9, cz: -0.25, sx: 0.7, sy: 0.45, sz: 0.7, hex: GREEN[2] }
};
var T4 = {
  trunkR: 0.3,
  trunkH: 4.45,
  flareR: 0.42,
  flareH: 0.28,
  masses: [
    { cx: 0, cy: 5, cz: 0, rx: 2.35, ry: 1.15, rz: 2.2, sides: 9, shape: "drum", yawDeg: 0, hex: PINK[0] },
    { cx: 0.3, cy: 5.9, cz: -0.25, rx: 1.55, ry: 1, rz: 1.45, sides: 9, shape: "drum", yawDeg: 15, hex: PINK[1] },
    { cx: -1.4, cy: 4.95, cz: 0.75, rx: 1.05, ry: 0.8, rz: 1, sides: 7, shape: "drum", yawDeg: 30, hex: PINK[0] },
    { cx: 0.15, cy: 6.45, cz: 0.1, rx: 0.95, ry: 0.65, rz: 0.9, sides: 7, shape: "orb", yawDeg: 45, hex: PINK[1] }
  ],
  satellite: { cx: 2.55, cy: 5.35, cz: 0.85, sx: 0.85, sy: 0.55, sz: 0.85, hex: PINK[1] }
};
var SHRUB = [
  { cx: 0, cy: 0.55, cz: 0, rx: 0.7, ry: 0.55, rz: 0.65, sides: 9, shape: "orb", yawDeg: 0, hex: GREEN[0] },
  { cx: 0.25, cy: 0.95, cz: -0.15, rx: 0.45, ry: 0.42, rz: 0.42, sides: 7, shape: "orb", yawDeg: 15, hex: GREEN[1] },
  { cx: -0.2, cy: 1.05, cz: 0.2, rx: 0.34, ry: 0.45, rz: 0.32, sides: 7, shape: "orb", yawDeg: 30, hex: GREEN[2] }
];
var quant = (v) => Math.round(v / 0.05) * 0.05;
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function jitterMass(m, rnd, groupX, groupZ) {
  const rjit = (v) => quant(clamp(v * (1 + (rnd() * 0.16 - 0.08)), 0.25, 4));
  return {
    ...m,
    cx: quant(m.cx + groupX + (rnd() * 0.6 - 0.3)),
    cy: quant(m.cy + (rnd() * 0.4 - 0.2)),
    cz: quant(m.cz + groupZ + (rnd() * 0.6 - 0.3)),
    rx: rjit(m.rx),
    ry: rjit(m.ry),
    rz: rjit(m.rz),
    yawDeg: m.yawDeg + (Math.floor(rnd() * 3) - 1) * 15
  };
}
function treeGeometry(species, variant) {
  const rnd = mulberry32((species === T1 ? 11 : species === T2 ? 23 : species === T3 ? 37 : 53) * 7919 + variant * 104729);
  const jittered = variant > 0;
  const groupX = jittered ? rnd() * 0.7 - 0.35 : 0;
  const groupZ = jittered ? rnd() * 0.7 - 0.35 : 0;
  const trunkR = jittered ? quant(clamp(species.trunkR + (rnd() * 0.1 - 0.05), 0.2, 0.4)) : species.trunkR;
  const trunkH = jittered ? quant(clamp(species.trunkH + (rnd() * 0.6 - 0.3), 3, 5.4)) : species.trunkH;
  const flareR = trunkR + 0.1;
  const parts = [
    column(0, 0, 0, trunkH, trunkR, 6, 0, TRUNK),
    column(0, 0, 0, species.flareH, flareR, 6, 0, BARK)
  ];
  for (const m of species.masses) {
    parts.push(massGeometry(jittered ? jitterMass(m, rnd, groupX, groupZ) : m));
  }
  if (species.satellite && variant % 3 === 0) {
    const s = species.satellite;
    parts.push(box(s.cx + groupX, s.cy, s.cz + groupZ, s.sx, s.sy, s.sz, s.hex));
  }
  return assembly(parts);
}
function shrubGeometry(variant) {
  const rnd = mulberry32(97 * 7919 + variant * 104729);
  const parts = SHRUB.map((m, i) => {
    if (variant === 0 && i === 0) return massGeometry(m);
    return massGeometry(jitterMass(m, rnd, 0, 0));
  });
  return assembly(parts);
}
function oreGeometry(variant) {
  const flip = variant === 1 ? -1 : 1;
  const parts = [
    box(0, 0.45, 0, 1.8, 0.9, 1.5, STONE),
    box(0.15, 1.1, -0.1, 1.2, 0.7, 1, STONE),
    box(-0.4, 1.4, 0.25, 0.7, 0.5, 0.6, STONE_B),
    box(0.1, 0.45, 0.75 * flip, 0.9, 0.35, 0.2, ORE),
    box(0.1, 0.45, 0.865 * flip, 0.5, 0.14, 0.07, ORE_B)
  ];
  return assembly(parts);
}
function cairnGeometry() {
  return assembly([
    box(0, 0.25, 0, 1.5, 0.5, 1.3, STONE),
    box(0.1, 0.725, 0, 1.15, 0.45, 1, STONE_B),
    box(-0.1, 1.15, 0.05, 0.85, 0.4, 0.75, STONE),
    box(0.1, 1.525, 0.05, 0.5, 0.35, 0.5, STONE_B),
    box(0.1, 1.85, 0.05, 0.3, 0.3, 0.3, STONE_SHADE)
  ]);
}
function geometryFor(kind, variant) {
  if (kind === "styl_tree_spire") return treeGeometry(T1, Math.abs(variant) % 4);
  if (kind === "styl_tree_table") return treeGeometry(T2, Math.abs(variant) % 4);
  if (kind === "styl_tree_cluster") return treeGeometry(T3, Math.abs(variant) % 3);
  if (kind === "styl_tree_blossom") return treeGeometry(T4, Math.abs(variant) % 2);
  if (kind === "styl_shrub") return shrubGeometry(Math.abs(variant) % 3);
  if (kind === "styl_ore") return oreGeometry(Math.abs(variant) % 2);
  if (kind === "styl_cairn") return cairnGeometry();
  return null;
}
var natureMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
function buildNoxelNature(world, loadedChunks = null) {
  const group = new THREE.Group();
  group.name = "styl_nature";
  const buckets = /* @__PURE__ */ new Map();
  for (const e of world.entities.values()) {
    if (e.harvested) continue;
    if (loadedChunks && !loadedChunks.has(e.chunk)) continue;
    if (!geometryFor(e.kind, e.variant)) continue;
    const key = `${e.kind}:${e.variant}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(e);
  }
  let triangles = 0;
  let instanceCount = 0;
  const geometries = /* @__PURE__ */ new Map();
  for (const [key, list] of buckets) {
    const [kind, variantStr] = key.split(":");
    const geo = geometryFor(kind, Number(variantStr));
    if (!geo) continue;
    geometries.set(key, geo.index ? geo.toNonIndexed() : geo);
    triangles += geo.attributes.position.count / 3 * list.length;
    instanceCount += list.length;
  }
  if (instanceCount === 0) return { group, triangles: 0, instances: 0 };
  let vertexCount = 0;
  for (const geo of geometries.values()) vertexCount += geo.attributes.position.count;
  const batched = new THREE.BatchedMesh(
    instanceCount,
    Math.ceil(vertexCount * 1.08) + 16,
    0,
    natureMaterial
  );
  batched.name = "styl_nature_batch";
  batched.castShadow = true;
  batched.receiveShadow = true;
  batched.perObjectFrustumCulled = true;
  batched.userData.inspectableBatchIds = [];
  batched.userData.inspectableTargets = [];
  const geometryIds = /* @__PURE__ */ new Map();
  for (const [key, geo] of geometries) {
    geometryIds.set(key, batched.addGeometry(geo));
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let instances = 0;
  for (const [key, list] of buckets) {
    const geometryId = geometryIds.get(key);
    if (geometryId === void 0) continue;
    for (const e of list) {
      const id = batched.addInstance(geometryId);
      q.setFromAxisAngle(up, e.rot);
      v.set(e.x, e.y - 0.15, e.z);
      s.setScalar(e.scale);
      batched.setMatrixAt(id, m.compose(v, q, s));
      batched.userData.inspectableBatchIds[id] = e.id;
      const targetHeight = e.kind.startsWith("styl_tree_") ? 3 * e.scale : e.kind === "styl_shrub" ? 0.7 * e.scale : e.kind === "styl_ore" ? 0.65 * e.scale : e.scale;
      batched.userData.inspectableTargets[id] = {
        entityId: e.id,
        x: e.x,
        y: e.y + targetHeight,
        z: e.z
      };
      instances++;
    }
  }
  batched.computeBoundingBox();
  batched.computeBoundingSphere();
  group.add(batched);
  return { group, triangles, instances };
}
export { ensureChunk, generateChunk, evictChunk, generateEntityChunk } from "./world.mjs";
export {
  buildNoxelNature
};
