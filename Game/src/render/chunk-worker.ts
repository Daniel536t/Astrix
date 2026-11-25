// Chunk worker: pure generation and meshing off the main thread.
//
// The worker never sees or mutates a World. It computes:
//   'generate' — base chunk bytes and base columns from (seed, version, cx, cz);
//   'mesh'     — greedy mesh arrays from a padded volume the main thread built;
//   'macro'    — far landscape LOD arrays from a copy of the macro sample grid.
// The main thread remains the single writer of World state: it installs base
// chunks (applying durable edits and entities) and adopts meshes only when
// their request stamp is still current.
import { computeBaseColumns, generateBaseChunk } from '../sim/world';
import { meshPadded } from './mesher';
import { buildMacroArrays, type MacroGrid, type MacroTiers } from './terrain';

export type ChunkJob =
  | { kind: 'generate'; id: number; seed: number; version: number; cx: number; cz: number }
  | { kind: 'mesh'; id: number; padded: Uint8Array; heights: Uint8Array; ox: number; oz: number; seed: number }
  | { kind: 'macro'; id: number; grid: MacroGrid; seed: number; step: number; hole?: { minX: number; maxX: number; minZ: number; maxZ: number }; focus?: { x: number; z: number }; tiers?: MacroTiers };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ChunkJob>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const job = e.data;
  const t0 = performance.now();
  if (job.kind === 'generate') {
    const base = generateBaseChunk(job.seed, job.version, job.cx, job.cz);
    const columns = computeBaseColumns(job.seed, job.version, job.cx, job.cz);
    ctx.postMessage({ kind: 'generate', id: job.id, base, columns, ms: performance.now() - t0 }, [
      base.data.buffer, base.heights.buffer, base.topMaterials.buffer,
      columns.heights.buffer, columns.topMaterials.buffer,
    ]);
  } else if (job.kind === 'macro') {
    // M015: the far landscape LOD, rebuilt every 48 m while walking, off the main thread.
    const a = buildMacroArrays(job.grid, job.seed, { step: job.step, hole: job.hole, focus: job.focus, tiers: job.tiers });
    ctx.postMessage({ kind: 'macro', id: job.id, arrays: a, ms: performance.now() - t0 }, [a.position.buffer, a.normal.buffer, a.color.buffer, a.index.buffer]);
  } else {
    const a = meshPadded(job.padded, job.heights, job.ox, job.oz, job.seed);
    ctx.postMessage({ kind: 'mesh', id: job.id, arrays: a, ms: performance.now() - t0 }, [
      a.positions.buffer, a.normals.buffer, a.colors.buffer, a.mats.buffer, a.indices.buffer,
    ]);
  }
};
