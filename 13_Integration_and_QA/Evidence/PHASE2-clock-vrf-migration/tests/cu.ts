// Compute units per instruction (LiteSVM, program-only CU from the top-level "consumed" log line).
import fs from 'node:fs';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Env, ixSettle, ixTick, ixMigrate, ixHarvest, ixPlant, ixSawmill, ixProspect, ixFulfil, ixCancelProspect, ixClaim, ixClaimVrf, ix, W, R, S,
  slotPda, passportPda, settlementPda, backupOf, solvePow, queueItems, SO_OLD, PROGRAM_ID, Result, loadAdmin } from './h.ts';
import { claimFresh, farm, loadSlot, RESULTS } from './common.ts';

const progCu = (r: Result) => r.logs.filter((l) => l.startsWith(`Program ${PROGRAM_ID.toBase58()} consumed`)).map((l) => Number(l.split(' consumed ')[1].split(' ')[0]));
const rows: any[] = [];
const rec = (name: string, r: Result, note = '') => { if (!r.ok) throw new Error(`${name}: ${r.err}\n${r.logs.join('\n')}`); const p = progCu(r); rows.push({ name, programCu: p.reduce((a, b) => a + b, 0), perIx: p, txCu: r.cu, note }); };

// v1 vs v2 on the ER backup demo settlement (v1 layout)
{
  const env = new Env({ program: SO_OLD });
  env.loadBackup(backupOf('er', 'slot-00'));
  const w = slotPda(0);
  env.setTime(BigInt(Number(fs.readFileSync(`/projects/sandbox/.tools/scratch/phase2/backup/${backupOf('er', 'slot-00').file}`).readBigInt64LE(54))) + 2n);
  rec('OLD binary tick (1 step, v1 account)', env.send([ixTick(w)]));
}
{
  const env = new Env();
  const { w, guest, claimCu } = claimFresh(env, 20);
  rows.push({ name: 'claim_world (legacy) on v2 slot', txCu: claimCu });
  farm(env, w, guest);
  env.advance(1); rec('settle no-op (nothing due)', env.send([ixSettle(w)]));
  env.advance(2); rec('settle 1 step', env.send([ixSettle(w)]));
  env.advance(2); rec('tick alias 1 step', env.send([ixTick(w)]));
  env.advance(30); rec('settle 15 steps (30 s crank)', env.send([ixSettle(w)]));
  env.advance(60); rec('settle 30 steps (60 s crank)', env.send([ixSettle(w)]));
  env.advance(600); rec('settle 300 steps (cap)', env.send([ixSettle(w)]));
  env.advance(2); rec('harvest (settle + action)', env.send([ixHarvest(w, guest.publicKey, 0, 2)], [guest]));
  env.advance(2); rec('build/plant: plant (settle + action)', env.send([ixPlant(w, guest.publicKey, 7)], [guest]));
  env.advance(2); rec('prospect (settle + VRF request CPI)', env.send([ixProspect(w, guest.publicKey)], [guest]));
  const f = env.send([ixFulfil(queueItems(env).length - 1, Buffer.alloc(32, 9), [w])]);
  rec('vrf_callback via mock (mock VRF + ASTrix callback)', f, 'perIx = ASTrix callback only (inner)');
  const inner = f.logs.filter((l) => l.startsWith(`Program ${PROGRAM_ID.toBase58()} consumed`));
  rows[rows.length - 1].callbackOnly = inner.map((l) => Number(l.split(' consumed ')[1].split(' ')[0]));
  env.send([ixProspect(w, guest.publicKey)], [guest]); env.advance(131);
  rec('cancel_prospect (after timeout)', env.send([ixCancelProspect(w, guest.publicKey)], [guest]));
}
{
  const env = new Env();
  const w = loadSlot(env, 21, false);
  rec('migrate_world (v1 -> v2, incl. rent transfer)', env.send([ixMigrate(w, env.payer.publicKey)]));
  env.advance(30);
  const g = Keypair.generate();
  rec('claim_world_vrf (commit + VRF request)', env.send([ixClaimVrf(21, g.publicKey, solvePow(g.publicKey, 21), Array(32).fill(3))], [g]));
  const f = env.send([ixFulfil(0, Buffer.alloc(32, 4), [w])]);
  rec('vrf_callback genesis via mock', f);
}
// 16-world crank transactions (16 settle instructions in one tx, as Hydra runs them)
{
  const env = new Env();
  const ws: PublicKey[] = [];
  for (let i = 0; i < 16; i++) { const { w, guest } = claimFresh(env, 16 + i); farm(env, w, guest); ws.push(w); }
  // align all worlds to the same settled time
  env.advance(2); env.send(ws.map(ixSettle));
  env.advance(30); rec('16-world crank, 15 steps each (30 s cadence)', env.send(ws.map(ixSettle)));
  env.advance(60); rec('16-world crank, 30 steps each (60 s cadence)', env.send(ws.map(ixSettle)));
  env.advance(600); rec('16-world crank, 300 steps each (cap; backlog)', env.send(ws.map(ixSettle)));
  env.advance(2); rec('16-world crank, old-style 2 s tick alias (1 step each)', env.send(ws.map(ixTick)));
}
fs.writeFileSync(`${RESULTS}/cu.json`, JSON.stringify(rows, null, 1));
for (const r of rows) console.log(String(r.programCu ?? '').padStart(8), String(r.txCu).padStart(8), r.name, r.callbackOnly ? `callback-only ${r.callbackOnly}` : '');
void SystemProgram; void R; void S; void W; void ix; void passportPda; void settlementPda; void loadAdmin; void ixSawmill; void ixClaim;
