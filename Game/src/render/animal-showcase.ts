// Developer lineup of every animal model beside a 1.7 m person, for art review
// and scale checks: ?animals=1 (camera via the usual tx/ty/tz/yaw/pitch/dist).
// Front row adults (alternating male/female and standing/walking), back row young.
import * as THREE from 'three';
import { AnimalBatch } from './animal-kit';
import { ANIMAL_MODELS, AnimalModelId } from './animal-models';
import { buildFigure, FOUNDER_STYLE } from './characters';

const ORDER: AnimalModelId[] = ['chicken', 'rabbit', 'fox', 'pig', 'sheep', 'goat', 'wolf', 'deer', 'cattle', 'horse', 'trout']
  .filter((id) => id in ANIMAL_MODELS) as AnimalModelId[];

export function buildAnimalShowcase(x0: number, z0: number, ground: (x: number, z: number) => number): { group: THREE.Group; update: (dt: number) => void } {
  const group = new THREE.Group();
  group.name = 'animal_showcase';
  const person = buildFigure(FOUNDER_STYLE);
  person.root.position.set(x0 - 2.2, ground(x0 - 2.2, z0), z0);
  person.root.rotation.y = 0;
  group.add(person.root);
  const batches = ORDER.map((id) => {
    const b = new AnimalBatch(ANIMAL_MODELS[id], 8, `showcase_${id}`);
    group.add(b.mesh);
    return { id, b };
  });
  let t = 0;
  const update = (dt: number) => {
    t += dt;
    batches.forEach(({ id, b }, i) => {
      b.begin();
      const x = x0 + i * 2.6 + (id === 'cattle' || id === 'horse' ? 0.8 : 0);
      for (const [row, young] of [[0, false], [-2.8, true]] as const) {
        for (const male of [false, true]) {
          const walking = male;
          const px = x + (male ? 1.0 : 0), pz = z0 - row + (male ? 0 : 0);
          const gy = ground(px, pz);
          const sc = young ? 0.6 : 1;
          b.push({
            x: px, y: id === 'trout' ? gy + 1.2 : gy, z: pz, heading: 0.35 + (male ? 0.6 : 0), scale: sc,
            phase: t * (walking ? 5 : 1.5), legSwing: walking ? 0.6 : 0, headPitch: !walking && !young ? 0.5 + Math.sin(t * 2) * 0.1 : 0.05,
            tailWag: 0.35, male, young, lying: !walking && young && id !== 'trout', extra: id === 'chicken' ? 0 : 1,
          });
        }
      }
      b.end();
    });
  };
  update(0);
  return { group, update };
}
