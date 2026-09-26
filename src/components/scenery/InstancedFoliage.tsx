import { GeneratedBoundary } from '../models/GeneratedModel';
import { GeneratedGeometrySurface } from '../models/GeneratedGeometrySurface';
/**
 * InstancedFoliage - alpha-cut card vegetation for the village, the farm and
 * the exterior parkland.
 *
 * Replaces solid-polyhedron canopies (three spheres of flat `#3b7638`) with a
 * cage of alpha-tested leaf cards. From any viewing angle four to six cards
 * are visible, so the canopy has a ragged silhouette and real inter-card
 * parallax while costing FEWER triangles than the spheres it replaces, and
 * one draw call for every tree of a species instead of one per blob.
 *
 * KEY DECISIONS
 *
 * - `alphaTest`, never blending. Alpha-tested materials write depth and sort
 *   as opaque, so there is no transparency-ordering flicker (the failure mode
 *   CLAUDE.md warns about) and no per-frame sort.
 * - Cards are emitted with BOTH windings and the material stays `FrontSide`.
 *   The obvious alternative, `DoubleSide`, makes three negate the normal on
 *   back faces (`normal *= faceDirection`), which would invert the outward-bent
 *   canopy normals and light the far side of every tree from inside. Two
 *   windings cost nothing: exactly one of each pair survives back-face culling
 *   from any given view, so nothing is rasterised twice and nothing z-fights.
 * - Canopy vertex normals are blended toward the canopy centre-to-vertex
 *   direction. Flat card normals make a canopy read as a stack of plates; a
 *   spherical bend makes it read as a volume. This is free.
 * - Per-instance colour from the shared `treeJitterFromPosition` hash, so a
 *   given tree looks identical whether the village, the farm or the exterior
 *   draws it, and "every tree is the same green" is fixed for one float3.
 * - `alphaToCoverage` is deliberately OFF: `COMPOSER_MULTISAMPLING === 0`
 *   (src/constants/colorGrade.ts) and the composer owns the render target from
 *   the medium tier up, so there is no MSAA for coverage to modulate. Turning
 *   it on would imply an anti-aliased cut edge that does not exist. SMAA
 *   handles the silhouette instead.
 */

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TREE_MATERIALS } from '../../utils/sharedMaterials';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';
import {
  generateLeafAtlas,
  generateLeafNormal,
  generateLeafRoughness,
  generateGrassBladeAtlas,
  generateMulchDecal,
  type FoliageKind,
} from '../../textures/foliage';
import { applyWindShader } from './WindDriver';
import { composeWorldSurface } from '../../utils/worldSurface';

export type TreeSpecies = 'oak' | 'pine' | 'birch';

// ============================================================
// MODULE-LEVEL SCRATCH (never allocate inside useFrame)
// ============================================================

const _obj = new THREE.Object3D();
const _color = new THREE.Color();
const _worldPos = new THREE.Vector3();

// ============================================================
// CARD CAGE GEOMETRY
// ============================================================

interface CardBuilder {
  position: number[];
  normal: number[];
  uv: number[];
}

/**
 * Push one quad as two triangles in BOTH windings, sharing vertex normals.
 * `sphericalOrigin` is the point normals are bent away from; pass null to keep
 * the card's own plane normal (used for ground clutter, which should light
 * like the ground it sits on).
 */
const pushCard = (
  b: CardBuilder,
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
  uvRect: [number, number, number, number],
  sphericalOrigin: THREE.Vector3 | null,
  sphericalBlend: number,
  flatNormal: THREE.Vector3
): void => {
  const [u0, v0, u1, v1] = uvRect;
  const uvs: [number, number][] = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ];

  const normalFor = (p: THREE.Vector3): [number, number, number] => {
    if (!sphericalOrigin) return [flatNormal.x, flatNormal.y, flatNormal.z];
    const n = p.clone().sub(sphericalOrigin);
    if (n.lengthSq() < 1e-6) n.copy(flatNormal);
    n.normalize().multiplyScalar(sphericalBlend);
    n.addScaledVector(flatNormal, 1 - sphericalBlend);
    if (n.lengthSq() < 1e-6) n.copy(flatNormal);
    n.normalize();
    return [n.x, n.y, n.z];
  };

  const tri = (a: number, c: number, d: number) => {
    for (const idx of [a, c, d]) {
      const p = corners[idx];
      b.position.push(p.x, p.y, p.z);
      const n = normalFor(p);
      b.normal.push(n[0], n[1], n[2]);
      b.uv.push(uvs[idx][0], uvs[idx][1]);
    }
  };

  // Front winding, then the mirrored winding so FrontSide culling always
  // leaves exactly one of the pair visible.
  tri(0, 1, 2);
  tri(0, 2, 3);
  tri(0, 2, 1);
  tri(0, 3, 2);
};

/** Atlas cell rect for cell 0..3 of a 2x2 atlas, optionally mirrored in u. */
const cellUv = (cell: number, mirror: boolean): [number, number, number, number] => {
  const cx = (cell % 2) * 0.5;
  const cy = (cell >> 1) * 0.5;
  return mirror ? [cx + 0.5, cy, cx, cy + 0.5] : [cx, cy, cx + 0.5, cy + 0.5];
};

