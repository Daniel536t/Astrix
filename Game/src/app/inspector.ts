// Scene-graph selection for the read-only inspector. Only registered roots are
// traversed; construction ghosts, sky, water and unrelated geometry stay out.
import * as THREE from 'three';
import { World } from '../sim/world';
import { InspectionRef, inspectionKey, inspectionRef, resolveInspection } from './inspection';
import { InspectorPanel } from '../ui/inspector';

export interface InspectionTarget {
  ref: InspectionRef;
  key: string;
  name: string;
  category: string;
  x: number; y: number; z: number;
}
type Intersection = THREE.Intersection & { batchId?: number };

function originDistance(origin: THREE.Vector3, point: THREE.Vector3): number {
  return origin.distanceTo(point);
}

export function visibleInHierarchy(object: THREE.Object3D, scene: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}

/** Resolve the nearest ancestor carrying a stable world/render identity. */
export function identifiedRef(object: THREE.Object3D, batchId?: number): InspectionRef | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const ref = inspectionRef(current, batchId);
    if (ref) return ref;
    current = current.parent;
  }
  return null;
}

export function objectTarget(object: THREE.Object3D): THREE.Vector3 | null {
  const anchor = object.userData.inspectTarget;
  if (!anchor) return null;
  const point = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
  object.updateWorldMatrix(true, false);
  object.localToWorld(point);
  return point;
}

export class SceneInspector {
  private readonly roots = new Set<THREE.Object3D>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pointers = new Map<number, { x: number; y: number; moved: boolean }>();
  private readonly panel: InspectorPanel;
  private selected: InspectionRef | null = null;
  private hovered: InspectionRef | null = null;
  private targetCache: Record<string, InspectionTarget> = {};
  private lastRevision = -1;
  private visible = true;
  private gestureUsed = false;
  private lastPointer = { x: 0, y: 0 };
  private lastHoverPick = -Infinity;
  private lastPointerMove = -Infinity;
  private pendingHover = false;

