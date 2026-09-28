# Landscape cohesion and scene readiness

Local working-tree refinement, 27 September 2026. No publication or audio playback.

This is self-review of my authored landscape and asset work, plus the delegated startup implementation integrated and checked by me. It is not independent aesthetic review.

## Concept to runtime

| Concept decision | Actual implementation | Evidence |
|---|---|---|
| Give cottages gardens and the farm a field boundary | Forty interrupted hedge runs, five cottage plots, open approaches, crop service gates, station rear boundary and parkland edge | Village, field and garden views; LandscapeDressing tests |
| Break up the level meadows | Four additional low rises and three shallow hollows on the existing terrain grid; occupied pads and roads stay clear | Meadow and hollow views; valley relief and city-ground tests |
| Give the canal a plausible river connection | Opened bank, one L-shaped upper surface, supported masonry invert and a 2.15 m falling sheet reaching the lower river | Water junction and weir views; actual geometry ray and terrain-grid tests |
| Set the culverts into the land | Turf bank tapers past the rounded channel end into dry terrain, with terrain-fitted lateral feet | Final water views at both terrain grids; perimeter and dry-tail tests |
| Improve the existing lock asset | Recessed plank seams, two iron rails per face, hinge plates, bolts and paired fixed paddle-screw handwheels | Front and rear lock views; leaf seam and walkway-clearance tests |
| Preserve the earlier lighting work | Existing neutral hall light, two downward station banks and one shadow caster; no new light source | Day/night frames and runtime light inspection |

The landscape concept is a proposal rather than an exact screenshot target. Its distant waterfall, extra mountain stream, relocated buildings, extra forest and altered village paving were rejected. The existing site, castle, shop, paths and navigation remain in place. The lock concept supplies joinery and hardware detail while retaining the real posts, upper beam, operating beam and leaf opening. The new handwheels are visual hardware, not interactive controls.

## Resource choices

The added hedge rows share the existing leaf atlas and depth material, with 1,047 crowns in one instanced mesh. Signed meadow relief uses the existing terrain vertices and dirt channel. The spillway shares the water animation clock, has no reflection pass and adds no particles or light. Lock trim uses one merged vertex-coloured geometry and the existing trim material. Culvert geometry stays below its existing 2,000-triangle ceiling. Delivery GLBs and provider originals are unchanged in this continuation.

## Visual disposition

The cottage approaches and crop service gate remain open. Hedge silhouettes are interrupted and variable at ground level; broad meadow areas remain available instead of becoming dense decorative clutter. Small hillocks and dips read most clearly near ground level. The masonry outlet visibly meets the river and its falling ribbons break up the initial flat/striped sheet. The culvert tail extends beyond the submerged channel end.

Unlit rural areas remain dark at night. The gas-station light remains beneath the canopy, and the mill front faces remain readable without new shadow passes. The final gallery selects current frames; intermediate frames with shorter/floating culvert banks and striped falling water remain in their original evidence directories and are superseded.

## Startup behavior

First-frame notification still schedules the complete world and deferred UI. It no longer dismisses the loader. Asset requests, lazy imports, procedural-cache work, static batching and new shader/geometry/texture uploads all precede a 45-frame settled window. The loader has no automatic eight-second escape. A prolonged startup exposes explicit Reload and Continue while preparing controls, with continued preparation clearly labelled.

This gate measures the current starting camera and workload. It cannot guarantee that a later camera movement never encounters a new shader, or that a slow device will suddenly render at 30 FPS. On hardware/settings unable to achieve the settled window, recovery remains an explicit user choice. Runtime evidence and performance status are recorded separately in VALIDATION.md.
