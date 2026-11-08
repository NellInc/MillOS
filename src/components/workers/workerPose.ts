import * as THREE from 'three';
import type {
  WorkerBodyType,
  WorkerWorkAction,
  WorkerWorkVariant,
  WorkerMotionState,
  WorkerSeatCue,
  WorkerDriveCue,
  ToolType,
} from './workerTypes';
import {
  LONG_CANE_GRIP_CLOSE,
  WHEELCHAIR,
  WHEELCHAIR_PUSH,
  longCanePoints,
  wheelchairHandPoint,
} from '../../constants/accessibilityLayout';

export function validWorkerSeatCue(cue: WorkerSeatCue | undefined): cue is WorkerSeatCue {
  return (
    !!cue &&
    Number.isFinite(cue.amount) &&
    Number.isFinite(cue.support) &&
    Number.isFinite(cue.x) &&
    Number.isFinite(cue.z) &&
    Number.isFinite(cue.yaw)
  );
}
import { WORKER_EYE_CENTRES } from './SharedWorkerGeometries';
import { createWorkerHandheldMount, isWorkerHandheldTool, workerPalmInWrist } from './WorkerTools';

/** Seat top and pelvis joint are different anchors: the fleshy underside is 9 cm below the joint. */
export const WORKER_SEAT_HEIGHT = 0.46;
export const WORKER_SEAT_PELVIS_OFFSET = 0.09;
/** Tread top .0245 m plus the measured .022-.027 m ankle-to-sole depth. */
export const BICYCLE_FOOT_TARGET_CLEARANCE = 0.052;

const WORKER_BLINK_STARTS = [1.7, 6.4, 12.8, 13.13] as const;

/** Brief asymmetric closure, long open-eye dwells, and an occasional double blink.
 * Working if independently phased people close both real eye surfaces and pupils.
 */
export function sampleWorkerBlink(seconds: number): number {
  const t = Number.isFinite(seconds) ? ((seconds % 17.3) + 17.3) % 17.3 : 0;
  for (const start of WORKER_BLINK_STARTS) {
    const elapsed = t - start;
    if (elapsed >= 0 && elapsed < 0.18)
      return (
        THREE.MathUtils.smoothstep(elapsed, 0, 0.045) *
        (1 - THREE.MathUtils.smoothstep(elapsed, 0.07, 0.18))
      );
  }
  return 0;
}

export interface WorkerEyeSurface {
  centre: THREE.Vector3Tuple;
  right: THREE.Vector3Tuple;
  up: THREE.Vector3Tuple;
  normal: THREE.Vector3Tuple;
  halfWidth: number;
  halfHeight: number;
}

/** Measure the real front quad, in the same Head-rest frame as eye closure.
 * Working if fitted pupils follow the tilted inset instead of floating off it.
 */
function workerEyeSurface(points: THREE.Vector3[]): WorkerEyeSurface | null {
  if (points.length !== 4) return null;
  const centre = new THREE.Vector3();
  points.forEach((p) => centre.add(p));
  centre.multiplyScalar(0.25);
  const edges = points.slice(1).map((p) => p.clone().sub(points[0]));
  const right = edges.find((v) => Math.abs(v.x) > Math.abs(v.y) * 2)?.clone();
  const up = edges.find((v) => Math.abs(v.y) > Math.abs(v.x) * 2)?.clone();
  if (!right || !up) return null;
  if (right.x < 0) right.negate();
  if (up.y < 0) up.negate();
  const halfWidth = right.length() / 2,
    halfHeight = up.length() / 2;
  right.normalize();
  up.normalize();
  const normal = right.clone().cross(up).normalize();
  if (
    normal.z < 0.8 ||
    Math.abs(right.dot(up)) > 0.005 ||
    halfWidth < 0.009 ||
    halfWidth > 0.015 ||
    halfHeight < 0.009 ||
    halfHeight > 0.015
  )
    return null;
  // Exported quad corners carry up to tens of microns of skew, well inside
  // the pupil footprint's 0.6mm clearance. Retain that measured tiny shear.
  const difference = new THREE.Vector3();
  if (
    points.some((p) => {
      difference.copy(p).sub(centre);
      return (
        Math.abs(difference.dot(normal)) > 0.00005 ||
        Math.abs(Math.abs(difference.dot(right)) - halfWidth) > 0.00005 ||
        Math.abs(Math.abs(difference.dot(up)) - halfHeight) > 0.00005
      );
    })
  )
    return null;
  return {
    centre: centre.toArray(),
    right: right.toArray(),
    up: up.toArray(),
    normal: normal.toArray(),
    halfWidth,
    halfHeight,
  };
}

export const createWorkerGaze = () => ({ horizontal: 0, vertical: 0 });
/** Fast eyes lead the existing eased head cue, then share its quiet dwell.
 * No new clock/recipient: targets are the already resolved work/social gesture.
 * Working if eyes turn conjugately, settle, and admitted delta alone advances them.
 */
export function sampleWorkerGaze(
  target: WorkerGesture,
  head: WorkerGesture,
  delta: number,
  out: ReturnType<typeof createWorkerGaze>
) {
  const yaw = Number.isFinite(target.lookYaw) ? target.lookYaw : 0;
  const pitch = Number.isFinite(target.lookPitch) ? target.lookPitch : 0;
  const headYaw = Number.isFinite(head.lookYaw) ? head.lookYaw : 0;
  const headPitch = Number.isFinite(head.lookPitch) ? head.lookPitch : 0;
  const amount = 1 - Math.exp(-28 * (Number.isFinite(delta) ? Math.max(0, delta) : 0));
  const horizontal = THREE.MathUtils.clamp((yaw - headYaw + yaw * 0.3) / 0.22, -1, 1);
  const vertical = THREE.MathUtils.clamp(-(pitch - headPitch + pitch * 0.65) / 0.16, -1, 1);
  out.horizontal = THREE.MathUtils.lerp(
    Number.isFinite(out.horizontal) ? out.horizontal : 0,
    horizontal,
    amount
  );
  out.vertical = THREE.MathUtils.lerp(
    Number.isFinite(out.vertical) ? out.vertical : 0,
    vertical,
    amount
  );
  if (Math.abs(out.horizontal) < 1e-6) out.horizontal = 0;
  if (Math.abs(out.vertical) < 1e-6) out.vertical = 0;
  return out;
}

/** The authored eyes are dark inset surfaces, with no separate white sclera.
 * Close those vertices in Head rest space, together with the pupil fittings.
 * No morph shader or added draw: 48 private vertices update only while blinking.
 * Working if a blink narrows the entire eye and cached/other people's eyes stay intact.
 */
export function createWorkerEyeBlink(model: THREE.Object3D, bodyType: WorkerBodyType) {
  // This method refreshes SkinnedMesh.bindMatrixInverse; updateWorldMatrix
  // only refreshes transforms and can lift closing eyes 13 cm on a fresh clone.
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('Head');
  const surfaces: WorkerEyeSurface[] = [];
  const entries: Array<{
    mesh: THREE.Mesh;
    source: THREE.BufferGeometry;
    geometry: THREE.BufferGeometry;
    open: Float32Array;
    closed: Float32Array;
  }> = [];
  if (head) {
    const intoHead = new THREE.Matrix4();
    const fromHead = new THREE.Matrix4();
    const point = new THREE.Vector3();
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (
        !mesh.isMesh ||
        !mesh.parent?.name.includes('Worker_Head') ||
        Array.isArray(mesh.material) ||
        ![
          bodyType === 'masculine' ? 'Eye' : 'Brown',
          `${bodyType === 'masculine' ? 'Eye' : 'Brown'}-${bodyType}`,
        ].includes(mesh.material.name)
      )
        return;
      const source = mesh.geometry;
      const geometry = source.clone();
      const position = geometry.getAttribute('position');
      const open = new Float32Array(position.count * 3);
      const closed = new Float32Array(position.count * 3);
      intoHead.copy(head.matrixWorld).invert().multiply(mesh.matrixWorld);
      const skin = mesh as THREE.SkinnedMesh;
      if (skin.isSkinnedMesh) {
        const joint = skin.skeleton.bones.indexOf(head as THREE.Bone);
        if (joint < 0) {
          geometry.dispose();
          return;
        }
        // Normalised exports retain nonidentity bind matrices. Include the
        // actual Head skin transform, not just the mesh's object transform.
        // Both authored eyes are entirely Head-weighted; unfamiliar weights
        // retain their open shape rather than guessing a deformation.
        const indices = source.getAttribute('skinIndex');
        const weights = source.getAttribute('skinWeight');
        for (let vertex = 0; vertex < position.count; vertex++) {
          for (let component = 0; component < 4; component++) {
            if (
              weights.getComponent(vertex, component) > 0.0001 &&
              indices.getComponent(vertex, component) !== joint
            ) {
              geometry.dispose();
              return;
            }
          }
        }
        intoHead
          .multiply(skin.bindMatrixInverse)
          .multiply(head.matrixWorld)
          .multiply(skin.skeleton.boneInverses[joint])
          .multiply(skin.bindMatrix);
      }
      fromHead.copy(intoHead).invert();
      const front = [new Map<string, THREE.Vector3>(), new Map<string, THREE.Vector3>()];
      const normal = new THREE.Vector3();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(intoHead);
      const normals = source.getAttribute('normal');
      for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index).toArray(open, index * 3);
        point.applyMatrix4(intoHead);
        if (normals) {
          normal.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize();
          if (normal.z > 0.8) {
            const key = `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`;
            front[point.x < 0 ? 0 : 1].set(key, point.clone());
          }
        }
        const centre = WORKER_EYE_CENTRES[bodyType][1];
        point.y = centre + (point.y - centre) * 0.08;
        point.applyMatrix4(fromHead).toArray(closed, index * 3);
      }
      for (const vertices of front) {
        const surface = workerEyeSurface([...vertices.values()]);
        if (surface) surfaces.push(surface);
      }
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(open.slice(), 3).setUsage(THREE.DynamicDrawUsage)
      );
      mesh.geometry = geometry;
      mesh.userData.workerBlink = true;
      entries.push({ mesh, source, geometry, open, closed });
    });
  }
  let previous = 0;
  return {
    surfaces: surfaces.length === 2 ? surfaces.sort((a, b) => a.centre[0] - b.centre[0]) : [],
    apply(amount: number) {
      const closure = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
      if (closure === previous) return;
      previous = closure;
      for (const { geometry, open, closed } of entries) {
        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const array = position.array;
        for (let index = 0; index < open.length; index++)
          array[index] =
            closure === 0 ? open[index] : open[index] + (closed[index] - open[index]) * closure;
        position.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh, source, geometry } of entries) {
        if (mesh.geometry === geometry) mesh.geometry = source;
        geometry.dispose();
      }
    },
  };
}

/** A closed, skin-fitted crease and a restrained brow lift share the existing
 * greeting envelope. No speaking, new clock or body/eye deformation is implied.
 * Working if the actual facial surface supports every expression, scalp stays
 * exact, far LOD stays neutral and disposal touches only private resources.
 */