interface CanopyOptions {
  /** Horizontal half-extent of the canopy. */
  radius: number;
  /** Vertical half-extent. */
  height: number;
  /** Canopy centre height in tree-local space. */
  centerY: number;
  /**
   * Crown form. Below 0.5 selects the broadleaf DOME layout and narrows its
   * upper edges slightly; 0.5 and above selects the tiered conifer SPIRE.
   */
  taper: number;
}

/**
 * One card of a crown layout, in units of the canopy's own radius and height.
 *
 * A card's VISIBLE shape is not its quad: `generateLeafAtlas` puts every
 * leaflet centre within 0.44 of the cell centre, so the corners of a cell are
 * always transparent and what actually gets drawn is the ellipse inscribed in
 * the quad. Every number below was designed against that inscribed ellipse
 * (scripts/blender/specs/trees-canopy.json carries the resulting silhouettes),
 * which is why the quad edges look generous next to the crown they produce.
 */
interface CrownCard {
  yaw: number;
  /** Tilt about the card's OWN mid-height, so it never moves the band. */
  tilt: number;
  /**
   * Lateral offset along the card's local x, in radii. This is what makes a
   * broadleaf crown lumpy: without it every card is centred on the trunk axis
   * and the canopy is perfectly radially symmetric from every direction.
   */
  offR: number;
  yBot: number;
  yTop: number;
  rBot: number;
  rTop: number;
  cell: number;
  mirror: boolean;
}

/** Horizontal card. `halfR` is a half-side, so the quad's CORNERS sit at
 *  halfR * sqrt(2) - see the envelope note on DOME_CROWN. */
interface CrownCap {
  yaw: number;
  y: number;
  halfR: number;
  cell: number;
  mirror: boolean;
}

interface CrownLayout {
  cards: readonly CrownCard[];
  caps: readonly CrownCap[];
}

/**
 * The x/z half-extent the OLD cage measured: its bottom cap was a square of
 * half-side 0.9 radii yawed 1.15 rad, whose corners reached
 * 0.9 * (cos 1.15 + sin 1.15) = 1.1891 radii. Both layouts below hand that
 * number to a card at yaw 0 and one at yaw PI/2, so the footprint of every
 * canopy in the scene is preserved to the last bit rather than to a rounded
 * literal. (Those corners are transparent - the leaf atlas cuts a disc out of
 * each cell - so nothing about the visible crown followed from it, which is
 * exactly why it has to be carried deliberately instead of by accident.)
 */
const CROWN_RIM = 0.9 * (Math.cos(1.15) + Math.sin(1.15));

/**
 * Broadleaf crown: three overlapping full-height masses plus three off-axis
 * lobes, closed top and bottom.
 *
 * The layout this replaces was four rectangular cards on the axis at 45 degree
 * steps plus two tilted ones - a perfectly radially symmetric ball, the same
 * width at every azimuth, which is the one thing a hardwood crown never is.
 * The three masses here are staggered in height and width so the outline is
 * weighted below the midline; the three lobes are pushed 0.50-0.58 radii off
 * the axis so the crown reads as a main mass with sub-crowns hung off it, and
 * the yaw jitter every instance already carries points them somewhere
 * different on each tree. Previewed at 0, 35 and 63 degrees of azimuth before
 * the numbers were fixed.
 *
 * ENVELOPE. The two cards at yaw 0 and PI/2 carry rBot = CROWN_RIM, so the
 * cage's x and z half-extents are bit-identical to the old cage's. y measures
 * exactly -1.03 to +1.00 for every radius:height ratio, which is what the old
 * AXIS cards spanned; the old cage reached -1.26 to +1.08 only because tilt is
 * applied about world X AFTER yaw, so its two tilted cards swung their
 * (transparent) corners out - and by an amount that varied with R:H. The three
 * masses here are therefore untilted and the lobes are tilted only as far as
 * keeps their swing inside the axis cards (worst case -0.935). See the call
 * sites: nothing is positioned against a canopy, and shortening the (empty)
 * bottom CLOSES the gap between crown and trunk top rather than opening one.
 */
// prettier-ignore
const DOME_CROWN: CrownLayout = {
  cards: [
    { yaw: 0, tilt: 0, offR: 0, yBot: -1.03, yTop: 0.8, rBot: CROWN_RIM, rTop: 0.72, cell: 0, mirror: false },
    { yaw: Math.PI / 2, tilt: 0, offR: 0, yBot: -0.9, yTop: 1.0, rBot: CROWN_RIM, rTop: 0.7, cell: 2, mirror: false },
    { yaw: Math.PI / 4, tilt: 0, offR: 0, yBot: -0.99, yTop: 0.86, rBot: 1.14, rTop: 0.88, cell: 1, mirror: true },
    { yaw: 2.3562, tilt: 0.06, offR: 0.58, yBot: -0.44, yTop: 0.54, rBot: 0.54, rTop: 0.46, cell: 3, mirror: true },
    { yaw: 0.9, tilt: 0, offR: 0.5, yBot: 0.08, yTop: 0.92, rBot: 0.44, rTop: 0.32, cell: 1, mirror: false },
    { yaw: 1.9, tilt: -0.12, offR: 0.52, yBot: -0.8, yTop: 0.02, rBot: 0.5, rTop: 0.48, cell: 3, mirror: false },
  ],
  caps: [
    // Sized to sit INSIDE the mass at their own height - the old top cap stood
    // 0.06 radii proud of the crown and read as a plate.
    { yaw: 0.35, y: 0.42, halfR: 0.62, cell: 2, mirror: true },
    { yaw: 1.15, y: -0.34, halfR: 0.8, cell: 0, mirror: false },
  ],
};

