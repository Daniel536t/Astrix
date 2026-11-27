// Browser globals used by the render harness and evidence tooling.
interface Window {
  __ready?: boolean;
  __metrics: Record<string, any>;
  __probe: { renderer: any; camera?: any; THREE?: any; terrainView?: any };
  __renderBreakdown?: () => import('./app/render-breakdown').RenderBreakdown;
  /** M015 evidence: restart the rolling frame and section statistics (presentation only). */
  __perfReset?: () => void;
  __scene?: any;
  __world?: any;
}

/** M015 build id for the performance report (vite.config.ts define): the source commit and whether the tree had uncommitted source changes. */
declare const __ASTRIX_BUILD__: { commit: string; dirty: boolean };
