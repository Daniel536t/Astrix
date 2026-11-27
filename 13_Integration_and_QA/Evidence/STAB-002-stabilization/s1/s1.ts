// STAB-002 S1 acceptance survey (headless). Usage: node s1.mjs <mode> <seeds> [days] [pre]
//   mode: fresh:<rules> | up:<from>:<to>   seeds: comma list or "15"
import { GameSession } from '../../../Astrix/Game/src/app/session';
import { GENERATOR_V2 } from '../../../Astrix/Game/src/sim/world';
import { DM, DAY_TICKS, NIGHT_START, NIGHT_END, SPECIES_RULES, facility, homesteadNav, penCells, isHerdHomestead } from '../../../Astrix/Game/src/sim/homestead';
const SEEDS15 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1337, 2024, 31337, 99999];
const [mode, seedArg = '1337', daysArg = '3', preArg = '600'] = process.argv.slice(2);
const seeds = seedArg === '15' ? SEEDS15 : seedArg.split(',').map(Number);
const days = Number(daysArg), pre = Number(preArg);
const json = process.argv.includes('--json');
const out: any[] = [];
for (const seed of seeds) {
  const s = GameSession.genesis(seed, GENERATOR_V2);
  let n = 0;
  const send = (c: Record<string, unknown>) => { const r = s.dispatch({ schema: 3, id: `s1:${n++}:${String(c.type)}`, expectedRevision: s.world.revision, ...c } as never); if (!r.ok) throw new Error(JSON.stringify(r)); return r; };
  const [kind, a1, a2] = mode.split(':');
  if (kind === 'fresh') send(a1 === '1' ? { type: 'found_homestead' } : { type: 'found_homestead', rules: Number(a1) });
  else {
    send(a1 === '1' ? { type: 'found_homestead' } : { type: 'found_homestead', rules: Number(a1) });
    for (let i = 0; i < pre; i++) send({ type: 'tick', ticks: 1 });
    send({ type: 'upgrade_homestead', rules: Number(a2) });
  }
  const h = () => s.world.homestead!;
  const startTick = s.world.life!.tick;
  const rec = new Map<string, any>();
  const blockedAtStart = h().animals.filter((a) => { const g = homesteadNav(s.world, h()); const i = g.index(Math.floor(a.x / DM), Math.floor(a.z / DM)); return g.block[i] !== 0; }).length;
  let jumps = 0, maxStep = 0, starvingTicks = 0, hungryNoFood = 0;
  const enc0 = JSON.stringify(h().enclosures);
  let minWater = 99;
  for (let i = 0; i < days * DAY_TICKS; i++) {
    const before = new Map(h().animals.map((a) => [a.id, { x: a.x, z: a.z }]));
    send({ type: 'tick', ticks: 1 });
    const t = s.world.life!.tick - 1, ph = t % DAY_TICKS, night = ph >= NIGHT_START && ph < NIGHT_END;
    for (const e of h().enclosures) if (h().animals.some((a) => SPECIES_RULES[a.species].enclosure === e.id)) minWater = Math.min(minWater, e.water);
    for (const a of h().animals) {
      const b = before.get(a.id); if (!b) continue;
      let r = rec.get(a.id);
      if (!r) { r = { sp: a.species, ticks: 0, moves: 0, day: 0, dayMoves: 0, run: 0, longest: 0, runR: 0, longestR: 0, st: {} as Record<string, number>, born: a.born }; rec.set(a.id, r); }
      const d = Math.hypot(a.x - b.x, a.z - b.z); const moved = d > 0;
      if (d > maxStep) maxStep = d;
      if (d > 12.5) jumps++;
      r.ticks++; if (moved) r.moves++;
      const act = a.act ?? 'none'; r.st[act] = (r.st[act] ?? 0) + 1;
      if (a.starving > 0) starvingTicks++;
      if (!night) {
        r.day++; if (moved) r.dayMoves++;
        // strict: rest ticks neither count nor end a stretch; lenient: a rest tick ends it
        if (moved) { r.run = 0; r.runR = 0; }
        else if (act === 'rest') { r.runR = 0; }
        else { r.run++; r.runR++; r.longest = Math.max(r.longest, r.run); r.longestR = Math.max(r.longestR, r.runR); }
      } else { r.run = 0; r.runR = 0; }
    }
  }
  const all = [...rec.entries()].map(([id, r]) => ({ id, ...r }));
  const old = all.filter((r) => r.ticks >= 100);
  const dayOld = all.filter((r) => r.day >= 100);
  const frozen = old.filter((r) => r.moves === 0).map((r) => r.id);
  const shares = dayOld.map((r) => r.dayMoves / r.day);
  const g = homesteadNav(s.world, h());
  const onBlocked = h().animals.filter((a) => g.block[g.index(Math.floor(a.x / DM), Math.floor(a.z / DM))] !== 0).length;
  const cutOff = isHerdHomestead(h()) ? h().animals.filter((a) => { const f = facility(h(), SPECIES_RULES[a.species].enclosure)!; const inside = a.x >= f.rect.x0 && a.x < f.rect.x1 && a.z >= f.rect.z0 && a.z < f.rect.z1; return inside && !penCells(s.world, h(), g, SPECIES_RULES[a.species].enclosure).main.has(g.index(Math.floor(a.x / DM), Math.floor(a.z / DM))); }).length : -1;
  const st: Record<string, number> = {}; for (const r of all) for (const [k, v] of Object.entries(r.st)) st[k] = (st[k] ?? 0) + (v as number);
  const tot = Object.values(st).reduce((x, y) => x + y, 0);
  const res = {
    seed, rules: h().version, animals: h().animals.length, observed: all.length, blockedAtStart, onBlockedEnd: onBlocked, cutOffEnd: cutOff,
    frozen: frozen.length, frozenIds: frozen,
    moveShare: +(all.reduce((x, r) => x + r.moves, 0) / all.reduce((x, r) => x + r.ticks, 0) * 100).toFixed(1),
    dayShareMin: +(Math.min(...shares) * 100).toFixed(1), dayShareMed: +(shares.sort((x, y) => x - y)[Math.floor(shares.length / 2)] * 100).toFixed(1),
    under15: dayOld.filter((r) => r.dayMoves / r.day < 0.15).map((r) => `${r.id}:${(r.dayMoves / r.day * 100).toFixed(1)}`),
    longestMax: Math.max(...all.map((r) => r.longest)), longestMaxLenient: Math.max(...all.map((r) => r.longestR)),
    over80: all.filter((r) => r.longest > 80).map((r) => `${r.id}:${r.longest}`),
    statePct: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +(v / tot * 100).toFixed(1)])),
    jumps, maxStep: +maxStep.toFixed(1), starvingTicks, minWater, hash: s.stateHash,
    eggs: h().enclosures.find((e) => e.id === 'coop')!.eggs, store: JSON.stringify(s.world.life!.stockpiles.get('stockpile:founder')?.inventory ?? {}),
  };
  out.push(res);
  if (!json) console.log(`seed ${String(seed).padStart(5)} v${res.rules} n=${res.animals} blocked0=${blockedAtStart} blockedEnd=${onBlocked} cutOff=${cutOff} frozen=${res.frozen} move=${res.moveShare}% dayMin=${res.dayShareMin}% dayMed=${res.dayShareMed}% longest=${res.longestMax}/${res.longestMaxLenient} jumps=${jumps} maxStep=${res.maxStep} starving=${starvingTicks} minWater=${minWater} ${JSON.stringify(res.statePct)}${res.under15.length ? ' <15:' + res.under15.join(',') : ''}${res.over80.length ? ' >80:' + res.over80.join(',') : ''}`);
}
if (json) console.log(JSON.stringify(out));
else {
  const agg = (k: string, f: (a: number[]) => number) => f(out.map((r) => r[k]));
  console.log(`ALL ${mode}: frozen total ${agg('frozen', (a) => a.reduce((x, y) => x + y, 0))}, dayShare min ${agg('dayShareMin', (a) => Math.min(...a))}%, longest max ${agg('longestMax', (a) => Math.max(...a))} (lenient ${agg('longestMaxLenient', (a) => Math.max(...a))}), jumps ${agg('jumps', (a) => a.reduce((x, y) => x + y, 0))}, maxStep ${agg('maxStep', (a) => Math.max(...a))}, starving ${agg('starvingTicks', (a) => a.reduce((x, y) => x + y, 0))}`);
}
