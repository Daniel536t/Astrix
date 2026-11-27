// The steward's decisions (the in-game AI agent), as a pure function of the
// authoritative state. It runs in the owner's browser every 15th tick and
// acts only through journaled, permission-checked commands (`actor:
// 'steward'`), so replay never depends on it. Tests and the evidence harness
// call the same function the app calls.
//
// STAB-002 S3: under settlement rules v7 the cooldown is world state
// (`steward.lastAssign`, saved and hashed, set by the steward's own
// assign_role or role request), so a reload never changes what it does next.
// The rules changed too (see `v7Move`). Rules v1-v6 keep the old rules and the
// old in-page cooldown, exactly as before.
import type { World } from '../sim/world';
import {
  DAY_TICKS, Role, SITE_RULES, SPECIES_RULES, fenceCost, findFieldSpot, isHerdHomestead, siteShortfall, woodlot,
} from '../sim/homestead';
import type { HomesteadState, Villager } from '../sim/homestead';
import { FOUNDER_STOCKPILE_ID } from '../sim/economy';

/** The steward looks at the farm every this many ticks. */
export const STEWARD_EVERY = 15;
/** v7: wait between role changes that serve approved work (a site with nobody to build it or fell for it). */
export const STEWARD_SITE_COOLDOWN = 60;
/** Wait between other role changes (and below v7, between any). */
export const STEWARD_COOLDOWN = 300;

export interface StewardMove { villagerId: string; name: string; role: Role; why: string }
export interface StewardPlan { move: StewardMove | null; field: string | null }
/** Below rules v7 the cooldown lived in the page (reset on every load); kept for those rules only. */
export interface StewardMemory { lastAssignTick: number }
export const newStewardMemory = (): StewardMemory => ({ lastAssignTick: -1000 });

const workCounts = (h: HomesteadState) => ({
  farm: h.plots.filter((p) => p.state === 'ripe' || p.state === 'wild' || (p.state === 'growing' && p.moisture <= 4)).length,
  herd: h.enclosures.filter((e) => e.water <= 10 || e.feed <= 4).length
    + h.animals.filter((a) => { const p = SPECIES_RULES[a.species].product; return p && p.resource !== 'eggs' && a.product >= p.every; }).length,
});
const move = (v: Villager, role: Role, why: string): StewardMove => ({ villagerId: v.id, name: v.name, role, why });

/** Rules v1-v6: the rules the app ran before STAB-002 S3, unchanged. */
function legacyMove(world: World, h: HomesteadState, tick: number, mem: StewardMemory): StewardMove | null {
  if (tick - mem.lastAssignTick < STEWARD_COOLDOWN || h.steward.policy.assign_role === 'off') return null;
  const { farm, herd } = workCounts(h);
  const farmers = h.villagers.filter((v) => v.role === 'farmer'), herders = h.villagers.filter((v) => v.role === 'herder');
  const approved = (h.sites ?? []).filter((st) => st.state === 'approved');
  const spare = farmers.length > 1 || (farmers.length === 1 && h.plots.length === 0) ? farmers[farmers.length - 1] : null;
  if (spare && approved.length && !h.villagers.some((v) => v.role === 'builder')) return move(spare, 'builder', `the ${SITE_RULES[approved[0].kind].label.toLowerCase()} is approved and nobody is building it`);
  if (spare && approved.some((st) => (SITE_RULES[st.kind].cost.wood ?? 0) > (st.delivered.wood ?? 0) + (st.reserved.wood ?? 0)) && !h.villagers.some((v) => v.role === 'woodcutter')
    && woodlot(world, h).trees.length) return move(spare, 'woodcutter', 'a building site is waiting for timber');
  if (farm >= 3 && herd === 0 && herders.length > 1) return move(herders[0], 'farmer', `${farm} fields need work and the animals are fine`);
  if (herd >= 3 && farm === 0 && farmers.length > 1) return move(farmers[0], 'herder', `${herd} animal tasks waiting and the fields are fine`);
  if (farmers.length === 0 && h.plots.length > 0 && herders.length) return move(herders[herders.length - 1], 'farmer', 'fields need a farmer');
  if (herders.length === 0 && h.animals.length > 0 && farmers.length) return move(farmers[farmers.length - 1], 'herder', 'the animals need a herder');
  return null;
}

/**
 * Rules v7. Approved work is everyone's in the simulation (any free villager
 * hauls, builds and fells for a site), so the steward only sharpens it:
 *  - an approved or cancelled site with no builder gets one within 60 ticks;
 *    a site short of wood with no woodcutter gets one (from any role, not only
 *    a "spare" farmer); a builder with nothing left to build goes back;
 *  - other moves wait 300 ticks, and a farmer is never made a herder in the
 *    first day or while there are fewer fields than farmers.
 */
