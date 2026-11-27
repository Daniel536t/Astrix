// FINAL-MAP: tap-to-navigate. Presentation and input only (no DOM, no three.js).
//
// A tap on the map picks a destination (a saved waypoint, a place, a deposit
// or the spot itself) and plans a walking route to it (sim/route.ts, in time
// slices). When the route is found, the destination becomes the single
// navigation waypoint: the previous one is removed and the new one set, by the
// journaled `remove_waypoint` / `set_waypoint` commands the map already used
// (named NAV_WAYPOINT, so it is told apart from the waypoints the player
// saved by name). A saved waypoint tapped or chosen from the list is routed
// to as it is (no navigation waypoint is made; the old one is removed).
// When no route exists (deep water, cut off, outside the world, ...), the
// reason is shown and the previous destination, route and trail are kept.
// The route is followed as in W5: the first stretch refined on the live 1 m
// grid, replanned when the player strays, the trail drawn for the next 60 m;
// on arrival (or Stop) the navigation waypoint is removed.
import type { World } from '../sim/world';
import { HALF } from '../sim/world';
import type { Waypoint } from '../sim/map';
import { RouteResult, RouteSearch, RoutePoint, distanceToRoute, pointAlong, refineStart, routeGround } from '../sim/route';

export type Receipt = { ok: true; outcome: Record<string, unknown> & { type: string } } | { ok: false; code: string; reasons: string[] };
export interface Destination { x: number; z: number; label: string; waypointId?: string }
export interface NavOptions {
  world: () => World;
  dispatch: (c: Record<string, unknown>, target: string) => Receipt;
  toast: (message: string, kind?: 'good' | 'warn' | 'bad') => void;
  player: () => { x: number; z: number } | null;
  /** The trail's points from the player for the next TRAIL_AHEAD metres, or null to clear it. */
  trail: (pts: RoutePoint[] | null) => void;
}

/** The name of the navigation waypoint a tap makes (a saved waypoint never gets it: they are named after places or "Waypoint N"). */
export const NAV_WAYPOINT = 'Destination';
export const TRAIL_AHEAD = 60;
const STRAY = 12;
const ARRIVED = 4;
const SLICE_MS = 6;
const clampW = (v: number) => Math.max(-(HALF - 2), Math.min(HALF - 2, Math.round(v)));

interface Search { kind: 'candidate' | 'replan'; target: Destination; rs: RouteSearch; t0: number; cpu: number }

export class MapNavigator {
  dest: Destination | null = null;
  route: RoutePoint[] = [];
  routeInfo: Extract<RouteResult, { ok: true }> | null = null;
  /** Why the current destination has no route any more (a replan failed), or null. */
  refusal: string | null = null;
  /** The last tap that could not be routed (shown, then forgotten on the next tap). */
  rejected: { target: Destination; reason: string } | null = null;
  search: Search | null = null;
  version = 0;
  private coarse: RoutePoint[] = [];
  private lastRefine = { at: 0, x: NaN, z: NaN };
  private lastStrayCheck = 0;
  private trailKey = '';
  private restored = false;
  readonly stats = { routeMs: null as number | null, routeCpuMs: 0, routeExpanded: 0, routes: 0, replans: 0, refineMs: null as number | null, taps: 0, rejected: 0, replaced: 0 };

  constructor(private readonly o: NavOptions) {}

  private get map() { return this.o.world().wild?.map ?? null; }

  /** The navigation waypoint (the newest one named NAV_WAYPOINT), or null. */
  navWaypoint(): Waypoint | null {
    const m = this.map;
    if (!m) return null;
    let best: Waypoint | null = null;
    for (const w of m.waypoints.values()) if (w.name === NAV_WAYPOINT && (!best || Number(w.id.slice(2)) > Number(best.id.slice(2)))) best = w;
    return best;
  }

  /** A tap's destination: plan a route; it replaces the current one only when a route is found. */
  go(target: Destination): void {
    const p = this.o.player();
    this.stats.taps++;
    this.rejected = null;
    if (!p) { this.reject(target, 'your position is not known yet'); return; }
    const t: Destination = { ...target, x: Math.max(-HALF, Math.min(HALF, target.x)), z: Math.max(-HALF, Math.min(HALF, target.z)) };
    this.search = { kind: 'candidate', target: t, rs: new RouteSearch(routeGround(this.o.world()), { x: p.x, z: p.z }, { x: t.x, z: t.z }), t0: performance.now(), cpu: 0 };
    this.version++;
  }

  /** Stop navigating: the route and trail go, and the navigation waypoint is removed (journaled). */
  stop(): void {
    const nav = this.dest?.waypointId && this.map?.waypoints.get(this.dest.waypointId)?.name === NAV_WAYPOINT ? this.dest.waypointId : this.navWaypoint()?.id;
    this.clear();
    if (this.search?.kind === 'candidate') this.search = null;
    if (nav) this.o.dispatch({ type: 'remove_waypoint', waypointId: nav }, nav);
  }

  /** The waypoint was removed elsewhere (the list's ×): forget the destination if it was that one. */
  forget(waypointId: string): void { if (this.dest?.waypointId === waypointId) this.clear(); }

  private clear(): void {
    this.dest = null;
    this.route = []; this.coarse = []; this.routeInfo = null; this.refusal = null;
    if (this.search?.kind === 'replan') this.search = null;
    this.o.trail(null); this.trailKey = '';
    this.version++;
  }

  private reject(t: Destination, reason: string): void {
    this.rejected = { target: t, reason };
    this.stats.rejected++;
    this.o.toast(`No route to ${t.label}: ${reason}.${this.dest ? ` Still heading to ${this.dest.label}.` : ''}`, 'warn');
    this.version++;
  }

