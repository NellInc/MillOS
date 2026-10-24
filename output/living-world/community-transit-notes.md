# Community transit lane

## Files and integration
- `src/components/scenery/CommunityTransit.tsx`
- `src/components/scenery/CommunityTransit.test.ts`

`CommunityBus({ pose })` reads a stable mutable object each render frame:
```ts
{ x: number; z: number; rotation: number; doorsOpen: boolean | number; visible: boolean }
```
`DeliveryHandcart({ pose })` reads:
```ts
{ visible: boolean; position: readonly [number, number, number]; rotation: number; loaded: boolean }
```
Exports also include `COMMUNITY_BUS_LAYOUT`, `COMMUNITY_TRANSIT_GEOMETRY` and pure `communityDoorPositions(progress)` for inspection and geometry tests. No simulation schedules, routes, pavement, store changes or root mount belong to this lane.

## Geometry and pose contract
- Bus body width2.2m, roof3m, nominal length8m. Front/rear lamp faces extend overall length to8.025m. Sliding leaves stand a few centimetres outside the body side.
- Bus ground-origin, local+Z front. Four wheel centres y.42, radius.42, localx+/-.995. Axles z-2.45 and+1.0. The forward axle sits behind the front-side entrance rather than obstructing it.
- Entrance localx=-1.1, z=2.4. Its shell and glazing gap extends z1.8..3.0. Floor top.58, low step top.32 and contrasting threshold at.34.
- At worldroot[23,0,140], yawPI, entrance maps to x24.1/z137.6, as requested.
- Real door leaves centrez2.1/2.7 when closed. Each leaf is.6m wide, so they close at the central seam. When fully open they slide toz1.45/3.35, leaving the portal clear. The finite, clamped progress helper is tested, while frame animation uses exponential damping. Hidden/invalid poses suppress the whole object.
- Green/cream authored panels, structural window dividers, opaque blue-grey glazing, rubber tyres and muted hubs. No operator, interior person or steering wheel.
- Destination text reads `42 MILL & VILLAGE` with a modest emissive standard material. No point, directional or spot lights, and no audio.
- Bus draw budget: body, windows, one instanced wheel draw, two moving leaves, text: six nominal draws, excluding shadow passes. Existing vehicle-surface treatment adds mild metre-based road film without new shader code.
- Cart's timber bed top.47; wheel centresy.27/radius.27. Two wheels share one instanced draw. Four flour sacks form a separate merged mesh and follow `pose.loaded` without rerendering.
- Cart front+Z, rear handles centred local[+/-.32,.85,-1.2], reaching approximatelyz-1.33. Put cartroot about1.4m ahead of a forward-facing courier, then root owns exact hand alignment.
- Cart nominal three draws: structure, instanced wheels, sacks. Wheel angle advances from actual travelled distance. No per-frame geometry/material rebuilds, no new vector allocations in wheel updates, no React setState.

## Checks
Initial geometry suite:6 passed/1 failed. The bus width envelope measured2.2049999m because the cream belt projected2.5mm past each side. Corrected the belt thickness from.085 to.08 rather than weakening the exact body-width check.

Final:
- `npx vitest run src/components/scenery/CommunityTransit.test.ts`: **7 passed**.
- `npx eslint src/components/scenery/CommunityTransit.tsx src/components/scenery/CommunityTransit.test.ts`: exit0.
- `npx prettier --check src/components/scenery/CommunityTransit.tsx src/components/scenery/CommunityTransit.test.ts`: all matched files use Prettier style.

Tests check finite merged positions/normals/colours, total geometry below5500 triangles, body envelope, real shell/glazing opening at threez and foury probes, sliding door clearance, world boarding transform, wheel ground contact, sack containment, and mutable-pose/no-operator/no-light source contracts.

## Caveats and root proof
No browser, whole-project typecheck, full build or performance benchmark launched in this lane. Root owns those integrated gates. The authored styling and physical door travel need rendered inspection; geometry tests do not establish visual quality or hand-to-handle contact. Root must keep bus and courier trajectories safe, supply stock/delivery events, and mount each component once. The cart body does not autonomously tip or steer; its pose follows the root's route. No unrelated or concurrent files were modified.

## Bicycle addition

Added `CommunityBicycle({ pose })` to the same owned module without changing bus/cart APIs. Stable mutable pose: `{ x, z, rotation, visible, pedalPhase }`, with `pedalPhase` radians. Exports `COMMUNITY_BICYCLE_LAYOUT`, `COMMUNITY_BICYCLE_GEOMETRY` and `communityBicyclePedals(phase)` for the separate rider rig.

- Ground-origin, local+Zforward. Spoked wheel centres[0,.34,-.58] and[0,.34,.63], radius.34. Actual outer tyre geometry touches ground. Wheel rotation follows travelled distance through the existing instanced wheel renderer.
- Saddle top exactly[0,.86,-.1], grip centres[+/-.23,1.08,.57]. Geometry raycasts pin both contracts.
- Crank axle[0,.36,.04], radius.15. Right pedal target[+.16,.36+.15*cos(phase),.04+.15*sin(phase)]; left[-.16,.36-.15*cos(phase),.04-.15*sin(phase)]. Phase0 puts the right pedal at top dead centre. These are platform CENTRES; top tread is approximately .0245m higher.
- Two actual crank instances rotate using the same phase and phase+PI. Pedal platforms stay level and translate to the shared helper targets.
- Green upright diamond frame, cream mudguards, chain guard, brown saddle/grips and rear luggage rack. No new lights, audio or rider model. The root owns cyclist rendering and route sampling.
- Four nominal draws: merged frame, instanced wheels, instanced cranks and instanced pedals. Added geometry is below2500 triangles across shared parts.

Final bicycle-inclusive checks: **11 tests passed** in CommunityTransit.test.ts; targeted ESLint and Prettier both passed. Existing seven bus/cart tests retained. No full build, browser, deployment or additional agents were launched. Rendered rider fit and route behavior remain root acceptance checks.
