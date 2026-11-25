// M008 vegetation: block-built species, growth stages and shared distance LOD.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GameSession } from '../src/app/session';
import { resolveInspection, inspectionRef } from '../src/app/inspection';
import {
  CHUNKS_PER_SIDE, createWorld, generateEntityChunk, Entity, World, worldToChunkX, worldToChunkZ,
} from '../src/sim/world';
import {
  BUSH_SPECIES, GROWTH_STAGES, TREE_SPECIES, growthStage, idHash, treeSpecies, vegetationLabel,
} from '../src/sim/vegetation';
import { buildNoxelNature, natureGeometry, natureModel } from '../src/render/nature';
import { DEFAULT_LOD_BANDS, LOD_FAR, LOD_MID, LOD_NEAR, LodBand, LodBatch, selectLodBand } from '../src/render/lod';
import { vegetationPlan } from '../src/render/vegetation-kit';

const BANDS: LodBand[] = [LOD_NEAR, LOD_MID, LOD_FAR];

function fingerprint(world: World): string {
  return [...world.entities.values()]
    .map((e) => `${e.id}|${e.kind}|${e.x}|${e.y}|${e.z}|${e.rot}|${e.scale}|${e.variant}|${e.remaining}`)
    .sort().join('\n');
}

function sampleWorld(): World {
  const world = createWorld(1337);
  // Founder valley, Eastwood (x 220, z -110), the northern, southern and western woods.
  for (const [wx, wz] of [[0, 0], [220, -110], [20, -300], [120, 330], [-340, 120]]) {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      generateEntityChunk(world, worldToChunkX(wx) + dx, worldToChunkZ(wz) + dz);
    }
  }
  // Natural shrubs are sparse; a coarse whole-world grid finds every bush type.
  for (let cz = 0; cz < CHUNKS_PER_SIDE; cz += 6) for (let cx = 0; cx < CHUNKS_PER_SIDE; cx += 6) generateEntityChunk(world, cx, cz);
  return world;
}

test('genesis state hash and entity list are unchanged by vegetation species', () => {
  const a = GameSession.genesis(1337);
  const b = GameSession.genesis(1337);
  assert.equal(a.stateHash, 'e659504b056654dc');
  assert.equal(fingerprint(a.world), fingerprint(b.world));
  // Pinned before M008 changed any rendering: ids, kinds, positions, scale, variant.
  assert.equal(a.world.entities.size, 12);
  assert.equal(idHash(fingerprint(a.world), 0), 0.2041894558351487);
  // Deriving species and stage reads entities only; it must not touch state.
  for (const e of a.world.entities.values()) { treeSpecies(e, a.world.seed); growthStage(e); }
  buildNoxelNature(a.world, null, { camera: { x: 0, y: 30, z: 0 } });
  assert.equal(a.stateHash, 'e659504b056654dc');
  assert.equal(a.world.revision, 0);
});

test('species and growth stage are deterministic and cover every species and stage', () => {
  const w1 = sampleWorld(), w2 = sampleWorld();
  assert.equal(fingerprint(w1), fingerprint(w2));
  const seen = new Map<string, number>();
  for (const e of w1.entities.values()) {
    const e2 = w2.entities.get(e.id)!;
    const species = treeSpecies(e, w1.seed), stage = growthStage(e);
    assert.equal(treeSpecies(e2, w2.seed), species);
    assert.equal(growthStage(e2), stage);
    if (!species || !stage) continue;
    seen.set(species, (seen.get(species) ?? 0) + 1);
    seen.set(`stage:${stage}`, (seen.get(`stage:${stage}`) ?? 0) + 1);
    seen.set(`${species}:${stage}`, 1);
  }
  for (const s of [...TREE_SPECIES, ...BUSH_SPECIES]) assert.ok(seen.get(s), `species ${s} occurs`);
  for (const st of GROWTH_STAGES) assert.ok(seen.get(`stage:${st}`), `stage ${st} occurs`);
  const mature = seen.get('stage:mature')!;
  for (const st of GROWTH_STAGES) assert.ok(mature >= seen.get(`stage:${st}`)!, 'mature is the most common stage');
  // A different seed moves conifer and birch/beech stands.
  const flips = [...w1.entities.values()].filter((e) => e.kind === 'styl_tree_spire' || e.kind === 'styl_tree_cluster')
    .filter((e) => treeSpecies(e, 1337) !== treeSpecies(e, 99)).length;
  assert.ok(flips > 0);
});

