import React from 'react';
import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { WORLD_CRAFT_PALETTE } from '../../constants/publicRealmLayout';
import { applyVillageWindows } from '../models/GeneratedOfficeModel';
import { VillageHomeEntryLighting } from './VillageSignage';

import { VILLAGE_HOME_PLOTS, VILLAGE_ALLOTMENT } from '../../constants/siteLayout';
export {
  VILLAGE_HOME_PLOTS,
  VILLAGE_GARDEN_FOOTPRINTS,
  VILLAGE_ALLOTMENT,
} from '../../constants/siteLayout';

const DESIGNS = [
  {
    width: 5.6,
    depth: 4.4,
    height: 3.15,
    rise: 1.9,
    wall: '#e7d4a8',
    roof: '#ac864d',
    door: '#567363',
    flowers: '#d77589',
    kind: 'thatch',
  },
  {
    width: 4.8,
    depth: 4.5,
    height: 4.25,
    rise: 1.95,
    wall: '#d5a398',
    roof: '#4b5963',
    door: '#425e69',
    flowers: '#dfae4d',
    kind: 'step',
  },
  {
    width: 5.2,
    depth: 4.2,
    height: 3.65,
    rise: 1.6,
    wall: '#a9c4cb',
    roof: '#9e5740',
    door: '#8d4b40',
    flowers: '#d586ab',
    kind: 'gable',
  },
  {
    width: 4.65,
    depth: 4.6,
    height: 4.55,
    rise: 1.95,
    wall: '#ac7155',
    roof: '#475762',
    door: '#72846a',
    flowers: '#e0b749',
    kind: 'step',
  },
  {
    width: 5.7,
    depth: 4.4,
    height: 3.45,
    rise: 1.7,
    wall: '#e6dfca',
    roof: '#536572',
    door: '#6b8793',
    flowers: '#b694c7',
    kind: 'gable',
  },
] as const;
const { cream: CREAM, soil: SOIL, leaf: LEAF, oak: WOOD, iron: IRON } = WORLD_CRAFT_PALETTE;
type Point = readonly [number, number, number];

/** Soft clipped foliage and leaf-age tones on the existing closed cluster.
 * Working if normals follow the ellipsoid, tips differ from lower leaves and
 * positions, UVs and indices remain exact for the original civic shadow bake.
 */
export function addVillageFoliage(
  b: PlotGeometry,
  at: Point,
  scale: Point,
  colour: string,
  detail: 0 | 1 = 0
) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  // Smooth the low-detail cluster before its nonuniform scale, so normals use
  // the same inverse-transpose as the ellipsoid rather than a spherical guess.
  g.setAttribute('normal', g.getAttribute('position').clone());
  g.scale(...scale).translate(...at);
  b.add(g, colour);
  const p = g.getAttribute('position'),
    colours = g.getAttribute('color');
  const base = new THREE.Color(colour),
    fresh = new THREE.Color('#96a67a'),
    shade = base.clone();
  for (let i = 0; i < p.count; i++) {
    const height = THREE.MathUtils.clamp((p.getY(i) - at[1]) / scale[1], -1, 1);
    const patch =
      Math.sin(p.getX(i) * 2.7 + p.getZ(i) * 3.1) * Math.sin(p.getZ(i) * 1.7 - p.getX(i) * 0.9);
    shade.copy(base).multiplyScalar(0.95 + height * 0.07 + patch * 0.04);
    shade.lerp(fresh, Math.max(0, height) * 0.08);
    colours.setXYZ(i, shade.r, shade.g, shade.b);
  }
}

/** Closed, stemmed five-petal flowers, premerged into the existing plot draw.
 * Working if boxes and pots have varied blooms above their soil, finite normals
 * and no new draw, texture, animation or material allocation at frame time.
 */
export function addVillageFlower(
  b: PlotGeometry,
  x: number,
  y: number,
  z: number,
  colour: string,
  size = 0.14
) {
  const phase = x * 7.13 + z * 11.31 + y * 3.7;
  const lean = Math.sin(phase) * size * 0.32;
  const top = y + size * (2.35 + Math.cos(phase) * 0.35);
  // Eight closed tapered faces replace a twelve-face box stem. Together with
  // the leaves, petals and centre this retains the old 60 triangles per plant.
  b.add(
    new THREE.OctahedronGeometry(1)
      .scale(size * 0.05, Math.hypot(lean, top - y) / 2, size * 0.05)
      .rotateZ(-Math.atan2(lean, top - y))
      .translate(x + lean / 2, (y + top) / 2, z),
    LEAF
  );
  for (const side of [-1, 1])
    b.add(
      new THREE.TetrahedronGeometry(1)
        .scale(size * 0.55, size * 0.14, size * 0.24)
        .rotateZ(side * 0.45)
        .translate(x + side * size * 0.35, y + size * 0.9, z),
      LEAF
    );
  const tilt = 0.68;
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5 + phase;
    const petal = new THREE.OctahedronGeometry(1);
    // Radial normals soften the closed petal without changing a single caster
    // vertex. Working if the original civic bake and 60-triangle bloom hold.
    petal.setAttribute('normal', petal.getAttribute('position').clone());
    b.add(petal, colour);
    const colours = petal.getAttribute('color'),
      positions = petal.getAttribute('position'),
      base = new THREE.Color(colour),
      shade = base.clone();
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const tip = (positions.getZ(vertex) + 1) * 0.5;
      shade.copy(base).multiplyScalar(0.94 + tip * 0.09 + Math.sin(phase + i * 1.7) * 0.025);
      colours.setXYZ(vertex, shade.r, shade.g, shade.b);
    }
    petal
      .scale(size * 0.3, size * 0.13, size * 0.48)
      .translate(0, 0, size * 0.43)
      .rotateY(angle)
      .rotateX(tilt)
      .translate(x + lean, top, z);
  }
  b.add(
    new THREE.TetrahedronGeometry(1)
      .scale(size * 0.23, size * 0.14, size * 0.23)
      .translate(0, size * 0.05, 0)
      .rotateX(tilt)
      .translate(x + lean, top, z),
    '#e6b85e'
  );
}

