import React from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { LOCK_GATE_MATERIAL } from './lockGateSurface';

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

function marketTrim() {
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
      parts.push(colored(g, i % 2 ? '#dac99d' : '#912d26'));
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

export const AuthoredPropTrim = React.memo<{ kind: keyof typeof AUTHORED_PROP_TRIM }>(
  ({ kind }) => (
    <mesh
      geometry={AUTHORED_PROP_TRIM[kind]}
      material={AUTHORED_PROP_TRIM_MATERIALS[kind]}
      receiveShadow
      castShadow={kind !== 'fountain'}
    />
  )
);
AuthoredPropTrim.displayName = 'AuthoredPropTrim';

/** Three tray floors on the delivered structural stall. Each trade owns its
 * complete stock, instead of overlaying different goods on baked green spheres.
 * Working if every visible product is seated above this measured surface and
 * all four stock meshes have distinct geometry while staying under the canvas.
 */
export const MARKET_TRAY_FLOOR = 0.9422;
function marketGoods(trade: number) {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, color: string, x: number, z: number, lift = 0) => {
    g.computeBoundingBox();
    g.translate(x, MARKET_TRAY_FLOOR - g.boundingBox!.min.y + lift, z);
    parts.push(colored(g, color));
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
    put(g, color, x, z);
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
    put(new THREE.SphereGeometry(r, 14, 10), '#879752', x, z);
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const g = new THREE.SphereGeometry(r * 1.03, 10, 7, -0.52, 1.04, 0.65, 1.65);
      g.rotateY(angle).translate(x, MARKET_TRAY_FLOOR + r, z);
      parts.push(colored(g, i % 2 ? '#738449' : '#9ca66b'));
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
    put(
      profile([
        [0, 0],
        [r * 0.94, 0],
        [r, 0.01],
        [r, 0.102],
        [r * 0.94, 0.115],
        [0, 0.115],
      ]),
      '#c49a48',
      x,
      z,
      lift
    );
    const band = new THREE.CylinderGeometry(r * 1.005, r * 1.005, 0.044, 16, 1, true);
    band.translate(x, MARKET_TRAY_FLOOR + lift + 0.056, z);
    parts.push(colored(band, '#debf77'));
  };
  const loaf = (x: number, z: number, round = false) => {
    const r = round ? 0.084 : 0.092;
    const g = round
      ? new THREE.SphereGeometry(r, 12, 8)
      : new THREE.CapsuleGeometry(r, 0.096, 5, 12).rotateX(Math.PI / 2);
    g.scale(1, 0.78, 1);
    put(g, round ? '#b98851' : '#ae7640', x, z);
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
      for (const dz of [-0.135, 0.135]) fruit(x, -0.83 + dz, 0.116, x < 0 ? '#b44f35' : '#b2813e');
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
        depth: 0.11,
        bevelEnabled: true,
        bevelSize: 0.003,
        bevelThickness: 0.003,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 8,
      });
      wedge.rotateX(-Math.PI / 2);
      put(wedge, '#dfbd69', x, z);
      for (let j = 0; j < 3; j++) {
        const dot = new THREE.CircleGeometry(0.009 + j * 0.002, 8)
          .rotateX(-Math.PI / 2)
          .translate(x + 0.06 + j * 0.049, MARKET_TRAY_FLOOR + 0.116, z - 0.032 - j * 0.02);
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
          z
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
  return joined(parts);
}
export const AUTHORED_MARKET_GOODS = [0, 1, 2, 3].map(marketGoods);
export const MarketGoods = React.memo<{ dressing: number }>(({ dressing }) => (
  <mesh
    name={`market-trade-${dressing}`}
    geometry={AUTHORED_MARKET_GOODS[((dressing % 4) + 4) % 4]}
    material={TRIM_MATERIAL}
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