/**
 * Conifer crown: three branch whorls and a leader.
 *
 * The old cage drove the same rectangular cards through a `taper` that pulled
 * their top edge in to 15% - a cone in card form, which the inscribed leaf
 * blob then rounds into a smooth teardrop. A spruce is not a cone: it is a
 * stack of whorls, each flaring out past the one above it, with a notch
 * between. The bands below step the silhouette 0.87 -> 0.42 -> 0.63 -> 0.33 ->
 * 0.48 -> 0.25 -> 0.31 -> 0 in radii, bottom to top; the notches run 0.23 to
 * 0.45 radii deep, which is what it takes to still read at 17 m once the leaf
 * cut-out has softened them. Tiers 1 and 3 share yaw 0 / PI/2 on purpose:
 * staggering every tier hides the stack from any single viewpoint.
 *
 * Same envelope contract as DOME_CROWN, and its single cap sits at y = -0.80,
 * where the skirt measures 0.87 radii, so it never shows as a rim the way the
 * old cage's two caps did.
 */
// prettier-ignore
const SPIRE_CROWN: CrownLayout = {
  cards: [
    { yaw: 0, tilt: 0, offR: 0, yBot: -1.03, yTop: -0.28, rBot: CROWN_RIM, rTop: 0.58, cell: 0, mirror: false },
    { yaw: Math.PI / 2, tilt: 0, offR: 0, yBot: -1.0, yTop: -0.24, rBot: CROWN_RIM, rTop: 0.55, cell: 2, mirror: false },
    { yaw: Math.PI / 4, tilt: 0.1, offR: 0, yBot: -0.4, yTop: 0.24, rBot: 0.86, rTop: 0.42, cell: 1, mirror: true },
    { yaw: (Math.PI * 3) / 4, tilt: -0.1, offR: 0, yBot: -0.36, yTop: 0.2, rBot: 0.82, rTop: 0.4, cell: 3, mirror: true },
    { yaw: 0, tilt: 0, offR: 0, yBot: 0.12, yTop: 0.68, rBot: 0.68, rTop: 0.26, cell: 1, mirror: false },
    { yaw: Math.PI / 2, tilt: 0, offR: 0, yBot: 0.08, yTop: 0.62, rBot: 0.64, rTop: 0.24, cell: 3, mirror: false },
    { yaw: Math.PI / 4, tilt: 0, offR: 0, yBot: 0.52, yTop: 1.0, rBot: 0.46, rTop: 0.05, cell: 2, mirror: true },
  ],
  caps: [{ yaw: 1.15, y: -0.8, halfR: 0.6, cell: 0, mirror: false }],
};

/**
 * Eight-card cage for one crown: six or seven designed bands plus one or two
 * horizontal caps that stop the canopy looking hollow from above.
 *
 * EIGHT CARDS IS THE BUDGET, not a starting point. Every card is 12
 * non-indexed vertices (two triangles in both windings), so the geometry is
 * 96 vertices / 32 triangles whichever layout is chosen - the same cost as the
 * ball it replaces, and against ~288 for the three spheres before that. The
 * redesign buys its silhouette by moving cards, not by adding them.
 */
