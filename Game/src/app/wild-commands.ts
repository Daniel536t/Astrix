// W2: the journaled wilderness commands (pickup, drop, craft, equip, eat and
// the content upgrade of a W1 world), their strict validation and dispatch.
// Coarse by design: one command per pickup, craft or meal, never per step.
// W3 (content v3): `chop` (one per axe swing at a standing tree), `cut_log`
// (one per swing along a fallen trunk) and `mark_stockpile`; picking up a log
// records LOGS_COLLECTED and dropping logs at a stockpile LOGS_DELIVERED.
//
// Reach: the avatar is player-local physics, so `pickup`, `drop`, `chop`,
// `cut_log` and `mark_stockpile` carry the player's position (integer
// decimetres) like the S2 tick presence, and the simulation checks reach
// from it. The position is reported, not proven; the same trust as the
// existing `harvest` command, whose reach is checked by the client only.
import {
  WILD_CONTENT_V2, WILD_CONTENT_V3, WILD_ITEMS, WildContent, WildItem, TOOL_KINDS, ToolKind, PICKUP_ID, PILE_ID, TOOL_ID,
  createWildState, craft, dropItems, eat, equip, isWildContent, pickUp, recipeById, upgradeWildState, WILD_RECIPES,
} from '../sim/gathering';
import {
  FELL_EVENTS, FellEvent, STOCKPILE_ID, TRUNK_ID, chopTree, cutLog, deliverLogs, isTreeEntityId, markStockpile, noteEvent, stockpileAt,
} from '../sim/felling';
import { PRESENCE_POS } from '../sim/bodies';
import type { World } from '../sim/world';

interface Envelope { schema: 3; id: string; expectedRevision: number }
export interface At { x: number; z: number }
export interface PickupCommand extends Envelope { type: 'pickup'; entityId: string; at: At }
export interface DropCommand extends Envelope { type: 'drop'; item: WildItem; n: number; at: At }
export interface CraftCommand extends Envelope { type: 'craft'; recipe: string }
export interface EquipCommand extends Envelope { type: 'equip'; item: ToolKind | 'hands' }
export interface EatCommand extends Envelope { type: 'eat'; item: WildItem }
/** A W1 (content v1) world gains pickups, items and crafting (v2); a v1 or v2 world gains felling (v3). */
export interface UpgradeWildernessCommand extends Envelope { type: 'upgrade_wilderness'; content: WildContent }
/** W3: one axe swing at a standing tree. */
export interface ChopCommand extends Envelope { type: 'chop'; entityId: string; at: At }
/** W3: one axe swing along a fallen trunk. */
export interface CutLogCommand extends Envelope { type: 'cut_log'; trunkId: string; at: At }
/** W3: a log stockpile marker where the player stands. */
export interface MarkStockpileCommand extends Envelope { type: 'mark_stockpile'; at: At }
export type WildCommand = PickupCommand | DropCommand | CraftCommand | EquipCommand | EatCommand | UpgradeWildernessCommand
  | ChopCommand | CutLogCommand | MarkStockpileCommand;

export type WildOutcome =
  | { type: 'pickup'; entityId: string; item: WildItem; amount: number; events?: FellEvent[] }
  | { type: 'drop'; pileId: string; item: WildItem; n: number; stockpileId?: string; events?: FellEvent[] }
  | { type: 'craft'; recipe: string; spent: Record<string, number>; made: Record<string, number>; toolId?: string }
  | { type: 'equip'; item: ToolKind | 'hands'; toolId?: string }
  | { type: 'eat'; item: WildItem; hunger: number }
  | { type: 'upgrade_wilderness'; content: WildContent }
  | { type: 'chop'; entityId: string; hp: number; max: number; durability: number; events: FellEvent[]; trunkId?: string; branchPile?: string }
  | { type: 'cut_log'; trunkId: string; left: number; work: number; durability: number; events: FellEvent[]; pileId?: string }
  | { type: 'mark_stockpile'; stockpileId: string; events: FellEvent[] };

