// STAB-002 S2 headless comparison with the STAB-001 Bug B reproduction (scratch, not part of the game).
// Run from Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s2/s2-repro.ts --bundle --platform=node
//   --format=esm --external:three --outfile=tests/.s2-repro.tmp.mjs && node tests/.s2-repro.tmp.mjs
import { farm, Walk, animalsOf, tick, CHARACTER_RADIUS } from '../../../../Game/tests/stab002-s2-harness';
import { DM, facility, playerPresence, SPECIES_RULES } from '../../../../Game/src/sim/homestead';
import { canStandAt, findStandingY } from '../../../../Game/src/sim/character';
import { presenceCells } from '../../../../Game/src/sim/bodies';
import type { GameSession } from '../../../../Game/src/app/session';

// (1) STAB-001 1.1: the player walks +x for 2 s at a cow 3 m ahead (same stretch search as repro.ts), at 60 fps.
function stretch(s: GameSession) {
  const h = s.world.homestead!, pad = facility(h, 'paddock')!.rect;
  const cx = (pad.x0 + pad.x1) / 2 / DM, cz = (pad.z0 + pad.z1) / 2 / DM;
  for (let dz = -2; dz <= 2; dz += 0.5) for (let dx = -5; dx <= 0; dx += 0.5) {
    const px = cx + dx + 0.5, pz = cz + dz + 0.5, y = findStandingY(s.world, px, pz, 60);
    if (y === null) continue;
    let ok = true;
    for (let k = 0; k <= 6; k += 0.25) { const yy = findStandingY(s.world, px + k, pz, 60); if (yy === null || Math.abs(yy - y) > 0.01 || !canStandAt(s.world, px + k, yy, pz)) { ok = false; break; } }
    if (ok) return { px, pz };
  }
  throw new Error('no stretch');
}
for (const mode of ['60fps', 'fixed'] as const) {
  const s = farm(7); const h = s.world.homestead!;
  const st = stretch(s);
  const cow = animalsOf(h, 'cattle')[0];
  cow.x = Math.round((st.px + 3) * DM); cow.z = Math.round(st.pz * DM); cow.tx = cow.x; cow.tz = cow.z; cow.hunger = 0; cow.act = 'rest'; cow.until = 10_000;
  const w = new Walk(s, st.px, st.pz, mode);
  let minCentre = Infinity, passed = false;
  for (let f = 0; f < 120; f++) { w.frame({ moveX: 1, moveZ: 0 }); minCentre = Math.min(minCentre, Math.hypot(w.ch.x - cow.x / DM, w.ch.z - cow.z / DM)); if (w.ch.x > cow.x / DM + 1) passed = true; }
  console.log(`(1) ${mode}: player walking at the cow for 2 s: min centre distance ${minCentre.toFixed(2)} m (sum of radii ${(0.46 + CHARACTER_RADIUS).toFixed(2)}), min capsule gap ${w.minGap.toFixed(3)} m, walked past: ${passed}, end x ${w.ch.x.toFixed(2)} (cow ${(cow.x / DM).toFixed(2)})`);
}
// (2) STAB-001 1.1: the player stands at x; the cow's target is 1.5 m beyond the player; 8 journaled ticks (with presence).
{
  const s = farm(7); const h = s.world.homestead!;
  const st = stretch(s);
  const cow = animalsOf(h, 'cattle')[0];
  const ax = st.px + 3;
  const w = new Walk(s, ax - 1.5, st.pz);
  cow.x = Math.round((ax - 3) * DM); cow.z = Math.round(st.pz * DM); cow.tx = Math.round(ax * DM); cow.tz = cow.z; cow.hunger = 0; cow.act = 'wander'; cow.until = 0;
  for (const e of h.enclosures) { e.water = 30; e.feed = 30; e.grass = 100; }
  const trail: string[] = []; let minD = Infinity, through = false;
  // The cow is placed 1.5 m from the player with an arbitrary resting heading: the first second is the push-out
  // from that placement (as when a save loads), so the contact gap is measured from then on.
  w.stand(1); const placed = w.minGap; w.minGap = Infinity;
  for (let t = 0; t < 8; t++) { w.stand(2); const d = Math.hypot(cow.x / DM - w.ch.x, cow.z / DM - w.ch.z); minD = Math.min(minD, d); trail.push(`${(cow.x / DM).toFixed(1)}(d=${d.toFixed(2)})`); if (cow.x / DM > w.ch.x + 0.3) through = true; }
  console.log(`(2) cow walking at the standing player: x per tick ${trail.join(' ')}; min centre distance ${minD.toFixed(2)} m; min drawn capsule gap ${w.minGap.toFixed(3)} m after the first second (${placed.toFixed(3)} m at placement); passed through: ${through}`);
}
// (3) STAB-001 1.2: 600 ticks, crowding counts; v7 without presence, and v7 with the player standing in the paddock middle.
for (const withPlayer of [false, true]) {
  const s = farm(7); const h = s.world.homestead!;
  const pad = facility(h, 'paddock')!.rect;
  const pp = withPlayer ? { x: Math.round((pad.x0 + pad.x1) / 2) + 5, z: Math.round((pad.z0 + pad.z1) / 2) + 5, mx: 0 as const, mz: 0 as const } : null;
  let shared = 0, close = 0, vInAnimalCell = 0, inPlayerCells = 0, maxStack = 0;
  const t0 = performance.now();
  for (let t = 0; t < 600; t++) {
    tick(s, pp);
    const cells = new Map<string, number>();
    for (const a of h.animals) { const k = `${Math.floor(a.x / DM)},${Math.floor(a.z / DM)}`; cells.set(k, (cells.get(k) ?? 0) + 1); }
    for (const n of cells.values()) { if (n > 1) shared += n - 1; maxStack = Math.max(maxStack, n); }
    for (let i = 0; i < h.animals.length; i++) for (let j = i + 1; j < h.animals.length; j++) if (Math.hypot(h.animals[i].x - h.animals[j].x, h.animals[i].z - h.animals[j].z) < 5) close++;
    for (const v of h.villagers) if (cells.has(`${Math.floor(v.x / DM)},${Math.floor(v.z / DM)}`)) vInAnimalCell++;
    if (pp) { const pc = new Set(presenceCells(pp).map(([x, z]) => `${x},${z}`)); for (const a of h.animals) if (pc.has(`${Math.floor(a.x / DM)},${Math.floor(a.z / DM)}`)) inPlayerCells++; }
  }
  console.log(`(3) 600 ticks v7 ${withPlayer ? 'with the player standing in the paddock' : 'without presence'}: ${(performance.now() - t0).toFixed(0)} ms; animals ${h.animals.length}; extra animals sharing a 1 m cell ${shared} (max stack ${maxStack}); animal pairs < 0.5 m ${close}; villager-ticks in an animal's cell ${vInAnimalCell}${pp ? `; animal-ticks in the player's cells ${inPlayerCells}` : ''}`);
}
void SPECIES_RULES; void playerPresence;
