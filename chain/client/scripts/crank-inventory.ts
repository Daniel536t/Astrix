// MB004: read-only inventory of ASTrix's MagicBlock scheduled tasks (Hydra cranks) on the devnet ER.
// Usage: tsx scripts/crank-inventory.ts [extraTaskId ...]
// Derives each crank PDA the way validator 2.x does (task-scheduler/src/crank.rs):
//   seed = sha256(authority || task_id as i64 LE); crank = PDA([b"crank", seed], hydra-ephemeral program).
// Reads the crank header (hydra-api/src/state.rs) and the scheduled instructions in its region.
// Sends no transactions. Never prints secret keys.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const ER_RPC = process.env.ASTRIX_ER_RPC ?? 'https://devnet-eu.magicblock.app';
const HYDRA_EPHEMERAL = new PublicKey('eHyd5BU8QffvHi4GnXwxrK4WpS7pM2x9UGKHBWii7mf');
const PROGRAM_ID = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy');
const walletFile = process.env.ASTRIX_WALLET ?? '/projects/sandbox/.tools/wallets/astrix-devnet.json';
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf8')))).publicKey;
const er = new Connection(ER_RPC, 'confirmed');

const known = [742001, 742101, 742117, 743000, 743008, 743016, 743024];
const extra = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const ids = [...new Set([...known, ...extra])];

export function crankPda(auth: PublicKey, taskId: number | bigint): PublicKey {
  const le = Buffer.alloc(8); le.writeBigInt64LE(BigInt(taskId));
  const seed = crypto.createHash('sha256').update(Buffer.concat([auth.toBuffer(), le])).digest();
  return PublicKey.findProgramAddressSync([Buffer.from('crank'), seed], HYDRA_EPHEMERAL)[0];
}

const u64 = (b: Buffer, o: number) => b.readBigUInt64LE(o);
function decode(d: Buffer) {
  const h = {
    authority: new PublicKey(d.subarray(0, 32)).toBase58(),
    nextExecSlot: u64(d, 64), intervalSlots: u64(d, 72), remaining: u64(d, 80),
    priorityTip: u64(d, 88), executed: u64(d, 96), rentMin: u64(d, 104),
    regionLen: d.readUInt16LE(112), bump: d[114], cuLimit: d.readUInt32LE(115), authoritySigner: d[119],
  };
  // Region: consecutive [u16 nAcc][33*nAcc metas][32 program][u16 dataLen][data].
  const ixs: { program: string; accounts: string[]; data: string }[] = [];
  let o = 120; const end = 120 + h.regionLen;
  while (o < end) {
    const n = d.readUInt16LE(o); o += 2;
    const accounts = [];
    for (let i = 0; i < n; i++) { accounts.push((d[o] & 2 ? 'w:' : 'r:') + new PublicKey(d.subarray(o + 1, o + 33)).toBase58()); o += 33; }
    const program = new PublicKey(d.subarray(o, o + 32)).toBase58(); o += 32;
    const dl = d.readUInt16LE(o); o += 2;
    const data = d.subarray(o, o + dl).toString('hex'); o += dl;
    ixs.push({ program, accounts, data });
  }
  return { ...h, ixs };
}

const slot = await er.getSlot('confirmed');
const blockTime = await er.getBlockTime(slot).catch(() => null);
console.log(JSON.stringify({ er: ER_RPC, authority: authority.toBase58(), currentSlot: slot, blockTime }, null, 0));
for (const id of ids) {
  const pda = crankPda(authority, id);
  const info = await er.getAccountInfo(pda);
  if (!info) { console.log(JSON.stringify({ taskId: id, crank: pda.toBase58(), exists: false })); continue; }
  const c = decode(Buffer.from(info.data));
  const slotsLeft = c.remaining === 0xffffffffffffffffn ? null : Number(c.remaining) * Number(c.intervalSlots);
  console.log(JSON.stringify({
    taskId: id, crank: pda.toBase58(), owner: info.owner.toBase58(), lamports: info.lamports, dataLen: info.data.length,
    authority: c.authority, nextExecSlot: c.nextExecSlot.toString(), overdueSlots: slot - Number(c.nextExecSlot),
    intervalSlots: c.intervalSlots.toString(), remaining: c.remaining.toString(), executed: c.executed.toString(),
    cuLimit: c.cuLimit, priorityTip: c.priorityTip.toString(), authoritySigner: c.authoritySigner,
    slotsUntilExhausted: slotsLeft,
    ixCount: c.ixs.length,
    ixs: c.ixs.map((ix) => ({ program: ix.program === PROGRAM_ID.toBase58() ? 'astrix' : ix.program, data: ix.data, accounts: ix.accounts })),
  }));
}
