// MagicBlock settlement reader (presentation side, read-only).
//
// The on-chain settlement (program Gge4…GRdy) is authoritative for the shared
// economy. This module only *reads* it: from the Ephemeral Rollup for the live
// state and from Solana for the last committed snapshot. It never signs, and
// the local game keeps running if the chain is unreachable.
import { Connection, PublicKey } from '@solana/web3.js';

export const CHAIN = {
  programId: new PublicKey('Gge4UkouS7gC12yfMAYpV1j3ZdnsQLSh3c43AeNiGRdy'),
  owner: new PublicKey('GVbuuocW6hzMcsCAsvX6AAJnGDo3VZHwTmSLGhkZSw32'),
  erRpc: 'https://devnet-eu.magicblock.app',
  baseRpc: 'https://api.devnet.solana.com',
};

export const RESOURCE_NAMES = ['wood', 'stone', 'fiber', 'food', 'ore', 'seed', 'planks', 'crystal'] as const;
const DISCRIMINATOR = [55, 11, 219, 33, 36, 136, 40, 182];
const EMPTY_PLOT = 0xffffffffffffffffn;

export interface ChainSettlement {
  owner: string;
  worldSeed: number;
  generator: number;
  tick: number;
  lastTickTs: number;
  tickIntervalS: number;
  stock: Record<(typeof RESOURCE_NAMES)[number], number>;
  plots: Array<number | null>;
  population: number;
  sawmill: boolean;
  prospectPending: boolean;
  prospects: number;
  lastFind: 'nothing' | 'ore vein' | 'rare crystal';
  lastRoll: number;
  rareFinds: number;
  sessionExpires: number;
  sessionBudget: number;
}

export function settlementAddress(owner = CHAIN.owner): PublicKey {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode('astrix-settlement'), owner.toBytes()], CHAIN.programId)[0];
}

/** Decode the Anchor `Settlement` account (borsh, fixed layout). */
export function decodeSettlement(data: Uint8Array): ChainSettlement {
  for (let i = 0; i < 8; i++) if (data[i] !== DISCRIMINATOR[i]) throw new Error('not an ASTrix settlement account');
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const pk = () => { const k = new PublicKey(data.slice(o, o + 32)).toBase58(); o += 32; return k; };
  const u8 = () => data[o++];
  const u16 = () => { const x = v.getUint16(o, true); o += 2; return x; };
  const u32 = () => { const x = v.getUint32(o, true); o += 4; return x; };
  const u64 = () => { const x = v.getBigUint64(o, true); o += 8; return x; };
  const i64 = () => { const x = v.getBigInt64(o, true); o += 8; return Number(x); };
  const owner = pk();
  const worldSeed = u32(), generator = u8(); u8();
  const tick = Number(u64()), lastTickTs = i64(), tickIntervalS = i64();
  const stock = Object.fromEntries(RESOURCE_NAMES.map((n) => [n, u32()])) as ChainSettlement['stock'];
  const plots = Array.from({ length: 9 }, () => { const p = u64(); return p === EMPTY_PLOT ? null : Number(p); });
  const population = u16(), sawmill = u8() === 1, prospectPending = u8() === 1, prospects = u32();
  const lastFind = (['nothing', 'ore vein', 'rare crystal'] as const)[u8()] ?? 'nothing';
  const lastRoll = u8(), rareFinds = u32();
  pk();
  const sessionExpires = i64(), sessionBudget = u32();
  return { owner, worldSeed, generator, tick, lastTickTs, tickIntervalS, stock, plots, population, sawmill,
    prospectPending, prospects, lastFind, lastRoll, rareFinds, sessionExpires, sessionBudget };
}

export interface ChainView {
  live: ChainSettlement | null;
  committed: ChainSettlement | null;
  delegated: boolean;
  error: string | null;
  updatedAt: number;
}

/**
 * Polls the committed snapshot and subscribes to live ER updates. Failures are
 * reported in `error`; callers keep the local game running regardless.
 */
export class SettlementWatcher {
  view: ChainView = { live: null, committed: null, delegated: false, error: null, updatedAt: 0 };
  private er = new Connection(CHAIN.erRpc, { commitment: 'confirmed', wsEndpoint: CHAIN.erRpc.replace('https', 'wss') });
  private base = new Connection(CHAIN.baseRpc, 'confirmed');
  private address: PublicKey;
  constructor(address: PublicKey = settlementAddress()) { this.address = address; }
  private timer: ReturnType<typeof setInterval> | null = null;
  onChange: ((v: ChainView) => void) | null = null;

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 4000);
    try {
      this.er.onAccountChange(this.address, (info) => {
        try { this.view = { ...this.view, live: decodeSettlement(info.data), error: null, updatedAt: Date.now() }; this.onChange?.(this.view); }
        catch { /* ignore malformed */ }
      }, { commitment: 'confirmed' });
    } catch { /* polling continues */ }
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  get addressBase58(): string { return this.address.toBase58(); }

  private async refresh(): Promise<void> {
    try {
      const [live, committed] = await Promise.all([
        this.er.getAccountInfo(this.address), this.base.getAccountInfo(this.address),
      ]);
      this.view = {
        live: live ? decodeSettlement(live.data) : null,
        committed: committed ? decodeSettlement(committed.data) : null,
        delegated: committed?.owner.toBase58() === 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh',
        error: null, updatedAt: Date.now(),
      };
    } catch (e) {
      this.view = { ...this.view, error: (e as Error).message.slice(0, 120) };
    }
    this.onChange?.(this.view);
  }
}
