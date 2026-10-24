# Community details implementation

## Owned files
- `src/constants/communityLayout.ts`: immutable WORLD coordinate anchors, precinct routes, pure clock boundary function.
- `src/constants/communityLayout.test.ts`: hour-boundary, finite input, deep-freeze, transform, lane and seat contracts.
- `src/components/scenery/CommunityDetails.tsx`: 287-line authored component with one static batch, three static merged geometries and two stock meshes. Existing PlotGeometry construction, world-surface finish, painted SceneText. No new light or shadow source.
- `src/components/scenery/CommunityDetails.test.ts`: actual geometry raycasts, delivered shelter GLB raycast, finite geometry budget, dynamic exclusion and stock visibility.

No edits to VillageArea, FarmArea, FactoryExterior, the people renderer or simulation. Existing dirty work retained. No build, browser, upload, push or deployment launched.

## Root integration
Mount `<CommunityDetails deliveryVisible={actualDeliveryCue} bakeryStocked={actualStockCue} />` once alongside the root's world-life layer. Defaults: no arrived delivery, stocked bakery during opening hours. Dynamic groups explicitly carry `noStaticBatch: true`; the component owns its static batch. Opening state uses a primitive three-bit selector so continuous gameTime changes do not re-render until a boundary changes.

`getCommunityHours(hour)` returns shopsOpen [7,18), pubOpen [11,23), deliveryActive [9,11), gardeningActive [8,17). Finite hours wrap modulo24; non-finite inputs fail closed. The root owns actual production/delivery events. The present filled bakery tray and arrived crates follow explicit props, not a simulated full inventory chain.

## Exact placements
All roots ground-origin, +Z body front, yaw radians. Village is transformed using SITE_LAYOUT.landmarks.village, currently [-190,0,0], yaw0, scale1.

| Export | World position | Yaw | Physical top |
|---|---|---|---|
| millRestNorth | [-34,0,-12] | PI/2 | .46m |
| millRestSouth | [-34,0,-8] | PI/2 | .46m |
| pubSeatNorth | [-208.1,0,-16.9] | PI/2 | .46m |
| pubSeatSouth | [-208.1,0,-13.1] | PI/2 | .46m |
| bakeryCounter | [-174.2,0,6.8] | -PI/2 | .825m display |
| bakeryCustomer | [-175.1,0,6.8] | PI/2 | ground |
| bakeryDoor | [-174.4,0,5] | PI/2 | ground |
| shopDelivery | [-205.3,0,31.6] | PI/2 | ground |
| shopCustomer | [-204.4,0,30] | -PI/2 | ground |
| allotmentGardener | [-215.35,0,9] | 0 | ground |
| allotmentGate | [-207.9,0,9] | -PI/2 | ground |
| pubDoor | [-209.5,0,-15] | -PI/2 | ground |
| busSeat | [29.55,0,140] | -PI/2 | **.522m delivered GLB** |
| busWaiting | [28.4,.1,140] | -PI/2 | shelter slab |

Mill benches each width1.8 support two people at localX +/- .45, hence worldZ +/- .45. They face east and occupy x about [-34.3,-33.7], clear of painted west walkway beginning x-35.5. Root rejected preliminary east-side benches because the live transfer conveyor spans x28.2..31.8. Current benches and suggested millWest route remain west. The root owns job and cross-site navigation authority; convenience work anchors were updated to supplied safe positions.

Pub chair width.54; individual table lies 1.1m in front of each, worldX=-207, top .825. Pub entrance z=-15 remains clear. No bakery stool was inserted behind the display because it would intrude into the frontage. Actual shop doors remain baked in their generated building assets; no whole-building rotation or facade-breaking proxy doors were added.

Allotment is itself rotated PI/2. The gardener stands on the existing central aisle z9, aligned with the real left bed at village[-25.35,11.9]. Can stands village[-24.65,9.4]. Small darkened soil patch rests at y.207 over the existing soil top .2, visible during gardening hours. No duplicate garden enclosure or bed was added.

## Real asset measurements
- Decoded delivered `public/models/world/bus-shelter.glb` with the installed NodeIO/Draco stack. Downward ray at local[0,1,-.55] first hits y=.5220000147819519. Constant .522 and permanent asset regression now reflect this, rather than the primitive fallback's .49 top (.45 centre plus .04 half thickness). Relative to a .46-seat posed person, raise body root .062m. The fallback geometry is .032m lower, a remaining small fallback mismatch owned by exterior integration.
- The boat in FactoryExterior is static at [-145,.1,15], yaw0; the delivered boat model has a -.6Y inner offset, hence net -.5. Decoded actual canal-boat.glb and raycast world[-146.05,4,10.5] and world[-146.05,4,19.5]. Both gunwale hits y=.6525000333786011. New cleats centre .705, base .655, and ropes attach there. Each rope ends on its own bollard at [-151.65,1.35,8] / [-151.65,1.35,22]. Eight short segments give .09m sag and clear the canal wall top1.05. No moving boat is tethered.

## Validation
- Initial local typecheck found three tuple assertions TS2352 at communityLayout lines61/68/75. Replaced inferred number[][] lists with `satisfies Vec3Tuple[]` before mapping. Subsequent `npx tsc --noEmit -p tsconfig.typecheck.json` exited0.
- `npx vitest run src/constants/communityLayout.test.ts src/components/scenery/CommunityDetails.test.ts`: **2 files,19 tests passed**. Includes four mill seating rays, two pub seating and tabletop rays, bakery physical top, actual shelter GLB seat, stock/dynamic-boundary checks, all clock boundaries.
- Targeted `npx eslint` on all four owned files: exit0.
- Targeted `npx prettier --check` on all four: all matched files use Prettier style.
- No final full build or runtime rendering attempted by this lane. Root owns those gates and whole-scene placement reconciliation.

## Caveats
- Visual composition, actual resident poses and runtime lighting are unverified in this lane. Root must capture village, mill break seats and canal after integration.
- No window/curtain occupancy geometry was added: generated building windows were not safely measured here, and overlapping facade proxy geometry would be worse than explicit exterior opening boards. The three boards and filled/empty bread display are the implemented occupancy cues.
- Existing canal vessel remains in its original mid-channel position, with physically attached diagonal mooring lines to the towpath. Moving it nearer the bank would require editing FactoryExterior, outside this lane.
- Geometry tests prove dimensions and finite assembly, not design quality or frame-rate behavior. Full notes preserve details compressed in the return message.
