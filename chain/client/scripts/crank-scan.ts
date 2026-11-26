// MB004: read-only scan for every Hydra crank on the devnet ER whose first scheduled
// instruction targets the ASTrix program (tick: program id at offset 155; checkpoint: 320).
// Usage: tsx scripts/crank-scan.ts. Sends no transactions.
import { Connection, PublicKey } from '@solana/web3.js';

const er = new Connection(process.env.ASTRIX_ER_RPC ?? 'https://devnet-eu.magicblock.app', 'confirmed');
const HYDRA = new PublicKey('eHyd5BU8QffvHi4GnXwxrK4WpS7pM2x9UGKHBWii7mf');
const PROGRAM = 'Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy';
for (const offset of [155, 320]) {
  try {
    const accs = await er.getProgramAccounts(HYDRA, { filters: [{ memcmp: { offset, bytes: PROGRAM } }] });
    for (const a of accs) {
      const d = Buffer.from(a.account.data);
      console.log(JSON.stringify({ offset, crank: a.pubkey.toBase58(), len: d.length, nextExecSlot: d.readBigUInt64LE(64).toString(),
        intervalSlots: d.readBigUInt64LE(72).toString(), remaining: d.readBigUInt64LE(80).toString(), executed: d.readBigUInt64LE(96).toString() }));
    }
    console.log(JSON.stringify({ offset, count: accs.length }));
  } catch (e) { console.log(JSON.stringify({ offset, error: String(e).slice(0, 300) })); }
}