export const createCanopyCage = ({
  radius,
  height,
  centerY,
  taper,
}: CanopyOptions): THREE.BufferGeometry => {
  const b: CardBuilder = { position: [], normal: [], uv: [] };
  const origin = new THREE.Vector3(0, centerY, 0);
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const layout = taper >= 0.5 ? SPIRE_CROWN : DOME_CROWN;
  // `taper` narrows only the TOP edge of a band. The widest edge of every card
  // is a BOTTOM edge, so no value of taper can move the unit envelope - which
  // is what lets birch (0.15) and the exterior variants (0.12) share one
  // footprint with the untapered oak.
  const crown = 1 - taper * 0.35;

  const place = (
    local: THREE.Vector3[],
    tilt: number,
    yaw: number,
    y: number,
    flatDir: number[]
  ) => {
    euler.set(tilt, yaw, 0);
    quat.setFromEuler(euler);
    const corners = local.map((v) =>
      v.applyQuaternion(quat).add(new THREE.Vector3(0, centerY + y * height, 0))
    ) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const flat = new THREE.Vector3(flatDir[0], flatDir[1], flatDir[2]).applyQuaternion(quat);
    return { corners, flat };
  };

  for (const c of layout.cards) {
    const yHalf = (c.yTop - c.yBot) * 0.5 * height;
    const d = c.offR * radius;
    const rb = c.rBot * radius;
    const rt = c.rTop * crown * radius;
    const { corners, flat } = place(
      [
        new THREE.Vector3(d - rb, -yHalf, 0),
        new THREE.Vector3(d + rb, -yHalf, 0),
        new THREE.Vector3(d + rt, yHalf, 0),
        new THREE.Vector3(d - rt, yHalf, 0),
      ],
      c.tilt,
      c.yaw,
      (c.yBot + c.yTop) * 0.5,
      [0, 0, 1]
    );
    pushCard(b, corners, cellUv(c.cell, c.mirror), origin, 0.8, flat);
  }

  for (const c of layout.caps) {
    const r = c.halfR * radius;
    const { corners, flat } = place(
      [
        new THREE.Vector3(-r, 0, -r),
        new THREE.Vector3(r, 0, -r),
        new THREE.Vector3(r, 0, r),
        new THREE.Vector3(-r, 0, r),
      ],
      0,
      c.yaw,
      c.y,
      [0, 1, 0]
    );
    pushCard(b, corners, cellUv(c.cell, c.mirror), origin, 0.8, flat);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  geo.computeBoundingSphere();
  return geo;
};

/** Three crossed vertical quads rooted at y=0, for ground tufts. */
const createClutterTuft = (width: number, tall: number): THREE.BufferGeometry => {
  const b: CardBuilder = { position: [], normal: [], uv: [] };
  // Grass lights like the ground it grows from: normals straight up rather
  // than out of the card plane.
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  for (let i = 0; i < 3; i++) {
    const yaw = (i / 3) * Math.PI;
    const hw = width * 0.5 * (0.85 + i * 0.12);
    const h = tall * (0.82 + i * 0.14);
    euler.set(0, yaw, 0);
    quat.setFromEuler(euler);
    const corners = [
      new THREE.Vector3(-hw, 0, 0),
      new THREE.Vector3(hw, 0, 0),
      new THREE.Vector3(hw, h, 0),
      new THREE.Vector3(-hw, h, 0),
    ].map((v) => v.applyQuaternion(quat)) as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
    ];
    // The atlas roots its blades on the cell's v=0 edge, which is exactly
    // where y=0 of this card sits, so the standard rect maps straight across.
    pushCard(b, corners, cellUv(i % 4, i % 2 === 1), null, 0, up);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  geo.computeBoundingSphere();
  return geo;
};

// ============================================================
// MATERIALS
// ============================================================

/** Base level stays binary at this threshold; the atlas writes a
 *  sub-threshold halo so mip reduction does not erode the canopy. */
const FOLIAGE_ALPHA_TEST = 0.4;
// A 384 px broadleaf atlas keeps 192 px per authored cell, well above the
// feature and mip floor, while avoiding 44% of the synchronous texel work and
// memory of the former 512 px map during first-world hydration.
const BROADLEAF_ATLAS_SIZE = 384;

const leafRoughness = generateLeafRoughness(256);

/**
 * Build a foliage material.
 *
 * `tint` only drives the `diffuse` UNIFORM, never a define, and every variant
 * shares one `customProgramCacheKey`, so any number of tinted variants still
 * compile to a single shader program.
 */
export const createFoliageMaterial = (
  kind: FoliageKind,
  tint: string = '#ffffff'
): THREE.MeshStandardMaterial => {
  const atlasSize = kind === 'needle' ? 256 : BROADLEAF_ATLAS_SIZE;
  const material = new THREE.MeshStandardMaterial({
    color: tint,
    map: generateLeafAtlas(atlasSize, kind),
    normalMap: generateLeafNormal(atlasSize, kind),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: leafRoughness,
    roughness: 1.0,
    metalness: 0,
    alphaTest: FOLIAGE_ALPHA_TEST,
    side: THREE.FrontSide,
    // Both windings are already in the geometry, so FrontSide culling leaves
    // complete coverage in the shadow pass at HALF the fragment cost of
    // DoubleSide. (three's default for a FrontSide material is BackSide
    // shadows, an acne workaround for solids that thin cards do not need.)
    shadowSide: THREE.FrontSide,
    // NOTE: `vertexColors` stays FALSE on purpose. Per-instance colour rides
    // `instanceColor`, and WebGLProgram.js:735 already defines USE_COLOR in the
    // fragment prefix when `instancingColor` is set. Turning `vertexColors` on
    // would additionally define USE_COLOR in the VERTEX prefix (line 566),
    // whose `vColor *= color;` reads a `color` attribute this geometry does not
    // have - an absent attribute reads (0,0,0,1) and every leaf goes black.
  });
  applyWindShader(material, {
    heightRef: 6.0,
    strengthScale: 1.0,
    cacheKey: `millos_foliage_${kind}_v1`,
  });
  // COMPOSED, not applied. `applyWorldSurface` declines any material that
  // already owns an `onBeforeCompile`, which is every swaying material in this
  // repo - so `WORLD_SURFACE_PROFILES.vegetation` was authored and reached
  // nothing until this call. `composeWorldSurface` calls the wind injection
  // first and adds the surface terms after it, under a NEW cache key: three
  // keys its program cache on that literal, so reusing the wind key would have
  // served the program compiled without these terms.
  //
  // `worldRest` is the load-bearing option. The canopy is one shared card cage
  // drawn as an `InstancedMesh`, so the tonal drift has to come from a WORLD
  // field - that is exactly what stops a stand of trees reading as one tree
  // stamped forty times, and it is why `vegetation` ships `objectSpace: 0`.
  // But the wind has already moved `transformed` by the time this anchor runs,
  // and the tip travel (0.16 m of sway against a 0.3 m meso period) is most of
  // a noise cell: sampled at the swayed vertex the break-up would crawl over
  // the leaves every gust. Sampling at the REST vertex keeps the field
  // per-instance distinct AND welded to the plant.
  composeWorldSurface(material, 'vegetation', {
    cacheKey: `millos_foliage_${kind}_v1`,
    worldRest: true,
  });
  return material;
};

const createFoliageDepthMaterial = (
  kind: FoliageKind,
  source: THREE.MeshStandardMaterial
): THREE.MeshDepthMaterial => {
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: source.map,
    alphaTest: FOLIAGE_ALPHA_TEST,
    side: THREE.FrontSide,
  });
  // The depth material must sway in lockstep or the shadow stays rigid while
  // the leaves move, which reads as a lighting bug rather than as wind.
  applyWindShader(depth, {
    heightRef: 6.0,
    strengthScale: 1.0,
    cacheKey: `millos_foliage_${kind}_v1_depth`,
  });
  return depth;
};

