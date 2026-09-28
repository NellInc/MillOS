import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Four short planted reaches leave the lamps, benches and most of the bank open. */
export const LAKE_REED_REACHES = [0.65, 2.1, 3.8, 5.05] as const;
const TAU = Math.PI * 2;

/** Sample the actual five-row bank triangles, then apply its scene transform.
 * Working if every root ray hits the rendered bank within 15 mm of its foot.
 */
export function sampleLakeBank(
  bank: THREE.BufferGeometry,
  angle: number,
  row = 2.2
): THREE.Vector3 {
  const p = bank.getAttribute('position');
  const segments = p.count / 5 - 1;
  const progress = ((((angle % TAU) + TAU) % TAU) / TAU) * segments;
  const segment = Math.floor(progress);
  const along = progress - segment;
  const lower = Math.min(3, Math.max(0, Math.floor(row)));
  const across = THREE.MathUtils.clamp(row - lower, 0, 1);
  const a = new THREE.Vector3().fromBufferAttribute(p, segment * 5 + lower);
  const b = new THREE.Vector3().fromBufferAttribute(p, (segment + 1) * 5 + lower);
  const c = new THREE.Vector3().fromBufferAttribute(p, segment * 5 + lower + 1);
  const d = new THREE.Vector3().fromBufferAttribute(p, (segment + 1) * 5 + lower + 1);
  const point =
    along + across <= 1
      ? a
          .multiplyScalar(1 - along - across)
          .addScaledVector(b, along)
          .addScaledVector(c, across)
      : d
          .multiplyScalar(along + across - 1)
          .addScaledVector(c, 1 - along)
          .addScaledVector(b, 1 - across);
  return new THREE.Vector3(point.x, point.z + 0.08, -point.y);
}

function tint(geometry: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function assemble(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error(`Cannot assemble ${name}`);
  geometry.name = name;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function leaf(
  root: THREE.Vector3,
  yaw: number,
  height: number,
  bend: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment <= 4; segment++) {
    const t = segment / 4;
    const width = segment === 4 ? 0.002 : 0.055 * Math.sin((0.15 + t * 0.85) * Math.PI);
    for (const side of [-1, 1]) {
      positions.push(
        root.x + Math.sin(yaw) * bend * t * t + Math.cos(yaw) * width * side,
        root.y + height * (t - 0.16 * t * t),
        root.z + Math.cos(yaw) * bend * t * t - Math.sin(yaw) * width * side
      );
      uvs.push((side + 1) / 2, t);
    }
    if (segment < 4) {
      const i = segment * 2;
      indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Shore details replace fifteen misplaced submerged sticks with two batched
 * surfaces. No per-frame work or random layout; stones sink into the same bank.
 * Working if four varied clumps are grounded and over 70% of the shore stays open.
 */
export function createLakeShoreDetails(bank: THREE.BufferGeometry) {
  const vegetation: THREE.BufferGeometry[] = [];
  const stones: THREE.BufferGeometry[] = [];
  const roots: THREE.Vector3[] = [];
  const stoneSeats: THREE.Vector3[] = [];
  // Uneven spacing and bank-depth offsets make sheaves rather than a planted row.
  const offsets = [-0.074, -0.06, -0.022, -0.009, 0.006, 0.039, 0.057];
  const rows = [2.55, 1.7, 2.85, 2.1, 1.65, 2.55, 1.85];
  LAKE_REED_REACHES.forEach((centre, reach) => {
    for (let clump = 0; clump < 7; clump++) {
      const angle = centre + offsets[clump] + Math.sin(reach * 2 + clump) * 0.004;
      const root = sampleLakeBank(bank, angle, rows[(clump + reach) % rows.length]);
      root.y -= 0.015;
      roots.push(root);
      for (let blade = 0; blade < 7; blade++) {
        const yaw = blade * 2.39996 + reach * 0.8 + clump * 0.6;
        const maturity = 0.68 + ((clump * 3 + reach) % 5) * 0.08;
        const height = (0.65 + ((blade * 3 + clump * 5 + reach) % 9) * 0.095) * maturity;
        vegetation.push(
          tint(
            leaf(root, yaw, height, 0.2 + (blade % 3) * 0.12),
            ['#596b36', '#718044', '#3e603d'][(blade + clump) % 3]
          )
        );
      }
      if (clump % 2 === 0) {
        const height = 0.91 + ((clump * 3 + reach) % 5) * 0.12;
        vegetation.push(
          tint(
            new THREE.CylinderGeometry(0.014, 0.023, height, 5).translate(
              root.x,
              root.y + height / 2,
              root.z
            ),
            '#6d7842'
          )
        );
        vegetation.push(
          tint(
            new THREE.CylinderGeometry(0.045, 0.052, 0.22, 6).translate(
              root.x,
              root.y + height - 0.09,
              root.z
            ),
            '#655039'
          )
        );
      }
    }
    for (let index = 0; index < 2; index++) {
      const seat = sampleLakeBank(bank, centre + (index ? 0.13 : -0.12), 2.6);
      stoneSeats.push(seat);
      const stone = new THREE.SphereGeometry(1, 8, 5)
        .scale(0.35 + index * 0.13, 0.22, 0.28 + reach * 0.025)
        .rotateY(centre + index)
        .translate(seat.x, seat.y + 0.05, seat.z);
      stones.push(tint(stone, index ? '#817e6b' : '#6b7065'));
    }
  });
  return {
    vegetation: assemble(vegetation, 'lake-shore-reeds'),
    stones: assemble(stones, 'lake-shore-stones'),
    roots,
    stoneSeats,
  };
}
