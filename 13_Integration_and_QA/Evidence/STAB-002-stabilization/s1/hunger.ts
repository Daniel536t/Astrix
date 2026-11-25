import { GameSession } from '../../../Astrix/Game/src/app/session';
import { GENERATOR_V2 } from '../../../Astrix/Game/src/sim/world';
const rules = Number(process.argv[2]);
let below = 0, all = 0, meals = 0, water = 0, grass = 0, feed = 0, preg = 0, births = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1337, 2024, 31337, 99999]) {
  const s = GameSession.genesis(seed, GENERATOR_V2); let n = 0;
  const send = (c: any) => { const r = s.dispatch({ schema: 3, id: `x:${n++}`, expectedRevision: s.world.revision, ...c }); if (!r.ok) throw new Error(JSON.stringify(r)); };
  send({ type: 'found_homestead', rules });
  for (let i = 0; i < 900; i++) {
    const h0 = s.world.homestead!; const hb = new Map(h0.animals.map((a) => [a.id, a])); const e0 = h0.enclosures.map((e) => ({ ...e }));
    const pb = new Map(h0.animals.map((a) => [a.id, a.pregnantUntil])); const hun = new Map(h0.animals.map((a) => [a.id, a.hunger]));
    send({ type: 'tick', ticks: 1 });
    const h = s.world.homestead!;
    for (const a of h.animals) { if (!hb.has(a.id)) { births++; continue; } all++; if (a.hunger < 50) below++; if (a.hunger < hun.get(a.id)! - 20) meals++; if (a.pregnantUntil > 0 && pb.get(a.id) === 0) preg++; }
    h.enclosures.forEach((e, k) => { water += Math.max(0, e0[k].water - e.water); feed += Math.max(0, e0[k].feed - e.feed); });
  }
}
console.log(`v${rules} hunger<50 ${(below / all * 100).toFixed(1)}% meals ${meals} waterUsed ${water} feedUsed ${feed} pregnancies ${preg} births ${births}`);
