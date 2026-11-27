// W2: the journaled wilderness commands (pickup, drop, craft, equip, eat and
// the content upgrade of a W1 world), their strict validation and dispatch.
// Coarse by design: one command per pickup, craft or meal, never per step.
// W3 (content v3): `chop` (one per axe swing at a standing tree), `cut_log`
// (one per swing along a fallen trunk) and `mark_stockpile`; picking up a log
// records LOGS_COLLECTED and dropping logs at a stockpile LOGS_DELIVERED.
//
// W4 (content v4): `place_site` (a catalogue building where the validator
// allows it and its whole material list can be reserved), `deliver_site`
// (reserved materials from the bag, or a pile or storage at the site),
// `build_work` (one swing of construction work; a finished stage consumes its
// materials), `cancel_site` (reservations released; delivered materials back
// on the ground as piles), `claim_shelter`, `fuel_fire`, `cook`,
// `store_items`, `take_items` (optionally `forSite`: reserved stock carried
// for a site), `died` (a recorded drowning) and `respawn` (from a recorded
// death, to the claimed lean-to or the spawn); `pickup` gains an optional
// `forSite` and `craft` an optional `at` for workbench recipes. `place_site` and
// `cancel_site` share their names with the settlement's M014 commands; a
// wilderness one is told apart by its shape (a catalogue kind with `at`; a
// `b:` site id), so neither journal can carry the other's.
//
// Content v5 (W4 owner phone report 1): `deliver_site` may carry `swap`
// (from the bag only): free units of the item in the bag stand in for the
// site's reservations elsewhere, which are released; the outcome's `swapped`
// names them per source. The bag holds CARRY_CAPACITY_V5.
//
// Content v6 (W5 world navigation and map): `explore` (the player's
// position, reported as it walks; the simulation reveals the fog around it
// by its visibility rule, records discovered places and ore, and refuses a
// position the player could not have walked to), `set_waypoint` and
// `remove_waypoint`. Routes are derived and never journaled.
//
// Content v7 (W6 deposits, mining and processing): `mine` (one pickaxe swing
// at a discovered deposit; a unit of ore, coal, clay, sand or gravel comes out
// into the bag after the deposit's swings) and `smelt` (start a batch at a
// finished clay smelter; its ore and coal leave the bag at once and the
// ingots come out at the smelter's door when the batch is done, in a tick).
//
// Content v8 (W7 persistent wildlife): no new command. The `tick` presence
// (the player's quantised position, as in the settlement's S2) is what the
// wildlife reacts to; an accepted `chop`, `cut_log`, `mine` or `build_work`
// is also a noise at its `at` that animals within earshot hear on the next tick.
//
// Content v9 (W8 hunting): `shoot` (one arrow: kind, release point in cm,
// integer aim, draw time, the release moment within the tick; the simulation
// flies it under gravity and drag against the ground, water, buildings, trees,
// trunks and the animals where they are during the flight, and records the
// impact and what it did) and `butcher` (one knife swing at a player's
// carcass; an output comes off as a pile every few swings). Raw meat cooks at
// the campfire (`cook`).
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
import { isBuildingId } from '../sim/catalogue';
import {
  SITE_ID, SOURCE_ID, bagRefusal, cancelWildSite, claimShelter, cookAtFire, deliverToSite, fuelFire, placeWildSite, recordDeath, respawnPlayer, stationNear,
  storeItems, takeItems, workOnSite,
} from '../sim/wild-build';
import { WILD_CONTENT_V4, WILD_CONTENT_V5, WILD_CONTENT_V6 } from '../sim/gathering';
import { DEPOSIT_ID, WAYPOINT_ID, WAYPOINT_NAME, exploreAt, noteLanding, removeWaypoint, setWaypoint } from '../sim/map';
import { PLACE_ID } from '../sim/places';
import { homeShelter, siteSpotOf, smeltAt, spawnPoint } from '../sim/wild-build';
import { ANY_DEPOSIT_ID } from '../sim/deposits';
import { mineDeposit } from '../sim/mining';
import { smeltRecipe } from '../sim/catalogue';
import { WILD_CONTENT_V7, WILD_CONTENT_V8 } from '../sim/gathering';
import { ANIMAL_ID, noteNoise } from '../sim/wildlife';
import { WILD_CONTENT_V9, WILD_CONTENT_V10, WILD_CONTENT_V11, ITEM_WEIGHT, carriedWeight, carryCapacity } from '../sim/gathering';
import { ArrowKind, HitKind, HitResult, ShotValue, butcher, isArrowKind, shoot } from '../sim/hunting';
import {
  FEED_COOLDOWN_TICKS, HORSE_FEED_ITEMS, HORSE_GAITS, HORSE_GALLOP_MIN_STAMINA, HORSE_ID, HORSE_MAX_TRUST, HORSE_REACH,
  HorseFeedItem, HorseGait, ensureWildHorses, feedTrustGain,
} from '../sim/horses';
import {
  MAX_SETTLERS, RECRUIT_FOOD_COST, SETTLER_ID, SETTLER_ROLES, SettlerRole,
  finishedTradingPosts, hasSettlementStorage, nextSettlerName, offerById, shelterCapacity, tradingPostNear,
} from '../sim/community';
const siteSpotDm = (s: Parameters<typeof siteSpotOf>[0]) => { const p = siteSpotOf(s); return { x: Math.round(p.x * 10), z: Math.round(p.z * 10) }; };
import type { World } from '../sim/world';

interface Envelope { schema: 3; id: string; expectedRevision: number }
export interface At { x: number; z: number }
export interface PickupCommand extends Envelope { type: 'pickup'; entityId: string; at: At; forSite?: string }
export interface DropCommand extends Envelope { type: 'drop'; item: WildItem; n: number; at: At }
export interface CraftCommand extends Envelope { type: 'craft'; recipe: string; at?: At }
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
/** W4: mark out a catalogue building (the player's approval); its whole material list is reserved, or it is refused. */
export interface WildPlaceSiteCommand extends Envelope { type: 'place_site'; kind: string; x: number; z: number; rot: number; at: At }
/** W4: reserved materials into a site, from the bag (default) or a pile or storage within reach of it. */
export interface DeliverSiteCommand extends Envelope { type: 'deliver_site'; siteId: string; item: WildItem; n: number; at: At; from?: string; swap?: true }
/** W4: one swing of construction work. */
export interface BuildWorkCommand extends Envelope { type: 'build_work'; siteId: string; at: At }
/** W4: give up an unfinished site; its materials go back on the ground. */
export interface WildCancelSiteCommand extends Envelope { type: 'cancel_site'; siteId: string; at: At }
export interface ClaimShelterCommand extends Envelope { type: 'claim_shelter'; siteId: string; at: At }
export interface FuelFireCommand extends Envelope { type: 'fuel_fire'; siteId: string; item: WildItem; n: number; at: At }
export interface CookCommand extends Envelope { type: 'cook'; siteId: string; item: WildItem; at: At }
export interface StoreItemsCommand extends Envelope { type: 'store_items'; siteId: string; item: WildItem; n: number; at: At }
export interface TakeItemsCommand extends Envelope { type: 'take_items'; siteId: string; item: WildItem; n: number; at: At; forSite?: string }
/** W4: the character drowned; `at` is where it last stood on dry ground (the simulation checks it). */
export interface DiedCommand extends Envelope { type: 'died'; cause: 'drowned'; at: At }
/** W4: wake from the recorded death at the claimed lean-to (its id) or the spawn ('spawn'). */
export interface RespawnCommand extends Envelope { type: 'respawn'; to: string }
/** W5 (content v6): the player's position as it walks; the simulation reveals what can be seen from there. */
export interface ExploreCommand extends Envelope { type: 'explore'; at: At }
/** W5: a named waypoint at (x, z) whole metres. */
export interface SetWaypointCommand extends Envelope { type: 'set_waypoint'; x: number; z: number; name: string }
export interface RemoveWaypointCommand extends Envelope { type: 'remove_waypoint'; waypointId: string }
/** W6 (content v7): one pickaxe swing at a deposit. */
export interface MineCommand extends Envelope { type: 'mine'; depositId: string; at: At }
/** W6: start a smelting batch at a finished clay smelter. */
export interface SmeltCommand extends Envelope { type: 'smelt'; siteId: string; recipe: string; at: At }
/** W8 (content v9): one arrow released: release point (cm), aim (integer, length ~10,000), draw (ms), release moment in the tick (thousandths). */
export interface ShootCommand extends Envelope { type: 'shoot'; arrow: ArrowKind; from: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; draw: number; t: number; at: At }
/** W8: one knife swing at a carcass. */
export interface ButcherCommand extends Envelope { type: 'butcher'; carcassId: string; at: At }
/** W9 (content v10): taming, tack and riding horses. */
export interface HorseFeedCommand extends Envelope { type: 'horse_feed'; horseId: string; item: HorseFeedItem; at: At }
export interface HorseTackCommand extends Envelope { type: 'horse_tack'; horseId: string; item: 'saddle' | 'bridle'; at: At }
export interface HorseMountCommand extends Envelope { type: 'horse_mount'; horseId: string; at: At }
export interface HorseDismountCommand extends Envelope { type: 'horse_dismount'; at: At }
export interface HorseGaitCommand extends Envelope { type: 'horse_gait'; gait: HorseGait }
/** W10 (content v11): trading post barter, settler recruitment, work assignment and depot collection. */
export interface TradeBarterCommand extends Envelope { type: 'trade_barter'; offerId: string; qty: number; at: At }
export interface SettlerRecruitCommand extends Envelope { type: 'settler_recruit'; food: string; at: At }
export interface SettlerAssignCommand extends Envelope { type: 'settler_assign'; settlerId: string; role: SettlerRole }
export interface CommunityCollectCommand extends Envelope { type: 'community_collect'; item: WildItem; qty: number; at: At }

export type WildCommand = PickupCommand | DropCommand | CraftCommand | EquipCommand | EatCommand | UpgradeWildernessCommand
  | ChopCommand | CutLogCommand | MarkStockpileCommand
  | WildPlaceSiteCommand | DeliverSiteCommand | BuildWorkCommand | WildCancelSiteCommand | ClaimShelterCommand | FuelFireCommand | CookCommand
  | StoreItemsCommand | TakeItemsCommand | DiedCommand | RespawnCommand | ExploreCommand | SetWaypointCommand | RemoveWaypointCommand
  | MineCommand | SmeltCommand | ShootCommand | ButcherCommand
  | HorseFeedCommand | HorseTackCommand | HorseMountCommand | HorseDismountCommand | HorseGaitCommand
  | TradeBarterCommand | SettlerRecruitCommand | SettlerAssignCommand | CommunityCollectCommand;

export type WildOutcome =
  | { type: 'pickup'; entityId: string; item: WildItem; amount: number; events?: FellEvent[] }
  | { type: 'drop'; pileId: string; item: WildItem; n: number; stockpileId?: string; events?: FellEvent[] }
  | { type: 'craft'; recipe: string; spent: Record<string, number>; made: Record<string, number>; toolId?: string }
  | { type: 'equip'; item: ToolKind | 'hands'; toolId?: string }
  | { type: 'eat'; item: WildItem; hunger: number }
  | { type: 'upgrade_wilderness'; content: WildContent }
  | { type: 'chop'; entityId: string; hp: number; max: number; durability: number; events: FellEvent[]; trunkId?: string; branchPile?: string }
  | { type: 'cut_log'; trunkId: string; left: number; work: number; durability: number; events: FellEvent[]; pileId?: string }
  | { type: 'mark_stockpile'; stockpileId: string; events: FellEvent[] }
  | { type: 'place_site'; siteId: string; kind: string; x: number; z: number; rot: number; cleared: number; reserved: Record<string, Record<string, number>>; events: FellEvent[] }
  | { type: 'deliver_site'; siteId: string; item: WildItem; n: number; swapped?: Record<string, number>; events: FellEvent[] }
  | { type: 'build_work'; siteId: string; stage: number; work: number; durability?: number; events: FellEvent[] }
  | { type: 'cancel_site'; siteId: string; piles: string[]; released: Record<string, number>; events: FellEvent[] }
  | { type: 'claim_shelter'; siteId: string; events: FellEvent[] }
  | { type: 'fuel_fire'; siteId: string; item: WildItem; n: number; fuel: number; events: FellEvent[] }
  | { type: 'cook'; siteId: string; item: WildItem; made: WildItem; fuel: number; events: FellEvent[] }
  | { type: 'store_items'; siteId: string; item: WildItem; n: number; events: FellEvent[] }
  | { type: 'take_items'; siteId: string; item: WildItem; n: number; events: FellEvent[] }
  | { type: 'died'; cause: 'drowned'; dropped: Record<string, number>; piles: string[]; events: FellEvent[] }
  | { type: 'respawn'; point: string; x: number; z: number; events: FellEvent[] }
  | { type: 'explore'; revealed: number; places: string[]; deposits: string[] }
  | { type: 'set_waypoint'; waypointId: string }
  | { type: 'remove_waypoint'; waypointId: string }
  | { type: 'mine'; depositId: string; left: number; work: number; durability: number; item?: WildItem; amount?: number; events: FellEvent[] }
  | { type: 'smelt'; siteId: string; recipe: string; spent: Record<string, number>; end: number; events: FellEvent[] }
  | ({ type: 'shoot'; arrow: ArrowKind } & ShotValue)
  | { type: 'butcher'; carcassId: string; cut: number; left: number; work: number; durability: number; item?: WildItem; pileId?: string; events: FellEvent[] }
  | { type: 'horse_feed'; horseId: string; item: HorseFeedItem; trust: number; tamed: boolean }
  | { type: 'horse_tack'; horseId: string; item: 'saddle' | 'bridle'; saddled: boolean; bridled: boolean }
  | { type: 'horse_mount'; horseId: string }
  | { type: 'horse_dismount'; horseId: string }
  | { type: 'horse_gait'; gait: HorseGait }
  | { type: 'trade_barter'; offerId: string; qty: number; received: string; receivedQty: number; stockLeft: number }
  | { type: 'settler_recruit'; settlerId: string; name: string; food: string; foodSpent: number }
  | { type: 'settler_assign'; settlerId: string; role: SettlerRole }
  | { type: 'community_collect'; item: WildItem; qty: number };

/** Commands only the wilderness has. */
export const WILD_COMMAND_TYPES: readonly string[] = ['pickup', 'drop', 'craft', 'equip', 'eat', 'upgrade_wilderness', 'chop', 'cut_log', 'mark_stockpile',
  'deliver_site', 'build_work', 'claim_shelter', 'fuel_fire', 'cook', 'store_items', 'take_items', 'died', 'respawn',
  'explore', 'set_waypoint', 'remove_waypoint', 'mine', 'smelt', 'shoot', 'butcher',
  'horse_feed', 'horse_tack', 'horse_mount', 'horse_dismount', 'horse_gait',
  'trade_barter', 'settler_recruit', 'settler_assign', 'community_collect'];
/** W10 (content v11) commands. */
export const COMMUNITY_COMMAND_TYPES: readonly string[] = ['trade_barter', 'settler_recruit', 'settler_assign', 'community_collect'];
/** W9 (content v10) commands. */
export const HORSE_COMMAND_TYPES: readonly string[] = ['horse_feed', 'horse_tack', 'horse_mount', 'horse_dismount', 'horse_gait'];
/** W8 (content v9) commands. */
export const HUNT_COMMAND_TYPES: readonly string[] = ['shoot', 'butcher'];
/** W6 (content v7) commands. */
export const MINING_COMMAND_TYPES: readonly string[] = ['mine', 'smelt'];
/** W5 (content v6) commands. */
export const MAP_COMMAND_TYPES: readonly string[] = ['explore', 'set_waypoint', 'remove_waypoint'];
/** Command names shared with the settlement (M014): told apart by shape. */
export const SHARED_COMMAND_TYPES: readonly string[] = ['place_site', 'cancel_site'];
export const isWildCommandType = (t: unknown): boolean => WILD_COMMAND_TYPES.includes(String(t));
const isObjLoose = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
/**
 * Is this command (or outcome) value a wilderness one? A shared name is the
 * wilderness's when it carries a catalogue kind (`place_site`) or a `b:` site
 * id (`cancel_site`, and both outcomes).
 */
