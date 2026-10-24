import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { LOCK_GATE_MATERIAL } from './lockGateSurface';
import {
  ExteriorDownlight,
  EXTERIOR_LAMP_LENS_MATERIAL,
  CANAL_BOAT_LANTERN,
} from '../exterior/ExteriorLighting';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { createColorDataTexture, createLinearDataTexture } from '../../utils/textureGenerator';

/**
 * Small construction details measured against the delivered civic GLBs, rather
 * than their differently sized primitive fallbacks. The authored source is
 * scripts/blender/refine_civic_props.py; GLB seating probes are in the concept
 * realisation village-farm evidence. Each prop contributes one opaque, premerged
 * mesh, eligible for StaticMeshBatch. No individual fastener draws or shaders.
 */
function colored(geometry: THREE.BufferGeometry, hex: string) {
  const color = new THREE.Color(hex);
  const values = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < values.length; i += 3) color.toArray(values, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

function joined(parts: THREE.BufferGeometry[]) {
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const result = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!result) throw new Error('Authored prop trim must share compatible vertex attributes');
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function beam(a: THREE.Vector3, b: THREE.Vector3, width: number, round = false) {
  const direction = b.clone().sub(a);
  const geometry = round
    ? new THREE.CylinderGeometry(width, width, direction.length(), 8)
    : new THREE.BoxGeometry(width, direction.length(), width);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  );
  return geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
}

/** Poster palette is shared by live GLB derivatives and primitive fallbacks. */
export const STATION_POSTER_PALETTE = {
  green: '#1b4b3e',
  column: '#183d36',
  cream: '#efdfbe',
  terracotta: '#b95037',
  stone: '#cbb99a',
  brass: '#bca36f',
} as const;

/** A pillowy vintage cabinet, centred at zero in station metres. The low
 * skirting retains the old cap's footprint; the front stays flat behind the
 * live controls. Working if shoulders curve over 16cm, the top stays at .9m,
 * and the .3m control face is never pushed forward through its fittings.
 */
export function createPosterPumpCabinet() {
  const body = new RoundedBoxGeometry(0.6, 1.8, 0.5, 4, 0.16);
  // Broad shoulders across the face, shallow edge roll in depth. A uniformly
  // large radius would leave the existing cream bezel hovering off the shell.
  const p = body.getAttribute('position'),
    n = body.getAttribute('normal');
  const normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      core = 0.14,
      faceCore = 0.265;
    const edge = Math.abs(x) > core + 1e-6;
    const stretch = edge ? 0.035 / 0.16 : faceCore / core;
    p.setX(
      i,
      Math.sign(x) * (edge ? faceCore + (Math.abs(x) - core) * stretch : Math.abs(x) * stretch)
    );
    normal.fromBufferAttribute(n, i);
    normal.x /= stretch;
    normal.normalize();
    n.setXYZ(i, normal.x, normal.y, normal.z);
  }
  return joined([
    colored(body, STATION_POSTER_PALETTE.terracotta),
    colored(
      // The island top is .2m: expose 4cm of the skirt, never a coplanar red cap.
      new RoundedBoxGeometry(0.7, 0.14, 0.6, 2, 0.035).translate(0, -0.83, 0),
      STATION_POSTER_PALETTE.terracotta
    ),
  ]);
}

/** Sample the nearest original triangle's atlas chart. Only the owned
 * replacement receives UVs; the cached GLB and its shared maps remain exact.
 */
function projectStationUV(source: THREE.BufferGeometry, target: THREE.BufferGeometry) {
  const pos = source.getAttribute('position'),
    uv = source.getAttribute('uv');
  const positions = target.getAttribute('position'),
    out = target.getAttribute('uv');
  const point = new THREE.Vector3(),
    closest = new THREE.Vector3(),
    best = new THREE.Vector3();
  const bary = new THREE.Vector3(),
    triangle = new THREE.Triangle();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    let distance = Infinity,
      chosen = 0;
    for (let t = 0; t < pos.count; t += 3) {
      triangle.setFromAttributeAndIndices(pos, t, t + 1, t + 2);
      triangle.closestPointToPoint(point, closest);
      const d = closest.distanceToSquared(point);
      if (d < distance) {
        distance = d;
        chosen = t;
        best.copy(closest);
      }
    }
    triangle.setFromAttributeAndIndices(pos, chosen, chosen + 1, chosen + 2);
    triangle.getBarycoord(best, bary);
    out.setXY(
      i,
      uv.getX(chosen) * bary.x + uv.getX(chosen + 1) * bary.y + uv.getX(chosen + 2) * bary.z,
      uv.getY(chosen) * bary.x + uv.getY(chosen + 1) * bary.y + uv.getY(chosen + 2) * bary.z
    );
  }
}

/** One opaque canopy body: rounded plan corners, cream soffit and red top lip.
 * Working if roof/pump paint matches the poster, all fixture/body bounds stay
 * fixed, original UV charts/maps remain sampled and no extra body draw is added.
 */
export function createPosterStationGeometry(
  source: THREE.BufferGeometry,
  asset: 'stationCanopy' | 'fuelPumpShell'
) {
  if (!source.getAttribute('color')) return source;
  const original = source.index ? source.toNonIndexed() : source.clone();
  const colours = original.getAttribute('color');
  if (asset === 'fuelPumpShell') {
    original.computeBoundingBox();
    const bounds = original.boundingBox!;
    const scale = (bounds.max.y - bounds.min.y) / 1.8;
    const centre = bounds.getCenter(new THREE.Vector3());
    // The delivered node rotates Y by 90 degrees and scales uniformly. Return
    // the cabinet in that node's own frame, not incorrectly in world metres.
    const cabinet = createPosterPumpCabinet()
      .rotateY(-Math.PI / 2)
      .scale(scale, scale, scale)
      .translate(...centre.toArray());
    projectStationUV(original, cabinet);
    original.dispose();
    cabinet.computeBoundingBox();
    cabinet.computeBoundingSphere();
    cabinet.userData.stationPoster = true;
    return cabinet;
  }
  const pos = original.getAttribute('position'),
    uv = original.getAttribute('uv');
  const groups = { roof: [] as number[], fascia: [] as number[], column: [] as number[] };
  for (let i = 0; i < colours.count; i++) {
    const kind =
      colours.getX(i) - colours.getY(i) > 0.3
        ? 'fascia'
        : colours.getX(i) > 0.8
          ? 'roof'
          : 'column';
    groups[kind].push(i);
  }
  const columns = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const attr = original.getAttribute(name);
    const values: number[] = [];
    for (const i of groups.column)
      for (let c = 0; c < attr.itemSize; c++) values.push(attr.getComponent(i, c));
    columns.setAttribute(name, new THREE.Float32BufferAttribute(values, attr.itemSize));
  }
  colored(columns, STATION_POSTER_PALETTE.column);
  const slabs: THREE.BufferGeometry[] = [columns];
  for (const kind of ['roof', 'fascia'] as const) {
    const bounds = new THREE.Box3();
    for (const i of groups[kind])
      bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
    const size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    const layers =
      kind === 'roof'
        ? [
            { bottom: bounds.min.y, height: size.y * 0.7, paint: STATION_POSTER_PALETTE.cream },
            {
              bottom: bounds.min.y + size.y * 0.7,
              height: size.y * 0.3,
              paint: STATION_POSTER_PALETTE.terracotta,
            },
          ]
        : [{ bottom: bounds.min.y, height: size.y, paint: STATION_POSTER_PALETTE.green }];
    const x = size.x / 2,
      z = size.z / 2,
      radius = Math.min(size.x, size.z) * 0.05;
    const outline = new THREE.Shape();
    outline.moveTo(-x + radius, -z);
    outline.lineTo(x - radius, -z);
    outline.quadraticCurveTo(x, -z, x, -z + radius);
    outline.lineTo(x, z - radius);
    outline.quadraticCurveTo(x, z, x - radius, z);
    outline.lineTo(-x + radius, z);
    outline.quadraticCurveTo(-x, z, -x, z - radius);
    outline.lineTo(-x, -z + radius);
    outline.quadraticCurveTo(-x, -z, -x + radius, -z);
    for (const layer of layers) {
      const slab = new THREE.ExtrudeGeometry(outline, {
        depth: layer.height,
        steps: 1,
        bevelEnabled: false,
        curveSegments: 4,
      });
      slab.rotateX(-Math.PI / 2).translate(center.x, layer.bottom, center.z);
      // Project onto the actual old cube triangles, retaining their atlas chart.
      const target = slab.getAttribute('position'),
        targetUV = slab.getAttribute('uv');
      const point = new THREE.Vector3(),
        closest = new THREE.Vector3(),
        best = new THREE.Vector3(),
        bary = new THREE.Vector3(),
        triangle = new THREE.Triangle();
      for (let i = 0; i < target.count; i++) {
        point.fromBufferAttribute(target, i);
        let distance = Infinity,
          chosen = 0;
        for (let t = 0; t < groups[kind].length; t += 3) {
          triangle.setFromAttributeAndIndices(
            pos,
            groups[kind][t],
            groups[kind][t + 1],
            groups[kind][t + 2]
          );
          triangle.closestPointToPoint(point, closest);
          const d = closest.distanceToSquared(point);
          if (d < distance) {
            distance = d;
            chosen = t;
            best.copy(closest);
          }
        }
        const indices = groups[kind].slice(chosen, chosen + 3);
        triangle.setFromAttributeAndIndices(pos, indices[0], indices[1], indices[2]);
        triangle.getBarycoord(best, bary);
        targetUV.setXY(
          i,
          indices.reduce((v, j, k) => v + uv.getX(j) * bary.getComponent(k), 0),
          indices.reduce((v, j, k) => v + uv.getY(j) * bary.getComponent(k), 0)
        );
      }
      slabs.push(colored(slab, layer.paint));
    }
  }
  original.dispose();
  const result = joined(slabs);
  result.userData.stationPoster = true;
  return result;
}

