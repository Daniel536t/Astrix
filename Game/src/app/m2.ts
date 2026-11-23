// M002 playable integration: sidebar, ghost preview and the build action.
//
// The controller is the only place that connects a click to the simulation.
// Previews are read-only. Accepted builds go through GameSession and persist
// only after their authoritative command reaches the journal.
import * as THREE from 'three';
import { SiteState } from '../sim/construction';
import { Structure } from '../sim/structures';
import { VoxelTerrainView } from '../render/terrain';
import { OrbitRig } from '../render/camera';
import { buildProjectGhost, buildStructureMesh } from '../render/structures';
import { BuildPanel, ProjectRow } from '../ui/build';
import { BrowserSaveStore } from './persistence';
import { lifeMetrics, LifeGame } from './life';
import { GameSession } from './session';
import {
  M2_PROJECTS, M2Project, M2ProjectId, ProjectInspection,
  inspectProject, isProjectBuilt, projectById,
} from './projects';

export interface M2GameOptions {
  session: GameSession;
  store: BrowserSaveStore;
  scene: THREE.Scene;
  terrainView: VoxelTerrainView;
  rig: OrbitRig;
}

export interface M2Metrics {
  projectsBuilt: number;
  structures: number;
  selected: M2ProjectId | null;
  lastBuild: string;
  inventory: Record<string, number>;
  revision: number;
  acceptedCommands: number;
  stateHash: string;
}

export class M2Game {
  private life?: LifeGame;
  private panel: BuildPanel;
  private structureGroup = new THREE.Group();
  private ghost: THREE.Group | null = null;
  private selected: M2ProjectId | null = null;
  private busy = false;
  private lastRevision = -1;
  private lastInspectAt = 0;
  private lastBuild = '';

  constructor(private options: M2GameOptions) {
    const { session, scene } = options;
    this.structureGroup.name = 'm2_structures';
    scene.add(this.structureGroup);
    for (const structure of session.world.structures.values()) this.addStructure(structure);

    this.panel = new BuildPanel({
      onSelect: (id) => this.select(id),
      onBuild: () => this.buildSelected(),
      onCancel: () => this.cancel(),
    });

    this.refresh();
  }

  select(id: M2ProjectId): void {
    if (this.busy) return;
    this.selected = id;
    const project = projectById(id);
    this.focus(project);
    this.refresh();
  }

  cancel(): void {
    if (this.busy) return;
    this.selected = null;
    this.clearGhost();
    this.panel.hideDetail();
    this.renderRows();
  }

  buildSelected(): void {
    if (!this.selected || this.busy) return;
    this.build(projectById(this.selected));
  }

  /** Headless/evidence helper: build every project in pinned order. */
  buildAll(): void {
    for (const project of M2_PROJECTS) {
      if (isProjectBuilt(this.options.session.world, project)) continue;
      this.build(project, false);
    }
    this.selected = null;
    this.clearGhost();
    this.panel.hideDetail();
    this.focusSlice();
    this.refresh();
  }

  private build(project: M2Project, advance = true): boolean {
    if (this.busy) return false;
    const inspection = inspectProject(this.options.session.world, project);
    if (!inspection.canBuild) {
      this.panel.toast(this.blockedMessage(inspection), 'warn');
      this.refresh();
      return false;
    }

    this.busy = true;
    this.panel.setBusy(true);
    const result = this.options.session.dispatch({
      schema: this.options.session.journal.schema,
      id: this.options.session.commandId('build', project.id), type: 'build',
      projectId: project.id, expectedRevision: this.options.session.world.revision,
      ...(this.options.session.journal.schema >= 2 ? { designVersion: 2 as const } : {}),
    });
    this.busy = false;
    this.panel.setBusy(false);

    if (!result.ok) {
      const detail = result.reasons.slice(0, 2).join('; ');
      this.panel.toast(`${project.name}: ${result.code} — ${detail}`, 'bad');
      this.refresh();
      return false;
    }

    const structure = this.options.session.world.structures.get(result.outcome.type === 'build'
      ? result.outcome.structureId : '');
    if (structure && !result.duplicate) this.addStructure(structure);
    const centre = projectCentre(project);
    this.options.terrainView.rebuildAround(centre.x, centre.z);
    const saved = this.options.store.save(this.options.session);
    this.lastBuild = `${project.name} · ${formatCost(result.outcome.type === 'build'
      ? result.outcome.costPaid : {})}`;
    const gained = result.outcome.type === 'build' ? result.outcome.resourcesGained : {};
    const gainedText = Object.keys(gained).length > 0
      ? ` · gathered ${formatCost(gained)}` : '';
    // One announcement carries both outcomes so a successful build cannot hide
    // a failed save (or redundantly announce two immediate success messages).
    this.panel.toast(
      `${project.name} built · paid ${formatCost(result.outcome.type === 'build'
        ? result.outcome.costPaid : {})}${gainedText} · ${saved.message}`,
      saved.ok ? 'good' : 'bad',
    );
    this.panel.setInventory(this.options.session.world.inventory);

    if (advance) {
      const next = M2_PROJECTS.find((p) => !isProjectBuilt(this.options.session.world, p));
      if (next) {
        this.selected = next.id;
        this.focus(next);
      } else {
        this.selected = null;
        this.clearGhost();
        this.focusSlice();
      }
    }
    this.refresh();
    return true;
  }