  /** The found route becomes the destination; the navigation waypoint is replaced (journaled). */
  private commit(t: Destination, r: Extract<RouteResult, { ok: true }>): void {
    const old = this.navWaypoint();
    let waypointId = t.waypointId;
    if (old && old.id !== waypointId) {
      const rr = this.o.dispatch({ type: 'remove_waypoint', waypointId: old.id }, old.id);
      if (rr.ok) this.stats.replaced++;
    }
    if (!waypointId) {
      const rr = this.o.dispatch({ type: 'set_waypoint', x: clampW(t.x), z: clampW(t.z), name: NAV_WAYPOINT }, NAV_WAYPOINT);
      if (rr.ok) waypointId = String(rr.outcome.waypointId);
      else this.o.toast(`Route shown, but the waypoint could not be saved: ${rr.reasons.join('; ')}`, 'warn');
    }
    this.dest = { ...t, ...(waypointId ? { waypointId } : {}) };
    this.adopt(r);
  }

  private adopt(r: Extract<RouteResult, { ok: true }>): void {
    this.refusal = null;
    this.routeInfo = r;
    this.coarse = r.points;
    this.route = r.points;
    this.lastRefine = { at: 0, x: NaN, z: NaN };
    this.trailKey = '';
    this.version++;
  }

  private replan(p: { x: number; z: number }): void {
    if (!this.dest) return;
    this.search = { kind: 'replan', target: this.dest, rs: new RouteSearch(routeGround(this.o.world()), { x: p.x, z: p.z }, { x: this.dest.x, z: this.dest.z }), t0: performance.now(), cpu: 0 };
  }

  /** Per frame: search in a time slice, follow the route, refine, replan, update the trail. */
  step(p: { x: number; z: number } | null): void {
    // After a load: the saved navigation waypoint is the destination again (no new journal entry).
    if (!this.restored && p && this.map) {
      this.restored = true;
      const nav = this.navWaypoint();
      if (nav && !this.dest && !this.search) { this.dest = { x: nav.x, z: nav.z, label: NAV_WAYPOINT.toLowerCase(), waypointId: nav.id }; this.replan(p); }
    }
    const s = this.search;
    if (s) {
      const t0 = performance.now();
      while (performance.now() - t0 < SLICE_MS) if (s.rs.step(150)) break;
      s.cpu += performance.now() - t0;
      const r = s.rs.result;
      if (!r) return;
      this.search = null;
      this.stats.routeMs = Math.round(performance.now() - s.t0);
      this.stats.routeCpuMs = Math.round(s.cpu);
      this.stats.routeExpanded = r.expanded;
      this.stats.routes++;
      if (s.kind === 'candidate') { if (r.ok) this.commit(s.target, r); else this.reject(s.target, r.reason); }
      else if (s.target === this.dest) {
        if (r.ok) this.adopt(r);
        else { this.refusal = r.reason; this.route = []; this.coarse = []; this.routeInfo = null; this.o.trail(null); this.version++; this.o.toast(`No route to ${this.dest.label}: ${r.reason}`, 'warn'); }
      }
    }
    if (!p || !this.dest || !this.coarse.length) return;
    const now = performance.now();
    if (Math.hypot(p.x - this.dest.x, p.z - this.dest.z) <= ARRIVED) {
      this.o.toast(`You have arrived at ${this.dest.label}`, 'good');
      this.stop();
      return;
    }
    // Strayed from the route: plan again from here (the current route stays until the new one is found).
    if (now - this.lastStrayCheck > 500 && !this.search) {
      this.lastStrayCheck = now;
      if (distanceToRoute(this.route, p.x, p.z).d > STRAY) { this.stats.replans++; this.replan(p); }
    }
    // Refine the first stretch on the live 1 m grid (every 12 m walked, at most once a second).
    if (now - this.lastRefine.at > 1000 && (this.lastRefine.x !== this.lastRefine.x || Math.hypot(p.x - this.lastRefine.x, p.z - this.lastRefine.z) > 12 || this.lastRefine.at === 0)) {
      const t0 = performance.now();
      const along = distanceToRoute(this.coarse, p.x, p.z);
      const rest = [{ x: p.x, z: p.z }, ...this.coarse.slice(pointAlong(this.coarse, along.s).index)];
      const loc = refineStart(this.o.world(), { x: p.x, z: p.z }, rest);
      this.route = loc ? [...loc.path, ...rest.slice(loc.joinIndex + 1)] : rest;
      this.stats.refineMs = Math.round((performance.now() - t0) * 10) / 10;
      this.lastRefine = { at: now, x: p.x, z: p.z };
      this.version++;
    }
    // The trail: the next stretch from where the player is.
    const sAlong = distanceToRoute(this.route, p.x, p.z).s;
    const key = `${this.version}:${Math.round(sAlong / 2)}`;
    if (key !== this.trailKey) {
      this.trailKey = key;
      const start = pointAlong(this.route, sAlong), end = pointAlong(this.route, sAlong + TRAIL_AHEAD);
      this.o.trail([start.p, ...this.route.slice(start.index, end.index), end.p]);
    }
  }

  /** Metres left along the route from the player. */
  remaining(): number {
    const p = this.o.player();
    if (!p || this.route.length < 2) return 0;
    const s = distanceToRoute(this.route, p.x, p.z).s;
    let total = 0;
    for (let k = 1; k < this.route.length; k++) total += Math.hypot(this.route[k].x - this.route[k - 1].x, this.route[k].z - this.route[k - 1].z);
    return Math.max(0, total - s);
  }
}