/** Two grounded terracotta pots and flowering greenery, one static merged draw. */
export function createStationPosterPlanters() {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-4.2, 4.2]) {
    const x = -7.2;
    parts.push(
      colored(
        new THREE.LatheGeometry(
          [
            [0, 0.02],
            [0.2, 0.02],
            [0.24, 0.1],
            [0.31, 0.62],
            [0.33, 0.63],
            [0.33, 0.7],
            [0.29, 0.7],
            [0.28, 0.63],
          ].map((p) => new THREE.Vector2(...p)),
          16
        ).translate(x, 0, z),
        STATION_POSTER_PALETTE.terracotta
      )
    );
    parts.push(
      colored(new THREE.CylinderGeometry(0.28, 0.28, 0.025, 16).translate(x, 0.637, z), '#463826')
    );
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4,
        px = x + Math.cos(angle) * 0.16,
        pz = z + Math.sin(angle) * 0.16,
        top = 0.95 + (i % 3) * 0.065;
      parts.push(
        colored(
          new THREE.CylinderGeometry(0.008, 0.012, top - 0.65, 5).translate(
            px,
            (top + 0.65) / 2,
            pz
          ),
          '#426548'
        )
      );
      parts.push(
        colored(
          new THREE.SphereGeometry(1, 6, 4)
            .scale(0.13, 0.035, 0.07)
            .rotateZ(0.5)
            .rotateY(angle)
            .translate(px, top - 0.13, pz),
          '#4d7851'
        )
      );
      for (let petal = 0; petal < 5; petal++) {
        const a = petal * Math.PI * 0.4;
        parts.push(
          colored(
            new THREE.SphereGeometry(1, 6, 4)
              .scale(0.035, 0.018, 0.025)
              .rotateY(a)
              .translate(px + Math.cos(a) * 0.035, top, pz + Math.sin(a) * 0.035),
            i % 2 ? '#edaa56' : '#db7247'
          )
        );
      }
      parts.push(
        colored(new THREE.SphereGeometry(0.024, 6, 4).translate(px, top + 0.008, pz), '#e4bd6e')
      );
    }
  }
  return joined(parts);
}
export const STATION_POSTER_PLANTERS = createStationPosterPlanters();

// Explicit trade cloth, coordinated with the village's painted timber and slate.
// Produce, dairy, bakery and harvest share cream stripes and the original weave.
export const MARKET_CANVAS_COLOURS = ['#637b59', '#476975', '#912d26', '#9a703d'] as const;
const ORIGINAL_MARKET_RED = new THREE.Color('#912d26');

/** Recolour only the delivered red-cloth tile using linear vertex multipliers.
 * Working if every trade differs, the original weave/ORM remain visible, and
 * timber, cream stripes, positions, normals, indices and UVs stay unchanged.
 */
export function createMarketCanopyGeometry(source: THREE.BufferGeometry, dressing: number) {
  const uv = source.getAttribute('uv');
  if (!uv) return source;
  const geometry = source.clone();
  const colour =
    geometry.getAttribute('color')?.clone() ??
    new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3);
  const target = new THREE.Color(MARKET_CANVAS_COLOURS[dressing] ?? MARKET_CANVAS_COLOURS[2]);
  for (let i = 0; i < uv.count; i++) {
    // Actual six-column source atlas: red cloth is column 4, glTF row 2.
    if (Math.floor(uv.getX(i) * 6) !== 4 || Math.floor(uv.getY(i) * 6) !== 2) continue;
    colour.setXYZ(
      i,
      target.r / ORIGINAL_MARKET_RED.r,
      target.g / ORIGINAL_MARKET_RED.g,
      target.b / ORIGINAL_MARKET_RED.b
    );
  }
  geometry.setAttribute('color', colour);
  return geometry;
}

function marketTrim(canvas: string = MARKET_CANVAS_COLOURS[2]) {
  const parts: THREE.BufferGeometry[] = [];
  // The delivered straight hem spans y=1.8528..1.958. Extend below it by only
  // 58 mm, with 6 mm of buried overlap, and retain its ten baked stripe widths.
  for (let i = 0; i < 10; i++) {
    const center = -1.4 + (i + 0.5) * 0.28;
    const shape = new THREE.Shape();
    shape.moveTo(center - 0.1395, 1.859);
    shape.lineTo(center + 0.1395, 1.859);
    for (let j = 0; j <= 8; j++) {
      const angle = (j / 8) * Math.PI;
      shape.lineTo(center + Math.cos(angle) * 0.1395, 1.835 - Math.sin(angle) * 0.04);
    }
    shape.closePath();
    for (const side of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: 0.016,
        steps: 1,
        bevelEnabled: false,
        curveSegments: 1,
      });
      g.rotateY(Math.PI / 2).translate(side > 0 ? 0.762 : -0.778, 0, 0);
      parts.push(colored(g, i % 2 ? '#dac99d' : canvas));
    }
  }
  // Actual posts x=+/-0.533, z=+/-1.17, counter underside y=0.8215.
  // Knees run along the long sides, clear of the existing end crossbraces.
  for (const x of [-0.533, 0.533]) {
    for (const side of [-1, 1]) {
      parts.push(
        colored(
          beam(
            new THREE.Vector3(x, 0.57, side * 1.17),
            new THREE.Vector3(x, 0.818, side * 0.91),
            0.06
          ),
          '#624129'
        )
      );
    }
  }
  return joined(parts);
}

export const FOUNTAIN_SETT_TOP =
  (EXTERIOR_LAYERS.ground + 0.002) / SITE_LAYOUT.landmarks.village.scale;

