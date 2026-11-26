// The shared material-reservation ledger (M014 settlement rules v4, reused by
// W4 wilderness construction).
//
// A reservation is a count of an item held for one building site in one
// source, while the items stay physically in that source. Nothing moves when
// a reservation is made or released. Anyone other than the site sees a
// source's free amount: what it holds minus what every live site has
// reserved there. A reservation only ever takes free units, so two sites
// never hold the same unit.
//
//  - Settlement (sim/homestead.ts): one source, the store (the founder
//    stockpile and finished timber stores). Approved sites reserve free
//    stock in id order, as much as is free (partial), and builders carry it.
//  - Wilderness (sim/wild-build.ts): several sources, the bag ('bag'),
//    dropped piles ('d:N') and finished storage buildings ('b:N'). Placing a
//    site reserves everything the building needs, in full or not at all.
//
// Moving these lines out of homestead.ts did not change a settlement
// verdict or hash: the M014 and STAB-002 pins and the v6/v7 fixtures still
// pass. Integer arithmetic only; no three.js.

export type Bag = Record<string, number>;

/** A copy with zero and negative counts dropped, in item order (the canonical bag). */
export function sortedBag(b: Bag): Bag {
  return Object.fromEntries(Object.entries(b).filter(([, n]) => n > 0).sort(([a], [c]) => a.localeCompare(c)));
}

/** How much of `item` the given reservations hold in total. */
export function reservedTotal(reservations: Iterable<Bag>, item: string): number {
  let n = 0;
  for (const r of reservations) n += r[item] ?? 0;
  return n;
}

/** All the given reservations by item (sorted, positive counts only). */
export function reservedTotals(reservations: Iterable<Bag>): Bag {
  const out: Bag = {};
  for (const r of reservations) for (const [k, n] of Object.entries(r)) out[k] = (out[k] ?? 0) + n;
  return sortedBag(out);
}

/** What a source holding `held` units can still give anyone but the reserving sites. */
export function freeOf(held: number, reserved: number): number {
  return Math.max(0, held - reserved);
}

export interface ReservationSource {
  /** The source id ('bag', a pile id, a storage site id; the settlement has one, 'store'). */
  id: string;
  /** Free units of an item in this source now. */
  free: (item: string) => number;
}

export interface ReservationPlan {
  /** Units to reserve per source and item (sources in the order given, bags sorted). */
  take: Record<string, Bag>;
  /** What no source could supply (empty when the need is covered in full). */
  short: Bag;
}

/**
 * Cover `need` from the sources in the order given, taking at most each
 * source's free amount. Deterministic: items in key order, sources in the
 * order passed. The caller decides whether a partial plan is acceptable
 * (the settlement reserves what is free; the wilderness refuses a short plan).
 */
export function planReservation(need: Bag, sources: readonly ReservationSource[]): ReservationPlan {
  const take: Record<string, Bag> = {};
  const short: Bag = {};
  for (const [item, want] of Object.entries(need).sort(([a], [b]) => a.localeCompare(b))) {
    let left = want;
    for (const s of sources) {
      if (left <= 0) break;
      const n = Math.min(left, s.free(item));
      if (n <= 0) continue;
      (take[s.id] ??= {})[item] = n;
      left -= n;
    }
    if (left > 0) short[item] = left;
  }
  return { take, short };
}

/** Add `n` of `item` to a bag in place (n may be negative; zero counts are removed). */
export function addToBag(b: Bag, item: string, n: number): void {
  const v = (b[item] ?? 0) + n;
  if (v > 0) b[item] = v; else delete b[item];
}
