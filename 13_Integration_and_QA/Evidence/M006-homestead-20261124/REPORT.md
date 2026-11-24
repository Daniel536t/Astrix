# M006 living homestead: evidence (2026-11-24)

Design: `00_Project_Core/Homestead_M006_2026-11-24.md`.

## Automated tests
`npm test`: 180 pass, 0 fail. `tests/m006.homestead.test.ts` has 13 tests, and each one runs the journaled commands and ticks. They cover:
- **Founding:** villagers, all 6 species and the real supplies.
- **Player-designed fields:** position, size, crop, fence cost, rejection reasons, changing the crop, removing a field.
- **The farmer's full loop:** dig, sow with seed from the store, water, grow, harvest, deliver.
- **Water:** a dry crop stops growing and withers; dormant seed waits.
- **The herder:** delivers eggs, milk and wool; no animal starves or dies.
- **Neglect:** animals starve to death.
- **Breeding:** respects capacity and replays exactly.
- **Player work:** with the bag (bucket, digging, missing seed or straw).
- **Steward permissions:** may act, ask first (approval spends real wood), never.
- **Seed reservation.**
- **Save and restore:** after reload, with tampering rejected.
- **Old-world compatibility:** worlds without a homestead keep their exact hashes.
- **Night:** villagers rest at home.

A 10-day simulated run with one 6×6 wheat field and one 4×4 potato field kept cycling: both fields were harvested and replanted repeatedly. The herd grew from 15 to 34 with zero starving animals, food in store rose from 10 to about 100, and replay and restore matched the live state hash.

## Browser (Chrome; desktop 1280×800 and touch-emulated phone 844×390)
| Step | Result |
|---|---|
| Load an existing world | Homestead founded automatically: Ada (farmer), Bram (herder), 15 animals, no inspector element (`M006-01`) |
| F opens the field planner | Crop buttons, width and depth, live reasons; walked until valid (`M006-03`) |
| Mark a 5×4 m potato field | Wood 24 → 19 (fence 5), toast "Ada will dig and sow it" |
| Watch | Ada: till → sow (3 seed) → water; field stages wild → tilled → growing, soil 100% (`M006-04`) |
| Farm panel | Fields, people with live tasks, animals with purposes, troughs, steward policies (`M006-05`) |
| Reload | Same field (id, crop, size, state), same animals, tick continued |
| Phone: Farm → Plan a new field → Flax → joystick walk → Mark field | Field marked (4 wood); the Use button reads "Dig the flax field" (`M006-06..08`) |
| Page errors | none |

## Performance
- **Draw calls and triangles:** 117 draw calls and about 246k triangles in the homestead view, against a documented budget of 120 calls and 250k triangles. The homestead adds roughly 6 calls for the herd (one instanced mesh per species), plus fields, buildings, troughs and villagers.
- **Little headroom left:** both numbers are at the edge of the budget. Merging building meshes is the next optimisation if needed.
- **Frame time:** this sandbox renders with software WebGL at about 1.4 fps, so frame times here are not meaningful.
- **Sim cost:** 2,000 ticks of the full homestead sim took about 0.7 s in Node, about 0.35 ms per tick. A tick runs every 2 s.

## Not verified
- Real phone feel.
- Long real-time sessions in the browser (the multi-day runs were in Node).
- Save size: about 240 bytes of journal per tick, so a save reaches about 5 MB after about 11.5 hours of play. Journal compaction is needed before long sessions are safe. This was measured this session and **predates M006**.
