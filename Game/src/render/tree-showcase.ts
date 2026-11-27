// Developer lineup of every tree species through its whole lifecycle, beside a
// 1.7 m person, for art review (M013, REF-006): ?trees=1, camera via the usual
// tx/ty/tz/yaw/pitch/dist. Rows are species, columns the stages sapling,
// young, mature, old, dying, dead snag and stump, all at the near LOD (the
// detail a player sees close up). Presentation only: nothing here is an
// entity, so it is not simulated, saved or harvestable.
import * as THREE from 'three';
import { TREE_SPECIES } from '../sim/vegetation';
import { TREE_STAGES } from '../sim/woodland';
import { LOD_NEAR } from './lod';
import { natureGeometry, natureMaterial } from './nature';
import { vegetationPlan } from './vegetation-kit';
import { buildFigure, FOUNDER_STYLE } from './characters';

export const SHOWCASE_SPACING = { x: 7, z: 8 } as const;

export function buildTreeShowcase(x0: number, z0: number, ground: (x: number, z: number) => number): { group: THREE.Group; update: (dt: number) => void } {
  const group = new THREE.Group();
  group.name = 'tree_showcase';
  TREE_SPECIES.forEach((sp, row) => {
    TREE_STAGES.forEach((stage, col) => {
      const x = x0 + col * SHOWCASE_SPACING.x, z = z0 + row * SHOWCASE_SPACING.z;
      const model = { key: `${sp}:${stage}:0`, plan: vegetationPlan(sp, stage, 0) };
      const mesh = new THREE.Mesh(natureGeometry(model, LOD_NEAR), natureMaterial);
      mesh.position.set(x, ground(x, z) - 1.15, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = `showcase_${sp}_${stage}`;
      group.add(mesh);
    });
  });
  const person = buildFigure(FOUNDER_STYLE);
  person.root.position.set(x0 - 2.5, ground(x0 - 2.5, z0), z0);
  group.add(person.root);
  return { group, update: () => {} };
}
