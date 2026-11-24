import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'node:crypto';
const P = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy'), A = new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32');
const er = new Connection('https://devnet-eu.magicblock.app', 'confirmed');
const reg = PublicKey.findProgramAddressSync([Buffer.from('astrix-registry'), A.toBuffer()], P)[0];
const slot0 = PublicKey.findProgramAddressSync([Buffer.from('world-slot'), A.toBuffer(), Buffer.from([0])], P)[0];
const mallory = Keypair.generate();
await new Promise((r) => setTimeout(r, 11000));
const tx = new Transaction().add(new TransactionInstruction({ programId: P, data: Buffer.concat([createHash('sha256').update('global:claim_world').digest().subarray(0, 8), Buffer.from([0])]),
  keys: [{ pubkey: reg, isSigner: false, isWritable: true }, { pubkey: slot0, isSigner: false, isWritable: true }, { pubkey: mallory.publicKey, isSigner: true, isWritable: false }] }));
tx.feePayer = mallory.publicKey; tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash; tx.sign(mallory);
try { await er.sendRawTransaction(tx.serialize()); console.log('UNEXPECTED: claim succeeded'); } catch (e) { console.log('rejected', String(e).match(/0x[0-9a-f]+/)?.[0]); }
