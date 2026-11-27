// Browser persistence is a transport concern; GameSession remains DOM-free.
// A single Web Storage key gives browsers an atomic snapshot + journal replace.
import { COMPACT_AT, CommandJournal, GameSession } from './session';
import { WorldSnapshot } from '../sim/snapshot';
import { GENERATOR_VERSION, WILDERNESS } from '../sim/world';

export const SAVE_SCHEMA = 1 as const;
export const DESIGN_SAVE_SCHEMA = 2 as const;
export const CURRENT_SAVE_SCHEMA = 3 as const;
export const MAX_SAVE_JSON_BYTES = 30_000_000;
export interface SaveRecord {
  schema: typeof SAVE_SCHEMA | typeof DESIGN_SAVE_SCHEMA | typeof CURRENT_SAVE_SCHEMA;
  seed: number;
  snapshot: WorldSnapshot;
  journal: CommandJournal;
}
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type LoadStatus = 'new' | 'restored' | 'saved' | 'corrupt' | 'unavailable';
export interface LoadResult {
  session: GameSession;
  status: LoadStatus;
  message: string;
}
export interface PersistenceMetrics {
  schema: SaveRecord['schema'];
  key: string;
  status: LoadStatus;
  /** True only when storage is currently usable and the latest save attempt succeeded. */
  persistent: boolean;
  message: string;
}
export interface SaveResult {
  ok: boolean;
  message: string;
}

/**
 * W1: which world a store reads and writes. Absent: the settlement world of
 * this seed, under its pre-W1 key `astrix:m002:v<schema>:seed:<seed>`
 * (unchanged, so existing farms load untouched). A wilderness world has its
 * own key per world id: `astrix:wild:v3:<id>:seed:<seed>`.
 */
export interface SaveSlot { scenario: typeof WILDERNESS; id: string }
export const WORLD_ID = /^w[0-9]{1,6}$/;

export function settlementSaveKey(seed: number, schema: SaveRecord['schema'] = CURRENT_SAVE_SCHEMA): string {
  return `astrix:m002:v${schema}:seed:${seed}`;
}
export function wildernessSaveKey(id: string, seed: number): string {
  if (!WORLD_ID.test(id)) throw new Error('invalid world id');
  return `astrix:wild:v${CURRENT_SAVE_SCHEMA}:${id}:seed:${seed}`;
}

function saveKey(seed: number, schema: SaveRecord['schema'], slot?: SaveSlot): string {
  return slot ? wildernessSaveKey(slot.id, seed) : settlementSaveKey(seed, schema);
}

/** Validate the envelope before restoring; never trust JSON type assertions. */
function parseSave(raw: string, seed: number, schema: SaveRecord['schema'], slot?: SaveSlot): SaveRecord {
  if (raw.length > MAX_SAVE_JSON_BYTES) throw new Error('save exceeds the JSON size limit');
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid save envelope');
  const record = value as Record<string, unknown>;
  if (record.schema !== schema || record.seed !== seed
    || !('snapshot' in record) || !('journal' in record)
    || Object.keys(record).length !== 4) throw new Error('unsupported or malformed save envelope');
  // W1: a slot holds only its own scenario (GameSession.restore checks snapshot against journal).
  const journal = record.journal as Record<string, unknown> | null;
  if (typeof journal !== 'object' || journal === null || (journal.scenario === WILDERNESS) !== !!slot) {
    throw new Error('save scenario does not match its slot');
  }
  return record as unknown as SaveRecord;
}

export class BrowserSaveStore {
  private status: LoadStatus = 'new';
  private message = '';
  private schema: SaveRecord['schema'] = CURRENT_SAVE_SCHEMA;
  private persistent = false;

