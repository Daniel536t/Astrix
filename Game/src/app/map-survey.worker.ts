// FINAL-MAP: the map survey worker (app/map-survey.ts jobs off the main thread). Pure generation reads only:
// it never sees or changes a World.
import { memoizeColumns, runSurveyJob, type SurveyJob } from './map-survey';
import { GENERATOR_V2 } from '../sim/world';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<SurveyJob & { id: number }>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = (e) => {
  // This worker's own module copy only (see memoizeColumns): identical values, computed once.
  if (e.data.gen >= GENERATOR_V2) memoizeColumns(e.data.seed);
  const r = runSurveyJob(e.data);
  const transfer: Transferable[] = r.kind === 'strip' || r.kind === 'tile' ? [r.rgba.buffer as ArrayBuffer] : [];
  ctx.postMessage({ ...r, id: e.data.id }, transfer);
};
