import { GameSession } from '../Astrix/Game/src/app/session';
import { GENERATOR_V2 } from '../Astrix/Game/src/sim/world';
import { DM, facility, findFieldSpot, SPECIES_RULES, homesteadNav } from '../Astrix/Game/src/sim/homestead';
import { navStats } from '../Astrix/Game/src/sim/nav';

const rules = Number(process.argv[2] ?? 3);
const s = GameSession.genesis(1337, GENERATOR_V2);
let n = 0;
const send = (c: Record<string, unknown>) => s.dispatch({ schema: 3, id: `p:${n++}`, expectedRevision: s.world.revision, ...c } as never);
send({ type: 'found_homestead', rules });
const h = s.world.homestead!;
console.log(send({ type: 'mark_field', ...findFieldSpot(s.world, 6, 6, 'flax')! }).ok);
const ms: number[] = [];
let shared = 0, waits = 0, maxWait = 0, outside = 0, blocked = 0;
const reasons = new Set<string>();
for (let i = 0; i < 900; i++) {
  const t0 = performance.now();
  const r = send({ type: 'tick', ticks: 1 });
  ms.push(performance.now() - t0);
  if (!r.ok) throw new Error(JSON.stringify(r));
  const cells = h.villagers.map((v) => `${Math.floor(v.x / DM)},${Math.floor(v.z / DM)}`);
  if (new Set(cells).size < cells.length) shared++;
  for (const v of h.villagers) {
    if (v.nav?.wait) { waits++; reasons.add(v.nav.wait.reason.replace(/\d+/g, '#')); maxWait = Math.max(maxWait, s.world.life!.tick - v.nav.wait.since); }
    if (v.nav?.blocked) blocked++;
  }
  for (const a of h.animals) { const f = facility(h, SPECIES_RULES[a.species].enclosure)!.rect; if (!(a.x >= f.x0 && a.x < f.x1 && a.z >= f.z0 && a.z < f.z1)) outside++; }
}
ms.sort((a, b) => a - b);
const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
console.log({ rules, shared, waits, maxWait, blocked, outside, reasons: [...reasons], animals: h.animals.length, starving: h.animals.filter((a) => a.starving > 0).length,
  store: s.world.life!.stockpiles.get('stockpile:founder')!.inventory, gates: h.gates?.map((g) => g.state).join(','),
  meanMs: mean.toFixed(2), p50: ms[450].toFixed(2), p99: ms[891].toFixed(2), max: ms[899].toFixed(1), firstTick: 'see max' });
console.log(navStats(s.world));
console.log(h.villagers.map((v) => `${v.name} ${v.task?.kind}`));