function fountainSetts() {
  const parts: THREE.BufferGeometry[] = [];
  // Foot r=1.43 at y=0, with Z scaled by 3.18/3.145. Bury the inner edge
  // beneath that foot; a single 22 cm course stays inside the existing plaza.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + 0.004;
    const b = ((i + 1) / 36) * Math.PI * 2 - 0.004;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(a) * 1.428, Math.sin(a) * 1.428);
    shape.lineTo(Math.cos(a) * 1.65, Math.sin(a) * 1.65);
    shape.absarc(0, 0, 1.65, a, b, false);
    shape.lineTo(Math.cos(b) * 1.428, Math.sin(b) * 1.428);
    shape.absarc(0, 0, 1.428, b, a, true);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.025,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 1,
    });
    g.rotateX(-Math.PI / 2)
      .scale(1, 1, 3.18 / 3.145)
      .translate(0, FOUNTAIN_SETT_TOP - 0.025, 0);
    parts.push(colored(g, ['#777d71', '#858779', '#919182'][i % 3]));
  }
  return joined(parts);
}

function fenceStraps() {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.72, 0.72]) {
    for (const y of [0.28, 0.59, 0.87]) {
      // Match the eight-sided post's linear taper, with 1 mm of iron proud of
      // timber. A solid hidden core keeps the exposed band closed and cheap.
      const r = (height: number) => 0.098 - height * 0.011 + 0.001;
      const g = new THREE.CylinderGeometry(r(y + 0.035), r(y - 0.035), 0.07, 8);
      parts.push(colored(g.translate(x, y, 0), '#262f2d'));
      for (const side of [-1, 1]) {
        // The existing wooden peg projects to z=.094. A seated dark head
        // covers it, its shank enters the band, and the panel stays <=.098 deep.
        const bolt = new THREE.CylinderGeometry(0.016, 0.016, 0.018, 8);
        bolt.rotateX(Math.PI / 2).translate(x, y, side * 0.0885);
        parts.push(colored(bolt, '#49534f'));
      }
    }
  }
  return joined(parts);
}

function troughRim() {
  const parts: THREE.BufferGeometry[] = [];
  // The source has long rim rails at .542, end boards at .4735, water at .427.
  // Follow that stepped joinery, embedding the lower half of each 12 mm roll.
  for (const side of [-1, 1]) {
    parts.push(
      colored(
        beam(
          new THREE.Vector3(-0.738, 0.53, side * 0.258),
          new THREE.Vector3(0.738, 0.53, side * 0.258),
          0.012,
          true
        ),
        '#785335'
      )
    );
    parts.push(
      colored(
        beam(
          new THREE.Vector3(side * 0.738, 0.4615, -0.258),
          new THREE.Vector3(side * 0.738, 0.4615, 0.258),
          0.012,
          true
        ),
        '#785335'
      )
    );
    for (const end of [-1, 1]) {
      parts.push(
        colored(
          beam(
            new THREE.Vector3(side * 0.738, 0.4615, end * 0.258),
            new THREE.Vector3(side * 0.738, 0.53, end * 0.258),
            0.012,
            true
          ),
          '#785335'
        )
      );
    }
  }
  return joined(parts);
}

export const AUTHORED_PROP_TRIM = {
  market: marketTrim(),
  fountain: fountainSetts(),
  fence: fenceStraps(),
  trough: troughRim(),
};
export const AUTHORED_MARKET_TRIM_VARIANTS = MARKET_CANVAS_COLOURS.map((colour, trade) =>
  trade === 2 ? AUTHORED_PROP_TRIM.market : marketTrim(colour)
);
const TRIM_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });

// The cobbles draw in the transparent pass with a -2 depth bias. Physical
// clearance of 2 mm alone loses to that bias at the far camera. Give only this
// flush stone course the existing exterior-overlay layer, with depth writes so
// the later cobble fragments cannot paint over it. Keep the physical top fixed.
// Working if biased cobble depth remains behind the setts after material cloning.
export const FOUNTAIN_SETT_DEPTH_LAYER = POLYGON_OFFSET.exteriorOverlay;
export const AUTHORED_PROP_TRIM_MATERIALS = {
  market: TRIM_MATERIAL,
  fence: TRIM_MATERIAL,
  trough: TRIM_MATERIAL,
  fountain: new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: FOUNTAIN_SETT_DEPTH_LAYER.factor,
    polygonOffsetUnits: FOUNTAIN_SETT_DEPTH_LAYER.units,
    depthTest: true,
    depthWrite: true,
  }),
};

export const AuthoredPropTrim = React.memo<{
  kind: keyof typeof AUTHORED_PROP_TRIM;
  dressing?: number;
}>(({ kind, dressing }) => (
  <mesh
    geometry={
      kind === 'market' && dressing !== undefined
        ? (AUTHORED_MARKET_TRIM_VARIANTS[dressing] ?? AUTHORED_PROP_TRIM.market)
        : AUTHORED_PROP_TRIM[kind]
    }
    material={AUTHORED_PROP_TRIM_MATERIALS[kind]}
    receiveShadow
    castShadow={kind !== 'fountain'}
  />
));
AuthoredPropTrim.displayName = 'AuthoredPropTrim';

/** Literal identities of the four authored stock dressings, never prices or
 * earned inventory. Working if each actual pitch keeps its own trade name.
 */
export const MARKET_TRADE_NAMES = ['Greengrocer', 'Cheesemonger', 'Bread & Rolls', 'Farm Harvest'];
// Working if the raster identity follows the actual stock dressing, one to one.
export const MARKET_TRADE_BRANDS = [
  'greengrocer',
  'cheesemonger',
  'breadRolls',
  'harvest',
] as const;
// Measured delivered central tray, front +X: x=.5134, y=.9297..1.104, z=+/- .322.
// One millimetre of paint stand-off and clear margins retain the source board.
export const MARKET_TRADE_PAINT = {
  position: [0.5144, 1.016, 0] as [number, number, number],
  rotation: [0, Math.PI / 2, 0] as [number, number, number],
  fontSize: 0.061,
  maxWidth: 0.59,
  height: 0.15,
  color: '#243e37',
  outlineWidth: 0.0012,
};

/** Three tray floors on the delivered structural stall. Each trade owns its
 * complete stock, instead of overlaying different goods on baked green spheres.
 * Working if every visible product is seated above this measured surface and
 * all four stock meshes have distinct geometry while staying under the canvas.
 */
