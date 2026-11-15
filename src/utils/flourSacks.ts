import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getFlourSackMaps, getFlourSackPrint } from '../textures/grain';
import { POLYGON_OFFSET } from '../constants/renderLayers';
import { applyWorldSurface } from './worldSurface';

export const FLOUR_SACK_HEIGHT = 0.3;
export const FLOUR_INK_STANDOFF = 0.001;

/**
 * Lay-flat filled sack, shared by the belt and carried pallets.
 * The 84-triangle topology is also the source of the retained texture atlas.
 * Working if the soft shoulders frame a flat printed top, and both the
 * authored fallback and atlas attachment have exactly the same silhouette.
 */
const createFlourSackGeometry = (): THREE.BufferGeometry => {
  const geometry = new THREE.BoxGeometry(0.6, FLOUR_SACK_HEIGHT, 0.9, 3, 2, 3);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normals = geometry.attributes.normal as THREE.BufferAttribute;
  const normal = new THREE.Vector3();
  const radius = 0.1;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    normal
      .set(
        Math.sign(x) * Math.max(0, Math.abs(x) / 0.3 - 1 / 3),
        y / (FLOUR_SACK_HEIGHT / 2),
        Math.sign(z) * Math.max(0, Math.abs(z) / 0.45 - 1 / 3)
      )
      .normalize();
    position.setXYZ(
      i,
      Math.sign(x) * (0.3 - radius) + normal.x * radius,
      Math.sign(y) * (FLOUR_SACK_HEIGHT / 2 - radius) + normal.y * radius,
      Math.sign(z) * (0.45 - radius) + normal.z * radius
    );
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  position.needsUpdate = true;
  normals.needsUpdate = true;
  return geometry;
};

let flourSackGeometryCache: THREE.BufferGeometry | null = null;
export const getFlourSackGeometry = (): THREE.BufferGeometry => {
  if (!flourSackGeometryCache) flourSackGeometryCache = createFlourSackGeometry();
  return flourSackGeometryCache;
};

/**
 * One shared sack material for every instance. `color` is white because the
 * correctly tagged sRGB albedo map already carries the cloth hue. Per-instance
 * colour supplies the restrained hover highlight without another draw call.
 */
let flourSackMaterialCache: THREE.MeshStandardMaterial | null = null;

export const getFlourSackMaterial = (): THREE.MeshStandardMaterial => {
  if (flourSackMaterialCache) return flourSackMaterialCache;

  const source = getFlourSackMaps();
  const tile = (texture: THREE.Texture): THREE.Texture => {
    const clone = texture.clone();
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(1, 1);
    clone.needsUpdate = true;
    return clone;
  };

  flourSackMaterialCache = new THREE.MeshStandardMaterial({
    name: 'flour-sack-cloth',
    color: '#ffffff',
    map: tile(source.map),
    normalMap: tile(source.normal),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: tile(source.roughness),
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.7,
  });

  // `fabric` in OBJECT rest space: these sacks travel the length of the belt,
  // and a world-space field would make the weave swim across a bag as it moves
  // through it.
  //
  // Treated in place rather than on a clone. `THREE.Material.copy()` runs
  // userData through `JSON.parse(JSON.stringify(...))` and does NOT copy
  // `onBeforeCompile`, so cloning a material that already carries the treatment
  // produces a JSON ghost - the bookkeeping without the shader, and permanently
  // deaf to the A/B toggle.
  applyWorldSurface(flourSackMaterialCache, 'fabric');
  return flourSackMaterialCache;
};

export const FLOUR_STRIPE_GEOMETRY = new THREE.PlaneGeometry(0.34, 0.5);

