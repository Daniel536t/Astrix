# Project Brief

**Project:** Untitled browser civilization-builder (working name: *Noxel World*)
**Status:** v0.1 — baseline established
**Owner of final authority:** Human project owner
**Last updated:** 2026-10-22

---

## 1. What we are building

A browser-based, three-dimensional civilization-building game.

The player starts as the founder of a settlement in an untamed natural world. There is no
existing civilization: only terrain, vegetation, water, rock, mineral deposits and wildlife.
Through gathering, building, production and population growth, the player transforms that
landscape into a developed civilization with a history.

Design lineage (inspiration only, not a template): the settlement growth and resource economy
of *Age of Empires*; the survival-progression loop of *Whiteout Survival*. The game must
develop its own identity in both art direction and systems.

## 2. The first milestone — "The Untamed World"

Design and ship the **natural environment first**, before any building, road or settlement
system exists.

The world must be legible, inviting, and obviously full of opportunity before the player
places a single structure. It must communicate:

- where building is possible (flat, dry, accessible ground);
- where water is;
- where wood, stone and ore are;
- where terrain is too steep to use;
- that the map continues beyond the starting area.

**Explicit non-goals for Milestone 1:** buildings, construction, population, production,
progression, combat, multiplayer, blockchain, audio.

## 3. Art direction in one paragraph

The world is built from two compatible but deliberately distinct construction systems.
**Voxels** describe the natural world: terrain, cliffs, rock, deposits, ground cover.
**Noxels** describe designed, human-made things later: architecture, props, settlement assets.
The references supplied by the owner define the Noxel language: pale monolithic stone, crisp
axis-aligned boxes with varied proportions, stepped terraces, sparse detail, pink/violet
foliage, and cool violet shadows under warm sunlight. It reads as a stylized low-poly
**diorama**, not as Minecraft-style uniform cubes.

See `Art_Direction_Bible.md`, `Noxel_Style_Guide.md`, `Voxel_Style_Guide.md`.

## 4. Technology decision (locked unless the owner approves a change)

| Concern | Decision |
|---|---|
| Platform | Web browser, desktop-first, mouse + keyboard |
| Rendering | **Three.js** (r180+), WebGL2 |
| Language | **TypeScript**, `strict` |
| Build/dev | **Vite** |
| UI | HTML + CSS overlays (no UI framework in M1) |
| Persistence | `localStorage`, versioned JSON save |
| Assets | glTF/GLB for Noxels; procedural geometry for voxels |
| Engine | Three.js only. No Unity, Godot, Babylon.js or Playwright-adjacent engine swaps without written approval. |

## 5. Team and model allocation

| Role | Agent | Model ID | Budget (planning estimate) |
|---|---|---|---|
| Lead Architect / Technical Director / Orchestrator | **DeepSeek** | `opencode/deepseek-v4.1-flash-free` | ~200k |
| Lead Noxel Artist / Environment Concept | **Mimo** | `opencode/minimax-m3.1-flash-free` | ~1M |
| Voxel World Specialist | **GLM** | `opencode/glm-5.3-flash-free` | ~200k |

Mutable detail in `Agent_Roles_and_Workflows.md`; binding decisions in `Decision_Log.md`.

## 6. Working agreement

- Every task produces a concrete artifact (file, image, model, test, decision record).
- Nothing is marked *Approved* because an agent says it is finished; DeepSeek reviews it.
- Concept art is labelled as concept art. It is never described as implemented content.
- Placeholder geometry is acceptable and preferred over blocked progress.
- The owner approves art direction. Technical detail inside the agreed architecture is decided
  by DeepSeek without asking.

## 7. Document map

| Question | Document |
|---|---|
| What is the game? | `Project_Brief.md` (this file) |
| What are the rules of play? | `Game_Design_Document.md` |
| How is it built? | `Technical_Architecture.md` |
| What does it look like? | `Art_Direction_Bible.md` |
| How are buildings designed? | `Noxel_Style_Guide.md` |
| How is terrain built? | `Voxel_Style_Guide.md` |
| Why was X decided? | `Decision_Log.md` |
| What is next? | `Task_Backlog.md`, `Progress_Report.md` |