export const MARKET_TRAY_FLOOR = 0.9422;
// Shared rind atlas: sRGB albedo, linear height/roughness. The reserved white
// corner keeps bread, stems, trays and other trades unchanged in the same draw.
// Working if only fruit UVs reach the mottled patch and all surfaces stay batched.
// Three 68 x 24 px finish islands in the formerly unused top strip. Four-pixel
// gutters retain the exact white corner; the original fruit rectangle is untouched.
// Working if food UVs remain inside their island and fruit bytes remain exact.
export const MARKET_FOOD_TILES = {
  crust: [36, 104],
  leaf: [110, 178],
  rind: [184, 252],
} as const;
export const MARKET_FRUIT_TEXTURES = (() => {
  const size = 256,
    colour = new Uint8Array(size * size * 4),
    finish = new Uint8Array(colour.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        u = (x - 32) / 223,
        v = (y - 32) / 223;
      const cellX = Math.floor(u * 8),
        cellY = Math.floor(v * 6);
      const seed = Math.sin(cellX * 127.1 + cellY * 311.7) * 43758.5453;
      const chosen = seed - Math.floor(seed);
      // Broad irregular russet patches survive the close-view mip instead of
      // disappearing as sub-pixel pinpricks. Fine pores stay in the height map.
      // Working if close fruit has visible peel detail and the white corner stays exact.
      const spot = chosen > 0.67 && Math.hypot(u * 8 - cellX - 0.5, v * 6 - cellY - 0.5) < 0.22;
      const blush = 0.5 + 0.5 * Math.sin(u * Math.PI * 6 + Math.sin(v * Math.PI * 4));
      const grain = Math.sin(u * Math.PI * 78) * Math.sin(v * Math.PI * 66);
      const reserved = x < 32 || y < 32;
      colour.set(
        reserved
          ? [255, 255, 255, 255]
          : [
              Math.round(226 + blush * 29 - (spot ? 42 : 0)),
              Math.round(220 + blush * 32 - (spot ? 47 : 0)),
              Math.round(204 + blush * 48 - (spot ? 46 : 0)),
              255,
            ],
        i
      );
      const roughness = Math.round(142 + blush * 28 + (spot ? 24 : 0));
      finish.set(
        reserved
          ? [128, 214, 214, 255]
          : [Math.round(128 + grain * 9 - (spot ? 12 : 0)), roughness, roughness, 255],
        i
      );
    }
  for (const [kind, [left, right]] of Object.entries(MARKET_FOOD_TILES)) {
    for (let y = 0; y < 32; y++)
      for (let x = left - 3; x < Math.min(size, right + 3); x++) {
        // Extend edge texels into each gutter, avoiding dark atlas seams.
        const u = (THREE.MathUtils.clamp(x, left, right - 1) - left) / (right - left - 1);
        const v = (THREE.MathUtils.clamp(y, 4, 27) - 4) / 23;
        const patch = 0.5 + 0.5 * Math.sin(u * 18 + Math.sin(v * 9)) * Math.cos(v * 13);
        const vein = Math.exp(-Math.abs(Math.sin(u * 9 + Math.sin(v * 6) * 0.45)) * 5);
        const crust = kind === 'crust',
          leaf = kind === 'leaf';
        // Broad flouring and toasted seams read at the real 68x24px island size.
        // Working if close bread has warm crust and dry flour patches without
        // touching the fruit rectangle, neutral corner or atlas/geometry budget.
        const flour = crust
          ? THREE.MathUtils.smoothstep(
              Math.sin(u * 12 + Math.sin(v * 5) * 0.9) * Math.cos(v * 7),
              0.12,
              0.72
            ) * 0.52
          : 0;
        const tone = leaf ? 229 + vein * 26 : crust ? 231 + patch * 24 : 239 + patch * 16;
        const i = (y * size + x) * 4;
        colour.set(
          [
            Math.round(tone),
            Math.round(tone - (crust ? 9 * (1 - flour) : 0)),
            Math.round(tone - (crust ? 18 * (1 - flour) : leaf ? 3 : 8)),
            255,
          ],
          i
        );
        const roughness = Math.round(
          leaf ? 213 - vein * 15 : crust ? 240 - patch * 10 + flour * 10 : 188 - patch * 12
        );
        finish.set(
          [Math.round(128 + (leaf ? vein * 5 : (patch - 0.5) * 9)), roughness, roughness, 255],
          i
        );
      }
  }
  return {
    colour: createColorDataTexture(colour, size, size),
    finish: createLinearDataTexture(finish, size, size),
  };
})();
export const MARKET_GOODS_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  map: MARKET_FRUIT_TEXTURES.colour,
  roughness: 1,
  roughnessMap: MARKET_FRUIT_TEXTURES.finish,
  bumpMap: MARKET_FRUIT_TEXTURES.finish,
  bumpScale: 0.0012,
  metalness: 0,
});
function marketGoods(trade: number) {
  const parts: THREE.BufferGeometry[] = [];
  const put = (
    g: THREE.BufferGeometry,
    color: string,
    x: number,
    z: number,
    lift = 0,
    rind = false
  ) => {
    g.computeBoundingBox();
    g.translate(x, MARKET_TRAY_FLOOR - g.boundingBox!.min.y + lift, z);
    g.userData.marketFruit = rind;
    parts.push(colored(g, color));
  };
  // Finish the existing food surface through its shared colour attribute.
  // Working if crust, leaves and rind vary while neutral UVs, stock shapes and
  // all baked caster triangles stay exact; no texture or draw is added.
  const foodFinish = (
    g: THREE.BufferGeometry,
    lower: string,
    upper: string,
    finish: keyof typeof MARKET_FOOD_TILES
  ) => {
    g.userData.marketFood = finish;
    g.computeBoundingBox();
    const p = g.getAttribute('position'),
      colours = g.getAttribute('color'),
      normals = g.getAttribute('normal');
    const flourColour = new THREE.Color('#e4d5b5');
    const low = new THREE.Color(lower),
      high = new THREE.Color(upper),
      shade = low.clone();
    const box = g.boundingBox!,
      span = Math.max(0.001, box.max.y - box.min.y);
    for (let i = 0; i < p.count; i++) {
      const height = (p.getY(i) - box.min.y) / span;
      const grain =
        Math.sin(p.getX(i) * 29 + p.getZ(i) * 41) * Math.cos(p.getZ(i) * 31 - p.getX(i) * 13);
      const mix = THREE.MathUtils.clamp(
        0.12 + THREE.MathUtils.smoothstep(height, 0.1, 0.95) * 0.8 + grain * 0.045,
        0,
        1
      );
      shade.copy(low).lerp(high, mix);
      if (finish === 'crust') {
        // Flour settles on the crown in irregular patches, leaving toasted
        // flanks and scoring readable. Existing linear vertex colour carries it.
        // Working if bread has pale broad patches with unchanged tray contact.
        const patch =
          Math.sin(p.getX(i) * 38 + p.getZ(i) * 21) * Math.cos(p.getZ(i) * 35 - p.getX(i) * 17);
        const flour =
          THREE.MathUtils.smoothstep(patch, -0.1, 0.7) *
          THREE.MathUtils.smoothstep(normals.getY(i), 0.1, 0.8) *
          THREE.MathUtils.smoothstep(height, 0.45, 0.8) *
          0.65;
        shade.lerp(flourColour, flour);
      }
      colours.setXYZ(i, shade.r, shade.g, shade.b);
    }
  };
  const curve = (points: [number, number, number][], width: number, color: string) => {
    parts.push(
      colored(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
          8,
          width,
          5,
          false
        ),
        color
      )
    );
  };
  const profile = (points: [number, number][]) =>
    new THREE.LatheGeometry(
      points.map((p) => new THREE.Vector2(...p)),
      16
    );
  const fruit = (x: number, z: number, r: number, color: string, lobes = 5, pumpkin = false) => {
    const g = new THREE.SphereGeometry(1, 16, 12),
      p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const swell = 1 + (pumpkin ? 0.14 : 0.035) * Math.cos(a * lobes) * (1 - p.getY(i) ** 2);
      p.setXYZ(
        i,
        p.getX(i) * r * swell,
        p.getY(i) * r * (pumpkin ? 0.78 : 0.92),
        p.getZ(i) * r * swell
      );
    }
    g.computeVertexNormals();
    put(g, color, x, z, 0, true);
    if (!pumpkin) {
      // Ripening belongs to each apple, rather than a whole-stall tint. The
      // existing colour attribute carries a seeded sun-side blush with no new
      // geometry, texture, shader or shadow caster. All tray contacts stay exact.
      // Working if green, russet and red apples retain individual peel variation.
      const uv = g.getAttribute('uv');
      const colours = g.getAttribute('color');
      const base = new THREE.Color(color);
      const blush = new THREE.Color(x === 0 ? '#c27a43' : '#ce7d50');
      const shade = base.clone();
      for (let i = 0; i < uv.count; i++) {
        const side = Math.max(0, Math.cos(uv.getX(i) * Math.PI * 2 + x * 11.1 + z * 7.3));
        const ripeness = side ** 3 * THREE.MathUtils.smoothstep(uv.getY(i), 0.18, 0.92) * 0.35;
        shade.copy(base).lerp(blush, ripeness);
        colours.setXYZ(i, shade.r, shade.g, shade.b);
      }
    }
    const y = MARKET_TRAY_FLOOR + 2 * r * (pumpkin ? 0.78 : 0.92) - 0.012;
    curve(
      [
        [x, y, z],
        [x + 0.007, y + 0.037, z],
        [x + 0.017, y + 0.061, z + 0.009],
      ],
      pumpkin ? 0.012 : 0.005,
      '#5c6332'
    );
    if (!pumpkin) {
      const leaf = new THREE.SphereGeometry(1, 8, 6);
      leaf
        .scale(0.028, 0.005, 0.012)
        .rotateY(0.6)
        .translate(x + 0.017, y + 0.024, z);
      parts.push(colored(leaf, '#698448'));
    }
  };
  const cabbage = (x: number, z: number, r: number) => {
    const core = new THREE.SphereGeometry(r, 14, 10);
    put(core, '#879752', x, z);
    foodFinish(core, '#5b7149', '#a2b079', 'leaf');
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const g = new THREE.SphereGeometry(r * 1.03, 10, 7, -0.52, 1.04, 0.65, 1.65);
      g.rotateY(angle).translate(x, MARKET_TRAY_FLOOR + r, z);
      parts.push(colored(g, i % 2 ? '#738449' : '#9ca66b'));
      foodFinish(g, i % 2 ? '#516342' : '#657c4a', '#a3b17c', 'leaf');
      const pts: [number, number, number][] = [];
      for (let j = 0; j <= 6; j++) {
        const t = 0.69 + j * 0.21;
        pts.push([
          x + Math.sin(angle) * Math.sin(t) * r * 1.041,
          MARKET_TRAY_FLOOR + r + Math.cos(t) * r * 1.041,
          z + Math.cos(angle) * Math.sin(t) * r * 1.041,
        ]);
      }
      curve(pts, 0.0023, '#c1bf86');
    }
  };
  const wheel = (x: number, z: number, r: number, lift = 0) => {
    const body = profile([
      [0, 0],
      [r * 0.94, 0],
      [r, 0.01],
      [r, 0.102],
      [r * 0.94, 0.115],
      [0, 0.115],
    ]);
    put(body, '#c49a48', x, z, lift);
    foodFinish(body, '#ac7d39', '#dfc78a', 'rind');
    // The wax band stands 4 mm proud of the rind facets; at 0.5% of the radius
    // (0.75-1 mm) the two shared each facet's depth in this one draw.
    const band = new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.044, 16, 1, true);
    band.translate(x, MARKET_TRAY_FLOOR + lift + 0.056, z);
    parts.push(colored(band, '#debf77'));
    band.userData.marketFood = 'rind';
  };
  const loaf = (x: number, z: number, round = false) => {
    const r = round ? 0.084 : 0.092;
    const g = round
      ? new THREE.SphereGeometry(r, 12, 8)
      : new THREE.CapsuleGeometry(r, 0.096, 5, 12).rotateX(Math.PI / 2);
    g.scale(1, 0.78, 1);
    put(g, round ? '#b98851' : '#ae7640', x, z);
    foodFinish(g, round ? '#996334' : '#88532c', round ? '#d1ac74' : '#c79c64', 'crust');
    const top = MARKET_TRAY_FLOOR + r * 1.56;
    for (const dz of round ? [0] : [-0.065, 0.025, 0.1]) {
      const pts: [number, number, number][] = [];
      for (let j = 0; j <= 6; j++) {
        const dx = -r * 0.71 + (j * r * 1.42) / 6;
        const h = Math.sqrt(Math.max(0, r * r - dx * dx)) * 0.78;
        pts.push([x + dx, top - r * 0.78 + h + 0.002, z + dz + dx * 0.3]);
      }
      curve(pts, 0.008, '#e0be80');
    }
  };
  if (trade === 0) {
    for (const x of [-0.3, 0, 0.3])
      for (const dz of [-0.135, 0.135]) {
        const colour =
          x < 0
            ? dz < 0
              ? '#aa432f'
              : '#b9563a'
            : x === 0
              ? dz < 0
                ? '#8e9e4b'
                : '#a4ab61'
              : dz < 0
                ? '#a98946'
                : '#ba9954';
        fruit(x, -0.83 + dz, 0.116, colour);
      }
    for (const z of [0, 0.83])
      for (const x of [-0.29, 0, 0.29]) for (const dz of [-0.14, 0.14]) cabbage(x, z + dz, 0.116);
  } else if (trade === 1) {
    wheel(-0.2, -0.83, 0.21);
    wheel(-0.2, -0.83, 0.19, 0.115);
    wheel(0.23, -0.96, 0.15);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.235, 0);
    shape.absarc(0, 0, 0.235, 0, 1.45, false);
    shape.closePath();
    for (const [x, z] of [
      [0.13, -0.65],
      [-0.3, 0.02],
      [0.16, 0.06],
    ]) {
      const wedge = new THREE.ExtrudeGeometry(shape, {
        depth: 0.105,
        bevelEnabled: true,
        bevelSize: 0.003,
        bevelThickness: 0.003,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 8,
      });
      wedge.rotateX(-Math.PI / 2);
      put(wedge, '#dfbd69', x, z);
      foodFinish(wedge, '#c6a054', '#ead197', 'rind');
      // Wedge tops sit 4 mm under the 0.115 m wheel top the first wedge cuts
      // into; the eyes are studs 3 mm proud of the cut face, not discs in it.
      for (let j = 0; j < 3; j++) {
        const radius = 0.009 + j * 0.002;
        const dot = new THREE.CylinderGeometry(radius, radius, 0.006, 8).translate(
          x + 0.06 + j * 0.049,
          MARKET_TRAY_FLOOR + 0.111,
          z - 0.032 - j * 0.02
        );
        parts.push(colored(dot, '#b99246'));
      }
    }
    for (const x of [-0.28, 0, 0.28])
      for (const z of [0.7, 0.98]) {
        put(new THREE.SphereGeometry(1, 12, 8).scale(0.105, 0.055, 0.105), '#d6cdad', x, z);
        for (const a of [0, Math.PI / 2]) {
          const rope = new THREE.TorusGeometry(1, 0.035, 4, 16);
          rope
            .scale(0.101, 0.055, 0.101)
            .rotateY(a)
            .translate(x, MARKET_TRAY_FLOOR + 0.057, z);
          parts.push(colored(rope, '#81623c'));
        }
      }
  } else if (trade === 2) {
    for (const x of [-0.3, 0, 0.3]) for (const z of [-0.978, -0.681]) loaf(x, z);
    for (const x of [-0.32, -0.11, 0.11, 0.32]) for (const z of [-0.14, 0.14]) loaf(x, z, true);
    put(
      profile([
        [0, 0],
        [0.11, 0],
        [0.145, 0.05],
        [0.135, 0.2],
        [0.1, 0.31],
        [0.052, 0.355],
        [0.037, 0.39],
        [0.076, 0.43],
        [0, 0.445],
      ]),
      '#c9bb98',
      0.17,
      0.83
    );
    const tie = new THREE.TorusGeometry(0.05, 0.009, 5, 16)
      .rotateX(Math.PI / 2)
      .translate(0.17, MARKET_TRAY_FLOOR + 0.36, 0.83);
    parts.push(colored(tie, '#826a42'));
    for (const z of [0.68, 0.97]) loaf(-0.22, z, true);
  } else {
    fruit(-0.23, -0.84, 0.197, '#c58237', 9, true);
    fruit(0.24, -0.87, 0.175, '#a86431', 8, true);
    for (const [x, z] of [
      [-0.25, -0.13],
      [0.17, 0.12],
    ]) {
      put(
        profile([
          [0, 0],
          [0.08, 0],
          [0.12, 0.047],
          [0.123, 0.12],
          [0.08, 0.185],
          [0.047, 0.25],
          [0.042, 0.3],
          [0.03, 0.323],
          [0, 0.33],
        ]),
        '#c7b16a',
        x,
        z
      );
      curve(
        [
          [x, MARKET_TRAY_FLOOR + 0.32, z],
          [x - 0.008, MARKET_TRAY_FLOOR + 0.35, z + 0.007],
        ],
        0.008,
        '#5a6234'
      );
    }
    for (const x of [-0.3, 0, 0.3])
      for (const z of [0.7, 0.98]) {
        put(
          profile([
            [0, 0],
            [0.061, 0],
            [0.087, 0.04],
            [0.08, 0.105],
            [0.039, 0.18],
            [0.026, 0.216],
            [0, 0.226],
          ]),
          '#a0a154',
          x,
          z,
          0,
          true
        );
        curve(
          [
            [x, MARKET_TRAY_FLOOR + 0.216, z],
            [x + 0.008, MARKET_TRAY_FLOOR + 0.252, z],
          ],
          0.0045,
          '#635334'
        );
      }
  }
  for (const part of parts) {
    const uv = part.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      if (part.userData.marketFruit)
        uv.setXY(i, 0.125 + uv.getX(i) * 0.871, 0.125 + uv.getY(i) * 0.871);
      else if (part.userData.marketFood) {
        const [left, right] =
          MARKET_FOOD_TILES[part.userData.marketFood as keyof typeof MARKET_FOOD_TILES];
        uv.setXY(
          i,
          (left + 0.5 + THREE.MathUtils.clamp(uv.getX(i), 0, 1) * (right - left - 1)) / 256,
          (4.5 + THREE.MathUtils.clamp(uv.getY(i), 0, 1) * 23) / 256
        );
      } else uv.setXY(i, 0.03125, 0.03125);
    }
  }
  return joined(parts);
}
export const AUTHORED_MARKET_GOODS = [0, 1, 2, 3].map(marketGoods);
export const MarketGoods = React.memo<{ dressing: number }>(({ dressing }) => (
  <mesh
    name={`market-trade-${dressing}`}
    geometry={AUTHORED_MARKET_GOODS[((dressing % 4) + 4) % 4]}
    material={MARKET_GOODS_MATERIAL}
    castShadow
    receiveShadow
  />
));
MarketGoods.displayName = 'MarketGoods';

