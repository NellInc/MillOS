import { GeneratedSurfaceMesh } from '../models/GeneratedGeometrySurface';
import { InstancedTreeField, type TreeInstance } from './InstancedFoliage';
/**
 * Tunnel and Culvert Components
 *
 * For drainage passages and scenic tunnels.
 *
 * Every shape here is a shared module-level lathe built as UNIT geometry -
 * radius 1, length 1 (y in [-0.5, 0.5]) - and scaled at the mesh by the
 * component's props, the same pattern the machine bank uses in
 * `machines/CompactMachines.tsx`. That matters more than the vertex count: the
 * old components built a fresh `cylinderGeometry` and two `torusGeometry`
 * inline per rendered culvert, so the buffers multiplied with the number placed.
 * These are allocated once for the scene however many go down.
 *
 * None of these meshes carries a pointer handler or a custom raycast, so none
 * of them needs a picking proxy the way `raycastSiloShell` does.
 */

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNNEL_MATERIALS, PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { createAtmosphereState, sampleAtmosphere } from '../../simulation/atmosphere';
import { getCulvertWaterHeight } from '../../simulation/ambientWorld';
import { EXTERIOR_LAMP_LENS_MATERIAL, ExteriorLampPool } from '../exterior/ExteriorLighting';

interface TunnelProps {
  position: [number, number, number];
  rotation?: number;
  length?: number;
  radius?: number;
}

/**
 * Duplicate a profile point so the lathe shades a hard arris there.
 *
 * `THREE.LatheGeometry` gives each profile point ONE normal, averaged from the
 * two segments meeting at it, so a chamfer or a step shades as a soft bulge -
 * plastic drainpipe rather than cast concrete. Repeating the point splits the
 * normal: the degenerate ring contributes a null segment normal, which
 * LatheGeometry's normal pass carries the previous/next normal across rather
 * than averaging in (three/src/geometries/LatheGeometry.js), so each side keeps
 * its own face direction. The zero-area quads it also emits are discarded at
 * rasterisation.
 */
const arris = (points: THREE.Vector2[], hard: number[]): THREE.Vector2[] =>
  points.flatMap((p, i) => (hard.includes(i) ? [p, p.clone()] : [p]));

/**
 * Precast concrete pipe for the drainage culvert.
 *
 * Rendered at [0.6, 6, 0.6]: a 1.2 m pipe 6 m long, buried to its axis, so the
 * only thing ever drawn is a 120-degree arc standing 0.3 m proud of the farm
 * ground at walking distance. A bare cylinder there is a white tube with no
 * scale and no story. A 6 m culvert is three 2 m precast sections, and the two
 * joints between them - plus the spigot land each mouth ring seats on - are
 * what say "pipe laid in a trench" instead of "extruded plastic".
 *
 * The joint collars and the mouth lands sit AT radius 1.0 and the barrel is set
 * in to 0.945, so all three bands are bought without a millimetre of envelope
 * growth: max radius 1.0 and y in [-0.5, 0.5] are exactly the cylinder's. In
 * world terms the collars stand 33 mm proud over a 0.26 m band. Previewed
 * against a ground plane at eye height (scripts/blender/specs/culverts-tunnel.json,
 * `drainage_barrel`) at 21 mm, 33 mm and 48 mm: 21 mm washed out at distance and
 * 48 mm cost 8% of the crown height for no extra legibility.
 *
 * Segments go UP, 16 to 32, and that is a second change riding alongside the
 * profile rather than part of it, so it gets its own argument. At 16 the
 * exposed 120-degree arc is 5.3 facets wide and the crown silhouette sits
 * 11.5 mm inside its own circle - a visible polygon on a 1.2 m pipe you can
 * walk up to. 32 halves the facet and takes that to 2.9 mm. The profile is
 * where the design is; the density is what pays for standing next to it.
 */
function createDrainagePipeGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(1.0, -0.5), // mouth face - the bell ring seats on this
    new THREE.Vector2(1.0, -0.47), // spigot land, 0.18 m
    new THREE.Vector2(0.945, -0.46), // chamfer down onto the barrel
    new THREE.Vector2(0.945, -0.18867),
    new THREE.Vector2(1.0, -0.17867), // joint collar, first 2 m section
    new THREE.Vector2(1.0, -0.15467),
    new THREE.Vector2(0.945, -0.14467),
    new THREE.Vector2(0.945, 0.14467),
    new THREE.Vector2(1.0, 0.15467), // joint collar, second 2 m section
    new THREE.Vector2(1.0, 0.17867),
    new THREE.Vector2(0.945, 0.18867),
    new THREE.Vector2(0.945, 0.46),
    new THREE.Vector2(1.0, 0.47), // spigot land
    new THREE.Vector2(1.0, 0.5), // mouth face - envelope max y
  ];
  // Every interior point is a chamfer end or a collar shoulder; all of them
  // want a crisp edge, and hardening them costs normals, not silhouette.
  return new THREE.LatheGeometry(arris(profile, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 32);
}

