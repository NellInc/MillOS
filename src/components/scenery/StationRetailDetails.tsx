import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createColorDataTexture } from '../../utils/textureGenerator';

/** Authored, stationary shop dressing in station-local metres. Five merged draws,
 * including all printed goods; the retained GLBs still own the fixtures' bodies.
 * Working if goods have seated bases, labels face the aisle, and every batch has
 * finite bounds. No per-frame work, canvas allocation or third-party textures.
 */
const DRINK_COLORS = ['#a74336', '#538145', '#ca8638', '#437c94'];
const PACK_COLORS = ['#b54b3a', '#b68b36', '#4f7850', '#466b83', '#8e625a'];
const TILE_SIZE = 128;
export const RETAIL_LIGHT = {
  position: [-10.6, 4.15, -1.2] as [number, number, number],
  intensity: 48,
  distance: 8.5,
  color: '#fff4e4',
};

/** One padded sRGB atlas. Coloured fruit and grain emblems are deliberate print,
 * not generated pseudo-text. The white cell supplies untextured geometry too. */
export function createRetailAtlas() {
  const size = TILE_SIZE * 4;
  const bytes = new Uint8Array(size * size * 4);
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const cream = rgb('#f1e4c5'),
    ink = rgb('#414841');
  const colors = [...DRINK_COLORS, ...PACK_COLORS].map(rgb);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const tile = Math.floor(x / TILE_SIZE) + 4 * Math.floor(y / TILE_SIZE);
      const u = (x % TILE_SIZE) / TILE_SIZE,
        v = (y % TILE_SIZE) / TILE_SIZE;
      let c = [255, 255, 255];
      if (tile > 0) {
        c = cream;
        const accent = colors[(tile - 1) % colors.length];
        if (v < 0.1 || v > 0.9 || (tile >= 5 && u < 0.12)) c = accent;
        // Fruit disc / twin grain kernels, with a green stem and leaf.
        const circle = (cx: number, cy: number, radius: number) =>
          Math.hypot(u - cx, v - cy) < radius;
        if (tile <= 9) {
          if (circle(0.5, 0.52, 0.195)) c = accent;
          if (tile === 3 && Math.abs(u - 0.5) < 0.018 && v > 0.35 && v < 0.69) c = cream;
          if (tile === 3 && Math.abs(v - 0.52) < 0.018 && u > 0.33 && u < 0.68) c = cream;
          if (tile >= 5 && (circle(0.45, 0.58, 0.062) || circle(0.56, 0.46, 0.052))) c = cream;
          if (Math.abs(u - 0.5) < 0.012 && v > 0.7 && v < 0.77) c = ink;
          if (((u - 0.56) / 0.07) ** 2 + ((v - 0.735) / 0.025) ** 2 < 1) c = rgb('#637a45');
          if (v > 0.18 && v < 0.25 && u > 0.27 && u < 0.74 && Math.floor(u * 57) % 3) c = ink;
          if (v > 0.79 && v < 0.825 && u > 0.3 && u < 0.7) c = accent;
        } else if (tile <= 12) {
          c = rgb(tile === 10 ? '#ddd0ae' : tile === 11 ? '#bccbc5' : '#d6bfa3');
          if (v > 0.75 && v < 0.88 && u > 0.08 && u < 0.92) c = ink;
          if (v > 0.28 && v < 0.7 && u > 0.08 && u < 0.92) c = colors[tile - 9];
          if (v > 0.31 && v < 0.62 && Math.abs(u - 0.52) < (v - 0.24) * 0.7) c = cream;
          if (v > 0.1 && v < 0.22 && Math.floor(v * 90) % 4 === 0 && u > 0.08 && u < 0.88) c = ink;
        } else if (tile === 13) {
          if (v > 0.35 && v < 0.65 && u > 0.22 && u < 0.76 && Math.floor(u * 28) % 3) c = ink;
        } else if (tile === 14) {
          c = rgb('#102a2e');
          // A small idle till display. Seven-segment zeroes remain dark inside.
          for (const cx of [0.25, 0.49, 0.73]) {
            if (
              (Math.abs(u - cx) < 0.074 &&
                (Math.abs(v - 0.28) < 0.025 || Math.abs(v - 0.72) < 0.025)) ||
              (Math.abs(Math.abs(u - cx) - 0.074) < 0.02 && v > 0.28 && v < 0.72)
            )
              c = rgb('#9cceb2');
          }
          if (circle(0.38, 0.26, 0.016)) c = rgb('#9cceb2');
        } else {
          c = rgb('#21352e');
          if (circle(0.5, 0.5, 0.24)) c = rgb('#c6b888');
          if (u > 0.37 && u < 0.61 && v > 0.32 && v < 0.6) c = cream;
          if (Math.abs(u - 0.47) < 0.015 && v > 0.66 && v < 0.78) c = cream;
        }
      }
      const i = (y * size + x) * 4;
      bytes.set([...c, 255], i);
    }
  const texture = createColorDataTexture(bytes, size, size);
  texture.name = 'station-retail-authored-print';
  texture.anisotropy = 4;
  return texture;
}

