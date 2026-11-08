import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAS_STATION_SITE, SITE_LAYOUT } from '../../constants/siteLayout';
import { bellMouthHalfWidthAt, bellMouthKerb } from '../../constants/railwayRoadLayout';
import { bellMouthTone, giveWayMarkings } from './railwayRoadGeometry';
import { VALLEY_ROAD_HALF_WIDTH } from './tunnelApproachMarkings';

/**
 * Where the access road's bell mouth meets the valley road: the west edge of
 * its 16 m carriageway. `GAS_STATION_SITE.access.roadX` (14) is 2 m onto that
 * carriageway; the mouth used to end there, so its lighter tarmac lay over the
 * valley road's shoulder strip and its kerb arcs ended in spikes across it.
 * The splat's access verge still reaches `roadX`, under the road channel.
 */
export const STATION_ACCESS_MOUTH_X =
  SITE_LAYOUT.roadTunnels.south.position[0] - VALLEY_ROAD_HALF_WIDTH;

/**
 * The bell mouth's kerb on one side (-1 north, +1 south), neck (t 0) to the
 * valley road (t 1): `bellMouthKerb`, leaving the neck along the access road
 * and arriving tangent to the valley road's edge.
 */
export function stationAccessMouthEdge(side: -1 | 1, t: number): [number, number] {
  const a = GAS_STATION_SITE.access;
  const [x, h] = bellMouthKerb(
    a.roadNeckX,
    STATION_ACCESS_MOUTH_X,
    a.halfWidth,
    a.mouthHalfWidth,
    t
  );
  return [x, a.centreZ + side * h];
}

/** One flared carriageway, plus the short throat into the existing parking pad.
 * Working if raycasts follow both lanes from the live forecourt to the valley
 * road's edge without a grass gap, and the sign and parked cars remain outside
 * those lanes. The bell mouth carries a `color` attribute that blends its tone
 * into the valley road's; the material must set `vertexColors`.
 */
export function createStationAccessSurface(): THREE.BufferGeometry {
  const a = GAS_STATION_SITE.access;
  const north = a.centreZ - a.halfWidth;
  const south = a.centreZ + a.halfWidth;
  const shape = new THREE.Shape();
  shape.moveTo(a.forecourtX, -(a.centreZ - a.forecourtHalfWidth));
  shape.quadraticCurveTo(a.forecourtNeckX - 3, -north, a.forecourtNeckX, -north);
  // Parking cars end before z=129. The spur meets their existing hardstand.
  shape.lineTo(-65.5, -north);
  shape.lineTo(-65.5, -128.8);
  shape.lineTo(-60.5, -128.8);
  shape.lineTo(-60.5, -north);
  shape.lineTo(a.roadNeckX, -north);
  shape.lineTo(a.roadNeckX, -south);
  shape.lineTo(a.forecourtNeckX, -south);
  shape.quadraticCurveTo(
    a.forecourtNeckX - 3,
    -south,
    a.forecourtX,
    -(a.centreZ + a.forecourtHalfWidth)
  );
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  // Shared road texture repeats 12 times. This keeps its grain at 2 m,
  // independent of the 89 m carriageway's aspect ratio and curved ends.
  for (let i = 0; i < position.count; i++)
    uv.setXY(i, position.getX(i) / 24, position.getY(i) / 24);
  geometry.rotateX(-Math.PI / 2);
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Array(position.count * 3).fill(1), 3)
  );

  // The bell mouth, neck to the valley road's edge, in strips across it.
  const steps = 12;
  const flare = STATION_ACCESS_MOUTH_X - a.roadNeckX;
  const positions: number[] = [];
  const uvs: number[] = [];
  const tones: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    for (const side of [-1, 1] as const) {
      const [x, z] = stationAccessMouthEdge(side, i / steps);
      const tone = bellMouthTone(STATION_ACCESS_MOUTH_X - x, flare);
      positions.push(x, 0, z);
      uvs.push(x / 24, -z / 24);
      tones.push(tone, tone, tone);
    }
    // North-then-south pairs; anticlockwise seen from above.
    if (i > 0) indices.push(2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i - 2, 2 * i + 1, 2 * i);
  }
  const mouth = new THREE.BufferGeometry();
  mouth.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mouth.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(
      positions.map((_, k) => (k % 3 === 1 ? 1 : 0)),
      3
    )
  );
  mouth.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  mouth.setAttribute('color', new THREE.Float32BufferAttribute(tones, 3));
  mouth.setIndex(indices);
  const merged = mergeGeometries([geometry, mouth])!;
  geometry.dispose();
  mouth.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Painted lane guidance, leaving the parking throat and both mouths open. */
export function createStationAccessMarkings(): THREE.BufferGeometry {
  const a = GAS_STATION_SITE.access;
  const parts: THREE.BufferGeometry[] = [];
  const paint = (x: number, z: number, width: number, depth: number) => {
    const geometry = new THREE.PlaneGeometry(width, depth);
    geometry.rotateX(-Math.PI / 2).translate(x, 0, z);
    parts.push(geometry);
  };
  // A broken centre guide stops before the pump manoeuvring area and 1 m
  // short of the give-way line.
  for (let x = -59; x <= 7; x += 6) paint(x, a.centreZ, 2, 0.12);
  paint(-27.5, a.centreZ - a.halfWidth + 0.25, 65, 0.12);
  paint(-31, a.centreZ + a.halfWidth - 0.25, 72, 0.12);
  // Give way across the outbound lane: eastbound traffic keeps right (D-023),
  // which is the south half. Nothing is painted across the main road.
  const flare = STATION_ACCESS_MOUTH_X - a.roadNeckX;
  const quads = giveWayMarkings(
    (along, lateral) => [STATION_ACCESS_MOUTH_X - along, a.centreZ + lateral],
    (along) => bellMouthHalfWidthAt(along, flare, a.halfWidth, a.mouthHalfWidth),
    a.halfWidth
  );
  for (const quad of quads) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        quad.flatMap(([x, z]) => [x, 0, z]),
        3
      )
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    // Wound to face up whichever way the frame turns the quad.
    const [p, q, r] = quad;
    const up = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) >= 0;
    geometry.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    parts.push(geometry);
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return geometry;
}
