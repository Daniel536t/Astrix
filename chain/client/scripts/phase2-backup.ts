// Copy of the PHASE2 read-only backup tool (Evidence/PHASE2-clock-vrf-migration). Run before any devnet upgrade.
// PHASE2 backup: READ-ONLY. Dumps the ASTrix program binary, programdata header (upgrade authority),
// and every ASTrix account (base devnet + MagicBlock devnet ER) with raw data, owner, lamports and
// delegation records/metadata. Sends no transactions; uses only getAccountInfo / getProgramAccounts /
// getMultipleAccounts / getSlot. Never reads or prints secret keys (the admin pubkey is a constant).
// Usage (from Astrix/chain/client): npx tsx scripts/phase2-backup.ts <outDir outside the repo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Connection, PublicKey } from '@solana/web3.js';

const OUT = process.argv[2] ?? '/projects/sandbox/.tools/scratch/phase2/backup';
const BASE_RPC = 'https://api.devnet.solana.com';
const ER_RPC = 'https://devnet-eu.magicblock.app';
const PROGRAM = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy');
const ADMIN = new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32');
const DLP = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const base = new Connection(BASE_RPC, 'confirmed');
const er = new Connection(ER_RPC, 'confirmed');
fs.mkdirSync(path.join(OUT, 'base'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'er'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'program'), { recursive: true });

const pda = (seeds: Buffer[], prog = PROGRAM) => PublicKey.findProgramAddressSync(seeds, prog)[0];
const slot = (i: number) => pda([Buffer.from('world-slot'), ADMIN.toBuffer(), Buffer.from([i])]);
const named: Record<string, string> = {};
named[pda([Buffer.from('astrix-settlement'), ADMIN.toBuffer()]).toBase58()] = 'settlement';
named[pda([Buffer.from('settlement'), ADMIN.toBuffer()]).toBase58()] = 'settlement-v1-orphan';
named[pda([Buffer.from('astrix-registry'), ADMIN.toBuffer()]).toBase58()] = 'registry';
named[pda([Buffer.from('checkpoint-treasury'), ADMIN.toBuffer()]).toBase58()] = 'treasury';
for (let i = 0; i < 32; i++) {
  named[slot(i).toBase58()] = `slot-${String(i).padStart(2, '0')}`;
  named[pda([Buffer.from('passport'), slot(i).toBuffer()]).toBase58()] = `passport-${String(i).padStart(2, '0')}`;
}
const dlpPdas = (acc: PublicKey) => ({
  'delegation-record': pda([Buffer.from('delegation'), acc.toBuffer()], DLP),
  'delegation-metadata': pda([Buffer.from('delegation-metadata'), acc.toBuffer()], DLP),
  'commit-state': pda([Buffer.from('state-diff'), acc.toBuffer()], DLP),
  'commit-record': pda([Buffer.from('commit-state-record'), acc.toBuffer()], DLP),
  'undelegation-request': pda([Buffer.from('undelegation-request'), acc.toBuffer()], DLP),
});

type Entry = { layer: string; name: string; pubkey: string; exists: boolean; owner?: string; lamports?: number; executable?: boolean;
  rentEpoch?: number | string; dataLen?: number; file?: string; sha256?: string; disc?: string; slot: number };
const manifest: Entry[] = [];
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function record(layer: 'base' | 'er', name: string, key: PublicKey, info: any, slotNow: number) {
  if (!info) { manifest.push({ layer, name, pubkey: key.toBase58(), exists: false, slot: slotNow }); return null; }
  const data = Buffer.from(info.data);
  const file = `${layer}/${name}__${key.toBase58()}.bin`;
  fs.writeFileSync(path.join(OUT, file), data);
  // solana-test-validator --account <pubkey> <file.json> format
  fs.writeFileSync(path.join(OUT, `${layer}/${name}__${key.toBase58()}.json`), JSON.stringify({
    pubkey: key.toBase58(),
    account: { lamports: info.lamports, data: [data.toString('base64'), 'base64'], owner: info.owner.toBase58(),
      executable: info.executable, rentEpoch: 0, space: data.length },
  }));
  manifest.push({ layer, name, pubkey: key.toBase58(), exists: true, owner: info.owner.toBase58(), lamports: info.lamports,
    executable: info.executable, rentEpoch: String(info.rentEpoch ?? ''), dataLen: data.length, file, sha256: sha(data),
    disc: data.subarray(0, 8).toString('hex'), slot: slotNow });
  return info;
}
async function saveMany(conn: Connection, layer: 'base' | 'er', items: [string, PublicKey][], slotNow: number) {
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    let infos: any[] | null = null;
    for (let t = 0; t < 8 && !infos; t++) {
      try { infos = await conn.getMultipleAccountsInfo(chunk.map((c) => c[1]), 'confirmed'); } catch (e) { await sleep(3000 * (t + 1)); }
    }
    if (!infos) throw new Error('getMultipleAccountsInfo failed repeatedly');
    chunk.forEach(([n, k], j) => record(layer, n, k, infos![j], slotNow));
    await sleep(1500);
  }
}
async function save(conn: Connection, layer: 'base' | 'er', name: string, key: PublicKey, slotNow: number) {
  await saveMany(conn, layer, [[name, key]], slotNow);
  const m = manifest[manifest.length - 1];
  return m.exists ? await conn.getAccountInfo(key, 'confirmed') : null;
}

