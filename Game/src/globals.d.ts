// Browser globals used by the render harness and evidence tooling.
interface Window {
  __ready?: boolean;
  __metrics: Record<string, any>;
  __probe: { renderer: any; camera?: any; THREE?: any; terrainView?: any };
  __renderBreakdown?: () => import('./app/render-breakdown').RenderBreakdown;
  __scene?: any;
  __world?: any;
}
