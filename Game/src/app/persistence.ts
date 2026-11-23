// Browser persistence is a transport concern; GameSession remains DOM-free.
// A single Web Storage key gives browsers an atomic snapshot + journal replace.
import { CommandJournal, GameSession } from './session';
import { WorldSnapshot } from '../sim/snapshot';
import { GENERATOR_VERSION } from '../sim/world';

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

function saveKey(seed: number, schema: SaveRecord['schema']): string {
  return `astrix:m002:v${schema}:seed:${seed}`;
}

/** Validate the envelope before restoring; never trust JSON type assertions. */
function parseSave(raw: string, seed: number, schema: SaveRecord['schema']): SaveRecord {
  if (raw.length > MAX_SAVE_JSON_BYTES) throw new Error('save exceeds the JSON size limit');
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid save envelope');
  const record = value as Record<string, unknown>;
  if (record.schema !== schema || record.seed !== seed
    || !('snapshot' in record) || !('journal' in record)
    || Object.keys(record).length !== 4) throw new Error('unsupported or malformed save envelope');
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
  ) {}

  /**
   * Move every save for this seed to an archive key so the next load starts a
   * new world. Reversible: the archived bytes are kept untouched under
   * `<key>:archived:<timestamp>`. Returns the archive keys written.
   */
  archiveCurrent(now = Date.now()): string[] {
    const archived: string[] = [];
    if (!this.storage) return archived;
    for (const schema of [CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA] as const) {
      const key = saveKey(this.seed, schema);
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
    return GameSession.genesis(this.seed, this.newWorldGenerator);
  }

  load(): LoadResult {
    let raw: string | null = null;
    let schema: SaveRecord['schema'] = CURRENT_SAVE_SCHEMA;
    this.schema = CURRENT_SAVE_SCHEMA;
    this.persistent = false;
    try {
      raw = this.storage?.getItem(saveKey(this.seed, schema)) ?? null;
      for (const candidate of [CURRENT_SAVE_SCHEMA, DESIGN_SAVE_SCHEMA, SAVE_SCHEMA] as const) {
        raw = this.storage?.getItem(saveKey(this.seed, candidate)) ?? null;
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
    const key = saveKey(this.seed, schema);
    try {
      const save = parseSave(raw, this.seed, schema);
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
      const schema = session.journal.schema;
      if (schema !== SAVE_SCHEMA && schema !== DESIGN_SAVE_SCHEMA && schema !== CURRENT_SAVE_SCHEMA) throw new Error('unsupported journal schema');
      const record: SaveRecord = {
        schema, seed: this.seed,
        snapshot: session.snapshot, journal: session.journal,
      };
      const raw = JSON.stringify(record);
      if (raw.length > MAX_SAVE_JSON_BYTES) throw new Error('save exceeds the JSON size limit');
      this.storage.setItem(saveKey(this.seed, schema), raw);
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
    return { schema: this.schema, key: saveKey(this.seed, this.schema), status: this.status, persistent: this.persistent, message: this.message };
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
