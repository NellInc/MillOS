import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createColorDataTexture,
  createLinearDataTexture,
  hash,
} from '../../utils/textureGenerator';

/** Static shop souvenirs, in station-local metres. The source counter/rack keep
 * their bodies. Seven material batches, one shared print atlas, no new light,
 * audio, update loop or purchase authority. Feet meet the actual GLB tops.
 * Working if all props remain in these three seats and the doorway stays clear. */
type V3 = [number, number, number];
export const STATION_SOUVENIR_ART = `${import.meta.env.BASE_URL}textures/signage/dead-dino-shop-kit-v1.webp`;
export const SOUVENIR_SEATS = {
  counter: { centre: [-8.97, 1.045, -0.04] as V3, size: [0.74, 0.029, 0.46] as V3 },
  rack: { centre: [-10.5, 1.2, 3] as V3, size: [0.78, 0.88, 0.39] as V3 },
  coffee: { centre: [-11.1, 0.08, -2.8] as V3, size: [1, 1.39, 0.58] as V3 },
};
export const PLUSH_STOCK = [
  { base: [-8.97, 1.074, -0.04] as V3, scale: 0.9 },
  { base: [-10.69, 1.23, 3.025] as V3, scale: 0.43 },
  { base: [-10.32, 1.23, 3.025] as V3, scale: 0.43 },
];
const JADE = '#2f8a77',
  CREAM = '#eee1bd',
  INK = '#0b342b';

function coloured(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color),
    p = g.getAttribute('position');
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function join(parts: THREE.BufferGeometry[]) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of new Set([...parts, ...flat])) g.dispose();
  if (!merged) throw new Error('Station souvenir attributes disagree');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