export const WILD_COMMAND_TYPES: readonly string[] = ['pickup', 'drop', 'craft', 'equip', 'eat', 'upgrade_wilderness', 'chop', 'cut_log', 'mark_stockpile'];
export const isWildCommandType = (t: unknown): boolean => WILD_COMMAND_TYPES.includes(String(t));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const uint = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
const itemOf = (v: unknown): v is WildItem => WILD_ITEMS.includes(v as WildItem);
const pickupId = (v: unknown): v is string => typeof v === 'string' && (PICKUP_ID.test(v) || PILE_ID.test(v));
const trunkId = (v: unknown): v is string => typeof v === 'string' && TRUNK_ID.test(v);
function atOf(v: unknown): At | null {
  if (!isObj(v) || Object.keys(v).length !== 2) return null;
  const pos = (n: unknown) => Number.isSafeInteger(n) && Math.abs(n as number) <= PRESENCE_POS;
  return pos(v.x) && pos(v.z) ? { x: v.x as number, z: v.z as number } : null;
}
function bagOf(v: unknown): Record<string, number> | null {
  if (!isObj(v)) return null;
  const out: Record<string, number> = {};
  for (const k of Object.keys(v).sort()) {
    if (!itemOf(k) && !TOOL_KINDS.includes(k as ToolKind) || !uint(v[k], 10_000) || (v[k] as number) < 1) return null;
    out[k] = v[k] as number;
  }
  return out;
}
function eventsOf(v: unknown, max = 4): FellEvent[] | null {
  if (!Array.isArray(v) || v.length > max || !v.every((e) => FELL_EVENTS.includes(e as FellEvent))) return null;
  return [...v] as FellEvent[];
}

/** Canonical command or null (the caller compares fields exactly). */
export function validateWildCommand(value: Record<string, unknown>, base: Envelope): WildCommand | null {
  switch (value.type) {
    case 'pickup': {
      const at = atOf(value.at);
      return pickupId(value.entityId) && at ? { ...base, type: 'pickup', entityId: value.entityId, at } : null;
    }
    case 'drop': {
      const at = atOf(value.at);
      return itemOf(value.item) && uint(value.n, 10_000) && value.n >= 1 && at ? { ...base, type: 'drop', item: value.item, n: value.n, at } : null;
    }
    case 'craft':
      return typeof value.recipe === 'string' && !!recipeById(value.recipe) ? { ...base, type: 'craft', recipe: value.recipe } : null;
    case 'equip':
      return value.item === 'hands' || TOOL_KINDS.includes(value.item as ToolKind) ? { ...base, type: 'equip', item: value.item as ToolKind | 'hands' } : null;
    case 'eat':
      return itemOf(value.item) ? { ...base, type: 'eat', item: value.item } : null;
    case 'upgrade_wilderness':
      return isWildContent(value.content) ? { ...base, type: 'upgrade_wilderness', content: value.content } : null;
    case 'chop': {
      const at = atOf(value.at);
      return isTreeEntityId(value.entityId) && at ? { ...base, type: 'chop', entityId: value.entityId, at } : null;
    }
    case 'cut_log': {
      const at = atOf(value.at);
      return trunkId(value.trunkId) && at ? { ...base, type: 'cut_log', trunkId: value.trunkId, at } : null;
    }
    case 'mark_stockpile': {
      const at = atOf(value.at);
      return at ? { ...base, type: 'mark_stockpile', at } : null;
    }
  }
  return null;
}

// Outcome builders: dispatch and validation share them, so the field order is one definition.
const pickupOutcome = (entityId: string, item: WildItem, amount: number, events?: FellEvent[]): WildOutcome =>
  ({ type: 'pickup', entityId, item, amount, ...(events ? { events } : {}) });
const dropOutcome = (pileId: string, item: WildItem, n: number, stockpileId?: string, events?: FellEvent[]): WildOutcome =>
  ({ type: 'drop', pileId, item, n, ...(stockpileId ? { stockpileId } : {}), ...(events ? { events } : {}) });
const chopOutcome = (entityId: string, hp: number, max: number, durability: number, events: FellEvent[], trunk?: string, branchPile?: string): WildOutcome =>
  ({ type: 'chop', entityId, hp, max, durability, events, ...(trunk ? { trunkId: trunk } : {}), ...(branchPile ? { branchPile } : {}) });
const cutOutcome = (trunk: string, left: number, work: number, durability: number, events: FellEvent[], pileId?: string): WildOutcome =>
  ({ type: 'cut_log', trunkId: trunk, left, work, durability, events, ...(pileId ? { pileId } : {}) });

export function validateWildOutcome(value: Record<string, unknown>): WildOutcome | null {
  const pile = (v: unknown): v is string => typeof v === 'string' && PILE_ID.test(v);
  switch (value.type) {
    case 'pickup': {
      if (!pickupId(value.entityId) || !itemOf(value.item) || !uint(value.amount, 10_000) || value.amount < 1) return null;
      if (value.events === undefined) return pickupOutcome(value.entityId, value.item, value.amount);
      const ev = eventsOf(value.events, 1);
      return ev && ev[0] === 'LOGS_COLLECTED' && value.item === 'log' ? pickupOutcome(value.entityId, value.item, value.amount, ev) : null;
    }
    case 'drop': {
      if (!pile(value.pileId) || !itemOf(value.item) || !uint(value.n, 10_000) || value.n < 1) return null;
      if (value.stockpileId === undefined && value.events === undefined) return dropOutcome(value.pileId, value.item, value.n);
      const ev = eventsOf(value.events, 1);
      return ev && ev[0] === 'LOGS_DELIVERED' && value.item === 'log' && typeof value.stockpileId === 'string' && STOCKPILE_ID.test(value.stockpileId)
        ? dropOutcome(value.pileId, value.item, value.n, value.stockpileId, ev) : null;
    }
    case 'craft': {
      const spent = bagOf(value.spent), made = bagOf(value.made);
      if (typeof value.recipe !== 'string' || !recipeById(value.recipe) || !spent || !made
        || value.toolId !== undefined && (typeof value.toolId !== 'string' || !TOOL_ID.test(value.toolId))) return null;
      return { type: 'craft', recipe: value.recipe, spent, made, ...(value.toolId !== undefined ? { toolId: value.toolId as string } : {}) };
    }
    case 'equip':
      if (value.item !== 'hands' && !TOOL_KINDS.includes(value.item as ToolKind)
        || value.toolId !== undefined && (typeof value.toolId !== 'string' || !TOOL_ID.test(value.toolId))) return null;
      return { type: 'equip', item: value.item as ToolKind | 'hands', ...(value.toolId !== undefined ? { toolId: value.toolId as string } : {}) };
    case 'eat':
      return itemOf(value.item) && uint(value.hunger, 100) ? { type: 'eat', item: value.item, hunger: value.hunger } : null;
    case 'upgrade_wilderness':
      return isWildContent(value.content) ? { type: 'upgrade_wilderness', content: value.content } : null;
    case 'chop': {
      const ev = eventsOf(value.events);
      if (!isTreeEntityId(value.entityId) || !uint(value.max, 100) || !uint(value.hp, value.max as number) || !uint(value.durability, 1000) || !ev
        || value.trunkId !== undefined && (!trunkId(value.trunkId) || value.hp !== 0)
        || value.branchPile !== undefined && (!pile(value.branchPile) || value.trunkId === undefined)) return null;
      return chopOutcome(value.entityId, value.hp, value.max as number, value.durability, ev, value.trunkId as string | undefined, value.branchPile as string | undefined);
    }
    case 'cut_log': {
      const ev = eventsOf(value.events, 1);
      if (!trunkId(value.trunkId) || !uint(value.left, 40) || !uint(value.work, 1) || !uint(value.durability, 1000) || !ev
        || value.pileId !== undefined && !pile(value.pileId)) return null;
      return cutOutcome(value.trunkId, value.left, value.work, value.durability, ev, value.pileId as string | undefined);
    }
    case 'mark_stockpile': {
      const ev = eventsOf(value.events, 1);
      return typeof value.stockpileId === 'string' && STOCKPILE_ID.test(value.stockpileId) && ev
        ? { type: 'mark_stockpile', stockpileId: value.stockpileId, events: ev } : null;
    }
  }
  return null;
}

/** Command and recorded outcome agree on the fields the command fixes. */
export function wildAgrees(c: WildCommand, o: WildOutcome): boolean {
  if (c.type !== o.type) return false;
  switch (c.type) {
    case 'pickup': return o.type === 'pickup' && o.entityId === c.entityId;
    case 'drop': return o.type === 'drop' && o.item === c.item && o.n === c.n;
    case 'craft': return o.type === 'craft' && o.recipe === c.recipe;
    case 'equip': return o.type === 'equip' && o.item === c.item;
    case 'eat': return o.type === 'eat' && o.item === c.item;
    case 'upgrade_wilderness': return o.type === 'upgrade_wilderness' && o.content === c.content;
    case 'chop': return o.type === 'chop' && o.entityId === c.entityId;
    case 'cut_log': return o.type === 'cut_log' && o.trunkId === c.trunkId;
    case 'mark_stockpile': return true;
  }
}

