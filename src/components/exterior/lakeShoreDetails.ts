import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Four clustered planted reaches leave the lamps, benches and most of the bank open. */
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
 * stones retain angular shoulders rather than reading as scaled balls.
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

/** Four irregular habitat pockets, merged into four static material surfaces.
 * Open reaches preserve access and views. Every planting samples the bank itself.
 * Working if roots and minerals contact that bank, with over 70% of shore open.
 */
export function createLakeShoreDetails(bank: THREE.BufferGeometry) {
  const vegetation: THREE.BufferGeometry[] = [];
  const stones: THREE.BufferGeometry[] = [];
  const brush: THREE.BufferGeometry[] = [];
  const gravel: THREE.BufferGeometry[] = [];
  const brushRoots: THREE.Vector3[] = [];
  const gravelSeats: THREE.Vector3[] = [];
  const roots: THREE.Vector3[] = [];
  const stoneSeats: THREE.Vector3[] = [];
  const supportMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const support = new THREE.Mesh(bank, supportMaterial);
  support.rotation.x = -Math.PI / 2;
  support.position.y = 0.08;
  support.updateMatrixWorld();
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  // Uneven spacing and bank-depth offsets make sheaves rather than a planted row.
  const offsets = [
    -0.116, -0.103, -0.081, -0.049, -0.022, -0.009, 0.006, 0.039, 0.057, 0.086, 0.109,
  ];
  const rows = [2.55, 1.7, 2.85, 2.1, 1.65, 2.55, 1.85, 2.3, 1.9, 2.65, 2.05];
  const seatMineral = (stone: THREE.BufferGeometry, seat: THREE.Vector3, burial: number) => {
    const p = stone.getAttribute('position');
    let lift = -Infinity;
    for (let vertex = 0; vertex < p.count; vertex++) {
      ray.ray.origin.set(seat.x + p.getX(vertex), 3, seat.z + p.getZ(vertex));
      const hit = ray.intersectObject(support)[0];
      if (hit) lift = Math.max(lift, hit.point.y - p.getY(vertex));
    }
    stone.translate(seat.x, (Number.isFinite(lift) ? lift : seat.y) - burial, seat.z);
    return stone;
  };
  LAKE_REED_REACHES.forEach((centre, reach) => {
    for (let clump = 0; clump < offsets.length; clump++) {
      const angle = centre + offsets[clump] + Math.sin(reach * 2 + clump) * 0.004;
      const root = sampleLakeBank(bank, angle, rows[(clump + reach) % rows.length]);
      root.y -= 0.015;
      roots.push(root);
      for (let blade = 0; blade < 8; blade++) {
        const yaw = blade * 2.39996 + reach * 0.8 + clump * 0.6;
        const maturity = 0.68 + ((clump * 3 + reach) % 5) * 0.08;
        const stature = clump % 3 === 0 ? 0.67 : 1.12;
        const height = (0.65 + ((blade * 3 + clump * 5 + reach) % 9) * 0.095) * maturity * stature;
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
    // Short woody fans sit behind the reeds, well inside the gravel shoulder.
    for (let shrub = 0; shrub < 2; shrub++) {
      const angle = centre + (shrub ? 0.065 : -0.058);
      const root = sampleLakeBank(bank, angle, 2.1);
      root.y -= 0.015;
      brushRoots.push(root);
      for (let stem = 0; stem < 3; stem++) {
        const yaw = centre + stem * 2.399 + shrub;
        const height = 0.38 + ((reach + stem + shrub) % 4) * 0.085;
        const tip = new THREE.Vector3(Math.sin(yaw) * 0.1, height, Math.cos(yaw) * 0.1).add(root);
        const curve = new THREE.QuadraticBezierCurve3(
          root,
          root
            .clone()
            .add(new THREE.Vector3(Math.sin(yaw) * 0.035, height * 0.7, Math.cos(yaw) * 0.035)),
          tip
        );
        brush.push(tint(new THREE.TubeGeometry(curve, 4, 0.012, 4, false), '#75694e'));
        for (let leaf = 0; leaf < 5; leaf++) {
          const point = curve.getPoint(0.35 + leaf * 0.13);
          const geometry = createLakeReedLeaf(
            new THREE.Vector3(),
            yaw + leaf * 2.399,
            0.18 + (leaf % 2) * 0.055,
            0.08
          )
            .scale(1.5, 1, 1.5)
            .translate(...point.toArray());
          brush.push(tint(geometry, ['#597541', '#849354', '#486841'][(leaf + shrub + reach) % 3]));
        }
      }
    }
    // Discontinuous mineral pockets between root fans, never a uniform ring.
    for (let pebble = 0; pebble < 12; pebble++) {
      const phase = pebble * 2.399 + reach;
      const angle = centre + (pebble % 2 ? 0.14 : -0.14) + Math.sin(phase) * 0.025;
      const seat = sampleLakeBank(bank, angle, 1.8 + (pebble % 4) * 0.27);
      gravelSeats.push(seat);
      const size = 0.035 + ((pebble * 3 + reach) % 7) * 0.011;
      const stone = createLakeShoreStone(size, size * (0.7 + (pebble % 3) * 0.18), phase)
        .scale(1, 0.16 + size, 1)
        .rotateY(phase);
      gravel.push(
        tint(seatMineral(stone, seat, 0.008), ['#a69e84', '#777e70', '#8c897c'][pebble % 3])
      );
    }
    for (let index = 0; index < 3; index++) {
      const seat = sampleLakeBank(bank, centre + [-0.15, 0.145, 0.175][index], 2.5 - index * 0.2);
      stoneSeats.push(seat);
      const stone = createLakeShoreStone(
        0.35 + index * 0.13,
        0.28 + reach * 0.025,
        reach + index
      ).rotateY(centre + index);
      const p = stone.getAttribute('position');
      // Rest the lowest contacting part on real triangles, then bury 25 mm.
      seatMineral(stone, seat, 0.025);
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
    brush: assemble(brush, 'lake-shore-brush'),
    gravel: assemble(gravel, 'lake-shore-gravel'),
    roots,
    stoneSeats,
    brushRoots,
    gravelSeats,
  };
}