function ball(size: V3, at: V3, color: string, segments = 18) {
  return coloured(new THREE.SphereGeometry(1, segments, 12).scale(...size).translate(...at), color);
}
function box(size: V3, at: V3, color: string, radius = 0.004) {
  return coloured(
    new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map((v) => v / 3))).translate(
      ...at
    ),
    color
  );
}
function tube(points: V3[], radius: number, color: string, segments = 18) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return coloured(new THREE.TubeGeometry(curve, segments, radius, 6, false), color);
}
function lathe(profile: [number, number][], at: V3, color: string) {
  return coloured(
    new THREE.LatheGeometry(
      profile.map((p) => new THREE.Vector2(...p)),
      20
    ).translate(...at),
    color
  );
}
function pad(x: number, height: number) {
  // Rounded pentagons are stuffed plates, rather than thin/sharp spikes.
  const s = new THREE.Shape();
  s.moveTo(-0.031, 0);
  s.lineTo(-0.047, height * 0.55);
  s.quadraticCurveTo(-0.048, height * 0.7, -0.025, height * 0.83);
  s.quadraticCurveTo(0, height * 1.07, 0.025, height * 0.83);
  s.quadraticCurveTo(0.048, height * 0.7, 0.047, height * 0.55);
  s.lineTo(0.031, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.025,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 3,
  });
  const y = 0.153 + 0.108 * Math.sqrt(Math.max(0, 1 - ((x + 0.075) / 0.205) ** 2));
  g.translate(x, y - 0.008, -0.0125);
  return coloured(g, CREAM);
}
export function createDeadDinoPlushGeometry() {
  const p: THREE.BufferGeometry[] = [
    ball([0.205, 0.112, 0.132], [-0.075, 0.157, 0], JADE, 28),
    ball([0.175, 0.044, 0.121], [-0.055, 0.061, 0], CREAM),
    ball([0.104, 0.093, 0.102], [0.178, 0.137, 0], JADE, 24),
    ball([0.094, 0.054, 0.09], [0.245, 0.095, 0], JADE),
    tube(
      [
        [-0.245, 0.135, 0],
        [-0.357, 0.09, 0.025],
        [-0.363, 0.059, 0.1],
        [-0.27, 0.045, 0.158],
        [-0.185, 0.056, 0.151],
      ],
      0.026,
      JADE,
      28
    ),
    ball([0.027, 0.025, 0.026], [-0.185, 0.056, 0.151], JADE),
  ];
  for (const x of [-0.163, 0.065])
    for (const side of [-1, 1]) {
      p.push(ball([0.079, 0.032, 0.05], [x, 0.032, side * 0.108], JADE));
      p.push(ball([0.045, 0.01, 0.042], [x + 0.027, 0.011, side * 0.11], CREAM));
      // Follow the stuffed foot surface, so stitching is seated rather than floating.
      const footPoint = (dx: number, y: number): V3 => [
        x + dx,
        y,
        side *
          (0.108 +
            0.05 * Math.sqrt(Math.max(0, 1 - (dx / 0.079) ** 2 - ((y - 0.032) / 0.032) ** 2)) +
            0.0004),
      ];
      p.push(
        tube(
          [footPoint(-0.04, 0.044), footPoint(0, 0.052), footPoint(0.04, 0.044)],
          0.00125,
          '#24735f',
          10
        )
      );
      for (let i = 0; i < 5; i++) {
        const dx = -0.026 + i * 0.013;
        p.push(tube([footPoint(dx, 0.046), footPoint(dx, 0.05)], 0.00065, '#72a996', 2));
      }
    }
  for (const [x, h] of [
    [-0.24, 0.05],
    [-0.17, 0.085],
    [-0.085, 0.11],
    [0.002, 0.1],
    [0.075, 0.075],
    [0.13, 0.049],
  ])
    p.push(pad(x, h));
  for (const side of [-1, 1]) {
    const cheekPoint = (x: number, y: number): V3 => [
      x,
      y,
      side *
        (0.102 *
          Math.sqrt(Math.max(0, 1 - ((x - 0.178) / 0.104) ** 2 - ((y - 0.137) / 0.093) ** 2)) +
          0.001),
    ];
    // Both embroidered Xs have two rounded strands seated on the cheek.
    for (const direction of [-1, 1])
      p.push(
        tube(
          [
            cheekPoint(0.151, 0.161 + direction * 0.012),
            cheekPoint(0.164, 0.161),
            cheekPoint(0.177, 0.161 - direction * 0.012),
          ],
          0.0033,
          INK,
          8
        )
      );
    p.push(
      tube(
        [
          [0.207, 0.096, side * 0.084],
          [0.248, 0.078, side * 0.086],
          [0.294, 0.092, side * 0.078],
        ],
        0.0022,
        INK,
        12
      )
    );
    p.push(ball([0.0035, 0.007, 0.003], [0.291, 0.113, side * 0.0735], INK, 12));
    const bodyPoint = (x: number, y: number): V3 => [
      x,
      y,
      side *
        (0.132 *
          Math.sqrt(Math.max(0, 1 - ((x + 0.075) / 0.205) ** 2 - ((y - 0.157) / 0.112) ** 2)) +
          0.0004),
    ];
    p.push(
      tube(
        [
          bodyPoint(-0.229, 0.143),
          bodyPoint(-0.163, 0.217),
          bodyPoint(-0.054, 0.239),
          bodyPoint(0.035, 0.21),
        ],
        0.0009,
        '#337d69',
        20
      )
    );
  }
  return join(p);
}

/** Neutral micro-fibre maps, generated once. Colour is sRGB; normal/roughness
 * remain linear and roughness is written to every RGB channel. */
