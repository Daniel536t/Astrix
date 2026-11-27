// Devnet end-to-end test of world ownership v2 (run: npx tsx scripts/identity-test.ts).
// Uses fresh throwaway keys with 0 SOL; claims one free slot and releases it at the end.
// Checks: proof-of-work claim, passport binding, two-signer transfer, old key locked
// out, per-world rate limit, checkpoint rate limit, owner-only release.
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'node:crypto';

const P = new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy');
const A = new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32');
const MAGIC_PROGRAM = new PublicKey('Magic11111111111111111111111111111111111111');
const MAGIC_CONTEXT = new PublicKey('MagicContext1111111111111111111111111111111');
const FEE_VAULT = new PublicKey('ByZyZ6322wnM48vn1kVdrsGRLjiLU15t2gJUBdXL4MQb');
const er = new Connection('https://devnet-eu.magicblock.app', 'confirmed');
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, P)[0];
const registry = pda(Buffer.from('astrix-registry'), A.toBuffer());
const slotPda = (i: number) => pda(Buffer.from('world-slot'), A.toBuffer(), Buffer.from([i]));
const passportPda = (w: PublicKey) => pda(Buffer.from('passport'), w.toBuffer());
const treasury = pda(Buffer.from('checkpoint-treasury'), A.toBuffer());
const disc = (n: string) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const W = (k: PublicKey) => ({ pubkey: k, isSigner: false, isWritable: true });
const S = (k: PublicKey) => ({ pubkey: k, isSigner: true, isWritable: false });
const ERRS: Record<string, string> = { '0x1772': 'Unauthorised', '0x1775': 'NotOwner', '0x1780': 'SlotTaken', '0x1782': 'ProofOfWork', '0x1783': 'RateLimited', '0x7d1': 'ConstraintHasOne' };

let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, detail); if (!ok) failures++; };

async function send(name: string, args: Buffer, keys: TransactionInstruction['keys'], signers: Keypair[], extra: TransactionInstruction[] = [], wait = true) {
  const tx = new Transaction().add(...extra, new TransactionInstruction({ programId: P, keys, data: Buffer.concat([disc(name), args]) }));
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  try {
    const sig = await er.sendRawTransaction(tx.serialize());
    if (wait) {
      const r = await er.confirmTransaction(sig, 'confirmed');
      if (r.value.err) return { ok: false, err: JSON.stringify(r.value.err) };
    }
    return { ok: true, sig };
  } catch (e) {
    const code = String(e).match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? String(e).slice(0, 120);
    return { ok: false, err: ERRS[code] ?? code };
  }
}

function leadingZeroBits(d: Buffer) { let n = 0; for (const b of d) { if (b === 0) { n += 8; continue; } n += Math.clz32(b) - 24; break; } return n; }
function solvePow(guest: PublicKey, index: number, bits = 18) {
  const nonce = Buffer.alloc(8);
  for (let i = 0n; ; i++) {
    nonce.writeBigUInt64LE(i);
    if (leadingZeroBits(createHash('sha256').update(guest.toBuffer()).update(Buffer.from([index])).update(nonce).digest()) >= bits) return Buffer.from(nonce);
  }
}
const readWorld = async (w: PublicKey) => { const d = (await er.getAccountInfo(w))!.data; return { owner: new PublicKey(d.subarray(8, 40)), tick: Number(d.readBigUInt64LE(46)), wood: d.readUInt32LE(70), session: new PublicKey(d.subarray(188, 220)), actions: d.readBigUInt64LE(232) }; };
const readPassport = async (p: PublicKey) => { const d = (await er.getAccountInfo(p))!.data; return { kind: d[10], due: d[11] === 1, owner: new PublicKey(d.subarray(44, 76)), transfers: d.readUInt32LE(84), checkpoints: d.readUInt32LE(88), hash: d.subarray(108, 140).toString('hex') }; };

// 1. find a free slot
let index = -1;
for (let i = 0; i < 16; i++) { if ((await readWorld(slotPda(i))).owner.equals(PublicKey.default)) { index = i; break; } }
if (index < 0) throw new Error('no free slot to test with');
const world = slotPda(index), passport = passportPda(world);
const guest = Keypair.generate(), passkey = Keypair.generate(), mallory = Keypair.generate();
const claimKeys = (k: Keypair) => [W(registry), W(world), W(passport), S(k.publicKey)];
console.log('testing on slot', index, world.toBase58());

