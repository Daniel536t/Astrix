# Game Design Document — v0.1

**Status:** Milestone-1 scoped. Later systems are named, not designed.

---

## 1. Player fantasy

You arrive in an untouched landscape and turn geography into civilization. The map is the puzzle:
where the water is decides where the fields go; where the stone is decides where the town grows;
the cliff you cannot build on becomes the wall you do not have to build.

## 2. Core loop (target, not yet implemented)

**Observe** the landscape → **gather** wood/stone/food → **build** → **produce** → **grow population**
→ **unlock** better architecture and infrastructure → **reshape** the landscape.

## 3. Milestone 1 — The Untamed World (only what is in scope)

**Player can:** look at a beautiful, readable natural world and move the camera around it.

**Must be true:**
- Terrain with plains, hills, a cliff mass, and at least one natural route between regions.
- Water: one lake or river with a clearly legible shoreline.
- Vegetation: individual trees, clusters, a dense patch, ground cover.
- Resources: wood, stone, ore visible and distinguishable at gameplay distance.
- One clearing that is obviously the place to start a settlement.
- Lighting and atmosphere matching ADB §6.
- No UI beyond a minimal hint. No buildings. No resources in inventory yet.

**Success test:** a person who has never seen the project looks at a screenshot and can point to
(a) where they would build, (b) the water, (c) the forest, (d) the stone, (e) the dangerous slope.

## 4. Milestone 2 — First Structures

Resource inventory; building sidebar; 2–3 building definitions with costs; ghost placement preview;
validity rules (flat enough, not water, not on a resource, inside map); place → deduct → construct.

## 5. Milestone 3 — Economy

Gathering from nodes (with depletion), storage, production buildings, population growth, and the
first progression unlock.

## 6. World rules that constrain design

- No pre-existing civilization anywhere. Ruins are a *possible later discovery*, not the premise.
- Resource distribution follows geology, not uniform randomness.
- The starting area must be buildable but not the richest tile on the map; expansion must be motivated.
- Terrain change (leveling, digging) is a later system; M1 terrain is static.

## 7. Explicitly out of scope

Multiplayer, blockchain, monetisation, combat, naval, full day/night cycle (pending Q-002),
procedural infinite worlds, mod support, mobile layout.
