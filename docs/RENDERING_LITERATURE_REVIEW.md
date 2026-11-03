# Rendering literature review: quality per millisecond

2026-11-02. Scope: the shaders, lighting, shadows and image-formation passes that
give the most visual quality per millisecond of GPU time in this stack, checked
against what MillOS already does, followed by what was implemented and measured.

Stack, fixed: three r182 (WebGL2), React Three Fiber 9.4, drei 10.7.7,
`postprocessing` 6.38.2 through `@react-three/postprocessing` 3.0.4, n8ao
1.10.1. Every API name below was checked against the installed `node_modules`
or upstream source. A claim that could not be checked that way is marked
[Unverified]. Published GPU costs were measured on other hardware (consoles,
desktop NVIDIA); they give an ordering, not a budget for Apple silicon or
phones.

## 1. What MillOS already does

The honest headline: most of the high-value techniques in the literature are
already in place, and several were done more carefully than the references.

| Technique (source) | MillOS implementation |
|---|---|
| Single tone curve, hue-stable (Khronos PBR Neutral) | Neutral on both paths, one exposure (`constants/colorGrade.ts`); the composer forces `NoToneMapping` on the renderer, so there is no double tone map |
| Mip-chain bloom (Jimenez 2014, SIGGRAPH "Next Generation Post Processing in Call of Duty: AW") | `<Bloom mipmapBlur>` (postprocessing `MipmapBlurPass`: 13-tap down, 9-tap tent up), SCREEN blend, threshold 1.0, High/Ultra |
| MSAA + morphological AA (Jimenez et al. 2012, SMAA) | Composer MSAA 4x plus SMAA HIGH with edge detection moved to encoded values (`utils/smaaPerceptualEdges.ts`); canvas MSAA on Low |
| Screen-space AO (Jimenez et al. 2016 GTAO lineage; N8AO) | N8AO, depth-only (no normal pass), half resolution on High, full on Ultra, quality capped below the 64-sample modes |
| Stable directional shadows (texel snapping, normal-offset bias) | `SunShadowRig.tsx`: one fitted cascade, light-space texel snap, quantised extent, normal bias derived from texel size, redraw one frame in three, skipped while the key is dark |
| Soft PCF without the r182 trap | `PCFShadowMap` by name (`App.tsx`). In r182 `PCFSoftShadowMap` silently falls back to unfiltered BASIC (three PR #32593); MillOS avoids it. r182's PCF is 5 Vogel-disk taps of hardware-filtered compare rotated by interleaved gradient noise (three PR #32303) |
| Image-based lighting that tracks the sun | 128x64 float equirect from the live sky colours, PMREM-convolved, regenerated on a throttle; metals adopt the env map so the diffuse fill can stay low (`SceneEnvironmentIBL.tsx`) |
| Key/fill ratio as one decision | Sun 3.1 against about 0.77 of total fill at clear noon (a shade over two stops); overcast moves key into fill rather than dimming it (`simulation/atmosphere.ts`) |
| Aerial perspective as the cheapest depth cue | `FogExp2` with a height term and horizon handling (`shaders/atmosphericFog.ts`) |
| Geometric specular AA (Kaplanyan et al. 2016) | Built into three: `geometryRoughness` from screen-space normal derivatives is added to roughness in `lights_physical_fragment` |
| Many night lights at near-zero shader cost | Emissive lenses, additive light-pool quads and a few real lights behind one dimmer (`exterior/ExteriorLighting.tsx`, `InteriorLightRig.tsx`) |
| Night readability | A dark-pixel toe lift that is exactly zero by day (`DISPLAY_TOE`) |

## 2. Ranked opportunities

Best gain per millisecond first. "Status" is this repo after this pass.

| # | Technique | Published cost (hardware) | Payoff | Status |
|---|---|---|---|---|
| 1 | Dither at the 8-bit output | a few ALU in an existing pass | Removes contour rings in sky and fog gradients | **Implemented** (section 3) |
| 2 | Correct HDR ordering of bright sources | 0 | The sun reads as the brightest thing in its glare; bloom gets a real source | **Implemented** (section 3) |
| 3 | Sun elevation / solar path | 0 | Form on vertical faces; long, readable shadows; golden-hour colour | **Implemented** (section 5) |
| 4 | Screen-space AO at half resolution | GTAO 0.5 ms on PS4 at 1080p with TAA reuse (Jimenez 2016); N8AO author: half-res roughly 2-4x faster than full [hardware not stated] | Contact grounding everywhere | High/Ultra already; Medium: section 4 |
| 5 | Mip-chain bloom | 0.35 ms, Xbox One, 1080p (Jimenez 2014) | Image reads as HDR; lamps glow at night | High/Ultra already; Medium: section 4 |
| 6 | Shadow-map resolution | depth-only pass; dominated by caster vertex count, not fill [Inference] | Sharper shadow edges | Medium is 1024; section 4 |
| 7 | 3D LUT grade (`LUT3DEffect`) | one texture lookup in a merged pass (tetrahedral: four) [no ms figure published] | One authored look | Not adopted: the grade is deliberately capped so the four semantic status colours stay distinguishable |
| 8 | AgX tone mapping | 0 | Saturated highlights roll to white without hue shift | Deferred by design: the sky and celestial materials are authored display-referred and AgX's log mapping muddies them (`colorGrade.ts`) |
| 9 | Physical sky (Hillaire 2020; Bruneton 2008) | 0.31 ms at 720p on GTX 1080; about 1 ms on iPhone 6s (Hillaire 2020) | Correct sky colour all day | Not adopted: `@takram/three-atmosphere` fits the stack but ships about 37 MB unpacked, works in Earth-centred coordinates and would be a new dependency |
| 10 | Screen-space god rays (Mitchell, GPU Gems 3 ch. 13) | 60 samples at half res by default [no ms figure] | Dramatic at golden hour | Not adopted: shafts from background objects draw over foreground ones, a poor trade for an operational view |

## 3. Implemented in this pass

### Output dithering (both paths)

**Defect.** The noon `sun` capture stepped one 8-bit level at a time with flat
runs up to 29 px wide around the solar glare: visible contour rings. Nothing in
the frame dithered. The composer works in HalfFloat, so the only quantisation is
the final write to the canvas.

**Fix.** `PostProcessing.tsx` sets `EffectPass.dithering` on the composer's
screen pass every frame (the R3F wrapper rebuilds passes when its children
change and exposes no prop). three adds its +-0.5 LSB offset after the
colour-space encode, i.e. in the domain where the rounding happens, inside a pass
that already runs. On Low (no composer) the sky dome dithers itself: the same
offset written into `OPTIMIZED_SKY_FRAGMENT_SHADER` under `DITHERING`, with
interleaved gradient noise for the grid value because the dome does not include
`<common>`. The material only defines it when no composer is active.

**Evidence** (same row, same `sun` camera, noon, Medium): mean flat run 10.7 px
to 2.5 px, longest 29 px to 13 px. The "before" is `layout-audit-after`
(31 Oct, an earlier build of a dirty tree, `--skip-build`): a valid record of
the defect at the same camera and hour, not a same-build control. The "after" is
`gorgeous-r1-medium`. Runs that remain are where the true value sits on a whole
level; +-0.5 LSB rectangular dither linearises the mean there but cannot vary
the rounding. Low (`gorgeous-r1-low`, the dome's own dither): mean run 2.3 px,
longest 11 px, no page or shader-compile diagnostics, disc centre (255, 255,
255) inside a (246, 248, 231) ring. The offset depends only on `gl_FragCoord`, so it
is identical every frame and paired controls still read 0.

### Solar disc brighter than its own glare

**Defect.** The disc was a normal-blended LDR colour (`#fff8d8`) drawn over a
sky glare, a halo sprite and an additive glow that already summed past white. It
replaced that sum with something dimmer: a dark yellow dot (252, 244, 209) inside
a white aureole (255, 255, 235).

**Fix.** Additive blending, a near-white noon colour at scene-referred radiance 4
(`SUN_CORE_RADIANCE`), easing to the orange golden-hour colour at 2.5. A
near-white core matters because Neutral scales a bright pixel's channels by one
shared factor: a saturated yellow core, however bright, still rolls its blue
channel below a warm-white glare.

**Evidence:** disc centre (255, 255, 250) inside a (255, 255, 236) ring
(`gorgeous-r1-medium/sun.png`). On High the disc now feeds bloom: a contained
aureole, 0.56% of the frame near-white against 0.02% on Medium
(`gorgeous-r1-high/sun.png`). The golden-hour disc (orange at radiance 2.5) is
[Unverified]: the benchmark pins the `sun` scene to hour 12
(`CELESTIAL_EVIDENCE_TIMES`), so the art harness cannot frame it.

### Stale bloom note corrected

`colorGrade.ts` said nothing in the scene authored emissive above 1.0, so bloom
had no visual return. The exterior lens emissive is driven to 3.46 at full dark
(emissive luminance about 2.4), so by the authored values street lamps clear the
bloom threshold on High and Ultra at night [Unverified in pixels: the High
night capture `gorgeous-r1-high-night` does not isolate a lamp head].

## 4. Medium tier: measured candidates

Medium is the shipping default and carries no AO, no bloom and a 1024 shadow
map. The three were measured on one page, vsync off (`--disable-gpu-vsync
--disable-frame-rate-limit`), toggled at runtime through
`__MILLOS_RUNTIME__.setDisplayDiagnostics`, arms rotated and reversed each
cycle, 2.5 s settle and 5 s sample per arm, 1280x720 at DSF 2 (render DPR 1.2),
M1 Max, noon clear. Probe: `scripts/measure-medium-candidates.mjs`.

**The machine was heavily contended: 5 to 24 runnable per core** (the repo
threshold is 3). The `water` scene timed out at startup under that load, and
overview cycles 0-1 were lost from the captured log (interior has all four).
Read every number below as a lower bound on noise, not as a budget.

| Arm (average frame, ms) | ov c2 | ov c3 | int c0 | int c1 | int c2 | int c3 |
|---|---|---|---|---|---|---|
| base (shipping Medium) | 19.56 | 19.89 | 21.86 | 24.62 | 25.16 | 24.88 |
| + N8AO `performance`, half res | 26.96 | 25.96 | 26.11 | 27.43 | 29.50 | 29.92 |
| + bloom | n/a | 21.38 | 19.15 | 24.50 | 23.68 | 25.32 |
| + 2048 shadow map | 18.53 | 20.67 | 18.84 | 19.40 | 23.81 | 22.27 |
| all three | 26.68 | 27.00 | 24.91 | 29.27 | 26.12 | 28.53 |

- **AO on Medium: rejected.** About +6.5 ms on overview and +2.8 to +5.0 ms
  on interior, in every cycle, larger than the arm-to-arm spread. The likely
  cause is N8AO's transparency handling: it renders the transparent set twice
  more, and the hall's glass facade is a large transparent set
  [Inference: not isolated]. AO stays a High/Ultra feature.
- **Bloom and 2048 shadows on Medium: re-measured on a quiet machine.** Same
  probe, `--arms=base,bloom,shadow2048`, four cycles, load 1.5-2.6 per core,
  all three scenes completed (`test-results/medium-candidates.json`):

  | Scene | base avg (vsync off) | + bloom | + 2048 shadow | base spread |
  |---|---|---|---|---|
  | overview | 15.24 ms | +0.20 | +0.22 | 1.04 |
  | interior | 16.80 ms | +1.50 | +0.46 | 6.32 |
  | water | 19.31 ms | +1.38 | -0.07 | 4.21 |

  The finding that decides both: **shipping Medium has no headroom.**
  Unthrottled, its average frame is already 15-19 ms on an M1 Max at this
  size, so it holds 60 FPS only because the cap hides the margin. Bloom costs
  1.4-1.5 ms where the scene is heaviest and stays off; the preset comment's
  acceptance test (p95 under budget with bloom) fails. The 2048 shadow map
  reads within the control spread on every scene (at most +0.5 ms), the
  cheapest sharpness on offer, but with no margin to spend and no pixel
  comparison taken it is left as a candidate, not shipped. Either flip needs a
  persistence v6 migration with the v4 stale-default guard and updates to the
  medium pins in `graphicsStore.test.ts`.

  Re-run with:

  ```bash
  npm run build && node scripts/measure-medium-candidates.mjs --scenes=overview,interior,water --cycles=4 --arms=base,bloom,shadow2048
  ```

## 5. Solar path: decided and implemented

**Was:** `sampleCelestial` tilted the orbit by only `cos(solarAngle) * 0.16`,
zero at noon, so at 12:00 the sun stood at exactly (0, 1, 0). The sun can only
reach the zenith between the tropics (23.4 N to 23.4 S); Europe spans roughly
36-71 N. A zenith key lights no vertical face (silos, walls, machine sides,
people) and shrinks every shadow to its footprint: the flatness in every noon
capture, at the hour the art and benchmark harnesses default to.

**Decision (Nell, 2026-11-02):** make it normal for southern England / Benelux.

**Now:** the day already runs 06:00 to 18:00, which is the equinox day, and the
equinox sun's path is a great circle tilted toward the equator by the latitude.
`SITE_LATITUDE_DEG = 51.5` (London 51.5, Brussels 50.8, Amsterdam 52.4) gives:

| Hour | Before | Now |
|---|---|---|
| 06:00 / 18:00 | 0 degrees (east / west) | 0 degrees, unchanged |
| 10:00 / 14:00 | 60 degrees | 32.6 degrees |
| 12:00 | 90 degrees (zenith) | 38.5 degrees, due site south (+Z) |

The orbit azimuth moved from 50 to 20 degrees so dawn still comes from site east
and the afternoon key still crosses the west and south glazing (the existing
16:00 test). `solarElevation` stays the sine of the hour angle, so everything
keyed on it (daylight, golden hour, lamp switching, twilight colours) keeps its
hour; only where the light comes from changes. GPU cost: none. The review hour
stays at noon, which is now a realistic, well-modelled light.

Verified after the change (fresh build, Medium): `gorgeous-r2-latitude-noon`
(ten scenes: silos and tanks now have a lit and a shaded side, long cast
shadows across the yard; the hall still reads roof-shadowed with sunlight bands
from the glazing and no wall leak), `gorgeous-r2-latitude-1000` (the 10:00
start), `gorgeous-r3-celestial` (the `sun` and `moon` evidence cameras aim along
the live `sampleCelestial` direction, so they follow the new orbit; both bodies
centred, disc (255, 255, 250) in a (255, 255, 234) ring, dither mean run
2.6 px) and `gorgeous-r3-night` (22:00 packing, interior, shipping: no low-moon
window shafts). No page or shader diagnostics on any of them.

**Low-sun shadows (fixed).** The lower path exposed a limit in `SunShadowRig`:
its near plane sat exactly on the fitted box's up-sun face, and the box was only
proven safe for a full-height caster down to a 30-degree sun, which is now the
case before about 09:34 and after 14:26 (it was before 08:00 and after 16:00).
Below that, tall up-sun casters were clipped and their shadows vanished inside
the frame. A directional shadow and its caster share light-space XY, so the
caster was never outside the map's window, only past its near plane. The fix
extends the up-sun DEPTH by the tallest structure's reach,
`elevator.height / sin(elevation)` capped at 300 m (`upSunCasterReach`), which
costs no shadow-map texels (32-bit float depth, so no precision cost either),
and rescales `shadow.bias` so its world size is unchanged
(`rangeCompensatedBias`; bias is normalised depth). `SunShadowRig.test.ts`
shows the old near plane clipped the elevator at 15 degrees and the new one
holds a 55 m caster at every elevation from 11 to 90 degrees and every azimuth.
Below 10.6 degrees the cap applies: the dim dawn and dusk sliver, where only
off-site scenery would reach farther.

## 6. Traps (attractive, but wrong here)

1. **`PCFSoftShadowMap` on r182**, and therefore R3F's bare `<Canvas shadows>`
   or `shadows="soft"`: hard, unfiltered shadows with no warning. Fixed upstream
   in r183. MillOS already asks for `PCFShadowMap`.
2. **three's `CSM` addon.** It installs its own `material.onBeforeCompile`,
   which would overwrite the world-surface injection and make
   `StaticMeshBatch.isSupportedMaterial` reject those meshes. A second cascade
   would also double the caster submission the 1-in-3 redraw exists to save.
3. **drei `<SoftShadows>` (PCSS).** Fails to compile on r182 with drei 10.7.7
   (drei issue #2583); the 10.7.9 fix switches the whole renderer to
   `BasicShadowMap`, dropping hardware PCF everywhere.
4. **drei `<ContactShadows>`.** Re-renders the scene with an override material
   every frame by default (`frames=Infinity`) plus blur passes: a second full
   render on a 120 m site.
5. **postprocessing `SSAOEffect` and three's `GTAOPass`.** Both need a normal
   pass, i.e. another scene render; `GTAOPass` also extends three's own `Pass`
   and does not fit the pmndrs composer.
6. **Auto-exposure.** In postprocessing 6.38 adaptive luminance only drives
   `REINHARD2_ADAPTIVE`, not Neutral or AgX.
7. **Reprojecting TAA on WebGL.** None exists in this stack (`TAARenderPass`
   only accumulates while the camera is still; `TRAANode` is WebGPU only). That
   rules out the cheap temporal versions of GTAO, SSR and soft shadows.
8. **Raymarched volumetrics and chromatic aberration.** Hillaire reports 1.0 ms
   on a GTX 1080 for atmosphere volumetric shadows alone; chromatic aberration
   reads as a lens defect on a digital twin (and is "User requested NO").
9. **New real point lights at night.** Each one runs the full lighting function
   on every lit fragment, and changing the count recompiles every lit material.
   r182 also reads the multiscatter DFG table twice per light (moved out of the
   loop in r186, three PR #34046).
10. **Bend Studio screen-space shadows.** 0.19 ms on PS5 at 1440p, but it is a
    compute shader using workgroup shared memory; WebGL2 has no compute.

## 7. Later, on three upgrades

- r184: `LightProbeGridWebGL` (L2 spherical-harmonic irradiance volume). A
  baked grid assumes static light, which the day cycle breaks; incremental
  baking arrives in r186.
- r186: `SunLight` (four 1024 cascades in one atlas, with blending and fade),
  direct-light multiscatter energy compensation fixed (three PR #33983), and the
  per-light DFG work moved out of the loop.
- WebGPU/TSL: real reprojecting TAA (`TRAANode`), `GTAONode`, `SSRNode`,
  clustered lighting and compute. This is the path to temporal AA, proper
  auto-exposure and many cheap lights; it is a renderer migration, not a pass.

## Sources

- Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare",
  SIGGRAPH 2014: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare
- Jimenez et al., "SMAA: Enhanced Subpixel Morphological Antialiasing", 2012:
  https://www.iryoku.com/smaa/downloads/SMAA-Enhanced-Subpixel-Morphological-Antialiasing.pdf
- Jimenez et al., "Practical Realtime Strategies for Accurate Indirect
  Occlusion" (GTAO), 2016:
  https://iryoku.com/downloads/Practical-Realtime-Strategies-for-Accurate-Indirect-Occlusion.pdf
- McGuire et al., "Scalable Ambient Obscurance", 2012:
  https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf
- Kaplanyan et al., "Filtering Distributions of Normals for Shading
  Antialiasing", 2016:
  https://research.nvidia.com/sites/default/files/pubs/2016-06_Filtering-Distributions-of/NDFFiltering.pdf
- Tokuyoshi and Kaplanyan, JCGT 10(2), 2021: https://jcgt.org/published/0010/02/02/paper.pdf
- Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique", EGSR 2020: https://sebh.github.io/publications/egsr2020.pdf
- Bruneton, precomputed atmospheric scattering: https://ebruneton.github.io/precomputed_atmospheric_scattering/
- Lagarde and de Rousiers, "Moving Frostbite to PBR", 2014 (three's specular
  occlusion): https://seblagarde.files.wordpress.com/2015/07/course_notes_moving_frostbite_to_pbr_v32.pdf
- Mitchell, "Volumetric Light Scattering as a Post-Process", GPU Gems 3 ch. 13:
  https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
- Khronos PBR Neutral: https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral
- Blender 4.0 AgX notes: https://developer.blender.org/docs/release_notes/4.0/color_management/
- Filament (EV100 exposure, AgX port): https://google.github.io/filament/Filament.md.html ;
  https://github.com/google/filament/pull/7236
- Bend Studio screen-space shadows: https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/
- Robert Yang, "How to Light a Level", GDC 2018:
  https://www.blog.radiator.debacle.us/2018/03/gdc-2018-how-to-light-level-slides-and.html
- Sea of Thieves technical art, SIGGRAPH 2018:
  https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf
- three.js PRs: #32303, #32593, #33983, #34046 (https://github.com/mrdoob/three.js/pull/<n>)
- drei issue #2583 and PR #2846; n8ao README: https://github.com/N8python/n8ao
- `@takram/three-atmosphere`: https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere
