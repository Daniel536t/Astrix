// Where a loaded or respawning character appears (player-local, no three.js).
//
// The avatar position is client-local presentation state, saved beside the
// world. A saved spot can be one the character could never be put back at:
// a shore edge whose centre is over a water cell (the box rested on the dry
// cell beside it, so the movement rules recorded it as dry footing, while
// findStandingY, which looks only under the centre, finds nothing there and
// the page waited for ever), a height that is not ground, a spot inside water,
// or one inside a building finished since. These rules decide, and always say
// so when the character does not appear exactly where it was saved:
//  - the saved spot, when a character can stand there (standProblemAt);
//  - else the ground in the same column (a saved height that is not ground);
//  - else the nearest standable spot within SAVED_SEARCH_M;
//  - else the spawn banner's spot (or the nearest standable spot beside it).
// A recorded respawn point (W4 `respawn` outcome) is never searched around
// silently: the character lands exactly there; only if that spot cannot be
// stood on does it land at the nearest spot, and says so (`exact: false`).
import type { World } from '../sim/world';
import { StandProblem, StandingSearch, standingSpotNear } from '../sim/character';

/** How far (m) from a saved spot to look for standable ground. */
export const SAVED_SEARCH_M = 6;
/** How far (m) from the spawn banner's spot. */
export const SPAWN_SEARCH_M = 8;

export interface SavedSpot { x: number; y: number; z: number }

export type SpawnPlan =
  | { status: 'pending'; x: number; z: number }
  /** Nothing standable around the spawn banner either (never seen in generated worlds): the caller says so and retries. */
  | { status: 'none'; x: number; z: number; note: string }
  | { status: 'ok'; x: number; y: number; z: number; source: 'saved' | 'saved_ground' | 'saved_nearby' | 'spawn' | 'spawn_nearby'; problem: StandProblem | null; moved: number; note: string | null };

const PROBLEM_TEXT: Record<StandProblem, string> = {
  pending: 'its land had not loaded', no_ground: 'there was no ground under it', terrain: 'it was inside the ground',
  water: 'it was in water', building: 'a building stands there now', obstacle: 'a tree or rock stands there',
};
export const problemText = (p: StandProblem) => PROBLEM_TEXT[p];

/** The spawn banner's spot (cell middle) and the ground there, or beside it. */
function atSpawn(world: World, spawn: { x: number; z: number }, why: string | null): SpawnPlan {
  const sx = spawn.x + 0.5, sz = spawn.z + 0.5;
  const r = standingSpotNear(world, sx, sz, { radius: SPAWN_SEARCH_M });
  if (r.status === 'pending') return { status: 'pending', x: sx, z: sz };
  if (r.status === 'none') return { status: 'none', x: sx, z: sz, note: `${why ? `${why}, and t` : 'T'}here is no safe ground at the spawn banner (${PROBLEM_TEXT[r.problem]})` };
  return { status: 'ok', x: r.x, y: r.y, z: r.z, source: r.moved ? 'spawn_nearby' : 'spawn', problem: why ? 'no_ground' : null, moved: r.moved,
    note: why ? `${why}: you start at the spawn banner` : null };
}

/** Where a page puts its character on load: the saved spot when valid, else nearby ground, else the spawn banner. */
export function planAvatarSpawn(world: World, saved: SavedSpot | null, spawn: { x: number; z: number }): SpawnPlan {
  if (!saved) return atSpawn(world, spawn, null);
  const r: StandingSearch = standingSpotNear(world, saved.x, saved.z, { yNear: saved.y, radius: SAVED_SEARCH_M });
  if (r.status === 'pending') return { status: 'pending', x: saved.x, z: saved.z };
  if (r.status === 'none') return atSpawn(world, spawn, `Your saved spot was not safe ground (${PROBLEM_TEXT[r.problem]}) and none was near it`);
  if (!r.problem) return { status: 'ok', x: r.x, y: r.y, z: r.z, source: 'saved', problem: null, moved: 0, note: null };
  if (!r.moved) return { status: 'ok', x: r.x, y: r.y, z: r.z, source: 'saved_ground', problem: r.problem, moved: 0, note: `Your saved height was not ground (${PROBLEM_TEXT[r.problem]}): you stand on the ground there` };
  return { status: 'ok', x: r.x, y: r.y, z: r.z, source: 'saved_nearby', problem: r.problem, moved: r.moved,
    note: `Your saved spot was not safe ground (${PROBLEM_TEXT[r.problem]}): you start ${r.moved} m away` };
}

export type LandingPlan =
  | { status: 'pending' }
  | { status: 'none'; note: string }
  | { status: 'ok'; x: number; y: number; z: number; exact: boolean; problem: StandProblem | null; moved: number; note: string | null };

/**
 * A recorded landing point (a journaled respawn outcome): exactly there when
 * a character can stand there; otherwise the nearest standable spot, flagged
 * `exact: false` so the caller says so. Pending while the terrain streams in.
 */
export function planLanding(world: World, p: { x: number; z: number }, spawn: { x: number; z: number }): LandingPlan {
  const r = standingSpotNear(world, p.x, p.z, { radius: SAVED_SEARCH_M });
  if (r.status === 'pending') return { status: 'pending' };
  if (r.status === 'ok') {
    const exact = r.moved === 0 && r.problem === null;
    return { status: 'ok', x: r.x, y: r.y, z: r.z, exact, problem: r.problem, moved: r.moved,
      note: exact ? null : `The recorded wake point is not safe ground (${PROBLEM_TEXT[r.problem ?? 'no_ground']}): you wake ${r.moved} m from it` };
  }
  const s = atSpawn(world, spawn, `The recorded wake point is not safe ground (${PROBLEM_TEXT[r.problem]}) and none was near it`);
  if (s.status === 'pending') return { status: 'pending' };
  if (s.status === 'none') return { status: 'none', note: s.note };
  return { status: 'ok', x: s.x, y: s.y, z: s.z, exact: false, problem: r.problem, moved: Math.round(Math.hypot(s.x - p.x, s.z - p.z) * 100) / 100, note: s.note };
}
