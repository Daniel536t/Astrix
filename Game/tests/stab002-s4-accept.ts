// STAB-002 S4 acceptance: the S3 scenarios (BUG-C; tests/stab002-s3-harness.ts) at the S4 walking speed (rules v8),
// fresh v8 and upgraded v6 -> v8 (300 ticks of v6 with the old steward, then the journaled upgrade), seeds 1337 / 42 / 7.
// Shared by stab002.s4-accept-a/b.test.ts; the evidence script s4/s4.ts runs the same scenarios before and after.
import { busyField, woodshed } from './stab002-s3-harness';

export const SEEDS = [1337, 42, 7];
export const RUNS: Array<[string, { from?: number; pre?: number }]> = [['v8', {}], ['v6->v8', { from: 6, pre: 300 }]];
/**
 * Total task time of the S3 scenarios measured on the S3 tree (bf23ae5, 1.3 m/s) with s4/s4.ts: the sum over
 * every B run (woodshed + well ticks after approval, at 0 / 120 / 400) and every F run (owner field taken +
 * fully sown ticks, 2 / 4 / 6 fields), fresh and upgraded, 3 seeds; a run that never finished counts its limit.
 */
export const S3_TOTAL_TASK_TIME = 9136;

export interface BRow { label: string; seed: number; at: number; woodshed: number | null; well: number | null; step: number }
export interface FRow { label: string; seed: number; n: number; claimed: number | null; sown: number | null; seedAtMark: number; sownAt60: number; units: number; step: number }
export function bRuns(): BRow[] {
  const out: BRow[] = [];
  for (const [label, o] of RUNS) for (const seed of SEEDS) for (const at of [0, 120, 400]) {
    const r = woodshed(seed, 8, at, 1800, { ...o, well: true });
    out.push({ label, seed, at, woodshed: r.done, well: r.well, step: r.f.maxStep() });
  }
  return out;
}
export function fRuns(): FRow[] {
  const out: FRow[] = [];
  for (const [label, o] of RUNS) for (const seed of SEEDS) for (const n of [2, 4, 6]) {
    const r = busyField(seed, 8, n, 300, 6, 6, 900, o);
    out.push({ label, seed, n, claimed: r.claimed, sown: r.sown, seedAtMark: r.seedAtMark, sownAt60: r.sownAt60, units: r.units, step: r.f.maxStep() });
  }
  return out;
}
export const taskTime = (b: BRow[], f: FRow[]) => b.reduce((n, r) => n + (r.woodshed ?? 1800) + (r.well ?? 1800), 0) + f.reduce((n, r) => n + (r.claimed ?? 900) + (r.sown ?? 900), 0);