/**
 * Flared end section for the drainage culvert mouths.
 *
 * Replaces `TorusGeometry(radius, 0.1, 8, 16)`. A torus is a rubber gasket: a
 * circular tube of constant section wrapped round the bore. What sits on a
 * culvert mouth is a cast flared end - it grows out of the barrel, reaches its
 * full width, and stops at a squared face with a chamfered arris. Same
 * information, an order of magnitude more specific.
 *
 * Authored against the PIPE radius (bore 1.0) and scaled uniformly by it, so at
 * the shipped radius of 0.6 the outer radius is 0.700 and the axial half-extent
 * 0.100 - the torus's envelope to five decimals, unchanged.
 *
 * The sweep goes 16 to 32 with the barrel it seats on, and that is a density
 * change, named as one: a mouth ring coarser than the pipe running through it
 * reads as a hoop bolted on afterwards. The eight-point section is the design.
 */
function createCulvertEndRingGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(1.0, -0.16667), // back edge, flush with the barrel land
    new THREE.Vector2(1.035, -0.15), // flare - left smooth, it is a curve
    new THREE.Vector2(1.135, -0.09),
    new THREE.Vector2(1.16667, -0.05), // envelope max radius
    new THREE.Vector2(1.16667, 0.12), // squared outer land - the band that reads
    new THREE.Vector2(1.135, 0.16667), // chamfered arris
    new THREE.Vector2(1.0, 0.16667), // flat mouth annulus back to the bore
    new THREE.Vector2(1.0, -0.16667), // bore, closes the section
  ];
  return new THREE.LatheGeometry(arris(profile, [3, 4, 5, 6]), 32);
}

/**
 * Corrugated barrel for the metal culvert.
 *
 * A corrugated steel pipe IS its corrugation; without it the component was a
 * smooth tube distinguishable from the concrete one only by its material. The
 * profile is 18 annular corrugations sampled four times each, between smooth
 * coupling bands at both mouths - the bands are where sections are joined, and
 * they also give the mouth a clean edge instead of a ragged crest.
 *
 * Rendered at [0.6, 4, 0.6] the corrugation is 0.2 m pitch and 42 mm deep. That
 * is a 4.8:1 pitch-to-depth ratio, which is real CMP (68 x 13 mm is 5.2:1)
 * scaled up about 3x so it survives a 1.2 m pipe seen from several metres. This
 * is NOT the silo shell's banding recycled: that is a 1.2%-of-radius ripple
 * standing in for rolled sheet, ~40 shallow ridges with no mouth treatment;
 * this is a deep structural corrugation with a deliberate smooth band at each
 * end.
 *
 * Crests sit exactly at radius 1.0, so only the troughs move and the envelope
 * is the cylinder's unchanged. Segments stay at 16 - the corrugation carries
 * the read, and spending on the circumference would be the density change this
 * redesign exists to avoid.
 */
function createCorrugatedCulvertGeometry(): THREE.LatheGeometry {
  const CORRUGATIONS = 18;
  const STEPS_PER = 4;
  const DEPTH = 0.07; // 42 mm at the shipped radius
  const BAND = 0.05; // smooth coupling band at each mouth, 0.2 m

  const yFrom = -0.5 + BAND;
  const span = 1 - 2 * BAND;
  const steps = CORRUGATIONS * STEPS_PER;

  const profile: THREE.Vector2[] = [new THREE.Vector2(1, -0.5)];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const radius = 1 - (DEPTH * (1 - Math.cos(2 * Math.PI * CORRUGATIONS * t))) / 2;
    profile.push(new THREE.Vector2(radius, yFrom + span * t));
  }
  profile.push(new THREE.Vector2(1, 0.5));

  return new THREE.LatheGeometry(profile, 16);
}

/** Soffit radius of the brick arch, in half-width units - see below. */
const ARCH_INTRADOS = 0.83333;