/** Joinery in the delivered lock's live coordinates. The retained GLB has its
 * leaf faces at z=+/-0.15, y=-0.75..1.75 and x=+/-0.1..4.9. Geometry overlays
 * stay clear of the centre seam and the original 3 m-high walkway.
 */
export function createLockGateJoinery() {
  const parts: THREE.BufferGeometry[] = [];
  const box = (
    size: [number, number, number],
    position: [number, number, number],
    hex: string,
    board?: number
  ) => {
    const geometry = colored(new THREE.BoxGeometry(...size).translate(...position), hex);
    geometry.userData.board = board;
    parts.push(geometry);
  };
  for (const side of [-1, 1]) {
    const cx = side * 2.5;
    for (const face of [-1, 1]) {
      // Separate planks retain hairline dark joints and varied exposed timber.
      for (let i = 0; i < 12; i++) {
        const x = cx - 2.4 + (i + 0.5) * 0.4;
        const tint = new THREE.Color('#aa9272').multiplyScalar(
          0.88 + 0.12 * Math.sin(i * 2.3) ** 2
        );
        box([0.386, 2.47, 0.028], [x, 0.5, face * 0.161], `#${tint.getHexString()}`, i % 7);
        box([0.008, 2.43, 0.009], [x - 0.179, 0.5, face * 0.18], '#b39770');
      }
      for (const y of [0.35, 1.25]) {
        box([4.65, 0.16, 0.072], [cx, y, face * 0.205], '#353f40');
        for (const offset of [-2.14, 0, 2.14]) {
          const bolt = new THREE.CylinderGeometry(0.045, 0.045, 0.033, 6)
            .rotateX(Math.PI / 2)
            .translate(cx + offset, y, face * 0.258);
          parts.push(colored(bolt, '#988066'));
        }
      }
      for (const y of [0.35, 1.25])
        box([0.24, 0.38, 0.095], [side * 4.77, y, face * 0.221], '#30393b');
    }
    // Paddle screw housings are attached to the top leaf rail. A fixed visual
    // mechanism, not a claim that this existing static lock can be operated.
    box([0.33, 0.48, 0.4], [cx, 1.74, 0], '#394448');
    const spindle = new THREE.CylinderGeometry(0.038, 0.038, 0.61, 8).translate(cx, 2.02, 0);
    parts.push(colored(spindle, '#9a866b'));
    for (let i = 0; i < 7; i++) {
      const thread = new THREE.TorusGeometry(0.044, 0.012, 4, 8)
        .rotateX(Math.PI / 2)
        .translate(cx, 1.96 + i * 0.05, 0);
      parts.push(colored(thread, '#645b4b'));
    }
    const wheel = new THREE.TorusGeometry(0.25, 0.033, 6, 20)
      .rotateX(Math.PI / 2)
      .translate(cx, 2.32, 0);
    parts.push(colored(wheel, '#303b3d'));
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      parts.push(
        colored(
          beam(
            new THREE.Vector3(cx, 2.32, 0),
            new THREE.Vector3(cx + Math.cos(a) * 0.25, 2.32, Math.sin(a) * 0.25),
            0.035
          ),
          '#303b3d'
        )
      );
    }
  }
  for (const part of parts) {
    const uv = part.getAttribute('uv');
    const board = part.userData.board as number | undefined;
    for (let i = 0; i < uv.count; i++) {
      // Keep a 3 px gutter around every atlas tile, including the metal tile.
      uv.setXY(i, ((board ?? 7) * 64 + 3 + uv.getX(i) * 57) / 512, (3 + uv.getY(i) * 249) / 256);
    }
  }
  return joined(parts);
}
export const LOCK_GATE_JOINERY = createLockGateJoinery();
export const LockGateJoinery = React.memo(() => (
  <mesh
    name="lock-gate-oak-and-iron-joinery"
    geometry={LOCK_GATE_JOINERY}
    material={LOCK_GATE_MATERIAL}
    castShadow
    receiveShadow={false}
  />
));
LockGateJoinery.displayName = 'LockGateJoinery';