export function createSouvenirFabricTextures(size = 128) {
  const colour = new Uint8Array(size * size * 4),
    normal = new Uint8Array(size * size * 4),
    roughness = new Uint8Array(size * size * 4);
  const height = (x: number, y: number) =>
    0.38 * Math.sin((x * Math.PI) / 4) * Math.sin((y * Math.PI) / 4) +
    (hash(
      Math.floor((((x % size) + size) % size) / 4),
      Math.floor((((y % size) + size) % size) / 4)
    ) -
      0.5) *
      0.3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        h = height(x, y);
      const shade = Math.round(241 + h * 16),
        r = Math.round(228 + h * 14);
      colour.set([shade, shade, shade, 255], i);
      roughness.set([r, r, r, 255], i);
      const n = new THREE.Vector3(
        -(height(x + 1, y) - height(x - 1, y)) * 0.35,
        -(height(x, y + 1) - height(x, y - 1)) * 0.35,
        1
      ).normalize();
      normal.set(
        [
          Math.round((n.x * 0.5 + 0.5) * 255),
          Math.round((n.y * 0.5 + 0.5) * 255),
          Math.round((n.z * 0.5 + 0.5) * 255),
          255,
        ],
        i
      );
    }
  const maps = {
    map: createColorDataTexture(colour, size, size),
    normalMap: createLinearDataTexture(normal, size, size),
    roughnessMap: createLinearDataTexture(roughness, size, size),
  };
  for (const t of Object.values(maps)) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
  }
  return maps;
}
const FABRIC = createSouvenirFabricTextures();
function createWoodTexture() {
  const a = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const v = Math.round(
        222 + Math.sin((y * Math.PI) / 8 + Math.sin(x * 0.035)) * 12 + (hash(x, y) - 0.5) * 8
      );
      a.set([v, v, v, 255], (y * 128 + x) * 4);
    }
  const t = createColorDataTexture(a, 128, 128);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const MATERIALS = {
  plush: new THREE.MeshStandardMaterial({
    ...FABRIC,
    vertexColors: true,
    roughness: 0.96,
    normalScale: new THREE.Vector2(0.22, 0.22),
  }),
  timber: new THREE.MeshStandardMaterial({
    map: createWoodTexture(),
    vertexColors: true,
    roughness: 0.68,
  }),
  ceramic: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.02 }),
  paper: new THREE.MeshStandardMaterial({ map: FABRIC.map, vertexColors: true, roughness: 0.88 }),
  baked: new THREE.MeshStandardMaterial({
    ...FABRIC,
    vertexColors: true,
    roughness: 0.91,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.65 }),
};
function printed(g: THREE.BufferGeometry, tile: number) {
  const uv = g.getAttribute('uv'),
    m = 0.006;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      ((tile % 2) + m + uv.getX(i) * (1 - 2 * m)) / 2,
      (1 - Math.floor(tile / 2) + m + uv.getY(i) * (1 - 2 * m)) / 2
    );
  return coloured(g, '#ffffff');
}
function card(side: number, at: V3, tile: number, yaw = 0) {
  return printed(new THREE.PlaneGeometry(side, side).rotateY(yaw).translate(...at), tile);
}
export function createSouvenirMugGeometry(at: V3 = [0, 0, 0]) {
  const profile: [number, number][] = [
    [0, 0],
    [0.051, 0],
    [0.06, 0.012],
    [0.069, 0.135],
    [0.068, 0.143],
    [0.061, 0.144],
    [0.06, 0.135],
    [0.05, 0.014],
    [0, 0.014],
  ];
  return join([
    lathe(profile, at, CREAM),
    tube(
      [
        [at[0] + 0.061, at[1] + 0.119, at[2]],
        [at[0] + 0.107, at[1] + 0.12, at[2]],
        [at[0] + 0.124, at[1] + 0.074, at[2]],
        [at[0] + 0.106, at[1] + 0.03, at[2]],
        [at[0] + 0.057, at[1] + 0.03, at[2]],
      ],
      0.008,
      JADE,
      24
    ),
  ]);
}
function pastry(at: V3) {
  const g = new THREE.SphereGeometry(1, 24, 14).scale(0.058, 0.036, 0.101);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = Math.max(0, p.getY(i) + 0.022);
    const score = Math.min(
      ...[-0.042, 0, 0.042].map((z) => Math.abs(p.getZ(i) - z - p.getX(i) * 0.35))
    );
    p.setY(i, y - (y > 0.041 ? Math.max(0, 1 - score / 0.004) * 0.004 : 0));
  }
  g.computeVertexNormals();
  g.translate(...at);
  return coloured(g, '#c98a42');
}