/**
 * Brick tunnel arch: a hollow half-barrel with a voussoir ring at each mouth.
 *
 * The geometry this replaces never read as a tunnel at all, and it is worth
 * saying so plainly rather than claiming an improvement on a working thing.
 * `CylinderGeometry(width/2, width/2, length, 16, 1, true, 0, PI)` was rotated
 * [0, 0, PI/2], which lays the barrel axis along X - across the side walls and
 * the mouth keystones, which both run along Z. It was also openEnded with a
 * FrontSide material, so the soffit was backface-culled and the camera looked
 * straight through the vault.
 *
 * This is a `LatheGeometry` with `phiLength = PI` about the tunnel axis, and a
 * CLOSED profile, which buys the three things an arch is made of:
 *
 *  - a 0.13 m ring wall between an intrados at 0.83333 and an extrados at 0.92,
 *    so the soffit is a real front-facing surface you can stand under;
 *  - an archivolt at each mouth stepping out to 1.0 for the last 0.35 m, with
 *    a 0.12 m reveal so the ring OVERHANGS the recessed soffit annulus. A
 *    single flat mouth annulus was built first and rejected on the render: it
 *    reads as a washer, and the shadow line the reveal throws is the whole
 *    difference (`brick_arch_single_order` in the spec);
 *  - a springing at exactly the half width, which is why the intrados lands on
 *    0.83333: at the shipped width of 3 m the bore is 2.5 m, flush with the
 *    side walls' inner faces, and the archivolt's 1.0 is flush with their outer
 *    faces, so the lathe's open phi ends are covered by the walls.
 *
 * Segments go DOWN, 16 to 13. Thirteen is odd, so a facet is centred on the
 * apex and the crown is a stone rather than a joint, and the flat shading below
 * turns those facets into voussoirs. A 26-facet version was rendered alongside
 * and is indistinguishable at the distance a 3 m tunnel is seen from.
 *
 * `toNonIndexed().computeVertexNormals()` is the point of the low count, not an
 * afterthought: LatheGeometry's normals are smooth AROUND the sweep, so 13
 * segments would otherwise shade as a slightly polygonal smooth tube. Splitting
 * the faces is what makes them read as masonry.
 *
 * Envelope: max radius 1.0 at the springing and y in [-0.5, 0.5] are exact. The
 * apex of a 13-sided arch inscribes its circle and sits 0.73% low - 11 mm at
 * the shipped 3 m width. Nothing is positioned against the crown (the walls
 * meet the springing, the keystone is authored with it below), and the
 * component has no call sites anywhere in the app to retune - `BrickTunnel` and
 * `MetalCulvert` are exported but unused; only `DrainageCulvert` is placed, and
 * that one holds its envelope to 0.00 mm.
 */
function createBrickArchGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(ARCH_INTRADOS, 0.48), // far mouth, recessed intrados
    new THREE.Vector2(ARCH_INTRADOS, -0.48), // soffit, one straight run
    new THREE.Vector2(0.92, -0.48), // recessed annulus inside the ring
    new THREE.Vector2(0.92, -0.5), // reveal riser - the ring overhangs it
    new THREE.Vector2(1.0, -0.5), // voussoir face
    new THREE.Vector2(1.0, -0.44167), // archivolt outer land, 0.35 m
    new THREE.Vector2(0.92, -0.43), // chamfer down to the barrel extrados
    new THREE.Vector2(0.92, 0.43), // barrel extrados
    new THREE.Vector2(1.0, 0.44167),
    new THREE.Vector2(1.0, 0.5),
    new THREE.Vector2(0.92, 0.5),
    new THREE.Vector2(0.92, 0.48),
    new THREE.Vector2(ARCH_INTRADOS, 0.48), // closes the loop
  ];
  // phiStart PI/2 with the mesh rotated [PI/2, 0, 0] puts the sweep from +X
  // through +Y to -X: springing to crown to springing.
  const geometry = new THREE.LatheGeometry(profile, 13, Math.PI / 2, Math.PI).toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}

const DRAINAGE_PIPE = createDrainagePipeGeometry();
const CULVERT_END_RING = createCulvertEndRingGeometry();
const CORRUGATED_CULVERT = createCorrugatedCulvertGeometry();
const BRICK_ARCH = createBrickArchGeometry();
const _culvertAtmosphere = createAtmosphereState();
const CULVERT_BORE = new THREE.CylinderGeometry(0.89, 0.89, 1, 32, 1, true);
const CULVERT_WATER = new THREE.PlaneGeometry(1, 1);
const CULVERT_RIPRAP = new THREE.IcosahedronGeometry(1, 1);
const CULVERT_BORE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#222724',
  roughness: 1,
  metalness: 0,
  side: THREE.BackSide,
});
const CULVERT_RIPRAP_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#77766e',
  roughness: 0.98,
  metalness: 0,
});

const CULVERT_RIPRAP_OFFSETS = [
  [-0.56, -0.7, -1.28, 0.22],
  [0.5, -0.68, -1.24, 0.18],
  [-0.7, -0.74, 1.2, 0.2],
  [0.62, -0.72, 1.26, 0.24],
] as const;

