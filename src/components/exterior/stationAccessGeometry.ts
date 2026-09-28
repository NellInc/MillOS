import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAS_STATION_SITE } from '../../constants/siteLayout';

/** One flared carriageway, plus the short throat into the existing parking pad.
 * Working if raycasts follow both lanes from the live forecourt to x=14 without
 * a grass gap, and the sign and parked cars remain outside those lanes.
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
  shape.quadraticCurveTo(a.roadX - 2, -north, a.roadX, -(a.centreZ - a.mouthHalfWidth));
  shape.lineTo(a.roadX, -(a.centreZ + a.mouthHalfWidth));
  shape.quadraticCurveTo(a.roadX - 2, -south, a.roadNeckX, -south);
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
  return geometry;
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
  // A broken centre guide stops before the junction and pump manoeuvring area.
  for (let x = -59; x <= 1; x += 6) paint(x, a.centreZ, 2, 0.12);
  paint(-27.5, a.centreZ - a.halfWidth + 0.25, 65, 0.12);
  paint(-31, a.centreZ + a.halfWidth - 0.25, 72, 0.12);
  // Paired give-way dashes on the outbound half; no line across the main road.
  for (const x of [9.3, 9.9]) for (const z of [137, 138, 139]) paint(x, z, 0.18, 0.6);
  const geometry = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return geometry;
}