export type WildDispatch = { ok: true; value: WildOutcome } | { ok: false; code: string; reasons: string[] };

export function dispatchWild(world: World, c: WildCommand): WildDispatch {
  if (c.type === 'upgrade_wilderness') {
    const tick = world.life?.tick ?? 0;
    if (!world.wild) {
      world.wild = createWildState(c.content, world.seed, tick);
      return { ok: true, value: { type: 'upgrade_wilderness', content: c.content } };
    }
    if (world.wild.content >= c.content) return { ok: false, code: 'already_current', reasons: [`this world already has wilderness content v${world.wild.content}`] };
    upgradeWildState(world.wild, world.seed, tick);
    return { ok: true, value: { type: 'upgrade_wilderness', content: WILD_CONTENT_V3 } };
  }
  if (!world.wild) return { ok: false, code: 'wilderness', reasons: ['this world predates gathering (wilderness content v1); it needs upgrade_wilderness first'] };
  const felling = !!world.wild.fell;
  if ((c.type === 'chop' || c.type === 'cut_log' || c.type === 'mark_stockpile') && !felling) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates tree felling (wilderness content v2); it needs upgrade_wilderness first'] };
  }
  switch (c.type) {
    case 'pickup': {
      const r = pickUp(world, c.entityId, c.at);
      if (!r.ok) return r;
      const ev = felling && r.value.item === 'log' ? [noteEvent(world, 'LOGS_COLLECTED', c.entityId, r.value.amount)] : undefined;
      return { ok: true, value: pickupOutcome(c.entityId, r.value.item, r.value.amount, ev) };
    }
    case 'drop': {
      // W3: logs dropped at a stockpile marker are delivered there.
      const s = felling && c.item === 'log' ? stockpileAt(world, c.at.x / 10, c.at.z / 10) : null;
      if (s) {
        if ((world.wild.items.log ?? 0) < c.n) return { ok: false, code: 'missing', reasons: [`you carry ${world.wild.items.log ?? 0} log`] };
        if (world.wild.piles.size >= 512) return { ok: false, code: 'too_many_piles', reasons: ['too many dropped piles in this world'] };
        const d = deliverLogs(world, s, c.n);
        return { ok: true, value: dropOutcome(d.pileId, c.item, c.n, s.id, d.events) };
      }
      const r = dropItems(world, c.item, c.n, c.at);
      return r.ok ? { ok: true, value: dropOutcome(r.value.pileId, c.item, c.n) } : r;
    }
    case 'craft': {
      const r = craft(world, c.recipe);
      return r.ok ? { ok: true, value: { type: 'craft', recipe: c.recipe, spent: r.value.spent, made: r.value.made, ...(r.value.toolId ? { toolId: r.value.toolId } : {}) } } : r;
    }
    case 'equip': {
      const r = equip(world, c.item);
      return r.ok ? { ok: true, value: { type: 'equip', item: c.item, ...(r.value.toolId ? { toolId: r.value.toolId } : {}) } } : r;
    }
    case 'eat': {
      const r = eat(world, c.item);
      return r.ok ? { ok: true, value: { type: 'eat', item: c.item, hunger: r.value.hunger } } : r;
    }
    case 'chop': {
      const r = chopTree(world, c.entityId, c.at);
      return r.ok ? { ok: true, value: chopOutcome(c.entityId, r.value.hp, r.value.max, r.value.durability, r.value.events, r.value.trunkId, r.value.branchPile) } : r;
    }
    case 'cut_log': {
      const r = cutLog(world, c.trunkId, c.at);
      return r.ok ? { ok: true, value: cutOutcome(c.trunkId, r.value.left, r.value.work, r.value.durability, r.value.events, r.value.pileId) } : r;
    }
    case 'mark_stockpile': {
      const r = markStockpile(world, c.at);
      return r.ok ? { ok: true, value: { type: 'mark_stockpile', stockpileId: r.value.stockpileId, events: r.value.events } } : r;
    }
  }
}

export { WILD_RECIPES, WILD_CONTENT_V2 };
