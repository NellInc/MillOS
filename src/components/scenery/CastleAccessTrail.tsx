import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CASTLE_APPROACH, CASTLE_ROCK_SINK, CASTLE_STAIR_X } from '../../constants/castleAccess';
import { POLYGON_OFFSET } from '../../constants/renderLayers';
import {
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_LANDINGS,
  SITE_LAYOUT,
} from '../../constants/siteLayout';
import { CASTLE_WALKING_ROUTE, castleWorldPosition } from '../../utils/castleNavigation';
import { applyWorldSurface } from '../../utils/worldSurface';
import { MOUNTAIN_RIDGE_GEOMETRIES } from '../environment/OptimizedSkySystem';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';

type Point = readonly [number, number, number];
type Face = { points: Point[]; minX: number; maxX: number; minZ: number; maxZ: number };
const face = (points: Point[]): Face => ({
  points,
  minX: Math.min(...points.map((p) => p[0])),
  maxX: Math.max(...points.map((p) => p[0])),
  minZ: Math.min(...points.map((p) => p[2])),
  maxZ: Math.max(...points.map((p) => p[2])),
});
const overlaps = (a: Face, b: Face) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const cross = (a: Point, b: Point, p: Point) =>
  (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);

/** Clip the original ground triangle, retaining its actual plane at every new
 * edge. Sampling only ribbon vertices would cut through the ridge between them.
 * Working if triangle-interior rays agree with the drawn valley/ridge surfaces.
 */
function clip(source: Point[], footprint: Point[]): Point[] {
  let polygon = source;
  const sign = Math.sign(cross(footprint[0], footprint[1], footprint[2]));
  for (let edge = 0; edge < footprint.length; edge++) {
    const a = footprint[edge],
      b = footprint[(edge + 1) % footprint.length];
    const next: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const d = cross(a, b, p) * sign,
        e = cross(a, b, q) * sign;
      if (d >= 0) next.push(p);
      if (d >= 0 !== e >= 0) {
        const t = d / (d - e);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
      }
    }
    polygon = next;
  }
  return polygon;
}

/** A small rounded turn at each measured waypoint, never a wide spline bow
 * outside the permitted six-metre corridor. No new walking policy lives here.
 */
export function castleTrailStations(): THREE.Vector3[] {
  const points = [
    new THREE.Vector3(
      RIVER_FOOTBRIDGE_DECK.centre[0],
      0,
      Math.min(...RIVER_FOOTBRIDGE_LANDINGS.map((p) => p.minZ))
    ),
    new THREE.Vector3(CASTLE_WALKING_ROUTE.start[0], 0, CASTLE_WALKING_ROUTE.start[1]),
    new THREE.Vector3(CASTLE_WALKING_ROUTE.end[0], 0, CASTLE_WALKING_ROUTE.end[2]),
    new THREE.Vector3(
      ...castleWorldPosition(CASTLE_STAIR_X, CASTLE_ROCK_SINK, CASTLE_APPROACH.maxZ)
    ).setY(0),
  ];
  const curve = new THREE.CurvePath<THREE.Vector3>();
  let previous = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    const radius = Math.min(
      3,
      corner.distanceTo(points[i - 1]) / 3,
      corner.distanceTo(points[i + 1]) / 3
    );
    const before = corner.clone().add(points[i - 1].clone().sub(corner).setLength(radius));
    const after = corner.clone().add(points[i + 1].clone().sub(corner).setLength(radius));
    curve.add(new THREE.LineCurve3(previous, before));
    curve.add(new THREE.QuadraticBezierCurve3(before, corner, after));
    previous = after;
  }
  curve.add(new THREE.LineCurve3(previous, points.at(-1)!));
  return curve.getSpacedPoints(Math.ceil(curve.getLength() / 1.5));
}

