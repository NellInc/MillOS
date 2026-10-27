import * as THREE from 'three';
import type {
  WorkerBodyType,
  WorkerWorkAction,
  WorkerMotionState,
  WorkerSeatCue,
  ToolType,
} from './workerTypes';

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
import { isWorkerHandheldTool, workerPalmInWrist } from './WorkerTools';

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
        const target = walking ? 0 : (entry.side === 'L' ? left : right) * factor * wave;
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
});
export type WorkerGesture = ReturnType<typeof createWorkerGesture>;

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
  kind: WorkerWorkAction | 'rest' | 'idle' | 'greet' | 'briefing',
  seconds: number,
  out: WorkerGesture
) {
  const t = Number.isFinite(seconds) ? seconds : 0;
  const tempo = t + Math.sin(t * 0.41) * 0.18;
  const cycle = 0.5 - 0.5 * Math.cos((tempo * Math.PI * 2) / (kind === 'garden' ? 3.6 : 6.4));
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
  // Three small gardening strokes, then hands/tool settle together for a dwell.
  const gardenTime = ((t % 11.5) + 11.5) % 11.5;
  const gardenWork =
    THREE.MathUtils.smoothstep(gardenTime, 0, 0.45) *
    (1 - THREE.MathUtils.smoothstep(gardenTime, 7.2, 8.1));
  const settle = kind === 'bake' ? out.breath * 0.006 : 0;
  out.toolY = kind === 'garden' ? cycle * gardenWork * 0.08 : settle;
  out.toolZ = kind === 'garden' ? -cycle * gardenWork * 0.035 : settle * 0.35;
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
          ? 0.12 * gardenWork
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
    modelPosition(body, p);
    p.y += lift;
    setPosition(body, p);
    if (abdomen)
      aim(
        hips,
        abdomen,
        direction.set(
          0,
          task === 'garden' ? THREE.MathUtils.lerp(1, 0.68, gardenWeight) : 1,
          task === 'garden' ? 0.73 * gardenWeight : task === 'pull' ? -0.05 : 0.15
        )
      );
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
        if (task === 'garden')
          target.set(
            (side === 'L' ? 0.12 : -0.12) / widthScale,
            (side === 'L' ? 0.326 : 0.4) / scale,
            (side === 'L' ? 0.5205 : 0.26) / widthScale
          );
        else if (task === 'bake')
          target.set((sign * 0.18) / widthScale, 1.1 / scale, 0.28 / widthScale);
        else
          target.set(
            (sign * 0.32) / widthScale,
            1.05 / scale,
            (task === 'push' ? 0.2 : -0.2) / widthScale
          );
        if (gesture && (task === 'bake' || (task === 'garden' && side === 'L'))) {
          target.y += gesture.toolY / scale;
          target.z += gesture.toolZ / widthScale;
        }
        // Grip denotes the centre of the palm, not the wrist joint above it.
        target.y += palmLengths[index];
        if (task === 'garden' && gardenWeight < 1) {
          target.lerp(restingWrist, 1 - gardenWeight);
          modelPosition(upper, p);
          direction.copy(target).sub(p);
          const armLengths = lengths[side === 'L' ? 'armL' : 'armR'];
          const reach = armLengths[0] + armLengths[1] - 0.004;
          // Intermediate reaches carry no tool. Keep them anatomically reachable
          // rather than stretching a forearm to a linear blend of two endpoints.
          if (direction.length() > reach)
            target.copy(p).addScaledVector(direction.normalize(), reach);
        }
        solveChain(
          upper,
          lower,
          wrist,
          target,
          lengths[side === 'L' ? 'armL' : 'armR'],
          pole.set(sign, -0.2, 0),
          false
        );
        aim(wrist, undefined, direction.set(0, -1, 0));
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
  const controller = {
    applyTask,
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
      if (supportedPalm && (action === 'inspect' || action === 'supervise' || action === 'sample'))
        supportHandheld(gesture);
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
    /** Route-owned support and seat amount are sampled directly, with no lag.
     * Working if support endpoints are exact and intermediate soles step clear.
     */
    applySeat(cue: WorkerSeatCue, floorOffset = 0, gesture?: WorkerGesture) {
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