/** Perforated masonry face for the existing Victorian portal. Metres, Y up. */
export function createVictorianTunnelPortalGeometry(
  width = 14,
  height = 9,
  depth = 1.2
): THREE.ExtrudeGeometry {
  const wall = new THREE.Shape();
  wall.moveTo(-width / 2, -1);
  wall.lineTo(width / 2, -1);
  wall.lineTo(width / 2, height);
  wall.lineTo(-width / 2, height);
  wall.closePath();
  const passage = new THREE.Path();
  passage.moveTo(-4, -1);
  passage.lineTo(-4, 2.5);
  passage.absarc(0, 2.5, 4, Math.PI, 0, true);
  passage.lineTo(4, -1);
  passage.closePath();
  wall.holes.push(passage);
  const geometry = new THREE.ExtrudeGeometry(wall, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -depth / 2);
  // Preserve the former columns' brick density, rather than stretching one
  // UV square across the whole facade or tiling it once per metre.
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 8);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Lower masonry of the barrel vault, outside the unchanged 8 m passage. */
export function createVictorianTunnelSideGeometry(length: number): THREE.BufferGeometry {
  const sides = [-4.125, 4.125].map((x) => {
    const geometry = new THREE.BoxGeometry(0.25, 2.52, length + 0.1);
    const uv = geometry.getAttribute('uv');
    const normal = geometry.getAttribute('normal');
    for (let i = 0; i < uv.count; i += 1) {
      const span = Math.abs(normal.getX(i)) > 0.5 ? length + 0.1 : 0.25;
      uv.setXY(i, (uv.getX(i) * span) / 3, (uv.getY(i) * 2.52) / 8);
    }
    return geometry.translate(x, 1.24, 0);
  });
  const geometry = mergeGeometries(sides);
  sides.forEach((side) => side.dispose());
  if (!geometry) throw new Error('Could not assemble the Victorian tunnel side walls');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A box whose UVs are in metres on every face, so tiled maps keep one scale. */
function createMetricBox(width: number, height: number, depth: number): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute('uv');
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < uv.count; i += 1) {
    const [spanU, spanV] =
      Math.abs(normal.getX(i)) > 0.5
        ? [depth, height]
        : Math.abs(normal.getY(i)) > 0.5
          ? [width, depth]
          : [width, height];
    uv.setXY(i, uv.getX(i) * spanU, uv.getY(i) * spanV);
  }
  return geometry;
}

/** Road bore: 12 m between the lining walls, 7 m to the soffit. */
export const ROAD_TUNNEL_BORE = { halfWidth: 6, height: 7 } as const;

/**
 * The spur that ties the hill back into the foothills.
 *
 * The 90 m block used to end in a vertical face with open meadow behind it:
 * both bores sit in valleys of the near foothill ring, which is only 1-4 m
 * tall where the block stopped. The tail lofts the hill's own cross-section
 * back from its rear face, falling from the 15 m top to `ROAD_TUNNEL_TAIL.endTop`
 * and narrowing, so it runs down into the rising foothill slope instead of
 * standing clear of it.
 *
 * It must be buried BEFORE the near ring's crest (about 162 m behind the
 * portal on both axes). That ring is a single inward-facing surface with no
 * back, so a flat-topped causeway long enough to meet ground at 15 m would
 * reappear above the lower range behind it.
 * Working if the tail's rear cap and end-quarter top sit beneath the
 * foothill mesh on both tunnel axes (`Tunnel.test.ts`).
 */
export const ROAD_TUNNEL_TAIL = { length: 75, endTop: 0, endWidth: 0.7 } as const;

/** Outer outline of the hill's cross-section, left bank to right bank. */
function roadTunnelHillOutline(): THREE.Vector2[] {
  // The skirt is a 12 x 10 box rotated 0.3 rad about its centre (13.5, 2.5):
  // these are its outer lower and outer upper corners.
  const skirtCorner = (x: number, y: number) =>
    new THREE.Vector2(x, y)
      .rotateAround(new THREE.Vector2(), 0.3)
      .add(new THREE.Vector2(13.5, 2.5));
  const foot = skirtCorner(6, -5);
  const shoulder = skirtCorner(6, 5);
  const right = [foot, shoulder, new THREE.Vector2(18, shoulder.y), new THREE.Vector2(18, 15)];
  // Foot to crest on the left, then crest to foot on the right.
  const left = right.map((point) => new THREE.Vector2(-point.x, point.y));
  return [...left, ...[...right].reverse()];
}