export function createWorkerFaceExpression(
  model: THREE.Object3D,
  bodyType: WorkerBodyType,
  skinTone: string
) {
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('Head');
  type Vertex = {
    mesh: THREE.SkinnedMesh;
    index: number;
    rest: THREE.Vector3;
    posed: THREE.Vector3;
    stamp: number;
  };
  type Face = { triangle: THREE.Triangle; vertices: [Vertex, Vertex, Vertex] };
  const faces: Face[] = [],
    activeVertices: Vertex[] = [];
  const bindings: Array<{ face: Face; weights: THREE.Vector3 }> = [];
  const headInverse = new THREE.Matrix4();
  if (head) headInverse.copy(head.matrixWorld).invert();
  let epoch = 0;
  const brows: Array<{
    mesh: THREE.Mesh;
    source: THREE.BufferGeometry;
    geometry: THREE.BufferGeometry;
    base: Float32Array;
    intoLocal: THREE.Matrix3;
    islands: Array<{ indices: number[]; x: number; y: number; z: number }>;
  }> = [];
  const intoHead = (mesh: THREE.SkinnedMesh) => {
    const joint = mesh.skeleton.bones.indexOf(head as THREE.Bone);
    const matrix = new THREE.Matrix4()
      .copy(head!.matrixWorld)
      .invert()
      .multiply(mesh.matrixWorld)
      .multiply(mesh.bindMatrixInverse)
      .multiply(head!.matrixWorld)
      .multiply(mesh.skeleton.boneInverses[joint])
      .multiply(mesh.bindMatrix);
    return { matrix, joint };
  };
  const headWeighted = (mesh: THREE.SkinnedMesh, vertex: number, joint: number) => {
    const weights = mesh.geometry.getAttribute('skinWeight');
    const indices = mesh.geometry.getAttribute('skinIndex');
    if (!weights || !indices || joint < 0) return false;
    let sum = 0;
    for (let component = 0; component < 4; component++) {
      const weight = weights.getComponent(vertex, component);
      if (
        !Number.isFinite(weight) ||
        weight < 0 ||
        (weight > 0.0001 && indices.getComponent(vertex, component) !== joint)
      )
        return false;
      sum += weight;
    }
    return Math.abs(sum - 1) < 0.0001;
  };
  if (head)
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (
        !mesh.isSkinnedMesh ||
        !mesh.parent?.name.includes('Worker_Head') ||
        Array.isArray(mesh.material) ||
        !['Skin', `Skin-${bodyType}`].includes(mesh.material.name)
      )
        return;
      const geometry = mesh.geometry,
        position = geometry.getAttribute('position');
      const weights = geometry.getAttribute('skinWeight'),
        indices = geometry.getAttribute('skinIndex');
      if (!position || !weights || !indices) return;
      const compatible = (i: number) => {
        let sum = 0;
        for (let c = 0; c < 4; c++) {
          const w = weights.getComponent(i, c),
            joint = indices.getComponent(i, c);
          if (!Number.isFinite(w) || w < 0 || (w > 0 && !mesh.skeleton.bones[joint])) return false;
          sum += w;
        }
        return Math.abs(sum - 1) < 0.0001;
      };
      const cache = new Map<number, Vertex>();
      const vertex = (i: number) => {
        let value = cache.get(i);
        if (!value) {
          const rest = mesh
            .getVertexPosition(i, new THREE.Vector3())
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(headInverse);
          value = { mesh, index: i, rest, posed: new THREE.Vector3(), stamp: 0 };
          cache.set(i, value);
        }
        return value;
      };
      const at = (i: number) => geometry.index?.getX(i) ?? i;
      for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
        const ids = [at(i), at(i + 1), at(i + 2)];
        if (!ids.every(compatible)) continue;
        const points = ids.map(vertex) as [Vertex, Vertex, Vertex];
        const triangle = new THREE.Triangle(points[0].rest, points[1].rest, points[2].rest);
        if (triangle.getNormal(new THREE.Vector3()).z > 0.5)
          faces.push({ triangle, vertices: points });
      }
    });
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  const hit = new THREE.Vector3(),
    selectedHit = new THREE.Vector3(),
    normal = new THREE.Vector3();
  let selectedFace: Face | undefined;
  const surface = (x: number, y: number) => {
    ray.origin.set(x, y, 0.4);
    let z = -Infinity;
    selectedFace = undefined;
    for (const face of faces)
      if (
        ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, hit) &&
        hit.z > z
      ) {
        z = hit.z;
        selectedFace = face;
        selectedHit.copy(hit);
        face.triangle.getNormal(normal);
      }
    return z;
  };
  let mouth: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } | null = null;
  const columns = 13,
    positions = new Float32Array(columns * 9),
    normals = new Float32Array(columns * 9);
  const fitMouth = (amount: number) => {
    for (let column = 0; column < columns; column++) {
      const u = (column / (columns - 1)) * 2 - 1;
      const x = WORKER_EYE_CENTRES[bodyType][0] + u * (bodyType === 'masculine' ? 0.022 : 0.02);
      const centre =
        (bodyType === 'masculine' ? 0.018 : 0.024) + (0.0006 + amount * 0.0036) * u * u;
      for (let row = 0; row < 3; row++) {
        const y = centre + (row - 1) * (0.00018 + 0.0012 * (1 - u * u));
        const z = surface(x, y);
        if (!Number.isFinite(z) || z < 0.075 || z > 0.145) return false;
        const index = column * 3 + row;
        if (!selectedFace) return false;
        const binding = (bindings[index] ??= { face: selectedFace, weights: new THREE.Vector3() });
        binding.face = selectedFace;
        if (!selectedFace.triangle.getBarycoord(selectedHit, binding.weights)) return false;
      }
    }
    activeVertices.length = 0;
    epoch++;
    for (const binding of bindings)
      for (const v of binding.face.vertices)
        if (v.stamp !== epoch) {
          v.stamp = epoch;
          activeVertices.push(v);
        }
    return true;
  };
  const nextPositions = new Float32Array(positions.length),
    nextNormals = new Float32Array(normals.length);
  const posedPoint = new THREE.Vector3(),
    edge = new THREE.Vector3();
  const sampleAttachment = () => {
    if (!head || bindings.length !== columns * 3) return false;
    model.updateMatrixWorld(true);
    headInverse.copy(head.matrixWorld).invert();
    for (const v of activeVertices)
      v.mesh
        .getVertexPosition(v.index, v.posed)
        .applyMatrix4(v.mesh.matrixWorld)
        .applyMatrix4(headInverse);
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i],
        a = binding.face.vertices[0].posed,
        b = binding.face.vertices[1].posed,
        c = binding.face.vertices[2].posed;
      normal.copy(b).sub(a).cross(edge.copy(c).sub(a));
      if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() < 1e-14) return false;
      normal.normalize();
      posedPoint
        .copy(a)
        .multiplyScalar(binding.weights.x)
        .addScaledVector(b, binding.weights.y)
        .addScaledVector(c, binding.weights.z)
        .addScaledVector(normal, 0.00065);
      if (!Number.isFinite(posedPoint.lengthSq())) return false;
      posedPoint.toArray(nextPositions, i * 3);
      normal.toArray(nextNormals, i * 3);
    }
    return true;
  };
  const refreshAttachment = () => {
    if (!mouth) return;
    if (!sampleAttachment()) {
      mouth.geometry.setDrawRange(0, 0);
      return;
    }
    let changed = false;
    for (let i = 0; i < positions.length; i++)
      if (positions[i] !== nextPositions[i] || normals[i] !== nextNormals[i]) {
        changed = true;
        break;
      }
    if (changed) {
      positions.set(nextPositions);
      normals.set(nextNormals);
      mouth.geometry.attributes.position.needsUpdate = true;
      mouth.geometry.attributes.normal.needsUpdate = true;
      mouth.geometry.computeBoundingBox();
      mouth.geometry.computeBoundingSphere();
      // A one-micron culling margin avoids sqrt/square endpoint roundoff.
      mouth.geometry.boundingSphere!.radius += 0.000001;
    }
    mouth.geometry.setDrawRange(0, mouth.geometry.index!.count);
  };
  // Dynamic depth fitting follows the actual facets, including intermediate
  // smiles. Endpoints alone cannot prove contact on a piecewise-planar face.
  if (faces.length && fitMouth(1) && fitMouth(0) && sampleAttachment()) {
    positions.set(nextPositions);
    normals.set(nextNormals);
    {
      const geometry = new THREE.BufferGeometry(),
        colours = new Float32Array(positions.length),
        indices: number[] = [];
      const skin = new THREE.Color(skinTone);
      const lip = skin.clone().lerp(new THREE.Color('#925e54'), 0.22).multiplyScalar(0.86);
      const crease = skin.clone().multiplyScalar(0.28).lerp(new THREE.Color('#502b2c'), 0.3);
      for (let column = 0; column < columns; column++)
        for (let row = 0; row < 3; row++) {
          (row === 1 ? crease : lip).toArray(colours, (column * 3 + row) * 3);
          if (column < columns - 1 && row < 2) {
            const i = column * 3 + row;
            indices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4);
          }
        }
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
      );
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage)
      );
      geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      geometry.setIndex(indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.boundingSphere!.radius += 0.000001;
      mouth = {
        geometry,
        material: new THREE.MeshStandardMaterial({
          color: '#ffffff',
          vertexColors: true,
          roughness: 0.8,
          metalness: 0,
        }),
      };
    }
  }
  if (head && faces.length)
    model.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      const islands = mesh.geometry?.userData.workerBrowIslands as number[][] | undefined;
      if (!mesh.isSkinnedMesh || islands?.length !== 2) return;
      const joint = mesh.skeleton.bones.indexOf(head as THREE.Bone);
      if (
        joint < 0 ||
        !islands.every(
          (island) =>
            island.length >= 12 &&
            island.length <= 80 &&
            island.every(
              (i) =>
                Number.isInteger(i) &&
                i >= 0 &&
                i < mesh.geometry.attributes.position.count &&
                headWeighted(mesh, i, joint)
            )
        )
      )
        return;
      const { matrix } = intoHead(mesh),
        source = mesh.geometry;
      const position = source.getAttribute('position'),
        point = new THREE.Vector3();
      const measured = islands.map((indices) => {
        const centre = new THREE.Vector3();
        for (const i of indices)
          centre.add(point.fromBufferAttribute(position, i).applyMatrix4(matrix));
        centre.multiplyScalar(1 / indices.length);
        return { indices, x: centre.x, y: centre.y, z: surface(centre.x, centre.y) };
      });
      if (
        !measured.every(
          (island) =>
            Number.isFinite(island.z) && Number.isFinite(surface(island.x, island.y + 0.0025))
        )
      )
        return;
      const base = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++)
        point.fromBufferAttribute(position, i).toArray(base, i * 3);
      const geometry = source.clone();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(base.slice(), 3).setUsage(THREE.DynamicDrawUsage)
      );
      mesh.geometry = geometry;
      brows.push({
        mesh,
        source,
        geometry,
        base,
        intoLocal: new THREE.Matrix3().setFromMatrix4(matrix.clone().invert()),
        islands: measured,
      });
    });
  const offset = new THREE.Vector3();
  let previous = 0;
  return {
    mouth,
    refreshAttachment,
    apply(value: number, near = true) {
      const amount = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
      if (amount === previous) {
        if (near) refreshAttachment();
        return;
      }
      previous = amount;
      if (mouth && !fitMouth(amount)) fitMouth(0);
      for (const entry of brows) {
        const position = entry.geometry.attributes.position as THREE.BufferAttribute;
        position.array.set(entry.base);
        if (amount)
          for (const island of entry.islands) {
            const lift = amount * 0.0025,
              z = surface(island.x, island.y + lift);
            if (!Number.isFinite(z)) continue;
            offset.set(0, lift, z - island.z).applyMatrix3(entry.intoLocal);
            for (const i of island.indices) {
              position.array[i * 3] += offset.x;
              position.array[i * 3 + 1] += offset.y;
              position.array[i * 3 + 2] += offset.z;
            }
          }
        position.needsUpdate = true;
      }
      if (near) refreshAttachment();
    },
    dispose() {
      for (const { mesh, source, geometry } of brows) {
        if (mesh.geometry === geometry) mesh.geometry = source;
        geometry.dispose();
      }
      mouth?.geometry.dispose();
      mouth?.material.dispose();
    },
  };
}

/** Finger-only overlay sampled from this body's authored closed hand. Palm
 * bases and wrists never move, preserving the existing prop/IK attachment.
 * Working if shapes differ by task, locomotion stays exact, and restore removes
 * every overlay before the next mixer sample. No per-frame allocation or clock.
 */
/** Preserve authored float32 quaternions at exact pose endpoints. Three r186
 * normalizes slerp results even for zero/full weight; those endpoints are copies
 * in our pose ownership contract. Working if walking fingers and full seats
 * retain exact authored components while intermediate poses still use slerp.
 */
function blendWorkerRotation(
  out: THREE.Quaternion,
  from: THREE.Quaternion,
  to: THREE.Quaternion,
  weight: number
) {
  if (weight <= 0) return out.copy(from);
  if (weight >= 1) return out.copy(to);
  return out.slerpQuaternions(from, to, weight);
}

export function createWorkerHandPose(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const reference = clips.find((clip) => clip.name === 'worker-run');
  const entries: Array<{
    bone: THREE.Object3D;
    closed: THREE.Quaternion;
    saved: THREE.Quaternion;
    side: string;
    finger: string;
    weight: number;
  }> = [];
  for (const track of reference?.tracks ?? []) {
    const match = /^(Index[23]|Middle[23]|Ring[23]|Pinky[23]|Thumb[12])([LR])\.quaternion$/.exec(
      track.name
    );
    if (!match || track.getValueSize() !== 4 || !Array.from(track.values).every(Number.isFinite))
      continue;
    const bone = model.getObjectByName(match[1] + match[2]);
    if (!bone) continue;
    const sample = new THREE.QuaternionLinearInterpolant(track.times, track.values, 4).evaluate(
      reference!.duration * 0.35
    );
    const closed = new THREE.Quaternion().fromArray(sample).normalize();
    entries.push({
      bone,
      closed,
      saved: bone.quaternion.clone(),
      side: match[2],
      finger: match[1],
      weight: 0,
    });
  }
  let applied = false,
    initialised = false;
  return {
    jointCount: entries.length,
    restore() {
      if (!applied) return;
      for (const entry of entries) entry.bone.quaternion.copy(entry.saved);
      applied = false;
    },
    apply(motion: WorkerMotionState, tool: ToolType, gesture: WorkerGesture, delta = 0) {
      const walking = motion.activity === 'walking' && !motion.cycling && !motion.cartGrip;
      let left = 0.14 + gesture.breath * 0.02,
        right = left;
      if (motion.cycling || motion.cartGrip) left = right = 0.52;
      // A long cane's grip closes the right hand, walking or standing.
      if (motion.mobility === 'long-cane' && !motion.seated) right = LONG_CANE_GRIP_CLOSE;
      else if (motion.seated || motion.activity === 'break')
        left = right = 0.1 + gesture.breath * 0.02;
      else if (motion.activity === 'working') {
        left =
          tool === 'none'
            ? 0.14
            : tool === 'bread-tray' || tool === 'sample-kit'
              ? 0.2
              : tool === 'clipboard' || tool === 'tablet'
                ? 0.3
                : 0.58;
        right = tool === 'bread-tray' ? 0.18 : 0.12;
      }
      const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.15) : 0;
      for (const entry of entries) {
        entry.saved.copy(entry.bone.quaternion);
        const factor = entry.finger.startsWith('Thumb')
          ? 0.85
          : entry.finger.startsWith('Index')
            ? 0.8
            : entry.finger.startsWith('Pinky')
              ? 1.08
              : 1;
        const wave = entry.side === 'R' ? 1 - THREE.MathUtils.clamp(gesture.greetingLift, 0, 1) : 1;
        const caneHand = entry.side === 'R' && motion.mobility === 'long-cane' && !motion.seated;
        const target =
          walking && !caneHand ? 0 : (entry.side === 'L' ? left : right) * factor * wave;
        entry.weight =
          walking || !initialised || !motion.enabled
            ? target
            : THREE.MathUtils.damp(entry.weight, target, 8, dt);
        blendWorkerRotation(
          entry.bone.quaternion,
          entry.bone.quaternion,
          entry.closed,
          entry.weight
        );
      }
      applied = true;
      initialised = true;
    },
  };
}

/** Shared metre-space targets keep hands and held props on the same motion. */
export const createWorkerGesture = () => ({
  toolY: 0,
  toolZ: 0,
  lookYaw: 0,
  lookPitch: 0,
  restReach: 0,
  workStroke: 0,
  workCheck: 0,
  breath: 0,
  greetingLift: 0,
  greetingWave: 0,
  idleSettle: 0,
  /** Held-prop offset across the body and its turn (radians, YXZ order). */
  toolX: 0,
  toolPitch: 0,
  toolYaw: 0,
  toolRoll: 0,
  /** Torso pitch from the hips and turn about the spine, radians. */
  lean: 0,
  twist: 0,
  /** Pelvis shift across the stance and drop into the knees, metres. */
  sway: 0,
  dip: 0,
  /** The free hand's reach away from its brace, metres (gardener's right hand). */
  offX: 0,
  offY: 0,
  offZ: 0,
  /** The supporting hand's offset from its rest on a station (courier's left hand). */
  holdX: 0,
  holdY: 0,
  holdZ: 0,
  /** The free hand's brief point away from the work, 0-1 (toward the look). */
  point: 0,
});
export type WorkerGesture = ReturnType<typeof createWorkerGesture>;

/** Held props on the actor root, in unscaled metres facing +Z. The prop group
 * sits here, offset by the gesture's tool channels; the hands are solved to the
 * grips this module computes from the same channels, so prop and palms share
 * one transform. Working if the tray and trowel never slide out of the hands.
 */
export const WORKER_TRAY_MOUNT = Object.freeze([0, 1.09, 0.28] as const);
export const WORKER_TROWEL_MOUNT = Object.freeze([0.12, 0.326, 0.5205] as const);
/** Palm centres under the tray's two ends (0.38 m wide, 0.025 m board): the
 * board rests on the palms, the fingers reach in under it. */
const TRAY_GRIP_X = 0.15;
const TRAY_GRIP_Y = -0.03;
const TRAY_GRIP_Z = -0.03;
const _toolEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _toolRotation = new THREE.Quaternion();

