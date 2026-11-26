// MB004: read-only observation of recent ER transactions touching an account.
// Usage: tsx scripts/crank-observe.ts <account|slot:N|settlement> [limit=10]
// Prints signature, time, fee payer, top-level programs, and the program's "tick ..." log lines.
import fs from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const er = new Connection(process.env.ASTRIX_ER_RPC ?? 'https://devnet-eu.magicblock.app', 'confirmed');
const PROGRAM_ID = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy');
const walletFile = process.env.ASTRIX_WALLET ?? '/projects/sandbox/.tools/wallets/astrix-devnet.json';
const owner = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletFile, 'utf8')))).publicKey;
const slotPda = (i: number) => PublicKey.findProgramAddressSync([Buffer.from('world-slot'), owner.toBuffer(), Buffer.from([i])], PROGRAM_ID)[0];
const settlementPda = PublicKey.findProgramAddressSync([Buffer.from('astrix-settlement'), owner.toBuffer()], PROGRAM_ID)[0];

const arg = process.argv[2] ?? 'settlement';
const limit = Number(process.argv[3] ?? 10);
if (arg === 'map') {
  for (let i = 0; i < 32; i++) console.log(i, slotPda(i).toBase58());
  process.exit(0);
}
const target = arg === 'settlement' ? settlementPda : arg.startsWith('slot:') ? slotPda(Number(arg.slice(5))) : new PublicKey(arg);
const sigs = await er.getSignaturesForAddress(target, { limit });
console.log(JSON.stringify({ target: target.toBase58(), count: sigs.length }));
for (const s of sigs) {
  const tx = await er.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  const keys = tx?.transaction.message.staticAccountKeys ?? [];
  const nsig = tx?.transaction.message.header.numRequiredSignatures ?? 0;
  const programs = (tx?.transaction.message.compiledInstructions ?? []).map((ix) => keys[ix.programIdIndex]?.toBase58().slice(0, 8));
  const ticks = (tx?.meta?.logMessages ?? []).filter((l) => l.includes('tick ')).map((l) => l.replace('Program log: ', ''));
  console.log(JSON.stringify({
    sig: s.signature, time: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null, slot: s.slot, err: s.err,
    signers: keys.slice(0, nsig).map((k) => k.toBase58()), programs, fee: tx?.meta?.fee, cu: tx?.meta?.computeUnitsConsumed,
    ticks: ticks.slice(0, 3), nTickLogs: ticks.length,
  }));
}