function windowBox(b: PlotGeometry, x: number, y: number, z: number, colour: string) {
  b.box([1.28, 0.12, 0.42], [x, y, z], WOOD);
  b.box([1.3, 0.27, 0.065], [x, y + 0.08, z + 0.21], CREAM);
  for (const side of [-1, 1]) b.box([0.07, 0.27, 0.43], [x + side * 0.63, y + 0.08, z], CREAM);
  b.box([1.14, 0.035, 0.31], [x, y + 0.13, z], SOIL);
  for (let i = 0; i < 6; i++) addVillageFlower(b, x - 0.49 + i * 0.19, y + 0.16, z, colour, 0.12);
  for (const side of [-1, 1])
    b.beam(
      [x + side * 0.42, y - 0.3, z - 0.14],
      [x + side * 0.42, y - 0.05, z + 0.13],
      0.055,
      IRON
    );
}

/** Kiln tones on the existing clay buffers, darker near the base and worn at
 * the lip. Working if only vertex colours change and a repeated seed is exact.
 */
export function addVillageClay(
  b: PlotGeometry,
  geometry: THREE.BufferGeometry,
  colour: string,
  seed: number
) {
  b.add(geometry, colour);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const position = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv');
  const colours = geometry.getAttribute('color');
  const base = new THREE.Color(colour),
    shade = new THREE.Color();
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  for (let i = 0; i < position.count; i++) {
    const level = (position.getY(i) - bounds.min.y) / height;
    const tone =
      0.9 +
      0.13 * level +
      0.025 * Math.cos(uv.getX(i) * Math.PI * 6 + seed) +
      0.01 * Math.sin(seed * 1.37);
    shade.copy(base).multiplyScalar(tone);
    colours.setXYZ(i, shade.r, shade.g, shade.b);
  }
}

function pot(b: PlotGeometry, x: number, z: number, colour: string, scale = 1) {
  const radius = 0.36 * scale,
    h = 0.51 * scale;
  const seed = x * 2.71 + z * 1.97;
  addVillageClay(
    b,
    new THREE.CylinderGeometry(radius, radius * 0.68, h, 10).translate(x, h / 2, z),
    '#b97859',
    seed
  );
  addVillageClay(
    b,
    new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, h * 0.13, 10).translate(
      x,
      h * 0.92,
      z
    ),
    '#ce9470',
    seed
  );
  b.add(
    new THREE.CylinderGeometry(radius * 0.87, radius * 0.87, 0.025, 10).translate(x, h, z),
    SOIL
  );
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5;
    addVillageFlower(
      b,
      x + Math.cos(angle) * radius * 0.55,
      h,
      z + Math.sin(angle) * radius * 0.55,
      colour,
      0.15 * scale
    );
  }
}

function roof(
  b: PlotGeometry,
  width: number,
  depth: number,
  y: number,
  rise: number,
  colour: string,
  thatch = false
) {
  const hw = width / 2;
  const profile = (x: number) => y + rise * (1 - Math.pow(Math.abs(x) / hw, thatch ? 1.45 : 1));
  const shape = new THREE.Shape();
  const count = thatch ? 16 : 2;
  shape.moveTo(-hw, profile(-hw));
  for (let i = 1; i <= count; i++) {
    const x = -hw + (width * i) / count;
    shape.lineTo(x, profile(x));
  }
  for (let i = count; i >= 0; i--) {
    const x = -hw + (width * i) / count;
    shape.lineTo(x, profile(x) - (thatch ? 0.23 : 0.14));
  }
  shape.closePath();
  b.add(
    new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false }).translate(
      0,
      0,
      -depth / 2
    ),
    colour
  );
  for (const side of [-1, 1]) {
    for (let i = 1; i < 6; i++) {
      const x = (side * hw * i) / 6;
      b.box(
        [thatch ? 0.055 : 0.035, 0.045, depth + 0.014],
        [x, profile(x) + 0.014, 0],
        thatch ? '#b9965c' : colour
      );
    }
    b.beam(
      [side * hw, y - 0.035, depth / 2 + 0.012],
      [0, y + rise - 0.035, depth / 2 + 0.012],
      0.11,
      thatch ? '#977347' : CREAM
    );
  }
  b.box([0.19, 0.12, depth + 0.1], [0, y + rise + 0.015, 0], thatch ? '#b49864' : colour);
}

