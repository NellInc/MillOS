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

export function createLakeReedLeaf(
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
    for (const side of [-1, 0, 1]) {
      positions.push(
        root.x + Math.sin(yaw) * bend * t * t + Math.cos(yaw) * width * side,
        root.y + height * (t - 0.16 * t * t) + (side === 0 ? width * 0.28 : 0),
        root.z + Math.cos(yaw) * bend * t * t - Math.sin(yaw) * width * side
      );
      uvs.push((side + 1) / 2, t);
    }
    if (segment < 4) {
      const i = segment * 3;
      for (let strip = 0; strip < 2; strip++) {
        const a = i + strip;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Mild angular asymmetry, continuous at the seam and poles. Working if the
 * same eight stones keep their footprint but cease reading as scaled balls.
 */
export function createLakeShoreStone(width: number, depth: number, phase: number) {
  const stone = new THREE.SphereGeometry(1, 8, 5);
  const p = stone.getAttribute('position');
  const sphereNormals = stone.getAttribute('normal').clone();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const shoulder = 1 + 0.11 * Math.sin(x * 3 + z * 4 + phase) + 0.06 * y;
    p.setXYZ(
      i,
      (x * shoulder + 0.08 * y) * width,
      (y * (0.88 + 0.12 * Math.cos(x * 3 - z * 2 + phase)) + 0.05 * x) * 0.22,
      z * (1 + 0.1 * Math.sin(x * 2 - y * 3 + phase)) * depth
    );
  }
  stone.computeVertexNormals();
  // SphereGeometry keeps unused seam/pole duplicates. Recalculation gives
  // those unreferenced vertices zero normals; retain their valid radial data.
  const normals = stone.getAttribute('normal');
  for (let i = 0; i < normals.count; i++)
    if (Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) < 0.5)
      normals.setXYZ(i, sphereNormals.getX(i), sphereNormals.getY(i), sphereNormals.getZ(i));
  return stone;
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
  const supportMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const support = new THREE.Mesh(bank, supportMaterial);
  support.rotation.x = -Math.PI / 2;
  support.position.y = 0.08;
  support.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
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
        const bladeGeometry = tint(
          createLakeReedLeaf(root, yaw, height, 0.2 + (blade % 3) * 0.12),
          ['#596b36', '#718044', '#3e603d'][(blade + clump) % 3]
        );
        const colours = bladeGeometry.getAttribute('color');
        for (let i = 0; i < colours.count; i++) {
          const t = Math.floor(i / 3) / 4;
          const shade = 0.8 + 0.22 * t + (i % 3 === 1 ? 0.04 : 0);
          colours.setXYZ(
            i,
            colours.getX(i) * shade,
            colours.getY(i) * shade,
            colours.getZ(i) * shade
          );
        }
        vegetation.push(bladeGeometry);
      }
      if (clump % 2 === 0) {
        const height = 0.91 + ((clump * 3 + reach) % 5) * 0.12;
        const direction = new THREE.Vector3(
          Math.sin(angle * 3 + clump) * 0.075,
          height,
          Math.cos(angle * 2 - clump) * 0.065
        );
        const lean = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize()
        );
        const stem = new THREE.CylinderGeometry(0.014, 0.023, direction.length(), 5)
          .applyQuaternion(lean)
          .translate(...root.clone().addScaledVector(direction, 0.5).toArray());
        vegetation.push(tint(stem, '#6d7842'));
        const head = new THREE.CapsuleGeometry(0.047, 0.126, 2, 6).applyQuaternion(lean).translate(
          ...root
            .clone()
            .addScaledVector(direction, 1 - 0.09 / direction.length())
            .toArray()
        );
        vegetation.push(tint(head, clump % 4 === 0 ? '#655039' : '#756044'));
      }
    }
    for (let index = 0; index < 2; index++) {
      const seat = sampleLakeBank(bank, centre + (index ? 0.13 : -0.12), 2.6);
      stoneSeats.push(seat);
      const stone = createLakeShoreStone(
        0.35 + index * 0.13,
        0.28 + reach * 0.025,
        reach + index
      ).rotateY(centre + index);
      const p = stone.getAttribute('position');
      // Rest the lowest contacting part on real triangles, then bury 25 mm.
      let lift = -Infinity;
      for (let vertex = 0; vertex < p.count; vertex++) {
        ray.ray.origin.set(seat.x + p.getX(vertex), 3, seat.z + p.getZ(vertex));
        const hit = ray.intersectObject(support)[0];
        if (hit) lift = Math.max(lift, hit.point.y - p.getY(vertex));
      }
      stone.translate(seat.x, (Number.isFinite(lift) ? lift : seat.y + 0.17) - 0.025, seat.z);
      tint(stone, index ? '#817e6b' : '#6b7065');
      const colours = stone.getAttribute('color'),
        normals = stone.getAttribute('normal');
      for (let vertex = 0; vertex < p.count; vertex++) {
        const shade =
          0.9 +
          0.1 * Math.max(0, normals.getY(vertex)) +
          0.045 * Math.sin(p.getX(vertex) * 9 + p.getZ(vertex) * 7);
        colours.setXYZ(
          vertex,
          colours.getX(vertex) * shade,
          colours.getY(vertex) * shade,
          colours.getZ(vertex) * shade
        );
      }
      stones.push(stone);
    }
  });
  supportMaterial.dispose();
  return {
    vegetation: assemble(vegetation, 'lake-shore-reeds'),
    stones: assemble(stones, 'lake-shore-stones'),
    roots,
    stoneSeats,
  };
}
