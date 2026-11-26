// STAB-002 v8: BUG-C work share of awake villager ticks on the standard farm (4 x 4 owner field at tick 0,
// 1500 ticks, default steward, seeds 1337 / 42 / 7), rules v7 (released S3) and v8 (final), from tests/stab002-s3-harness.ts.
// From Game/: npx esbuild ../13_Integration_and_QA/Evidence/STAB-002-stabilization/v8/workshare.ts --bundle --platform=node
//   --format=esm --external:three --outfile=.tmp-tb/workshare.mjs && node .tmp-tb/workshare.mjs
import { farm, markField } from '../../../../Game/tests/stab002-s3-harness';

for (const rules of [7, 8]) for (const seed of [1337, 42, 7]) {
  const f = farm(seed, rules);
  markField(f.s, f.send, 4, 4);
  f.step(1500);
  const t = f.work.metrics().total;
  console.log(`v${rules} seed ${seed}: work share of awake ${(100 * t.work / (t.ticks - t.sleeping)).toFixed(1)} %, travel ${(100 * t.travel / t.ticks).toFixed(0)} %, max wait ${f.work.metrics().waits.max}, starving ${t.starving}`);
}