export function isWildCommandValue(v: unknown): boolean {
  if (!isObjLoose(v)) return false;
  if (isWildCommandType(v.type)) return true;
  if (v.type === 'place_site') return typeof v.siteId === 'string' ? SITE_ID.test(v.siteId) : isBuildingId(v.kind);
  if (v.type === 'cancel_site') return typeof v.siteId === 'string' && SITE_ID.test(v.siteId);
  return false;
}

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
const siteIdOf = (v: unknown): v is string => typeof v === 'string' && SITE_ID.test(v);
/** Reservations by source ({ 'bag' | 'd:N' | 'b:N': bag }), canonical (sorted, non-empty) or null. */
function sourcesOf(v: unknown): Record<string, Record<string, number>> | null {
  if (!isObj(v)) return null;
  const out: Record<string, Record<string, number>> = {};
  for (const k of Object.keys(v).sort()) {
    const b = bagOf(v[k]);
    if (!SOURCE_ID.test(k) || !b || !Object.keys(b).length) return null;
    out[k] = b;
  }
  return out;
}
const pileIdOf = (v: unknown): v is string => typeof v === 'string' && PILE_ID.test(v);
function eventsOf(v: unknown, max = 4): FellEvent[] | null {
  if (!Array.isArray(v) || v.length > max || !v.every((e) => FELL_EVENTS.includes(e as FellEvent))) return null;
  return [...v] as FellEvent[];
}

/** Canonical command or null (the caller compares fields exactly). */
export function validateWildCommand(value: Record<string, unknown>, base: Envelope): WildCommand | null {
  switch (value.type) {
    case 'pickup': {
      const at = atOf(value.at);
      if (!pickupId(value.entityId) || !at) return null;
      if (value.forSite === undefined) return { ...base, type: 'pickup', entityId: value.entityId, at };
      return siteIdOf(value.forSite) ? { ...base, type: 'pickup', entityId: value.entityId, at, forSite: value.forSite } : null;
    }
    case 'drop': {
      const at = atOf(value.at);
      return itemOf(value.item) && uint(value.n, 10_000) && value.n >= 1 && at ? { ...base, type: 'drop', item: value.item, n: value.n, at } : null;
    }
    case 'craft': {
      if (typeof value.recipe !== 'string' || !recipeById(value.recipe)) return null;
      if (value.at === undefined) return { ...base, type: 'craft', recipe: value.recipe };
      const at = atOf(value.at);
      return at ? { ...base, type: 'craft', recipe: value.recipe, at } : null;
    }
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
    case 'place_site': {
      const at = atOf(value.at);
      return isBuildingId(value.kind) && Number.isSafeInteger(value.x) && Math.abs(value.x as number) <= 2048 && Number.isSafeInteger(value.z) && Math.abs(value.z as number) <= 2048
        && uint(value.rot, 3) && at ? { ...base, type: 'place_site', kind: value.kind, x: value.x as number, z: value.z as number, rot: value.rot, at } : null;
    }
    case 'deliver_site': case 'fuel_fire': case 'store_items': case 'take_items': {
      const at = atOf(value.at);
      if (!siteIdOf(value.siteId) || !itemOf(value.item) || !uint(value.n, 10_000) || value.n < 1 || !at) return null;
      const c = { ...base, type: value.type, siteId: value.siteId, item: value.item, n: value.n, at } as WildCommand;
      // Content v5: `swap` (from the bag only): free units stand in for the site's reservations elsewhere.
      if (value.type === 'deliver_site' && value.swap !== undefined) return value.swap === true && value.from === undefined ? { ...c, swap: true } as WildCommand : null;
      if (value.type === 'deliver_site' && value.from !== undefined) return typeof value.from === 'string' && SOURCE_ID.test(value.from) ? { ...c, from: value.from } as WildCommand : null;
      if (value.type === 'take_items' && value.forSite !== undefined) return siteIdOf(value.forSite) ? { ...c, forSite: value.forSite } as WildCommand : null;
      return value.from === undefined && value.forSite === undefined ? c : null;
    }
    case 'build_work': case 'cancel_site': case 'claim_shelter': {
      const at = atOf(value.at);
      return siteIdOf(value.siteId) && at ? { ...base, type: value.type, siteId: value.siteId, at } as WildCommand : null;
    }
    case 'cook': {
      const at = atOf(value.at);
      return siteIdOf(value.siteId) && itemOf(value.item) && at ? { ...base, type: 'cook', siteId: value.siteId, item: value.item, at } : null;
    }
    case 'died': {
      const at = atOf(value.at);
      return value.cause === 'drowned' && at ? { ...base, type: 'died', cause: 'drowned', at } : null;
    }
    case 'respawn':
      return value.to === 'spawn' || siteIdOf(value.to) ? { ...base, type: 'respawn', to: value.to as string } : null;
    case 'explore': {
      const at = atOf(value.at);
      return at ? { ...base, type: 'explore', at } : null;
    }
    case 'set_waypoint':
      return Number.isSafeInteger(value.x) && Math.abs(value.x as number) <= 1022 && Number.isSafeInteger(value.z) && Math.abs(value.z as number) <= 1022
        && typeof value.name === 'string' && WAYPOINT_NAME.test(value.name)
        ? { ...base, type: 'set_waypoint', x: value.x as number, z: value.z as number, name: value.name } : null;
    case 'remove_waypoint':
      return typeof value.waypointId === 'string' && WAYPOINT_ID.test(value.waypointId) ? { ...base, type: 'remove_waypoint', waypointId: value.waypointId } : null;
    case 'mine': {
      const at = atOf(value.at);
      return typeof value.depositId === 'string' && ANY_DEPOSIT_ID.test(value.depositId) && at ? { ...base, type: 'mine', depositId: value.depositId, at } : null;
    }
    case 'smelt': {
      const at = atOf(value.at);
      return siteIdOf(value.siteId) && typeof value.recipe === 'string' && smeltRecipe(value.recipe) && at ? { ...base, type: 'smelt', siteId: value.siteId, recipe: value.recipe, at } : null;
    }
    case 'shoot': {
      const at = atOf(value.at), from = v3Of(value.from, PRESENCE_POS * 10, 20_000), dir = v3Of(value.dir, 10_100, 10_100);
      return isArrowKind(value.arrow) && from && dir && uint(value.draw, 60_000) && uint(value.t, 1000) && at
        ? { ...base, type: 'shoot', arrow: value.arrow, from, dir, draw: value.draw, t: value.t, at } : null;
    }
    case 'butcher': {
      const at = atOf(value.at);
      return typeof value.carcassId === 'string' && ANIMAL_ID.test(value.carcassId) && at ? { ...base, type: 'butcher', carcassId: value.carcassId, at } : null;
    }
    case 'horse_feed': {
      const at = atOf(value.at);
      return typeof value.horseId === 'string' && HORSE_ID.test(value.horseId) && HORSE_FEED_ITEMS.includes(value.item as HorseFeedItem) && at
        ? { ...base, type: 'horse_feed', horseId: value.horseId, item: value.item as HorseFeedItem, at } : null;
    }
    case 'horse_tack': {
      const at = atOf(value.at);
      return typeof value.horseId === 'string' && HORSE_ID.test(value.horseId) && (value.item === 'saddle' || value.item === 'bridle') && at
        ? { ...base, type: 'horse_tack', horseId: value.horseId, item: value.item, at } : null;
    }
    case 'horse_mount': {
      const at = atOf(value.at);
      return typeof value.horseId === 'string' && HORSE_ID.test(value.horseId) && at
        ? { ...base, type: 'horse_mount', horseId: value.horseId, at } : null;
    }
    case 'horse_dismount': {
      const at = atOf(value.at);
      return at ? { ...base, type: 'horse_dismount', at } : null;
    }
    case 'horse_gait':
      return HORSE_GAITS.includes(value.gait as HorseGait) ? { ...base, type: 'horse_gait', gait: value.gait as HorseGait } : null;
    case 'trade_barter': {
      const at = atOf(value.at);
      return typeof value.offerId === 'string' && !!offerById(value.offerId) && uint(value.qty, 20) && value.qty >= 1 && at
        ? { ...base, type: 'trade_barter', offerId: value.offerId, qty: value.qty, at } : null;
    }
    case 'settler_recruit': {
      const at = atOf(value.at);
      return typeof value.food === 'string' && value.food in RECRUIT_FOOD_COST && at
        ? { ...base, type: 'settler_recruit', food: value.food, at } : null;
    }
    case 'settler_assign':
      return typeof value.settlerId === 'string' && SETTLER_ID.test(value.settlerId) && SETTLER_ROLES.includes(value.role as SettlerRole)
        ? { ...base, type: 'settler_assign', settlerId: value.settlerId, role: value.role as SettlerRole } : null;
    case 'community_collect': {
      const at = atOf(value.at);
      return itemOf(value.item) && uint(value.qty, 1000) && value.qty >= 1 && at
        ? { ...base, type: 'community_collect', item: value.item, qty: value.qty, at } : null;
    }
  }
  return null;
}
/** An integer vector {x, y, z} within bounds (canonical key order), or null. */
function v3Of(v: unknown, xz: number, y: number): { x: number; y: number; z: number } | null {
  if (!isObj(v) || Object.keys(v).join() !== 'x,y,z') return null;
  const b = (n: unknown, m: number) => Number.isSafeInteger(n) && Math.abs(n as number) <= m;
  return b(v.x, xz) && b(v.y, y) && b(v.z, xz) ? { x: v.x as number, y: v.y as number, z: v.z as number } : null;
}
const HIT_KINDS: readonly HitKind[] = ['none', 'terrain', 'water', 'tree', 'trunk', 'building', 'animal'];
const HIT_RESULTS: readonly HitResult[] = ['wounded', 'killed', 'stunned', 'bruised', 'glanced'];
const shootOutcome = (arrow: ArrowKind, v: ShotValue): WildOutcome => ({
  type: 'shoot', arrow, hit: v.hit, ...(v.ref !== undefined ? { ref: v.ref } : {}), ...(v.part !== undefined ? { part: v.part } : {}), x: v.x, y: v.y, z: v.z, ms: v.ms, speed: v.speed,
  ...(v.result !== undefined ? { result: v.result } : {}), ...(v.damage !== undefined ? { damage: v.damage } : {}), ...(v.hp !== undefined ? { hp: v.hp } : {}),
  ...(v.pileId !== undefined ? { pileId: v.pileId } : {}), ...(v.broke ? { broke: true as const } : {}), startled: [...v.startled], durability: v.durability, events: [...v.events],
});
const butcherOutcome = (carcassId: string, v: { cut: number; left: number; work: number; durability: number; item?: WildItem; pileId?: string; events: FellEvent[] }): WildOutcome => ({
  type: 'butcher', carcassId, cut: v.cut, left: v.left, work: v.work, durability: v.durability, ...(v.item !== undefined ? { item: v.item, pileId: v.pileId } : {}), events: [...v.events],
});

