import fs from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Env, backupOf, slotPda, passportPda, registryPda, ixMigrate, ixClaim, ixPlant, ixSawmill, solvePow, settlement } from './h.ts';

export const RESULTS = '/projects/sandbox/.tools/scratch/phase2/results';
fs.mkdirSync(RESULTS, { recursive: true });
export function record(file: string, obj: unknown) {
  fs.appendFileSync(`${RESULTS}/${file}`, JSON.stringify(obj) + '\n');
}

/** Registry + slot i + passport i from the ER backup (program-owned, as on the ER), slot migrated to v2. */
export function loadSlot(env: Env, i: number, migrate = true) {
  env.loadBackup(backupOf('er', 'registry'));
  env.loadBackup(backupOf('er', `slot-${String(i).padStart(2, '0')}`));
  env.loadBackup(backupOf('er', `passport-${String(i).padStart(2, '0')}`));
  const w = slotPda(i);
  if (migrate) { const r = env.send([ixMigrate(w, env.payer.publicKey)]); if (!r.ok) throw new Error('migrate failed ' + r.err); }
  return w;
}

/** A freshly claimed world on an unclaimed backup slot (legacy claim), with a local guest key. */
export function claimFresh(env: Env, i: number, migrate = true) {
  const w = loadSlot(env, i, migrate);
  env.advance(30); // registry cooldown and a fresh clock
  const guest = Keypair.generate();
  const nonce = solvePow(guest.publicKey, i);
  const r = env.send([ixClaim(i, guest.publicKey, nonce)], [guest]);
  if (!r.ok) throw new Error('claim failed ' + r.err + r.logs.join('\n'));
  return { w, guest, claimCu: r.cu };
}

/** Plant 6 plots and build the sawmill so production, consumption and population all move. */
export function farm(env: Env, w: PublicKey, guest: Keypair) {
  for (let p = 0; p < 6; p++) { const r = env.send([ixPlant(w, guest.publicKey, p)], [guest]); if (!r.ok) throw new Error('plant ' + r.err); }
  const r = env.send([ixSawmill(w, guest.publicKey)], [guest]);
  if (!r.ok) throw new Error('sawmill ' + r.err);
}

export const prefix = (d: Buffer) => d.subarray(0, 240);
export const worldTick = (env: Env, w: PublicKey) => settlement(env.data(w)).tick;
export { registryPda, passportPda };
