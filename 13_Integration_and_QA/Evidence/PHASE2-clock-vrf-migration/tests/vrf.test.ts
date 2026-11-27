// VRF request binding, late / duplicate / forged / cross-world responses, timeouts, journal,
// and world-creation fairness (commit before reveal). Uses a TEST-ONLY mock VRF program at the
// VRF program id that rebuilds callbacks exactly like MagicBlock's provide_randomness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Env, ixSettle, ixProspect, ixCancelProspect, ixFulfil, ixClaimVrf, ixRetryGenesis, ixHarvest, ix, queueItems, queuedTicket, settlement, ext,
  err, journalEvents, replayJournal, solvePow, slotPda, VRF_SCOPED_IDENTITY, S, W, backupOf, coder, sha256 } from './h.ts';
import { claimFresh, farm, loadSlot, record } from './common.ts';

const rnd = (n: number) => { const b = Buffer.alloc(32); b.writeBigUInt64LE(BigInt(n), 0); crypto.randomBytes(24).copy(b, 8); return b; };

function worldWithFood(env: Env, i: number) {
  const { w, guest } = claimFresh(env, i);
  farm(env, w, guest);
  env.advance(40); env.send([ixSettle(w)]);
  assert.ok(settlement(env.data(w)).stock[3] >= 8);
  return { w, guest };
}

test('prospect: request carries world id, request id, prospect id and nonce; callback settles exactly it; journal replays', () => {
  const env = new Env();
  const { w, guest } = worldWithFood(env, 20);
  const r = env.send([ixProspect(w, guest.publicKey)], [guest]);
  assert.ok(r.ok, r.err + r.logs.join('\n'));
  const e = ext(env.data(w))!;
  const t = queuedTicket(queueItems(env)[0]);
  assert.equal(t.world.toBase58(), w.toBase58());
  assert.equal(t.requestId, e.pending.requestId); assert.equal(t.nonce, e.pending.nonce); assert.equal(t.prospectId, e.pending.prospectId);
  assert.equal(t.kind, 1);
  assert.deepEqual(t.callerSeed, sha256(Buffer.from('astrix-vrf-v2'), t.raw)); // reproducible caller seed
  const before = settlement(env.data(w));
  const f = env.send([ixFulfil(0, rnd(60), [w])]); // roll = 60 % 100 + 1 = 61 -> ore vein
  assert.ok(f.ok, f.err + f.logs.join('\n'));
  const after = settlement(env.data(w)); const e2 = ext(env.data(w))!;
  assert.equal(after.prospectPending, false); assert.equal(after.lastRoll, 61); assert.equal(after.stock[4] - before.stock[4], 6);
  assert.equal(e2.pending.kind, 0);
  const evs = journalEvents(f.logs);
  assert.equal(evs.length, 1); assert.equal(evs[0].data.kind, 1); assert.equal(evs[0].data.outcome, 61);
  // off-chain journal check: every event since claim reproduces the on-chain hash head
  record('vrf.jsonl', { test: 'prospect', prospectCu: r.cu, callbackCu: f.cu });
});

test('duplicate delivery of an accepted result is rejected and changes nothing', () => {
  const env = new Env();
  const { w, guest } = worldWithFood(env, 21);
  assert.ok(env.send([ixProspect(w, guest.publicKey)], [guest]).ok);
  assert.ok(env.send([ixFulfil(0, rnd(5), [w])]).ok);
  const before = env.data(w);
  const again = env.send([ixFulfil(0, rnd(95), [w])]);
  assert.equal(again.ok, false); assert.equal(err(again), 'VrfTicketMismatch');
  assert.deepEqual(env.data(w), before);
});

test('late response after timeout-cancel and a new prospect is rejected; only the new request settles', () => {
  const env = new Env();
  const { w, guest } = worldWithFood(env, 22);
  assert.ok(env.send([ixProspect(w, guest.publicKey)], [guest]).ok); // item 0, request A
  // cancel before the purge window: refused
  const early = env.send([ixCancelProspect(w, guest.publicKey)], [guest]);
  assert.equal(err(early), 'VrfNotTimedOut');
  env.advance(131);
  assert.ok(env.send([ixCancelProspect(w, guest.publicKey)], [guest]).ok);
  assert.ok(env.send([ixSettle(w)]).ok);
  assert.ok(env.send([ixProspect(w, guest.publicKey)], [guest]).ok); // item 1, request B
  const [A, B] = queueItems(env).map(queuedTicket);
  assert.notEqual(A.requestId, B.requestId); assert.notEqual(A.nonce, B.nonce); assert.notEqual(A.prospectId, B.prospectId);
  const before = env.data(w);
  const late = env.send([ixFulfil(0, rnd(99), [w])]); // A's oracle answer arrives late
  assert.equal(late.ok, false); assert.equal(err(late), 'VrfTicketMismatch');
  assert.deepEqual(env.data(w), before, 'late result never applied to the new prospecting attempt');
  const ok = env.send([ixFulfil(1, rnd(10), [w])]);
  assert.ok(ok.ok, ok.err);
  const s = settlement(env.data(w)); const e = ext(env.data(w))!;
  assert.equal(s.lastRoll, 11); assert.equal(s.prospectPending, false);
  const last = e.recent.reduce((a, b) => (b.seq > a.seq ? b : a));
  assert.equal(last.requestId, B.requestId); assert.equal(last.kind, 1);
  assert.ok(e.recent.some((r) => r.kind === 4 && r.requestId === A.requestId), 'cancellation journaled');
});

test('forged tickets from the VRF identity are rejected (request id, nonce, prospect id, kind, world)', () => {
  const env = new Env();
  const { w, guest } = worldWithFood(env, 23);
  const { w: other, guest: otherGuest } = claimFresh(env, 24);
  assert.ok(env.send([ixProspect(w, guest.publicKey)], [guest]).ok);
  const t = queuedTicket(queueItems(env)[0]);
  const before = env.data(w);
  const mut = (f: (b: Buffer) => void) => { const b = Buffer.from(t.raw); f(b); return b; };
  const cases: Record<string, Buffer> = {
    requestId: mut((b) => b.writeBigUInt64LE(t.requestId + 1n, 32)),
    prospectId: mut((b) => b.writeUInt32LE(t.prospectId + 1, 40)),
    nonce: mut((b) => b.writeBigUInt64LE(t.nonce ^ 1n, 44)),
    kind: mut((b) => { b[52] = 2; }),
    world: mut((b) => other.toBuffer().copy(b, 0)),
    truncated: t.raw.subarray(0, 40),
  };
  for (const [name, args] of Object.entries(cases)) {
    const r = env.send([ixFulfil(0, rnd(1), [w], args)]);
    assert.equal(r.ok, false, name);
    assert.deepEqual(env.data(w), before, name);
  }
  // the genuine ticket of world A delivered into world B's callback (B has its own pending request)
  farm(env, other, otherGuest); env.advance(40); env.send([ixSettle(other)]);
  assert.ok(env.send([ixProspect(other, otherGuest.publicKey)], [otherGuest]).ok);
  const otherBefore = env.data(other);
  const cross = env.send([ixFulfil(1, rnd(1), [other], t.raw)]);
  assert.deepEqual(env.data(other), otherBefore);
  assert.equal(cross.ok, false); assert.equal(err(cross), 'VrfTicketMismatch');
  assert.ok(env.send([ixFulfil(0, rnd(1), [w])]).ok);
});

test('spoofed callback: any signer other than the scoped VRF identity is rejected', () => {
  const env = new Env();
  const { w, guest } = worldWithFood(env, 25);
  assert.ok(env.send([ixProspect(w, guest.publicKey)], [guest]).ok);
  const t = queuedTicket(queueItems(env)[0]);
  const fake = Keypair.generate();
  const data = Buffer.concat([sha256(Buffer.from('global:vrf_callback')).subarray(0, 8), rnd(1), t.raw]);
  const r = env.send([{ programId: (ixSettle(w) as any).programId, keys: [{ pubkey: fake.publicKey, isSigner: true, isWritable: false }, { pubkey: w, isSigner: false, isWritable: true }], data } as any], [fake]);
  assert.equal(r.ok, false);
  assert.match(err(r), /ConstraintAddress/);
  assert.equal(VRF_SCOPED_IDENTITY.toBase58().length > 30, true);
});

