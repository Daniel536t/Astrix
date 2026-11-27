# REF-004: Owner milestone illustrations, 2026-11-24

**Source:** seven phone screenshots supplied by the owner on 2026-11-23, stored byte-for-byte in `05_Noxel_Studio/Reference_Images/2026-11-23_magicblock-milestone/`. The owner's instruction: "that's where you'll be taking the game next."

**Use:** direction only. Several images are screenshots of other games (a texture-pack Minecraft shader scene, a "Development Build" colony game) or AI art. ASTrix must not copy their textures, models or layouts.

## What each image shows

| # | File (time stamp) | Content | What to take |
|---|---|---|---|
| 1 | `…20-53-55-212` | Aerial valley: dense broadleaf forest in many greens with red-brown trunks, a conifer belt, snow peaks. A winding river with orange-sand banks, terraced meadow steps, a timber watchtower, a stone road bridge. | **Forest variety and density.** Many tree sizes and species, canopies of stacked cubes, warm hazy light, the river as the spine of the map. |
| 2 | `…20-53-59-703` | Hilltop farmstead: stone foundation, two-storey timber house with lit windows, wall lanterns and an outside stair. A granary on stilts and an open barn with crates. Stepped crop terraces with hedges and a farmer in a straw hat. | **Buildings with foundations, storeys and stairs. Farms that step down a slope. Lanterns.** |
| 3 | `…20-54-03-466` | Market square: stalls with red, blue and green striped awnings, crates of produce, barrels, signs, cobbled plaza. Robed block villagers trading a green gem. | **A market as the social centre.** Visible goods, traders, emerald-style currency. A natural place to show the on-chain stockpile. |
| 4 | `…20-54-10-006` | Large colony from above: a walled timber and sandstone compound with battlements, a big grid of crop fields with paths, villagers walking between them, a beach with a wooden pier, forested hills, rock cliffs. | **Scale goal.** A settlement that grows into dozens of fields, walls, a dock and many villagers. |
| 5 | `…20-54-13-907` | Flat-colour voxel terraced village (closest to our current look): grass terraces with grey stone cliff faces, stairs cut into the cliffs, dirt paths, timber-framed houses with red and brown block roofs. A stream that falls between terraces into a pond, sheep, deer, boars, a woolly mammoth in a fenced pen, a well, a cart, wheat and pumpkins, villagers carrying goods. | **Terrain language and life.** Cliff faces with strata, carved stairs, waterfalls between levels, herds, pens, villagers at work. |
| 6 | `…20-54-21-104` | Flat-colour voxel farm village: ploughed plots with crops at several growth stages, a water trough and planters, mine-cart rails, stone-and-timber houses with chimneys, cobble paths, cows. Water-drop icons over crops that need watering. | **Colony-sim feedback.** Crops visibly grow and ask for care (need icons). Rails link the farm to the mine. |
| 7 | `…20-54-29-819` | Cozy homestead: a round fenced clearing under giant cube-canopy trees, cottages with chimneys, raised garden beds, sheep, a pig, picnic tables, a path out to rolling hills. | **The first-hour target.** A small, lived-in home the player builds before the colony grows. Very chunky trees. |

## Two visual families

- **Textured pixel blocks** (1–4): every block carries a pixel texture (leaves, planks, cobble). This is the Minecraft look.
- **Flat-colour voxels** (5–7): plain colours per block with light, shade and ambient occlusion. This is what ASTrix renders today.

**Recommendation: stay flat-colour and take the content and scale from 1–4.** Reasons:
- It matches the engine and the greedy mesher we already have.
- It keeps ASTrix visually distinct from Minecraft.
- It is cheaper on phones.
- It matches the owner's block-built ruling.

Texture packs could be revisited later as an option. **This is a decision for the owner.**

## Gap between the game today and these images (honest)

| Area | Today | Images |
|---|---|---|
| Trees | Faceted low-poly crowns (including the pink faceted tree) | Every canopy is stacked cubes, in many species and sizes |
| Terrain | v2 valley terraces, flowing river, cascades | Stone cliff faces between terraces, carved stairs, waterfalls into ponds, beaches and piers |
| Ground | Grass and a few shrubs | Flowers, tall grass, loose stones, hedges, cobbled and dirt paths |
| Buildings | Village kit: cottage, well, bridge, lantern, woodpile, fence, crate | Two storeys, foundations, barns, granaries, market stalls, walls, docks, chimneys with smoke, lit windows |
| People | The player plus static settler figures for the on-chain settlement | Villagers with jobs (farmers, traders, carriers) walking between places |
| Animals | Deer-type fauna and fish | Sheep, cows, pigs, boars, a mammoth, pens and herds |
| Farming | Crop rows as flat boxes | Ploughed plots, visible growth stages, need icons, watering |
| Economy | Stockpile on the HUD and on chain | A market where goods are visible and traded |

## Proposed path (each step is a playable milestone)

1. **M006 Living homestead** (image 7 and the life in 5): block-built trees in 4–5 species to replace the faceted crowns. Flowers, tall grass and stones. Sheep and cows in pens. Two or three villagers with jobs (farmer, woodcutter) who walk real paths. Crop plots with visible growth stages driven by the simulation.
2. **M007 Terraces and water** (5, 1): stone cliff faces with strata between terraces, stairs carved by the generator, waterfalls into ponds, sand beaches, a wooden pier. This builds directly on today's swimming.
3. **M008 Market and trade** (3, 6): a market square with stalls that show the real stockpile (on-chain when connected), villager trading, crop need icons, a water trough.
4. **M009 Colony scale** (4, 2): two-storey houses, barns, granaries, walls and gates, large field grids, chimney smoke and lit windows at night.

Questions for the owner:
- Flat-colour (recommended) or textured?
- Start with M006 (recommended)?
- Image 5 has a mammoth: are Ice Age or fantasy animals in scope, or only farm and wild animals?