  constructor(private readonly options: {
    world: World; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    canvas: HTMLCanvasElement; terrain: THREE.Object3D;
  }, panel?: InspectorPanel) {
    this.panel = panel ?? new InspectorPanel({
      onSelect: (key) => {
        const target = this.targetCache[key];
        if (target) this.pin(target.ref);
      },
      onDismiss: () => this.dismiss(),
    });
    options.canvas.tabIndex = 0;
    options.canvas.setAttribute('aria-label',
      'ASTrix world. Drag to orbit. Click or tap to inspect. Use Inspect for a keyboard object list.');
    this.bindPointer();
    this.options.canvas.ownerDocument?.defaultView?.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const escapeFromInspector = this.panel.root.contains(event.target as Node | null);
      this.dismiss();
      if (escapeFromInspector) {
        this.options.canvas.focus();
        event.preventDefault();
      }
    }, true);
  }

  addRoot(root: THREE.Object3D): void { this.roots.add(root); this.refreshTargets(); }
  private bindPointer(): void {
    this.options.canvas.addEventListener('pointerdown', (event) => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
      if (event.isPrimary && this.pointers.size === 1) this.gestureUsed = false;
      if (this.pointers.size > 1) this.gestureUsed = true;
    });
    this.options.canvas.addEventListener('pointermove', (event) => {
      const down = this.pointers.get(event.pointerId);
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) down.moved = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.lastPointerMove = performance.now();
      if (event.pointerType === 'mouse' && event.buttons === 0 && !down?.moved && this.visible && !this.selected) {
        this.pendingHover = true;
      } else {
        this.lastPointerMove = -Infinity;
        this.pendingHover = false;
      }
    });
    this.options.canvas.addEventListener('pointerup', (event) => {
      const down = this.pointers.get(event.pointerId);
      const wasGesture = this.gestureUsed || this.pointers.size > 1;
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 0) this.gestureUsed = false;
      // A pointer release on the canvas is a deliberate mouse-hover location,
      // not a rejected drag or pinch.
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.lastPointerMove = event.pointerType === 'mouse' ? performance.now() : -Infinity;
      this.pendingHover = event.pointerType === 'mouse' && event.buttons === 0 && this.visible && !this.selected;
      // Camera orbit may capture/release pointers. A short press alone is not
      if (!this.visible || !down || down.moved || wasGesture || this.gestureUsed || !event.isPrimary) return;
      const ref = this.pick(event.clientX, event.clientY);
      if (ref) this.pin(ref);
      else if (this.hovered) this.dismiss();
    });
    this.options.canvas.addEventListener('pointercancel', (event) => {
      this.pointers.delete(event.pointerId);
      this.gestureUsed = true;
      this.clearHover();
    });
    this.options.canvas.addEventListener('pointerleave', () => {
      this.lastPointerMove = -Infinity;
      this.pendingHover = false;
      this.clearHover();
    });
    this.options.canvas.addEventListener('blur', (event) => {
      // Clicking the canvas focuses it. Moving focus to the inspector's Close
      // button must not dismiss its parent card before the button can click.
      const nextFocus = event.relatedTarget;
      if (!this.panel.root.contains(nextFocus as Node | null)) this.dismiss();
    });
  }

  /** First opaque surface wins; only parent decoration can share an identity. */
  private pick(x: number, y: number): InspectionRef | null {
    const rect = this.options.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || this.roots.size === 0) return null;
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.options.camera);
    const hits = this.raycaster.intersectObjects([this.options.terrain, ...this.roots], true);
    for (const hit of hits as Intersection[]) {
      if (!visibleInHierarchy(hit.object, this.options.scene)) continue;
      const ref = identifiedRef(hit.object, hit.batchId);
      if (ref && 'structureId' in ref) {
        const structure = this.options.world.structures.get(ref.structureId);
        if (structure?.kind === 'terrace' && structure.designVersion === 2) {
          // The earth bed is intentionally slightly higher than a planted row's
          // foliage. Test the authoritative row bounds rather than letting its
          // parent soil mesh make every crop unselectable by pointer.
          const rows = structure.modules.filter((module) => module.kind === 'crop_row');
          let closestIndex = -1;
          let closestDistance = Infinity;
          const point = new THREE.Vector3();
          rows.forEach((row, index) => {
            const bounds = new THREE.Box3(
              new THREE.Vector3(row.x - row.w / 2, row.y - 0.01, row.z - row.d / 2),
              new THREE.Vector3(row.x + row.w / 2, row.y + Math.max(row.h, 0.5), row.z + row.d / 2),
            );
            const intersection = this.raycaster.ray.intersectBox(bounds, point);
            if (!intersection) return;
            const distance = originDistance(this.raycaster.ray.origin, intersection);
            if (distance <= hit.distance + 0.5 && distance < closestDistance) {
              closestIndex = index;
              closestDistance = distance;
            }
          });
          if (closestIndex >= 0) {
            const rowRef = { cropId: `crop:${closestIndex}` };
            if (resolveInspection(this.options.world, rowRef)) return rowRef;
          }
        }
      }
      if (ref) return resolveInspection(this.options.world, ref) ? ref : null;
      // An unlabelled child inside a labelled group may be foliage or a prop;
      // its owning group remains identifiable. Other solids block deeper picks.
      let parent = hit.object.parent;
      while (parent && visibleInHierarchy(parent, this.options.scene)) {
        if (parent.userData.structureId || parent.userData.siteId
          || parent.userData.stockpileId || parent.userData.cropId) {
          const ancestorRef = inspectionRef(parent);
          return ancestorRef && resolveInspection(this.options.world, ancestorRef) ? ancestorRef : null;
        }
        if (this.roots.has(parent)) break;
        parent = parent.parent;
      }
      return null;
    }
    return null;
  }

  private pin(ref: InspectionRef): void {
    const info = resolveInspection(this.options.world, ref);
    if (!info) { this.dismiss(); return; }
    const fromList = this.panel.isListVisible();
    this.selected = ref;
    this.hovered = null;
    this.panel.setListVisible(false);
    this.panel.show(info, true);
    if (fromList) this.panel.focusCard();
    this.lastPointerMove = -Infinity;
    this.pendingHover = false;
  }

  update(): void {
    if (!this.visible) return;
    if (this.options.world.revision !== this.lastRevision) {
      this.refreshTargets();
      if (this.selected) {
        const info = resolveInspection(this.options.world, this.selected);
        if (info) this.panel.show(info, true);
        else this.dismiss();
      }
    }
    const now = performance.now();
    // No scan on static scenes or touch devices. Maximum 12.5 mouse picks/sec.
    if (now - this.lastPointerMove > 250 || !this.pendingHover || now - this.lastHoverPick < 80) return;
    this.pendingHover = false;
    this.lastHoverPick = now;
    const ref = this.pick(this.lastPointer.x, this.lastPointer.y);
    this.hovered = ref;
    const info = ref ? resolveInspection(this.options.world, ref) : null;
    if (info && info.key !== this.panel.pinnedKey()) {
      this.panel.show(info, false, this.lastPointer.x + 18, this.lastPointer.y + 18);
    } else this.clearHover();
  }

  private clearHover(): void {
    this.hovered = null;
    if (!this.selected) this.panel.hideCard();
  }

  dismiss(): void {
    this.selected = null;
    this.hovered = null;
    this.panel.hideCard(true);
    this.panel.setListVisible(false);
    this.lastPointerMove = -Infinity;
    this.pendingHover = false;
  }

  refreshTargets(): void {
    const targets: Record<string, InspectionTarget> = {};
    for (const root of this.roots) {
      if (!visibleInHierarchy(root, this.options.scene)) continue;
      root.traverse((object) => {
        const batchTargets = object.userData.inspectableTargets;
        if (Array.isArray(batchTargets)) {
          for (const target of batchTargets) {
            if (!target || typeof target.entityId !== 'string') continue;
            const ref = { entityId: target.entityId };
            const info = resolveInspection(this.options.world, ref);
            if (info) targets[info.key] = { ref, key: info.key, name: info.name,
              category: info.category, x: target.x, y: target.y, z: target.z };
          }
        }
        const ref = inspectionRef(object);
        if (!ref) return;
        const key = inspectionKey(ref);
        if (targets[key]) return;
        const info = resolveInspection(this.options.world, ref);
        const point = objectTarget(object);
        if (!info || !point) return;
        targets[key] = { ref, key, name: info.name, category: info.category,
          x: point.x, y: point.y, z: point.z };
      });
    }
    this.targetCache = targets;
    this.lastRevision = this.options.world.revision;
    this.panel.renderList(Object.values(targets).sort((a, b) => a.category.localeCompare(b.category)
      || a.name.localeCompare(b.name) || a.key.localeCompare(b.key)));
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.panel.setVisible(visible);
    if (!visible) this.dismiss();
  }

  metrics(): { visible: boolean; selected: string | null; hovered: string | null;
    targetCount: number; targets: Record<string, InspectionTarget> } {
    return { visible: this.visible,
      selected: this.selected ? resolveInspection(this.options.world, this.selected)?.name ?? null : null,
      hovered: this.hovered ? resolveInspection(this.options.world, this.hovered)?.name ?? null : null,
      targetCount: Object.keys(this.targetCache).length, targets: this.targetCache };
  }
}