/** A closed pot keeps the eight-sided outer silhouette with a real cavity.
 * Dutch stacks have square throats; the other homes use six-sided throats.
 * Working if every mouth is recessed and the original 40k plot budget holds.
 */
function homeChimneyPot(squareThroat: boolean) {
  const ring = (count: number, radius: number) =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i * Math.PI * 2) / count;
      return new THREE.Vector2(Math.sin(angle) * radius, Math.cos(angle) * radius);
    });
  const outer = ring(8, 0.12),
    inner = ring(squareThroat ? 4 : 6, 0.085);
  const positions = [
    ...ring(8, 0.15).flatMap((p) => [p.x, 0.04, p.y]),
    ...outer.flatMap((p) => [p.x, 0.36, p.y]),
    ...inner.flatMap((p) => [p.x, 0.36, p.y]),
    0,
    0.04,
    0,
    0,
    0.07,
    0,
  ];
  const bottom = 16 + inner.length,
    floor = bottom + 1,
    indices: number[] = [];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    indices.push(i, j, i + 8, j, j + 8, i + 8, bottom, j, i);
  }
  // The unequal rings form a softened lip without hidden duplicate faces.
  for (const face of THREE.ShapeUtils.triangulateShape(outer, [inner])) {
    const [a, b, c] = face.map((i) => i + 8);
    const normalY =
      (positions[b * 3 + 2] - positions[a * 3 + 2]) * (positions[c * 3] - positions[a * 3]) -
      (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]);
    indices.push(a, normalY > 0 ? b : c, normalY > 0 ? c : b);
  }
  for (let i = 0; i < inner.length; i++) indices.push(16 + i, 16 + ((i + 1) % inner.length), floor);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((positions.length * 2) / 3), 2)
  );
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function house(index: number) {
  const d = DESIGNS[index],
    b = new PlotGeometry(),
    glass = new PlotGeometry();
  const hw = d.width / 2,
    front = d.depth / 2;
  b.box([d.width, d.height, d.depth], [0, d.height / 2, 0], d.wall);
  b.box([d.width + 0.14, 0.24, d.depth + 0.14], [0, 0.12, 0], index === 3 ? '#86614e' : '#b6ae96');
  // The gable infill is a closed extrusion, not a face with an open backside.
  const triangle = new THREE.Shape();
  triangle.moveTo(-hw, d.height - 0.05);
  triangle.lineTo(hw, d.height - 0.05);
  if (d.kind === 'thatch') {
    for (let i = 0; i <= 12; i++) {
      const x = hw - (d.width * i) / 12;
      triangle.lineTo(x, d.height + d.rise * (1 - Math.pow(Math.abs(x) / (hw + 0.3), 1.45)) - 0.2);
    }
  } else triangle.lineTo(0, d.height + d.rise - 0.12);
  triangle.closePath();
  b.add(
    new THREE.ExtrudeGeometry(triangle, {
      depth: d.depth,
      steps: 1,
      bevelEnabled: false,
    }).translate(0, 0, -front),
    d.wall
  );
  for (const side of [-1, 1]) {
    b.box([d.width + 0.09, 0.22, 0.12], [0, d.height, side * front], CREAM);
    b.box([0.12, 0.22, d.depth], [side * hw, d.height, 0], CREAM);
  }
  const step = d.kind === 'step';
  roof(
    b,
    d.width + (step ? 0.06 : 0.6),
    d.depth + (step ? -0.06 : 0.6),
    d.height,
    d.rise,
    d.roof,
    d.kind === 'thatch'
  );
  if (step) {
    const gable = new THREE.Shape();
    const coords: [number, number][] = [[-hw - 0.08, 0]];
    for (let i = 0; i < 5; i++) {
      const x = -hw - 0.08 + (i * (hw - 0.32)) / 4;
      coords.push([x, 0.37 + i * 0.43]);
      if (i < 4) coords.push([-hw - 0.08 + ((i + 1) * (hw - 0.32)) / 4, 0.37 + i * 0.43]);
    }
    coords.push(...[...coords].reverse().map(([x, y]) => [-x, y] as [number, number]));
    coords.forEach(([x, y], i) =>
      i ? gable.lineTo(x, y + d.height - 0.03) : gable.moveTo(x, y + d.height - 0.03)
    );
    gable.closePath();
    b.add(
      new THREE.ExtrudeGeometry(gable, { depth: 0.18, bevelEnabled: false }).translate(
        0,
        0,
        front + 0.025
      ),
      d.wall
    );
    for (let i = 0; i < 5; i++) {
      const x = hw + 0.08 - (i * (hw - 0.32)) / 4;
      for (const side of [-1, 1])
        b.box(
          [i === 4 ? 0.46 : 0.63, 0.1, 0.28],
          [side * Math.max(0.2, x - 0.26), d.height + 0.36 + i * 0.43, front + 0.11],
          CREAM
        );
    }
  }
  // Door, raised recessed panels, lintel, threshold and a brass knob.
  b.box([1.16, 2.23, 0.15], [0, 1.135, front + 0.07], CREAM);
  b.box([0.94, 2.02, 0.1], [0, 1.055, front + 0.16], d.door);
  for (const y of [0.53, 1.45]) b.box([0.72, 0.68, 0.034], [0, y, front + 0.223], d.door);
  b.add(new THREE.SphereGeometry(0.046, 4, 2).translate(0.33, 1.01, front + 0.28), '#c0a260');
  // Smooth-normal eight-face brass knobs fund the closed letterplates inside
  // the original body budget. The dark slot is paint, supported by the metal.
  b.box([0.22, 0.043, 0.027], [0, 0.97, front + 0.222], '#b59a60');
  b.add(new THREE.PlaneGeometry(0.164, 0.008).translate(0, 0.97, front + 0.2365), IRON);
  b.box([1.28, 0.09, 0.5], [0, 0.045, front + 0.22], '#b2aaa0');
  const window = (
    x: number,
    y: number,
    z: number,
    width = 1.08,
    height = 1.32,
    shutters = true
  ) => {
    b.box([width + 0.18, height + 0.2, 0.13], [x, y, z], CREAM);
    glass.box([width, height, 0.025], [x, y, z + 0.082], '#ffffff');
    b.box([0.045, height, 0.045], [x, y, z + 0.112], CREAM);
    b.box([width, 0.05, 0.045], [x, y + 0.12, z + 0.112], CREAM);
    b.box([width + 0.32, 0.12, 0.31], [x, y - height / 2 - 0.1, z + 0.075], CREAM);
    if (shutters)
      for (const side of [-1, 1]) {
        b.box([0.3, height + 0.06, 0.075], [x + side * (width / 2 + 0.29), y, z], d.door);
        for (const dy of [-0.32, 0.32])
          b.box([0.31, 0.044, 0.06], [x + side * (width / 2 + 0.29), y + dy, z + 0.055], CREAM);
      }
  };
  for (const side of [-1, 1]) {
    const x = side * d.width * 0.29,
      y = step ? 1.65 : 1.98;
    const bay = index === 4 && side === 1 ? 0.33 : 0;
    if (bay) b.box([1.48, 1.65, 0.43], [x, y - 0.1, front + 0.2], d.wall);
    window(x, y, front + 0.07 + bay, 0.92, 1.25, index !== 3);
    windowBox(b, x, y - 0.9, front + 0.27 + bay, d.flowers);
    if (step) window(x, 3.35, front + 0.075, 0.82, 1.04, false);
  }
  window(0, d.height + 0.55, front + (step ? 0.21 : 0.08), 0.55, 0.63, false);
  // The slate cottage has a real side-facing dormer. Its closed cheeks
  // penetrate the roof, while the pane keeps the existing room UV contract.
  if (index === 4) {
    const x = 1.65,
      y = d.height + 0.95,
      z = 0.7;
    b.box([1.0, 0.96, 1.38], [x - 0.18, y, z], d.wall);
    const begin = b.parts.length,
      paneBegin = glass.parts.length;
    window(0, y, 0, 0.73, 0.69, false);
    for (const g of [...b.parts.slice(begin), ...glass.parts.slice(paneBegin)])
      g.rotateY(Math.PI / 2).translate(x + 0.33, 0, z);
    const roofBegin = b.parts.length;
    roof(b, 1.68, 1.24, y + 0.48, 0.5, d.roof);
    for (const g of b.parts.slice(roofBegin)) g.rotateY(Math.PI / 2).translate(x, 0, z);
  }
  // A low thatched hood and the red-tile cottage's timber porch are distinct
  // entrance silhouettes, kept above the existing clear door approach.
  if (index === 0 || index === 2) {
    const begin = b.parts.length;
    roof(b, index === 0 ? 1.55 : 1.85, 1.0, 2.48, index === 0 ? 0.38 : 0.58, d.roof, index === 0);
    for (const g of b.parts.slice(begin)) g.translate(0, 0, front + 0.39);
    for (const side of [-1, 1]) {
      b.beam([side * 0.68, 2.02, front + 0.13], [side * 0.68, 2.43, front + 0.8], 0.075, WOOD);
    }
  }
  // Rainwater belongs at the eaves and returns into each planted footing,
  // rather than becoming a decorative pipe across the door or windows.
  if (d.kind !== 'thatch') {
    for (const side of [-1, 1]) {
      const x = side * (hw + (step ? 0.04 : 0.27));
      b.box([0.095, 0.095, d.depth + (step ? 0.04 : 0.55)], [x, d.height - 0.035, 0], IRON);
      b.box([0.075, d.height - 0.27, 0.075], [x, (d.height - 0.27) / 2 + 0.13, -front + 0.3], IRON);
      b.beam([x, 0.15, -front + 0.3], [x + side * 0.22, 0.07, -front + 0.3], 0.075, IRON);
    }
  }
  // Rear and side sashes are rotated with their frames as a unit.
  for (const side of [-1, 1]) {
    const begin = b.parts.length,
      paneBegin = glass.parts.length;
    window(0, 1.85, 0, 1.15, 1.24, false);
    for (const g of [...b.parts.slice(begin), ...glass.parts.slice(paneBegin)])
      g.rotateY((side * Math.PI) / 2).translate(side * (hw + 0.07), 0, -0.42);
  }
  const rearBegin = b.parts.length,
    rearPaneBegin = glass.parts.length;
  for (const side of [-1, 1]) window(side * d.width * 0.25, 1.85, 0, 0.98, 1.24, false);
  window(0, d.height + 0.5, 0, 0.52, 0.57, false);
  for (const g of [...b.parts.slice(rearBegin), ...glass.parts.slice(rearPaneBegin)])
    g.rotateY(Math.PI).translate(0, 0, -front - 0.07);
  // Dutch brick courses and white dressings retain planar walls, with the
  // entrance and every window left completely free of decorative overlays.
  if (index === 3) {
    for (let i = 0; i < 15; i++) {
      const y = 0.35 + i * 0.28;
      for (const side of [-1, 1])
        b.box([0.055, 0.018, d.depth - 0.2], [side * (hw + 0.018), y, 0], '#c29b7f');
      // Recessed joints sit behind all door/window frames, never across them.
      b.box([d.width - 0.06, 0.016, 0.012], [0, y, front + 0.021], '#c29b7f');
      for (let col = 0; col < 8; col++) {
        const x = -hw + 0.2 + col * 0.55 + (i % 2) * 0.22;
        if (x < hw - 0.05) b.box([0.017, 0.25, 0.012], [x, y + 0.135, front + 0.021], '#c29b7f');
      }
    }
  }
  if (index === 0) {
    b.box([d.width + 0.07, 0.15, 0.12], [0, d.height - 0.08, front + 0.04], WOOD);
    for (const x of [-hw + 0.08, hw - 0.08])
      b.box([0.16, d.height, 0.12], [x, d.height / 2, front + 0.04], WOOD);
  }
  const chimney = [hw - 0.7, d.height + d.rise - 0.2, -0.65] as const;
  b.box(
    [0.58, 1.25, 0.66],
    [chimney[0], chimney[1] - 0.58, chimney[2]],
    index === 3 ? d.wall : '#946c57'
  );
  // Stepped Dutch stacks and the limewashed thatch stack have their own
  // masonry silhouettes, retaining the measured pot and smoke datums.
  if (step) {
    for (const dy of [-0.23, -0.1])
      b.box([0.68, 0.09, 0.76], [chimney[0], chimney[1] + dy, chimney[2]], d.wall);
  } else if (index === 0) {
    b.box([0.61, 0.88, 0.69], [chimney[0], chimney[1] - 0.56, chimney[2]], CREAM);
  }
  b.box([0.73, 0.13, 0.8], [chimney[0], chimney[1] + 0.015, chimney[2]], CREAM);
  for (const z of [-0.2, 0.2])
    b.add(homeChimneyPot(step).translate(chimney[0], chimney[1], chimney[2] + z), '#aa704f');
  return {
    body: b.finish(),
    glass: glass.finish(),
    chimney: [chimney[0], chimney[1] + 0.38, chimney[2]] as Point,
    // A compact lantern sits over the lintel, below the actual porch ridges.
    // Its longer wall bracket clears door panels without moving the optic.
    // The plate enters the planar wall by 1 mm; the approach remains free.
    entry: [0, 2.6, front + 0.01125] as Point,
  };
}