function createRoadTunnelTailGeometry(start: number): THREE.BufferGeometry {
  const { length, endTop, endWidth } = ROAD_TUNNEL_TAIL;
  const front = roadTunnelHillOutline();
  const base = front[0].y;
  const top = front.reduce((max, point) => Math.max(max, point.y), -Infinity);
  const heightScale = (endTop - base) / (top - base);
  const back = front.map(
    (point) => new THREE.Vector2(point.x * endWidth, base + (point.y - base) * heightScale)
  );
  const zFront = -start;
  const zBack = -start - length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const quad = (corners: THREE.Vector3[], cornerUvs: [number, number][]) => {
    const first = positions.length / 3;
    corners.forEach((corner, i) => {
      positions.push(corner.x, corner.y, corner.z);
      uvs.push(...cornerUvs[i]);
    });
    indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
  };

  // Sides and top: one flat quad per outline edge, U along the outline and V
  // along the spur, both in metres like `createMetricBox`.
  let u = 0;
  for (let i = 0; i < front.length - 1; i += 1) {
    const edge = front[i].distanceTo(front[i + 1]);
    quad(
      [
        new THREE.Vector3(front[i].x, front[i].y, zFront),
        new THREE.Vector3(back[i].x, back[i].y, zBack),
        new THREE.Vector3(back[i + 1].x, back[i + 1].y, zBack),
        new THREE.Vector3(front[i + 1].x, front[i + 1].y, zFront),
      ],
      [
        [u, zFront],
        [u, zBack],
        [u + edge, zBack],
        [u + edge, zFront],
      ]
    );
    u += edge;
  }
  // Rear cap, fanned from its centre. It is buried, but a closed solid keeps
  // a low grazing view from ever seeing into the spur.
  const capCentre = positions.length / 3;
  const centreY = (base + endTop) / 2;
  positions.push(0, centreY, zBack);
  uvs.push(0, centreY);
  back.forEach((point) => {
    positions.push(point.x, point.y, zBack);
    uvs.push(point.x, point.y);
  });
  for (let i = 0; i < back.length - 1; i += 1)
    indices.push(capCentre, capCentre + 1 + i, capCentre + 2 + i);
  indices.push(capCentre, capCentre + back.length, capCentre + 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The v0.30 blocky hill the road disappears into: a flat-topped earth block
 * over the bore, with slanted banks either side. Unlike v0.30 the banks lean
 * so their outer faces fall away from the road as a grounded slope, a solid
 * core fills the front face around the portal, and the face is flush with the
 * portal instead of a 5 m cutting. One merged, metre-UV mesh: the trees on top
 * are rooted by raycast and the whole hill, tail included, is a single draw.
 */
export function createRoadTunnelHillGeometry(depth = 90): THREE.BufferGeometry {
  const coreInner = ROAD_TUNNEL_BORE.halfWidth + 0.3;
  const parts = [
    ...[-1, 1].flatMap((side) => [
      // Sloped skirt; its lower outer edge sits 0.5 m below grade.
      createMetricBox(12, 10, depth)
        .rotateZ(side * 0.3)
        .translate(side * 13.5, 2.5, -depth / 2),
      // Solid core between the bore lining and the skirt, up to the top block.
      createMetricBox(18 - coreInner, 9.5, depth).translate(
        (side * (coreInner + 18)) / 2,
        4.25,
        -depth / 2
      ),
    ]),
    createMetricBox(36, 6, depth).translate(0, 12, -depth / 2),
    createRoadTunnelTailGeometry(depth),
  ];
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error('Could not assemble the road tunnel hill');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const ROAD_TUNNEL_DEPTH = 90;
const ROAD_TUNNEL_HILL = createRoadTunnelHillGeometry(ROAD_TUNNEL_DEPTH);
// The hill's UVs are measured in metres. The shared lawn textures repeat
// 20 times over a normalized plane, which made these banks tile every 5 cm.
// Dedicated sampler transforms retain the same image and an 8 m feature period.
const roadTunnelGrass = PROCEDURAL_TEXTURES.grassColor.clone();
const roadTunnelRoughness = PROCEDURAL_TEXTURES.grassRoughness.clone();
roadTunnelGrass.repeat.set(1 / 8, 1 / 8);
roadTunnelRoughness.repeat.set(1 / 8, 1 / 8);
export const ROAD_TUNNEL_EARTH_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  map: roadTunnelGrass,
  roughnessMap: roadTunnelRoughness,
  roughness: 1,
  metalness: 0,
});
// Root the compact oak stand on the actual hill mesh. It uses the existing
// instanced foliage pipeline, two draws for all thirteen trees per hill.
export const ROAD_TUNNEL_TREES: readonly TreeInstance[] = (() => {
  const bank = new THREE.Mesh(ROAD_TUNNEL_HILL, ROAD_TUNNEL_EARTH_MATERIAL);
  bank.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  return [
    [-12, -13],
    [2, -21],
    [12, -12],
    [-8, -38],
    [10, -36],
    [-15, -55],
    [1, -49],
    [13, -58],
    [-10, -73],
    [7, -73],
    // On the tail, where it still stands clear of the foothills.
    [-9, -98],
    [6, -104],
    [-2, -112],
  ].map(([x, z], index) => {
    ray.ray.origin.set(x, 40, z);
    const hit = ray.intersectObject(bank)[0];
    if (!hit) throw new Error('Road bank tree has no supporting ground');
    return {
      position: [x, hit.point.y - 0.015, z] as [number, number, number],
      scale: 0.85 + (index % 4) * 0.1,
      type: 'oak' as const,
    };
  });
})();

// The shared tarmac samplers repeat 25x25 over a normalized plane, which
// stretched this 10 x 110 m road 11:1. Match TruckBay's ROAD_TARMAC_MAP texel
// scale (4 x 28 over 10 x 120 m) so the portal joins without a scale jump.
const ROAD_TUNNEL_ROAD_LENGTH = ROAD_TUNNEL_DEPTH + 20;
const roadTunnelTarmac = PROCEDURAL_TEXTURES.tarmacColor.clone();
const roadTunnelTarmacRoughness = PROCEDURAL_TEXTURES.tarmacRoughness.clone();
for (const texture of [roadTunnelTarmac, roadTunnelTarmacRoughness]) {
  texture.repeat.set(10 / 2.5, ROAD_TUNNEL_ROAD_LENGTH / (120 / 28));
}
export const ROAD_TUNNEL_ROAD_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  map: roadTunnelTarmac,
  roughnessMap: roadTunnelTarmacRoughness,
  roughness: 1,
  metalness: 0,
});
const ROAD_TUNNEL_VOID_MATERIAL = new THREE.MeshBasicMaterial({ color: '#030405' });
// Road paint is lit (see FactoryExterior's ROAD PAINT block): an unlit line
// would glow down the dark bore at night. Matches ROAD_PAINT_YELLOW.
const ROAD_TUNNEL_LINE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d9bb3f',
  roughness: 0.78,
  metalness: 0,
  emissive: '#151004',
  emissiveIntensity: 0.2,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
