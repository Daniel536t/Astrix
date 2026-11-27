import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'node:crypto';
const P = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy'), A = new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32');
const er = new Connection('https://devnet-eu.magicblock.app', 'confirmed');
const d = (n: string) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const reg = PublicKey.findProgramAddressSync([Buffer.from('astrix-registry'), A.toBuffer()], P)[0];
const slot = (i: number) => PublicKey.findProgramAddressSync([Buffer.from('world-slot'), A.toBuffer(), Buffer.from([i])], P)[0];
const identity = PublicKey.findProgramAddressSync([Buffer.from('identity')], P)[0];
const g = Keypair.generate();
async function send(data: Buffer, keys: TransactionInstruction['keys']) {
  const tx = new Transaction().add(new TransactionInstruction({ programId: P, keys, data }));
  tx.feePayer = g.publicKey; tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash; tx.sign(g);
  try { const s = await er.sendRawTransaction(tx.serialize()); await er.confirmTransaction(s, 'confirmed'); return s; } catch (e) { return 'ERR ' + String(e).slice(0, 200); }
}
let i = 2; for (; i < 16; i++) { const info = await er.getAccountInfo(slot(i)); if (new PublicKey(info!.data.subarray(8, 40)).equals(PublicKey.default)) break; }
console.log('claim', i, await send(Buffer.concat([d('claim_world'), Buffer.from([i])]), [{ pubkey: reg, isSigner: false, isWritable: true }, { pubkey: slot(i), isSigner: false, isWritable: true }, { pubkey: g.publicKey, isSigner: true, isWritable: false }]));
for (const p of [0, 1, 2, 3, 4, 5]) await send(Buffer.concat([d('plant'), Buffer.from([p])]), [{ pubkey: slot(i), isSigner: false, isWritable: true }, { pubkey: g.publicKey, isSigner: true, isWritable: false }]);
await new Promise((r) => setTimeout(r, 14000));
const food = (await er.getAccountInfo(slot(i)))!.data.readUInt32LE(8 + 74); console.log('food', food);
console.log('prospect', await send(Buffer.concat([d('prospect'), Buffer.from([7])]), [
  { pubkey: g.publicKey, isSigner: true, isWritable: true }, { pubkey: slot(i), isSigner: false, isWritable: true },
  { pubkey: new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'), isSigner: false, isWritable: true },
  { pubkey: identity, isSigner: false, isWritable: false }, { pubkey: new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'), isSigner: false, isWritable: false },
  { pubkey: new PublicKey('SysvarS1otHashes111111111111111111111111111'), isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }]));
await new Promise((r) => setTimeout(r, 15000));
const dd = (await er.getAccountInfo(slot(i)))!.data, o = 8;
console.log('after: prospects', dd.readUInt32LE(o + 171), 'pending', dd[o + 170], 'find', dd[o + 175], 'roll', dd[o + 176], 'ore', dd.readUInt32LE(o + 78), 'guest balance', await er.getBalance(g.publicKey));