/** Top artwork and side wordmarks share the existing product-neutral ink batch. */
const createFlourSackPrintGeometry = (): THREE.BufferGeometry => {
  const projectionMaterial = new THREE.MeshBasicMaterial();
  const sack = new THREE.Mesh(getFlourSackGeometry(), projectionMaterial);
  const ray = new THREE.Raycaster();
  const outward = new THREE.Vector3();
  const point = new THREE.Vector3();
  const parts = [
    FLOUR_STRIPE_GEOMETRY.clone()
      .rotateX(-Math.PI / 2)
      .translate(0, FLOUR_SACK_HEIGHT / 2 + FLOUR_INK_STANDOFF, 0),
  ];
  for (const axis of ['x', 'z'] as const) {
    for (const side of [-1, 1]) {
      // The middle row follows the bag's shoulder fold rather than bridging it.
      const plate = new THREE.PlaneGeometry(axis === 'x' ? 0.6 : 0.34, 0.08, 1, 2);
      const uv = plate.getAttribute('uv');
      // Crop the MillOS wordmark band; shared cargo has no product/lot identity.
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, 0.125 + uv.getX(i) * 0.75, 52 / 128 + (uv.getY(i) * 28) / 128);
      plate.rotateY(axis === 'x' ? (side * Math.PI) / 2 : side < 0 ? Math.PI : 0);
      plate.translate(
        axis === 'x' ? side * (0.3 + FLOUR_INK_STANDOFF) : 0,
        0,
        axis === 'z' ? side * (0.45 + FLOUR_INK_STANDOFF) : 0
      );
      outward.set(axis === 'x' ? side : 0, 0, axis === 'z' ? side : 0);
      const positions = plate.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i);
        ray.set(point, outward.clone().negate());
        const hit = ray.intersectObject(sack)[0];
        if (!hit) throw new Error('Flour side print has no supporting cloth');
        point.copy(hit.point).addScaledVector(outward, FLOUR_INK_STANDOFF);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      plate.computeVertexNormals();
      parts.push(plate);
    }
  }
  projectionMaterial.dispose();
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('Cannot assemble flour sack ink');
  merged.name = 'flour-sack-print';
  return merged;
};
export const FLOUR_SACK_PRINT_GEOMETRY = createFlourSackPrintGeometry();

export const FLOUR_STRIPE_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'flour-sack-ink',
  color: '#ffffff',
  map: getFlourSackPrint(),
  alphaTest: 0.5,
  roughness: 0.95,
  metalness: 0,
  // Alpha-tested ink is opaque. It must write depth because material sorting
  // may draw it before the cloth; discarded texels still reveal the sack.
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.standard.factor,
  polygonOffsetUnits: POLYGON_OFFSET.standard.units,
});

// Small pallet labels reach the third mip even in a close vehicle view.
// A 0.5 cutoff erased all but five texels there; retain the thin printed strokes.
export const PALLET_PRINT_ALPHA_TEST = 0.08;

/**
 * One stable stack shared by the forklift detail tiers. The load stays within
 * the original 0.9 x 0.8 m pallet footprint; its bottom remains on the same
 * carrier datum. Working if six layers sit on the deck without intersecting,
 * and the existing mast transform moves timber, cloth and ink together.
 */
export const PALLET_SACK_LAYOUT = Array.from({ length: 6 }, (_, layer) => {
  const crossBond = layer % 2 === 1;
  // Cross-bonded courses bridge the seam below. Millimetre-scale offsets keep
  // soft shoulders from reading as identical columns without leaning the load.
  const settle = [0, 0.004, -0.003, 0.002, -0.004, 0][layer];
  return [-1, 1].map((side) => ({
    position: [
      crossBond ? settle : side * 0.225,
      0.15 + layer * 0.18,
      crossBond ? side * 0.2 : settle,
    ] as const,
    scale: [crossBond ? 0.64 : 0.74, 0.18 / FLOUR_SACK_HEIGHT, crossBond ? 0.97 : 0.87] as const,
    rotationY: crossBond ? Math.PI / 2 : 0,
  }));
}).flat();

/**
 * One sawn timber: a flat-sided prism of the given cross-section, laid along
 * x or z. `section` is [across, up] in metres, anticlockwise seen from the
 * far end. Faces are flat-shaded, because sawn timber has arrises, and each
 * carries `tint` as a vertex colour (the sawn ends darker) for materials that
 * read it.
 */