// Soot-darkened lining. Lit, because it is matter; only the far void is unlit.
const ROAD_TUNNEL_LINING_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#34383b',
  roughness: 0.96,
  metalness: 0,
});
const ROAD_TUNNEL_LINING_WALL = new THREE.BoxGeometry(
  0.3,
  ROAD_TUNNEL_BORE.height,
  ROAD_TUNNEL_DEPTH
);
const ROAD_TUNNEL_SOFFIT = new THREE.BoxGeometry(
  ROAD_TUNNEL_BORE.halfWidth * 2,
  0.3,
  ROAD_TUNNEL_DEPTH
);
// Square concrete portal, standing 1.5 m proud of the hill face. The shared
// concrete map is 1 m per tile at metre UVs, which read as a grid of blocks;
// a 3 m tile reads as cast panels.
const roadTunnelConcrete = PROCEDURAL_TEXTURES.concreteColor.clone();
const roadTunnelConcreteRoughness = PROCEDURAL_TEXTURES.concreteRoughness.clone();
for (const texture of [roadTunnelConcrete, roadTunnelConcreteRoughness]) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / 3, 1 / 3);
}
const ROAD_TUNNEL_PORTAL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#c9ccc6',
  map: roadTunnelConcrete,
  roughnessMap: roadTunnelConcreteRoughness,
  roughness: 0.94,
  metalness: 0,
});
const ROAD_TUNNEL_POST = createMetricBox(3, ROAD_TUNNEL_BORE.height, 3);
const ROAD_TUNNEL_HEADWALL = createMetricBox(18, 2.6, 3);
const ROAD_TUNNEL_LENS_GEOMETRY = new THREE.BoxGeometry(1.1, 0.22, 0.18);

/**
 * Drainage Culvert - precast concrete pipe for water drainage
 *
 * The two farm culverts are placed at radius 0.6 inside a root group of scale
 * 1, so this is a 1.2 m pipe standing at walking distance, and both are buried
 * to their axis (y = -0.3): the crown stands 0.3 m proud of the farm ground and
 * exposes a 120-degree arc 1.04 m wide. That outer arc is the whole of what is
 * ever drawn - `TUNNEL_MATERIALS.concrete` carries no `side`, so it is
 * FrontSide, and the shell is a lathe with no caps, so the inside of the bore
 * is backface-culled.
 *
 * The barrel's local +y end lands at world -x once rotated, so the two end
 * rings are mirrored about Z to face their own mouths.
 */