// Outcome builders: dispatch and validation share them, so the field order is one definition.
const pickupOutcome = (entityId: string, item: WildItem, amount: number, events?: FellEvent[]): WildOutcome =>
  ({ type: 'pickup', entityId, item, amount, ...(events ? { events } : {}) });
const dropOutcome = (pileId: string, item: WildItem, n: number, stockpileId?: string, events?: FellEvent[]): WildOutcome =>
  ({ type: 'drop', pileId, item, n, ...(stockpileId ? { stockpileId } : {}), ...(events ? { events } : {}) });
const chopOutcome = (entityId: string, hp: number, max: number, durability: number, events: FellEvent[], trunk?: string, branchPile?: string): WildOutcome =>
  ({ type: 'chop', entityId, hp, max, durability, events, ...(trunk ? { trunkId: trunk } : {}), ...(branchPile ? { branchPile } : {}) });
const deliverOutcome = (siteId: string, item: WildItem, n: number, events: FellEvent[], swapped?: Record<string, number>): WildOutcome =>
  ({ type: 'deliver_site', siteId, item, n, ...(swapped ? { swapped: { ...swapped } } : {}), events });
const mineOutcome = (depositId: string, left: number, work: number, durability: number, events: FellEvent[], item?: WildItem, amount?: number): WildOutcome =>
  ({ type: 'mine', depositId, left, work, durability, ...(item !== undefined ? { item } : {}), ...(amount !== undefined ? { amount } : {}), events });