/** The held prop's rotation about its own origin, from the gesture. */
export function workerHeldToolRotation(
  gesture: WorkerGesture | undefined,
  out: THREE.Quaternion
): THREE.Quaternion {
  if (!gesture) return out.identity();
  _toolEuler.set(gesture.toolPitch, gesture.toolYaw, gesture.toolRoll, 'YXZ');
  return out.setFromEuler(_toolEuler);
}

/** A palm centre on the held prop, in unscaled actor metres. The trowel is
 * gripped at its origin by the left hand; the tray at both ends. */
export function workerHeldToolGrip(
  task: 'bake' | 'garden',
  side: 'L' | 'R',
  gesture: WorkerGesture | undefined,
  out: THREE.Vector3
): THREE.Vector3 {
  const mount = task === 'bake' ? WORKER_TRAY_MOUNT : WORKER_TROWEL_MOUNT;
  if (task === 'bake') out.set(side === 'L' ? TRAY_GRIP_X : -TRAY_GRIP_X, TRAY_GRIP_Y, TRAY_GRIP_Z);
  else out.set(0, 0, 0);
  out.applyQuaternion(workerHeldToolRotation(gesture, _toolRotation));
  out.x += mount[0] + (gesture?.toolX ?? 0);
  out.y += mount[1] + (gesture?.toolY ?? 0);
  out.z += mount[2] + (gesture?.toolZ ?? 0);
  return out;
}

const workWindow = (t: number, a: number, b: number, c: number, d: number) =>
  THREE.MathUtils.smoothstep(t, a, b) * (1 - THREE.MathUtils.smoothstep(t, c, d));
const wrapTime = (t: number, period: number) => ((t % period) + period) % period;
const TAU = Math.PI * 2;

/** The baker's 13.7 s loop at the counter: carry, lean in and lower the tray
 * toward the counter with two small forward slides of the bread, straighten,
 * then turn to offer the tray to one side and settle, with a slow weight shift
 * throughout. The side alternates irregularly from loop to loop.
 */
export const WORKER_BAKE_PERIOD = 13.7;
function sampleBakeLoop(t: number, out: WorkerGesture) {
  const bt = wrapTime(t, WORKER_BAKE_PERIOD);
  const side = Math.sin(Math.floor(t / WORKER_BAKE_PERIOD) * 2.39996 + 0.7) >= 0 ? 1 : -1;
  const setOut = workWindow(bt, 2.2, 3.5, 6.4, 7.7);
  const slide = setOut * (workWindow(bt, 3.8, 4.2, 4.45, 4.9) + workWindow(bt, 5, 5.4, 5.65, 6.1));
  const offer = workWindow(bt, 8.4, 9.6, 10.9, 12.1);
  const shift = Math.sin((t * TAU) / 9.3);
  const twist = 0.2 * side * offer;
  // The tray swings with the shoulders about the body's own vertical axis.
  const reach = WORKER_TRAY_MOUNT[2] + 0.1 * setOut + 0.04 * offer + 0.035 * slide;
  out.twist = twist;
  out.lean = 0.2 * setOut + 0.05 * offer;
  out.dip = 0.03 * setOut + 0.006 * offer;
  out.sway = 0.012 * shift * (1 - setOut) * (1 - offer) + 0.018 * side * offer;
  out.toolYaw = twist;
  out.toolX = reach * Math.sin(twist);
  out.toolZ = reach * Math.cos(twist) - WORKER_TRAY_MOUNT[2];
  out.toolY = -0.085 * setOut + 0.03 * offer + (out.breath - 0.5) * 0.006;
  out.toolPitch = 0.09 * setOut + 0.06 * slide;
  out.toolRoll = -0.05 * side * offer;
  out.lookPitch = out.lookPitch * (1 - setOut) + 0.3 * setOut - 0.08 * offer;
  out.lookYaw = out.lookYaw * (1 - offer) * (1 - setOut) + 0.75 * twist;
  out.offX = out.offY = out.offZ = 0;
}

/** The baker's 12.7 s loop at the street stop, where there is no counter:
 * hold the tray at the chest, turn and hold it out to someone passing with a
 * small nod, draw it back in and tidy the loaves with two little shakes, then
 * offer it the other way, smaller. Feet stay planted; the tray turns with the
 * shoulders about the body's own vertical axis.
 */
export const WORKER_SERVE_PERIOD = 12.7;
function sampleServeLoop(t: number, out: WorkerGesture) {
  const vt = wrapTime(t, WORKER_SERVE_PERIOD);
  const side = Math.sin(Math.floor(t / WORKER_SERVE_PERIOD) * 2.39996 + 0.3) >= 0 ? 1 : -1;
  const offerA = workWindow(vt, 1.6, 2.7, 4.6, 5.7);
  const tidy = workWindow(vt, 6.4, 7.1, 8.8, 9.5);
  const offerB = workWindow(vt, 9.6, 10.5, 11.5, 12.4);
  const offer = offerA + 0.7 * offerB;
  const turn = 0.24 * side * offerA - 0.16 * side * offerB;
  const nod =
    offerA * workWindow(vt, 3, 3.3, 3.5, 3.9) + offerB * workWindow(vt, 10.7, 10.95, 11.1, 11.4);
  const shake =
    tidy * (workWindow(vt, 7.4, 7.55, 7.65, 7.85) - workWindow(vt, 7.9, 8.05, 8.15, 8.35));
  const shift = Math.sin((t * TAU) / 8.7);
  const reach = WORKER_TRAY_MOUNT[2] + 0.14 * offer - 0.04 * tidy;
  out.twist = turn;
  out.toolYaw = turn;
  out.toolX = reach * Math.sin(turn);
  out.toolZ = reach * Math.cos(turn) - WORKER_TRAY_MOUNT[2];
  out.toolY = 0.04 * offer - 0.05 * tidy + (out.breath - 0.5) * 0.006;
  out.toolPitch = 0.12 * offer + 0.05 * tidy;
  out.toolRoll = 0.06 * shake;
  out.lean = 0.07 * offer + 0.1 * tidy + 0.06 * nod;
  out.dip = 0.012 * offer + 0.008 * tidy;
  out.sway = 0.015 * Math.sign(turn) * Math.min(1, offer) + 0.01 * shift * (1 - Math.min(1, offer));
  out.lookPitch = out.lookPitch * 0.4 + 0.12 * nod + 0.3 * tidy - 0.04 * offer;
  out.lookYaw = 0.8 * turn + out.lookYaw * (1 - Math.min(1, offer + tidy)) * 0.4;
}

/** The courier's 13.3 s check of the empty return cart: lean in with both
 * hands on the near rail and look over the bed, run the right hand along the
 * rail to its end and back, rap it twice, then straighten, dust the hands off
 * at the waist and look along the street. The cart stays empty: this is a
 * check, never an unload (the cart carries no order).
 */
export const WORKER_CARTCHECK_PERIOD = 13.3;
function sampleCartCheckLoop(t: number, out: WorkerGesture) {
  const ct = wrapTime(t, WORKER_CARTCHECK_PERIOD);
  const side = Math.sin(Math.floor(t / WORKER_CARTCHECK_PERIOD) * 2.39996 + 2.6) >= 0 ? 1 : -1;
  const over = workWindow(ct, 0, 0.9, 8.4, 9.4);
  const dust = 1 - over;
  const slide = workWindow(ct, 3, 3.4, 6.2, 6.6);
  const along = Math.sin(THREE.MathUtils.clamp((ct - 3.2) / 3.2, 0, 1) * Math.PI);
  const raps = workWindow(ct, 6.9, 7.05, 7.15, 7.35) + workWindow(ct, 7.5, 7.65, 7.75, 7.95);
  const rub = dust * Math.sin(t * 9) * 0.018;
  out.lean = 0.55 * over + 0.03 * dust;
  out.twist = 0.06 * side * dust;
  out.holdX = dust * -0.15 + rub;
  out.holdY = dust * 0.16;
  out.holdZ = dust * -0.07;
  out.offX = over * -0.2 * slide * along + dust * 0.15 - rub;
  out.offY = over * 0.04 * raps + dust * 0.16;
  out.offZ = dust * -0.07;
  out.lookPitch = 0.3 * over - 0.04 * dust;
  out.lookYaw = over * 0.15 * Math.sin(t * 0.83) + dust * 0.2 * side;
}

/** The shopkeeper's 11.9 s stock count, with the clipboard held close: the
 * board hand low at the ribs, elbow tucked, the board tilted up to the face and
 * the head down over it. The right hand ticks down three lines on the sheet (a
 * stroke along each line, a lift and return to the next), then he looks up and
 * turns toward the shelves with a brief, bent-armed point, comes back and taps
 * twice at an item. Writing offsets are in the clipboard's own frame (x across
 * the sheet, y up it, z off the paper); `hold*` nudges the board hand.
 */
export const WORKER_STOCKTAKE_PERIOD = 11.9;
function sampleStocktakeLoop(t: number, out: WorkerGesture) {
  const st = wrapTime(t, WORKER_STOCKTAKE_PERIOD);
  const side = Math.sin(Math.floor(t / WORKER_STOCKTAKE_PERIOD) * 2.39996 + 1.9) >= 0 ? 1 : -1;
  const write = workWindow(st, 0, 0.45, 5.15, 5.7);
  const lookUp = workWindow(st, 5.5, 6.3, 8.3, 9.1);
  const tick = workWindow(st, 8.9, 9.35, 11.3, 11.85);
  const lineTime = Math.min(st, 5.1) / 1.7;
  const lineIndex = Math.min(2, Math.floor(lineTime));
  const line = lineTime - lineIndex;
  const back = THREE.MathUtils.smoothstep(line, 0.84, 1);
  const across = THREE.MathUtils.smoothstep(line, 0.05, 0.8) - back;
  const scribble = write * (1 - back);
  const taps =
    tick * workWindow(st, 9.6, 9.75, 9.8, 10) + tick * workWindow(st, 10.3, 10.45, 10.5, 10.7);
  out.offX = write * (-0.035 + 0.07 * across) + 0.02 * tick + scribble * 0.004 * Math.sin(t * 11);
  out.offY =
    write * (0.03 - 0.03 * (lineIndex + (lineIndex < 2 ? back : 0))) -
    0.012 * tick +
    scribble * 0.003 * Math.sin(t * 13.7);
  out.offZ =
    write * 0.016 * workWindow(line, 0.78, 0.86, 0.94, 1) +
    0.03 * lookUp +
    tick * (0.014 - 0.014 * taps) +
    // Between the three phases the hand hovers just clear of the sheet.
    0.03 * Math.max(0, 1 - write - tick - lookUp);
  out.point = workWindow(st, 6.2, 6.75, 7.4, 8);
  // Looking up, the board drops a little toward the waist.
  out.holdY = -0.04 * lookUp;
  out.holdZ = -0.02 * lookUp;
  out.twist = 0.1 * side * lookUp;
  out.lean = 0.05 * (write + tick) - 0.02 * lookUp;
  out.sway = out.dip = 0;
  out.lookPitch = 0.34 * (write + tick) - 0.03 * lookUp;
  out.lookYaw = 0.22 * side * lookUp + (1 - lookUp) * out.lookYaw * 0.3;
}

/** The gardener's 12.3 s loop in the bed: three trowel strokes (stab in, lever
 * the soil up, tip it aside), then the free hand pats the soil three times,
 * then a sit back on the heels to look up. The digging spot drifts slowly
 * along the row. Feet stay on their fixed kneeling marks.
 */
export const WORKER_GARDEN_PERIOD = 12.3;
function sampleGardenLoop(t: number, out: WorkerGesture) {
  const gt = wrapTime(t, WORKER_GARDEN_PERIOD);
  const digging = workWindow(gt, 0, 0.35, 6.05, 6.55);
  const s = Math.min(gt, 6.15) / 2.05;
  const stroke = s - Math.floor(s);
  const stab =
    THREE.MathUtils.smoothstep(stroke, 0.04, 0.2) *
    (1 - THREE.MathUtils.smoothstep(stroke, 0.3, 0.52));
  const lever =
    THREE.MathUtils.smoothstep(stroke, 0.3, 0.52) *
    (1 - THREE.MathUtils.smoothstep(stroke, 0.72, 0.96));
  const tip = workWindow(stroke, 0.5, 0.6, 0.68, 0.82);
  const pat = workWindow(gt, 6.6, 7.1, 8.95, 9.45);
  const beat = THREE.MathUtils.clamp((gt - 7.1) / 1.8, 0, 1);
  const patLift = pat * (0.5 + 0.5 * Math.cos(beat * TAU * 3));
  const sitBack = workWindow(gt, 9.4, 10.1, 11.5, 12.2);
  const spot = 0.04 * Math.sin((t * TAU) / (WORKER_GARDEN_PERIOD * 2.6));
  out.toolX = spot;
  // Sitting back lifts the trowel out of the soil and rests it near the knee.
  out.toolY = digging * (-0.03 * stab + 0.07 * lever) + 0.07 * sitBack;
  out.toolZ = digging * (0.025 * stab - 0.045 * lever) - 0.09 * sitBack;
  out.toolPitch = digging * (0.32 * stab - 0.5 * lever) - 0.35 * sitBack;
  out.toolYaw = 0;
  out.toolRoll = digging * 0.5 * tip;
  out.lean = digging * (0.06 * stab - 0.02 * lever) + 0.03 * pat - 0.08 * sitBack;
  out.dip = digging * 0.01 * stab - 0.02 * sitBack;
  out.sway = spot * 0.35 - 0.015 * pat;
  out.twist = -0.08 * pat;
  out.offX = pat * 0.03 + spot * 0.5;
  out.offY = pat * (-0.12 + 0.035 * patLift);
  out.offZ = pat * 0.2;
  out.lookPitch =
    digging * (0.12 + 0.05 * stab) +
    pat * 0.2 -
    sitBack * 0.1 +
    (1 - digging) * out.lookPitch * 0.4;
  out.lookYaw = -0.14 * pat + sitBack * 0.2 * Math.sin(t * 0.37 + 1.1) + digging * out.lookYaw;
}

const GESTURE_CHANNELS = Object.keys(createWorkerGesture()) as Array<keyof WorkerGesture>;
/** One eased sample drives both the pose and held prop. Paused semantic changes
 * snap to their deterministic target without advancing an animation clock.
 * Working if task/greeting transitions soften while palms and props stay coupled.
 */
export function easeWorkerGesture(
  out: WorkerGesture,
  target: WorkerGesture,
  delta: number,
  immediate = false
) {
  const amount = immediate
    ? 1
    : 1 - Math.exp(-12 * (Number.isFinite(delta) ? Math.max(0, delta) : 0));
  for (const key of GESTURE_CHANNELS) {
    const value = Number.isFinite(target[key]) ? target[key] : 0;
    out[key] = THREE.MathUtils.lerp(out[key], value, amount);
  }
  return out;
}

/** One hello per arrival, with a quiet hand-down dwell while the neighbour stays.
 * Working if the wave ends after 2.1 seconds and never repeats on its own clock.
 */
