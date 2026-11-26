// W6 (wilderness content v7): mining natural deposits (sim/deposits.ts).
//
// Every swing of a pickaxe at a deposit is one journaled `mine` command,
// validated here: the deposit exists and the player has discovered it (W5
// discovery: it was within sight of an explore report), it is not worked
// out, a stone pickaxe is in hand and not broken, the player stands within
// MINE_REACH of it, the swing budget (shared with chopping and construction
// work, SWINGS_PER_TICK every 2 s tick) has room, and the bag can hold one
// more unit of what the deposit gives. A swing takes one unit of pickaxe
// durability and adds one to the work on the current unit; after
// MINE_SWINGS[type] swings one unit comes out, into the bag (it was checked to
// fit), and the deposit has one unit fewer. At 0 the deposit is worked out
// for good: nothing regrows. Clicking a deposit never gives anything by
// itself: only completed work does.
//
// Saved: per touched deposit, the units left and the swings into the next
// unit. Untouched deposits are not saved (their quantity is generated).
// Integer state; no randomness; no three.js.
import type { World } from './world';
import type { At, WildItem, WildResult } from './gathering';
import { ITEM_LABEL, ITEM_WEIGHT, carriedWeight, carryCapacity } from './gathering';
import type { FellEvent } from './felling';
import { SWINGS_PER_TICK, noteEvent } from './felling';
import { ANY_DEPOSIT_ID, DEPOSIT_LABEL, Deposit, DepositType, MAX_DEPOSIT_UNITS, depositOf } from './deposits';

export const WILD_CONTENT_V7 = 7 as const;
/** What a unit of each deposit is. */
export const DEPOSIT_ITEM: Record<DepositType, WildItem> = { iron: 'iron_ore', copper: 'copper_ore', coal: 'coal', clay: 'clay', sand: 'sand', gravel: 'gravel' };
/** Pickaxe swings per unit: hard ore takes longest, soft ground is dug quicker. */
export const MINE_SWINGS: Record<DepositType, number> = { iron: 4, copper: 4, coal: 3, clay: 2, sand: 2, gravel: 2 };
/** Reach from the player's reported position to the deposit's centre (m). */
export const MINE_REACH = 3;
export const MAX_MINED = 2048;

export interface MineRecord { id: string; left: number; work: number }
export interface MineState { deposits: Map<string, MineRecord> }
export const createMine = (): MineState => ({ deposits: new Map() });

const fail = (code: string, reason: string): { ok: false; code: string; reasons: string[] } => ({ ok: false, code, reasons: [reason] });
const tickOf = (world: World) => world.life?.tick ?? 0;

/** Units left in a deposit (its generated quantity until it is first worked). */
export function depositLeft(world: World, d: Deposit): number {
  return world.wild?.mine?.deposits.get(d.id)?.left ?? d.qty;
}
/** Swings into the current unit. */
export function depositWork(world: World, d: Deposit): number {
  return world.wild?.mine?.deposits.get(d.id)?.work ?? 0;
}
export const isDiscovered = (world: World, id: string): boolean => !!world.wild?.map?.deposits.has(id);

export interface MineValue { left: number; work: number; durability: number; events: FellEvent[]; item?: WildItem; amount?: number }