/** Lock-upright fittings light the real oak leaves and paddle wheels.
 * Working if the clear-noon sources are off, both leaves read at night, and
 * the crossing and single celestial shadow-map budget remain unchanged.
 */
export const LOCK_GATE_LAMPS = [-1, 1].map((side) => ({
  id: side < 0 ? 'west' : 'east',
  post: [side * 5.3, 3, 0] as [number, number, number],
  source: [side * 5.3, 3.8, 0.74] as [number, number, number],
}));
export const LOCK_GATE_LIGHT = { intensity: 72, distance: 8.5, color: '#ffe0a0' } as const;

export function createLockLampHousing() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (size: [number, number, number], at: [number, number, number], color: string) =>
    parts.push(colored(new THREE.BoxGeometry(...size).translate(...at), color));
  // Plate and stand-off seat below the deck on the actual post face. The stalk and hood sit
  // outside the deck's +/-0.5 m strip, leaving the central crossing clear.
  add([0.18, 0.16, 0.065], [0, -0.18, 0.2825], '#46514b');
  add([0.058, 0.058, 0.4], [0, -0.14, 0.5], '#46514b');
  add([0.058, 0.94, 0.058], [0, 0.33, 0.7], '#46514b');
  add([0.058, 0.058, 0.1], [0, 0.83, 0.7], '#46514b');
  add([0.48, 0.11, 0.38], [0, 0.875, 0.74], '#34443d');
  add([0.5, 0.035, 0.4], [0, 0.935, 0.74], '#8a795f');
  return joined(parts);
}
export const LOCK_LAMP_HOUSING = createLockLampHousing();
const LOCK_LAMP_FRAME = new THREE.MeshStandardMaterial({
  name: 'lock-shielded-lamp-housing',
  vertexColors: true,
  roughness: 0.64,
  metalness: 0.32,
});
const LOCK_LAMP_LENS = new THREE.BoxGeometry(0.38, 0.012, 0.24);

