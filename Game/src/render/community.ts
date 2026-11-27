// W10 render layer: persistent settlers rendered as articulated Noxel figures (presentation only).
import * as THREE from 'three';
import type { World } from '../sim/world';
import type { SettlerRole } from '../sim/community';
import {
  BUILDER_STYLE, FARMER_STYLE, VILLAGER_STYLE, WOODCUTTER_STYLE,
  buildFigure, type Figure, type FigureStyle,
} from './characters';

const ROLE_STYLE: Record<SettlerRole, FigureStyle> = {
  idle: VILLAGER_STYLE,
  forager: { tunic: '#4E7A48', trousers: '#4A3B2E', hair: '#5A3A22', hat: { kind: 'cap', color: '#3D5E38' } },
  woodcutter: WOODCUTTER_STYLE,
  farmer: FARMER_STYLE,
  builder: BUILDER_STYLE,
};

interface SettlerVis {
  id: string;
  role: SettlerRole;
  fig: Figure;
}

export class CommunityView {
  readonly group = new THREE.Group();
  private readonly settlers = new Map<string, SettlerVis>();

  constructor() {
    this.group.name = 'w10-settlers';
  }

  get count(): number { return this.settlers.size; }

  update(world: World, groundY: (x: number, z: number) => number | null, tSec: number): void {
    const cm = world.wild?.community;
    if (!cm) return;

    for (const [id, vis] of this.settlers) {
      if (!cm.settlers.has(id)) {
        this.group.remove(vis.fig.root);
        this.settlers.delete(id);
      }
    }

    let idx = 0;
    for (const s of cm.settlers.values()) {
      idx++;
      let vis = this.settlers.get(s.id);
      if (!vis || vis.role !== s.role) {
        if (vis) this.group.remove(vis.fig.root);
        const fig = buildFigure(ROLE_STYLE[s.role]);
        this.group.add(fig.root);
        vis = { id: s.id, role: s.role, fig };
        this.settlers.set(s.id, vis);
      }
      const x = s.x / 10, z = s.z / 10;
      const gy = groundY(x, z) ?? 0;
      vis.fig.root.position.set(x, gy, z);
      vis.fig.root.rotation.y = Math.sin(tSec * 0.4 + idx) * 0.35;
      const work = s.role !== 'idle' ? Math.sin(tSec * 4.2 + idx) * 0.45 : 0;
      vis.fig.armR.rotation.x = -work;
      vis.fig.armL.rotation.x = work * 0.5;
    }
  }

  dispose(): void {
    for (const vis of this.settlers.values()) this.group.remove(vis.fig.root);
    this.settlers.clear();
  }
}
