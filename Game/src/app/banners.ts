// Banner persistence (M009). Player-local, beside the saved avatar position:
// a Web Storage record per seed and generator, never part of the hashed world
// snapshot or the command journal (see sim/banners.ts for why). A missing or
// unreadable record gives the home banner derived from the founding spawn and
// no field banner, so worlds saved before banners existed load unchanged.
import type { KeyValueStorage } from './persistence';
import { BANNER_LIMIT, BannerPoint, BannerSet, homeBannerFor } from '../sim/banners';

export const BANNER_SCHEMA = 1 as const;

interface BannerRecord {
  v: typeof BANNER_SCHEMA;
  home: { x: number; z: number };
  field: BannerPoint | null;
}

/** W1: `world` names a wilderness world's own record; the settlement keeps the pre-W1 key. */
export function bannerKey(seed: number, generatorVersion: number, world?: string): string {
  return `astrix:banners:v${BANNER_SCHEMA}:seed:${seed}:gen:${generatorVersion}${world ? `:world:${world}` : ''}`;
}

const finite = (...v: unknown[]) => v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= BANNER_LIMIT);

export class BannerStore {
  private readonly key: string;
  constructor(
    private readonly storage: KeyValueStorage | null,
    seed: number,
    generatorVersion: number,
    private readonly spawn: { x: number; z: number },
    world?: string,
  ) {
    this.key = bannerKey(seed, generatorVersion, world);
  }

  /** Saved banners, or the derived home banner and no field banner. Never throws. */
  load(): BannerSet {
    const fallback: BannerSet = { home: homeBannerFor(this.spawn), field: null };
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return fallback;
      const v = JSON.parse(raw) as Partial<BannerRecord> | null;
      if (!v || typeof v !== 'object' || v.v !== BANNER_SCHEMA) return fallback;
      const home = v.home && finite(v.home.x, v.home.z) ? { x: v.home.x, z: v.home.z } : fallback.home;
      const f = v.field;
      const field = f && finite(f.x, f.y, f.z) ? { x: f.x, y: f.y, z: f.z } : null;
      return { home, field };
    } catch { return fallback; }
  }

  /** Write the record; returns false when storage is unavailable (the banners still work this session). */
  save(set: BannerSet): boolean {
    if (!this.storage) return false;
    try {
      const record: BannerRecord = { v: BANNER_SCHEMA, home: { ...set.home }, field: set.field ? { ...set.field } : null };
      this.storage.setItem(this.key, JSON.stringify(record));
      return true;
    } catch { return false; }
  }
}