export const DrainageCulvert: React.FC<TunnelProps> = React.memo(
  ({ position, rotation = 0, length = 5, radius = 0.8 }) => {
    const waterRef = useRef<THREE.Mesh>(null);
    const targetWaterHeightRef = useRef(-radius * 0.52);

    useEffect(() => {
      const updateTarget = (state: ReturnType<typeof useGameSimulationStore.getState>): void => {
        const atmosphere = sampleAtmosphere(
          state.gameDay,
          state.gameTime,
          state.weather,
          _culvertAtmosphere
        );
        targetWaterHeightRef.current = getCulvertWaterHeight(
          radius,
          atmosphere.wetness,
          atmosphere.precipitation
        );
      };
      updateTarget(useGameSimulationStore.getState());
      return useGameSimulationStore.subscribe(updateTarget);
    }, [radius]);

    useFrame((_, delta) => {
      if (!waterRef.current) return;
      if (!useGameSimulationStore.getState().isTabVisible) return;
      waterRef.current.position.y = THREE.MathUtils.damp(
        waterRef.current.position.y,
        targetWaterHeightRef.current,
        3,
        Math.min(delta, 0.1)
      );
    });

    return (
      <group
        name={`drainage-culvert-${position[0]}-${position[2]}`}
        position={position}
        rotation={[0, rotation, 0]}
      >
        {/* Jointed precast barrel */}
        <GeneratedSurfaceMesh
          asset="drainagePipeUnit"
          material={TUNNEL_MATERIALS.concrete}
          geometry={DRAINAGE_PIPE}
          rotation={[0, 0, Math.PI / 2]}
          scale={[radius, length, radius]}
          castShadow
          receiveShadow
        />

        {/* A dark back-facing liner makes the pipe read as a hollow bore from
            either mouth instead of a one-sided white shell. */}
        <mesh
          geometry={CULVERT_BORE}
          material={CULVERT_BORE_MATERIAL}
          rotation={[0, 0, Math.PI / 2]}
          scale={[radius, Math.max(0.1, length - radius * 0.25), radius]}
        />

        {/* Flared end sections, each facing out of its own mouth */}
        <mesh
          geometry={CULVERT_END_RING}
          position={[-length / 2, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[radius, radius, radius]}
        >
          <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
        </mesh>
        <mesh
          geometry={CULVERT_END_RING}
          position={[length / 2, 0, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          scale={[radius, radius, radius]}
        >
          <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
        </mesh>

        {/* Cast headwalls, angled wing walls, and splash aprons give each mouth
            a believable load path into the embankment. */}
        {[-1, 1].map((end) => (
          <group key={`headwall-${end}`} position={[end * (length / 2 + radius * 0.13), 0, 0]}>
            <mesh position={[0, radius * 0.62, 0]} castShadow receiveShadow>
              <boxGeometry args={[radius * 0.28, radius * 0.42, radius * 2.7]} />
              <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={`wing-${side}`}
                position={[end * radius * 0.24, -radius * 0.1, side * radius * 1.2]}
                rotation={[0, side * end * 0.28, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[radius * 0.18, radius * 1.25, radius * 0.75]} />
                <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
              </mesh>
            ))}
            <mesh position={[end * radius * 0.58, -radius * 0.69, 0]} receiveShadow>
              <boxGeometry args={[radius * 1.2, radius * 0.1, radius * 2.55]} />
              <primitive object={TUNNEL_MATERIALS.concrete} attach="material" />
            </mesh>
            {CULVERT_RIPRAP_OFFSETS.map(([x, y, z, scale], index) => (
              <mesh
                key={`riprap-${index}`}
                geometry={CULVERT_RIPRAP}
                material={CULVERT_RIPRAP_MATERIAL}
                position={[end * radius * x, radius * y, radius * z]}
                scale={[radius * scale * 1.35, radius * scale, radius * scale]}
                rotation={[index * 0.31, index * 0.67, index * 0.19]}
                castShadow
              />
            ))}
          </group>
        ))}

        {/* Water surface inside */}
        <mesh
          ref={waterRef}
          geometry={CULVERT_WATER}
          position={[0, -radius * 0.52, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[length, radius * 1.2, 1]}
          userData={{ noStaticBatch: true, dynamic: true }}
        >
          <primitive object={TUNNEL_MATERIALS.water} attach="material" />
        </mesh>
      </group>
    );
  }
);
DrainageCulvert.displayName = 'DrainageCulvert';

/**
 * Brick Tunnel - arched tunnel for roads or walkways
 *
 * The barrel now runs along Z, with the side walls and the mouth keystones,
 * instead of across them. The walls are set to the arch ring's own radii -
 * inner face on the intrados, outer face on the archivolt - so the ring, the
 * wall and the springing are one plane rather than three near-misses, and the
 * lathe's open phi ends sit on the wall tops where nothing can see them.
 *
 * The keystones used to float 0.75 m below the crown at the side of the barrel.
 * They now sit ON the soffit crown, project 0.12 m above the ring and 0.105 m
 * out of the mouth face, which is what a keystone does.
 */
export const BrickTunnel: React.FC<TunnelProps & { width?: number; height?: number }> = React.memo(
  ({ position, rotation = 0, length = 6, width = 3, height = 2.5 }) => {
    const half = width / 2;
    const wallThickness = half * 0.16667; // spans intrados to archivolt
    const keyW = width * 0.15;
    const keyH = width * 0.1233;
    const keyD = length * 0.0667;
    const soffitCrown = height * 0.5 + half * ARCH_INTRADOS;

    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Hollow voussoir arch, springing at the wall tops */}
        <mesh
          geometry={BRICK_ARCH}
          position={[0, height * 0.5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[half, length, half]}
          castShadow
          receiveShadow
        >
          <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
        </mesh>

        {/* Side walls - inner face on the intrados, outer on the archivolt */}
        {[-1, 1].map((side) => (
          <mesh
            key={`wall-${side}`}
            position={[side * half * 0.91667, height * 0.25, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wallThickness, height * 0.5, length]} />
            <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
          </mesh>
        ))}

        {/* Keystone crowning each mouth */}
        {[-1, 1].map((side) => (
          <mesh
            key={`keystone-${side}`}
            position={[0, soffitCrown + keyH / 2, side * (length / 2 + length * 0.0175 - keyD / 2)]}
          >
            <boxGeometry args={[keyW, keyH, keyD]} />
            <primitive object={TUNNEL_MATERIALS.brick} attach="material" />
          </mesh>
        ))}
      </group>
    );
  }
);
BrickTunnel.displayName = 'BrickTunnel';

/**
 * Truck road tunnel, after the v0.30 design: a blocky earth hill with a square
 * concrete portal and a dark lined bore. Local +Z faces the valley; the bore
 * runs 90 m toward -Z, where the trucks reset out of sight.
 */
export const RoadTunnel: React.FC<{
  position: readonly [number, number, number];
  rotation?: number;
}> = React.memo(({ position, rotation = 0 }) => {
  const roadWidth = 10;
  const roadLength = ROAD_TUNNEL_ROAD_LENGTH;
  const { halfWidth, height } = ROAD_TUNNEL_BORE;

  return (
    <group
      name="road-tunnel"
      position={[position[0], position[1], position[2]]}
      rotation={[0, rotation, 0]}
    >
      <mesh
        name="road-tunnel-hill"
        geometry={ROAD_TUNNEL_HILL}
        material={ROAD_TUNNEL_EARTH_MATERIAL}
        castShadow
        receiveShadow
      />
      <group name="road-hill-oaks">
        <InstancedTreeField trees={ROAD_TUNNEL_TREES} />
      </group>

      {/* Portal */}
      {[-1, 1].map((side) => (
        <mesh
          key={`road-tunnel-post-${side}`}
          geometry={ROAD_TUNNEL_POST}
          material={ROAD_TUNNEL_PORTAL_MATERIAL}
          position={[side * (halfWidth + 1.5), height / 2, 0]}
          castShadow
          receiveShadow
        />
      ))}
      <mesh
        geometry={ROAD_TUNNEL_HEADWALL}
        material={ROAD_TUNNEL_PORTAL_MATERIAL}
        position={[0, height + 1.3, 0]}
        castShadow
        receiveShadow
      />
      {[-1, 1].map((side) => (
        <group key={`road-tunnel-lamp-${side}`} position={[side * roadWidth * 0.3, 0, 1.4]}>
          <ExteriorLampPool radius={6.5} />
          <mesh
            geometry={ROAD_TUNNEL_LENS_GEOMETRY}
            material={EXTERIOR_LAMP_LENS_MATERIAL}
            position={[0, height - 0.2, -0.3]}
          />
        </group>
      ))}

      {/* Lined bore */}
      {[-1, 1].map((side) => (
        <mesh
          key={`road-tunnel-wall-${side}`}
          geometry={ROAD_TUNNEL_LINING_WALL}
          material={ROAD_TUNNEL_LINING_MATERIAL}
          position={[side * halfWidth, height / 2, -ROAD_TUNNEL_DEPTH / 2]}
          receiveShadow
        />
      ))}
      <mesh
        geometry={ROAD_TUNNEL_SOFFIT}
        material={ROAD_TUNNEL_LINING_MATERIAL}
        position={[0, height, -ROAD_TUNNEL_DEPTH / 2]}
        receiveShadow
      />

      {/* Road, centre line and drainage channels run through the portal. */}
      <mesh
        geometry={CULVERT_WATER}
        material={ROAD_TUNNEL_ROAD_MATERIAL}
        position={[0, 0.065, 10 - roadLength / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[roadWidth, roadLength, 1]}
        receiveShadow
      />
      <mesh
        geometry={CULVERT_WATER}
        material={ROAD_TUNNEL_LINE_MATERIAL}
        position={[0, 0.09, 10 - roadLength / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.16, roadLength, 1]}
        receiveShadow
      />
      {[-1, 1].map((side) => (
        <mesh
          key={`drain-${side}`}
          position={[side * (roadWidth / 2 - 0.22), 0.1, -ROAD_TUNNEL_DEPTH / 2]}
        >
          <boxGeometry args={[0.3, 0.12, ROAD_TUNNEL_DEPTH]} />
          <meshStandardMaterial color="#596064" roughness={0.82} metalness={0.08} />
        </mesh>
      ))}

      {/* A recessed end cap preserves depth while hiding the vehicle reset. */}
      <mesh
        geometry={CULVERT_WATER}
        material={ROAD_TUNNEL_VOID_MATERIAL}
        position={[0, height / 2, -ROAD_TUNNEL_DEPTH + 0.08]}
        scale={[halfWidth * 2, height, 1]}
      />
    </group>
  );
});
RoadTunnel.displayName = 'RoadTunnel';

/**
 * Metal Culvert - corrugated steel pipe
 */
export const MetalCulvert: React.FC<TunnelProps> = React.memo(
  ({ position, rotation = 0, length = 4, radius = 0.6 }) => {
    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* Corrugated metal pipe */}
        <mesh
          geometry={CORRUGATED_CULVERT}
          rotation={[0, 0, Math.PI / 2]}
          scale={[radius, length, radius]}
          castShadow
          receiveShadow
        >
          <primitive object={TUNNEL_MATERIALS.metal} attach="material" />
        </mesh>

        {/* Rust stains at bottom */}
        <mesh position={[0, -radius * 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[length * 0.8, radius * 0.3]} />
          <meshStandardMaterial
            color="#8b4513"
            map={PROCEDURAL_TEXTURES.rust}
            transparent
            opacity={0.6}
          />
        </mesh>
      </group>
    );
  }
);
MetalCulvert.displayName = 'MetalCulvert';

export { DrainageCulvert as Culvert, BrickTunnel as Tunnel };