export const BROADLEAF_MATERIAL = createFoliageMaterial('broadleaf');
export const NEEDLE_MATERIAL = createFoliageMaterial('needle');
/** Shared wind-synced depth materials. three copies `map`/`alphaTest`/`side`
 *  onto whatever depth material it uses (WebGLShadowMap.getDepthMaterial), so
 *  the only thing these have to add is the matching vertex sway - without it
 *  the leaves move and their shadow does not. */
export const BROADLEAF_DEPTH = createFoliageDepthMaterial('broadleaf', BROADLEAF_MATERIAL);
export const NEEDLE_DEPTH = createFoliageDepthMaterial('needle', NEEDLE_MATERIAL);

const CLUTTER_ALPHA_TEST = 0.45;

const CLUTTER_MATERIAL = new THREE.MeshStandardMaterial({
  map: generateGrassBladeAtlas(256),
  roughness: 0.92,
  metalness: 0,
  alphaTest: CLUTTER_ALPHA_TEST,
  side: THREE.FrontSide,
  // See the note on the foliage material: instanceColor alone, never
  // `vertexColors`, or the missing `color` attribute blackens every tuft.
});
applyWindShader(CLUTTER_MATERIAL, {
  heightRef: 0.5,
  strengthScale: 0.9,
  cacheKey: 'millos_clutter_v1',
});
// See `createFoliageMaterial` for why this is composed rather than applied, and
// why the field is sampled at the rest vertex. The tufts are 0.42 m across and
// the macro period is 6 m, so the drift plays out across a whole verge rather
// than within one tuft - which is the term that keeps a Halton-scattered field
// of one geometry from reading as a stamped pattern.
composeWorldSurface(CLUTTER_MATERIAL, 'vegetation', {
  cacheKey: 'millos_clutter_v1',
  worldRest: true,
});

// Lit, not basic: an unlit decal would still read as daylight dirt at night
// and would ignore the canopy shadow falling across it.
const MULCH_MATERIAL = new THREE.MeshStandardMaterial({
  map: generateMulchDecal(128),
  roughness: 1,
  metalness: 0,
  transparent: true,
  opacity: 0.85,
  // Floor-level transparent overlay: never writes depth, always offset toward
  // the camera, per the CLAUDE.md z-fighting decision tree.
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
  polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
});

// ============================================================
// SPECIES
// ============================================================

interface SpeciesDef {
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  trunkMaterial: THREE.MeshStandardMaterial;
  kind: FoliageKind;
}

/**
 * A trunk from a designed (radius, y) profile, base sitting on y = 0.
 *
 * These were `CylinderGeometry(topRadius, bottomRadius, height, 12)` - a
 * straight cone, which is a table leg, not a trunk. What makes a trunk read as
 * grown rather than driven into the ground is the ROOT FLARE: a short concave
 * swell at the foot, a knee where it meets the bole, and then a bole that
 * tapers on a slight inward curve rather than a straight line. All three are
 * in the profiles below, and all three carry at the 8-10 m the camera actually
 * walks past a village or farm tree at.
 *
 * Twelve sides is kept exactly as it was and is NOT the redesign here: the
 * chord argument for 12 (0.207 m at the oak's 0.64 m base, against 0.400 m at
 * 6) is unchanged, and the flare is a profile change, not a facet change.
 *
 * ENVELOPE. Every profile below opens at (bottomRadius, -height/2) and closes
 * at (topRadius, +height/2), and only ever dips INSIDE the straight line
 * between them, so max radius and the y range are bit-identical to the
 * cylinder each replaces (verified 0.00 mm by
 * scripts/blender/machine_part_preview.py --spec specs/trees-canopy.json).
 *
 * COST. One shared module-level geometry per species drawn through an
 * InstancedMesh, so the extra vertices are a one-off scene cost at any tree
 * count: oak 76 -> 156, birch 76 -> 143, pine 76 -> 195 - +333 vertices for
 * every tree on the site.
 */
const createTrunkGeometry = (
  profile: readonly (readonly [number, number])[],
  segments = 12
): THREE.BufferGeometry => {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
  // LatheGeometry lays v out by PROFILE INDEX (`uv.y = j / (points.length-1)`),
  // so the samples clustered in the root flare would squeeze the bark map's
  // bottom fifth over the flare and stretch the rest up the bole.
  // CylinderGeometry - what these replace - lays v out linearly in height, and
  // the bark maps are ClampToEdge at repeat 1, so re-deriving v from y is what
  // keeps bark density exactly where it was.
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const yMin = profile[0][1];
  const span = profile[profile.length - 1][1] - yMin || 1;
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, (pos.getY(i) - yMin) / span);
  uv.needsUpdate = true;
  geo.translate(0, span * 0.5, 0);
  return geo;
};