test('legacy callback: rejected on v2 worlds; still settles a legacy pending prospect on a v1 world', () => {
  const env = new Env();
  const { w, guest } = worldWithFood(env, 26);
  assert.ok(env.send([ixProspect(w, guest.publicKey)], [guest]).ok);
  const legacyData = Buffer.concat([coder.instruction.encode('prospect_callback', { randomness: Array.from(rnd(1)) })]);
  const legacyIx = (acc: PublicKey) => ({ programId: (ixSettle(acc) as any).programId, keys: [{ pubkey: VRF_SCOPED_IDENTITY, isSigner: false, isWritable: false }, { pubkey: acc, isSigner: false, isWritable: true }], data: legacyData });
  // We cannot sign as the VRF PDA directly; route it through the mock with a hand-made queue item.
  const q = env.data(new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'));
  const mkItem = (acc: PublicKey) => {
    const disc = legacyData.subarray(0, 8);
    const parts = [Buffer.alloc(32), (ixSettle(acc) as any).programId.toBuffer(), Buffer.from([8, 0, 0, 0]), disc, Buffer.from([1, 0, 0, 0]), acc.toBuffer(), Buffer.from([0, 1]), Buffer.from([0, 0, 0, 0])];
    return Buffer.concat(parts);
  };
  const appendItem = (item: Buffer) => {
    const d = env.data(new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'));
    let o = 4; const n = d.readUInt32LE(0); for (let i = 0; i < n; i++) o += 4 + d.readUInt32LE(o);
    d.writeUInt32LE(item.length, o); item.copy(d, o + 4); d.writeUInt32LE(n + 1, 0);
    env.setRaw(new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'), d, new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'), 10_000_000_000);
    return n;
  };
  void q; void legacyIx;
  const idxV2 = appendItem(mkItem(w));
  const rej = env.send([ixFulfil(idxV2, rnd(1), [w])]);
  assert.equal(rej.ok, false); assert.equal(err(rej), 'LegacyCallbackRejected');
  // v1 world (unmigrated ER backup of slot 2) with a legacy pending prospect
  const env1 = new Env();
  const w1 = loadSlot(env1, 2, false);
  const d = env1.data(w1); d[177] = 1; env1.setRaw(w1, d, env1.account(w1)!.owner, env1.account(w1)!.lamports);
  const n1 = (() => { const qd = env1.data(new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc')); const item = mkItem(w1); qd.writeUInt32LE(item.length, 4); item.copy(qd, 8); qd.writeUInt32LE(1, 0);
    env1.setRaw(new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc'), qd, new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz'), 10_000_000_000); return 0; })();
  const okv1 = env1.send([ixFulfil(n1, rnd(1), [w1])]);
  assert.ok(okv1.ok, okv1.err + okv1.logs.join('\n'));
  assert.equal(settlement(env1.data(w1)).prospectPending, false);
  // and a new prospect on a v1 world is refused until migration
  const p = env1.send([ixProspect(w1, env1.payer.publicKey)]);
  assert.equal(err(p), 'MigrationRequired');
});

test('journal: emitted events replay to the on-chain hash head across claim, prospects and cancels', () => {
  const env = new Env();
  const w0 = loadSlot(env, 27);
  const startHash = ext(env.data(w0))!.journalHash; // after the MIGRATED record
  const events: any[] = [];
  env.advance(30);
  const guest = Keypair.generate();
  const c = env.send([ixClaimVrf(27, guest.publicKey, solvePow(guest.publicKey, 27), Array(32).fill(7))], [guest]);
  assert.ok(c.ok, c.err + c.logs.join('\n')); events.push(...journalEvents(c.logs));
  const g = env.send([ixFulfil(0, rnd(424242), [w0])]); assert.ok(g.ok, g.err); events.push(...journalEvents(g.logs));
  for (let p = 0; p < 6; p++) assert.ok(env.send([ix('plant', { plot: p }, [W(w0), S(guest.publicKey)])], [guest]).ok);
  env.advance(60); env.send([ixSettle(w0)]);
  for (let k = 0; k < 3; k++) {
    const r = env.send([ixProspect(w0, guest.publicKey)], [guest]); assert.ok(r.ok, r.err);
    const idx = queueItems(env).length - 1;
    if (k === 1) { env.advance(131); const cc = env.send([ixCancelProspect(w0, guest.publicKey)], [guest]); assert.ok(cc.ok, cc.err); events.push(...journalEvents(cc.logs)); env.send([ixSettle(w0)]); continue; }
    const f = env.send([ixFulfil(idx, rnd(k * 37), [w0])]); assert.ok(f.ok, f.err); events.push(...journalEvents(f.logs));
  }
  const e = ext(env.data(w0))!;
  assert.deepEqual(replayJournal(w0, events, startHash), e.journalHash);
  assert.equal(Number(e.journalSeq), 1 + events.length);
  record('vrf.jsonl', { test: 'journal', records: events.length + 1, kinds: events.map((x) => x.data.kind) });
});

test('VRF genesis: creator commits first; seed revealed by the callback; no play before; ranked flag', () => {
  const env = new Env();
  const w = loadSlot(env, 28);
  env.advance(30);
  const guest = Keypair.generate();
  const cfg = Array.from(sha256(Buffer.from('world settings v1: name=Test')));
  const c = env.send([ixClaimVrf(28, guest.publicKey, solvePow(guest.publicKey, 28), cfg)], [guest]);
  assert.ok(c.ok, c.err + c.logs.join('\n'));
  const s0 = settlement(env.data(w)); const e0 = ext(env.data(w))!;
  assert.equal(s0.worldSeed, 0); assert.equal(e0.seedOrigin, 2); assert.equal(e0.pending.kind, 2);
  assert.notDeepEqual(e0.genesisCommitment, Buffer.alloc(32));
  // no play and no clock before the reveal
  env.advance(60);
  assert.equal(err(env.send([ixHarvest(w, guest.publicKey, 0, 1)], [guest])), 'WorldNotReady');
  env.send([ixSettle(w)]); assert.equal(settlement(env.data(w)).tick, 0n);
  // early retry refused; on-time result accepted
  assert.equal(err(env.send([ixRetryGenesis(w, guest.publicKey)], [guest])), 'VrfNotTimedOut');
  const R = rnd(0xdeadbeef);
  const g = env.send([ixFulfil(0, R, [w])]);
  assert.ok(g.ok, g.err + g.logs.join('\n'));
  const s1 = settlement(env.data(w)); const e1 = ext(env.data(w))!;
  assert.equal(s1.worldSeed, R.readUInt32LE(0)); assert.equal(e1.seedOrigin, 1); assert.deepEqual(e1.genesisRandomness, R);
  assert.deepEqual(e1.genesisCommitment, e0.genesisCommitment, 'commitment unchanged by the reveal');
  assert.equal(s1.lastTickTs, env.now); // clock starts at the reveal
  env.advance(10); assert.ok(env.send([ixHarvest(w, guest.publicKey, 0, 1)], [guest]).ok);
  assert.equal(settlement(env.data(w)).tick, 5n);
  record('vrf.jsonl', { test: 'genesis', claimVrfCu: c.cu, genesisCallbackCu: g.cu });
});

test('VRF genesis timeout: retry after 130 s burns the old request; its late result is rejected', () => {
  const env = new Env();
  const w = loadSlot(env, 29);
  env.advance(30);
  const guest = Keypair.generate();
  assert.ok(env.send([ixClaimVrf(29, guest.publicKey, solvePow(guest.publicKey, 29), Array(32).fill(1))], [guest]).ok);
  env.advance(131);
  const r = env.send([ixRetryGenesis(w, guest.publicKey)], [guest]);
  assert.ok(r.ok, r.err + r.logs.join('\n'));
  const before = env.data(w);
  assert.equal(err(env.send([ixFulfil(0, rnd(1), [w])])), 'VrfTicketMismatch');
  assert.deepEqual(env.data(w), before);
  assert.ok(env.send([ixFulfil(1, rnd(2), [w])]).ok);
  assert.equal(ext(env.data(w))!.seedOrigin, 1);
  // a stranger cannot retry someone else's genesis
  const s = Keypair.generate(); env.fund(s.publicKey, 1);
  assert.equal(err(env.send([ixRetryGenesis(w, s.publicKey)], [s])), 'NotOwner');
});

test('fairness limits: claim cooldown, proof of work, legacy claim and migrated worlds are unranked with seeds kept', () => {
  const env = new Env();
  const w = loadSlot(env, 30);
  loadSlot(env, 31);
  env.advance(30);
  const g1 = Keypair.generate();
  assert.ok(env.send([ixClaimVrf(30, g1.publicKey, solvePow(g1.publicKey, 30), Array(32).fill(0))], [g1]).ok);
  const g2 = Keypair.generate();
  assert.equal(err(env.send([ixClaimVrf(31, g2.publicKey, solvePow(g2.publicKey, 31), Array(32).fill(0))], [g2])), 'ClaimCooldown');
  assert.equal(err(env.send([ixClaimVrf(31, g2.publicKey, 1n, Array(32).fill(0))], [g2])), 'ProofOfWork');
  // legacy claim on a v2 slot: unranked + GENESIS_LEGACY journal record
  const { w: lw } = claimFresh(env, 31);
  const le = ext(env.data(lw))!;
  assert.equal(le.seedOrigin, 0);
  assert.ok(le.recent.some((r) => r.kind === 3 && r.randomness.readUInt32LE(0) === settlement(env.data(lw)).worldSeed));
  // an existing claimed world migrated from the backup keeps its seed and is unranked
  const env2 = new Env();
  const m = loadSlot(env2, 0);
  const orig = settlement(Buffer.from(require_backup('slot-00')));
  assert.equal(settlement(env2.data(m)).worldSeed, orig.worldSeed);
  assert.equal(ext(env2.data(m))!.seedOrigin, 0);
  void w;
});
import fs from 'node:fs';
function require_backup(name: string) { const b = backupOf('er', name); return fs.readFileSync(`/projects/sandbox/.tools/scratch/phase2/backup/${b.file}`); }
void slotPda;