test('hero grove trees are mature or old and the inspector names species and stage', () => {
  const session = GameSession.genesis(1337);
  const heroes = [...session.world.entities.values()].filter((e) => e.id.startsWith('hero:styl_tree') || e.id.startsWith('hero:styl_shrub'));
  assert.ok(heroes.length >= 6);
  for (const e of heroes) {
    assert.ok(['mature', 'old'].includes(growthStage(e)!), e.id);
    const info = resolveInspection(session.world, { entityId: e.id })!;
    assert.equal(info.name, vegetationLabel(e, session.world.seed));
    assert.match(info.name, /^(Mature|Old) (pine|spruce|oak|birch|beech|cherry|leafy bush|berry bush|fern clump)$/);
    assert.match(info.description, e.resource === 'fiber' ? /fiber/ : /wood/);
    assert.ok(info.facts.some((f) => f.label === 'Growth'));
  }
  const ore = resolveInspection(session.world, { entityId: 'hero:styl_ore:-38:-42' })!;
  assert.equal(ore.name, 'Purple-seam ore deposit');
});

test('every species and stage has near > mid > far triangles, far <= 36, vertex colours and no textures', () => {
  for (const species of [...TREE_SPECIES, ...BUSH_SPECIES]) {
    for (const stage of GROWTH_STAGES) {
      for (let variant = 0; variant < 3; variant++) {
        const model = { key: `${species}:${stage}:${variant}`, plan: vegetationPlan(species, stage, variant) };
        const [near, mid, far] = BANDS.map((b) => natureGeometry(model, b));
        const t = [near, mid, far].map((g) => g.attributes.position.count / 3);
        assert.ok(t[0] > t[1] && t[1] > t[2], `${model.key} ${t}`);
        assert.ok(t[2] <= 36, `${model.key} far ${t[2]}`);
        // M013 added near-only root spurs, crown lumps and layered spruce tips (REF-006): the near budget
        // for a mature tree went from 160 to 240 triangles; mid and far triangle counts are unchanged.
        if (TREE_SPECIES.includes(species as never) && stage === 'mature') assert.ok(t[0] <= 240, `${model.key} near ${t[0]}`);
        for (const g of [near, mid, far]) {
          assert.ok(g.attributes.color, 'vertex colours');
          assert.equal(g.attributes.uv, undefined, 'no texture coordinates');
          // Box-built: every face normal is axis aligned.
          const n = g.attributes.normal;
          for (let i = 0; i < n.count; i++) {
            const ax = [Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))].sort();
            assert.deepEqual(ax, [0, 0, 1]);
          }
        }
      }
    }
  }
  const session = GameSession.genesis(1337);
  const result = buildNoxelNature(session.world);
  for (const child of result.group.children) {
    const mat = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
    assert.equal(mat.map, null);
    assert.equal(mat.vertexColors, true);
  }
});