function garden(index: number) {
  const b = new PlotGeometry(),
    d = DESIGNS[index];
  // Tended footing strips belong to the houses, inside the existing plot
  // envelopes. Their low herbs leave sashes visible and never enter the gate
  // lane. Working if rays find gravel on both sides and no foliage above 0.8 m.
  for (const side of [-1, 1]) {
    const x = side * (d.width / 2 + 0.48),
      depth = d.depth - 1.8;
    b.box([0.76, 0.05, depth], [x, 0, 0.05], '#aea18a');
    b.box([0.075, 0.09, depth + 0.06], [x + side * 0.39, 0.015, 0.05], '#b99573');
    // Unequal gaps and heights read as small rosemary/sage clumps, rather
    // than a second fence or a repeated band of decorative flowers.
    const count = 2 + ((index + (side > 0 ? 1 : 0)) % 2);
    for (let i = 0; i < count; i++) {
      const z = -depth * 0.32 + (i * depth * 0.65) / (count - 1) + 0.05,
        radius = 0.22 + ((index + i) % 3) * 0.055,
        height = 0.24 + ((index + i + (side > 0 ? 1 : 0)) % 3) * 0.065;
      addVillageFoliage(
        b,
        [x + side * (i % 2 ? 0.06 : -0.035), 0.025 + height, z],
        [radius, height, radius * 0.82],
        (index + i) % 2 ? '#71836a' : '#566e54'
      );
      addVillageFoliage(
        b,
        [x - side * 0.09, 0.05 + height * 0.63, z + 0.13],
        [radius * 0.7, height * 0.62, radius * 0.64],
        '#879374'
      );
    }
  }
  // A worn gravel seat pad grounds the existing rear bench, with open ends
  // instead of another enclosure. No route or collision contract changes.
  b.box([2.3, 0.05, 1.2], [-3.7, 0, -2.25], '#b5a78d');
  for (const z of [-2.86, -1.64]) b.box([2.3, 0.075, 0.065], [-3.7, 0.005, z], '#9d8e76');
  // Walking lane remains 1.7 m wide, including between the gate pillars.
  for (let i = 0; i < 9; i++)
    b.box(
      [1.5, 0.07, 0.47],
      [0, 0.018, d.depth / 2 + 0.55 + i * 0.52],
      i % 2 ? '#bfb49a' : '#d0c5ad'
    );
  const boundary = index % 2 ? '#ac7962' : '#bbb29d';
  for (const side of [-1, 1]) {
    b.box([4.2, 0.62, 0.31], [side * 3.05, 0.31, 7.15], boundary);
    b.box([4.28, 0.095, 0.42], [side * 3.05, 0.665, 7.15], CREAM);
    for (let row = 0; row < 3; row++) {
      b.box([4.17, 0.017, 0.012], [side * 3.05, 0.18 + row * 0.19, 7.314], '#d3c6ad');
      for (let col = 0; col < 7; col++)
        b.box(
          [0.017, 0.16, 0.013],
          [side * 3.05 - 1.9 + col * 0.59 + (row % 2) * 0.15, 0.095 + row * 0.19, 7.315],
          '#d3c6ad'
        );
    }
    for (const x of [side * 1.02, side * 5.12]) {
      b.box([0.3, 0.88, 0.4], [x, 0.44, 7.15], boundary);
      b.box([0.41, 0.1, 0.48], [x, 0.91, 7.15], CREAM);
    }
    b.box([0.27, 0.44, 9.4], [side * 5.12, 0.22, 2.3], boundary);
    b.box([0.36, 0.08, 9.48], [side * 5.12, 0.48, 2.3], CREAM);
    const x = side * 2.85;
    if (index === 1) {
      // Small brick courtyard, with pots against the wall and a clear centre.
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 4; col++)
          b.box(
            [0.59, 0.06, 0.49],
            [x - 0.93 + col * 0.62, 0.008, 3.55 + row * 0.52],
            (row + col) % 3 === 0 ? '#bda486' : '#a88068'
          );
      for (const z of [3.4, 5.9]) pot(b, side * 4.3, z, d.flowers, 0.9);
    } else if (index === 2 && side === 1) {
      // A small mown lawn, with a single flowering shrub at its far corner.
      addVillageFoliage(b, [3.95, 0.54, 5.55], [0.58, 0.6, 0.52], LEAF);
      for (let i = 0; i < 4; i++)
        addVillageFlower(
          b,
          3.65 + (i % 2) * 0.48,
          0.9,
          5.35 + Math.floor(i / 2) * 0.4,
          d.flowers,
          0.12
        );
    } else {
      const narrow = index === 2 || (index === 0 && side === 1);
      const width = narrow ? 1.0 : index === 4 ? 1.65 : 2.55;
      const depth = narrow ? 3.1 : index === 3 ? 2.35 : 1.75;
      const bx = narrow ? side * 4.25 : x;
      const z = index === 4 ? (side < 0 ? 3.65 : 5.5) : side < 0 ? 4.2 : 5.1;
      b.box([width, 0.11, depth], [bx, 0.055, z], SOIL);
      for (const edge of [-1, 1]) {
        b.box([width + 0.18, 0.17, 0.1], [bx, 0.085, z + edge * (depth / 2 + 0.025)], '#b99573');
        b.box([0.1, 0.17, depth + 0.05], [bx + edge * (width / 2 + 0.04), 0.085, z], '#b99573');
      }
      const rows = narrow ? 5 : 3,
        cols = narrow ? 2 : index === 4 ? 3 : 4;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const px = bx - width * 0.36 + (col * width * 0.72) / (cols - 1),
            pz = z - depth * 0.35 + (row * depth * 0.7) / (rows - 1);
          if (index === 3) {
            addVillageFoliage(
              b,
              [px, 0.32, pz],
              [0.22, 0.2, 0.22],
              side < 0 ? '#829565' : '#657e49'
            );
            if (side > 0) b.beam([px, 0.2, pz], [px + 0.08, 0.65, pz + 0.07], 0.05, LEAF);
          } else
            addVillageFlower(b, px, 0.1, pz, (row + col + index) % 3 ? d.flowers : '#e2c36b', 0.2);
        }
      if (index === 3 && side === 1) {
        for (const dz of [-0.7, 0.7])
          b.beam([bx + 0.9, 0, z + dz], [bx + 0.9, 1.65, z + dz], 0.055, WOOD);
        b.box([0.06, 0.06, 1.5], [bx + 0.9, 1.6, z], WOOD);
        for (let i = 0; i < 5; i++)
          addVillageFoliage(b, [bx + 0.9, 0.4 + i * 0.24, z], [0.2, 0.18, 0.2], LEAF);
      }
    }
    pot(b, side * 1.2, d.depth / 2 + 0.95, d.flowers, 0.82);
  }
  // Open gate leaf folds back along the path's right edge, never across it.
  for (let i = 0; i < 6; i++) {
    b.box([0.065, 0.7 + (i % 2) * 0.06, 0.1], [0.99, 0.52, 6.05 + i * 0.18], CREAM);
  }
  for (const y of [0.3, 0.7]) b.box([0.07, 0.07, 1.04], [0.99, y, 6.52], CREAM);
  if (index === 0 || index === 4) {
    for (const side of [-1, 1]) b.box([0.08, 2.25, 0.08], [side * 1.14, 1.125, 6.95], '#739075');
    const arch = new THREE.TorusGeometry(1.14, 0.055, 4, 16, Math.PI).translate(0, 2.25, 6.95);
    b.add(arch, '#739075');
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * i) / 6;
      addVillageFlower(b, Math.cos(a) * 1.14, 2.23 + Math.sin(a) * 1.14, 6.95, d.flowers, 0.18);
    }
  }
  // Small rear bench and a terracotta pot, visible over the low side walls.
  b.box([1.9, 0.1, 0.5], [-3.7, 0.47, -2.3], WOOD);
  b.box([1.9, 0.44, 0.08], [-3.7, 0.73, -2.54], WOOD);
  for (const x of [-4.4, -3]) b.box([0.1, 0.45, 0.42], [x, 0.225, -2.3], IRON);
  pot(b, 3.9, -2.5, d.flowers, 1.15);
  return b.finish();
}