const baseSlot = await base.getSlot('confirmed');
const erSlot = await er.getSlot('confirmed');
const erTime = await er.getBlockTime(erSlot).catch(() => null);
const baseTime = await base.getBlockTime(baseSlot).catch(() => null);

// 1. Program account + programdata (binary + upgrade authority)
const progInfo = await save(base, 'base', 'program', PROGRAM, baseSlot);
const programData = new PublicKey(progInfo!.data.subarray(4, 36));
const pdInfo = await save(base, 'base', 'programdata', programData, baseSlot);
const pd = Buffer.from(pdInfo!.data);
const lastDeploySlot = pd.readBigUInt64LE(4);
const hasAuth = pd[12] === 1;
const upgradeAuthority = hasAuth ? new PublicKey(pd.subarray(13, 45)).toBase58() : null;
let elf = pd.subarray(45);
// Strip trailing zero padding to get the deployable .so (same as `solana program dump`).
let end = elf.length; while (end > 0 && elf[end - 1] === 0) end--;
const so = elf.subarray(0, end);
fs.writeFileSync(path.join(OUT, 'program/astrix_settlement.devnet.so'), so);
fs.writeFileSync(path.join(OUT, 'program/programdata.full.bin'), pd);

// 2. Every account owned by the program on base (non-delegated accounts)
const baseOwned = await base.getProgramAccounts(PROGRAM, { commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } });
await sleep(1500);
const baseItems: [string, PublicKey][] = baseOwned.map((a) => [named[a.pubkey.toBase58()] ?? `unknown-${a.pubkey.toBase58().slice(0, 6)}`, a.pubkey]);
const seenBase = new Set(baseOwned.map((a) => a.pubkey.toBase58()));
for (const [k, n] of Object.entries(named)) {
  const key = new PublicKey(k);
  if (!seenBase.has(k)) baseItems.push([n, key]);
  for (const [tag, p] of Object.entries(dlpPdas(key))) baseItems.push([`${n}.${tag}`, p]);
}
await saveMany(base, 'base', baseItems, baseSlot);
let erOwned: { pubkey: PublicKey }[] = [];
let erGpaError: string | null = null;
try { erOwned = await er.getProgramAccounts(PROGRAM, { commitment: 'confirmed', dataSlice: { offset: 0, length: 0 } }); } catch (e) { erGpaError = String(e).slice(0, 300); }
const erKeys = new Set<string>([...Object.keys(named), ...erOwned.map((a) => a.pubkey.toBase58())]);
await saveMany(er, 'er', [...erKeys].map((k) => [named[k] ?? `unknown-${k.slice(0, 6)}`, new PublicKey(k)] as [string, PublicKey]), erSlot);

const summary = {
  takenAt: new Date().toISOString(), baseRpc: BASE_RPC, erRpc: ER_RPC, baseSlot, baseBlockTime: baseTime, erSlot, erBlockTime: erTime,
  program: PROGRAM.toBase58(), programData: programData.toBase58(), lastDeploySlot: lastDeploySlot.toString(), upgradeAuthority,
  programSo: { file: 'program/astrix_settlement.devnet.so', len: so.length, sha256: sha(Buffer.from(so)) },
  programDataLen: pd.length, baseProgramOwnedCount: baseOwned.length, erProgramOwnedCount: erOwned.length, erGpaError,
  note: 'Read-only RPC. ER and base reads are not atomic with each other; the cranks keep ticking between reads.',
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ summary, accounts: manifest }, null, 1));
const lines = manifest.filter((m) => m.exists).map((m) => `${m.sha256}  ${m.file}`);
lines.push(`${sha(Buffer.from(so))}  program/astrix_settlement.devnet.so`, `${sha(pd)}  program/programdata.full.bin`);
fs.writeFileSync(path.join(OUT, 'SHA256SUMS'), lines.join('\n') + '\n');
console.log(JSON.stringify(summary, null, 1));
console.log('accounts saved:', manifest.filter((m) => m.exists).length, 'missing:', manifest.filter((m) => !m.exists).length);