export function createShopFloorTexture() {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  const light = [202, 191, 167],
    dark = [87, 94, 87],
    grout = [113, 111, 99];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const joint = x % 64 < 2 || y % 64 < 2;
      const c = joint ? grout : (Math.floor(x / 64) + Math.floor(y / 64)) % 2 ? dark : light;
      const grain = ((x * 13 + y * 29 + x * y) % 7) - 3;
      data.set([...c.map((v) => v + grain), 255], (y * size + x) * 4);
    }
  const texture = createColorDataTexture(data, size, size);
  texture.name = 'station-ceramic-checker';
  texture.repeat.set(7.5 / 1.2, 9.5 / 1.2);
  texture.anisotropy = 4;
  return texture;
}

const atlas = createRetailAtlas();
export const SHOP_FLOOR_MATERIAL = new THREE.MeshStandardMaterial({
  map: createShopFloorTexture(),
  roughness: 0.66,
});
const PRINT_MATERIAL = new THREE.MeshStandardMaterial({
  map: atlas,
  vertexColors: true,
  roughness: 0.48,
});
const HARDWARE_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.44,
  metalness: 0.38,
});
const GLASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#dae6e0',
  transparent: true,
  opacity: 0.14,
  roughness: 0.12,
  depthWrite: false,
});
const DISPLAY_MATERIAL = new THREE.MeshBasicMaterial({
  map: atlas,
  vertexColors: true,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

type V3 = [number, number, number];
function styled(g: THREE.BufferGeometry, color: string, tile = 0) {
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(color),
    data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(data, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      ((tile % 4) + 0.035 + (tile ? uv.getX(i) : 0.5) * 0.93) / 4,
      (Math.floor(tile / 4) + 0.035 + (tile ? uv.getY(i) : 0.5) * 0.93) / 4
    );
  }
  return g;
}
function joined(parts: THREE.BufferGeometry[]) {
  const plain = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((p) => p.dispose());
  if (!g) throw new Error('Station retail geometry attributes must match');
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
function box(size: V3, at: V3, color: string, radius = 0.006) {
  return styled(
    new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map((v) => v / 3))).translate(
      ...at
    ),
    color
  );
}
function lathe(profile: [number, number][], color: string, at: V3 = [0, 0, 0], segments = 16) {
  return styled(
    new THREE.LatheGeometry(
      profile.map((p) => new THREE.Vector2(...p)),
      segments
    ).translate(...at),
    color
  );
}
function label(w: number, h: number, at: V3, tile: number, yaw = 0) {
  return styled(new THREE.PlaneGeometry(w, h).rotateY(yaw).translate(...at), '#ffffff', tile);
}
export function createRetailBottleGeometry(color = DRINK_COLORS[0]) {
  // Closed underside and screw cap, round shoulders and narrow neck, 480 mm tall.
  return joined([
    lathe(
      [
        [0, 0],
        [0.087, 0],
        [0.102, 0.014],
        [0.105, 0.034],
        [0.102, 0.31],
        [0.099, 0.34],
        [0.086, 0.369],
        [0.052, 0.405],
        [0.045, 0.418],
        [0.045, 0.447],
        [0, 0.447],
      ],
      color
    ),
    lathe(
      [
        [0, 0.444],
        [0.05, 0.444],
        [0.052, 0.449],
        [0.052, 0.473],
        [0.048, 0.48],
        [0, 0.48],
      ],
      '#e5d5b0'
    ),
    lathe(
      [
        [0.046, 0.43],
        [0.052, 0.432],
        [0.052, 0.44],
        [0.046, 0.441],
      ],
      color
    ),
  ]);
}
export function createRetailPacketGeometry(color = PACK_COLORS[0], carton = false) {
  const g = new THREE.BoxGeometry(0.14, 0.3, 0.235, 2, 6, 2);
  if (!carton) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.abs(p.getY(i)) / 0.15);
      p.setX(i, p.getX(i) * (0.12 + 0.88 * Math.pow(1 - t, 0.4)));
      p.setZ(i, p.getZ(i) * (0.91 + 0.09 * t));
    }
    g.computeVertexNormals();
  }
  g.translate(0, 0.15, 0);
  return joined([
    styled(g, color),
    box([0.025, 0.012, 0.241], [0, 0.3, 0], color, 0.003),
    box([0.025, 0.01, 0.24], [0, 0.005, 0], color, 0.003),
  ]);
}
export const RETAIL_PRODUCTS = {
  bottles: [0, 1, 2, 3].flatMap((col) =>
    [0.4, 1.3, 2.2].flatMap((y) =>
      [-1, 0, 1].map((copy) => ({
        position: [-13.2 + col * 0.8 + copy * 0.215, y, -3.9] as V3,
        variant: col,
      }))
    )
  ),
  packets: [0.84, 1.64, 2.44, 3.24].flatMap((y, row) =>
    [-1.8, -0.9, 0, 0.9, 1.8].flatMap((z, col) =>
      [-1, 0, 1].map((copy) => ({
        position: [-14.65, y, z + copy * 0.25] as V3,
        variant: (col + row) % 5,
        carton: row % 2 === 1,
      }))
    )
  ),
};

function createPrintGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const item of RETAIL_PRODUCTS.bottles) {
    parts.push(createRetailBottleGeometry(DRINK_COLORS[item.variant]).translate(...item.position));
    // Open cylindrical band over the body; UVs wrap the fruit emblem to both sides.
    const band = new THREE.CylinderGeometry(0.106, 0.106, 0.163, 20, 1, true);
    band
      .rotateY(Math.PI)
      .translate(0, 0.199, 0)
      .translate(...item.position);
    parts.push(styled(band, '#ffffff', item.variant + 1));
  }
  for (const item of RETAIL_PRODUCTS.packets) {
    parts.push(
      createRetailPacketGeometry(PACK_COLORS[item.variant], item.carton).translate(...item.position)
    );
    const [x, y, z] = item.position;
    const face = new THREE.PlaneGeometry(0.182, 0.211, 1, 8).rotateY(Math.PI / 2);
    const points = face.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      // Follow the six actual pouch facets, not a smooth mathematical surface
      // that can dip through them. Working if no body fragment cuts the print.
      const segment = (points.getY(i) + 0.156) / 0.05;
      const lo = Math.floor(segment),
        fraction = segment - lo;
      const facetX = (index: number) =>
        0.07 * (0.12 + 0.88 * Math.pow(Math.max(0, 1 - Math.abs(index * 0.05 - 0.15) / 0.15), 0.4));
      const x = item.carton ? 0.07 : THREE.MathUtils.lerp(facetX(lo), facetX(lo + 1), fraction);
      points.setX(i, x + 0.0015);
    }
    face.computeVertexNormals();
    parts.push(styled(face.translate(x, y + 0.156, z), '#ffffff', item.variant + 5));
  }
  for (const y of [0.84, 1.64, 2.44, 3.24])
    for (const z of [-1.8, -0.9, 0, 0.9, 1.8]) {
      parts.push(label(0.145, 0.057, [-14.477, y - 0.045, z], 13, Math.PI / 2));
    }
  for (const y of [0.375, 1.275, 2.175])
    for (const x of [-13.2, -12.4, -11.6, -10.8]) {
      parts.push(label(0.22, 0.075, [x, y, -3.623], 13));
    }
  for (let i = 0; i < 3; i++) {
    const y = 0.27 + i * 0.34;
    parts.push(box([0.62, 0.29, 0.027], [-10.5, y, 3.228], '#e9debf'));
    parts.push(label(0.59, 0.268, [-10.5, y, 3.244], 10 + i));
  }
  // Register operator key bank and the three-colour payment terminal.
  for (let col = 0; col < 3; col++)
    for (let row = 0; row < 3; row++) {
      const localX = -0.14 + col * 0.05;
      parts.push(
        box([0.042, 0.009, 0.037], [0, 0, 0], '#d8d3bc', 0.003)
          .rotateZ(Math.atan(0.27))
          .translate(-9 + localX, 1.2825 + localX * 0.27 + 0.007, -1.063 + row * 0.047)
      );
      parts.push(
        box(
          [0.029, 0.01, 0.027],
          [-9.045 + col * 0.045, 1.145, -0.461 + row * 0.04],
          row === 2 ? ['#b65447', '#c7af50', '#5c9362'][col] : '#c4c3b5',
          0.003
        )
      );
    }
  // Receipt leaves the register's operator side, above a real drawer seam.
  parts.push(box([0.002, 0.022, 0.19], [-9.252, 1.175, -0.96], '#171c1a', 0.0005));
  parts.push(
    styled(
      new THREE.PlaneGeometry(0.078, 0.084)
        .rotateY(-Math.PI / 2)
        .rotateZ(0.18)
        .translate(-9.276, 1.137, -0.96),
      '#e6dfc9',
      13
    )
  );
  // Coffee cup with a real open rim and dark drink below it.
  parts.push(
    lathe(
      [
        [0.052, 0.48],
        [0.071, 0.62],
        [0.075, 0.624],
        [0.074, 0.631],
        [0.068, 0.631],
        [0.063, 0.616],
        [0.048, 0.494],
      ],
      '#e8ddbf',
      [-9.47, 0, -3.5]
    )
  );
  parts.push(
    styled(
      new THREE.CircleGeometry(0.063, 16).rotateX(-Math.PI / 2).translate(-9.47, 0.615, -3.5),
      '#493425'
    )
  );
  // Rounded food ends, resting on stainless rollers instead of hovering in a box.
  for (const z of [-0.15, 0, 0.15]) {
    parts.push(
      styled(
        new THREE.CapsuleGeometry(0.038, 0.33, 4, 10)
          .rotateZ(Math.PI / 2)
          .translate(-10, 1.15, -0.5 + z),
        '#ae6441'
      )
    );
  }
  return joined(parts);
}