export function sampleWorkerGreeting(seconds: number, out: WorkerGesture) {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  out.greetingLift =
    THREE.MathUtils.smoothstep(t, 0, 0.45) * (1 - THREE.MathUtils.smoothstep(t, 1.65, 2.1));
  out.greetingWave = Math.sin(t * 8) * 0.18 * out.greetingLift;
  return out;
}

/** Bounded, staggered gestures, with no world-clock or per-frame allocations.
 * Working if tools follow the same sampled offset as palms and feet stay planted.
 */
export function sampleWorkerGesture(
  kind: WorkerWorkAction | WorkerWorkVariant | 'rest' | 'idle' | 'greet' | 'briefing',
  seconds: number,
  out: WorkerGesture
) {
  const t = Number.isFinite(seconds) ? seconds : 0;
  const tempo = t + Math.sin(t * 0.41) * 0.18;
  out.breath = Math.sin(t * (kind === 'rest' ? (Math.PI * 2) / 6.8 : 1.45)) * 0.5 + 0.5;
  out.greetingLift = 0;
  out.greetingWave = 0;
  if (kind === 'greet') sampleWorkerGreeting(t, out);
  // Two small changes of standing posture, each with a held position and quiet
  // dwell. Work and seated poses keep their own incoming posture.
  // Working if waiting people gently settle, with stationary boots and no accumulated lean.
  const idleTime = ((t % 19.7) + 19.7) % 19.7;
  const settleLeft =
    THREE.MathUtils.smoothstep(idleTime, 1.4, 3.1) *
    (1 - THREE.MathUtils.smoothstep(idleTime, 5.5, 7.2));
  const settleRight =
    THREE.MathUtils.smoothstep(idleTime, 10.5, 12.2) *
    (1 - THREE.MathUtils.smoothstep(idleTime, 14.3, 15.7));
  out.idleSettle =
    kind === 'idle' || kind === 'greet' ? 0.018 * (settleLeft - settleRight * 0.65) : 0;
  // Held-prop work (bake, garden) is written by its own loop below.
  out.toolY = 0;
  out.toolZ = 0;
  // A glance has a quiet dwell and a smooth return, rather than continuous
  // clockwork nodding. The shared time already carries each person's phase.
  // Working if head gestures pause and seated/tool contact stays unchanged.
  const glanceTime = ((t % 16.9) + 16.9) % 16.9;
  const left =
    THREE.MathUtils.smoothstep(glanceTime, 1.1, 1.9) *
    (1 - THREE.MathUtils.smoothstep(glanceTime, 3.2, 4.15));
  const right =
    THREE.MathUtils.smoothstep(glanceTime, 8.8, 9.6) *
    (1 - THREE.MathUtils.smoothstep(glanceTime, 11.4, 12.5));
  const glance = left + right;
  out.lookYaw = (left - right * 0.82) * (kind === 'garden' ? 0.05 : 0.22);
  out.lookPitch = (left * 0.7 - right) * (kind === 'garden' ? 0.07 : 0.035);
  // Work attention has its own direction; walking/rest use the unmodified glance.
  // Working if inspectors read their held work, gardeners look into the bed,
  // and radio users remain forward-facing without changing hand/boot targets.
  const attentionPitch =
    kind === 'inspect' || kind === 'sample'
      ? 0.16
      : kind === 'repair'
        ? 0.12
        : kind === 'garden'
          ? 0.12
          : kind === 'bake'
            ? 0.1
            : kind === 'operate' || kind === 'supervise'
              ? 0.06
              : 0;
  if (attentionPitch > 0) {
    out.lookYaw *= 0.35;
    out.lookPitch = attentionPitch * (1 - glance * 0.45) + out.lookPitch * 0.4;
  }
  if (kind === 'radio') {
    out.lookYaw *= 0.3;
    out.lookPitch *= 0.4;
  }
  // A hand settles once, holds, then returns. The other hand answers much later.
  // Working if seated people have long quiet dwells rather than repeated fidgeting.
  const restTime = ((t % 31.7) + 31.7) % 31.7;
  const restLeft =
    THREE.MathUtils.smoothstep(restTime, 4, 5.8) *
    (1 - THREE.MathUtils.smoothstep(restTime, 8.1, 10.2));
  const restRight =
    THREE.MathUtils.smoothstep(restTime, 20.5, 22.1) *
    (1 - THREE.MathUtils.smoothstep(restTime, 24, 25.9));
  out.restReach = kind === 'rest' ? restLeft * 0.075 - restRight * 0.055 : 0;
  // A small repeated stroke within a slower attention cycle leaves natural pauses.
  const workTime = ((t % 9.8) + 9.8) % 9.8;
  const attention =
    THREE.MathUtils.smoothstep(workTime, 0.3, 0.9) *
    (1 - THREE.MathUtils.smoothstep(workTime, 5.2, 6));
  // Roles share the established quiet dwell, with different measured rhythms.
  // Working if reading/supervision stay restrained and sampling never looks like wrench turning.
  const strokeRate =
    kind === 'repair'
      ? 2.3
      : kind === 'sample'
        ? 1.65
        : kind === 'inspect'
          ? 1.1
          : kind === 'supervise'
            ? 0.9
            : 2;
  const strokeRange =
    kind === 'inspect' ? 0.45 : kind === 'supervise' ? 0.4 : kind === 'operate' ? 0.7 : 1;
  const checkRate =
    kind === 'sample' ? 0.75 : kind === 'supervise' ? 0.65 : kind === 'repair' ? 0.9 : 1.15;
  out.workStroke = Math.sin(t * strokeRate) * attention * strokeRange;
  out.workCheck = Math.sin(t * checkRate) * attention;
  // One attentive dip and two held glances, phased by the existing body clock.
  // Working if listeners have quiet dwells, planted feet and no work/wave cue.
  if (kind === 'briefing') {
    const briefingTime = ((t % 18.4) + 18.4) % 18.4;
    const near =
      THREE.MathUtils.smoothstep(briefingTime, 0.9, 1.8) *
      (1 - THREE.MathUtils.smoothstep(briefingTime, 4.8, 5.7));
    const far =
      THREE.MathUtils.smoothstep(briefingTime, 9.7, 10.6) *
      (1 - THREE.MathUtils.smoothstep(briefingTime, 12.7, 13.6));
    const dip =
      THREE.MathUtils.smoothstep(briefingTime, 2.25, 2.75) *
      (1 - THREE.MathUtils.smoothstep(briefingTime, 3.05, 3.8));
    out.lookYaw = near * 0.13 - far * 0.09;
    out.lookPitch = 0.018 + dip * 0.085 + far * 0.025;
    out.idleSettle = near * 0.006 - far * 0.004;
    out.workStroke = 0;
    out.workCheck = 0;
  }
  out.toolX = out.toolPitch = out.toolYaw = out.toolRoll = 0;
  out.lean = out.twist = out.sway = out.dip = 0;
  out.offX = out.offY = out.offZ = 0;
  out.holdX = out.holdY = out.holdZ = 0;
  out.point = 0;
  if (kind === 'bake') sampleBakeLoop(tempo, out);
  else if (kind === 'serve') sampleServeLoop(tempo, out);
  else if (kind === 'garden') sampleGardenLoop(tempo, out);
  else if (kind === 'stocktake') sampleStocktakeLoop(tempo, out);
  else if (kind === 'cartcheck') sampleCartCheckLoop(tempo, out);
  return out;
}

/**
 * The Quaternius rig has independent root-mounted foot targets. Rotating only
 * the thighs leaves the boots on the standing mark. Pose both chains and feet,
 * in model coordinates, so a parent rotation still makes the person face +Z.
 * All temporary vectors are per instance and reused; shared geometry is untouched.
 */