/** Oak: heavy buttress flare over the bottom 0.36 m, then a columnar bole on a
 *  concave taper. Envelope: r 0.32 -> 0.18, y +-1.3 (2.6 m). */
const OAK_TRUNK_PROFILE: readonly (readonly [number, number])[] = [
  [0.0, -1.3],
  [0.32, -1.3], // flare foot - envelope max radius
  [0.29, -1.245],
  [0.256, -1.16],
  [0.232, -1.055],
  [0.223, -0.94], // knee
  [0.211, -0.74],
  [0.203, -0.3],
  [0.196, 0.22],
  [0.189, 0.76],
  [0.18, 1.3], // envelope top radius / max y
  [0.0, 1.3],
];

/** Birch: a tight basal swell over a long clean bole, deliberately NOT the
 *  oak's buttress - the species read is the point. Envelope: 0.16 -> 0.10,
 *  y +-1.55 (3.1 m). */
const BIRCH_TRUNK_PROFILE: readonly (readonly [number, number])[] = [
  [0.0, -1.55],
  [0.16, -1.55],
  [0.142, -1.5],
  [0.126, -1.428],
  [0.12, -1.33], // swell shoulder, only 0.22 m up
  [0.117, -1.0],
  [0.114, -0.4],
  [0.11, 0.3],
  [0.105, 0.95],
  [0.1, 1.55],
  [0.0, 1.55],
];

/** Conifer: modest flare, a strong straight taper, and two branch-whorl
 *  collars - a slow swell into the whorl and a step in above it, which is how
 *  a whorl scar actually sits. Envelope: 0.24 -> 0.12, y +-1.5 (3 m). */
const PINE_TRUNK_PROFILE: readonly (readonly [number, number])[] = [
  [0.0, -1.5],
  [0.24, -1.5],
  [0.211, -1.432],
  [0.187, -1.33],
  [0.174, -1.19], // knee
  [0.163, -0.85],
  [0.157, -0.58],
  [0.164, -0.47], // whorl collar 1
  [0.148, -0.43],
  [0.141, 0.0],
  [0.136, 0.34],
  [0.142, 0.43], // whorl collar 2
  [0.128, 0.47],
  [0.12, 1.5],
  [0.0, 1.5],
];

const SPECIES: Record<TreeSpecies, SpeciesDef> = {
  oak: {
    trunk: createTrunkGeometry(OAK_TRUNK_PROFILE),
    canopy: createCanopyCage({ radius: 1.85, height: 1.55, centerY: 3.3, taper: 0 }),
    trunkMaterial: TREE_MATERIALS.trunk,
    kind: 'broadleaf',
  },
  birch: {
    trunk: createTrunkGeometry(BIRCH_TRUNK_PROFILE),
    canopy: createCanopyCage({ radius: 1.25, height: 1.5, centerY: 3.6, taper: 0.15 }),
    trunkMaterial: TREE_MATERIALS.birchTrunk,
    kind: 'broadleaf',
  },
  pine: {
    trunk: createTrunkGeometry(PINE_TRUNK_PROFILE),
    canopy: createCanopyCage({ radius: 1.45, height: 1.9, centerY: 3.1, taper: 1 }),
    // Pine reuses the oak bark map; there is no dedicated pine trunk material
    // in sharedMaterials and adding one is not this domain's file.
    trunkMaterial: TREE_MATERIALS.trunk,
    kind: 'needle',
  },
};

// ============================================================
// PER-INSTANCE JITTER
// ============================================================

/**
 * Deterministic per-tree jitter from world position. Intentionally the same
 * hash as `exterior/ExteriorVegetation.treeJitterFromPosition`, so a tree at a
 * given spot looks the same whichever system draws it.
 */
export const foliageJitter = (position: readonly [number, number, number]) => {
  const h = Math.abs(Math.sin(position[0] * 12.9898 + position[2] * 78.233) * 43758.5453);
  const frac = h - Math.floor(h);
  const h2 = Math.abs(Math.sin(position[0] * 39.3467 + position[2] * 11.135) * 24634.6345);
  const frac2 = h2 - Math.floor(h2);
  return { frac, frac2, rotY: frac * Math.PI * 2, scaleJitter: 0.88 + frac2 * 0.26 };
};

/** Hue/lightness spread so a stand of trees is not one flat green. */
const canopyTint = (frac: number, frac2: number): THREE.Color => {
  // ~15% of trees shift yellow; the rest ride a narrow hue band.
  const yellowed = frac2 > 0.85;
  const hue = yellowed ? 0.13 + frac * 0.03 : 0.26 + (frac - 0.5) * 0.06;
  const sat = yellowed ? 0.5 : 0.36 + frac2 * 0.18;
  const light = 0.42 * (0.82 + frac2 * 0.33);
  return _color.setHSL(hue, sat, light);
};

// ============================================================
// TREE FIELD
// ============================================================

export interface TreeInstance {
  position: [number, number, number];
  scale?: number;
  type?: TreeSpecies;
}

interface SpeciesBucket {
  species: TreeSpecies;
  items: TreeInstance[];
}

