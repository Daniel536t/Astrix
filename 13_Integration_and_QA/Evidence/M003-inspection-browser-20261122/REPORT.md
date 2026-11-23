# Read-only object inspection — implementation and pale-object investigation

**Date:** 2026-11-22  
**Scope:** production-browser object names/descriptions, desktop hover/click, emulated touch tap/gesture behavior, keyboard discovery, and factual identification of pale scene geometry.  
**Authority:** unchanged: `local-stub / local-simulation-only`.

## What the pale chunks are

Source inspection and the rendered scene identify **authored objects**, not a class of proven stray geometry. No objects have been removed.

| Visible form | Inspector identity | Meaning |
|---|---|---|
| Small pale stacked blocks | Small stone deposit / Stone boulder / Large stone outcrop | Persistent natural stone resources; intended block geometry. |
| Deliberately stacked pale stones | Stone cairn | Persistent natural stone resource. |
| Pale rock with purple seams | Purple-seam ore deposit | Persistent natural ore resource in a pale host rock. |
| Tall cream/teal forked form | Waystone | Provisional Noxel navigation landmark; not harvestable. |
| Small cream/teal marker | Trail marker | Provisional Noxel route/point-of-interest marker; not harvestable. |

The shared cream material palette makes rocks and Noxel landmarks look similar. That similarity is not evidence that the rocks are unfinished architecture or disposable debris. Gathering a resource is still an accepted gameplay command; merely inspecting it never gathers or deletes it.

## Object coverage

The inspector resolves live authoritative identities and quantities for every authored `EntityKind`: Spire tree, Table-canopy tree, Cluster tree, Blossom tree, Fiber shrub, three stone-deposit sizes, Purple-seam ore deposit, Stone cairn, Waystone, and Trail marker.

Architecture/infrastructure coverage includes:

- **Founder's house**, **Door path**, and **Terraced field**, using pinned project names/descriptions and authoritative structure footprints.
- **Founder stockpile**, including current contents and capacity.
- **Terrace crop plot 1–9**, including empty/growing/ready state, growth, and expected yield.
- The provisional **Noxel post**, **wall panel**, **gateway**, **stair**, and **waystone** integration-test kit.

The card explicitly identifies provisional Noxel art; this feature does not approve that art.

## Implemented interaction

- Desktop mouse movement produces a cursor-following hover card; clicking pins it.
- Touch taps use the same selection controller and a close control of at least 44 × 44 CSS pixels.
- Close and Escape dismiss the card. Escape also closes the keyboard list.
- **Inspect** opens a keyboard-operable list of currently rendered named objects. Choosing one pins the card and focuses its Close button; dismissal restores world-canvas focus when appropriate.
- Drag, multi-pointer pinch, and pointer cancellation do not pin an object.
- Batched natural geometry maps its `batchId` to the authoritative entity ID. Parent-owned decoration inherits one owner, ancestor visibility is checked, and terrain/unknown opaque geometry blocks deeper picks.
- Dynamic nature/life rebuilds retain stable registered roots. Live cards refresh after accepted gameplay commands; missing or exhausted entities are not resolvable.
- Inspection never calls `GameSession.dispatch` or a save operation.
- Production diagnostics expose names/anchors and selection state only; no mutable production scene or world handle was added.

The World-controls radio's accessible label was also corrected from `Show settlement panel` to `Show only world controls`; its behavior is unchanged. Mobile World controls previously hid the inspector through an overly broad CSS selector; inspection is now hidden only in Build mode. Focused inspector controls can receive Escape because the global shortcut guard no longer intercepts it.

## Source verification

- `npm --prefix Game run typecheck`: passed.
- `npm --prefix Game test`: **123 passed, 0 failed**, including complete catalog coverage, natural `BatchedMesh` identity, stable-root targets, live stockpile/crop facts, opaque terrain occlusion, crop-row selection through terrace soil, hidden ancestor rejection, and nonmutation. Strengthened assertions cover World-mode inspector visibility, focused-control Escape delivery, and preservation of inspection when canvas focus moves to its Close control.
- `npm --prefix Game run build`: passed. Current bundles: `index-CmgcNKmU.js`, `index-B3z1mQow.css`, `three-core-BAQCSfOu.js`, and `three-renderer-BjqbDaYq.js`.