  private addStructure(structure: Structure): void {
    const mesh = buildStructureMesh(structure);
    mesh.traverse((child) => {
      if (child.name === 'crop_row_foliage') child.visible = false;
    });
    this.structureGroup.add(mesh);
  }

  private focus(project: M2Project): void {
    const centre = projectCentre(project);
    const rig = this.options.rig;
    rig.target.set(centre.x, project.floorY + 2, centre.z);
    rig.distance = Math.min(Math.max(rig.distance, 38), 58);
    rig.apply();
  }

  private focusSlice(): void {
    const rig = this.options.rig;
    rig.target.set(-43, 14, -41);
    rig.distance = 72;
    rig.apply();
  }

  private renderRows(): void {
    const rows: ProjectRow[] = M2_PROJECTS.map((project) => {
      const inspection = inspectProject(this.options.session.world, project);
      return {
        project,
        built: inspection.built,
        affordable: inspection.affordable,
        state: inspection.state,
        canBuild: inspection.canBuild,
      };
    });
    this.panel.renderProjects(rows);
  }

  private refresh(): void {
    this.panel.setInventory(this.options.session.world.inventory);
    this.renderRows();
    if (!this.selected) {
      this.panel.hideDetail();
      this.clearGhost();
      return;
    }
    const project = projectById(this.selected);
    const inspection = inspectProject(this.options.session.world, project);
    this.panel.renderDetail(project, inspection);
    this.updateGhost(project, inspection);
  }

  private updateGhost(project: M2Project, inspection: ProjectInspection): void {
    this.clearGhost();
    if (inspection.built) return;
    const state: SiteState = inspection.plan.ok ? inspection.state : 'invalid';
    this.ghost = buildProjectGhost({
      kind: project.kind,
      rect: project.rect,
      floorY: project.floorY,
      door: project.door,
      bands: project.ghostBands,
    }, state);
    this.options.scene.add(this.ghost);
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    this.options.scene.remove(this.ghost);
    disposeObject(this.ghost);
    this.ghost = null;
  }

  private blockedMessage(inspection: ProjectInspection): string {
    if (inspection.built) return 'That project is already built.';
    if (inspection.missing.length > 0) {
      const first = inspection.missing[0];
      return `Need ${first.need - first.have} more ${first.resource}.`;
    }
    if (!inspection.plan.ok) return `Site blocked — ${inspection.plan.reasons[0] ?? 'see notes'}`;
    return 'The site is not ready yet.';
  }

  /**
   * Called every frame. A world edit (dig, place, harvest, build) invalidates
   * the preview; re-inspect at most four times per second.
   */
  update(nowMs: number): void {
    this.life?.refresh();
    const revision = this.options.session.world.revision;
    if (revision === this.lastRevision) return;
    if (nowMs - this.lastInspectAt < 250) return;
    this.lastRevision = revision;
    this.lastInspectAt = nowMs;
    this.refresh();
  }

  metrics(): M2Metrics {
    let built = 0;
    for (const project of M2_PROJECTS) {
      if (isProjectBuilt(this.options.session.world, project)) built++;
    }
    return {
      projectsBuilt: built,
      structures: this.options.session.world.structures.size,
      selected: this.selected,
      lastBuild: this.lastBuild,
      inventory: { ...this.options.session.world.inventory },
      revision: this.options.session.world.revision,
      acceptedCommands: this.options.session.nextSequence,
      stateHash: this.options.session.stateHash,
    };
  }

  lifeMetrics(): Record<string, unknown> | null {
    return lifeMetrics(this.options.session.world);
  }

  setLifeController(controller: LifeGame): void { this.life = controller; }

  get inspectableRoot(): THREE.Group { return this.structureGroup; }

  toast(message: string, kind: 'good' | 'warn' | 'bad'): void { this.panel.toast(message, kind); }

  setVisible(visible: boolean): void {
    this.panel.setVisible(visible);
  }
}

function projectCentre(project: M2Project): { x: number; z: number } {
  return {
    x: (project.rect.x0 + project.rect.x1 + 1) / 2,
    z: (project.rect.z0 + project.rect.z1 + 1) / 2,
  };
}

function formatCost(cost: Partial<Record<string, number>>): string {
  return Object.keys(cost).sort()
    .map((resource) => `${cost[resource]} ${resource}`)
    .join(' · ');
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else {
      material?.dispose();
    }
  });
}