function allotment() {
  const b = new PlotGeometry();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 17; i++) {
      const z = -5.65 + i * 0.72;
      b.box([0.09, 0.84, 0.12], [side * 5.5, 0.42, z], '#c9c1a7');
    }
    for (const y of [0.27, 0.65]) b.box([0.08, 0.065, 12.5], [side * 5.5, y, 0.25], CREAM);
    for (const z of [-5.85, 6.5]) {
      const centre = side * 3.2;
      b.box([4.55, 0.08, 0.08], [centre, 0.32, z], CREAM);
      b.box([4.55, 0.08, 0.08], [centre, 0.69, z], CREAM);
      for (let i = 0; i < 9; i++)
        b.box([0.105, 0.86, 0.1], [centre - 2.15 + i * 0.52, 0.43, z], CREAM);
    }
  }
  for (let i = 0; i < 14; i++) b.box([1.55, 0.07, 0.63], [0, 0.014, -3 + i * 0.7], '#b8ac92');
  for (const x of [-2.9, 2.9])
    for (const z of [-0.35, 3.65]) {
      b.box([2.8, 0.2, 2.8], [x, 0.1, z], SOIL);
      for (const side of [-1, 1]) {
        b.box([2.98, 0.25, 0.11], [x, 0.125, z + side * 1.45], WOOD);
        b.box([0.11, 0.25, 2.92], [x + side * 1.45, 0.125, z], WOOD);
      }
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) {
          const px = x - 1.05 + col * 0.69,
            pz = z - 1.02 + row * 0.68;
          if (x < 0) {
            addVillageFoliage(
              b,
              [px, 0.42, pz],
              [0.28, 0.22, 0.28],
              (row + col) % 2 ? '#6a8b54' : '#849b63'
            );
            addVillageFoliage(b, [px, 0.49, pz], [0.16, 0.15, 0.17], '#a2ad75');
          } else {
            for (const side of [-1, 1])
              b.beam([px, 0.22, pz], [px + side * 0.17, 0.69, pz + 0.12], 0.058, '#5c8247');
            b.round([px, 0.23, pz], [0.12, 0.055, 0.12], z > 0 ? '#ab633f' : '#9f7653');
          }
        }
    }
  // Tool shed, with a closed pitched roof and framed door.
  b.box([2.5, 2.05, 2.15], [-3.3, 1.025, -4.2], '#8b9d85');
  for (let i = 0; i < 12; i++)
    b.box([0.028, 1.98, 0.025], [-4.43 + i * 0.205, 1.02, -3.11], '#a4b096');
  b.box([0.86, 1.73, 0.06], [-3.3, 0.89, -3.06], '#647863');
  b.box([0.97, 0.1, 0.11], [-3.3, 1.79, -3.025], CREAM);
  const begin = b.parts.length;
  roof(b, 2.9, 2.6, 2.04, 0.65, '#59676b');
  b.parts.slice(begin).forEach((g) => g.translate(-3.3, 0, -4.2));
  b.add(new THREE.CylinderGeometry(0.4, 0.37, 0.88, 12).translate(-1.46, 0.44, -4.4), '#536b64');
  b.add(
    new THREE.TorusGeometry(0.39, 0.035, 4, 12).rotateX(Math.PI / 2).translate(-1.46, 0.85, -4.4),
    IRON
  );
  // Runner-bean trellis and a small cold frame occupy the back-right plot.
  for (const x of [1.8, 3.1, 4.4]) {
    for (const side of [-1, 1])
      b.beam([x, 0, -4.3 + side * 0.6], [x, 1.85, -4.3], 0.055, '#a08a61');
    for (let i = 0; i < 5; i++)
      addVillageFoliage(b, [x + 0.08, 0.4 + i * 0.29, -4.3], [0.23, 0.2, 0.17], LEAF);
  }
  b.box([2.95, 0.06, 0.06], [3.1, 1.85, -4.3], WOOD);
  b.box([1.8, 0.38, 0.9], [2.9, 0.19, -2.45], WOOD);
  b.box([1.7, 0.035, 0.82], [2.9, 0.4, -2.45], '#92aca7');
  for (const x of [2.45, 3.35]) b.box([0.045, 0.045, 0.86], [x, 0.43, -2.45], CREAM);
  for (const x of [-4.8, 4.8]) pot(b, x, 5.75, '#dbb453', 1.05);
  return b.finish();
}