const SpeciesGroup: React.FC<{ bucket: SpeciesBucket }> = ({ bucket }) => {
  const def = SPECIES[bucket.species];
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const count = bucket.items.length;

  useLayoutEffect(() => {
    const trunk = trunkRef.current;
    const canopy = canopyRef.current;
    if (!trunk || !canopy) return;

    bucket.items.forEach((item, i) => {
      const jit = foliageJitter(item.position);
      const scale = (item.scale ?? 1) * jit.scaleJitter;
      _obj.position.set(item.position[0], item.position[1], item.position[2]);
      _obj.rotation.set(0, jit.rotY, 0);
      _obj.scale.setScalar(scale);
      _obj.updateMatrix();
      trunk.setMatrixAt(i, _obj.matrix);
      canopy.setMatrixAt(i, _obj.matrix);
      canopy.setColorAt(i, canopyTint(jit.frac, jit.frac2));
    });

    trunk.instanceMatrix.needsUpdate = true;
    canopy.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    trunk.computeBoundingSphere();
    canopy.computeBoundingSphere();
  }, [bucket]);

  // The alpha-tested canopy needs a matching custom depth material or its
  // shadow is a solid card silhouette instead of dappled leaf shade.
  useLayoutEffect(() => {
    const canopy = canopyRef.current;
    if (!canopy) return;
    canopy.customDepthMaterial = def.kind === 'needle' ? NEEDLE_DEPTH : BROADLEAF_DEPTH;
  }, [def.kind]);

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh
        name="tree-trunks"
        ref={trunkRef}
        args={[def.trunk, def.trunkMaterial, count]}
        castShadow
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={
              ({ oak: 'oakTrunkUnit', birch: 'birchTrunkUnit', pine: 'pineTrunkUnit' } as const)[
                bucket.species
              ]
            }
            original={def.trunk}
            meshRef={trunkRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        name="tree-canopies"
        ref={canopyRef}
        args={[def.canopy, def.kind === 'needle' ? NEEDLE_MATERIAL : BROADLEAF_MATERIAL, count]}
        castShadow
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={
              ({ oak: 'oakCanopyUnit', birch: 'birchCanopyUnit', pine: 'pineCanopyUnit' } as const)[
                bucket.species
              ]
            }
            original={def.canopy}
            meshRef={canopyRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
    </group>
  );
};
SpeciesGroup.displayName = 'SpeciesGroup';

/**
 * Renders a whole stand of trees in two draw calls per species (trunks +
 * canopies) regardless of tree count.
 */
export const InstancedTreeField: React.FC<{ trees: readonly TreeInstance[] }> = React.memo(
  ({ trees }) => {
    const buckets = useMemo<SpeciesBucket[]>(() => {
      const map = new Map<TreeSpecies, TreeInstance[]>();
      trees.forEach((t) => {
        const species = t.type ?? 'oak';
        const list = map.get(species);
        if (list) list.push(t);
        else map.set(species, [t]);
      });
      return Array.from(map.entries()).map(([species, items]) => ({ species, items }));
    }, [trees]);

    return (
      <>
        {buckets.map((bucket) => (
          <SpeciesGroup key={bucket.species} bucket={bucket} />
        ))}
      </>
    );
  }
);
InstancedTreeField.displayName = 'InstancedTreeField';

// ============================================================
// GROUND CLUTTER
// ============================================================

const CLUTTER_GEOMETRY = createClutterTuft(0.42, 0.52);

/**
 * Tier density for ground clutter. Alpha-tested cards are fill-rate work, not
 * triangle work, so the low tier drops them entirely and medium runs a third
 * of the budget. Derived from the existing `quality` field rather than a new
 * graphics setting, so nothing needs to be added to the persisted store.
 */
const VEGETATION_DENSITY: Record<string, number> = {
  low: 0,
  medium: 0.35,
  high: 1,
  ultra: 1,
};

export const useVegetationDensity = (): number => {
  const quality = useGraphicsStore((state) => state.graphics.quality);
  return VEGETATION_DENSITY[quality] ?? 1;
};

/** Halton low-discrepancy sequence: even coverage without clumping, and
 *  deterministic, so clutter never moves between sessions. */
const halton = (index: number, base: number): number => {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
};

export interface ClutterRect {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

export interface ClutterSpec {
  /** Instance budget at full density (tier scaling is applied on top). */
  count: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Footprints to keep clear of every tuft (buildings, ponds). */
  exclude?: readonly ClutterRect[];
  /**
   * Footprints that suppress only the OPEN-GROUND fill, not the tufts pulled
   * in by an attractor. This is how weeds still creep up a wall standing in
   * the middle of a paved square while the square itself stays swept.
   */
  openExclude?: readonly ClutterRect[];
  /** Wall bases, fence lines and trunks to concentrate tufts around, which is
   *  exactly where the missing contact-occlusion cue shows most. */
  attractors?: readonly (readonly [number, number])[];
  /** Ground height in the parent group's local space. */
  y?: number;
  /** Camera distance beyond which the whole field is skipped. */
  cullDistance?: number;
  /** 0..1 tier density multiplier. */
  density?: number;
}

/**
 * One instanced draw call of alpha-tested grass tufts.
 *
 * Fill rate, not triangles, is the cost here: cards are only ~0.5 m tall and
 * the instance count is prefixed by camera distance on a throttled frame, so
 * the field collapses to zero long before it can matter to a distant scene.
 * Never casts or receives shadows - shadow-pass fragment work on alpha-tested
 * cards is the single most likely way to blow the farm's draw budget.
 */
export const InstancedGrassClutter: React.FC<{ spec: ClutterSpec }> = React.memo(({ spec }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const placements = useMemo(() => {
    const density = Math.max(0, Math.min(1, spec.density ?? 1));
    const budget = Math.floor(spec.count * density);
    const { minX, maxX, minZ, maxZ } = spec.bounds;
    const y = spec.y ?? 0;
    const attractors = spec.attractors ?? [];
    const exclude = spec.exclude ?? [];
    const openExclude = spec.openExclude ?? [];
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    const out: { x: number; y: number; z: number; s: number; rot: number; tint: number }[] = [];
    for (let i = 0; i < budget * 2 && out.length < budget; i++) {
      const h1 = halton(i + 7, 2);
      const h2 = halton(i + 7, 3);
      const h3 = halton(i + 7, 5);
      let x: number;
      let z: number;
      // Three of every five tufts hug an attractor; the rest fill open ground.
      const nearAttractor = attractors.length > 0 && i % 5 < 3;
      if (nearAttractor) {
        const a = attractors[i % attractors.length];
        const ang = h1 * Math.PI * 2;
        const rad = 0.5 + h2 * 2.1;
        x = a[0] + Math.cos(ang) * rad;
        z = a[1] + Math.sin(ang) * rad;
      } else {
        x = minX + h1 * (maxX - minX);
        z = minZ + h2 * (maxZ - minZ);
      }
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;

      const hits = (rects: readonly ClutterRect[]): boolean =>
        rects.some((r) => Math.abs(x - r.x) < r.halfX && Math.abs(z - r.z) < r.halfZ);
      if (hits(exclude)) continue;
      if (!nearAttractor && hits(openExclude)) continue;

      out.push({
        x,
        y,
        z,
        s: 0.72 + h3 * 0.75,
        rot: h3 * Math.PI * 2,
        tint: halton(i + 7, 7),
      });
    }

    // Near-to-centre first, so a count prefix is also a distance prefix.
    out.sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
    return out;
  }, [spec]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    placements.forEach((p, i) => {
      _obj.position.set(p.x, p.y, p.z);
      _obj.rotation.set(0, p.rot, 0);
      _obj.scale.set(p.s, p.s * (0.8 + p.tint * 0.5), p.s);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
      // ~20% browned-off tufts, the rest a lightness spread.
      const browned = p.tint > 0.8;
      _color.setHSL(
        browned ? 0.11 : 0.27 + (p.tint - 0.5) * 0.05,
        browned ? 0.42 : 0.4,
        0.36 * (0.7 + p.tint * 0.45)
      );
      mesh.setColorAt(i, _color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  const cullDistance = spec.cullDistance ?? 120;

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || placements.length === 0) return;
    if (!shouldRunThisFrame(12)) return;
    mesh.getWorldPosition(_worldPos);
    const dist = _worldPos.distanceTo(state.camera.position);
    const next =
      dist > cullDistance
        ? 0
        : dist > cullDistance * 0.5
          ? Math.floor(placements.length * 0.4)
          : placements.length;
    if (mesh.count !== next) mesh.count = next;
  });

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[CLUTTER_GEOMETRY, CLUTTER_MATERIAL, placements.length]}
      // Never CASTS: shadow-pass fragment work on alpha-tested cards is the
      // fastest way to blow the farm's budget. Does RECEIVE - `receiveShadow`
      // is a bool uniform, not a define, so it costs no extra program, and
      // without it every tuft glows inside a building's shadow.
      castShadow={false}
      receiveShadow
    />
  );
});
InstancedGrassClutter.displayName = 'InstancedGrassClutter';

// ============================================================
// MULCH DECALS
// ============================================================

// 14 segments looks coarse for a ring instanced out to 3-4.6 m across, and it
// is deliberately left alone: `generateMulchDecal` writes alpha = edge^2 * 0.82
// with edge = 1 - (d + wobble), so alpha is exactly 0 at d = 1, and the chord
// midpoints of a 14-gon sit at d = 0.9749 - alpha 0.0005, well under one 8-bit
// level. The polygon silhouette is not merely soft, it is unrenderable; more
// segments would buy nothing but vertices.
const MULCH_GEOMETRY = new THREE.CircleGeometry(1, 14);
MULCH_GEOMETRY.rotateX(-Math.PI / 2);

/**
 * Soft dirt rings that put a trunk or a wall base in contact with the ground.
 *
 * `y` is the caller's problem: pass a height just above whatever surface is
 * being decorated. The village cobble sheet and the farm barnyard both sit on
 * the ground datum now, so both callers use this default overlay layer (the
 * village divides it by its authored scale). The material never writes depth
 * and carries `exteriorOverlay` polygon offset so it cannot z-fight.
 */
export const InstancedMulch: React.FC<{
  spots: readonly (readonly [number, number])[];
  radius?: number;
  y?: number;
}> = React.memo(({ spots, radius = 1.9, y = EXTERIOR_LAYERS.groundOverlay }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    spots.forEach((s, i) => {
      const jitter = halton(i + 3, 2);
      _obj.position.set(s[0], y, s[1]);
      _obj.rotation.set(0, jitter * Math.PI * 2, 0);
      _obj.scale.setScalar(radius * (0.82 + jitter * 0.4));
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots, radius, y]);

  if (spots.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[MULCH_GEOMETRY, MULCH_MATERIAL, spots.length]}
      renderOrder={RENDER_ORDER.floorEffects}
      receiveShadow
    />
  );
});
InstancedMulch.displayName = 'InstancedMulch';