function createHardwareGeometry() {
  const p: THREE.BufferGeometry[] = [],
    metal = '#b6bcb3',
    black = '#29322e',
    orange = '#a4522f';
  const b = (s: V3, a: V3, c = metal, r = 0.006) => p.push(box(s, a, c, r));
  // Fridge service grille, door rails, hinges and shelf lips, inside the old shell.
  for (let i = 0; i < 5; i++)
    b([3.72, 0.025, 0.055], [-12, 0.105 + i * 0.047, -3.567], black, 0.003);
  for (const x of [-13.89, -12.045, -11.955, -10.11])
    b([0.035, 2.47, 0.035], [x, 1.605, -3.557], metal, 0.003);
  for (const x of [-13.91, -10.09])
    for (const y of [0.55, 2.62]) b([0.058, 0.14, 0.043], [x, y, -3.544], metal, 0.006);
  for (const y of [0.375, 1.275, 2.175]) b([3.77, 0.064, 0.018], [-12, y, -3.638], metal, 0.004);
  // Shelf leading edges and vertical dividers are furniture, all below goods.
  for (const y of [0.8, 1.6, 2.4, 3.2]) b([0.024, 0.055, 5.47], [-14.492, y, 0], '#a28f6a', 0.002);
  for (const z of [-2.72, 2.72]) b([0.07, 3.24, 0.065], [-14.94, 1.7, z], '#67563c');
  // Counter fronts: inset panels, kick rail and a narrow rounded working edge.
  b([0.055, 0.085, 2.46], [-8.232, 0.115, -1], black);
  for (const z of [-1.79, -1, -0.21]) {
    b([0.035, 0.62, 0.024], [-8.237, 0.56, z], '#3e3830', 0.003);
    b([0.028, 0.026, 0.72], [-8.239, 0.86, z], '#8b7655', 0.003);
  }
  b([0.025, 0.04, 2.53], [-8.208, 1.025, -1], metal);
  // Magazine display ledges support all three visible issues.
  for (let i = 0; i < 3; i++) b([0.66, 0.022, 0.078], [-10.5, 0.118 + i * 0.34, 3.24], '#aa9670');
  // Coffee fascia, dosing head, drip grille and seated cup platform, facing +X.
  // The delivered housing owns the actual recessed bay; don't cover it with
  // a flat opaque fascia. Working if the spouts remain in front of that recess.
  b([0.16, 0.055, 0.4], [-9.49, 0.455, -3.5], metal);
  for (let i = 0; i < 7; i++)
    b([0.146, 0.007, 0.017], [-9.49, 0.487, -3.66 + i * 0.053], black, 0.001);
  b([0.13, 0.11, 0.19], [-9.53, 0.95, -3.5], metal);
  for (const z of [-3.545, -3.455])
    p.push(
      lathe(
        [
          [0, 0.845],
          [0.015, 0.845],
          [0.015, 0.905],
          [0, 0.905],
        ],
        metal,
        [-9.48, 0, z],
        8
      )
    );
  for (let i = 0; i < 7; i++)
    b([0.013, 0.018, 0.38], [-9.589, 0.125 + i * 0.035, -3.5], black, 0.001);
  for (const z of [-3.64, -3.36]) b([0.025, 0.045, 0.045], [-9.567, 1.23, z], '#d4cbb3');
  for (const z of [-3.84, -3.16]) b([0.025, 1.88, 0.018], [-9.597, 1.1, z], metal, 0.003);
  // Till drawer seam and side vents sit below the sloping operator deck.
  b([0.004, 0.011, 0.35], [-9.252, 1.095, -1], black, 0.001);
  b([0.008, 0.017, 0.1], [-9.257, 1.082, -1], metal, 0.002);
  for (let i = 0; i < 5; i++)
    b([0.13, 0.006, 0.003], [-9.01, 1.112 + i * 0.018, -1.202], black, 0.001);
  // Twin cylindrical slush hoppers, domed lids, collars and tapered tap heads.
  for (const x of [-10.15, -9.85]) {
    p.push(
      lathe(
        [
          [0, 1.595],
          [0.137, 1.595],
          [0.137, 1.617],
          [0.125, 1.646],
          [0.085, 1.665],
          [0, 1.673],
        ],
        black,
        [x, 0, -1.9]
      )
    );
    p.push(
      lathe(
        [
          [0.119, 1.014],
          [0.128, 1.014],
          [0.128, 1.05],
          [0.119, 1.05],
        ],
        metal,
        [x, 0, -1.9]
      )
    );
    b([0.098, 0.12, 0.094], [x, 0.833, -1.707], black, 0.02);
    b([0.05, 0.13, 0.027], [x, 0.927, -1.653], '#cbbd9c', 0.012);
  }
  b([0.66, 0.075, 0.24], [-10, 0.684, -1.76], black, 0.012);
  for (let i = 0; i < 10; i++)
    b([0.027, 0.009, 0.21], [-10.28 + i * 0.062, 0.726, -1.76], metal, 0.002);
  // The grill used to float at y=.7. This toe-recessed cupboard seats it on the floor.
  b([0.58, 0.57, 0.47], [-10, 0.395, -0.5], orange, 0.013);
  b([0.51, 0.1, 0.4], [-10, 0.13, -0.5], black);
  b([0.016, 0.39, 0.012], [-9.703, 0.413, -0.5], black, 0.002);
  b([0.03, 0.07, 0.017], [-9.697, 0.56, -0.51], metal);
  for (let i = 0; i < 6; i++) {
    const roller = lathe(
      [
        [0, -0.245],
        [0.022, -0.245],
        [0.022, 0.245],
        [0, 0.245],
      ],
      metal,
      [0, 0, 0],
      10
    );
    roller.rotateZ(Math.PI / 2).translate(-10, 1.1, -0.71 + i * 0.084);
    p.push(roller);
  }
  for (const x of [-10.28, -9.72]) b([0.018, 0.3, 0.02], [x, 1.265, -0.7], metal, 0.003);
  for (const z of [-0.71, -0.29]) b([0.57, 0.012, 0.015], [-10, 1.411, z], metal, 0.002);
  // Interior skirting and the existing orange/charcoal identity continue inside.
  for (const z of [-4.79, 4.79]) {
    if (z < 0) b([7.57, 0.115, 0.034], [-12, 0.145, z], black, 0.003);
    else for (const x of [-14.22, -9.78]) b([3.13, 0.115, 0.034], [x, 0.145, z], black, 0.003);
    b([7.57, 0.15, 0.026], [-12, 3.71, z], orange, 0.002);
    b([7.57, 0.065, 0.028], [-12, 3.55, z], black, 0.002);
  }
  b([0.034, 0.115, 9.51], [-15.78, 0.145, 0], black, 0.003);
  b([0.034, 0.15, 9.51], [-15.78, 3.71, 0], orange, 0.002);
  b([0.035, 0.065, 9.51], [-15.78, 3.55, 0], black, 0.002);
  // Recessed ceiling cassette replaces the previous floating bright slab.
  b([1.62, 0.12, 1.62], [-12, 4.49, 0], black, 0.01);
  for (const x of [-12.77, -11.23]) b([0.032, 0.025, 1.54], [x, 4.418, 0], metal);
  return joined(p);
}
function createGlassGeometry() {
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-10.15, -9.85])
    p.push(
      styled(
        new THREE.CylinderGeometry(0.121, 0.121, 0.55, 16, 1, true).translate(x, 1.312, -1.9),
        '#ffffff'
      )
    );
  // Three panes with open customer side; no translucent solid box over the food.
  p.push(styled(new THREE.PlaneGeometry(0.56, 0.3).translate(-10, 1.26, -0.714), '#ffffff'));
  for (const x of [-10.282, -9.718])
    p.push(
      styled(
        new THREE.PlaneGeometry(0.42, 0.3)
          .rotateY(x < -10 ? -Math.PI / 2 : Math.PI / 2)
          .translate(x, 1.26, -0.5),
        '#ffffff'
      )
    );
  p.push(
    styled(
      new THREE.PlaneGeometry(0.56, 0.42).rotateX(-Math.PI / 2).translate(-10, 1.413, -0.5),
      '#ffffff'
    )
  );
  return joined(p);
}
function createSlushGeometry() {
  return joined(
    [-10.15, -9.85].map((x, i) =>
      lathe(
        [
          [0, 1.042],
          [0.095, 1.042],
          [0.107, 1.064],
          [0.107, 1.465],
          [0.084, 1.478],
          [0, 1.493],
        ],
        i === 0 ? '#b94743' : '#407f9e',
        [x, 0, -1.9]
      )
    )
  );
}
export const RETAIL_GEOMETRY = {
  goods: createPrintGeometry(),
  hardware: createHardwareGeometry(),
  glass: createGlassGeometry(),
  slush: createSlushGeometry(),
  displays: joined([
    label(0.3, 0.2, [-8.739, 1.235, -1], 14, Math.PI / 2),
    label(0.36, 0.44, [-9.588, 1.5, -3.5], 15, Math.PI / 2),
  ]),
};

export const StationRetailDetails = React.memo(() => (
  <group name="station-authored-retail">
    <mesh
      name="station-retail-goods"
      geometry={RETAIL_GEOMETRY.goods}
      material={PRINT_MATERIAL}
      castShadow
      receiveShadow
    />
    <mesh
      name="station-retail-hardware"
      geometry={RETAIL_GEOMETRY.hardware}
      material={HARDWARE_MATERIAL}
      castShadow
      receiveShadow
    />
    <mesh
      name="station-retail-slush"
      geometry={RETAIL_GEOMETRY.slush}
      material={HARDWARE_MATERIAL}
      receiveShadow
    />
    <mesh name="station-retail-glass" geometry={RETAIL_GEOMETRY.glass} material={GLASS_MATERIAL} />
    <mesh
      name="station-retail-displays"
      geometry={RETAIL_GEOMETRY.displays}
      material={DISPLAY_MATERIAL}
    />
    <pointLight
      name="station-interior-fixture-light"
      {...RETAIL_LIGHT}
      decay={2}
      castShadow={false}
    />
  </group>
));
StationRetailDetails.displayName = 'StationRetailDetails';