// 2. proof of work
const bad = Buffer.alloc(8); // nonce 0 is overwhelmingly unlikely to meet 18 bits
let r = await send('claim_world', Buffer.concat([Buffer.from([index]), bad]), claimKeys(guest), [guest]);
check('claim with weak proof of work is rejected', !r.ok && r.err === 'ProofOfWork', r.err);
const stolenNonce = solvePow(mallory.publicKey, index);
r = await send('claim_world', Buffer.concat([Buffer.from([index]), stolenNonce]), claimKeys(guest), [guest]);
check('a nonce solved for another key is rejected', !r.ok && r.err === 'ProofOfWork', r.err);
const t0 = Date.now(), nonce = solvePow(guest.publicKey, index);
console.log(`      solved PoW in ${Date.now() - t0} ms (node)`);
r = await send('claim_world', Buffer.concat([Buffer.from([index]), nonce]), claimKeys(guest), [guest]);
check('claim with valid proof of work succeeds (0 SOL key)', r.ok, r.err ?? r.sig);
let pp = await readPassport(passport);
check('passport records the guest as owner, kind guest', pp.owner.equals(guest.publicKey) && pp.kind === 0, pp.owner.toBase58());
r = await send('claim_world', Buffer.concat([Buffer.from([index]), solvePow(mallory.publicKey, index)]), claimKeys(mallory), [mallory]);
check('claiming an owned world is rejected', !r.ok && r.err === 'SlotTaken', r.err);

// 3. transfer to a passkey-derived key
const harvest = (k: Keypair, extra: TransactionInstruction[] = [], wait = true) => send('harvest', Buffer.from([0, 1, 0, 0, 0]), [W(world), S(k.publicKey)], [k], extra, wait);
r = await send('transfer_world', Buffer.from([1]), [W(world), W(passport), S(mallory.publicKey), S(passkey.publicKey)], [mallory, passkey]);
check('transfer signed by a non-owner is rejected', !r.ok && r.err === 'NotOwner', r.err);
r = await send('transfer_world', Buffer.from([1]), [W(world), W(passport), S(guest.publicKey), S(passkey.publicKey)], [guest, passkey]);
check('transfer signed by owner + new owner succeeds', r.ok, r.err ?? r.sig);
pp = await readPassport(passport);
check('passport now names the passkey owner, kind passkey, transfers 1, checkpoint due', pp.owner.equals(passkey.publicKey) && pp.kind === 1 && pp.transfers === 1 && pp.due, pp);
check('world owner moved to the passkey key', (await readWorld(world)).owner.equals(passkey.publicKey));
r = await harvest(guest);
check('old guest key can no longer act', !r.ok && r.err === 'Unauthorised', r.err);
r = await send('set_session', Buffer.concat([mallory.publicKey.toBuffer(), Buffer.alloc(8, 0xff), Buffer.from([10, 0, 0, 0])]), [W(world), S(guest.publicKey)], [guest]);
check('old guest key cannot set a session', !r.ok, r.err);
r = await harvest(passkey);
check('new owner can act', r.ok, r.err ?? r.sig);

// 4. checkpoint after transfer, then rate-limited
const cpKeys = [W(world), W(passport), W(treasury), W(FEE_VAULT), W(MAGIC_CONTEXT), { pubkey: MAGIC_PROGRAM, isSigner: false, isWritable: false }];
r = await send('checkpoint', Buffer.alloc(0), cpKeys, [mallory]);
pp = await readPassport(passport);
check('anyone can trigger the due checkpoint (0 SOL key)', r.ok && pp.checkpoints >= 1 && !pp.due, { err: r.err, checkpoints: pp.checkpoints });
const before = pp.checkpoints;
await send('checkpoint', Buffer.alloc(0), cpKeys, [mallory]);
check('a repeat checkpoint is a no-op (no treasury drain)', (await readPassport(passport)).checkpoints === before);

// 5. per-world rate limit: burst 50 actions inside one 10-tick window
for (;;) { const t = (await readWorld(world)).tick; if (t % 10 <= 2) break; await new Promise((res) => setTimeout(res, 1000)); }
const burst = await Promise.all(Array.from({ length: 50 }, (_, i) => harvest(passkey, [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 + i })], false)));
await new Promise((res) => setTimeout(res, 4000));
const sent = burst.filter((b) => b.ok).length, limited = burst.filter((b) => b.err === 'RateLimited').length;
const w = await readWorld(world);
const after = await harvest(passkey, [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]);
const sameWindow = Math.floor((await readWorld(world)).tick / 10) === Number(w.actions >> 32n);
check('burst of 50 actions: at most 40 counted in the window', (w.actions & 0xffffffffn) === 40n, { submitted: sent, preflightRateLimited: limited, windowCount: Number(w.actions & 0xffffffffn) });
check('the next action in the same window is rejected with RateLimited', !sameWindow || (!after.ok && after.err === 'RateLimited'), { sameWindow, err: after.err });

// 6. release: owner only
r = await send('release_world', Buffer.alloc(0), [W(world), W(passport), S(mallory.publicKey)], [mallory]);
check('release by a non-owner is rejected', !r.ok && r.err === 'NotOwner', r.err);
r = await send('release_world', Buffer.alloc(0), [W(world), W(passport), S(passkey.publicKey)], [passkey]);
check('owner can release their own world', r.ok && (await readWorld(world)).owner.equals(PublicKey.default), r.err ?? r.sig);
console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