export const LockGateLighting = React.memo(() => {
  const disabled = useGraphicsStore((s) => s.graphics.perfDebug.disableLightingPolish);
  return (
    <group name="lock-gate-shielded-lighting">
      {LOCK_GATE_LAMPS.map((lamp) => (
        <React.Fragment key={lamp.id}>
          <mesh
            position={lamp.post}
            geometry={LOCK_LAMP_HOUSING}
            material={LOCK_LAMP_FRAME}
            castShadow
            receiveShadow
          />
          <mesh
            position={lamp.source}
            geometry={LOCK_LAMP_LENS}
            material={EXTERIOR_LAMP_LENS_MATERIAL}
          />
          <ExteriorDownlight
            name={`lock-gate-task-lamp:${lamp.id}`}
            position={lamp.source}
            intensity={disabled ? 0 : LOCK_GATE_LIGHT.intensity}
            distance={LOCK_GATE_LIGHT.distance}
            color={LOCK_GATE_LIGHT.color}
          />
        </React.Fragment>
      ))}
    </group>
  );
});
LockGateLighting.displayName = 'LockGateLighting';

/** Open bronze frame in bow-lantern local metres. Existing bracket/contact and
 * light are retained. Working if the central window has no metal hit, corner
 * uprights enter both caps, and the forward/down beam clears the whole frame.
 */
export function createCanalBoatLanternHousing() {
  const bronze = '#907344',
    iron = '#354443';
  const parts: THREE.BufferGeometry[] = [
    colored(new RoundedBoxGeometry(0.2, 0.025, 0.2, 2, 0.009).translate(0, -0.1375, 0), bronze),
    colored(new RoundedBoxGeometry(0.2, 0.045, 0.2, 2, 0.018).translate(0, 0.1275, 0), bronze),
    colored(new THREE.BoxGeometry(0.06, 0.06, 0.36).translate(...CANAL_BOAT_LANTERN.bracket), iron),
  ];
  for (const x of [-0.09, 0.09])
    for (const z of [-0.09, 0.09])
      parts.push(
        colored(new THREE.CylinderGeometry(0.009, 0.011, 0.24, 8).translate(x, -0.005, z), bronze)
      );
  return joined(parts);
}
export const CANAL_BOAT_LANTERN_HOUSING = createCanalBoatLanternHousing();
export const CANAL_BOAT_LANTERN_METAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.48,
  metalness: 0.55,
});

/** Measured gambrel profile in the delivered barn's rest coordinates. */
const BARN_ROOF_PROFILE = [
  [0, 0.303],
  [0.213, 0.232],
  [0.338, 0.004],
  [0.463, -0.115],
];
const barnRoofHeight = (position: number) => {
  const x = Math.abs(position),
    profile = BARN_ROOF_PROFILE;
  for (let i = 1; i < profile.length; i++) {
    const [a, y] = profile[i - 1],
      [b, top] = profile[i];
    if (x <= b) return y + ((top - y) * (x - a)) / (b - a);
  }
  return -0.115;
};

/** Rebuild only the old barn walls/joinery, below the retained crafted roof.
 * Source dimensions precede the existing 10.0076m node scale. Replace the
 * nonplanar old loft faces with a clean inset behind the new timber braces.
 * Working if this remains one owned draw below the old triangle count, with
 * source roof/cupola/floor triangles and all loader maps unchanged.
 */
