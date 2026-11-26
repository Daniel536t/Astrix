// ASTrix chain operator CLI (devnet). Usage: tsx scripts/astrix.ts <command> [args]
//   status                     read the settlement on Solana and on the ER
//   init <seed> <gen>          found the settlement on Solana (base layer)
//   delegate                   delegate it to the ER validator
//   plant <plot>               plant a seed (ER)
//   sawmill                    build the sawmill (ER)
//   harvest <res> <n>          gather a resource (ER)
//   session <secs> <budget>    authorise a fresh session key (ER); prints its public key only
//   session-harvest <res> <n>  harvest signed by the stored session key (ER)
//   schedule <taskId> <ms> <n> schedule the tick crank (ER)
//   prospect                   request VRF prospecting (ER)
//   commit                     commit settlement state to Solana (ER -> base)
//   undelegate                 commit and return the settlement to Solana
//   setup-worlds <n>           registry + n pre-funded world slots, delegated (idempotent)
//   setup-passports <n>        one passport per slot, delegated (idempotent)
//   link-passports <n>         copy owners of worlds claimed before passports existed
//   setup-treasury <sol>       create, fund and delegate the checkpoint treasury
//   schedule-worlds <task> <ms> <count> [from] [iterations]   tick crank for up to 16 slots
//   cancel-task <taskId>       cancel a scheduled task owned by this wallet (ER)
//   schedule-checkpoints <from> <task> <ms>      checkpoint crank for 8 slots
//   checkpoint <slot>          run a checkpoint now (no-op unless due)
//   worlds <n> / passports <n> tables of world and passport state
// Keys are read from ASTRIX_WALLET (never printed, never written to the repo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  DELEGATION_PROGRAM_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID,
  delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
} from '@magicblock-labs/ephemeral-rollups-sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const idl = JSON.parse(fs.readFileSync(path.join(here, '../../idl/astrix_settlement.json'), 'utf8'));
const PROGRAM_ID = new PublicKey(idl.address);
export const BASE_RPC = process.env.ASTRIX_BASE_RPC ?? 'https://api.devnet.solana.com';
export const ER_RPC = process.env.ASTRIX_ER_RPC ?? 'https://devnet-eu.magicblock.app';
export const ER_VALIDATOR = new PublicKey(process.env.ASTRIX_ER_VALIDATOR ?? 'MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e');
const VRF_PROGRAM = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const EPHEMERAL_QUEUE = new PublicKey('5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc');
const SLOT_HASHES = new PublicKey('SysvarS1otHashes111111111111111111111111111');
const BN: any = (anchor as any).BN ?? (anchor as any).default?.BN;
const RES = { wood: 0, stone: 1, fiber: 2, food: 3, ore: 4, seed: 5, planks: 6, crystal: 7 } as const;

function loadKey(file: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, 'utf8'))));
}
const walletFile = process.env.ASTRIX_WALLET ?? '/projects/sandbox/.tools/wallets/astrix-devnet.json';
const sessionFile = process.env.ASTRIX_SESSION ?? '/projects/sandbox/.tools/wallets/astrix-session.json';
const owner = loadKey(walletFile);

const base = new Connection(BASE_RPC, 'confirmed');
const er = new Connection(ER_RPC, { commitment: 'confirmed', wsEndpoint: ER_RPC.replace('https', 'wss') });
const program = (conn: Connection, kp = owner) =>
  new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: 'confirmed' }));

export const settlementPda = (who: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from('astrix-settlement'), who.toBuffer()], PROGRAM_ID)[0];
const PROGRAM_IDENTITY = PublicKey.findProgramAddressSync([Buffer.from('identity')], PROGRAM_ID)[0];

