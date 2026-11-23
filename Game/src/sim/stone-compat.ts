// Private migration replay only. Retired entities live in this World while an
// accepted historical journal is checked; no public command enables this mode.
interface ReplayState {
  active: boolean;
  historicalHash: boolean;
  migrated: boolean;
}

const states = new WeakMap<object, ReplayState>();

export function replayStoneState(world: object): ReplayState {
  let state = states.get(world);
  if (!state) { state = { active: false, historicalHash: false, migrated: false }; states.set(world, state); }
  return state;
}

export function enableStoneReplay(world: object): void {
  const state = replayStoneState(world);
  state.active = true;
  state.historicalHash = true;
  state.migrated = false;
}

export function isStoneReplay(world: object): boolean {
  return states.get(world)?.active ?? false;
}

/** Snapshot hashes before and during verified historical replay include stones. */
export function enableHistoricalStoneHash(world: object): void {
  replayStoneState(world).historicalHash = true;
}

export function isHistoricalStoneHash(world: object): boolean {
  return states.get(world)?.historicalHash ?? false;
}

/** A migrated snapshot already has retirement tombstones in generated chunks. */
export function markStoneMigrated(world: object): void {
  replayStoneState(world).migrated = true;
}

export function isStoneMigrated(world: object): boolean {
  return states.get(world)?.migrated ?? false;
}

/** Exit historical mode after all accepted commands and hashes have passed. */
export function finishStoneReplay(world: object): void {
  const state = replayStoneState(world);
  state.active = false;
  state.historicalHash = false;
  state.migrated = true;
}