export function createBarnJoineryGeometry(source: THREE.BufferGeometry) {
  const position = source.getAttribute('position'),
    normal = source.getAttribute('normal'),
    uv = source.getAttribute('uv');
  if (!position || !normal || !uv) return source;
  const indices = source.index;
  const retained: number[] = [],
    sourceFaces: number[] = [];
  let loftFaces = 0;
  const count = indices ? indices.count : position.count;
  for (let face = 0; face < count / 3; face++) {
    const ids = [0, 1, 2].map((c) => (indices ? indices.getX(face * 3 + c) : face * 3 + c));
    const centre = [0, 1, 2].map(
      (c) => ids.reduce((v, i) => v + position.getComponent(i, c), 0) / 3
    );
    const [x, y, z] = centre;
    const loft = Math.abs(x) < 0.12 && y > -0.08 && y < 0.09 && z > 0.36 && z < 0.375;
    if (loft) loftFaces++;
    if (y < -0.482 || y >= barnRoofHeight(x) - 0.016) {
      retained.push(...ids);
      sourceFaces.push(face);
    }
  }
  // A fallback fixture or future different asset has no matching source loft.
  // Leave it alone rather than attaching a construction kit to the wrong body.
  if (loftFaces < 2 || sourceFaces.length < 100 || count / 3 - sourceFaces.length < 1000)
    return source;
  const kept = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = source.getAttribute(name),
      values: number[] = [];
    for (const i of retained)
      for (let c = 0; c < a.itemSize; c++) values.push(a.getComponent(i, c));
    kept.setAttribute(name, new THREE.Float32BufferAttribute(values, a.itemSize));
  }
  colored(kept, '#ffffff');
  const parts = [kept];
  // Delivered atlas pixels724..740,260..276 are neutral paint, with near-flat
  // normals. Linear multipliers retain that restrained grain on the new wood.
  const swatch = new THREE.Color().setRGB(0.80292586, 0.80602022, 0.8029565, THREE.SRGBColorSpace);
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    colored(g, hex);
    const colour = g.getAttribute('color'),
      tex = g.getAttribute('uv');
    const bounds = new THREE.Box2();
    for (let i = 0; i < tex.count; i++)
      bounds.expandByPoint(new THREE.Vector2(tex.getX(i), tex.getY(i)));
    const size = bounds.getSize(new THREE.Vector2());
    for (let i = 0; i < colour.count; i++) {
      colour.setXYZ(
        i,
        colour.getX(i) / swatch.r,
        colour.getY(i) / swatch.g,
        colour.getZ(i) / swatch.b
      );
      tex.setXY(
        i,
        (724.5 + ((tex.getX(i) - bounds.min.x) / Math.max(size.x, 1e-6)) * 15) / 1024,
        (260.5 + ((tex.getY(i) - bounds.min.y) / Math.max(size.y, 1e-6)) * 15) / 1024
      );
    }
    parts.push(g);
  };
  const timber = (centre: number[], size: number[], bevel = 0.0012) => {
    const shape = new THREE.Shape(),
      x = size[0] / 2 - bevel,
      y = size[1] / 2 - bevel;
    shape.moveTo(-x, -y);
    shape.lineTo(x, -y);
    shape.lineTo(x, y);
    shape.lineTo(-x, y);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: size[2] - 2 * bevel,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 1,
    });
    return g.translate(centre[0], centre[1], centre[2] - size[2] / 2 + bevel);
  };
  const box = (centre: number[], size: number[], hex: string, bevel = 0.0012) =>
    paint(timber(centre, size, bevel), hex);
  const stick = (a: number[], b: number[], width: number, depth: number, hex: string) => {
    const start = new THREE.Vector3(...a),
      finish = new THREE.Vector3(...b),
      direction = finish.clone().sub(start);
    const g = timber([0, 0, 0], [width, direction.length(), depth], Math.min(width * 0.16, 0.0015));
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    ).translate(...start.add(finish).multiplyScalar(0.5).toArray());
    paint(g, hex);
  };
  // One planar inset replaces all old glazing/joinery fragments. Its hidden
  // overlap beneath the surround closes oblique gaps; the room mask is unchanged.
  paint(new THREE.PlaneGeometry(0.25, 0.172).translate(0, 0.005, 0.374), '#111313');
  const cream = '#e4dfcb',
    oak = '#765231',
    iron = '#303b39';
  const reds = ['#982e35', '#9c3138', '#952c33', '#9a2f36'];
  const plank = (
    lo: number,
    hi: number,
    bottom: number,
    top: number,
    side: number,
    shade: string
  ) => {
    const a = Math.min(top, barnRoofHeight(lo) - 0.012),
      b = Math.min(top, barnRoofHeight(hi) - 0.012);
    if (Math.min(a, b) <= bottom) return;
    const shape = new THREE.Shape();
    shape.moveTo(lo, bottom);
    shape.lineTo(hi, bottom);
    shape.lineTo(hi, b);
    shape.lineTo(lo, a);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.012,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 1,
    });
    g.translate(0, 0, 0.407);
    if (side < 0) g.rotateY(Math.PI);
    paint(g, shade);
  };
  // Continuous dark backers close the construction joints without filling the loft.
  // In source units (x10 m): the gable backers end 2 mm inside the side boards'
  // outer face and 2 mm above their feet; the side backers stand 2.3 mm off the
  // delivered wall, 2 mm above the board feet and 2 mm under the eaves soffit,
  // and the side boards stop 2 mm under it too. Each had shared a plane with a
  // differently coloured face.
  for (const side of [-1, 1]) {
    const outline = new THREE.Shape();
    outline.moveTo(-0.436, -0.48);
    outline.lineTo(0.436, -0.48);
    for (const x of [0.436, 0.338, 0.213, 0, -0.213, -0.338, -0.436])
      outline.lineTo(x, barnRoofHeight(x) - 0.012);
    outline.closePath();
    if (side > 0) {
      const hole = new THREE.Path();
      hole.moveTo(-0.125, -0.081);
      hole.lineTo(-0.125, 0.091);
      hole.lineTo(0.125, 0.091);
      hole.lineTo(0.125, -0.081);
      hole.closePath();
      outline.holes.push(hole);
    }
    const backing = new THREE.ExtrudeGeometry(outline, {
      depth: 0.002,
      steps: 1,
      bevelEnabled: false,
      curveSegments: 1,
    });
    backing.translate(0, 0, 0.403);
    if (side < 0) backing.rotateY(Math.PI);
    paint(backing, '#70272c');
    const top = barnRoofHeight(0.438) - 0.008;
    paint(
      new THREE.BoxGeometry(0.003, top + 0.478, 0.832).translate(
        side * 0.4215,
        (top - 0.482) / 2,
        0
      ),
      '#70272c'
    );
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      const lo = -0.438 + (i * 0.876) / 24 + 0.0005,
        hi = -0.438 + ((i + 1) * 0.876) / 24 - 0.0005;
      // Source loft opening exists on +Z only. Keep its full framed aperture.
      const breaks =
        side > 0 ? [lo, ...[-0.125, 0.125].filter((x) => x > lo && x < hi), hi] : [lo, hi];
      for (let j = 1; j < breaks.length; j++) {
        const x0 = breaks[j - 1],
          x1 = breaks[j];
        if (side > 0 && (x0 + x1) / 2 > -0.125 && (x0 + x1) / 2 < 0.125) {
          plank(x0, x1, -0.482, -0.081, side, reds[i % 4]);
          plank(x0, x1, 0.091, 1, side, reds[i % 4]);
        } else plank(x0, x1, -0.482, 1, side, reds[i % 4]);
      }
    }
    const top = barnRoofHeight(0.438) - 0.008;
    for (let i = 0; i < 24; i++) {
      const z = -0.416 + ((i + 0.5) * 0.832) / 24;
      paint(
        new THREE.BoxGeometry(0.014, top + 0.48, 0.832 / 24 - 0.001).translate(
          side * 0.431,
          (top - 0.484) / 2,
          z
        ),
        reds[(i + 1) % 4]
      );
    }
    box([side * 0.438, barnRoofHeight(0.449) - 0.018, 0], [0.022, 0.018, 0.866], cream);
    box([side * 0.438, -0.478, 0], [0.024, 0.018, 0.866], cream);
    for (const end of [-1, 1])
      box([side * 0.43, (top - 0.469) / 2, end * 0.419], [0.025, top + 0.469, 0.03], cream, 0.002);
    for (const end of [-1, 1]) {
      const profile = [
        [0, 0.303],
        [0.213, 0.232],
        [0.338, 0.004],
        [0.438, barnRoofHeight(0.438)],
      ];
      for (let i = 1; i < profile.length; i++)
        stick(
          [side * profile[i - 1][0], profile[i - 1][1] - 0.032, end * 0.426],
          [side * profile[i][0], profile[i][1] - 0.032, end * 0.426],
          0.016,
          0.024,
          cream
        );
    }
  }
  for (const end of [-1, 1]) {
    box([0, -0.478, end * 0.419], [0.885, 0.018, 0.03], cream);
    box([0, -0.115, end * 0.42], [0.835, 0.023, 0.028], cream);
    box([0, 0.106, end * 0.42], [0.45, 0.021, 0.028], cream);
  }
  for (const x of [-0.115, 0.115]) box([x, 0.005, 0.401], [0.02, 0.132, 0.036], cream, 0.0015);
  for (const y of [-0.071, 0.081]) box([0, y, 0.401], [0.25, 0.02, 0.036], cream, 0.0015);
  for (const sign of [-1, 1])
    stick(
      [-0.103, sign < 0 ? 0.071 : -0.061, 0.391 + (sign < 0 ? 0.0015 : 0)],
      [0.103, sign < 0 ? -0.061 : 0.071, 0.391 + (sign < 0 ? 0.0015 : 0)],
      0.014,
      0.018,
      oak
    );
  for (let i = 0; i < 12; i++) {
    const x = -0.195 + ((i + 0.5) * 0.39) / 12;
    box([x, -0.305, 0.428], [0.39 / 12 - 0.0009, 0.33, 0.018], i % 3 ? oak : '#715030', 0.0007);
  }
  for (const x of [-0.208, 0.208]) box([x, -0.306, 0.43], [0.024, 0.353, 0.028], cream, 0.002);
  box([0, -0.129, 0.43], [0.441, 0.026, 0.03], cream, 0.002);
  for (const side of [-1, 1]) {
    for (const y of [-0.186, -0.42]) {
      box([side * 0.165, y, 0.444], [0.082, 0.009, 0.006], iron, 0.0007);
      box([side * 0.202, y, 0.445], [0.009, 0.028, 0.009], iron, 0.0007);
    }
    box([side * 0.014, -0.302, 0.445], [0.007, 0.033, 0.009], iron, 0.0007);
  }
  box([0, -0.13, -0.458], [0.027, 0.026, 0.08], '#42382b');
  stick([0, -0.167, -0.418], [0, -0.143, -0.482], 0.013, 0.013, oak);
  const result = joined(parts);
  result.userData.barnJoinery = {
    retainedSourceFaces: sourceFaces,
    loftFaces,
    sourceTriangles: count / 3,
    triangles: result.getAttribute('position').count / 3,
  };
  return result;
}