Identity tests are not claimed as proof of usable browser pointer/touch interaction.

## Production-browser verification

The independent harness is `browser-verification.mjs`. It runs against the built bundle served on local port 4173 using Chromium + SwiftShader and real DOM/keyboard/pointer/touch events. Read-only projection of registered object anchors locates objects on screen; no mutable simulation handle or direct dispatch is used.

The retained failed runs exposed and led to fixes for keyboard-focus restoration, global Escape suppression, crop-row occlusion by terrace soil, the saved-farm camera, an incorrect missing metrics field, hidden touch-only controls on desktop, and the mobile World-mode inspector CSS. Failed JSON, console, and screenshot evidence retains its original or uniquely suffixed filename. A final interrupted run is labelled `results-failure-session-interrupted-final-mobile.json`; it is not counted as a pass.

During public verification, the server returned the current HTML but a 404 for the newly referenced CSS asset. The orphaned long-running static server had cached the earlier asset listing. A subsequent public run served the corrected assets but failed its real Close-click assertion because focus became `BODY` instead of returning to the world canvas. The original result is retained in `public-results-failure-close-focus.json`. Event tracing showed that canvas blur dismissed the card while focus moved to Close, before the button's click callback could execute. `Game/src/app/inspector.ts` now permits focus transfer into the inspector and still dismisses when focus moves to unrelated UI. A separate local run failed because the mobile browser fixture was re-injected on reload, restoring pre-harvest save bytes; its unchanged simulation state proved that inspection itself had not performed that write. The result is retained in `results-failure-mobile-save-sync.json`, and the harness now seeds its save only once per browser context.

The public static server was subsequently refreshed as a single explicit port-80 listener serving only `Game/dist`. The public HTML matches `Game/dist/index.html`, and HTTP checks confirmed delivery of the current JavaScript and CSS. HTTP success alone is not treated as public interaction approval.

**Local production interaction result:** `results.json` records `status: "passed"` on 2026-11-22, with ten completed recorded steps and **zero errors**. The run verified real Waystone hover and pinning, Close-click focus restoration, Escape dismissal, a keyboard list of 274 live targets with selection and focus restoration, desktop drag rejection, pale Stone boulder/Stone cairn/Purple-seam ore identities, founder-stockpile and saved-crop inspection, dynamic natural-target retention after harvesting, and live crop-card refresh after harvesting/rebuilding life geometry. Emulated touch verified Stone boulder and Waystone taps, visible cards, a 44 × 44 CSS-pixel Close control, and drag/pinch rejection. Strict comparisons confirmed that inspection changed neither simulation state, inventory, accepted-command counts, nor saved bytes; the separate farm setup and lifecycle checks use real accepted UI commands. `console.log` is empty. All previously failed runs remain preserved.

**Public interaction result:** `public-results.json` records `status: "passed"` on 2026-11-22. The completed harness verified a real desktop Stone boulder click and its intentional-resource description, Close-click focus restoration to the canvas, emulated touch selection with a visible card and working 44 × 44 CSS-pixel Close control, all four current production assets, **zero console/page errors**, and **zero failed requests**. The older failed public artifact remains preserved. A final HTTP check confirmed the preview was still available on port 80.

Desktop screenshots identify Waystone, pale stone/cairn, purple-seam ore, founder stockpile, and crop plots. Mobile screenshots use a 390 × 844 emulated Chromium context. **SwiftShader is not hardware-GPU performance evidence, and mobile emulation is not physical-device usability approval.**

## Boundaries

- No blanket resource removal or unrelated visual redesign was performed.
- No terrain, natural resource, persistent stockpile, crop, or structure was deleted to make the scene less cluttered.
- No external publication, commit, push, chain integration, multiplayer claim, or milestone/art approval is part of this change.
- Independent M002 review, owner art approval, physical-device testing, and physical-GPU performance testing remain open.