const smeltOutcome = (siteId: string, recipe: string, spent: Record<string, number>, end: number, events: FellEvent[]): WildOutcome =>
  ({ type: 'smelt', siteId, recipe, spent: { ...spent }, end, events });
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
    case 'place_site': {
      const ev = eventsOf(value.events, 1), reserved = sourcesOf(value.reserved);
      return siteIdOf(value.siteId) && isBuildingId(value.kind) && Number.isSafeInteger(value.x) && Number.isSafeInteger(value.z) && uint(value.rot, 3)
        && uint(value.cleared, 10_000) && reserved && ev ? { type: 'place_site', siteId: value.siteId, kind: value.kind, x: value.x as number, z: value.z as number, rot: value.rot,
          cleared: value.cleared, reserved, events: ev } : null;
    }
    case 'deliver_site': {
      const ev = eventsOf(value.events, 2);
      if (!siteIdOf(value.siteId) || !itemOf(value.item) || !uint(value.n, 10_000) || value.n < 1 || !ev) return null;
      if (value.swapped === undefined) return deliverOutcome(value.siteId, value.item, value.n, ev);
      const sw = isObj(value.swapped) ? value.swapped : null;
      const keys = sw ? Object.keys(sw) : [];
      if (!sw || !keys.length || keys.some((k) => k === 'bag' || !SOURCE_ID.test(k) || !uint(sw[k], 10_000) || (sw[k] as number) < 1)
        || keys.join() !== [...keys].sort().join() || keys.reduce((a, k) => a + (sw[k] as number), 0) > value.n) return null;
      return deliverOutcome(value.siteId, value.item, value.n, ev, sw as Record<string, number>);
    }
    case 'store_items': case 'take_items': {
      const ev = eventsOf(value.events, 2);
      return siteIdOf(value.siteId) && itemOf(value.item) && uint(value.n, 10_000) && value.n >= 1 && ev
        ? { type: value.type, siteId: value.siteId, item: value.item, n: value.n, events: ev } as WildOutcome : null;
    }
    case 'build_work': {
      const ev = eventsOf(value.events, 2);
      if (!siteIdOf(value.siteId) || !uint(value.stage, 10) || !uint(value.work, 1000) || !ev || value.durability !== undefined && !uint(value.durability, 1000)) return null;
      return { type: 'build_work', siteId: value.siteId, stage: value.stage, work: value.work, ...(value.durability !== undefined ? { durability: value.durability as number } : {}), events: ev };
    }
    case 'cancel_site': {
      const ev = eventsOf(value.events, 1), released = bagOf(value.released);
      return siteIdOf(value.siteId) && Array.isArray(value.piles) && value.piles.length <= 32 && value.piles.every(pileIdOf) && released && ev
        ? { type: 'cancel_site', siteId: value.siteId, piles: [...value.piles] as string[], released, events: ev } : null;
    }
    case 'claim_shelter': {
      const ev = eventsOf(value.events, 1);
      return siteIdOf(value.siteId) && ev ? { type: 'claim_shelter', siteId: value.siteId, events: ev } : null;
    }
    case 'fuel_fire': {
      const ev = eventsOf(value.events, 1);
      return siteIdOf(value.siteId) && itemOf(value.item) && uint(value.n, 10_000) && value.n >= 1 && uint(value.fuel, 100_000) && ev
        ? { type: 'fuel_fire', siteId: value.siteId, item: value.item, n: value.n, fuel: value.fuel, events: ev } : null;
    }
    case 'cook': {
      const ev = eventsOf(value.events, 1);
      return siteIdOf(value.siteId) && itemOf(value.item) && itemOf(value.made) && uint(value.fuel, 100_000) && ev
        ? { type: 'cook', siteId: value.siteId, item: value.item, made: value.made, fuel: value.fuel, events: ev } : null;
    }
    case 'died': {
      const ev = eventsOf(value.events, 1), dropped = bagOf(value.dropped);
      return value.cause === 'drowned' && dropped && Array.isArray(value.piles) && value.piles.length <= 32 && value.piles.every(pileIdOf) && ev && ev[0] === 'DIED'
        ? { type: 'died', cause: 'drowned', dropped, piles: [...value.piles] as string[], events: ev } : null;
    }
    case 'respawn': {
      const ev = eventsOf(value.events, 1), pos = (n: unknown) => Number.isSafeInteger(n) && Math.abs(n as number) <= PRESENCE_POS;
      return (value.point === 'spawn' || siteIdOf(value.point)) && pos(value.x) && pos(value.z) && ev && ev[0] === 'RESPAWNED'
        ? { type: 'respawn', point: value.point as string, x: value.x as number, z: value.z as number, events: ev } : null;
    }
    case 'explore': {
      const list = (v: unknown, re: RegExp) => Array.isArray(v) && v.length <= 64 && v.every((x) => typeof x === 'string' && re.test(x))
        && v.every((x, i) => i === 0 || (v[i - 1] as string).localeCompare(x as string) < 0);
      return uint(value.revealed, 1024) && list(value.places, PLACE_ID) && list(value.deposits, DEPOSIT_ID)
        ? { type: 'explore', revealed: value.revealed, places: [...value.places as string[]], deposits: [...value.deposits as string[]] } : null;
    }
    case 'set_waypoint': case 'remove_waypoint':
      return typeof value.waypointId === 'string' && WAYPOINT_ID.test(value.waypointId) ? { type: value.type, waypointId: value.waypointId } as WildOutcome : null;
    case 'mine': {
      const ev = eventsOf(value.events, 3);
      if (typeof value.depositId !== 'string' || !ANY_DEPOSIT_ID.test(value.depositId) || !uint(value.left, 100) || !uint(value.work, 10) || !uint(value.durability, 1000) || !ev) return null;
      // A unit came out exactly when the outcome names it (one unit of an item), and the work on the next unit starts at 0.
      if ((value.item === undefined) !== (value.amount === undefined) || value.amount !== undefined && (value.amount !== 1 || !itemOf(value.item) || value.work !== 0)) return null;
      return mineOutcome(value.depositId, value.left, value.work, value.durability, ev, value.item as WildItem | undefined, value.amount as number | undefined);
    }
    case 'smelt': {
      const ev = eventsOf(value.events, 1), spent = bagOf(value.spent);
      return siteIdOf(value.siteId) && typeof value.recipe === 'string' && smeltRecipe(value.recipe) && spent && uint(value.end, Number.MAX_SAFE_INTEGER) && ev && ev[0] === 'SMELT_STARTED'
        ? smeltOutcome(value.siteId, value.recipe, spent, value.end, ev) : null;
    }
    case 'shoot': {
      const ev = eventsOf(value.events, 3), hit = value.hit as HitKind, animal = hit === 'animal';
      const pos = (n: unknown, m: number) => Number.isSafeInteger(n) && Math.abs(n as number) <= m;
      const st = value.startled;
      const refOk = value.ref === undefined ? hit === 'none' || hit === 'terrain' || hit === 'water'
        : typeof value.ref === 'string' && (hit === 'animal' ? ANIMAL_ID.test(value.ref) : hit === 'tree' ? isTreeEntityId(value.ref) : hit === 'trunk' ? TRUNK_ID.test(value.ref) : hit === 'building' ? SITE_ID.test(value.ref) : false);
      if (!isArrowKind(value.arrow) || !HIT_KINDS.includes(hit) || !refOk || !ev || ev[0] !== 'ARROW_SHOT'
        || (value.part !== undefined) !== animal || animal && value.part !== 'body' && value.part !== 'head'
        || (value.result !== undefined) !== animal || animal && !HIT_RESULTS.includes(value.result as HitResult)
        || (value.damage !== undefined) !== animal || animal && !uint(value.damage, 100) || (value.hp !== undefined) !== animal || animal && !uint(value.hp, 100)
        || !pos(value.x, PRESENCE_POS * 10) || !pos(value.y, 20_000) || !pos(value.z, PRESENCE_POS * 10) || !uint(value.ms, 10_000) || !uint(value.speed, 1000)
        || value.pileId !== undefined && !pile(value.pileId) || value.broke !== undefined && (value.broke !== true || animal || value.pileId !== undefined)
        || !Array.isArray(st) || st.length > 16 || !st.every((x, i) => typeof x === 'string' && ANIMAL_ID.test(x) && (i === 0 || (st[i - 1] as string) < x))
        || !uint(value.durability, 1000)) return null;
      return shootOutcome(value.arrow, {
        hit, ...(value.ref !== undefined ? { ref: value.ref as string } : {}), ...(animal ? { part: value.part as 'body' | 'head' } : {}),
        x: value.x as number, y: value.y as number, z: value.z as number, ms: value.ms, speed: value.speed,
        ...(animal ? { result: value.result as HitResult, damage: value.damage as number, hp: value.hp as number } : {}),
        ...(value.pileId !== undefined ? { pileId: value.pileId as string } : {}), ...(value.broke ? { broke: true as const } : {}),
        startled: [...st as string[]], durability: value.durability, events: ev,
      });
    }
    case 'butcher': {
      const ev = eventsOf(value.events, 2);
      if (typeof value.carcassId !== 'string' || !ANIMAL_ID.test(value.carcassId) || !uint(value.cut, 20) || !uint(value.left, 20) || !uint(value.work, 10)
        || !uint(value.durability, 1000) || !ev) return null;
      // An output came off exactly when the outcome names it (one item and its pile), and work on the next starts at 0.
      if ((value.item === undefined) !== (value.pileId === undefined) || value.item !== undefined && (!itemOf(value.item) || !pile(value.pileId) || value.work !== 0)) return null;
      return butcherOutcome(value.carcassId, { cut: value.cut, left: value.left, work: value.work, durability: value.durability,
        ...(value.item !== undefined ? { item: value.item as WildItem, pileId: value.pileId as string } : {}), events: ev });
    }
    case 'horse_feed':
      return typeof value.horseId === 'string' && HORSE_ID.test(value.horseId) && HORSE_FEED_ITEMS.includes(value.item as HorseFeedItem)
        && uint(value.trust, HORSE_MAX_TRUST) && typeof value.tamed === 'boolean'
        ? { type: 'horse_feed', horseId: value.horseId, item: value.item as HorseFeedItem, trust: value.trust, tamed: value.tamed } : null;
    case 'horse_tack':
      return typeof value.horseId === 'string' && HORSE_ID.test(value.horseId) && (value.item === 'saddle' || value.item === 'bridle')
        && typeof value.saddled === 'boolean' && typeof value.bridled === 'boolean'
        ? { type: 'horse_tack', horseId: value.horseId, item: value.item, saddled: value.saddled, bridled: value.bridled } : null;
    case 'horse_mount': case 'horse_dismount':
      return typeof value.horseId === 'string' && HORSE_ID.test(value.horseId) ? { type: value.type, horseId: value.horseId } as WildOutcome : null;
    case 'horse_gait':
      return HORSE_GAITS.includes(value.gait as HorseGait) ? { type: 'horse_gait', gait: value.gait as HorseGait } : null;
    case 'trade_barter':
      return typeof value.offerId === 'string' && !!offerById(value.offerId) && uint(value.qty, 20) && value.qty >= 1
        && typeof value.received === 'string' && uint(value.receivedQty, 1000) && uint(value.stockLeft, 100)
        ? { type: 'trade_barter', offerId: value.offerId, qty: value.qty, received: value.received, receivedQty: value.receivedQty, stockLeft: value.stockLeft } : null;
    case 'settler_recruit':
      return typeof value.settlerId === 'string' && SETTLER_ID.test(value.settlerId) && typeof value.name === 'string' && value.name.length > 0
        && typeof value.food === 'string' && uint(value.foodSpent, 100)
        ? { type: 'settler_recruit', settlerId: value.settlerId, name: value.name, food: value.food, foodSpent: value.foodSpent } : null;
    case 'settler_assign':
      return typeof value.settlerId === 'string' && SETTLER_ID.test(value.settlerId) && SETTLER_ROLES.includes(value.role as SettlerRole)
        ? { type: 'settler_assign', settlerId: value.settlerId, role: value.role as SettlerRole } : null;
    case 'community_collect':
      return itemOf(value.item) && uint(value.qty, 1000) && value.qty >= 1
        ? { type: 'community_collect', item: value.item, qty: value.qty } : null;
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
    case 'place_site': return o.type === 'place_site' && o.kind === c.kind && o.x === c.x && o.z === c.z && o.rot === c.rot;
    case 'deliver_site': case 'store_items': case 'take_items': case 'fuel_fire':
      if (c.type === 'deliver_site' && o.type === 'deliver_site' && o.swapped !== undefined && c.swap !== true) return false;
      return (o.type === 'deliver_site' || o.type === 'store_items' || o.type === 'take_items' || o.type === 'fuel_fire') && o.siteId === c.siteId && o.item === c.item && o.n === c.n;
    case 'build_work': case 'cancel_site': case 'claim_shelter':
      return (o.type === 'build_work' || o.type === 'cancel_site' || o.type === 'claim_shelter') && o.siteId === c.siteId;
    case 'cook': return o.type === 'cook' && o.siteId === c.siteId && o.item === c.item;
    case 'died': return o.type === 'died' && o.cause === c.cause;
    case 'respawn': return o.type === 'respawn' && o.point === c.to;
    case 'explore': return true;
    case 'set_waypoint': return o.type === 'set_waypoint';
    case 'remove_waypoint': return o.type === 'remove_waypoint' && o.waypointId === c.waypointId;
    case 'mine': return o.type === 'mine' && o.depositId === c.depositId;
    case 'smelt': return o.type === 'smelt' && o.siteId === c.siteId && o.recipe === c.recipe;
    case 'shoot': return o.type === 'shoot' && o.arrow === c.arrow;
    case 'butcher': return o.type === 'butcher' && o.carcassId === c.carcassId;
    case 'horse_feed': return o.type === 'horse_feed' && o.horseId === c.horseId && o.item === c.item;
    case 'horse_tack': return o.type === 'horse_tack' && o.horseId === c.horseId && o.item === c.item;
    case 'horse_mount': return o.type === 'horse_mount' && o.horseId === c.horseId;
    case 'horse_dismount': return o.type === 'horse_dismount';
    case 'horse_gait': return o.type === 'horse_gait' && o.gait === c.gait;
    case 'trade_barter': return o.type === 'trade_barter' && o.offerId === c.offerId && o.qty === c.qty;
    case 'settler_recruit': return o.type === 'settler_recruit' && o.food === c.food;
    case 'settler_assign': return o.type === 'settler_assign' && o.settlerId === c.settlerId && o.role === c.role;
    case 'community_collect': return o.type === 'community_collect' && o.item === c.item && o.qty === c.qty;
  }
}