test('LOD selector hysteresis does not flip an instance oscillating inside the dead zone', () => {
  const { near, mid, hysteresis } = DEFAULT_LOD_BANDS;
  assert.equal(selectLodBand(near - 1, null), LOD_NEAR);
  assert.equal(selectLodBand(near + 1, null), LOD_MID);
  assert.equal(selectLodBand(mid + 1, null), LOD_FAR);
  let band = selectLodBand(near - 1, null);
  for (let i = 0; i < 20; i++) {
    band = selectLodBand(near + (i % 2 ? 1 : -1) * (hysteresis - 0.5), band);
    assert.equal(band, LOD_NEAR);
  }
  band = selectLodBand(near + hysteresis + 0.5, band);
  assert.equal(band, LOD_MID);
  for (let i = 0; i < 20; i++) {
    band = selectLodBand(near + (i % 2 ? 1 : -1) * (hysteresis - 0.5), band);
    assert.equal(band, LOD_MID);
  }
  assert.equal(selectLodBand(near - hysteresis - 0.5, band), LOD_NEAR);
  assert.equal(selectLodBand(mid + hysteresis - 0.5, LOD_MID), LOD_MID);
  assert.equal(selectLodBand(mid - hysteresis + 0.5, LOD_FAR), LOD_FAR);
  assert.equal(selectLodBand(near - hysteresis - 1, LOD_FAR), LOD_NEAR);
});

test('LodBatch switches geometry with the camera, is throttled, keeps ids, and far instances cast no shadow', () => {
  const session = GameSession.genesis(1337);
  const result = buildNoxelNature(session.world, null, { camera: { x: -28, y: 20, z: -30 } });
  const lod = result.lod!;
  assert.ok(lod instanceof LodBatch);
  assert.equal(result.group.children.length, 2);
  assert.equal(lod.main.castShadow, true);
  assert.equal(lod.far.castShadow, false);
  const ids = lod.main.userData.inspectableBatchIds as string[];
  assert.equal(ids.length, result.instances);
  assert.equal(lod.far.userData.inspectableBatchIds, ids);
  const before = ids.slice();
  const check = () => {
    for (let i = 0; i < lod.count; i++) {
      const band = lod.bandAt(i);
      // Far instances are drawn only by the non-casting mesh.
      assert.equal(lod.main.getVisibleAt(i), band !== LOD_FAR);
      assert.equal(lod.far.getVisibleAt(i), band === LOD_FAR);
      const e = session.world.entities.get(ids[i])!;
      const model = natureModel(e, session.world.seed)!;
      const expected = band === LOD_FAR ? lod.far.getGeometryIdAt(i) : lod.main.getGeometryIdAt(i);
      const mesh = band === LOD_FAR ? lod.far : lod.main;
      const range = mesh.getGeometryRangeAt(expected);
      assert.equal(range.count, natureGeometry(model, band).attributes.position.count);
      assert.deepEqual(inspectionRef(mesh, i), { entityId: e.id });
    }
  };
  const near0 = result.lodCounts.near.instances;
  assert.ok(near0 > 0);
  check();
  // Small camera moves do not re-evaluate (throttled).
  assert.equal(lod.update({ x: -27, y: 20, z: -30 }), false);
  // Moving 400 m away pushes every grove tree to the far band.
  assert.equal(lod.update({ x: 400, y: 20, z: 400 }), true);
  const stats = lod.stats();
  assert.ok(stats.instances[LOD_FAR] > 0 && stats.instances[LOD_NEAR] < near0);
  assert.ok(stats.triangles[LOD_FAR] <= stats.instances[LOD_FAR] * 36);
  check();
  assert.deepEqual(ids, before, 'batch ids keep mapping the same entities');
  lod.update({ x: -28, y: 20, z: -30 });
  assert.equal(lod.stats().instances[LOD_NEAR], near0);
  check();
});

test('harvested entities are not drawn and rebuilds reuse identical cached geometry', () => {
  const session = GameSession.genesis(1337);
  const all = buildNoxelNature(session.world);
  const tree = [...session.world.entities.values()].find((e: Entity) => e.kind.startsWith('styl_tree'))!;
  tree.harvested = true;
  const after = buildNoxelNature(session.world);
  assert.equal(after.instances, all.instances - 1);
  assert.equal((after.lod!.main.userData.inspectableBatchIds as string[]).includes(tree.id), false);
  tree.harvested = false;
  const again = buildNoxelNature(session.world);
  assert.equal(again.triangles, all.triangles);
  assert.equal(again.instances, all.instances);
});