function v7Move(world: World, h: HomesteadState, tick: number): StewardMove | null {
  if (h.steward.policy.assign_role === 'off') return null;
  const since = tick - (h.steward.lastAssign ?? -1_000_000);
  const vs = [...h.villagers].sort((a, b) => a.id.localeCompare(b.id));
  const of = (r: Role) => vs.filter((v) => v.role === r);
  const farmers = of('farmer'), herders = of('herder'), builders = of('builder'), woodcutters = of('woodcutter');
  const { farm, herd } = workCounts(h);
  const approved = (h.sites ?? []).filter((st) => st.state === 'approved');
  const reclaim = (h.sites ?? []).filter((st) => st.state === 'cancelled');
  /** The villager whose own work is missed least: a second farmer or herder, then a farmer with no fields, then the role with less waiting. */
  const spare = (): Villager | null => {
    if (farmers.length >= 2) return farmers[farmers.length - 1];
    if (herders.length >= 2) return herders[herders.length - 1];
    if (farmers.length === 1 && (h.plots.length === 0 || !herders.length)) return farmers[0];
    if (farmers.length === 1 && herders.length === 1) return farm <= herd ? farmers[0] : herders[0];
    return herders[0] ?? null;
  };
  if (since >= STEWARD_SITE_COOLDOWN) {
    const site = approved[0] ?? reclaim[0];
    if (site && !builders.length) {
      const s = spare();
      if (s) return move(s, 'builder', `the ${SITE_RULES[site.kind].label.toLowerCase()} is ${site.state === 'approved' ? 'approved' : 'cancelled'} and nobody is a builder`);
    }
    if (approved.some((st) => (siteShortfall(h, st).wood ?? 0) > 0) && !woodcutters.length && woodlot(world, h).trees.length) {
      const s = spare();
      if (s) return move(s, 'woodcutter', 'a building site is waiting for timber and the store has none');
    }
    if (!approved.length && !reclaim.length && builders.length) {
      const b = builders[builders.length - 1];
      const role: Role = !herders.length && h.animals.length ? 'herder' : 'farmer';
      return move(b, role, 'every approved building is finished');
    }
  }
  if (since < STEWARD_COOLDOWN) return null;
  if (farm >= 3 && herd === 0 && herders.length > 1) return move(herders[0], 'farmer', `${farm} fields need work and the animals are fine`);
  if (herd >= 3 && farm === 0 && farmers.length > 1 && h.plots.length >= farmers.length && tick >= DAY_TICKS) {
    return move(farmers[0], 'herder', `${herd} animal tasks waiting and the fields are fine`);
  }
  if (farmers.length === 0 && h.plots.length > 0 && (herders.length > 1 || !h.animals.length)) return move(herders[herders.length - 1], 'farmer', 'fields need a farmer');
  if (herders.length === 0 && h.animals.length > 0 && (farmers.length > 1 || (farmers.length === 1 && !h.plots.length))) return move(farmers[farmers.length - 1], 'herder', 'the animals need a herder');
  return null;
}

/** What the steward wants to do this tick (nothing when it is switched off). Below v7 `mem` holds the page cooldown and is updated. */
export function stewardPlan(world: World, tick: number, mem: StewardMemory): StewardPlan {
  const h = world.homestead, life = world.life;
  if (!h || !life || !h.steward.enabled) return { move: null, field: null };
  let m: StewardMove | null;
  if (isHerdHomestead(h)) m = v7Move(world, h, tick);
  else { m = legacyMove(world, h, tick, mem); if (m) mem.lastAssignTick = tick; }
  // Suggest another field when every field is busy and there is seed and wood to spare.
  const s = life.stockpiles.get(FOUNDER_STOCKPILE_ID)!.inventory;
  const busy = h.plots.length > 0 && h.plots.every((p) => p.state === 'growing' || p.state === 'ripe');
  const none = h.plots.length === 0 && tick > 60;
  const wood = fenceCost(4, 4);
  let field: string | null = null;
  if ((busy || none) && (s.wood ?? 0) >= wood && (s.seed ?? 0) >= 2 && h.steward.policy.expand_field !== 'off'
    && !h.steward.proposals.some((p) => p.action === 'expand_field') && findFieldSpot(world)) {
    field = none ? `No fields yet: I can fence a 4 x 4 m wheat field for ${wood} wood from the store.`
      : `Every field is in use and the store has seed; a 4 x 4 m wheat field costs ${wood} wood.`;
  }
  return { move: m, field };
}

/** The journaled commands for a plan under the steward's policies (auto acts; approve asks the owner). */
export function stewardCommands(h: HomesteadState, plan: StewardPlan): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (plan.move) {
    const m = plan.move;
    out.push(h.steward.policy.assign_role === 'auto'
      ? { type: 'assign_role', villagerId: m.villagerId, role: m.role, actor: 'steward' }
      : { type: 'steward_propose', action: 'assign_role', villagerId: m.villagerId, role: m.role, reason: `Make ${m.name} a ${m.role}: ${m.why}` });
  }
  if (plan.field) {
    out.push(h.steward.policy.expand_field === 'auto' ? { type: 'expand_field', actor: 'steward' } : { type: 'steward_propose', action: 'expand_field', reason: plan.field });
  }
  return out;
}

/** True on the ticks the steward looks at the farm. */
export const stewardDue = (tick: number) => tick % STEWARD_EVERY === 0;
