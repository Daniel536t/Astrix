// STAB-002 S4: compare s4.ts outputs, before (S3 tree) and after (S4 tree).
// node s4-compare.mjs <dir with before-{B,F,W,T}.json and after-{B,F,W,T}.json>
import { readFileSync } from 'node:fs';
const dir = process.argv[2] ?? '.';
const load = (p) => ['B', 'F', 'W', 'T'].flatMap((w) => JSON.parse(readFileSync(`${dir}/${p}-${w}.json`, 'utf8')).rows);
const before = load('before'), after = load('after');
const key = (r) => `${r.t}|${r.label}|${r.seed}|${r.at ?? ''}|${r.n ?? ''}`;
const bmap = new Map(before.map((r) => [key(r), r]));
const out = [];
const say = (s) => { out.push(s); };
const pct = (a, b) => (a ? `${(100 * (b - a) / a).toFixed(0)} %` : '-');
const cap = (v, lim) => v ?? lim;
let tb = 0, ta = 0, eb = 0, ea = 0, en = 0, enb = 0, worst = 0, fails = [];

say('## B: woodshed and well approved, fresh store, default steward, no hand roles (ticks after approval; never = not within 1800)');
say('| run | seed | at | woodshed before | after | well before | after | woodshed+well change |');
say('|---|---|---|---|---|---|---|---|');
for (const a of after.filter((r) => r.t === 'B')) {
  const b = bmap.get(key(a));
  const sb = cap(b.woodshed, 1800) + cap(b.well, 1800), sa = cap(a.woodshed, 1800) + cap(a.well, 1800);
  tb += sb; ta += sa;
  if (a.woodshed === null || a.woodshed > 300) fails.push(`B ${key(a)} woodshed ${a.woodshed}`);
  say(`| ${a.label} | ${a.seed} | ${a.at} | ${b.woodshed ?? 'never'} | ${a.woodshed ?? 'never'} | ${b.well ?? 'never'} | ${a.well ?? 'never'} | ${pct(sb, sa)} |`);
}
say('\n## F: 6 x 6 owner field on a farm with n 4 x 4 fields (300 ticks warm); ticks after marking');
say('| run | seed | fields | taken before | after | sown before | after | free seed / units | units sown by +60 before | after | taken+sown change |');
say('|---|---|---|---|---|---|---|---|---|---|---|');
for (const a of after.filter((r) => r.t === 'F')) {
  const b = bmap.get(key(a));
  const sb = cap(b.claimed, 900) + cap(b.sown, 900), sa = cap(a.claimed, 900) + cap(a.sown, 900);
  tb += sb; ta += sa;
  if (a.claimed === null || a.claimed > 30) fails.push(`F ${key(a)} taken ${a.claimed}`);
  const seedOk = a.seedAtMark >= a.units ? a.sown !== null && a.sown <= 60 : a.sownAt60 >= Math.min(a.units, a.seedAtMark);
  if (!seedOk) fails.push(`F ${key(a)} sown ${a.sown} (${a.sownAt60}/${a.units}, seed ${a.seedAtMark})`);
  say(`| ${a.label} | ${a.seed} | ${a.n} | ${b.claimed ?? 'never'} | ${a.claimed ?? 'never'} | ${b.sown ?? 'never'} | ${a.sown ?? 'never'} | ${a.seedAtMark} / ${a.units} | ${b.sownAt60} | ${a.sownAt60} | ${pct(sb, sa)} |`);
}
say('\n## W: max wait of routine and upkeep work (daytime ticks, due to taken), 600 ticks after the owner field; bound 120');
say('| run | seed | fields | before | after | open at end (after) | after: waits > 100 |');
say('|---|---|---|---|---|---|---|');
for (const a of after.filter((r) => r.t === 'W')) {
  const b = bmap.get(key(a));
  if (a.max > 120 || (a.open && a.open.age > 120)) fails.push(`W ${key(a)} max ${a.max} open ${JSON.stringify(a.open)}`);
  say(`| ${a.label} | ${a.seed} | ${a.n} | ${b.max} | ${a.max} | ${a.open ? `${a.open.key} ${a.open.age}` : '-'} | ${a.long.join(', ') || '-'} |`);
}
say('\n## T: standard farm (4 x 4 owner field, 1500 ticks)');
say('| seed | max wait before | after | travel share before | after | work share of awake before | after |');
say('|---|---|---|---|---|---|---|');
for (const a of after.filter((r) => r.t === 'T')) {
  const b = bmap.get(key(a));
  if (a.max > 120) fails.push(`T ${key(a)} max ${a.max}`);
  const sh = (t, k) => `${(100 * t[k] / t.ticks).toFixed(0)} %`;
  const aw = (t) => `${(100 * t.work / (t.ticks - t.sleeping)).toFixed(1)} %`;
  say(`| ${a.seed} | ${b.max} | ${a.max} | ${sh(b.total, 'travel')} | ${sh(a.total, 'travel')} | ${aw(b.total)} | ${aw(a.total)} |`);
}
for (const a of after) { worst = Math.max(worst, a.step); ea += a.errandTicks; en += a.errands; }
for (const b of before) { eb += b.errandTicks; enb += b.errands; }
say('\n## Totals');
say(`- Total task time (sum over every B and F run of woodshed + well ticks and owner-field taken + sown ticks; never counted as the run limit): before ${tb}, after ${ta}, change ${pct(tb, ta)}.`);
say(`- Errand time (every finished villager task other than idle, eat, rest, over all B, F, W and T runs): before ${enb} tasks, ${eb} ticks, mean ${(eb / enb).toFixed(2)}; after ${en} tasks, ${ea} ticks, mean ${(ea / en).toFixed(2)} (${pct(eb / enb, ea / en)} per task).`);
say(`- Largest villager step in one tick, all after runs: ${worst.toFixed(4)} of the exact allowance (speed x 1 tick).`);
say(`- Bound failures after: ${fails.length ? fails.join('; ') : 'none'}`);
console.log(out.join('\n'));