/** One pickaxe swing at a deposit. */
export function mineDeposit(world: World, depositId: string, at: At): WildResult<MineValue> {
  const w = world.wild!, f = w.fell!, m = w.mine!;
  const d = depositOf(world.seed, world.params.generatorVersion, depositId);
  if (!d || d.id.startsWith('e:') && world.entityRemovals.has(d.id)) return fail('not_found', 'there is no deposit there');
  if (!isDiscovered(world, d.id)) return fail('undiscovered', 'you have not found this deposit yet: walk up to it so it goes on your map');
  const rec = m.deposits.get(d.id);
  const left = rec?.left ?? d.qty;
  if (left <= 0) return fail('exhausted', `this ${DEPOSIT_LABEL[d.type]} deposit is worked out: nothing is left and it does not regrow`);
  const tool = w.equipped ? w.tools.find((t) => t.id === w.equipped) : undefined;
  if (!tool || tool.kind !== 'stone_pickaxe') return fail('no_pickaxe', 'you need a pickaxe in hand: make a stone pickaxe at a workbench and equip it (bag)');
  if (tool.durability <= 0) return fail('broken_tool', 'your stone pickaxe is broken: make a new one');
  const dist = Math.hypot(d.x - at.x / 10, d.z - at.z / 10);
  if (dist > MINE_REACH) return fail('out_of_reach', `out of reach: walk up to the deposit (${MINE_REACH} m; ${Math.round(dist)} m now)`);
  const tick = tickOf(world);
  if (f.swing.tick === tick && f.swing.n >= SWINGS_PER_TICK) return fail('too_fast', `too fast: at most ${SWINGS_PER_TICK} swings every 2 s`);
  const item = DEPOSIT_ITEM[d.type];
  const cap = carryCapacity(w), used = carriedWeight(w);
  if (used + ITEM_WEIGHT[item] > cap) return fail('capacity', `your bag is full (${used}/${cap}; ${ITEM_LABEL[item]} weighs ${ITEM_WEIGHT[item]}): drop or store something first`);
  if (!rec && m.deposits.size >= MAX_MINED) return fail('too_many', 'too many deposits worked in this world');
  if (f.swing.tick !== tick) f.swing = { tick, n: 0 };
  f.swing.n++;
  tool.durability -= 1;
  const events: FellEvent[] = [];
  const r = rec ?? { id: d.id, left: d.qty, work: 0 };
  if (!rec) { m.deposits.set(d.id, r); events.push(noteEvent(world, 'MINE_STARTED', d.id)); }
  r.work++;
  if (r.work < MINE_SWINGS[d.type]) return { ok: true, value: { left: r.left, work: r.work, durability: tool.durability, events } };
  r.work = 0;
  r.left--;
  w.items[item] = (w.items[item] ?? 0) + 1;
  events.push(noteEvent(world, 'DEPOSIT_MINED', d.id, r.left));
  if (r.left === 0) events.push(noteEvent(world, 'DEPOSIT_EXHAUSTED', d.id));
  return { ok: true, value: { left: r.left, work: 0, durability: tool.durability, events, item, amount: 1 } };
}

// ---------- snapshot form ----------
export interface MineSnapshot { deposits: MineRecord[] }

export function mineSnapshot(m: MineState): MineSnapshot {
  return { deposits: [...m.deposits.values()].sort((a, b) => a.id.localeCompare(b.id)).map((r) => ({ id: r.id, left: r.left, work: r.work })) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi;
const MAX_SWINGS = Math.max(...Object.values(MINE_SWINGS));

/** Strict canonical form; throws otherwise. (Formats and bounds: a deposit's own quantity is checked on use.) */
export function validateMine(raw: unknown): MineSnapshot {
  const bad = (what: string): never => { throw new Error(`snapshot wilderness mining: invalid ${what}`); };
  if (!isObj(raw) || Object.keys(raw).join() !== 'deposits' || !Array.isArray(raw.deposits) || (raw.deposits as unknown[]).length > MAX_MINED) bad('fields');
  let last = '';
  const deposits = ((raw as Record<string, unknown>).deposits as unknown[]).map((x) => {
    const r = x as Record<string, unknown>;
    if (!isObj(r) || Object.keys(r).join() !== 'id,left,work' || typeof r.id !== 'string' || !ANY_DEPOSIT_ID.test(r.id)
      || !int(r.left, 0, MAX_DEPOSIT_UNITS) || !int(r.work, 0, MAX_SWINGS - 1) || (r.left === 0 && r.work !== 0) || (last && last.localeCompare(r.id) >= 0)) bad('deposit record');
    last = r.id as string;
    return { id: r.id as string, left: r.left as number, work: r.work as number };
  });
  return { deposits };
}

export function mineFromSnapshot(s: MineSnapshot): MineState {
  return { deposits: new Map(s.deposits.map((r) => [r.id, { ...r }])) };
}
