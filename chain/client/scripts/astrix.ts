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
const [cmd, a1, a2, a3] = process.argv.slice(2);
const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));
const erTx = (sig: string) => ({ sig, explorer: `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(ER_RPC)}` });
const baseTx = (sig: string) => ({ sig, explorer: `https://explorer.solana.com/tx/${sig}?cluster=devnet` });

if (cmd === 'status') {
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