export const VILLAGE_HOMES = DESIGNS.map((_, index) => ({
  ...house(index),
  garden: garden(index),
}));
export const VILLAGE_ALLOTMENT_GEOMETRY = allotment();
// Low clipped privet follows the hall's side gardens, with generous gaps at
// both actual staircases. Opaque, rigid clusters can share the civic lamp bake.
// Working if the two 7.2 m entrance gaps stay clear and the planting is grounded.
export const TOWN_HALL_HEDGE_GEOMETRY = (() => {
  const b = new PlotGeometry();
  const leafCluster = (position: Point, scale: Point, colour: string) => {
    addVillageFoliage(b, position, scale, colour, 1);
  };
  const run = (x: number, z: number, length: number, side: boolean) => {
    b.box(side ? [0.92, 0.065, length + 0.3] : [length + 0.3, 0.065, 0.92], [x, 0.005, z], SOIL);
    const count = Math.ceil(length / 0.48);
    for (let i = 0; i <= count; i++) {
      const along = -length / 2 + (i / count) * length;
      const xx = x + (side ? 0 : along),
        zz = z + (side ? along : 0);
      const h = 0.93 + Math.sin(i * 1.71 + x) * 0.075;
      leafCluster([xx, h * 0.52, zz], [0.52, h * 0.55, 0.52], i % 3 ? '#405a32' : '#536d3b');
      leafCluster([xx + 0.11, h * 0.86, zz - 0.09], [0.34, 0.25, 0.34], '#607b43');
    }
  };
  for (const side of [-1, 1]) {
    run(side * 8, 0, 12, true);
    for (const end of [-1, 1]) run(side * 5.9, end * 8.2, 3.4, false);
  }
  return b.finish();
})();
export const VILLAGE_PLOT_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.84,
  metalness: 0,
});
export const VillageHome = React.memo(
  ({ index, windowMaterial }: { index: number; windowMaterial: THREE.Material }) => {
    const model = VILLAGE_HOMES[index];
    const interiorMaterial = React.useMemo(() => {
      if (!(windowMaterial instanceof THREE.MeshStandardMaterial)) {
        throw new Error('Village room glazing requires a standard material');
      }
      const material = windowMaterial.clone();
      material.color.set('#4c6b75');
      material.emissive.set('#000000');
      material.emissiveIntensity = 0;
      // These are opaque virtual rooms over the retained wall, not transparent
      // sheets onto solid plaster. One existing glazing draw per home remains.
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      material.roughness = 0.3;
      applyVillageWindows(material, undefined, true, 'pane');
      return material;
    }, [windowMaterial]);
    React.useEffect(() => () => interiorMaterial.dispose(), [interiorMaterial]);
    return (
      <group name={`village-home-${VILLAGE_HOME_PLOTS[index].name}`} dispose={null}>
        <mesh
          name={`village-home-body-${index}`}
          geometry={model.body}
          material={VILLAGE_PLOT_MATERIAL}
          castShadow
          receiveShadow
        />
        <mesh
          name={`village-home-garden-${index}`}
          geometry={model.garden}
          material={VILLAGE_PLOT_MATERIAL}
          castShadow
          receiveShadow
        />
        <VillageHomeEntryLighting index={index} mount={model.entry} />
        <mesh
          name={`village-home-glazing-${index}`}
          geometry={model.glass}
          material={interiorMaterial}
          receiveShadow
          userData={{ dynamic: true }}
        />
      </group>
    );
  }
);
VillageHome.displayName = 'VillageHome';
export const VillageAllotment = React.memo(() => (
  <group
    name="village-kitchen-allotment"
    position={[VILLAGE_ALLOTMENT.x, 0, VILLAGE_ALLOTMENT.z]}
    rotation={[0, Math.PI / 2, 0]}
    dispose={null}
  >
    <mesh
      geometry={VILLAGE_ALLOTMENT_GEOMETRY}
      material={VILLAGE_PLOT_MATERIAL}
      castShadow
      receiveShadow
    />
  </group>
));
VillageAllotment.displayName = 'VillageAllotment';