  /**
   * `newWorldGenerator` applies only when no save exists for this seed. An
   * existing save always restores on the generator recorded in its snapshot
   * and journal, so older worlds keep loading unchanged.
   */
  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly seed: number,
    private readonly newWorldGenerator = GENERATOR_VERSION,
    /** W1: a wilderness world's own slot; absent = the settlement save of this seed. */
    private readonly slot?: SaveSlot,
  ) {
    if (slot && (slot.scenario !== WILDERNESS || !WORLD_ID.test(slot.id))) throw new Error('invalid save slot');
  }

  /** Scenario of the world this store holds. */
  get scenario(): 'settlement' | typeof WILDERNESS { return this.slot ? WILDERNESS : 'settlement'; }

  /** Schemas this store reads (a wilderness slot exists only on the current schema). */
  private schemas(): ReadonlyArray<SaveRecord['schema']> {
    return this.slot ? [CURRENT_SAVE_SCHEMA] : [CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA];
  }

  /**
   * Move every save for this seed to an archive key so the next load starts a
   * new world. Reversible: the archived bytes are kept untouched under
   * `<key>:archived:<timestamp>`. Returns the archive keys written.
   */
  archiveCurrent(now = Date.now()): string[] {
    const archived: string[] = [];
    if (!this.storage) return archived;
    for (const schema of this.schemas()) {
      const key = saveKey(this.seed, schema, this.slot);
      const raw = this.storage.getItem(key);
      if (raw === null) continue;
      const target = `${key}:archived:${now}`;
      this.storage.setItem(target, raw);
      if (this.storage.getItem(target) !== raw) throw new Error('archive write could not be verified');
      this.storage.removeItem(key);
      archived.push(target);
    }
    return archived;
  }

  private genesis(): GameSession {
    return GameSession.genesis(this.seed, this.newWorldGenerator, this.scenario);
  }

  load(): LoadResult {
    let raw: string | null = null;
    let schema: SaveRecord['schema'] = CURRENT_SAVE_SCHEMA;
    this.schema = CURRENT_SAVE_SCHEMA;
    this.persistent = false;
    try {
      raw = this.storage?.getItem(saveKey(this.seed, schema, this.slot)) ?? null;
      for (const candidate of this.schemas()) {
        raw = this.storage?.getItem(saveKey(this.seed, candidate, this.slot)) ?? null;
        if (raw !== null) { schema = candidate; this.schema = candidate; break; }
      }
    } catch (error) {
      return this.unavailable(`Local save unavailable: ${(error as Error).message}; this session is volatile.`);
    }
    if (raw === null) {
      if (!this.storage) return this.unavailable('Local storage is unavailable; this session is volatile.');
      this.status = 'new';
      this.message = 'New local world.';
      return this.result(this.genesis());
    }
    const key = saveKey(this.seed, schema, this.slot);
    try {
      const save = parseSave(raw, this.seed, schema, this.slot);
      const session = GameSession.restore(save.snapshot, save.journal);
      this.status = 'restored';
      this.message = `Restored ${session.nextSequence} accepted command${session.nextSequence === 1 ? '' : 's'}.`;
      this.persistent = true;
      return this.result(session);
    } catch (error) {
      // Preserve the rejected bytes for diagnosis. If quarantine is unavailable,
      // keep the original key untouched and make this session explicitly volatile.
      try {
        if (!this.storage) throw new Error('local storage is unavailable');
        this.storage.setItem(`${key}:corrupt`, raw);
        this.storage.removeItem(key);
        this.status = 'corrupt';
        this.message = `Save rejected: ${(error as Error).message}. Original bytes quarantined; started a new world.`;
        return this.result(this.genesis());
      } catch (quarantineError) {
        return this.unavailable(`Save rejected: ${(error as Error).message}; quarantine failed: ${(quarantineError as Error).message}. Original save left untouched; this session is volatile.`);
      }
    }
  }

  /** Replace the sole record only after an accepted command reaches the journal. */
  save(session: GameSession): SaveResult {
    try {
      if (!this.storage) throw new Error('local storage is unavailable');
      if (session.world.seed !== this.seed) throw new Error('save seed does not match this browser session');
      if (session.scenario !== this.scenario) throw new Error('save scenario does not match this slot');
      const schema = session.journal.schema;
      if (schema !== SAVE_SCHEMA && schema !== DESIGN_SAVE_SCHEMA && schema !== CURRENT_SAVE_SCHEMA) throw new Error('unsupported journal schema');
      // Long play would otherwise grow the save by ~240 bytes per tick without bound.
      if (session.journal.entries.length >= COMPACT_AT) session.compact();
      const record: SaveRecord = {
        schema, seed: this.seed,
        snapshot: session.snapshot, journal: session.journal,
      };
      const raw = JSON.stringify(record);
      if (raw.length > MAX_SAVE_JSON_BYTES) throw new Error('save exceeds the JSON size limit');
      this.storage.setItem(saveKey(this.seed, schema, this.slot), raw);
      this.schema = schema;
      this.status = 'saved';
      this.message = 'Saved locally.';
      this.persistent = true;
      return { ok: true, message: this.message };
    } catch (error) {
      this.status = 'unavailable';
      this.message = `Save failed: ${(error as Error).message}. Latest accepted work is not safely persisted.`;
      this.persistent = false;
      return { ok: false, message: this.message };
    }
  }

  metrics(): PersistenceMetrics {
    return { schema: this.schema, key: saveKey(this.seed, this.schema, this.slot), status: this.status, persistent: this.persistent, message: this.message };
  }

  private result(session: GameSession): LoadResult {
    return { session, status: this.status, message: this.message };
  }

  private unavailable(message: string): LoadResult {
    this.status = 'unavailable';
    this.message = message;
    this.persistent = false;
    return this.result(this.genesis());
  }
}
