// M015 graphics quality levels. Presentation only: nothing here reaches the
// simulation, the journal or the save. Animals (fauna and homestead herds),
// villagers, the founder and buildings are drawn the same at every level.
//
//   high    (desktop default): device pixel ratio up to 2, MSAA, 2048 px sun
//           shadow map, trees at full detail to 90 m (70 m on the multidraw=0
//           fallback), ground cover within 52 m.
//   medium  (default on touch devices): pixel ratio up to 1.5, MSAA, 1024 px
//           shadow map, full-detail trees to 70 m, ground cover within 40 m.
//   low     (default on weak touch devices): pixel ratio 1, no MSAA, no
//           shadows, full-detail trees to 50 m, ground cover within 30 m.
//
// `?quality=low|medium|high` overrides for one load; the in-game Settings
// choice is kept in this browser (`astrix:quality:v1`); otherwise `auto`
// picks a level with `chooseQuality` from the device's capabilities.

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityChoice = QualityLevel | 'auto';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
export const QUALITY_STORAGE_KEY = 'astrix:quality:v1';

export interface QualityPreset {
  level: QualityLevel;
  /** Upper bound on the renderer's device pixel ratio. */
  pixelRatioCap: number;
  antialias: boolean;
  shadows: boolean;
  /** Sun shadow map size (px, square); ignored when shadows are off. */
  shadowMapSize: number;
  /** Trees, bushes and stone props: full detail closer than this (m). Mid band is unchanged at 130 m. */
  natureNear: number;
  /** Ground cover (grass, flowers, ferns, stones, logs) drawn within this radius of the view focus (m). */
  groundCoverRadius: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  high: { level: 'high', pixelRatioCap: 2, antialias: true, shadows: true, shadowMapSize: 2048, natureNear: 90, groundCoverRadius: 52 },
  medium: { level: 'medium', pixelRatioCap: 1.5, antialias: true, shadows: true, shadowMapSize: 1024, natureNear: 70, groundCoverRadius: 40 },
  low: { level: 'low', pixelRatioCap: 1, antialias: false, shadows: false, shadowMapSize: 1024, natureNear: 50, groundCoverRadius: 30 },
};

/** The multidraw=0 fallback already shortens full-detail trees to 70 m (M014); a level never lengthens it. */
export const FALLBACK_NATURE_NEAR = 70;

export function parseQuality(text: string | null | undefined): QualityChoice | null {
  const t = (text ?? '').trim().toLowerCase();
  return t === 'low' || t === 'medium' || t === 'high' || t === 'auto' ? t : null;
}

export interface DeviceCaps {
  /** Coarse primary pointer (phones, tablets). */
  touch: boolean;
  dpr: number;
  hardwareConcurrency: number | null;
  /** navigator.deviceMemory (GB, Chrome only; rounded down to 0.25-8). */
  deviceMemory: number | null;
  /** Unmasked GPU renderer string, when the browser exposes it. */
  gpu: string | null;
  multiDraw: boolean;
  /** Short side of the screen in CSS px. */
  screenShort: number;
}

/** GPUs known to struggle with this scene: older Mali, Adreno 3xx-5xx, PowerVR, software rasterisers. */
const WEAK_GPU = /(mali-[4t]\d|mali-g(31|51|52|57|68)\b|adreno \(tm\) [345]\d\d|adreno [345]\d\d|powervr|sgx|swiftshader|llvmpipe|software)/i;

/**
 * The automatic level. Desktop (fine pointer) keeps `high`, so desktop
 * evidence and probes are unchanged. Touch devices start at `medium`; weak
 * signals (few cores, little memory, a known weak or software GPU, or no
 * WEBGL_multi_draw on a high-density screen) choose `low`.
 */
export function chooseQuality(c: DeviceCaps): { level: QualityLevel; reasons: string[] } {
  if (!c.touch) return { level: 'high', reasons: ['fine pointer (desktop)'] };
  const weak: string[] = [];
  if (c.hardwareConcurrency !== null && c.hardwareConcurrency <= 4) weak.push(`${c.hardwareConcurrency} CPU threads`);
  if (c.deviceMemory !== null && c.deviceMemory <= 3) weak.push(`${c.deviceMemory} GB memory`);
  if (c.gpu && WEAK_GPU.test(c.gpu)) weak.push(`GPU ${c.gpu}`);
  if (!c.multiDraw && c.dpr >= 2.5) weak.push('no WEBGL_multi_draw at a high pixel density');
  if (weak.length) return { level: 'low', reasons: weak };
  return { level: 'medium', reasons: ['touch device'] };
}

/** URL parameter, then the saved choice, then auto. */
export function resolveQuality(url: string | null, saved: string | null, caps: () => DeviceCaps): { level: QualityLevel; source: 'url' | 'saved' | 'auto'; choice: QualityChoice; reasons: string[] } {
  const u = parseQuality(url);
  if (u && u !== 'auto') return { level: u, source: 'url', choice: u, reasons: ['?quality='] };
  const s = u === 'auto' ? null : parseQuality(saved);
  if (s && s !== 'auto') return { level: s, source: 'saved', choice: s, reasons: ['chosen in Settings'] };
  const a = chooseQuality(caps());
  return { level: a.level, source: 'auto', choice: 'auto', reasons: a.reasons };
}

/** Pixel ratio the renderer should use. */
export function pixelRatioFor(preset: QualityPreset, devicePixelRatio: number): number {
  return Math.max(1, Math.min(devicePixelRatio || 1, preset.pixelRatioCap));
}

/** Full-detail tree distance for a level on a render path (the fallback never gets longer than 70 m). */
export function natureNearFor(preset: QualityPreset, multiDraw: boolean): number {
  return multiDraw ? preset.natureNear : Math.min(preset.natureNear, FALLBACK_NATURE_NEAR);
}

/** GPU strings and WEBGL_multi_draw from a throwaway WebGL2 context (released at once). */
export function probeGpu(): { gpu: string | null; vendor: string | null; multiDraw: boolean } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return { gpu: null, vendor: null, multiDraw: false };
    const info = gpuStrings(gl);
    const multiDraw = !!gl.getExtension('WEBGL_multi_draw');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ...info, multiDraw };
  } catch { return { gpu: null, vendor: null, multiDraw: false }; }
}

/** Unmasked renderer/vendor where available (WEBGL_debug_renderer_info), else the masked strings. */
export function gpuStrings(gl: WebGLRenderingContext | WebGL2RenderingContext): { gpu: string | null; vendor: string | null } {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number } | null;
    const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '') || null;
    const vendor = String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) ?? '') || null;
    return { gpu, vendor };
  } catch { return { gpu: null, vendor: null }; }
}