export function createSeatedWorkerPose(
  model: THREE.Object3D,
  heightScale = 1,
  bodyScale = 1,
  referenceClip?: THREE.AnimationClip,
  handheldTool: ToolType = 'none'
) {
  const names = [
    'Body',
    'Hips',
    'Abdomen',
    'Head',
    'WristL',
    'WristR',
    'UpperLegL',
    'LowerLegL',
    'FootL',
    'UpperLegR',
    'LowerLegR',
    'FootR',
    'UpperArmL',
    'LowerArmL',
    'UpperArmR',
    'LowerArmR',
  ];
  const bones = new Map(names.map((name) => [name, model.getObjectByName(name)]));
  const saved = [...bones.values()]
    .filter((bone): bone is THREE.Object3D => !!bone)
    .map((bone) => ({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    }));
  const dutyRest = saved.map((entry) => ({
    bone: entry.bone,
    position: entry.position.clone(),
    quaternion: entry.quaternion.clone(),
    scale: entry.scale.clone(),
  }));
  let applied = false;
  let gardenStance = false;
  let gardenAmount = 0;
  const restingWrist = new THREE.Vector3();
  const restingWristRotation = new THREE.Quaternion();
  const inverse = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const parentInverse = new THREE.Matrix4();
  const deltaRotation = new THREE.Quaternion();
  const scale = Number.isFinite(heightScale) && heightScale > 0 ? heightScale : 1;
  const widthScale = Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;
  const supportedPalm = isWorkerHandheldTool(handheldTool) ? workerPalmInWrist(model) : null;
  // Both delivered rigs have a wrist-local -Z palm, opposite the knuckles.
  const supportedFrame = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, -1, 0)
  );
  const supportedRotation = new THREE.Quaternion().setFromRotationMatrix(supportedFrame),
    supportedLocal = new THREE.Matrix4(),
    supportedScale = new THREE.Vector3(),
    supportedOffset = new THREE.Vector3();
  const pelvisHeight = (WORKER_SEAT_HEIGHT + WORKER_SEAT_PELVIS_OFFSET) / scale;
  // Palm centres in each wrist's own frame (the distal-finger overlay never
  // moves Middle1/Middle2), so an absolute hand orientation can put the palm,
  // not the wrist joint, on a held prop's grip.
  model.updateWorldMatrix(true, true);
  const palmInWrist = ['L', 'R'].map((side) => {
    const wrist = model.getObjectByName(`Wrist${side}`),
      first = model.getObjectByName(`Middle1${side}`),
      second = model.getObjectByName(`Middle2${side}`);
    if (!wrist || !first || !second) return null;
    return wrist.worldToLocal(
      first
        .getWorldPosition(new THREE.Vector3())
        .lerp(second.getWorldPosition(new THREE.Vector3()), 0.5)
    );
  });
  // The clipboard's frame on the left wrist, for the writing hand.
  const boardMount =
    handheldTool === 'clipboard' ? createWorkerHandheldMount(model, 'clipboard') : null;
  const boardPosition = boardMount ? new THREE.Vector3(...boardMount.position) : null;
  const boardRotation = boardMount
    ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...boardMount.rotation))
    : null;
  const boardScale = boardMount?.scale[0] ?? 1;
  const boardRotationInverse = boardRotation ? boardRotation.clone().invert() : null;
  const boardNormal = new THREE.Vector3(),
    boardUp = new THREE.Vector3(),
    boardSide = new THREE.Vector3(),
    boardHand = new THREE.Quaternion();
  const writingKnuckles = [model.getObjectByName('Middle1R'), model.getObjectByName('Middle2R')];
  const leftKnuckles = [model.getObjectByName('Middle1L'), model.getObjectByName('Middle2L')];
  const gripPalm = new THREE.Vector3(),
    gripFingers = new THREE.Vector3(),
    gripNormal = new THREE.Vector3(),
    gripSide = new THREE.Vector3(),
    gripBasis = new THREE.Matrix4(),
    gripRotation = new THREE.Quaternion(),
    spine = new THREE.Vector3(),
    xAxis = new THREE.Vector3(1, 0, 0);
  const kneeHeight = 0.46 / scale;

  function modelPosition(bone: THREE.Object3D, target: THREE.Vector3) {
    return bone.getWorldPosition(target).applyMatrix4(inverse);
  }
  function setPosition(bone: THREE.Object3D, point: THREE.Vector3) {
    point.applyMatrix4(model.matrixWorld);
    if (bone.parent) bone.parent.worldToLocal(point);
    bone.position.copy(point);
    bone.updateWorldMatrix(false, true);
  }
  function aim(bone: THREE.Object3D, child: THREE.Object3D | undefined, direction: THREE.Vector3) {
    // Solve in the bone parent's coordinates, preserving nonuniform person scale.
    if (child)
      from.copy(child.position).multiply(bone.scale).applyQuaternion(bone.quaternion).normalize();
    else from.set(0, 1, 0).applyQuaternion(bone.quaternion).normalize();
    to.copy(direction).transformDirection(model.matrixWorld);
    if (bone.parent) {
      parentInverse.copy(bone.parent.matrixWorld).invert();
      to.transformDirection(parentInverse);
    }
    deltaRotation.setFromUnitVectors(from, to);
    bone.quaternion.premultiply(deltaRotation);
    bone.updateWorldMatrix(false, true);
  }
  const direction = new THREE.Vector3();
  const sides = ['L', 'R'];
  const shinLengths = [0.43, 0.43];
  const upperPoint = new THREE.Vector3();
  const endPoint = new THREE.Vector3();
  const kneePoint = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const feet = [new THREE.Vector3(), new THREE.Vector3()];
  const palmLengths = [0.09, 0.09];
  const lengths = { legL: [0, 0], legR: [0, 0], armL: [0, 0], armR: [0, 0] };
  const standingLegLengths = [
    [0, 0],
    [0, 0],
  ];

  const incomingFeet = [new THREE.Vector3(), new THREE.Vector3()];
  const seatedFeet = [new THREE.Vector3(), new THREE.Vector3()];
  const referenceFeet = [new THREE.Vector3(), new THREE.Vector3()];
  const referenceFootRotation = [new THREE.Quaternion(), new THREE.Quaternion()];
  const referenceFootScale = [new THREE.Vector3(), new THREE.Vector3()];
  const incomingFootRotation = [new THREE.Quaternion(), new THREE.Quaternion()];
  const seatedFootRotation = [new THREE.Quaternion(), new THREE.Quaternion()];
  const incomingFootScale = [new THREE.Vector3(), new THREE.Vector3()];
  const seatedFootScale = [new THREE.Vector3(), new THREE.Vector3()];
  const incomingPoles = [new THREE.Vector3(), new THREE.Vector3()];
  const footMatrix = new THREE.Matrix4(),
    footLocal = new THREE.Matrix4();
  const poseQuaternion = new THREE.Quaternion(),
    footQuaternion = new THREE.Quaternion();
  const footScale = new THREE.Vector3(),
    seatHips = new THREE.Vector3();
  model.updateWorldMatrix(true, true);
  inverse.copy(model.matrixWorld).invert();
  let standingHeight = bones.get('Hips') ? modelPosition(bones.get('Hips')!, p).y : 0.9 / scale;
  // Bound each real boot in its Foot bind frame once. A tilted toe can be
  // below the floor even when its ankle clears the planned lift arc.
  const soleBoxes = [new THREE.Box3(), new THREE.Box3()];
  // Eight weight ranges plus rigid Foot vertices keep the mixed-skin bound
  // tight without evaluating/skinning every mesh vertex in the frame loop.
  const groundBoxes = sides.map(
    () =>
      [] as {
        box: THREE.Box3;
        footInverse: THREE.Matrix4;
        calfInverse: THREE.Matrix4;
        lo: number;
        hi: number;
      }[]
  );
  model.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.parent?.name.includes('Worker_Feet')) return;
    const position = mesh.geometry.attributes.position,
      indices = mesh.geometry.attributes.skinIndex,
      weights = mesh.geometry.attributes.skinWeight;
    if (!indices || !weights) return;
    for (let side = 0; side < 2; side++) {
      const foot = bones.get(`Foot${sides[side]}`),
        joint = mesh.skeleton.bones.indexOf(foot as THREE.Bone),
        calfJoint = mesh.skeleton.bones.indexOf(bones.get(`LowerLeg${sides[side]}`) as THREE.Bone);
      if (joint < 0) continue;
      const groups =
        calfJoint < 0
          ? []
          : Array.from({ length: 9 }, () => ({
              box: new THREE.Box3(),
              footInverse: mesh.skeleton.boneInverses[joint].clone(),
              calfInverse: mesh.skeleton.boneInverses[calfJoint].clone(),
              lo: Infinity,
              hi: -Infinity,
            }));
      groundBoxes[side].push(...groups);
      for (let vertex = 0; vertex < position.count; vertex++) {
        let belongs = false;
        for (let influence = 0; influence < 4; influence++)
          if (
            indices.getComponent(vertex, influence) === joint &&
            weights.getComponent(vertex, influence) > 0.001
          )
            belongs = true;
        if (belongs)
          soleBoxes[side].expandByPoint(
            p
              .fromBufferAttribute(position, vertex)
              .applyMatrix4(mesh.bindMatrix)
              .applyMatrix4(mesh.skeleton.boneInverses[joint])
          );
        if (belongs && calfJoint >= 0) {
          let footWeight = 0,
            calfWeight = 0;
          for (let influence = 0; influence < 4; influence++) {
            const jointIndex = indices.getComponent(vertex, influence),
              weight = weights.getComponent(vertex, influence);
            if (jointIndex === joint) footWeight += weight;
            if (jointIndex === calfJoint) calfWeight += weight;
          }
          if (Math.abs(footWeight + calfWeight - 1) > 0.00001) continue;
          const group = groups[Math.min(8, Math.floor(footWeight * 8))];
          group.lo = Math.min(group.lo, footWeight);
          group.hi = Math.max(group.hi, footWeight);
          group.box.expandByPoint(
            p.fromBufferAttribute(position, vertex).applyMatrix4(mesh.bindMatrix)
          );
        }
      }
    }
  });
  const boxCorners = (box: THREE.Box3) => {
    const points: THREE.Vector3[] = [];
    if (!box.isEmpty())
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z));
    return points;
  };
  const soleCorners = soleBoxes.map(boxCorners);
  const groundBounds = groundBoxes.map((groups) =>
    groups
      .filter((group) => !group.box.isEmpty())
      .map((group) => ({
        points: boxCorners(group.box),
        footInverse: group.footInverse,
        calfInverse: group.calfInverse,
        lo: group.lo,
        hi: group.hi,
      }))
  );

  function seatPoint(point: THREE.Vector3, cue: WorkerSeatCue, cosine: number, sine: number) {
    const x = point.x;
    point.x = cosine * x + sine * point.z + cue.x / widthScale;
    point.z = -sine * x + cosine * point.z + cue.z / widthScale;
    return point;
  }
  const seatCalves = sides.map((side) =>
    saved.find((entry) => entry.bone === bones.get(`LowerLeg${side}`))
  );
  const seatArms = saved.filter((entry) => /^(UpperArm|LowerArm|Wrist)/.test(entry.bone.name));

  function capture() {
    for (const entry of saved) {
      entry.position.copy(entry.bone.position);
      entry.quaternion.copy(entry.bone.quaternion);
      entry.scale.copy(entry.bone.scale);
    }
    model.updateWorldMatrix(true, true);
    inverse.copy(model.matrixWorld).invert();
  }
  function chainLengths(
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    end: THREE.Object3D,
    into: number[]
  ) {
    modelPosition(upper, p);
    modelPosition(lower, q);
    modelPosition(end, from);
    into[0] = p.distanceTo(q);
    into[1] = q.distanceTo(from);
  }
  function solveChain(
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    end: THREE.Object3D,
    endpoint: THREE.Vector3,
    lengths: number[],
    poleDirection: THREE.Vector3,
    independentFoot: boolean,
    fixedLengths = false
  ) {
    modelPosition(upper, upperPoint);
    axis.copy(endpoint).sub(upperPoint);
    const distance = Math.max(axis.length(), 0.0001);
    axis.divideScalar(distance);
    const upperLength = lengths[0];
    const lowerLength = fixedLengths
      ? lengths[1]
      : Math.max(lengths[1], distance - upperLength + 0.004);
    if (
      fixedLengths &&
      (distance > upperLength + lowerLength + 0.00001 ||
        distance < Math.abs(upperLength - lowerLength) - 0.00001)
    )
      return false;
    const along = THREE.MathUtils.clamp(
      (upperLength * upperLength + distance * distance - lowerLength * lowerLength) /
        (2 * distance),
      -upperLength,
      upperLength
    );
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    bend.copy(poleDirection).addScaledVector(axis, -poleDirection.dot(axis));
    if (fixedLengths && bend.lengthSq() < 1e-10) {
      bend.set(0, 0, 1).addScaledVector(axis, -axis.z);
      if (bend.lengthSq() < 1e-10) bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
    }
    bend.normalize();
    kneePoint.copy(upperPoint).addScaledVector(axis, along).addScaledVector(bend, height);
    aim(upper, lower, direction.copy(kneePoint).sub(upperPoint));
    modelPosition(lower, endPoint);
    aim(lower, independentFoot ? undefined : end, direction.copy(endpoint).sub(endPoint));
    lower.scale.y *= lowerLength / Math.max(lengths[1], 0.0001);
    lower.updateWorldMatrix(false, true);
    if (independentFoot && !fixedLengths) setPosition(end, p.copy(endpoint));
    return true;
  }

  /** Support the real tool with a fixed-length left arm and a palm-up wrist.
   * Working if the tray stays level and the original boots/restore stay exact.
   */
  function supportHandheld(gesture: WorkerGesture) {
    const upper = bones.get('UpperArmL'),
      lower = bones.get('LowerArmL'),
      wrist = bones.get('WristL'),
      hips = bones.get('Hips');
    if (!supportedPalm || !upper || !lower || !wrist || !hips || !wrist.parent) return;
    model.updateWorldMatrix(false, true);
    chainLengths(upper, lower, wrist, lengths.armL);
    supportedLocal
      .copy(inverse)
      .multiply(wrist.matrixWorld)
      .decompose(p, poseQuaternion, supportedScale);
    supportedOffset.copy(supportedPalm).multiply(supportedScale).applyQuaternion(supportedRotation);
    const hipY = modelPosition(hips, p).y;
    target.set(
      0.17 / widthScale,
      hipY + (handheldTool === 'sample-kit' ? 0.22 : 0.27) / scale,
      0.31 / widthScale
    );
    target.y += (gesture.workCheck * 0.006) / scale;
    target.z += (gesture.workStroke * 0.006) / widthScale;
    target.sub(supportedOffset);
    if (!solveChain(upper, lower, wrist, target, lengths.armL, pole.set(1, -0.2, 0), false, true))
      return;
    supportedLocal
      .copy(wrist.parent.matrixWorld)
      .invert()
      .multiply(model.matrixWorld)
      .multiply(supportedFrame);
    supportedLocal.decompose(p, poseQuaternion, supportedScale);
    wrist.quaternion.copy(poseQuaternion);
    wrist.updateWorldMatrix(false, true);
  }

  function look(gesture?: WorkerGesture, strength = 1) {
    const head = bones.get('Head');
    if (!head || !gesture) return;
    head.rotateY(gesture.lookYaw * strength);
    head.rotateX(gesture.lookPitch * strength);
  }

  /** Rotate a bone about a model-space axis through its own pivot. */
  function turnBone(bone: THREE.Object3D, axisInModel: THREE.Vector3, angle: number) {
    if (!angle) return;
    to.copy(axisInModel).transformDirection(model.matrixWorld);
    if (bone.parent) to.transformDirection(parentInverse.copy(bone.parent.matrixWorld).invert());
    deltaRotation.setFromAxisAngle(to, angle);
    bone.quaternion.premultiply(deltaRotation);
    bone.updateWorldMatrix(false, true);
  }
  /** Fingers along `fingers`, palm facing `palm` (model space, unit-ish). Both
   * rigs point the wrist's +Y down the fingers and its -Z out of the palm. */
  function orientHand(wrist: THREE.Object3D, fingers: THREE.Vector3, palm: THREE.Vector3) {
    if (!wrist.parent) return;
    gripNormal.copy(palm).addScaledVector(fingers, -palm.dot(fingers)).normalize().negate();
    gripSide.crossVectors(fingers, gripNormal).normalize();
    gripBasis.makeBasis(gripSide, fingers, gripNormal);
    supportedLocal
      .copy(wrist.parent.matrixWorld)
      .invert()
      .multiply(model.matrixWorld)
      .multiply(gripBasis);
    supportedLocal.decompose(p, poseQuaternion, supportedScale);
    wrist.quaternion.copy(poseQuaternion);
    wrist.updateWorldMatrix(false, true);
  }
  /** Carry a tray on both palms under its ends: palms up, fingers reaching in
   * and forward under the board, elbows down beside the body. Solved twice so the
   * measured palm centre, not the wrist joint, lands on the grip.
   * Working if both palms stay on the tray ends through every tilt and turn.
   */
  function gripTray(
    index: number,
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    wrist: THREE.Object3D,
    gesture: WorkerGesture | undefined
  ) {
    const side = sides[index] as 'L' | 'R',
      sign = side === 'L' ? 1 : -1,
      armLengths = lengths[side === 'L' ? 'armL' : 'armR'],
      palmLocal = palmInWrist[index];
    workerHeldToolGrip('bake', side, gesture, gripPalm);
    gripPalm.set(gripPalm.x / widthScale, gripPalm.y / scale, gripPalm.z / widthScale);
    workerHeldToolRotation(gesture, gripRotation);
    gripFingers
      .set(-sign * 0.55, 0, 0.84)
      .normalize()
      .applyQuaternion(gripRotation);
    direction.set(sign * 0.12, 1, 0).applyQuaternion(gripRotation);
    target.copy(gripPalm).addScaledVector(gripFingers, -palmLengths[index]);
    for (let pass = 0; pass < 2; pass++) {
      solveChain(upper, lower, wrist, target, armLengths, pole.set(sign * 0.5, -1, -0.45), false);
      orientHand(wrist, gripFingers, direction);
      if (!palmLocal) break;
      // Correct by the measured palm error; the absolute hand frame is unchanged.
      q.copy(palmLocal).applyMatrix4(wrist.matrixWorld).applyMatrix4(inverse);
      target.add(from.copy(gripPalm).sub(q));
    }
  }

  /** One hand's palm centre to a point in unscaled actor metres, fingers along
   * `fingers` (model space), the elbow out, down and back. A point beyond the
   * arm's reach is held at full reach along the same line, never stretched.
   */
  function placeHand(side: 'L' | 'R', x: number, y: number, z: number, fingers: THREE.Vector3) {
    const upper = bones.get(`UpperArm${side}`),
      lower = bones.get(`LowerArm${side}`),
      wrist = bones.get(`Wrist${side}`),
      [first, second] = side === 'L' ? leftKnuckles : writingKnuckles,
      armLengths = lengths[side === 'L' ? 'armL' : 'armR'];
    if (!upper || !lower || !wrist) return;
    model.updateWorldMatrix(false, true);
    chainLengths(upper, lower, wrist, armLengths);
    let palmLength = 0.085 / scale;
    if (first && second) {
      modelPosition(first, p);
      modelPosition(second, q);
      palmLength = p.lerp(q, 0.5).distanceTo(modelPosition(wrist, q));
    }
    gripFingers.copy(fingers).normalize();
    target.set(x / widthScale, y / scale, z / widthScale).addScaledVector(gripFingers, -palmLength);
    modelPosition(upper, p);
    gripSide.copy(target).sub(p);
    const reach = armLengths[0] + armLengths[1] - 0.004;
    if (gripSide.length() > reach) target.copy(p).addScaledVector(gripSide.normalize(), reach);
    const sign = side === 'L' ? 1 : -1;
    solveChain(upper, lower, wrist, target, armLengths, pole.set(sign, -0.6, -0.25), false);
    aim(wrist, undefined, direction.copy(gripFingers));
  }

  /** Hold the clipboard close for reading: palm at the lower chest, elbow
   * bent and tucked against the ribs, the board's paper tilted up and back to
   * the eyes. The wrist frame is whatever puts the mounted board in that
   * frame; the palm centre is solved onto its mark in two passes.
   * Working if the board hand never reaches out and the sheet faces the head.
   */
  function holdBoard(gesture: WorkerGesture) {
    const upper = bones.get('UpperArmL'),
      lower = bones.get('LowerArmL'),
      wrist = bones.get('WristL'),
      hips = bones.get('Hips'),
      palmLocal = palmInWrist[0];
    if (!boardRotationInverse || !upper || !lower || !wrist || !hips || !palmLocal) {
      supportHandheld(gesture);
      return;
    }
    model.updateWorldMatrix(false, true);
    chainLengths(upper, lower, wrist, lengths.armL);
    const hipY = modelPosition(hips, p).y;
    gripPalm.set(
      (0.1 + gesture.holdX) / widthScale,
      hipY + (0.3 + gesture.holdY) / scale,
      (0.15 + gesture.holdZ) / widthScale
    );
    // Paper (+Z) steeply up and back toward the eyes, a touch inward; clip (+Y)
    // away and up, so the board leans back against the reading line.
    boardNormal.set(-0.2, 0.55, -0.8).normalize();
    boardUp.set(0, 0, 1).addScaledVector(boardNormal, -boardNormal.z).normalize();
    boardSide.crossVectors(boardUp, boardNormal);
    gripBasis.makeBasis(boardSide, boardUp, boardNormal);
    boardHand.setFromRotationMatrix(gripBasis).multiply(boardRotationInverse);
    gripBasis.makeRotationFromQuaternion(boardHand);
    from.set(0, 1, 0).applyQuaternion(boardHand);
    target.copy(gripPalm).addScaledVector(from, -palmLengths[0]);
    for (let pass = 0; pass < 2; pass++) {
      solveChain(upper, lower, wrist, target, lengths.armL, pole.set(0.35, -1, -0.7), false);
      supportedLocal
        .copy(wrist.parent!.matrixWorld)
        .invert()
        .multiply(model.matrixWorld)
        .multiply(gripBasis);
      supportedLocal.decompose(p, poseQuaternion, supportedScale);
      wrist.quaternion.copy(poseQuaternion);
      wrist.updateWorldMatrix(false, true);
      q.copy(palmLocal).applyMatrix4(wrist.matrixWorld).applyMatrix4(inverse);
      target.add(from.copy(gripPalm).sub(q));
    }
  }

  /** The right hand works down the clipboard held in the left: fingertips on
   * the sheet (the board's own frame, so it follows the supporting hand),
   * elbow bent and down. A brief point toward where the head turns reaches out
   * to about four fifths of the arm, never straight.
   * Working if the fingers touch the paper while writing and lift between lines.
   */
  function writeOnBoard(gesture: WorkerGesture) {
    const upper = bones.get('UpperArmR'),
      lower = bones.get('LowerArmR'),
      wrist = bones.get('WristR'),
      board = bones.get('WristL'),
      [first, second] = writingKnuckles;
    if (!boardPosition || !boardRotation || !upper || !lower || !wrist || !board) return;
    model.updateWorldMatrix(false, true);
    chainLengths(upper, lower, wrist, lengths.armR);
    let palmLength = 0.085 / scale;
    if (first && second) {
      modelPosition(first, p);
      modelPosition(second, q);
      palmLength = p.lerp(q, 0.5).distanceTo(modelPosition(wrist, q));
    }
    // Fingertips meet the paper (its face is 8.5 mm off the board's centre).
    gripPalm
      .set(gesture.offX, gesture.offY, 0.0095 + gesture.offZ)
      .multiplyScalar(boardScale)
      .applyQuaternion(boardRotation)
      .add(boardPosition)
      .applyMatrix4(board.matrixWorld)
      .applyMatrix4(inverse);
    // Palm toward the sheet, fingers down along it and a little into it, the
    // way a hand holds a pencil to paper.
    boardNormal.set(0, 0, 1).applyQuaternion(boardRotation).transformDirection(board.matrixWorld);
    boardNormal.transformDirection(inverse);
    gripFingers.set(0.3, -1, 0.15);
    gripFingers
      .addScaledVector(boardNormal, -gripFingers.dot(boardNormal))
      .normalize()
      .multiplyScalar(0.85)
      .addScaledVector(boardNormal, -0.4)
      .normalize();
    boardUp.copy(boardNormal).negate();
    target.copy(gripPalm).addScaledVector(gripFingers, -(palmLength + 0.09 / scale));
    const point = THREE.MathUtils.clamp(gesture.point, 0, 1);
    if (point > 0) {
      // Toward the look, at shelf height, about 80% of the arm's reach.
      const yaw = gesture.lookYaw + gesture.twist;
      boardSide.set(
        (-0.08 + Math.sin(yaw) * 0.28) / widthScale,
        1.18 / scale,
        (Math.cos(yaw) * 0.28) / widthScale
      );
      target.lerp(boardSide, point);
      modelPosition(upper, p);
      gripFingers.lerp(boardSide.sub(p).normalize(), point).normalize();
      boardUp.lerp(direction.set(0, -1, 0), point).normalize();
    }
    solveChain(upper, lower, wrist, target, lengths.armR, pole.set(-0.6, -1, -0.5), false);
    orientHand(wrist, gripFingers, boardUp);
  }

  function applyTask(
    task: 'push' | 'pull' | 'bake' | 'garden',
    gesture?: WorkerGesture,
    gardenWeight = 1
  ) {
    capture();
    const body = bones.get('Body'),
      hips = bones.get('Hips'),
      abdomen = bones.get('Abdomen');
    if (!body || !hips) return;
    for (let index = 0; index < sides.length; index++) {
      const side = sides[index];
      const thigh = bones.get(`UpperLeg${side}`),
        calf = bones.get(`LowerLeg${side}`),
        foot = bones.get(`Foot${side}`);
      const upper = bones.get(`UpperArm${side}`),
        lower = bones.get(`LowerArm${side}`),
        wrist = bones.get(`Wrist${side}`);
      if (thigh && calf && foot) {
        chainLengths(thigh, calf, foot, lengths[side === 'L' ? 'legL' : 'legR']);
        modelPosition(foot, feet[index]);
      }
      if (upper && lower && wrist) {
        chainLengths(upper, lower, wrist, lengths[side === 'L' ? 'armL' : 'armR']);
        const m1 = model.getObjectByName(`Middle1${side}`),
          m2 = model.getObjectByName(`Middle2${side}`);
        if (m1 && m2) {
          modelPosition(m1, p);
          modelPosition(m2, q);
          p.lerp(q, 0.5);
          palmLengths[index] = p.distanceTo(modelPosition(wrist, q));
        }
      }
    }
    modelPosition(hips, p);
    // Keep the natural standing pelvis for carry/push poses; props meet the
    // hands, rather than forcing every task into a permanent squat.
    const hipTarget =
      task === 'garden' ? THREE.MathUtils.lerp(p.y * scale, 0.44, gardenWeight) : p.y * scale;
    const lift = hipTarget / scale - p.y;
    // Held-prop work shifts weight and bends into the knees; the feet below
    // are solved back onto their marks, so only the legs take it up.
    const held = !!gesture && (task === 'bake' || task === 'garden');
    const bodyWeight = task === 'garden' ? gardenWeight : 1;
    modelPosition(body, p);
    p.y += lift - (held ? (gesture.dip * bodyWeight) / scale : 0);
    p.x += held ? (gesture.sway * bodyWeight) / widthScale : 0;
    setPosition(body, p);
    if (abdomen) {
      spine
        .set(
          0,
          task === 'garden' ? THREE.MathUtils.lerp(1, 0.68, gardenWeight) : 1,
          task === 'garden' ? 0.73 * gardenWeight : task === 'pull' ? -0.05 : 0.15
        )
        .normalize();
      if (held) spine.applyAxisAngle(xAxis, gesture.lean * bodyWeight);
      aim(hips, abdomen, direction.copy(spine));
      if (held) turnBone(abdomen, spine, gesture.twist * bodyWeight);
    }
    const head = bones.get('Head');
    if (head)
      aim(head, undefined, direction.set(0, 1, task === 'garden' ? 0.35 * gardenWeight : 0));
    look(gesture);
    for (let index = 0; index < sides.length; index++) {
      const side = sides[index],
        sign = side === 'L' ? 1 : -1;
      const thigh = bones.get(`UpperLeg${side}`),
        calf = bones.get(`LowerLeg${side}`),
        foot = bones.get(`Foot${side}`);
      if (thigh && calf && foot) {
        target.copy(feet[index]);
        if (task === 'garden')
          target.set((sign * 0.15) / widthScale, 0.028 / scale, -0.1 / widthScale);
        solveChain(
          thigh,
          calf,
          foot,
          target,
          lengths[side === 'L' ? 'legL' : 'legR'],
          pole.set(0, 0, 1),
          true
        );
      }
      const upper = bones.get(`UpperArm${side}`),
        lower = bones.get(`LowerArm${side}`),
        wrist = bones.get(`Wrist${side}`);
      if (upper && lower && wrist) {
        if (task === 'garden' && gardenWeight === 0) continue;
        if (task === 'garden' && gardenWeight < 1) {
          modelPosition(wrist, restingWrist);
          restingWristRotation.copy(wrist.quaternion);
        }
        if (task === 'bake') {
          gripTray(index, upper, lower, wrist, gesture);
          continue;
        }
        // The trowel turns about the left palm; the hand turns with it. The
        // right hand braces on the knee and leaves it only to pat the soil.
        direction.set(0, -1, 0);
        if (task === 'garden' && side === 'L') {
          workerHeldToolGrip('garden', 'L', gesture, target);
          direction.applyQuaternion(workerHeldToolRotation(gesture, gripRotation));
        } else if (task === 'garden')
          target.set(
            -0.12 + (gesture?.offX ?? 0),
            0.4 + (gesture?.offY ?? 0),
            0.26 + (gesture?.offZ ?? 0)
          );
        else target.set(sign * 0.32, 1.05, task === 'push' ? 0.2 : -0.2);
        target.set(target.x / widthScale, target.y / scale, target.z / widthScale);
        // Grip denotes the centre of the palm, not the wrist joint above it.
        target.addScaledVector(direction, -palmLengths[index]);
        if (task === 'garden' && gardenWeight < 1) {
          target.lerp(restingWrist, 1 - gardenWeight);
          modelPosition(upper, p);
          gripFingers.copy(target).sub(p);
          const armLengths = lengths[side === 'L' ? 'armL' : 'armR'];
          const reach = armLengths[0] + armLengths[1] - 0.004;
          // Intermediate reaches carry no tool. Keep them anatomically reachable
          // rather than stretching a forearm to a linear blend of two endpoints.
          if (gripFingers.length() > reach)
            target.copy(p).addScaledVector(gripFingers.normalize(), reach);
        }
        gripPalm.copy(direction);
        solveChain(
          upper,
          lower,
          wrist,
          target,
          lengths[side === 'L' ? 'armL' : 'armR'],
          pole.set(sign, -0.2, 0),
          false
        );
        aim(wrist, undefined, direction.copy(gripPalm));
        if (task === 'garden' && gardenWeight < 1)
          blendWorkerRotation(
            wrist.quaternion,
            wrist.quaternion,
            restingWristRotation,
            1 - gardenWeight
          );
      }
    }
    applied = true;
    model.updateWorldMatrix(false, true);
  }

  const transitionThigh = new THREE.Quaternion(),
    transitionCalf = new THREE.Quaternion();
  const wheelHand = { x: 0, y: 0, z: 0, onRim: true },
    caneGrip = { x: 0, y: 0, z: 0 },
    caneTip = { x: 0, y: 0, z: 0 };
  // Ten and two on a steering rim, radians either side of its top.
  const DRIVE_GRIP_ANGLE = 1.05;
  // A palm's centre ahead of its wrist joint, actor metres.
  const DRIVE_PALM_METRES = 0.085;
  const driveFingers = new THREE.Vector3();
  const driveShoulder = new THREE.Vector3();
  const driveReach = new THREE.Vector3();
  /** One palm onto a point of the rim (actor metres), fingers along driveFingers,
   * elbow out and down; a point past the arm's reach is held at full reach. */
  function gripRim(side: 'L' | 'R', x: number, y: number, z: number) {
    const upper = bones.get(`UpperArm${side}`),
      lower = bones.get(`LowerArm${side}`),
      wrist = bones.get(`Wrist${side}`),
      armLengths = lengths[side === 'L' ? 'armL' : 'armR'];
    if (!upper || !lower || !wrist) return;
    model.updateWorldMatrix(false, true);
    chainLengths(upper, lower, wrist, armLengths);
    driveFingers.normalize();
    target
      .set(x / widthScale, y / scale, z / widthScale)
      .addScaledVector(driveFingers, -DRIVE_PALM_METRES / scale);
    modelPosition(upper, driveShoulder);
    driveReach.copy(target).sub(driveShoulder);
    const reach = armLengths[0] + armLengths[1] - 0.004;
    if (driveReach.length() > reach)
      target.copy(driveShoulder).addScaledVector(driveReach.normalize(), reach);
    const sign = side === 'L' ? 1 : -1;
    solveChain(upper, lower, wrist, target, armLengths, pole.set(sign, -0.6, -0.25), false);
    aim(wrist, undefined, driveFingers);
  }
  const controller = {
    applyTask,
    /** Seated at a vehicle's controls (after applySeat): both palms on the
     * wheel's rim at ten and two, going round with it as it turns, and the
     * head toward the way the vehicle goes. A forklift operator used to sit
     * in the rest pose, hands in the lap, and read as a passenger.
     * Working if both palms stay on the rim through the whole steering range.
     */
    applyDrive(cue: WorkerDriveCue) {
      if (
        !applied ||
        !Number.isFinite(cue.wheelY) ||
        !Number.isFinite(cue.radius) ||
        !Number.isFinite(cue.rimTurn)
      )
        return;
      for (const side of sides) {
        const sign = side === 'L' ? 1 : -1;
        const angle = sign * DRIVE_GRIP_ANGLE + cue.rimTurn;
        const across = Math.sin(angle) * cue.radius;
        const up = Math.cos(angle) * cue.radius;
        // Fingers over the rim, forward and in toward the hub.
        driveFingers.set(-across * 1.5, -0.35, 1);
        gripRim(
          side as 'L' | 'R',
          cue.wheelX + across,
          cue.wheelY + up * Math.cos(cue.tilt),
          cue.wheelZ - up * Math.sin(cue.tilt)
        );
      }
      const head = bones.get('Head');
      if (head && Number.isFinite(cue.lookYaw)) {
        head.rotateY(cue.lookYaw);
        // Eyes down the forks a touch, at the way ahead.
        head.rotateX(0.06);
      }
      model.updateWorldMatrix(false, true);
    },
    /** Quaternion crossfades and independent foot translations follow different
     * curves. Close a standing duty/neutral handover using measured anatomy.
     * Working if ankles meet calves while feet, steady gait and restore stay exact.
     */
    closeDutyTransition(amount: number) {
      const influence =
        THREE.MathUtils.smoothstep(amount, 0.00001, 0.02) *
        (1 - THREE.MathUtils.smoothstep(amount, 0.98, 0.99999));
      if (!Number.isFinite(influence) || influence <= 0) return true;
      if (!applied) capture();
      let closed = true;
      for (let i = 0; i < sides.length; i++) {
        const thigh = bones.get(`UpperLeg${sides[i]}`),
          calf = bones.get(`LowerLeg${sides[i]}`),
          foot = bones.get(`Foot${sides[i]}`);
        if (!thigh || !calf || !foot || standingLegLengths[i][0] <= 0) continue;
        modelPosition(foot, target);
        modelPosition(calf, pole).sub(modelPosition(thigh, p));
        transitionThigh.copy(thigh.quaternion);
        transitionCalf.copy(calf.quaternion);
        closed =
          solveChain(thigh, calf, foot, target, standingLegLengths[i], pole, true, true) && closed;
        blendWorkerRotation(thigh.quaternion, thigh.quaternion, transitionThigh, 1 - influence);
        blendWorkerRotation(calf.quaternion, calf.quaternion, transitionCalf, 1 - influence);
      }
      applied = true;
      model.updateWorldMatrix(false, true);
      return closed;
    },
    /** The delivered walking clips roll a sole below the actor's support plane.
     * Reuse the cached bind bounds and anatomical closure, never lift the body.
     * Working if soles clear the floor with exact horizontal stride and restore.
     */
    applyGroundContact() {
      if (!applied) capture();
      let closed = true;
      for (let i = 0; i < sides.length; i++) {
        const foot = bones.get(`Foot${sides[i]}`),
          thigh = bones.get(`UpperLeg${sides[i]}`),
          calf = bones.get(`LowerLeg${sides[i]}`);
        if (!foot || !thigh || !calf || !soleCorners[i].length) continue;
        // Bound each weight range's convex skin blend. Keeping rigid vertices
        // separate avoids over-lifting them for an unused calf contribution.
        for (let pass = 0; pass < 6; pass++) {
          let bottom = Infinity;
          footMatrix.copy(inverse).multiply(foot.matrixWorld);
          footLocal.copy(inverse).multiply(calf.matrixWorld);
          for (const group of groundBounds[i])
            for (const corner of group.points) {
              // Blend the SAME bind point before taking a minimum. Independent
              // minima for the two bones invent a low corner and cause hovering.
              p.copy(corner).applyMatrix4(group.footInverse).applyMatrix4(footMatrix);
              q.copy(corner).applyMatrix4(group.calfInverse).applyMatrix4(footLocal);
              bottom = Math.min(
                bottom,
                group.lo * p.y + (1 - group.lo) * q.y,
                group.hi * p.y + (1 - group.hi) * q.y
              );
            }
          if (bottom >= -0.00005) break;
          if (pass === 5) {
            closed = false;
            break;
          }
          modelPosition(foot, target);
          target.y += 0.0005 / scale - bottom;
          modelPosition(calf, pole).sub(modelPosition(thigh, p));
          if (!solveChain(thigh, calf, foot, target, standingLegLengths[i], pole, true, true)) {
            closed = false;
            break;
          }
          // Foot targets are independently parented. Change only translation,
          // retaining their exact sampled rotation/scale even under a scaled actor.
          setPosition(foot, p.copy(target));
        }
      }
      applied = true;
      model.updateWorldMatrix(false, true);
      return closed;
    },
    applyGarden(working: boolean, gesture?: WorkerGesture, delta = 0, immediate = false) {
      if (!working && !gardenStance) return false;
      gardenStance = true;
      const target = working ? 1 : 0;
      const dt = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.075) : 0;
      gardenAmount = immediate ? target : THREE.MathUtils.damp(gardenAmount, target, 4.5, dt);
      if (Math.abs(gardenAmount - target) < 0.001) gardenAmount = target;
      // Retain this stationary stance during the pause. Working if rising never
      // drags the boots, and the trowel is shown only at the exact original grip.
      applyTask('garden', gesture, gardenAmount);
      return true;
    },
    gardenGripReady: () => gardenStance && gardenAmount === 1,
    releaseGarden() {
      gardenStance = false;
      gardenAmount = 0;
    },
    /** Fade a duty overlay over the same restored mixer sample. No clock or
     * retained pose history: working if source/full endpoints and restore stay exact.
     */
    applyDuty(action: WorkerWorkAction, gesture: WorkerGesture, amount: number, walking = false) {
      const weight = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
      if (weight === 0) {
        if (walking) this.applyWalkingLook(gesture);
        else this.applyIdle(gesture);
        return;
      }
      if (weight === 1) {
        if (action === 'bake') this.applyTask('bake', gesture);
        else this.applyWork(action, gesture);
        return;
      }
      // Keep a separate base buffer: each endpoint's capture owns `saved`.
      if (walking) this.applyWalkingLook(gesture);
      else this.applyIdle(gesture);
      for (const entry of dutyRest) {
        entry.position.copy(entry.bone.position);
        entry.quaternion.copy(entry.bone.quaternion);
        entry.scale.copy(entry.bone.scale);
      }
      this.restore();
      if (action === 'bake') {
        capture();
        for (let i = 0; i < sides.length; i++) {
          const foot = bones.get(`Foot${sides[i]}`),
            thigh = bones.get(`UpperLeg${sides[i]}`),
            calf = bones.get(`LowerLeg${sides[i]}`);
          if (!foot || !thigh || !calf) continue;
          footMatrix
            .copy(inverse)
            .multiply(foot.matrixWorld)
            .decompose(incomingFeet[i], incomingFootRotation[i], incomingFootScale[i]);
          modelPosition(calf, incomingPoles[i]).sub(modelPosition(thigh, p));
        }
        this.applyTask('bake', gesture);
      } else this.applyWork(action, gesture);
      for (const entry of dutyRest) {
        poseQuaternion.copy(entry.bone.quaternion);
        entry.bone.position.lerpVectors(entry.position, entry.bone.position, weight);
        blendWorkerRotation(entry.bone.quaternion, entry.quaternion, poseQuaternion, weight);
        entry.bone.scale.lerpVectors(entry.scale, entry.bone.scale, weight);
      }
      model.updateWorldMatrix(false, true);
      if (action === 'bake')
        for (let i = 0; i < sides.length; i++) {
          const foot = bones.get(`Foot${sides[i]}`),
            thigh = bones.get(`UpperLeg${sides[i]}`),
            calf = bones.get(`LowerLeg${sides[i]}`);
          if (!foot || !thigh || !calf) continue;
          const original = seatCalves[i];
          if (original) calf.scale.copy(original.scale);
          pole.copy(incomingPoles[i]).lerp(direction.set(0, 0, 1), weight);
          solveChain(
            thigh,
            calf,
            foot,
            incomingFeet[i],
            lengths[i === 0 ? 'legL' : 'legR'],
            pole,
            true
          );
          footMatrix.compose(incomingFeet[i], incomingFootRotation[i], incomingFootScale[i]);
          footLocal
            .copy(foot.parent!.matrixWorld)
            .invert()
            .multiply(model.matrixWorld)
            .multiply(footMatrix);
          footLocal.decompose(foot.position, foot.quaternion, foot.scale);
          foot.updateWorldMatrix(false, true);
        }
      const abdomen = bones.get('Abdomen');
      if (abdomen)
        abdomen.userData.workerIdleSettle = walking ? 0 : gesture.idleSettle * (1 - weight);
      model.updateWorldMatrix(false, true);
    },
    applyWork(action: WorkerWorkAction, gesture: WorkerGesture) {
      capture();
      look(gesture);
      const abdomen = bones.get('Abdomen');
      if (abdomen) abdomen.scale.z *= 1 + gesture.breath * 0.009;
      const left = bones.get('LowerArmL');
      const right = bones.get('LowerArmR');
      const wrist = bones.get('WristL');
      // The tool is wrist-mounted, so the same joint drives hand and tool.
      // Working if hands move through a bounded cycle without displacing the feet.
      if (action === 'repair') {
        left?.rotateX(gesture.workStroke * 0.19);
        wrist?.rotateY(gesture.workStroke * 0.14);
      } else if (action === 'sample') {
        left?.rotateX(gesture.workCheck * 0.1);
        wrist?.rotateZ(gesture.workStroke * 0.12);
        right?.rotateX(-gesture.workStroke * 0.08);
      } else if (action === 'operate' || action === 'inspect') {
        left?.rotateX(gesture.workCheck * 0.08);
        right?.rotateX(gesture.workStroke * 0.16);
      } else if (action === 'supervise') {
        left?.rotateX(gesture.workCheck * 0.07);
        right?.rotateZ(gesture.workStroke * 0.12);
      }
      if ((action === 'stocktake' || action === 'cartcheck') && abdomen) {
        turnBone(abdomen, xAxis, gesture.lean);
        turnBone(abdomen, spine.set(0, 1, 0), gesture.twist);
      }
      if (supportedPalm && (action === 'inspect' || action === 'supervise' || action === 'sample'))
        supportHandheld(gesture);
      if (action === 'stocktake') holdBoard(gesture);
      if (action === 'stocktake') writeOnBoard(gesture);
      // Both palms rest on the cart's near rail (0.35 m ahead, top 0.82 m),
      // and come back to the waist as the courier straightens.
      if (action === 'cartcheck') {
        placeHand(
          'L',
          0.22 + gesture.holdX,
          0.845 + gesture.holdY,
          0.35 + gesture.holdZ,
          direction.set(-0.25, -0.85, 0.45)
        );
        placeHand(
          'R',
          -0.22 + gesture.offX,
          0.845 + gesture.offY,
          0.35 + gesture.offZ,
          direction.set(0.25, -0.85, 0.45)
        );
      }
      // Radio already has an authored speaking gesture; only add the head glance.
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    applyWalkingLook(gesture: WorkerGesture) {
      capture();
      // A small occasional look complements the walking clip. No torso/limb
      // edits: working if both real rigs retain exact gait/boot transforms and
      // restore the incoming mixer pose without rotational accumulation.
      look(gesture, 0.35);
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    applyIdle(gesture: WorkerGesture) {
      capture();
      look(gesture);
      const abdomen = bones.get('Abdomen');
      if (abdomen) {
        abdomen.rotateZ(gesture.lookPitch * 0.25 + gesture.idleSettle);
        abdomen.userData.workerIdleSettle = gesture.idleSettle;
        abdomen.scale.z *= 1 + gesture.breath * 0.012;
      }
      const upper = bones.get('UpperArmR'),
        lower = bones.get('LowerArmR'),
        wrist = bones.get('WristR');
      if (gesture.greetingLift > 0 && upper && lower && wrist) {
        chainLengths(upper, lower, wrist, lengths.armR);
        modelPosition(upper, p);
        target.set(p.x - 0.15 / widthScale, p.y + 0.12 / scale, p.z + 0.12 / widthScale);
        modelPosition(wrist, q);
        target.lerpVectors(q, target, gesture.greetingLift);
        solveChain(upper, lower, wrist, target, lengths.armR, pole.set(-1, -0.2, 0), false);
        aim(wrist, undefined, direction.set(0, 1, 0));
        wrist.rotateZ(gesture.greetingWave);
      }
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    restore() {
      if (!applied) return;
      const abdomen = bones.get('Abdomen');
      if (abdomen) abdomen.userData.workerIdleSettle = 0;
      for (const entry of saved) {
        entry.bone.position.copy(entry.position);
        entry.bone.quaternion.copy(entry.quaternion);
        entry.bone.scale.copy(entry.scale);
      }
      applied = false;
    },
    /** Bicycle coordinates are metres in the unscaled actor root, facing +Z. */
    applyCycling(phase: number) {
      capture();
      const body = bones.get('Body');
      const hips = bones.get('Hips');
      const abdomen = bones.get('Abdomen');
      if (!body || !hips) return;
      for (const side of sides) {
        const thigh = bones.get(`UpperLeg${side}`);
        const calf = bones.get(`LowerLeg${side}`);
        const foot = bones.get(`Foot${side}`);
        const upper = bones.get(`UpperArm${side}`);
        const lower = bones.get(`LowerArm${side}`);
        const wrist = bones.get(`Wrist${side}`);
        if (thigh && calf && foot)
          chainLengths(thigh, calf, foot, lengths[side === 'L' ? 'legL' : 'legR']);
        if (upper && lower && wrist)
          chainLengths(upper, lower, wrist, lengths[side === 'L' ? 'armL' : 'armR']);
      }
      modelPosition(hips, p);
      const lift = 0.95 / scale - p.y;
      const shift = -0.1 / widthScale - p.z;
      modelPosition(body, p);
      p.y += lift;
      p.z += shift;
      setPosition(body, p);
      // Lean from the waist so the short authored arms can reach a city-bike bar.
      if (abdomen) aim(hips, abdomen, direction.set(0, 0.65, 0.76));
      const head = bones.get('Head');
      if (head) aim(head, undefined, direction.set(0, 1, 0));
      const safePhase = Number.isFinite(phase) ? phase : 0;
      for (const side of sides) {
        const sign = side === 'L' ? 1 : -1;
        const thigh = bones.get(`UpperLeg${side}`);
        const calf = bones.get(`LowerLeg${side}`);
        const foot = bones.get(`Foot${side}`);
        if (thigh && calf && foot) {
          target.set(
            (sign * 0.16) / widthScale,
            (0.36 + BICYCLE_FOOT_TARGET_CLEARANCE + sign * 0.15 * Math.cos(safePhase)) / scale,
            (0.04 + sign * 0.15 * Math.sin(safePhase)) / widthScale
          );
          solveChain(
            thigh,
            calf,
            foot,
            target,
            lengths[side === 'L' ? 'legL' : 'legR'],
            pole.set(0, 0, 1),
            true
          );
        }
        const upper = bones.get(`UpperArm${side}`);
        const lower = bones.get(`LowerArm${side}`);
        const wrist = bones.get(`Wrist${side}`);
        if (upper && lower && wrist) {
          target.set((sign * 0.23) / widthScale, 1.08 / scale, 0.57 / widthScale);
          solveChain(
            upper,
            lower,
            wrist,
            target,
            lengths[side === 'L' ? 'armL' : 'armR'],
            pole.set(sign * 0.6, -0.4, 0),
            false
          );
        }
      }
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    /**
     * Seated in a manual wheelchair (WHEELCHAIR, actor-root metres, facing +Z):
     * pelvis on the cushion, feet on the footplate, palms on the push rims at
     * the push cycle `phase` (wheelchairHandPoint), leaning into each push.
     * `reach` 1 brings both hands forward to a work surface instead.
     * Working if the palms meet the rims through the push and the feet stay on
     * the plate (accessibilityLayout.test.ts covers the hand path).
     */
    applyWheelchair(phase: number, reach = 0) {
      capture();
      const body = bones.get('Body'),
        hips = bones.get('Hips'),
        abdomen = bones.get('Abdomen');
      if (!body || !hips) return;
      for (const side of sides) {
        const thigh = bones.get(`UpperLeg${side}`),
          calf = bones.get(`LowerLeg${side}`),
          foot = bones.get(`Foot${side}`),
          upper = bones.get(`UpperArm${side}`),
          lower = bones.get(`LowerArm${side}`),
          wrist = bones.get(`Wrist${side}`);
        if (thigh && calf && foot)
          chainLengths(thigh, calf, foot, lengths[side === 'L' ? 'legL' : 'legR']);
        if (upper && lower && wrist)
          chainLengths(upper, lower, wrist, lengths[side === 'L' ? 'armL' : 'armR']);
      }
      const work = THREE.MathUtils.clamp(Number.isFinite(reach) ? reach : 0, 0, 1);
      const cycle = Number.isFinite(phase) ? (((phase / (Math.PI * 2)) % 1) + 1) % 1 : 0;
      // Lean in through the push, sit back through the recovery.
      const lean =
        (1 - work) *
        (cycle < WHEELCHAIR_PUSH.contact
          ? Math.sin((Math.PI * cycle) / WHEELCHAIR_PUSH.contact)
          : 0);
      modelPosition(hips, p);
      const lift = (WHEELCHAIR.seatHeight + WORKER_SEAT_PELVIS_OFFSET) / scale - p.y;
      const shift = (WHEELCHAIR.seatBackZ + 0.14) / widthScale - p.z;
      modelPosition(body, p);
      p.y += lift;
      p.z += shift;
      setPosition(body, p);
      if (abdomen) aim(hips, abdomen, direction.set(0, 1, 0.1 + 0.22 * lean + 0.2 * work));
      const head = bones.get('Head');
      if (head) aim(head, undefined, direction.set(0, 1, 0.08));
      for (const side of sides) {
        const sign = side === 'L' ? 1 : -1;
        const thigh = bones.get(`UpperLeg${side}`),
          calf = bones.get(`LowerLeg${side}`),
          foot = bones.get(`Foot${side}`);
        if (thigh && calf && foot) {
          target.set(
            (sign * 0.12) / widthScale,
            (WHEELCHAIR.footplateY + 0.05) / scale,
            (WHEELCHAIR.footplateZ - 0.06) / widthScale
          );
          solveChain(
            thigh,
            calf,
            foot,
            target,
            lengths[side === 'L' ? 'legL' : 'legR'],
            pole.set(0, 0.4, 1),
            true
          );
        }
        const upper = bones.get(`UpperArm${side}`),
          lower = bones.get(`LowerArm${side}`),
          wrist = bones.get(`Wrist${side}`);
        if (!upper || !lower || !wrist) continue;
        wheelchairHandPoint(sign as 1 | -1, phase, wheelHand);
        // The wrist sits a little above and behind the palm on the rim.
        target.set(wheelHand.x - sign * 0.02, wheelHand.y + 0.06, wheelHand.z - 0.05);
        if (work > 0) {
          gripSide.set(sign * 0.2, WHEELCHAIR.seatHeight + 0.3, 0.36);
          target.lerp(gripSide, work);
        }
        target.set(target.x / widthScale, target.y / scale, target.z / widthScale);
        solveChain(
          upper,
          lower,
          wrist,
          target,
          lengths[side === 'L' ? 'armL' : 'armR'],
          pole.set(sign * 0.6, -0.3, -0.75),
          false
        );
        gripFingers.set(-sign * 0.25, -0.7 * (1 - work), 0.6 + 0.4 * work).normalize();
        direction.set(-sign * (1 - work), -0.3 - 0.7 * work, 0).normalize();
        orientHand(wrist, gripFingers, direction);
      }
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    /**
     * A long cane in the right hand, held at the midline at the grip
     * LONG_CANE gives, its tip on the ground `sweep` (-1..1) across the path.
     * Only the right arm moves; the gait or stance underneath is kept, so call
     * it after the walking or idle overlay. Working if the palm stays on the
     * grip the cane prop is drawn from (both read longCanePoints).
     */
    applyLongCane(sweep: number) {
      if (!applied) capture();
      const upper = bones.get('UpperArmR'),
        lower = bones.get('LowerArmR'),
        wrist = bones.get('WristR');
      if (!upper || !lower || !wrist) return;
      model.updateWorldMatrix(false, true);
      inverse.copy(model.matrixWorld).invert();
      chainLengths(upper, lower, wrist, lengths.armR);
      longCanePoints(sweep, caneGrip, caneTip);
      gripFingers
        .set(caneTip.x - caneGrip.x, caneTip.y - caneGrip.y, caneTip.z - caneGrip.z)
        .normalize();
      target
        .set(caneGrip.x, caneGrip.y, caneGrip.z)
        .addScaledVector(gripFingers, -0.07)
        .set(target.x / widthScale, target.y / scale, target.z / widthScale);
      solveChain(upper, lower, wrist, target, lengths.armR, pole.set(-0.7, -0.5, -0.3), false);
      orientHand(wrist, gripFingers, direction.set(1, -0.15, 0).normalize());
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    /** Route-owned support and seat amount are sampled directly, with no lag.
     * Working if support endpoints are exact and intermediate soles step clear.
     */
    applySeat(
      cue: WorkerSeatCue,
      floorOffset = 0,
      gesture?: WorkerGesture,
      drive?: WorkerDriveCue
    ) {
      if (!validWorkerSeatCue(cue)) {
        this.apply(floorOffset, gesture);
        return;
      }
      const support = THREE.MathUtils.clamp(cue.support, 0, 1);
      const amount = THREE.MathUtils.clamp(cue.amount, 0, 1);
      if (support === 0) return;
      capture();
      for (let i = 0; i < sides.length; i++) {
        const thigh = bones.get(`UpperLeg${sides[i]}`),
          calf = bones.get(`LowerLeg${sides[i]}`),
          foot = bones.get(`Foot${sides[i]}`);
        if (!thigh || !calf || !foot) continue;
        chainLengths(thigh, calf, foot, lengths[i === 0 ? 'legL' : 'legR']);
        modelPosition(calf, incomingPoles[i]).sub(modelPosition(thigh, p));
        footMatrix
          .copy(inverse)
          .multiply(foot.matrixWorld)
          .decompose(incomingFeet[i], incomingFootRotation[i], incomingFootScale[i]);
      }
      this.apply(floorOffset, gesture);
      const body = bones.get('Body'),
        hips = bones.get('Hips'),
        abdomen = bones.get('Abdomen');
      if (!body || !hips) return;
      const cosine = Math.cos(cue.yaw),
        sine = Math.sin(cue.yaw);
      deltaRotation.setFromAxisAngle(axis.set(0, 1, 0), cue.yaw);
      for (let i = 0; i < sides.length; i++) {
        const foot = bones.get(`Foot${sides[i]}`);
        if (!foot) continue;
        seatedFeet[i].copy(referenceFeet[i]);
        seatedFeet[i].y += Math.max(0, floorOffset) / scale;
        seatedFootRotation[i].copy(referenceFootRotation[i]);
        seatedFootScale[i].copy(referenceFootScale[i]);
        seatPoint(seatedFeet[i], cue, cosine, sine);
        seatedFootRotation[i].premultiply(deltaRotation);
      }
      modelPosition(hips, seatHips);
      // Rotate the complete target pose through the same authored seat frame.
      to.set(0, 1, 0).transformDirection(model.matrixWorld);
      if (body.parent) to.transformDirection(parentInverse.copy(body.parent.matrixWorld).invert());
      deltaRotation.setFromAxisAngle(to, cue.yaw);
      body.quaternion.premultiply(deltaRotation);
      body.updateWorldMatrix(false, true);
      modelPosition(hips, q);
      target.set(
        seatHips.x,
        THREE.MathUtils.lerp(standingHeight + Math.max(0, floorOffset) / scale, seatHips.y, amount),
        seatHips.z + (0.27 * (1 - amount)) / widthScale
      );
      seatPoint(target, cue, cosine, sine);
      modelPosition(body, p).add(target.sub(q));
      setPosition(body, p);
      if (abdomen && amount < 1)
        aim(
          hips,
          abdomen,
          direction.set(
            sine * Math.sin(amount * Math.PI) * 0.22,
            1,
            cosine * Math.sin(amount * Math.PI) * 0.22
          )
        );
      // Arms leave the lap before departure; only supported leg contacts are IK.
      for (const entry of seatArms) {
        poseQuaternion.copy(entry.bone.quaternion);
        blendWorkerRotation(entry.bone.quaternion, entry.quaternion, poseQuaternion, amount);
      }
      for (const entry of saved) {
        poseQuaternion.copy(entry.bone.quaternion);
        entry.bone.position.lerpVectors(entry.position, entry.bone.position, support);
        blendWorkerRotation(entry.bone.quaternion, entry.quaternion, poseQuaternion, support);
        entry.bone.scale.lerpVectors(entry.scale, entry.bone.scale, support);
      }
      model.updateWorldMatrix(false, true);
      for (let i = 0; i < sides.length; i++) {
        const thigh = bones.get(`UpperLeg${sides[i]}`),
          calf = bones.get(`LowerLeg${sides[i]}`),
          foot = bones.get(`Foot${sides[i]}`);
        if (!thigh || !calf || !foot) continue;
        // Reverse the same stagger on departure. Every moving endpoint lifts.
        const step = THREE.MathUtils.smoothstep(support, i === 0 ? 0 : 0.3, i === 0 ? 0.7 : 1);
        target.lerpVectors(incomingFeet[i], seatedFeet[i], step);
        target.y += (Math.sin(step * Math.PI) * 0.055) / scale;
        blendWorkerRotation(footQuaternion, incomingFootRotation[i], seatedFootRotation[i], step);
        footScale.lerpVectors(incomingFootScale[i], seatedFootScale[i], step);
        let soleOffset = Infinity;
        for (const corner of soleCorners[i])
          soleOffset = Math.min(
            soleOffset,
            p.copy(corner).multiply(footScale).applyQuaternion(footQuaternion).y
          );
        if (support < 1 && Number.isFinite(soleOffset))
          target.y = Math.max(target.y, (Math.max(0, floorOffset) + 0.008) / scale - soleOffset);
        const originalCalf = seatCalves[i];
        if (originalCalf) calf.scale.copy(originalCalf.scale);
        pole.copy(incomingPoles[i]).lerp(direction.set(sine, 0, cosine), support);
        solveChain(thigh, calf, foot, target, lengths[i === 0 ? 'legL' : 'legR'], pole, true);
        footMatrix.compose(target, footQuaternion, footScale);
        footLocal
          .copy(foot.parent!.matrixWorld)
          .invert()
          .multiply(model.matrixWorld)
          .multiply(footMatrix);
        footLocal.decompose(foot.position, foot.quaternion, foot.scale);
        foot.updateWorldMatrix(false, true);
      }
      applied = true;
      model.updateWorldMatrix(false, true);
      if (drive) this.applyDrive(drive);
    },
    apply(floorOffset = 0, gesture?: WorkerGesture) {
      const footHeight =
        (0.03 + Math.max(0, Number.isFinite(floorOffset) ? floorOffset : 0)) / scale;
      capture();
      const body = bones.get('Body');
      const hips = bones.get('Hips');
      if (!body || !hips) return;
      modelPosition(hips, p);
      for (let i = 0; i < sides.length; i++) {
        const calf = bones.get(`LowerLeg${sides[i]}`);
        const foot = bones.get(`Foot${sides[i]}`);
        shinLengths[i] =
          calf && foot ? modelPosition(calf, from).distanceTo(modelPosition(foot, to)) : 0.43;
      }
      modelPosition(hips, p);
      const lift = pelvisHeight - p.y;
      const centre = -p.z;
      modelPosition(body, p);
      p.y += lift;
      p.z += centre;
      setPosition(body, p);
      for (const side of sides) {
        const thigh = bones.get(`UpperLeg${side}`);
        const calf = bones.get(`LowerLeg${side}`);
        const foot = bones.get(`Foot${side}`);
        if (!thigh || !calf || !foot) continue;
        modelPosition(thigh, p);
        modelPosition(calf, q);
        const length = p.distanceTo(q);
        const drop = THREE.MathUtils.clamp(p.y - kneeHeight, 0, length * 0.8);
        aim(thigh, calf, direction.set(0, -drop, Math.sqrt(length * length - drop * drop)));
        aim(calf, undefined, direction.set(0, -1, 0));
        const shinLength = shinLengths[side === 'L' ? 0 : 1];
        calf.scale.y *= (kneeHeight - footHeight) / shinLength;
        calf.updateWorldMatrix(false, true);
        modelPosition(calf, p);
        p.y = footHeight;
        setPosition(foot, p);
      }
      // Breath expands the torso above the fixed pelvis, never the seat or boots.
      // Working if both delivered bodies retain exact hip/foot contact and restore.
      const abdomen = bones.get('Abdomen');
      if (abdomen) abdomen.scale.z *= 1 + ((gesture?.breath ?? 0.5) - 0.5) * 0.012;
      // Forearms rest forward on the lap, rather than a neutral standing arm pose.
      for (const side of sides) {
        const upper = bones.get(`UpperArm${side}`);
        const lower = bones.get(`LowerArm${side}`);
        if (upper && lower) {
          aim(upper, lower, direction.set(side === 'L' ? 0.12 : -0.12, -1, 0.2));
          aim(
            lower,
            undefined,
            direction.set(
              0,
              -0.3 + Math.max(0, (gesture?.restReach ?? 0) * (side === 'L' ? 1 : -1)),
              1
            )
          );
        }
      }
      look(gesture);
      applied = true;
      model.updateWorldMatrix(false, true);
    },
  };
  // Probe only this private rig, before its live mixer owns the frame. No action,
  // clock or per-episode state survives; replay derives the same authored stance.
  const originalPose = saved.map((entry) => ({
    bone: entry.bone,
    position: entry.bone.position.clone(),
    quaternion: entry.bone.quaternion.clone(),
    scale: entry.bone.scale.clone(),
  }));
  try {
    for (const track of referenceClip?.tracks ?? []) {
      const match = /^([^.]+)\.(position|quaternion|scale)(?:\[([xyz])\])?$/.exec(track.name);
      const bone = match && bones.get(match[1]);
      if (!match || !bone || !Array.from(track.values).every(Number.isFinite)) continue;
      const size = track.getValueSize();
      const sample =
        match[2] === 'quaternion' && size === 4
          ? new THREE.QuaternionLinearInterpolant(track.times, track.values, size).evaluate(0)
          : new THREE.LinearInterpolant(track.times, track.values, size).evaluate(0);
      if (match[2] === 'quaternion' && size === 4) bone.quaternion.fromArray(sample).normalize();
      else if (match[2] === 'position' || match[2] === 'scale') {
        const value = bone[match[2]];
        if (match[3] && size === 1) value[match[3] as 'x' | 'y' | 'z'] = sample[0];
        else if (size === 3) value.fromArray(sample);
      }
    }
    model.updateWorldMatrix(true, true);
    inverse.copy(model.matrixWorld).invert();
    if (bones.get('Hips')) standingHeight = modelPosition(bones.get('Hips')!, p).y;
    for (let i = 0; i < sides.length; i++) {
      const thigh = bones.get(`UpperLeg${sides[i]}`),
        calf = bones.get(`LowerLeg${sides[i]}`),
        foot = bones.get(`Foot${sides[i]}`);
      if (thigh && calf && foot) chainLengths(thigh, calf, foot, standingLegLengths[i]);
    }
    controller.apply();
    for (let i = 0; i < sides.length; i++) {
      const foot = bones.get(`Foot${sides[i]}`);
      if (foot)
        footMatrix
          .copy(inverse)
          .multiply(foot.matrixWorld)
          .decompose(referenceFeet[i], referenceFootRotation[i], referenceFootScale[i]);
    }
  } finally {
    controller.restore();
    for (const entry of originalPose) {
      entry.bone.position.copy(entry.position);
      entry.bone.quaternion.copy(entry.quaternion);
      entry.bone.scale.copy(entry.scale);
    }
    model.updateWorldMatrix(false, true);
  }
  return controller;
}