export function createCastleAccessTrailGeometry(segments: number): THREE.BufferGeometry {
  const stations = castleTrailStations();
  const edges = stations.map((point, i) => {
    const direction = stations[Math.min(i + 1, stations.length - 1)]
      .clone()
      .sub(stations[Math.max(0, i - 1)])
      .normalize();
    const fade = Math.sin((Math.PI * i) / (stations.length - 1));
    const halfWidth = 1.5 + fade * (0.065 * Math.sin(i * 0.41) + 0.035 * Math.sin(i * 0.83));
    const normal = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(halfWidth);
    return [point.clone().add(normal).toArray(), point.clone().sub(normal).toArray()] as [
      Point,
      Point,
    ];
  });
  const strips = edges
    .slice(1)
    .map((edge, i) => face([edges[i][0], edge[0], edge[1], edges[i][1]]));
  const bounds = face(edges.flat());
  const groundFaces: Face[] = [];
  const stepX = (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX) / segments;
  const stepZ = (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ) / segments;
  const vertex = (i: number, j: number): Point => {
    const x = TERRAIN_BOUNDS.minX + i * stepX,
      z = TERRAIN_BOUNDS.minZ + j * stepZ;
    return [x, SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments), z];
  };
  for (
    let i = Math.floor((bounds.minX - TERRAIN_BOUNDS.minX) / stepX);
    i <= Math.floor((bounds.maxX - TERRAIN_BOUNDS.minX) / stepX);
    i++
  ) {
    for (
      let j = Math.floor((bounds.minZ - TERRAIN_BOUNDS.minZ) / stepZ);
      j <= Math.floor((bounds.maxZ - TERRAIN_BOUNDS.minZ) / stepZ);
      j++
    ) {
      const a = vertex(i, j),
        b = vertex(i + 1, j),
        c = vertex(i, j + 1),
        d = vertex(i + 1, j + 1);
      groundFaces.push(face([a, c, b]), face([b, c, d]));
    }
  }
  // Both anchored rings can carry ground; the camera-locked far ring cannot.
  // Lower clipped faces remain naturally occluded by the actual higher terrain.
  // This preserves the exact visible upper envelope without resampling slopes.
  for (const geometry of MOUNTAIN_RIDGE_GEOMETRIES.slice(1)) {
    const p = geometry.getAttribute('position'),
      index = geometry.getIndex();
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i += 3) {
      const triangle = face(
        [0, 1, 2].map((k) => {
          const v = index ? index.getX(i + k) : i + k;
          return [p.getX(v), p.getY(v), p.getZ(v)] as Point;
        })
      );
      if (overlaps(bounds, triangle)) groundFaces.push(triangle);
    }
  }
  const positions: number[] = [],
    colours: number[] = [],
    uvs: number[] = [];
  const buff = new THREE.Color('#c2b698'),
    worn = new THREE.Color('#b9ad91'),
    tone = new THREE.Color();
  for (const strip of strips)
    for (const ground of groundFaces) {
      if (!overlaps(strip, ground)) continue;
      const polygon = clip(ground.points, strip.points);
      for (let i = 1; i < polygon.length - 1; i++) {
        const triangle = [polygon[0], polygon[i], polygon[i + 1]];
        if (Math.abs(cross(triangle[0], triangle[1], triangle[2])) < 1e-8) continue;
        if (cross(triangle[0], triangle[1], triangle[2]) > 0) triangle.reverse();
        for (const [x, y, z] of triangle) {
          positions.push(x, y, z);
          uvs.push(x, z);
          tone
            .copy(buff)
            .lerp(worn, 0.35 + 0.2 * Math.sin(x * 0.71 + z * 0.43))
            .toArray(colours, colours.length);
        }
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One static, opaque, shadow-receiving mesh. No textures or extra lights.
 * Working if both terrain tiers keep one continuous dry trail to the approach.
 */
export function CastleAccessTrail({ segments }: { segments: number }) {
  const geometry = useMemo(() => createCastleAccessTrailGeometry(segments), [segments]);
  const material = useMemo(
    () =>
      applyWorldSurface(
        new THREE.MeshStandardMaterial({
          name: 'castle-access-limestone',
          vertexColors: true,
          roughness: 0.97,
          polygonOffset: true,
          polygonOffsetFactor: POLYGON_OFFSET.exteriorTop.factor,
          polygonOffsetUnits: POLYGON_OFFSET.exteriorTop.units,
        }),
        'masonry',
        { macro: 0.06, meso: 0.09, reliefMetres: 0.003, grime: 0, dust: 0, edge: 0 }
      ),
    []
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      name="castle-access-trail"
      geometry={geometry}
      material={material}
      receiveShadow
      dispose={null}
    />
  );
}