const timberPrism = (
  section: readonly (readonly [number, number])[],
  length: number,
  axis: 'x' | 'z',
  centre: readonly [number, number, number],
  tint: number
): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const half = length / 2;
  // Local frame is [across, up, along]; a timber laid along x is that frame
  // turned a quarter turn about the vertical.
  const place = (across: number, up: number, along: number): [number, number, number] =>
    axis === 'z' ? [across, up, along] : [along, up, -across];
  const corner = (
    point: readonly [number, number],
    along: number,
    normal: readonly [number, number, number],
    shade: number,
    u: number,
    v: number
  ) => {
    const p = place(point[0], point[1], along);
    positions.push(p[0] + centre[0], p[1] + centre[1], p[2] + centre[2]);
    normals.push(...place(normal[0], normal[1], normal[2]));
    uvs.push(u, v);
    colors.push(shade, shade, shade);
  };
  section.forEach((from, i) => {
    const to = section[(i + 1) % section.length];
    const run = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const normal = [(to[1] - from[1]) / run, -(to[0] - from[0]) / run, 0] as const;
    const v0 = i / section.length;
    const v1 = (i + 1) / section.length;
    corner(from, half, normal, tint, 1, v0);
    corner(from, -half, normal, tint, 0, v0);
    corner(to, -half, normal, tint, 0, v1);
    corner(from, half, normal, tint, 1, v0);
    corner(to, -half, normal, tint, 0, v1);
    corner(to, half, normal, tint, 1, v1);
  });
  for (const end of [1, -1]) {
    const normal = [0, 0, end] as const;
    for (let i = 1; i < section.length - 1; i++) {
      const fan =
        end > 0
          ? [section[0], section[i], section[i + 1]]
          : [section[0], section[i + 1], section[i]];
      for (const point of fan) corner(point, end * half, normal, tint * 0.8, point[0], point[1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
};

interface FlourPalletGeometry {
  pallet: THREE.BufferGeometry;
  sacks: THREE.BufferGeometry;
  ink: THREE.BufferGeometry;
}

let flourPalletGeometry: FlourPalletGeometry | null = null;
export function getFlourPalletGeometry(): FlourPalletGeometry {
  if (flourPalletGeometry) return flourPalletGeometry;
  const merge = (parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry => {
    const merged = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!merged) throw new Error(`Cannot assemble ${name}`);
    merged.name = name;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  };
  const timber: THREE.BufferGeometry[] = [];
  // Open deck, blocks and runners leave genuine fork-entry gaps. Five deck
  // boards run the way the forks enter, their top edges planed off; nine
  // blocks stand flush with the pallet's edges, as a block pallet's do; three
  // runners tie the blocks together underneath. Each piece carries its own
  // tone, and sawn ends are darker, so the boards read one by one.
  const chamfer = 0.006;
  const deckSection = (halfWidth: number, halfHeight: number) =>
    [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight - chamfer],
      [halfWidth - chamfer, halfHeight],
      [-halfWidth + chamfer, halfHeight],
      [-halfWidth, halfHeight - chamfer],
    ] as const;
  const rectSection = (halfWidth: number, halfHeight: number) =>
    [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ] as const;
  [-0.37, -0.18, 0, 0.18, 0.37].forEach((x, board) => {
    timber.push(
      timberPrism(
        deckSection(0.08, 0.0175),
        0.8,
        'z',
        [x, 0.0425, 0],
        [1, 0.92, 0.98, 0.9, 0.96][board]
      )
    );
  });
  [-0.35, 0, 0.35].forEach((z, row) => {
    timber.push(
      timberPrism(rectSection(0.05, 0.0125), 0.9, 'x', [0, -0.0475, z], [0.94, 0.88, 0.97][row])
    );
    [
      [-0.365, 0.085],
      [0, 0.06],
      [0.365, 0.085],
    ].forEach(([x, halfWidth], column) => {
      timber.push(
        timberPrism(
          rectSection(halfWidth, 0.03),
          0.1,
          'z',
          [x, -0.005, z],
          0.8 + ((row * 3 + column) % 4) * 0.035
        )
      );
    });
  });
  const sacks: THREE.BufferGeometry[] = [];
  const ink: THREE.BufferGeometry[] = [];
  for (const { position, scale, rotationY } of PALLET_SACK_LAYOUT) {
    sacks.push(
      getFlourSackGeometry()
        .clone()
        .scale(...scale)
        .rotateY(rotationY)
        .translate(...position)
    );
    ink.push(
      FLOUR_SACK_PRINT_GEOMETRY.clone()
        .scale(...scale)
        .rotateY(rotationY)
        .translate(...position)
    );
  }
  flourPalletGeometry = {
    pallet: merge(timber, 'flour-pallet-timber'),
    sacks: merge(sacks, 'flour-pallet-sacks'),
    ink: merge(ink, 'flour-pallet-ink'),
  };
  return flourPalletGeometry;
}