export type WildDispatch = { ok: true; value: WildOutcome } | { ok: false; code: string; reasons: string[] };

export function dispatchWild(world: World, c: WildCommand): WildDispatch {
  const r = dispatchWildRules(world, c);
  // W7 (content v8): chopping, cutting, mining and building are loud; the wildlife hears where.
  if (r.ok && world.wild?.wildlife && (c.type === 'chop' || c.type === 'cut_log' || c.type === 'mine' || c.type === 'build_work')) noteNoise(world, c.at);
  return r;
}

function dispatchWildRules(world: World, c: WildCommand): WildDispatch {
  if (c.type === 'upgrade_wilderness') {
    const tick = world.life?.tick ?? 0;
    if (!world.wild) {
      world.wild = createWildState(c.content, world.seed, tick);
      return { ok: true, value: { type: 'upgrade_wilderness', content: c.content } };
    }
    if (world.wild.content >= c.content) return { ok: false, code: 'already_current', reasons: [`this world already has wilderness content v${world.wild.content}`] };
    upgradeWildState(world.wild, world.seed, tick, c.content);
    return { ok: true, value: { type: 'upgrade_wilderness', content: c.content } };
  }
  if (!world.wild) return { ok: false, code: 'wilderness', reasons: ['this world predates gathering (wilderness content v1); it needs upgrade_wilderness first'] };
  const felling = !!world.wild.fell;
  if ((c.type === 'chop' || c.type === 'cut_log' || c.type === 'mark_stockpile') && !felling) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates tree felling (wilderness content v2); it needs upgrade_wilderness first'] };
  }
  const building = !!world.wild.build;
  const W4 = ['place_site', 'deliver_site', 'build_work', 'cancel_site', 'claim_shelter', 'fuel_fire', 'cook', 'store_items', 'take_items', 'died', 'respawn'];
  if (W4.includes(c.type) && !building) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates building (wilderness content v3); it needs upgrade_wilderness first'] };
  }
  if (MAP_COMMAND_TYPES.includes(c.type) && !world.wild.map) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates the map (wilderness content v5); it needs upgrade_wilderness first'] };
  }
  if (MINING_COMMAND_TYPES.includes(c.type) && (world.wild.content < WILD_CONTENT_V7 || !world.wild.mine)) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates mining (wilderness content v6); it needs upgrade_wilderness first'] };
  }
  if (HUNT_COMMAND_TYPES.includes(c.type) && (world.wild.content < WILD_CONTENT_V9 || !world.wild.hunt || !world.wild.wildlife)) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates hunting (wilderness content v8); it needs upgrade_wilderness first'] };
  }
  if (HORSE_COMMAND_TYPES.includes(c.type) && (world.wild.content < WILD_CONTENT_V10 || !world.wild.horses)) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates horses (wilderness content v9); it needs upgrade_wilderness first'] };
  }
  if (COMMUNITY_COMMAND_TYPES.includes(c.type) && (world.wild.content < WILD_CONTENT_V11 || !world.wild.community)) {
    return { ok: false, code: 'wilderness', reasons: ['this world predates trade and settlers (wilderness content v10); it needs upgrade_wilderness first'] };
  }
  // A recorded death waits for its respawn: nothing else is done by a dead character.
  if (world.wild.build?.death && c.type !== 'respawn' && c.type !== 'died') {
    return { ok: false, code: 'dead', reasons: ['you are dead: wake first (respawn)'] };
  }
  const evOut = <T extends { events: FellEvent[] }>(r: { ok: true; value: T } | { ok: false; code: string; reasons: string[] }, f: (v: T) => WildOutcome): WildDispatch =>
    r.ok ? { ok: true, value: f(r.value) } : r;
  switch (c.type) {
    case 'place_site':
      return evOut(placeWildSite(world, c.kind, c.x, c.z, c.rot, c.at), (v) => ({ type: 'place_site', siteId: v.siteId, kind: c.kind, x: c.x, z: c.z, rot: c.rot, cleared: v.cleared, reserved: v.reserved, events: v.events }));
    case 'deliver_site':
      return evOut(deliverToSite(world, c.siteId, c.item, c.n, c.at, c.from ?? 'bag', c.swap === true), (v) => deliverOutcome(c.siteId, c.item, c.n, v.events, v.swapped));
    case 'build_work':
      return evOut(workOnSite(world, c.siteId, c.at), (v) => ({ type: 'build_work', siteId: c.siteId, stage: v.stage, work: v.work, ...(v.durability !== undefined ? { durability: v.durability } : {}), events: v.events }));
    case 'cancel_site':
      return evOut(cancelWildSite(world, c.siteId, c.at), (v) => ({ type: 'cancel_site', siteId: c.siteId, piles: v.piles, released: v.released, events: v.events }));
    case 'claim_shelter':
      return evOut(claimShelter(world, c.siteId, c.at), (v) => ({ type: 'claim_shelter', siteId: c.siteId, events: v.events }));
    case 'fuel_fire':
      return evOut(fuelFire(world, c.siteId, c.item, c.n, c.at), (v) => ({ type: 'fuel_fire', siteId: c.siteId, item: c.item, n: c.n, fuel: v.fuel, events: v.events }));
    case 'cook':
      return evOut(cookAtFire(world, c.siteId, c.item, c.at), (v) => ({ type: 'cook', siteId: c.siteId, item: c.item, made: v.made, fuel: v.fuel, events: v.events }));
    case 'store_items':
      return evOut(storeItems(world, c.siteId, c.item, c.n, c.at), (v) => ({ type: 'store_items', siteId: c.siteId, item: c.item, n: c.n, events: v.events }));
    case 'take_items':
      return evOut(takeItems(world, c.siteId, c.item, c.n, c.at, c.forSite), (v) => ({ type: 'take_items', siteId: c.siteId, item: c.item, n: c.n, events: v.events }));
    case 'died':
      return evOut(recordDeath(world, c.cause, c.at), (v) => ({ type: 'died', cause: c.cause, dropped: v.dropped, piles: v.piles, events: v.events }));
    case 'respawn': {
      const r = respawnPlayer(world, c.to);
      // W5: the next exploration report is measured from where the character woke.
      if (r.ok && world.wild.map) noteLanding(world, world.wild.map, { x: r.value.x, z: r.value.z });
      return evOut(r, (v) => ({ type: 'respawn', point: v.point, x: v.x, z: v.z, events: v.events }));
    }
    case 'explore': {
      const anchors = () => { const home = homeShelter(world); return [spawnPoint(world), ...(home ? [siteSpotDm(home)] : [])]; };
      const r = exploreAt(world, world.wild.map!, c.at, anchors);
      return r.ok ? { ok: true, value: { type: 'explore', revealed: r.value.revealed, places: r.value.places, deposits: r.value.deposits } } : r;
    }
    case 'set_waypoint': {
      const r = setWaypoint(world.wild.map!, c.x, c.z, c.name);
      return r.ok ? { ok: true, value: { type: 'set_waypoint', waypointId: r.value.waypointId } } : r;
    }
    case 'remove_waypoint': {
      const r = removeWaypoint(world.wild.map!, c.waypointId);
      return r.ok ? { ok: true, value: { type: 'remove_waypoint', waypointId: r.value.waypointId } } : r;
    }
    case 'mine': {
      const r = mineDeposit(world, c.depositId, c.at);
      return r.ok ? { ok: true, value: mineOutcome(c.depositId, r.value.left, r.value.work, r.value.durability, r.value.events, r.value.item, r.value.amount) } : r;
    }
    case 'smelt': {
      const r = smeltAt(world, c.siteId, c.recipe, c.at);
      return r.ok ? { ok: true, value: smeltOutcome(c.siteId, c.recipe, r.value.spent, r.value.end, r.value.events) } : r;
    }
    case 'shoot': {
      const r = shoot(world, { arrow: c.arrow, from: c.from, dir: c.dir, draw: c.draw, t: c.t, at: c.at });
      return r.ok ? { ok: true, value: shootOutcome(c.arrow, r.value) } : r;
    }
    case 'butcher': {
      const r = butcher(world, c.carcassId, c.at);
      return r.ok ? { ok: true, value: butcherOutcome(c.carcassId, r.value) } : r;
    }
    case 'pickup': {
      const r = pickUp(world, c.entityId, c.at, c.forSite);
      if (!r.ok) return r;
      const ev = felling && r.value.item === 'log' ? [noteEvent(world, 'LOGS_COLLECTED', c.entityId, r.value.amount)] : undefined;
      return { ok: true, value: pickupOutcome(c.entityId, r.value.item, r.value.amount, ev) };
    }
    case 'drop': {
      // W3: logs dropped at a stockpile marker are delivered there.
      const s = felling && c.item === 'log' ? stockpileAt(world, c.at.x / 10, c.at.z / 10) : null;
      if (s) {
        if ((world.wild.items.log ?? 0) < c.n) return { ok: false, code: 'missing', reasons: [`you carry ${world.wild.items.log ?? 0} log`] };
        const held = building ? bagRefusal(world, 'log', c.n, 'drop them') : null;
        if (held) return { ok: false, ...held };
        if (world.wild.piles.size >= 512) return { ok: false, code: 'too_many_piles', reasons: ['too many dropped piles in this world'] };
        const d = deliverLogs(world, s, c.n);
        return { ok: true, value: dropOutcome(d.pileId, c.item, c.n, s.id, d.events) };
      }
      const r = dropItems(world, c.item, c.n, c.at);
      return r.ok ? { ok: true, value: dropOutcome(r.value.pileId, c.item, c.n) } : r;
    }
    case 'craft': {
      // W4: a workbench recipe is made within reach of a finished workbench.
      const recipe = recipeById(c.recipe)!;
      if (recipe.since !== undefined && world.wild.content < recipe.since) return { ok: false, code: 'content', reasons: [`${recipe.label} is not known in this world yet (wilderness content v${recipe.since})`] };
      if (recipe.station !== 'hand' && !building) return { ok: false, code: 'wilderness', reasons: ['this world predates building (wilderness content v3); it needs upgrade_wilderness first'] };
      if (recipe.station !== 'hand' && !c.at) return { ok: false, code: 'station', reasons: [`${recipe.label} is made at a ${recipe.station}: stand by one`] };
      const atStation = recipe.station !== 'hand' && !!c.at && stationNear(world, recipe.station, c.at);
      if (recipe.station !== 'hand' && !atStation) return { ok: false, code: 'station', reasons: [`${recipe.label} is made at a ${recipe.station}: walk up to a finished one`] };
      const r = craft(world, c.recipe, atStation);
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
    // ---- W9 (content v10): horses ----
    case 'horse_feed': {
      const hs = world.wild.horses!;
      if (!hs.seeded) ensureWildHorses(world);
      const h = hs.horses.get(c.horseId);
      if (!h) return { ok: false, code: 'missing', reasons: [`no horse ${c.horseId}`] };
      if (h.state === 'flee') return { ok: false, code: 'spooked', reasons: ['the horse is fleeing; wait for it to calm down'] };
      const dist = Math.hypot(h.x - c.at.x, h.z - c.at.z) / 10;
      if (dist > HORSE_REACH) return { ok: false, code: 'out_of_reach', reasons: ['walk closer to the horse to feed it'] };
      const tick = world.life?.tick ?? 0;
      if (tick - h.lastFedTick < FEED_COOLDOWN_TICKS) return { ok: false, code: 'too_fast', reasons: ['let the horse finish eating before offering more'] };
      if ((world.wild.items[c.item] ?? 0) < 1) return { ok: false, code: 'missing_item', reasons: [`you have no ${c.item} in your bag`] };
      const held = world.wild.build ? bagRefusal(world, c.item, 1, 'feed them to a horse') : null;
      if (held) return { ok: false, ...held };
      world.wild.items[c.item] -= 1;
      if (world.wild.items[c.item] === 0) delete world.wild.items[c.item];
      const gain = feedTrustGain(h.temperament, c.item);
      h.trust = Math.min(HORSE_MAX_TRUST, h.trust + gain);
      if (h.trust >= HORSE_MAX_TRUST) h.tamed = true;
      h.lastFedTick = tick;
      h.feeds += 1;
      h.state = 'idle';
      return { ok: true, value: { type: 'horse_feed', horseId: h.id, item: c.item, trust: h.trust, tamed: h.tamed } };
    }
    case 'horse_tack': {
      const hs = world.wild.horses!;
      if (!hs.seeded) ensureWildHorses(world);
      const h = hs.horses.get(c.horseId);
      if (!h) return { ok: false, code: 'missing', reasons: [`no horse ${c.horseId}`] };
      if (!h.tamed) return { ok: false, code: 'wild', reasons: ['tame the horse with food before fitting tack'] };
      const dist = Math.hypot(h.x - c.at.x, h.z - c.at.z) / 10;
      if (dist > HORSE_REACH) return { ok: false, code: 'out_of_reach', reasons: ['walk closer to the horse to equip tack'] };
      if (c.item === 'saddle' && h.saddled) return { ok: false, code: 'already', reasons: ['this horse is already saddled'] };
      if (c.item === 'bridle' && h.bridled) return { ok: false, code: 'already', reasons: ['this horse is already bridled'] };
      if ((world.wild.items[c.item] ?? 0) < 1) return { ok: false, code: 'missing_item', reasons: [`you have no ${c.item} in your bag`] };
      const held = world.wild.build ? bagRefusal(world, c.item, 1, 'equip it on a horse') : null;
      if (held) return { ok: false, ...held };
      world.wild.items[c.item] -= 1;
      if (world.wild.items[c.item] === 0) delete world.wild.items[c.item];
      if (c.item === 'saddle') h.saddled = true;
      else h.bridled = true;
      return { ok: true, value: { type: 'horse_tack', horseId: h.id, item: c.item, saddled: h.saddled, bridled: h.bridled } };
    }
    case 'horse_mount': {
      const hs = world.wild.horses!;
      if (!hs.seeded) ensureWildHorses(world);
      if (hs.mountedId) return { ok: false, code: 'mounted', reasons: ['dismount your current horse first'] };
      const h = hs.horses.get(c.horseId);
      if (!h) return { ok: false, code: 'missing', reasons: [`no horse ${c.horseId}`] };
      if (!h.tamed) return { ok: false, code: 'wild', reasons: ['you cannot mount an untamed horse'] };
      if (!h.saddled || !h.bridled) return { ok: false, code: 'no_tack', reasons: ['a horse needs both a saddle and a bridle before you can ride it'] };
      const dist = Math.hypot(h.x - c.at.x, h.z - c.at.z) / 10;
      if (dist > HORSE_REACH) return { ok: false, code: 'out_of_reach', reasons: ['walk closer to the horse to mount'] };
      hs.mountedId = h.id;
      hs.gait = 'walk';
      h.state = 'mounted';
      return { ok: true, value: { type: 'horse_mount', horseId: h.id } };
    }
    case 'horse_dismount': {
      const hs = world.wild.horses!;
      if (!hs.mountedId) return { ok: false, code: 'not_mounted', reasons: ['you are not riding a horse'] };
      const h = hs.horses.get(hs.mountedId);
      const id = hs.mountedId;
      hs.mountedId = null;
      hs.gait = 'walk';
      if (h) {
        h.x = c.at.x;
        h.z = c.at.z;
        h.state = 'idle';
      }
      return { ok: true, value: { type: 'horse_dismount', horseId: id } };
    }
    case 'horse_gait': {
      const hs = world.wild.horses!;
      if (!hs.mountedId) return { ok: false, code: 'not_mounted', reasons: ['mount a horse before changing gait'] };
      const h = hs.horses.get(hs.mountedId);
      if (c.gait === 'gallop' && h && h.stamina < HORSE_GALLOP_MIN_STAMINA) {
        return { ok: false, code: 'tired', reasons: ['the horse is too winded to gallop; let it walk to recover stamina'] };
      }
      hs.gait = c.gait;
      return { ok: true, value: { type: 'horse_gait', gait: c.gait } };
    }
    // ---- W10 (content v11): trade & settlers ----
    case 'trade_barter': {
      const cm = world.wild.community!;
      if (!tradingPostNear(world, c.at)) return { ok: false, code: 'no_trading_post', reasons: ['stand beside a finished trading post to barter'] };
      const offer = offerById(c.offerId)!;
      const avail = cm.stock[offer.id] ?? 0;
      if (avail < c.qty) return { ok: false, code: 'out_of_stock', reasons: [`merchant only has ${avail} left of ${offer.label}`] };
      let removedWeight = 0;
      for (const [k, needPer] of Object.entries(offer.give)) {
        const need = needPer * c.qty;
        if ((world.wild.items[k] ?? 0) < need) return { ok: false, code: 'missing_item', reasons: [`need ${need} ${k} to trade`] };
        const held = world.wild.build ? bagRefusal(world, k as WildItem, need, 'trade them') : null;
        if (held) return { ok: false, ...held };
        removedWeight += (ITEM_WEIGHT[k as WildItem] ?? 0) * need;
      }
      const addedQty = offer.receiveQty * c.qty;
      const addedWeight = (ITEM_WEIGHT[offer.receive as WildItem] ?? 0) * addedQty;
      const cap = carryCapacity(world.wild);
      if (carriedWeight(world.wild) - removedWeight + addedWeight > cap) {
        return { ok: false, code: 'too_heavy', reasons: ['not enough room in your bag for the traded goods'] };
      }
      for (const [k, needPer] of Object.entries(offer.give)) {
        const need = needPer * c.qty;
        world.wild.items[k] -= need;
        if (world.wild.items[k] === 0) delete world.wild.items[k];
      }
      world.wild.items[offer.receive] = (world.wild.items[offer.receive] ?? 0) + addedQty;
      cm.stock[offer.id] = avail - c.qty;
      cm.tradesCompleted += c.qty;
      return { ok: true, value: { type: 'trade_barter', offerId: offer.id, qty: c.qty, received: offer.receive, receivedQty: addedQty, stockLeft: cm.stock[offer.id] } };
    }
    case 'settler_recruit': {
      const cm = world.wild.community!;
      const posts = finishedTradingPosts(world);
      if (!posts.length || !tradingPostNear(world, c.at)) {
        return { ok: false, code: 'no_trading_post', reasons: ['build a trading post and stand near it to welcome a settler'] };
      }
      if (cm.settlers.size >= MAX_SETTLERS) return { ok: false, code: 'full', reasons: ['settlement is at maximum settler capacity'] };
      const cap = shelterCapacity(world);
      if (cm.settlers.size >= cap) {
        return { ok: false, code: 'no_shelter', reasons: [`need finished shelter capacity (have ${cap} for ${cm.settlers.size} settlers); build a lean-to first`] };
      }
      if (!hasSettlementStorage(world)) {
        return { ok: false, code: 'no_storage', reasons: ['need settlement storage (log store, trading post or chest) before recruiting'] };
      }
      const foodCost = RECRUIT_FOOD_COST[c.food];
      if (!foodCost) return { ok: false, code: 'not_food', reasons: ['offer real food rations (cooked meat, cooked mushrooms or berries)'] };
      if ((world.wild.items[c.food] ?? 0) < foodCost) {
        return { ok: false, code: 'missing_food', reasons: [`need ${foodCost} ${c.food} in your bag as settler arrival rations`] };
      }
      const held = world.wild.build ? bagRefusal(world, c.food as WildItem, foodCost, 'feed a new settler') : null;
      if (held) return { ok: false, ...held };
      world.wild.items[c.food] -= foodCost;
      if (world.wild.items[c.food] === 0) delete world.wild.items[c.food];
      const num = cm.nextSettlerId++;
      const id = `s:${num}`;
      const name = nextSettlerName(world.seed, num - 1);
      const spot = siteSpotOf(posts[0]);
      const angle = (num - 1) * 1.1;
      const sx = Math.round((spot.x + Math.cos(angle) * 2.2) * 10);
      const sz = Math.round((spot.z + Math.sin(angle) * 2.2) * 10);
      cm.settlers.set(id, { id, name, role: 'idle', x: sx, z: sz, workTicks: 0, produced: 0, cycles: 0 });
      return { ok: true, value: { type: 'settler_recruit', settlerId: id, name, food: c.food, foodSpent: foodCost } };
    }
    case 'settler_assign': {
      const cm = world.wild.community!;
      const s = cm.settlers.get(c.settlerId);
      if (!s) return { ok: false, code: 'missing', reasons: [`no settler ${c.settlerId}`] };
      s.role = c.role;
      return { ok: true, value: { type: 'settler_assign', settlerId: s.id, role: s.role } };
    }
    case 'community_collect': {
      const cm = world.wild.community!;
      if (!tradingPostNear(world, c.at)) return { ok: false, code: 'no_trading_post', reasons: ['stand by a finished trading post to collect depot goods'] };
      const have = cm.depot[c.item] ?? 0;
      if (have < c.qty) return { ok: false, code: 'missing_item', reasons: [`depot only holds ${have} ${c.item}`] };
      const addWeight = (ITEM_WEIGHT[c.item] ?? 0) * c.qty;
      if (carriedWeight(world.wild) + addWeight > carryCapacity(world.wild)) {
        return { ok: false, code: 'too_heavy', reasons: ['not enough room in your bag to carry that much from the depot'] };
      }
      cm.depot[c.item] -= c.qty;
      if (cm.depot[c.item] === 0) delete cm.depot[c.item];
      world.wild.items[c.item] = (world.wild.items[c.item] ?? 0) + c.qty;
      return { ok: true, value: { type: 'community_collect', item: c.item, qty: c.qty } };
    }
  }
}

export { WILD_RECIPES, WILD_CONTENT_V2, WILD_CONTENT_V4, WILD_CONTENT_V5, WILD_CONTENT_V6, WILD_CONTENT_V7, WILD_CONTENT_V8, WILD_CONTENT_V9, WILD_CONTENT_V10, WILD_CONTENT_V11 };