async function read(conn: Connection) {
  const info = await conn.getAccountInfo(settlementPda(owner.publicKey));
  if (!info) return null;
  const s: any = program(conn).coder.accounts.decode('settlement', info.data);
  return {
    accountOwner: info.owner.toBase58(),
    tick: Number(s.tick), lastTickTs: Number(s.lastTickTs),
    stock: Object.fromEntries(Object.entries(RES).map(([k, i]) => [k, s.stock[i]])),
    plots: s.plots.map((p: any) => (p.toString() === '18446744073709551615' ? null : Number(p))),
    population: s.population, sawmill: s.sawmill, prospects: s.prospects,
    prospectPending: s.prospectPending, lastFind: ['nothing', 'ore vein', 'rare crystal'][s.lastFind], lastRoll: s.lastRoll,
    rareFinds: s.rareFinds, sessionKey: s.sessionKey.toBase58(), sessionBudget: s.sessionBudget,
    sessionExpires: Number(s.sessionExpires), worldSeed: s.worldSeed, generator: s.generator,
  };
}

async function erSend(ix: anchor.web3.TransactionInstruction, signers: Keypair[] = [owner]) {
  const tx = new Transaction().add(ix);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await er.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sig = await er.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await er.confirmTransaction(sig, 'confirmed');
  return sig;
}

const settlement = settlementPda(owner.publicKey);
const registryPda = PublicKey.findProgramAddressSync([Buffer.from('astrix-registry'), owner.publicKey.toBuffer()], PROGRAM_ID)[0];
const slotPda = (i: number) => PublicKey.findProgramAddressSync([Buffer.from('world-slot'), owner.publicKey.toBuffer(), Buffer.from([i])], PROGRAM_ID)[0];
const passportPda = (world: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from('passport'), world.toBuffer()], PROGRAM_ID)[0];
const treasuryPda = PublicKey.findProgramAddressSync([Buffer.from('checkpoint-treasury'), owner.publicKey.toBuffer()], PROGRAM_ID)[0];
const FEE_VAULT = new PublicKey(process.env.ASTRIX_FEE_VAULT ?? 'ByZyZ6322wnM48vn1kVdrsGRLjiLU15t2gJUBdXL4MQb');
const delegationAccounts = (pda: PublicKey) => ({
  bufferPda: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM_ID),
  delegationRecordPda: delegationRecordPdaFromDelegatedAccount(pda),
  delegationMetadataPda: delegationMetadataPdaFromDelegatedAccount(pda),
  ownerProgram: PROGRAM_ID, delegationProgram: DELEGATION_PROGRAM_ID, systemProgram: SystemProgram.programId,
});
const validatorMeta = [{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }];
const [cmd, a1, a2, a3] = process.argv.slice(2);
const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));
const erTx = (sig: string) => ({ sig, explorer: `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(ER_RPC)}` });
const baseTx = (sig: string) => ({ sig, explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });

if (cmd === 'setup-worlds') {
  // Base layer, admin: registry + N empty slots, all delegated to the ER.
  const n = Number(a1 ?? 16), cooldown = Number(a2 ?? 10);
  const log: string[] = [];
  if (!(await base.getAccountInfo(registryPda))) {
    log.push(await program(base).methods.initRegistry(n, new BN(cooldown)).accountsPartial({ registry: registryPda, admin: owner.publicKey, systemProgram: SystemProgram.programId }).rpc());
    log.push(await program(base).methods.delegateRegistry().accountsPartial({ payer: owner.publicKey, pda: registryPda, ...delegationAccounts(registryPda) }).remainingAccounts(validatorMeta).rpc());
  }
  const pause = () => new Promise((r) => setTimeout(r, 1500));
  for (let i = 0; i < n; i++) {
    await pause();
    const pda = slotPda(i);
    const info = await base.getAccountInfo(pda);
    if (!info) log.push(await program(base).methods.initSlot(i).accountsPartial({ slot: pda, admin: owner.publicKey, systemProgram: SystemProgram.programId }).rpc());
    if (!info) await pause();
    if (!info || info.owner.equals(PROGRAM_ID)) log.push(await program(base).methods.delegateSlot(i).accountsPartial({ payer: owner.publicKey, pda, ...delegationAccounts(pda) }).remainingAccounts(validatorMeta).rpc());
  }
  out({ registry: registryPda.toBase58(), slots: Array.from({ length: n }, (_, i) => slotPda(i).toBase58()), transactions: log.length });
} else if (cmd === 'schedule-worlds') {
  // schedule-worlds <taskId> <ms> <count> [from] [iterations]: one crank ticks slots [from, from+count), count <= 16.
  // Re-using an existing taskId replaces that crank (validator 2.x: cancel + create in one transaction).
  const n = Number(a3 ?? 16), from = Number(process.argv[6] ?? 0), iterations = Number(process.argv[7] ?? 200000);
  const ix = await program(er).methods.scheduleWorldTicks(new BN(a1 ?? 742101), new BN(a2 ?? 2000), new BN(iterations))
    .accountsPartial({ magicProgram: MAGIC_PROGRAM_ID, payer: owner.publicKey, registry: registryPda, program: PROGRAM_ID })
    .remainingAccounts(Array.from({ length: n }, (_, i) => ({ pubkey: slotPda(from + i), isSigner: false, isWritable: true }))).instruction();
  out(erTx(await erSend(ix)));
} else if (cmd === 'commit-worlds') {
  const n = Number(a1 ?? 16);
  const ix = await program(er).methods.commitWorlds()
    .accountsPartial({ payer: owner.publicKey, registry: registryPda, magicProgram: MAGIC_PROGRAM_ID, magicContext: MAGIC_CONTEXT_ID })
    .remainingAccounts(Array.from({ length: n }, (_, i) => ({ pubkey: slotPda(i), isSigner: false, isWritable: true }))).instruction();
  out(erTx(await erSend(ix)));
} else if (cmd === 'setup-passports') {
  // Base layer, admin: one passport per world slot, delegated next to its world.
  const n = Number(a1 ?? 16);
  const pause = () => new Promise((r) => setTimeout(r, 1500));
  const log: string[] = [];
  for (let i = 0; i < n; i++) {
    const pda = passportPda(slotPda(i));
    const info = await base.getAccountInfo(pda);
    if (!info) { log.push(await program(base).methods.initPassport(i).accountsPartial({ world: slotPda(i), passport: pda, admin: owner.publicKey, systemProgram: SystemProgram.programId }).rpc()); await pause(); }
    if (!info || info.owner.equals(PROGRAM_ID)) log.push(await program(base).methods.delegatePassport(i).accountsPartial({ payer: owner.publicKey, world: slotPda(i), pda, ...delegationAccounts(pda) }).remainingAccounts(validatorMeta).rpc());
    await pause();
  }
  out({ passports: Array.from({ length: n }, (_, i) => passportPda(slotPda(i)).toBase58()), transactions: log.length });
} else if (cmd === 'link-passports') {
  const n = Number(a1 ?? 16);
  const sigs = [];
  for (let i = 0; i < n; i++) {
    const ix = await program(er).methods.linkPassport().accountsPartial({ world: slotPda(i), passport: passportPda(slotPda(i)) }).instruction();
    sigs.push(await erSend(ix));
  }
  out({ linked: sigs.length });
} else if (cmd === 'setup-treasury') {
  // Base layer, admin: create the checkpoint treasury, fund it, delegate it.
  const lamports = Math.round(Number(a1 ?? 0.2) * 1e9);
  const log: string[] = [];
  if (!(await base.getAccountInfo(treasuryPda))) log.push(await program(base).methods.initTreasury().accountsPartial({ treasury: treasuryPda, admin: owner.publicKey, systemProgram: SystemProgram.programId }).rpc());
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: treasuryPda, lamports }));
  log.push(await anchor.web3.sendAndConfirmTransaction(base, tx, [owner]));
  log.push(await program(base).methods.delegateTreasury().accountsPartial({ payer: owner.publicKey, pda: treasuryPda, ...delegationAccounts(treasuryPda) }).remainingAccounts(validatorMeta).rpc());
  out({ treasury: treasuryPda.toBase58(), lamports, log });
} else if (cmd === 'checkpoint') {
  const w = slotPda(Number(a1 ?? 0));
  const ix = await program(er).methods.checkpoint().accountsPartial({
    world: w, passport: passportPda(w), treasury: treasuryPda, magicFeeVault: FEE_VAULT,
    magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID,
  }).instruction();
  out(erTx(await erSend(ix)));
} else if (cmd === 'schedule-checkpoints') {
  // ER, admin: crank `checkpoint` for slots [from, from+8). Each run is a no-op unless a world is due.
  const from = Number(a1 ?? 0), task = Number(a2 ?? 743000 + from), ms = Number(a3 ?? 60000);
  const metas = [];
  for (let i = from; i < from + 8; i++) {
    metas.push({ pubkey: slotPda(i), isSigner: false, isWritable: true }, { pubkey: passportPda(slotPda(i)), isSigner: false, isWritable: true });
  }
  const ix = await program(er).methods.scheduleCheckpoints(new BN(task), new BN(ms), new BN(1_000_000))
    .accountsPartial({ magicProgram: MAGIC_PROGRAM_ID, payer: owner.publicKey, registry: registryPda, treasury: treasuryPda,
      magicFeeVault: FEE_VAULT, magicContext: MAGIC_CONTEXT_ID, program: PROGRAM_ID })
    .remainingAccounts(metas).instruction();
  out({ task, ...erTx(await erSend(ix)) });
} else if (cmd === 'passports') {
  const n = Number(a1 ?? 16);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const pp = passportPda(slotPda(i));
    const [ei, bi] = [await er.getAccountInfo(pp), await base.getAccountInfo(pp)];
    if (!ei) { rows.push({ i, missing: true }); continue; }
    const p: any = program(er).coder.accounts.decode('passport', ei.data);
    rows.push({ i, owner: p.owner.toBase58().slice(0, 8), kind: p.identityKind, checkpoints: p.checkpoints, lastTick: Number(p.lastCheckpointTick),
      due: p.checkpointDue, hash: Buffer.from(p.stateHash).toString('hex').slice(0, 12), base: bi ? (bi.owner.equals(DELEGATION_PROGRAM_ID) ? 'delegated' : bi.owner.toBase58().slice(0, 6)) : 'none' });
  }
  console.table(rows);
} else if (cmd === 'worlds') {
  const n = Number(a1 ?? 16);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const info = await er.getAccountInfo(slotPda(i));
    if (!info) { rows.push({ i, missing: true }); continue; }
    const w: any = program(er).coder.accounts.decode('settlement', info.data);
    rows.push({ i, owner: w.owner.toBase58().slice(0, 8), seed: w.worldSeed, tick: Number(w.tick), pop: w.population, food: w.stock[3], wood: w.stock[0], planks: w.stock[6], sawmill: w.sawmill, plots: w.plots.filter((p: any) => p.toString() !== '18446744073709551615').length });
  }
  console.table(rows);
} else if (cmd === 'status') {
  out({ owner: owner.publicKey.toBase58(), settlement: settlement.toBase58(), base: await read(base), er: await read(er) });
} else if (cmd === 'init') {
  const sig = await program(base).methods.initialize(Number(a1 ?? 1337), Number(a2 ?? 2), new BN(2))
    .accountsPartial({ settlement, owner: owner.publicKey, systemProgram: SystemProgram.programId }).rpc();
  out(baseTx(sig));
} else if (cmd === 'delegate') {
  const sig = await program(base).methods.delegate().accountsPartial({
    payer: owner.publicKey, pda: settlement,
    bufferPda: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(settlement, PROGRAM_ID),
    delegationRecordPda: delegationRecordPdaFromDelegatedAccount(settlement),
    delegationMetadataPda: delegationMetadataPdaFromDelegatedAccount(settlement),
    ownerProgram: PROGRAM_ID, delegationProgram: DELEGATION_PROGRAM_ID, systemProgram: SystemProgram.programId,
  }).remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }]).rpc();
  out(baseTx(sig));
} else if (cmd === 'plant' || cmd === 'sawmill' || cmd === 'harvest' || cmd === 'session-harvest') {
  const signer = cmd === 'session-harvest' ? loadKey(sessionFile) : owner;
  const p = program(er, signer).methods;
  const builder = cmd === 'plant' ? p.plant(Number(a1 ?? 0))
    : cmd === 'sawmill' ? p.buildSawmill()
      : p.harvest(RES[(a1 ?? 'wood') as keyof typeof RES], Number(a2 ?? 4));
  const ix = await builder.accountsPartial({ settlement, signer: signer.publicKey }).instruction();
  out(erTx(await erSend(ix, [signer])));
} else if (cmd === 'session') {
  const session = Keypair.generate();
  fs.writeFileSync(sessionFile, JSON.stringify(Array.from(session.secretKey)), { mode: 0o600 });
  const expires = Math.floor(Date.now() / 1000) + Number(a1 ?? 3600);
  const ix = await program(er).methods.setSession(session.publicKey, new BN(expires), Number(a2 ?? 100))
    .accountsPartial({ settlement, owner: owner.publicKey }).instruction();
  out({ sessionKey: session.publicKey.toBase58(), expires, ...erTx(await erSend(ix)) });
} else if (cmd === 'schedule') {
  const ix = await program(er).methods.scheduleTicks(new BN(a1 ?? 1), new BN(a2 ?? 2000), new BN(a3 ?? 1000))
    .accountsPartial({ magicProgram: MAGIC_PROGRAM_ID, payer: owner.publicKey, settlement, settlementInfo: settlement, program: PROGRAM_ID })
    .instruction();
  out(erTx(await erSend(ix)));
} else if (cmd === 'cancel-task') {
  // cancel-task <taskId>: Magic program CancelTask { task_id }, signed by the task authority (this wallet).
  // Wire format: u32 LE variant 7 (CancelTask) + i64 LE task_id; account 0 = authority (signer). Asynchronous:
  // the scheduler closes the crank after this transaction commits; verify with crank-inventory.ts.
  const data = Buffer.alloc(12); data.writeUInt32LE(7, 0); data.writeBigInt64LE(BigInt(a1 ?? 'x'), 4);
  const ix = new anchor.web3.TransactionInstruction({ programId: MAGIC_PROGRAM_ID, keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: true }], data });
  out({ cancelled: Number(a1), ...erTx(await erSend(ix)) });
} else if (cmd === 'prospect') {
  const ix = await program(er).methods.prospect(Math.floor(Math.random() * 255))
    .accountsPartial({ payer: owner.publicKey, settlement, oracleQueue: EPHEMERAL_QUEUE, programIdentity: PROGRAM_IDENTITY,
      vrfProgram: VRF_PROGRAM, slotHashes: SLOT_HASHES, systemProgram: SystemProgram.programId }).instruction();
  out(erTx(await erSend(ix)));
} else if (cmd === 'cancel-prospect') {
  const ix = await program(er).methods.cancelProspect().accountsPartial({ settlement, owner: owner.publicKey }).instruction();
  out(erTx(await erSend(ix)));
} else if (cmd === 'commit' || cmd === 'undelegate') {
  const m = program(er).methods;
  const ix = await (cmd === 'commit' ? m.commitSettlement() : m.undelegate())
    .accountsPartial({ payer: owner.publicKey, settlement, magicProgram: MAGIC_PROGRAM_ID, magicContext: MAGIC_CONTEXT_ID }).instruction();
  out(erTx(await erSend(ix)));
} else {
  console.error('unknown command; see header');
  process.exit(2);
}
