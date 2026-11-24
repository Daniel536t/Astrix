// End-to-end guest test: two brand-new keypairs with ZERO SOL each claim their
// own world on the ER, act on it, and must not be able to touch the other's world
// or any admin instruction. Keys live only in this process (like a browser tab).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(fs.readFileSync(path.join(here, '../../idl/astrix_settlement.json'), 'utf8'));
const PROGRAM_ID = new PublicKey(idl.address);
const ADMIN = new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32');
const er = new Connection('https://devnet-eu.magicblock.app', 'confirmed');
const registry = PublicKey.findProgramAddressSync([Buffer.from('astrix-registry'), ADMIN.toBuffer()], PROGRAM_ID)[0];
const slot = (i: number) => PublicKey.findProgramAddressSync([Buffer.from('world-slot'), ADMIN.toBuffer(), Buffer.from([i])], PROGRAM_ID)[0];
const disc = (name: string) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);

async function send(signer: Keypair, data: Buffer, keys: TransactionInstruction['keys']) {
  const tx = new Transaction().add(new TransactionInstruction({ programId: PROGRAM_ID, keys, data }));
  tx.feePayer = signer.publicKey; // the guest pays its own (zero) ER fee
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  tx.sign(signer);
  try {
    const sig = await er.sendRawTransaction(tx.serialize());
    await er.confirmTransaction(sig, 'confirmed');
    return { ok: true, sig };
  } catch (e) {
    const m = String((e as Error).message);
    return { ok: false, err: (m.match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? m).slice(0, 120) };
  }
}
const u8 = (n: number) => Buffer.from([n]);
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
async function freeSlot(skip: Set<number>) {
  for (let i = 0; i < 16; i++) {
    if (skip.has(i)) continue;
    const info = await er.getAccountInfo(slot(i));
    if (info && new PublicKey(info.data.subarray(8, 40)).equals(PublicKey.default)) return i;
  }
  throw new Error('no free slot');
}
async function read(i: number) {
  const d = (await er.getAccountInfo(slot(i)))!.data;
  const o = 8;
  return { owner: new PublicKey(d.subarray(o, o + 32)).toBase58(), seed: d.readUInt32LE(o + 32), tick: Number(d.readBigUInt64LE(o + 38)),
    wood: d.readUInt32LE(o + 62), stone: d.readUInt32LE(o + 66), food: d.readUInt32LE(o + 74), seedStock: d.readUInt32LE(o + 82), planks: d.readUInt32LE(o + 86),
    pop: d.readUInt16LE(o + 166), sawmill: d[o + 168] === 1 };
}

const result: Record<string, unknown> = {};
const alice = Keypair.generate(), bob = Keypair.generate();
result.balances = { alice: await er.getBalance(alice.publicKey), bob: await er.getBalance(bob.publicKey) };
const used = new Set<number>();
const ia = await freeSlot(used); used.add(ia);
result.aliceClaim = { slot: ia, ...(await send(alice, Buffer.concat([disc('claim_world'), u8(ia)]), [
  { pubkey: registry, isSigner: false, isWritable: true }, { pubkey: slot(ia), isSigner: false, isWritable: true },
  { pubkey: alice.publicKey, isSigner: true, isWritable: false }])) };
result.bobTooSoon = await send(bob, Buffer.concat([disc('claim_world'), u8(await freeSlot(used))]), [
  { pubkey: registry, isSigner: false, isWritable: true }, { pubkey: slot(await freeSlot(used)), isSigner: false, isWritable: true },
  { pubkey: bob.publicKey, isSigner: true, isWritable: false }]);
await new Promise((r) => setTimeout(r, 11_000)); // registry cooldown is 10 s
const ib = await freeSlot(used); used.add(ib);
result.bobClaim = { slot: ib, ...(await send(bob, Buffer.concat([disc('claim_world'), u8(ib)]), [
  { pubkey: registry, isSigner: false, isWritable: true }, { pubkey: slot(ib), isSigner: false, isWritable: true },
  { pubkey: bob.publicKey, isSigner: true, isWritable: false }])) };
result.bobStealsAlice = await send(bob, Buffer.concat([disc('claim_world'), u8(ia)]), [
  { pubkey: registry, isSigner: false, isWritable: true }, { pubkey: slot(ia), isSigner: false, isWritable: true },
  { pubkey: bob.publicKey, isSigner: true, isWritable: false }]);
const act = (who: Keypair, i: number, name: string, args: Buffer = Buffer.alloc(0)) =>
  send(who, Buffer.concat([disc(name), args]), [{ pubkey: slot(i), isSigner: false, isWritable: true }, { pubkey: who.publicKey, isSigner: true, isWritable: false }]);
// Alice: farmer. Bob: builder.
result.alicePlant = [await act(alice, ia, 'plant', u8(0)), await act(alice, ia, 'plant', u8(1)), await act(alice, ia, 'plant', u8(2))].map((r) => r.ok);
result.bobSawmill = (await act(bob, ib, 'build_sawmill')).ok;
result.bobHarvest = (await act(bob, ib, 'harvest', Buffer.concat([u8(0), u32(4)]))).ok;
result.bobPlantsInAlice = await act(bob, ia, 'plant', u8(3));
result.bobResetsAlice = await send(bob, Buffer.concat([disc('reset_world'), u8(ia)]), [
  { pubkey: registry, isSigner: false, isWritable: false }, { pubkey: slot(ia), isSigner: false, isWritable: true },
  { pubkey: bob.publicKey, isSigner: true, isWritable: false }]);
result.balancesAfter = { alice: await er.getBalance(alice.publicKey), bob: await er.getBalance(bob.publicKey) };
result.worldsNow = { alice: await read(ia), bob: await read(ib) };
await new Promise((r) => setTimeout(r, 20_000));
result.worldsAfter20s = { alice: await read(ia), bob: await read(ib) };
console.log(JSON.stringify(result, null, 2));
