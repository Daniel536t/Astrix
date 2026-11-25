// STAB-002 S2 fix, headless reproduction of the coop chicken overlap (scratch, not part of the game).
// Run from Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/s2/s2fix-step-repro.ts --bundle --platform=node
//   --format=esm --external:three --outfile=tests/.s2fix-repro.tmp.mjs && node tests/.s2fix-repro.tmp.mjs (then delete the .tmp.mjs)
// Before the fix (863f0f7) the worst overlap was 0.162 to 0.475 m with the hen at -33.25 to -33.7.
import { farm, Walk, animalsOf } from '../../../../Game/tests/stab002-s2-harness';
import { DM } from '../../../../Game/src/sim/homestead';
import { bodyOverlap } from '../../../../Game/src/sim/character';
// Founder on the 1 m step inside the coop (ground 13 at x >= -33), a hen at the foot of the step (ground 12), founder walks -x off the step.
for (const hx of [-33.15, -33.25, -33.35, -33.5, -33.7]) for (const mode of ['60fps', 'fixed'] as const) {
  const s = farm(7); const h = s.world.homestead!;
  const hens = animalsOf(h, 'chicken');
  const hen = hens[0];
  hen.x = Math.round(hx * DM); hen.z = -25; hen.tx = hen.x; hen.tz = hen.z; hen.hunger = 0; (hen as any).act = 'rest'; (hen as any).until = 10_000;
  for (const o of hens.slice(1)) { o.x = -365; o.z = 5; o.tx = o.x; o.tz = o.z; }
  const w = new Walk(s, -32.4, -2.5, mode);
  const y0 = w.ch.y;
  let worst = 0, at: any = null;
  for (let f = 0; f < 180; f++) {
    w.frame({ moveX: -1, moveZ: 0 });
    const p = bodyOverlap(w.current(), w.ch.x, w.ch.y, w.ch.z);
    if (p > worst) { worst = p; at = { x: +w.ch.x.toFixed(2), y: +w.ch.y.toFixed(2), f }; }
  }
  const b = w.current().find((q) => q.id === hen.id)!;
  console.log(mode, 'hen', hx, 'bodyY', b.y, 'y0', y0, 'worst overlap', worst.toFixed(3), JSON.stringify(at), 'end', w.ch.x.toFixed(2), w.ch.y.toFixed(2), 'henNow', (hen.x/DM).toFixed(1));
}
