# REF-003 — Owner references, 2026-11-23

**Source:** four phone screenshots sent by the owner in chat on 2026-11-23. The owner said they are
"not exactly what I want" and asked engineering to take what is useful. The original image files are
not in the repo yet; add them to `05_Noxel_Studio/Reference_Images/` as `REF-003_a.png` … `REF-003_d.png`.

**Use:** inspiration for direction, scale and features only. Several are screenshots of other games
(Minecraft-style builds, a *Minecraft Legends*-style scene) or AI art, and one carries a creator watermark.
ASTrix must not copy their textures, models or layouts.

## What each image shows

| Ref | Content | What to take |
|---|---|---|
| **a** — micro-voxel village | Timber-framed white houses with steep, chunky voxel roofs; a square with a stone well; gravel paths with scattered loose stones; a striped crop field; blobby voxel trees; cube boulders; yellow-green shrubs; firewood stack, water trough, handcart; **small blocky villagers** in red and teal standing and pushing a cart. Warm low sun, soft shadows, contact darkening. | Villagers and props bring the place to life. Buildings have pitched roofs and a timber frame. Ground has scattered detail. Fields have visible rows. |
| **b** — aerial valley | A river runs down a narrow valley between **tall snow-capped cliffs**, with white-water rapids. A village spreads along both banks: orange dirt paths, two bridges, a central plaza, terraced green and wheat-yellow fields, conifer forest on the slopes. | **World layout:** a bounded valley the player can actually use, the river as the spine of the settlement, mountains as natural walls, bridges and paths linking districts. |
| **c** — ground-level third person | A character riding a horse, camera behind and above at close range. Stacked-slab conifers, autumn-coloured trees, dense grass tufts and small flowers, terraced ledges, rain and mist, glowing pickups. | **Camera and feel:** close follow camera at human scale, ground cover, weather, a mount. |
| **d** — cozy valley (AI art) | Snow mountain behind morning mist, river with a stone arch bridge, thatched cottages with chimneys and lit windows, a wheat field, a stone well, a treasure chest, lanterns, a **mine entrance** cut into the hillside with stairs, ore and coal piles, a blacksmith. | **Content list:** bridges, wells, chests, lanterns, chimneys with smoke, mine entrance, ore piles, wheat. Mist in valleys. |

## Common direction across all four
1. **One voxel look for everything.** Terrain, trees, rocks, buildings and people are all built from
   visible cubes. Nothing is smooth or faceted.
2. **Inhabited.** Every scene has people, animals or carts doing something.
3. **Valley with a river and big mountains.** Water runs through the middle; snow peaks frame it.
4. **Cozy medieval village:** pitched roofs, timber, plaster, thatch, wells, bridges, fields.
5. **Close, warm, detailed at ground level:** grass, flowers, loose stones, soft shadows, mist.

## Where this conflicts with current approved direction

These need an explicit owner ruling. Engineering will not silently overturn approved decisions.

| Current rule | Source | References show | Proposed ruling |
|---|---|---|---|
| Trees and shrubs are **Styl faceted organics**, not voxels | D-012, ADB §2 | Cube-built trees and shrubs | Replace Styl with **voxel-built organics** (clusters of small cubes, 0.25–0.5 m), keeping faceting only where it reads well, or drop it entirely. |
| Noxel architecture is **pale monolithic stone, flat roofs**; "M1 has no pitched roofs" | Noxel guide v1.0 §1, seed guide line 73 | Timber frame, plaster, steep thatch and shingle roofs | Add a **village tier**: timber + plaster + pitched voxel roof. Keep pale stone for foundations, wells, bridges. |
| Only three mesh languages; a fourth needs an owner decision | ADB §2 | Blocky people and animals | Characters and animals as **box-built figures** (the Noxel box pipeline at 0.1 m quantum). No new language needed. |
| No SSAO or post-processing | ADB §6 | Soft contact shadows and mist | Allow cheap **height fog and per-vertex ambient occlusion** baked by the mesher; still no screen-space post effects. |
| Highlands are a blocky mesa, max height ~92 m, no snow | `sim/world.ts:358-442` | Tall snow peaks framing the valley | Terrain generator v2: taller cliffs, a **SNOW** material above a snowline, the founder valley bounded by mountains. |
| River is flat at sea level | `sim/world.ts:601-610` | River descending with rapids | Generator v2 rivers that drop in steps with rapids. Bumps `GENERATOR_VERSION`; existing browser saves start a new world. |

## Effect on the engineering plan (World_Engine_Audit_2026-11-23)
- **Characters and animals** get easier: blocky box figures use the existing Noxel box pipeline and need
  no skinning. Villagers, deer, sheep, horses, fish, birds.
- **Camera:** close third-person follow, as in ref c. Already Phase B.
- **Water:** ref b and d confirm a visibly moving river with white water at drops. Phase C, plus rapids if
  generator v2 lands.
- **New:** ground cover (grass tufts, flowers, loose stones), props (well, bridge, lantern, chest,
  woodpile, cart), mist, snow.
- **Biggest change:** moving trees and buildings to a full voxel look and the valley-with-mountains
  terrain. Both are larger than the 27th allows if done fully; see the chat summary for the proposed cut.