function createKitGeometry() {
  const p: Record<keyof typeof MATERIALS | 'prints', THREE.BufferGeometry[]> = {
    plush: [],
    timber: [],
    ceramic: [],
    paper: [],
    baked: [],
    metal: [],
    prints: [],
  };
  const add = (kind: keyof typeof p, size: V3, at: V3, color: string, r = 0.004) =>
    p[kind].push(box(size, at, color, r));
  const plush = createDeadDinoPlushGeometry();
  for (const { base, scale } of PLUSH_STOCK) {
    p.plush.push(
      plush
        .clone()
        .scale(scale, scale, scale)
        .translate(...base)
    );
    const transform = (v: V3): V3 => v.map((n, i) => n * scale + base[i]) as V3;
    p.plush.push(
      tube(
        [
          [0.11, 0.2, 0.088],
          [0.14, 0.16, 0.14],
          [0.14, 0.14, 0.153],
        ].map((v) => transform(v as V3)),
        0.001 * scale,
        CREAM,
        12
      )
    );
    const tag = transform([0.14, 0.113, 0.154]);
    add('paper', [0.049 * scale, 0.049 * scale, 0.002 * scale], tag, CREAM, 0.001);
    p.prints.push(card(0.048 * scale, [tag[0], tag[1], tag[2] + 0.0012 * scale], 2));
  }
  plush.dispose();
  // Counter tray: 5mm rubber feet, then a 24mm timber deck on the real 1.045m top.
  for (const x of [-9.25, -8.69])
    for (const z of [-0.205, 0.125]) add('paper', [0.036, 0.005, 0.036], [x, 1.0475, z], INK);
  add('timber', [0.74, 0.024, 0.46], [-8.97, 1.062, -0.04], '#b78c61');
  for (const z of [-0.262, 0.182])
    add('timber', [0.74, 0.025, 0.016], [-8.97, 1.0865, z], '#aa7a4a');
  add('timber', [0.018, 0.186, 0.186], [-8.599, 1.167, -0.04], '#aa7a4a');
  p.prints.push(card(0.175, [-8.589, 1.167, -0.04], 0, Math.PI / 2));
  // A two-tier, fully supported gift shelf on the incumbent magazine rack.
  for (const x of [-10.8, -10.2])
    for (const z of [2.87, 3.13]) add('paper', [0.034, 0.006, 0.034], [x, 1.203, z], INK);
  add('timber', [0.78, 0.024, 0.39], [-10.5, 1.218, 3], '#b78c61');
  for (const x of [-10.87, -10.13])
    add('timber', [0.025, 0.843, 0.025], [x, 1.6515, 2.823], '#aa7a4a');
  add('timber', [0.78, 0.024, 0.39], [-10.5, 1.638, 3], '#b78c61');
  add('timber', [0.78, 0.035, 0.014], [-10.5, 1.656, 3.188], '#aa7a4a');
  for (const x of [-10.75, -10.51]) {
    p.ceramic.push(createSouvenirMugGeometry([x, 1.65, 3.035]));
    p.prints.push(
      printed(
        new THREE.CylinderGeometry(0.0688, 0.064, 0.052, 16, 1, true, -0.39, 0.78).translate(
          x,
          1.733,
          3.035
        ),
        2
      )
    );
  }
  for (let i = 0; i < 3; i++) {
    const y = 1.755 + i * 0.008,
      z = 2.95 - i * 0.012;
    add('paper', [0.202, 0.202, 0.004], [-10.26, y, z], CREAM, 0.001);
    p.prints.push(card(0.2, [-10.26, y, z + 0.0023], 3));
  }
  add('timber', [0.25, 0.028, 0.1], [-10.26, 1.664, 2.942], '#aa7a4a');
  add('timber', [0.78, 0.035, 0.018], [-10.5, 2.055, 2.824], '#aa7a4a');
  add('timber', [0.206, 0.206, 0.016], [-10.5, 1.958, 2.824], '#aa7a4a');
  p.prints.push(card(0.193, [-10.5, 1.958, 2.833], 0));
  // Compact coffee-service console, clear of the fridge, machine and slush taps.
  for (const x of [-11.54, -10.66])
    for (const z of [-3.03, -2.57]) {
      add('paper', [0.058, 0.024, 0.058], [x, 0.092, z], INK);
      add('timber', [0.042, 0.893, 0.042], [x, 0.5505, z], '#aa7a4a');
    }
  add('timber', [1, 0.03, 0.58], [-11.1, 1, -2.8], '#b78c61');
  add('timber', [0.91, 0.02, 0.48], [-11.1, 0.53, -2.8], '#b78c61');
  add('timber', [0.89, 0.135, 0.016], [-11.1, 0.9, -2.518], '#aa7a4a');
  add('metal', [0.16, 0.015, 0.018], [-11.1, 0.906, -2.506], '#c5b695');
  // A folded linen cloth with a narrow green woven edge beneath the service kit.
  for (let i = 0; i < 3; i++)
    add(
      'paper',
      [0.91 - i * 0.004, 0.0007, 0.5 - i * 0.004],
      [-11.1, 1.01535 + i * 0.0007, -2.8],
      CREAM,
      0.00015
    );
  add('paper', [0.9, 0.0003, 0.013], [-11.1, 1.01725, -2.565], JADE, 0.00007);
  // Fitted serving tray, two scored pastries, six biscuits and serving tongs.
  for (const x of [-11.48, -11.18])
    for (const z of [-2.9, -2.68]) add('paper', [0.02, 0.002, 0.02], [x, 1.0184, z], INK, 0.0004);
  add('metal', [0.43, 0.016, 0.36], [-11.33, 1.027, -2.79], '#c6c2b2');
  for (const x of [-11.538, -11.122])
    add('metal', [0.014, 0.025, 0.36], [x, 1.0395, -2.79], '#c6c2b2');
  for (const z of [-2.963, -2.617])
    add('metal', [0.43, 0.025, 0.014], [-11.33, 1.0395, z], '#c6c2b2');
  for (const x of [-11.44, -11.29]) p.baked.push(pastry([x, 1.035, -2.844]));
  for (let i = 0; i < 6; i++) {
    const at: V3 = [-11.46 + (i % 3) * 0.089, 1.0405 + Math.floor(i / 3) * 0.011, -2.693];
    p.baked.push(
      coloured(new THREE.CylinderGeometry(0.034, 0.034, 0.011, 20).translate(...at), '#cfa358')
    );
    for (const x of [-0.013, 0.012])
      p.baked.push(
        ball([0.004, 0.0017, 0.004], [at[0] + x, at[1] + 0.0055, at[2] + x * 0.5], '#775036', 10)
      );
  }
  for (const x of [-11.155, -11.137])
    add('metal', [0.009, 0.006, 0.14], [x, 1.038, -2.79], '#b9b9ad');
  p.metal.push(
    coloured(
      new THREE.TorusGeometry(0.009, 0.003, 6, 12, Math.PI)
        .rotateX(-Math.PI / 2)
        .translate(-11.146, 1.038, -2.86),
      '#b9b9ad'
    )
  );
  // Branded paper cups: tapered walls, kraft sleeves and fitted sip lids.
  for (const z of [-2.7, -2.85, -3]) {
    p.paper.push(
      lathe(
        [
          [0, 0],
          [0.031, 0],
          [0.042, 0.133],
          [0.041, 0.138],
          [0.038, 0.136],
          [0.029, 0.009],
          [0, 0.009],
        ],
        [-10.82, 1.0174, z],
        CREAM
      )
    );
    p.paper.push(
      coloured(
        new THREE.CylinderGeometry(0.0387, 0.0352, 0.046, 20, 1, true).translate(-10.82, 1.0844, z),
        '#c0a780'
      )
    );
    p.prints.push(
      printed(
        new THREE.CylinderGeometry(0.0388, 0.0359, 0.038, 16, 1, true, -0.51, 1.02).translate(
          -10.82,
          1.0844,
          z
        ),
        2
      )
    );
    p.paper.push(
      lathe(
        [
          [0, 0],
          [0.039, 0],
          [0.044, 0.002],
          [0.044, 0.005],
          [0.039, 0.009],
          [0.03, 0.012],
          [0, 0.012],
        ],
        [-10.82, 1.1544, z],
        INK
      )
    );
    add('paper', [0.014, 0.001, 0.005], [-10.82, 1.167, z + 0.024], '#061e18', 0.0003);
  }
  p.ceramic.push(
    lathe(
      [
        [0, 0],
        [0.025, 0],
        [0.032, 0.076],
        [0.027, 0.079],
        [0.022, 0.007],
        [0, 0.007],
      ],
      [-11.04, 1.0174, -2.68],
      JADE
    )
  );
  for (let i = 0; i < 7; i++) {
    const g = box([0.006, 0.13, 0.0025], [0, 0, 0], '#c6a77a', 0.0006);
    g.rotateZ((i - 3) * 0.028).translate(
      -11.054 + (i % 3) * 0.012,
      1.14,
      -2.69 + Math.floor(i / 3) * 0.009
    );
    p.timber.push(g);
  }
  for (let i = 0; i < 8; i++)
    add(
      'paper',
      [0.15, 0.003, 0.09],
      [-10.87 + (i % 2) * 0.001, 1.0189 + i * 0.003, -2.576],
      '#eee7d1',
      0.0006
    );
  add('timber', [0.302, 0.302, 0.017], [-11.06, 1.253, -3.021], '#aa7a4a');
  p.prints.push(card(0.288, [-11.06, 1.253, -3.011], 1));
  for (const x of [-11.17, -10.95])
    add('timber', [0.012, 0.09, 0.012], [x, 1.0624, -3.021], '#aa7a4a');
  // Lidded, roll-rimmed biscuit tin rests on the lower console shelf.
  add('metal', [0.26, 0.135, 0.2], [-11.29, 0.6075, -2.77], '#b6b29d', 0.009);
  add('metal', [0.266, 0.018, 0.206], [-11.29, 0.684, -2.77], '#28715e', 0.006);
  p.prints.push(card(0.12, [-11.29, 0.606, -2.6685], 2));
  return Object.fromEntries(Object.entries(p).map(([key, parts]) => [key, join(parts)])) as Record<
    keyof typeof p,
    THREE.BufferGeometry
  >;
}
export const SHOP_KIT_GEOMETRY = createKitGeometry();

export const StationSouvenirs = React.memo(() => {
  const texture = useTexture(STATION_SOUVENIR_ART);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  const print = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture,
        vertexColors: true,
        roughness: 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [texture]
  );
  useEffect(() => () => print.dispose(), [print]);
  return (
    <group name="station-dead-dino-souvenir-kit">
      {(Object.keys(MATERIALS) as (keyof typeof MATERIALS)[]).map((key) => (
        <mesh
          key={key}
          name={`station-souvenir-${key}`}
          geometry={SHOP_KIT_GEOMETRY[key]}
          material={MATERIALS[key]}
          castShadow
          receiveShadow
        />
      ))}
      <mesh
        name="station-souvenir-raster-prints"
        geometry={SHOP_KIT_GEOMETRY.prints}
        material={print}
        receiveShadow
      />
    </group>
  );
});
StationSouvenirs.displayName = 'StationSouvenirs';
