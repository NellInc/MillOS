import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STATION_POSTER_PALETTE } from './AuthoredPropTrim';
import { createDeadDinoPlushGeometry } from './StationSouvenirs';
import { createRetailPacketGeometry, STATION_RETAIL_ART } from './StationRetailDetails';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';

/** A village-scale travel stop, retaining Dead Dino's identity and source site.
 * Four opaque, static batches; no new lights, audio, game actions or frame work.
 * Working if door/fuel corridors remain empty, stock rests on decks and every
 * fitted raster reads upright without colouring neutral product surfaces. */
type V3 = [number, number, number];
const { green, cream, terracotta, brass } = STATION_POSTER_PALETTE;
const floor = EXTERIOR_LAYERS.ground;
export const TRAVEL_STOCK = [0.485, 0.885, 1.285].flatMap((y, row) =>
  [-0.4, 0, 0.4].flatMap((z, col) =>
    [-1, 1].map((copy) => ({
      at: [-13.35 + copy * 0.085, y, 1.05 + z] as V3,
      tile: [5, 6, 8, 9][(row + col) % 4],
      carton: row === 1,
    }))
  )
);
export const TRAVEL_PUMP_FACES = [-1, 1].flatMap((side) =>
  [-3, 3].map((x, col) => ({
    x,
    side,
    number: (side === 1 ? 1 : 3) + col,
  }))
);
function tint(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color),
    count = g.getAttribute('position').count,
    a = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function box(size: V3, at: V3, color: string, radius = 0.004) {
  return tint(
    new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map((v) => v / 3))).translate(
      ...at
    ),
    color
  );
}
function join(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    g = mergeGeometries(flat, false);
  for (const old of new Set([...parts, ...flat])) old.dispose();
  if (!g) throw new Error('Station travel-stop attributes disagree');
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
function lathe(points: [number, number][], at: V3, color: string) {
  return tint(
    new THREE.LatheGeometry(
      points.map((p) => new THREE.Vector2(...p)),
      20
    ).translate(...at),
    color
  );
}
function print(g: THREE.BufferGeometry, tile: number, quadrant?: number) {
  const uv = g.getAttribute('uv'),
    col = tile % 4,
    row = Math.floor(tile / 4),
    m = 0.025;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i),
      v = uv.getY(i);
    const x =
      quadrant === undefined ? m + u * (1 - 2 * m) : (quadrant % 2) / 2 + m + u * (0.5 - 2 * m);
    const y =
      quadrant === undefined
        ? m + v * (1 - 2 * m)
        : (1 - Math.floor(quadrant / 2)) / 2 + m + v * (0.5 - 2 * m);
    uv.setXY(i, (col + x) / 4, (3 - row + y) / 4);
  }
  return tint(g, '#ffffff');
}
function plaque(side: number, at: V3, tile: number, yaw = 0, quadrant?: number) {
  return print(new THREE.PlaneGeometry(side, side).rotateY(yaw).translate(...at), tile, quadrant);
}
function makeTravelStop() {
  const opaque: THREE.BufferGeometry[] = [],
    metal: THREE.BufferGeometry[] = [],
    prints: THREE.BufferGeometry[] = [];
  const b = (size: V3, at: V3, color: string, radius = 0.004) =>
    opaque.push(box(size, at, color, radius));
  // Snack endcap leaves the centre aisle and incumbent shelf approach open.
  for (const x of [-13.54, -13.16])
    for (const z of [0.54, 1.56]) {
      b([0.042, 0.37, 0.042], [x, 0.27, z], green);
      b([0.056, 0.01, 0.056], [x, 0.085, z], '#263a33');
    }
  for (const y of [0.47, 0.87, 1.27]) {
    b([0.54, 0.03, 1.2], [-13.35, y, 1.05], '#bb986a');
    b([0.026, 0.026, 1.19], [-13.091, y + 0.006, 1.05], brass);
  }
  for (const z of [0.47, 1.63]) b([0.026, 1.45, 0.026], [-13.59, 1.21, z], green);
  b([0.034, 0.32, 1.19], [-13.59, 1.81, 1.05], green);
  prints.push(plaque(0.288, [-13.5705, 1.81, 1.05], 5, Math.PI / 2));
  for (const item of TRAVEL_STOCK) {
    const g = createRetailPacketGeometry(
      item.tile === 6 ? '#c39744' : item.tile === 9 ? terracotta : green,
      item.carton
    );
    opaque.push(g.translate(...item.at));
    // Label only the aisle-facing front row. The duplicated back stock retains
    // its silhouette; rear print is never mistakenly pasted through the front.
    if (item.at[0] > -13.35) {
      const label = new THREE.PlaneGeometry(0.12, 0.12, 1, 8).rotateY(Math.PI / 2);
      const points = label.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        const index = (points.getY(i) + 0.15) / 0.05,
          lo = Math.floor(index),
          f = index - lo;
        const facet = (j: number) =>
          0.07 * (0.12 + 0.88 * Math.pow(Math.max(0, 1 - Math.abs(j * 0.05 - 0.15) / 0.15), 0.4));
        points.setX(
          i,
          (item.carton ? 0.07 : THREE.MathUtils.lerp(facet(lo), facet(lo + 1), f)) + 0.0015
        );
      }
      label.computeVertexNormals();
      prints.push(print(label.translate(item.at[0], item.at[1] + 0.15, item.at[2]), item.tile));
    }
  }
  // Cream/brass portal edges stay on solid header and glazing margins.
  for (const y of [3.729, 4.21]) b([0.019, 0.017, 9.58], [-7.909, y, 0], brass);
  for (const z of [-4.77, 4.77]) b([0.018, 0.49, 0.018], [-7.906, 3.97, z], cream);
  // Three striped quarter-round awnings under the existing header. Cloth arches
  // and scalloped valances share the same static opaque batch, no alpha layers.
  for (const z of [-3.55, 0, 3.55]) {
    const hood = new THREE.CylinderGeometry(0.28, 0.28, 2.24, 12, 12, true, 0, Math.PI / 2).rotateX(
      -Math.PI / 2
    );
    const positions = hood.getAttribute('position'),
      colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++)
      new THREE.Color(Math.floor((positions.getZ(i) + 1.121) / 0.187) % 2 ? green : cream).toArray(
        colors,
        i * 3
      );
    hood.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    hood.translate(-7.968, 3.4, z);
    opaque.push(hood);
    const valance = new THREE.PlaneGeometry(2.24, 0.07, 24, 1),
      p = valance.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      if (p.getY(i) < 0)
        p.setY(i, p.getY(i) - 0.015 * (1 + Math.cos((p.getX(i) * Math.PI) / 0.0933)));
    tint(valance, cream);
    valance.rotateY(Math.PI / 2).translate(-7.687, 3.366, z);
    opaque.push(valance);
    for (const dz of [-1.12, 1.12])
      metal.push(box([0.287, 0.025, 0.025], [-7.835, 3.398, z + dz], green));
  }
  // Clear, outward numbered mast plates on the existing pump pair caps.
  for (const { x, side, number } of TRAVEL_PUMP_FACES) {
    metal.push(box([0.023, 0.28, 0.025], [x, 2.04, side * 0.9], brass));
    b([0.31, 0.31, 0.028], [x, 2.324, side * 0.9], green, 0.008);
    prints.push(plaque(0.279, [x, 2.324, side * 0.915], 14, side === 1 ? 0 : Math.PI, number - 1));
  }
  // Useful windscreen caddies remain wholly on the island ends, outside hoses.
  for (const x of [-4.3, 4.3]) {
    opaque.push(
      lathe(
        [
          [0, 0],
          [0.13, 0],
          [0.17, 0.36],
          [0.171, 0.39],
          [0.151, 0.392],
          [0.117, 0.025],
          [0, 0.025],
        ],
        [x, 0.202, 0],
        green
      )
    );
    b([0.22, 0.013, 0.24], [x, 0.307, 0], '#1d332a');
    metal.push(
      tint(
        new THREE.CylinderGeometry(0.008, 0.008, 0.65, 8)
          .rotateZ(-0.11)
          .translate(x + 0.021, 0.55, 0),
        '#a1aca3'
      )
    );
    b([0.21, 0.042, 0.032], [x + 0.056, 0.878, 0], '#19312a');
    for (const dx of [-0.106, 0.106])
      metal.push(box([0.011, 0.26, 0.011], [x + dx, 0.642, 0.07], brass));
    metal.push(box([0.224, 0.012, 0.012], [x, 0.772, 0.07], brass));
  }
  // Side-door welcome panel uses the real service print; no fictional restroom
  // sign, hours, prices or cleanliness certification is invented.
  b([0.53, 0.53, 0.027], [-10.79, 1.56, 5.014], green);
  prints.push(plaque(0.491, [-10.79, 1.56, 5.029], 15));
  // Built-in-looking slatted bench at the quiet side, clear of the 1.2m door.
  for (const x of [-15.03, -13.67])
    for (const z of [6.94, 7.33]) {
      metal.push(box([0.07, 0.455, 0.065], [x, floor + 0.2275, z], green));
      metal.push(box([0.12, 0.014, 0.1], [x, floor + 0.007, z], green));
    }
  for (const z of [6.94, 7.04, 7.14, 7.24, 7.34])
    b([1.94, 0.036, 0.083], [-14.35, 0.448, z], '#b99363');
  for (const x of [-15.03, -13.67]) metal.push(box([0.045, 0.66, 0.04], [x, 0.663, 6.94], green));
  for (const y of [0.62, 0.765, 0.91]) b([1.94, 0.116, 0.03], [-14.35, y, 6.959], '#b99363');
  for (const x of [-15.03, -13.67]) metal.push(box([0.07, 0.035, 0.45], [x, 0.66, 7.16], green));
  // Lidded shop litter bin has a real recessed mouth, out of the pump lanes.
  b([0.38, 0.64, 0.34], [-7.31, floor + 0.32, -5.23], green, 0.011);
  b([0.43, 0.025, 0.39], [-7.31, 0.6325, -5.23], brass);
  b([0.43, 0.025, 0.39], [-7.31, 0.835, -5.23], green);
  for (const x of [-7.503, -7.117]) b([0.024, 0.18, 0.34], [x, 0.735, -5.23], green);
  b([0.38, 0.18, 0.022], [-7.31, 0.735, -5.398], green);
  prints.push(plaque(0.19, [-7.31, 0.388, -5.058], 13));
  // The outdoor mascot is a weatherproof sculpture, not another fuzzy toy.
  b([2.4, 0.28, 1.1], [-9.65, floor + 0.14, 7.65], '#c7b491', 0.016);
  b([2.42, 0.034, 1.12], [-9.65, 0.263, 7.65], cream, 0.01);
  const statue = createDeadDinoPlushGeometry().scale(2.6, 2.6, 2.6).translate(-9.65, 0.28, 7.65);
  statue.computeBoundingBox();
  statue.computeBoundingSphere();
  b([0.33, 0.26, 0.025], [-9.65, 0.12, 8.2115], green);
  prints.push(plaque(0.231, [-9.65, 0.12, 8.225], 13));
  return { opaque: join(opaque), metal: join(metal), prints: join(prints), statue };
}
export const TRAVEL_STOP_GEOMETRY = makeTravelStop();
const OPAQUE = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.75,
  side: THREE.DoubleSide,
});
const METAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.4,
  metalness: 0.55,
});
const STATUE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.67 });
export const StationTravelStop = React.memo(() => {
  const texture = useTexture(STATION_RETAIL_ART);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        vertexColors: true,
        roughness: 0.73,
        polygonOffset: true,
        polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
        polygonOffsetUnits: POLYGON_OFFSET.standard.units,
      }),
    [texture]
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group name="station-authored-travel-stop">
      <mesh
        name="station-travel-stop-dressing"
        geometry={TRAVEL_STOP_GEOMETRY.opaque}
        material={OPAQUE}
        castShadow
        receiveShadow
      />
      <mesh
        name="station-travel-stop-metal"
        geometry={TRAVEL_STOP_GEOMETRY.metal}
        material={METAL}
        castShadow
        receiveShadow
      />
      <mesh
        name="station-outdoor-dino-sculpture"
        geometry={TRAVEL_STOP_GEOMETRY.statue}
        material={STATUE}
        castShadow
        receiveShadow
      />
      <mesh
        name="station-travel-stop-raster"
        geometry={TRAVEL_STOP_GEOMETRY.prints}
        material={material}
        receiveShadow
      />
    </group>
  );
});
StationTravelStop.displayName = 'StationTravelStop';
