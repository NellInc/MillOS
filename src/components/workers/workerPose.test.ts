// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORKER_EYE_CENTRES } from './SharedWorkerGeometries';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {
  createSeatedWorkerPose,
  createWorkerGesture,
  sampleWorkerGesture,
  createWorkerEyeBlink,
  sampleWorkerBlink,
} from './workerPose';
import { COMMUNITY_ANCHORS } from '../../constants/communityLayout';
import { getWorkerAppearance } from './workerTypes';
import { dressWorkerHands, softenWorkerFaceNormals } from '../models/WorkerModel';

const bodies = new Map<string, GLTF>();
beforeAll(async () => {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  for (const body of ['masculine', 'feminine']) {
    const document = await io.readBinary(
      new Uint8Array(readFileSync(`public/models/worker/worker-${body}.glb`))
    );
    for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
    const bytes = await io.writeBinary(document);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, '');
    bodies.set(body, gltf);
  }
});

describe('authored worker assets and actual seated deformation', () => {
  for (const body of ['masculine', 'feminine']) {
    it(`${body} has all semantic clips and grounded skin`, () => {
      const gltf = bodies.get(body)!;
      expect(gltf.animations.map((clip) => clip.name)).toEqual(
        expect.arrayContaining([
          'worker-idle',
          'worker-walk',
          'worker-run',
          'worker-break',
          'worker-inspect',
          'worker-repair',
          'worker-supervise',
          'worker-radio',
          'worker-sample',
        ])
      );
      const scene = clone(gltf.scene);
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene, true);
      expect(Math.abs(box.min.y)).toBeLessThan(0.01);
      expect(box.max.y).toBeGreaterThan(1.6);
      let triangles = 0;
      let meshes = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      });
      expect(meshes).toBe(body === 'masculine' ? 13 : 12);
      expect(triangles).toBe(body === 'masculine' ? 5240 : 6112);
    });
    for (const height of [0.95, 1.08]) {
      it(`${body} seats at .46 m for height ${height}, restores exact standing pose`, () => {
        const gltf = bodies.get(body)!;
        const scene = clone(gltf.scene);
        const wrapper = new THREE.Group();
        wrapper.scale.set(1, height, 1);
        wrapper.add(scene);
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(gltf.animations.find((clip) => clip.name === 'worker-break')!).play();
        mixer.update(0);
        wrapper.updateMatrixWorld(true);
        const bodyBone = scene.getObjectByName('Body')!;
        const before = bodyBone.position.clone();
        const pose = createSeatedWorkerPose(scene, height);
        pose.apply();
        const pos = (name: string) =>
          scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        expect(pos('Hips').y).toBeCloseTo(0.55, 4);
        expect(pos('Hips').z).toBeCloseTo(0, 4);
        for (const side of ['L', 'R']) {
          expect(pos(`LowerLeg${side}`).z - pos(`UpperLeg${side}`).z).toBeGreaterThan(0.3);
          expect(pos(`LowerLeg${side}`).y).toBeCloseTo(0.46, 3);
          expect(pos(`Foot${side}`).y).toBeCloseTo(0.03, 4);
          expect(pos(`Wrist${side}`).z).toBeGreaterThan(pos(`LowerArm${side}`).z);
        }
        scene.traverse((object) => {
          if ((object as THREE.SkinnedMesh).isSkinnedMesh)
            (object as THREE.SkinnedMesh).skeleton.update();
        });
        const box = new THREE.Box3().setFromObject(scene, true);
        expect(box.min.y).toBeGreaterThanOrEqual(0);
        expect(box.min.y).toBeLessThan(0.012);
        expect(box.max.y).toBeLessThan(1.6);
        pose.restore();
        for (let frame = 0; frame < 20; frame++) {
          pose.apply();
          expect(pos('Hips').y).toBeCloseTo(0.55, 4);
          pose.restore();
        }
        expect(bodyBone.position.toArray()).toEqual(before.toArray());
      });
    }
  }
});

it('anonymous profiles are deterministic, varied and role appropriate', () => {
  expect(getWorkerAppearance('Engineer', '#345678', 'crew-engineer')).toEqual(
    getWorkerAppearance('Engineer', '#345678', 'crew-engineer')
  );
  expect(getWorkerAppearance('Quality', '', 'q').tool).toBe('sample-kit');
  expect(getWorkerAppearance('Gardener', '', 'g').tool).toBe('trowel');
  expect(getWorkerAppearance('Baker', '', 'b').tool).toBe('bread-tray');
  for (const role of ['Baker', 'Gardener', 'Shopkeeper', 'Resident', 'Passenger', 'Cyclist']) {
    const appearance = getWorkerAppearance(role, '#345678', role);
    expect(appearance.hasHardHat).toBe(false);
    expect(appearance.hasVest).toBe(false);
    expect(appearance.heightScale).toBeGreaterThanOrEqual(0.95);
    expect(appearance.heightScale).toBeLessThanOrEqual(1.08);
  }
});

describe('cycling feet, saddle and handlebar anchors on actual authored rigs', () => {
  for (const body of ['masculine', 'feminine'])
    for (const height of [0.95, 1.08]) {
      it(`${body} reaches the saddle, pedals and bars at height ${height}`, () => {
        const gltf = bodies.get(body)!;
        const scene = clone(gltf.scene);
        const wrapper = new THREE.Group();
        const width = height === 0.95 ? 0.96 : 1.06;
        wrapper.scale.set(width, height, width);
        wrapper.add(scene);
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(gltf.animations.find((clip) => clip.name === 'worker-break')!).play();
        mixer.update(0);
        wrapper.updateMatrixWorld(true);
        const originalBody = scene.getObjectByName('Body')!.position.clone();
        const pose = createSeatedWorkerPose(scene, height, width);
        const pos = (name: string) =>
          scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        let maxArmScale = 0,
          maxLegScale = 0,
          minY = Infinity,
          maxY = -Infinity,
          minSoleGap = Infinity,
          maxSoleGap = -Infinity;
        for (let frame = 0; frame < 16; frame++) {
          const phase = (frame / 16) * Math.PI * 2;
          pose.applyCycling(phase);
          expect(pos('Hips').y).toBeCloseTo(0.95, 4);
          expect(pos('Hips').z).toBeCloseTo(-0.1, 4);
          for (const side of ['L', 'R']) {
            const sign = side === 'L' ? 1 : -1;
            const foot = pos(`Foot${side}`);
            expect(foot.x).toBeCloseTo(sign * 0.16, 4);
            expect(foot.y).toBeCloseTo(0.412 + sign * 0.15 * Math.cos(phase), 4);
            expect(foot.z).toBeCloseTo(0.04 + sign * 0.15 * Math.sin(phase), 4);
            const wrist = pos(`Wrist${side}`);
            expect(wrist.x).toBeCloseTo(sign * 0.23, 3);
            expect(wrist.y).toBeCloseTo(1.08, 3);
            expect(wrist.z).toBeCloseTo(0.57, 3);
            expect(pos(`LowerLeg${side}`).z).toBeGreaterThan(-0.05);
            maxArmScale = Math.max(maxArmScale, scene.getObjectByName(`LowerArm${side}`)!.scale.y);
            maxLegScale = Math.max(maxLegScale, scene.getObjectByName(`LowerLeg${side}`)!.scale.y);
            expect(scene.getObjectByName(`LowerArm${side}`)!.scale.y).toBeLessThan(1.01);
            expect(scene.getObjectByName(`LowerLeg${side}`)!.scale.y).toBeLessThan(1.01);
          }
          scene.traverse((object) => {
            if ((object as THREE.SkinnedMesh).isSkinnedMesh)
              (object as THREE.SkinnedMesh).skeleton.update();
          });
          const soles = [Infinity, Infinity];
          const vertex = new THREE.Vector3();
          scene.traverse((object) => {
            const mesh = object as THREE.SkinnedMesh;
            if (!mesh.isSkinnedMesh || !mesh.parent?.name.includes('Worker_Feet')) return;
            for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
              mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
              const side = vertex.x > 0 ? 0 : 1;
              soles[side] = Math.min(soles[side], vertex.y);
            }
          });
          for (let side = 0; side < 2; side++) {
            const sign = side === 0 ? 1 : -1;
            const treadTop = 0.36 + sign * 0.15 * Math.cos(phase) + 0.0245;
            const gap = soles[side] - treadTop;
            minSoleGap = Math.min(minSoleGap, gap);
            maxSoleGap = Math.max(maxSoleGap, gap);
            expect(gap, `sole contact ${body}/${height}/${phase}/${side}`).toBeGreaterThanOrEqual(
              0
            );
            expect(gap, `sole floats ${body}/${height}/${phase}/${side}`).toBeLessThan(0.007);
          }
          const box = new THREE.Box3().setFromObject(scene, true);
          minY = Math.min(minY, box.min.y);
          maxY = Math.max(maxY, box.max.y);
          expect(box.min.y).toBeGreaterThan(0.1);
          expect(box.max.y).toBeLessThan(1.95);
          pose.restore();
          expect(scene.getObjectByName('Body')!.position.toArray()).toEqual(originalBody.toArray());
        }
        if (process.env.MILLOS_POSE_MEASURE === '1')
          process.stdout.write(
            JSON.stringify({
              body,
              height,
              width,
              maxArmScale,
              maxLegScale,
              minY,
              maxY,
              minSoleGap,
              maxSoleGap,
            }) + '\n'
          );
      });
    }
});

describe('task hand contacts and platform seating', () => {
  for (const body of ['masculine', 'feminine'])
    for (const height of [0.95, 1.08]) {
      for (const task of ['push', 'pull', 'bake', 'garden'] as const)
        it(`${body}/${height} ${task} has real hand contacts`, () => {
          const gltf = bodies.get(body)!;
          const scene = clone(gltf.scene);
          const wrapper = new THREE.Group();
          const width = height === 0.95 ? 0.96 : 1.06;
          wrapper.scale.set(width, height, width);
          wrapper.add(scene);
          const mixer = new THREE.AnimationMixer(scene);
          mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-break')!).play();
          mixer.update(0);
          wrapper.updateMatrixWorld(true);
          const pose = createSeatedWorkerPose(scene, height, width);
          const standingPelvis = scene
            .getObjectByName('Hips')!
            .getWorldPosition(new THREE.Vector3()).y;
          pose.applyTask(task);
          if (task !== 'garden')
            expect(
              scene.getObjectByName('Hips')!.getWorldPosition(new THREE.Vector3()).y
            ).toBeCloseTo(standingPelvis, 4);
          const pos = (name: string) =>
            scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
          for (const side of ['L', 'R']) {
            const sign = side === 'L' ? 1 : -1;
            const palm = pos(`Middle1${side}`).lerp(pos(`Middle2${side}`), 0.5);
            const expected =
              task === 'garden'
                ? new THREE.Vector3(
                    side === 'L' ? 0.12 : -0.12,
                    side === 'L' ? 0.326 : 0.4,
                    side === 'L' ? 0.5205 : 0.26
                  )
                : task === 'bake'
                  ? new THREE.Vector3(sign * 0.18, 1.1, 0.28)
                  : new THREE.Vector3(sign * 0.32, 1.05, task === 'push' ? 0.2 : -0.2);
            expect(palm.distanceTo(expected), `${side} palm ${palm.toArray()}`).toBeLessThan(0.012);
            expect(
              scene.getObjectByName(`LowerArm${side}`)!.scale.y,
              `${side} arm stretch`
            ).toBeLessThan(1.05);
            expect(
              scene.getObjectByName(`LowerLeg${side}`)!.scale.y,
              `${side} leg stretch`
            ).toBeLessThan(1.05);
          }
          scene.traverse((o) => {
            if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
          });
          const box = new THREE.Box3().setFromObject(scene, true);
          expect(box.min.y).toBeGreaterThan(-0.015);
          if (task === 'garden') {
            expect(box.max.y).toBeLessThan(1.15);
            // Vegetable heads top out at .64m; keep the gardener's face above them.
            expect(pos('Head').y).toBeGreaterThan(0.72);
            // The raised bed's near timber face is world z=10.395, top y=.25.
            // Working if low trouser/boot vertices stay on the path side of it.
            const vertex = new THREE.Vector3();
            let furthestLowVertex = -Infinity;
            scene.traverse((object) => {
              const mesh = object as THREE.SkinnedMesh;
              if (!mesh.isSkinnedMesh || !/Worker_(?:Feet|Legs)/.test(mesh.parent?.name ?? ''))
                return;
              for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
                if (vertex.y < 0.255) furthestLowVertex = Math.max(furthestLowVertex, vertex.z);
              }
            });
            expect(
              furthestLowVertex + COMMUNITY_ANCHORS.allotmentGardener.position[2]
            ).toBeLessThan(10.395);
          }
          pose.restore();
        });
      it(`${body}/${height} bus soles clear the .11m floor without moving the seat`, () => {
        const gltf = bodies.get(body)!;
        const scene = clone(gltf.scene);
        const wrapper = new THREE.Group();
        wrapper.scale.set(1, height, 1);
        wrapper.position.y = 0.062;
        wrapper.add(scene);
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-break')!).play();
        mixer.update(0);
        wrapper.updateMatrixWorld(true);
        const pose = createSeatedWorkerPose(scene, height);
        pose.apply(0.048);
        scene.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
        });
        const box = new THREE.Box3().setFromObject(scene, true);
        expect(scene.getObjectByName('Hips')!.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
          0.612,
          4
        );
        expect(box.min.y).toBeGreaterThan(0.11);
        expect(box.min.y).toBeLessThan(0.124);
      });
    }
});

it('cart grips preserve both authored walking foot trajectories', () => {
  for (const body of ['masculine', 'feminine'])
    for (const task of ['push', 'pull'] as const) {
      const gltf = bodies.get(body)!;
      const scene = clone(gltf.scene);
      const mixer = new THREE.AnimationMixer(scene);
      const clip = gltf.animations.find((c) => c.name === 'worker-walk')!;
      mixer.clipAction(clip).play();
      const pose = createSeatedWorkerPose(scene);
      for (let frame = 0; frame < 8; frame++) {
        mixer.setTime((clip.duration * frame) / 8);
        scene.updateMatrixWorld(true);
        const before = ['L', 'R'].map((side) =>
          scene.getObjectByName(`Foot${side}`)!.getWorldPosition(new THREE.Vector3())
        );
        pose.applyTask(task);
        for (let side = 0; side < 2; side++) {
          const suffix = side === 0 ? 'L' : 'R';
          expect(
            scene
              .getObjectByName(`Foot${suffix}`)!
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(before[side])
          ).toBeLessThan(0.0001);
          expect(scene.getObjectByName(`LowerArm${suffix}`)!.scale.y).toBeLessThan(1.05);
          expect(scene.getObjectByName(`LowerLeg${suffix}`)!.scale.y).toBeLessThan(1.05);
        }
        pose.restore();
      }
    }
});

describe('living gestures on actual authored bodies', () => {
  for (const body of ['masculine', 'feminine']) {
    for (const height of [0.95, 1.08]) {
      for (const task of ['bake', 'garden'] as const) {
        it(`${body}/${height} ${task} keeps animated palms on the prop and boots planted`, () => {
          const gltf = bodies.get(body)!;
          const scene = clone(gltf.scene);
          const wrapper = new THREE.Group();
          const width = height === 0.95 ? 0.96 : 1.06;
          wrapper.scale.set(width, height, width);
          wrapper.add(scene);
          const mixer = new THREE.AnimationMixer(scene);
          mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-break')!).play();
          mixer.update(0);
          const pose = createSeatedWorkerPose(scene, height, width);
          const gesture = createWorkerGesture();
          const pos = (name: string) =>
            scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
          let firstFeet: THREE.Vector3[] = [];
          let minimum = Infinity,
            maximum = -Infinity;
          for (let frame = 0; frame < 32; frame++) {
            sampleWorkerGesture(task, frame * 0.25, gesture);
            pose.applyTask(task, gesture);
            if (!frame) firstFeet = [pos('FootL'), pos('FootR')];
            for (const [index, side] of ['L', 'R'].entries()) {
              const sign = side === 'L' ? 1 : -1;
              const palm = pos(`Middle1${side}`).lerp(pos(`Middle2${side}`), 0.5);
              const target =
                task === 'bake'
                  ? new THREE.Vector3(sign * 0.18, 1.1 + gesture.toolY, 0.28 + gesture.toolZ)
                  : side === 'L'
                    ? new THREE.Vector3(0.12, 0.326 + gesture.toolY, 0.5205 + gesture.toolZ)
                    : new THREE.Vector3(-0.12, 0.4, 0.26);
              expect(palm.distanceTo(target)).toBeLessThan(0.012);
              expect(pos(`Foot${side}`).distanceTo(firstFeet[index])).toBeLessThan(0.0001);
              expect(scene.getObjectByName(`LowerArm${side}`)!.scale.y).toBeLessThan(1.05);
              if (side === 'L') {
                minimum = Math.min(minimum, palm.y);
                maximum = Math.max(maximum, palm.y);
              }
            }
            pose.restore();
            mixer.update(0.25);
          }
          expect(maximum - minimum).toBeGreaterThan(task === 'garden' ? 0.07 : 0.005);
        });
      }
    }
    for (const action of [
      'operate',
      'inspect',
      'repair',
      'sample',
      'supervise',
      'rest',
      'idle',
    ] as const) {
      it(`${body} ${action} moves without accumulating or sliding over 1000 frames`, () => {
        const gltf = bodies.get(body)!;
        const scene = clone(gltf.scene);
        const mixer = new THREE.AnimationMixer(scene);
        const clip =
          action === 'operate'
            ? 'inspect'
            : action === 'rest' || action === 'idle'
              ? 'break'
              : action;
        mixer.clipAction(gltf.animations.find((c) => c.name === `worker-${clip}`)!).play();
        mixer.update(0);
        const pose = createSeatedWorkerPose(scene);
        const gesture = createWorkerGesture();
        const names = ['Hips', 'Abdomen', 'Head', 'FootL', 'FootR', 'LowerArmL', 'LowerArmR'];
        const pos = (name: string) =>
          scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        const head = scene.getObjectByName('Head')!;
        let maxAngle = 0,
          maxHandTravel = 0;
        const neutral = createWorkerGesture();
        for (let frame = 0; frame < 1000; frame++) {
          const baseline = names.map((n) => scene.getObjectByName(n)!.quaternion.clone());
          if (action === 'rest') pose.apply(0.048, neutral);
          const feet = [pos('FootL'), pos('FootR')];
          const hand = pos('WristL');
          pose.restore();
          sampleWorkerGesture(action === 'rest' ? 'rest' : 'idle', frame / 60, gesture);
          if (action === 'rest') pose.apply(0.048, gesture);
          else if (action === 'idle') pose.applyIdle(gesture);
          else pose.applyWork(action, gesture);
          expect(pos('FootL').distanceTo(feet[0])).toBeLessThan(0.0001);
          expect(pos('FootR').distanceTo(feet[1])).toBeLessThan(0.0001);
          maxHandTravel = Math.max(maxHandTravel, pos('WristL').distanceTo(hand));
          maxAngle = Math.max(maxAngle, head.quaternion.angleTo(baseline[2]));
          expect(head.quaternion.angleTo(baseline[2])).toBeLessThan(0.23);
          pose.restore();
          for (let i = 0; i < names.length; i++)
            expect(scene.getObjectByName(names[i])!.quaternion.toArray()).toEqual(
              baseline[i].toArray()
            );
          mixer.update(1 / 60);
        }
        expect(maxAngle).toBeGreaterThan(0.2);
        if (action !== 'idle') expect(maxHandTravel).toBeGreaterThan(0.005);
      });
    }
  }
  it('samples finite, staggered, bounded gestures without allocating replacement objects', () => {
    const out = createWorkerGesture();
    for (const kind of ['bake', 'garden', 'rest', 'idle'] as const) {
      for (const time of [NaN, Infinity, -3, 0, 1, 2, 10, 1e6]) {
        expect(sampleWorkerGesture(kind, time, out)).toBe(out);
        expect(Object.values(out).every(Number.isFinite)).toBe(true);
        expect(out.toolY).toBeGreaterThanOrEqual(0);
        expect(out.toolY).toBeLessThanOrEqual(0.08);
        expect(Math.abs(out.lookYaw)).toBeLessThanOrEqual(0.22);
      }
    }
    const a = { ...sampleWorkerGesture('garden', 1, out) };
    const b = { ...sampleWorkerGesture('garden', 2.731, out) };
    expect(a).not.toEqual(b);
    expect(sampleWorkerGesture('garden', 1, out)).toEqual(a);
  });
});

it('places facial details on actual deformed eye fronts through both authored head rigs', () => {
  for (const body of ['masculine', 'feminine'] as const) {
    const gltf = bodies.get(body)!;
    const scene = clone(gltf.scene),
      mixer = new THREE.AnimationMixer(scene);
    const action = mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-idle')!);
    action.play();
    for (const time of [0, 0.4, 1.2]) {
      mixer.setTime(time);
      scene.updateMatrixWorld(true);
      const head = scene.getObjectByName('Head')!,
        inverse = head.matrixWorld.clone().invert(),
        box = new THREE.Box3();
      scene.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (
          !mesh.isSkinnedMesh ||
          (mesh.material as THREE.Material).name !== (body === 'masculine' ? 'Eye' : 'Brown')
        )
          return;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++)
          box.expandByPoint(
            mesh
              .getVertexPosition(i, new THREE.Vector3())
              .applyMatrix4(mesh.matrixWorld)
              .applyMatrix4(inverse)
          );
      });
      const [x, y, z] = WORKER_EYE_CENTRES[body];
      expect(Math.abs(x - (box.min.x + box.max.x) / 2)).toBeLessThan(0.002);
      expect(y).toBeGreaterThan(box.min.y + 0.005);
      expect(y).toBeLessThan(box.max.y - 0.005);
      expect(z).toBeGreaterThan((box.min.z + box.max.z) / 2 + 0.006);
      expect(z).toBeLessThan(box.max.z + 0.004);
    }
  }
});

it.each(['masculine', 'feminine'])(
  '%s greets with a free hand without stretching or moving its held hand and feet',
  (body) => {
    const gltf = bodies.get(body)!;
    const scene = clone(gltf.scene);
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-idle')!).play();
    mixer.update(0);
    const pose = createSeatedWorkerPose(scene);
    const gesture = createWorkerGesture();
    const position = (name: string) =>
      scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
    let min = Infinity,
      max = -Infinity;
    for (let frame = 0; frame < 240; frame++) {
      const t = frame / 20;
      sampleWorkerGesture('idle', t, gesture);
      pose.applyIdle(gesture);
      const fixed = ['WristL', 'FootL', 'FootR'].map(position);
      pose.restore();
      sampleWorkerGesture('greet', t, gesture);
      pose.applyIdle(gesture);
      ['WristL', 'FootL', 'FootR'].forEach((name, index) => {
        expect(position(name).distanceTo(fixed[index])).toBeLessThan(0.000001);
      });
      expect(scene.getObjectByName('LowerArmR')!.scale.y).toBeLessThan(1.05);
      const y = position('WristR').y;
      min = Math.min(min, y);
      max = Math.max(max, y);
      pose.restore();
      expect(scene.getObjectByName('LowerArmR')!.scale.y).toBeCloseTo(1, 6);
    }
    expect(max - min).toBeGreaterThan(0.25);
  }
);

it('greeting has a quiet dwell and resets fully when another activity takes over', () => {
  const gesture = createWorkerGesture();
  expect(sampleWorkerGesture('greet', 1, gesture).greetingLift).toBe(1);
  for (const t of [0, 2.1, 4, 8.99, 9])
    expect(sampleWorkerGesture('greet', t, gesture).greetingLift).toBe(0);
  for (const t of [9.2, 18.2, 27.2, 100])
    expect(sampleWorkerGesture('greet', t, gesture).greetingLift).toBe(0);
  for (const activity of ['bake', 'garden', 'rest', 'idle'] as const) {
    sampleWorkerGesture(activity, 1, gesture);
    expect(gesture.greetingLift).toBe(0);
    expect(gesture.greetingWave).toBe(0);
  }
});

describe('declared gloves on the original skinned hands', () => {
  for (const body of ['masculine', 'feminine']) {
    it(`${body} retains every original triangle and deformation with smooth cuff colour`, () => {
      const scene = clone(bodies.get(body)!.scene);
      let source: THREE.SkinnedMesh | undefined;
      scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (
          m.isSkinnedMesh &&
          m.parent?.name.includes('Worker_Body') &&
          !Array.isArray(m.material) &&
          m.material.name === 'Skin'
        )
          source = m;
      });
      expect(source).toBeDefined();
      const original = source!.geometry,
        skin = new THREE.Color('#b77d60'),
        glove = new THREE.Color('#435365');
      const dressed = dressWorkerHands(original, source!.skeleton, skin, glove)!;
      expect(dressed).not.toBeNull();
      expect(Array.from(dressed.index!.array)).toEqual(Array.from(original.index!.array));
      for (const name of Object.keys(original.attributes)) {
        expect(Array.from(dressed.getAttribute(name).array)).toEqual(
          Array.from(original.getAttribute(name).array)
        );
        expect(dressed.getAttribute(name)).not.toBe(original.getAttribute(name));
      }
      expect(original.hasAttribute('color')).toBe(false);
      const colours = dressed.getAttribute('color'),
        tint = new THREE.Color(glove.r / skin.r, glove.g / skin.g, glove.b / skin.b);
      let bare = 0,
        full = 0,
        blended = 0;
      for (let i = 0; i < colours.count; i++) {
        const c = colours.getX(i);
        if (Math.abs(c - 1) < 1e-6) bare++;
        else if (Math.abs(c - tint.r) < 1e-6) full++;
        else blended++;
        for (let j = 0; j < 3; j++) expect(Number.isFinite(colours.getComponent(i, j))).toBe(true);
      }
      expect(bare).toBeGreaterThan(200);
      expect(full).toBeGreaterThan(500);
      expect(blended).toBeGreaterThan(20);
      const hand = new THREE.SkinnedMesh(dressed, new THREE.MeshStandardMaterial());
      hand.bindMode = source!.bindMode;
      hand.bind(source!.skeleton, source!.bindMatrix);
      hand.bindMatrixInverse.copy(source!.bindMatrixInverse);
      source!.parent!.add(hand);
      const mixer = new THREE.AnimationMixer(scene);
      mixer
        .clipAction(bodies.get(body)!.animations.find((c) => c.name === 'worker-repair')!)
        .play();
      const actual = new THREE.Vector3(),
        expected = new THREE.Vector3();
      for (const dt of [0, 0.2, 0.4]) {
        mixer.update(dt);
        scene.updateMatrixWorld(true);
        source!.skeleton.update();
        for (let i = 0; i < dressed.index!.count; i += 19) {
          const vertex = dressed.index!.getX(i);
          expect(
            hand
              .getVertexPosition(vertex, actual)
              .distanceTo(source!.getVertexPosition(vertex, expected))
          ).toBeLessThan(1e-9);
        }
      }
      dressed.dispose();
      (hand.material as THREE.Material).dispose();
    });
  }
  it('leaves unknown or unskinned exports complete rather than guessing', () => {
    expect(
      dressWorkerHands(
        new THREE.BoxGeometry(),
        new THREE.Skeleton(),
        new THREE.Color('#b77d60'),
        new THREE.Color('#435365')
      )
    ).toBeNull();
  });
});

describe('subtle walking glances on the actual rigs', () => {
  for (const body of ['masculine', 'feminine']) {
    it(`${body} glances without touching stride/boots/palms and restores the incoming pose`, () => {
      const gltf = bodies.get(body)!,
        scene = clone(gltf.scene),
        mixer = new THREE.AnimationMixer(scene);
      const action = mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-walk')!);
      action.play();
      const pose = createSeatedWorkerPose(scene, 1),
        gesture = createWorkerGesture(),
        head = scene.getObjectByName('Head')!;
      let glances = 0;
      for (let frame = 0; frame < 240; frame++) {
        pose.restore();
        mixer.update(1 / 30);
        scene.updateMatrixWorld(true);
        const before = head.quaternion.clone();
        const contacts = ['FootL', 'FootR', 'WristL', 'WristR'].map((n) =>
          scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
        );
        sampleWorkerGesture('idle', frame / 30, gesture);
        pose.applyWalkingLook(gesture);
        if (head.quaternion.angleTo(before) > 0.01) glances++;
        ['FootL', 'FootR', 'WristL', 'WristR'].forEach((n, i) =>
          expect(
            scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).distanceTo(contacts[i])
          ).toBeLessThan(1e-9)
        );
        expect(head.quaternion.angleTo(before)).toBeLessThan(0.09);
        pose.restore();
        expect(head.quaternion.angleTo(before)).toBeLessThan(1e-7);
      }
      expect(glances).toBeGreaterThan(50);
    });
  }
});

describe('actual private eye closure and task attention', () => {
  for (const body of ['masculine', 'feminine'] as const) {
    it(`${body} closes the actual eye surface, restores exact vertices and preserves cached eyes`, () => {
      const original = bodies.get(body)!;
      const scene = clone(original.scene);
      const neighbour = clone(original.scene);
      const eyes: THREE.SkinnedMesh[] = [];
      scene.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (
          mesh.isSkinnedMesh &&
          mesh.parent?.name.includes('Worker_Head') &&
          !Array.isArray(mesh.material) &&
          mesh.material.name === (body === 'masculine' ? 'Eye' : 'Brown')
        )
          eyes.push(mesh);
      });
      expect(eyes).toHaveLength(1);
      const eye = eyes[0];
      const source = eye.geometry;
      const borrowedArray = Array.from(source.attributes.position.array);
      const borrowedPositions = Array.from({ length: source.attributes.position.count }, (_, i) => [
        source.attributes.position.getX(i),
        source.attributes.position.getY(i),
        source.attributes.position.getZ(i),
      ]).flat();
      // The renderer renames its private surface materials before preparing eyes.
      eye.material = (eye.material as THREE.Material).clone();
      eye.material.name += `-${body}`;
      const blink = createWorkerEyeBlink(scene, body);
      expect(eye.geometry).not.toBe(source);
      expect(eye.geometry.attributes.position.count).toBe(48);
      const position = new THREE.Vector3();
      const intoHead = scene.getObjectByName('Head')!.matrixWorld.clone().invert();
      const bounds = () => {
        const bounds = new THREE.Box3();
        scene.updateMatrixWorld(true);
        eye.skeleton.update();
        for (let i = 0; i < 48; i++) {
          eye.getVertexPosition(i, position);
          position.applyMatrix4(eye.matrixWorld).applyMatrix4(intoHead);
          bounds.expandByPoint(position);
        }
        return bounds;
      };
      const openBounds = bounds();
      const openHeight = openBounds.max.y - openBounds.min.y;
      blink.apply(1);
      const closedBounds = bounds();
      expect((closedBounds.max.y - closedBounds.min.y) / openHeight).toBeCloseTo(0.08, 4);
      const centre = WORKER_EYE_CENTRES[body][1];
      const openCentre = (openBounds.max.y + openBounds.min.y) / 2;
      expect((closedBounds.max.y + closedBounds.min.y) / 2).toBeCloseTo(
        centre + (openCentre - centre) * 0.08,
        5
      );
      for (const axis of ['x', 'z'] as const) {
        expect(closedBounds.min[axis]).toBeCloseTo(openBounds.min[axis], 5);
        expect(closedBounds.max[axis]).toBeCloseTo(openBounds.max[axis], 5);
      }
      const closed = Array.from(eye.geometry.attributes.position.array);
      blink.apply(1);
      expect(Array.from(eye.geometry.attributes.position.array)).toEqual(closed);
      blink.apply(0);
      expect(Array.from(eye.geometry.attributes.position.array)).toEqual(borrowedPositions);
      expect(Array.from(source.attributes.position.array)).toEqual(borrowedArray);
      let neighbourEye: THREE.Mesh | undefined;
      neighbour.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry === source)
          neighbourEye = o as THREE.Mesh;
      });
      expect(neighbourEye?.geometry).toBe(source);
      blink.dispose();
      expect(eye.geometry).toBe(source);
      (eye.material as THREE.Material).dispose();
    });
  }
  it('leaves long open-eye dwells and bounded staggered closures', () => {
    let closed = 0;
    for (let frame = 0; frame < 1730; frame++) {
      const value = sampleWorkerBlink(frame / 100);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      if (value > 0) closed++;
    }
    expect(closed).toBeGreaterThan(50);
    expect(closed).toBeLessThan(80);
    expect(sampleWorkerBlink(1.755)).toBe(1);
    expect(sampleWorkerBlink(0)).toBe(0);
    expect(sampleWorkerBlink(Number.NaN)).toBe(0);
    expect(sampleWorkerBlink(1.755 + 1.731)).toBe(0);
  });
  it('looks toward held work and pauses gardening without decoupling the tool offsets', () => {
    const gesture = createWorkerGesture();
    for (const kind of ['inspect', 'sample', 'repair', 'operate', 'supervise', 'bake'] as const) {
      sampleWorkerGesture(kind, 0, gesture);
      expect(gesture.lookPitch).toBeGreaterThan(0.04);
    }
    sampleWorkerGesture('idle', 0, gesture);
    expect(gesture.lookPitch).toBe(0);
    sampleWorkerGesture('garden', 9, gesture);
    expect(gesture.toolY).toBe(0);
    expect(gesture.toolZ).toBeCloseTo(0, 8);
    sampleWorkerGesture('garden', 2, gesture);
    expect(gesture.toolY).toBeGreaterThan(0.01);
    expect(gesture.toolZ / gesture.toolY).toBeCloseTo(-0.035 / 0.08, 8);
    sampleWorkerGesture('bake', 3, gesture);
    expect(Math.abs(gesture.toolY)).toBeLessThanOrEqual(0.006);
    expect(Math.abs(gesture.toolZ)).toBeLessThanOrEqual(0.0021);
    const civilians = [
      'village-gardener',
      'village-shopkeeper',
      'village-neighbour',
      'village-cyclist',
      'bus-arriving',
      'bus-departing',
    ];
    expect(
      new Set(civilians.map((id) => getWorkerAppearance('Resident', '', id).pantsColor)).size
    ).toBeGreaterThan(2);
    expect(getWorkerAppearance('Operator', '', 'w3').pantsColor).toBe('#1e3a5f');
  });
});

it.each(['masculine', 'feminine'])(
  '%s soft face finish preserves real topology and skin deformation',
  (body) => {
    const scene = clone(bodies.get(body)!.scene);
    let mesh: THREE.SkinnedMesh | undefined;
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (
        m.isSkinnedMesh &&
        m.parent?.name.includes('Worker_Head') &&
        !Array.isArray(m.material) &&
        m.material.name === 'Skin'
      )
        mesh = m;
    });
    const source = mesh!.geometry,
      normal = source.getAttribute('normal');
    const finished = softenWorkerFaceNormals(source)!;
    expect(finished).not.toBe(source);
    expect(finished.index!.array).toEqual(source.index!.array);
    for (const name of Object.keys(source.attributes).filter((name) => name !== 'normal'))
      expect(finished.getAttribute(name).array).toEqual(source.getAttribute(name).array);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    let changed = 0;
    for (let i = 0; i < normal.count; i++) {
      a.fromBufferAttribute(normal, i).normalize();
      b.fromBufferAttribute(finished.getAttribute('normal'), i);
      expect(b.length()).toBeCloseTo(1, 5);
      expect(a.angleTo(b)).toBeLessThan(Math.PI / 4);
      if (a.distanceTo(b) > 0.001) changed++;
    }
    expect(changed).toBeGreaterThan(20);
    const before = normal.array.slice();
    mesh!.geometry = finished;
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(bodies.get(body)!.animations.find((c) => c.name === 'worker-inspect')!).play();
    for (let frame = 0; frame < 20; frame++) {
      mixer.update(0.05);
      scene.updateMatrixWorld(true);
      for (let i = 0; i < source.getAttribute('position').count; i++) {
        mesh!.geometry = source;
        mesh!.getVertexPosition(i, a);
        mesh!.geometry = finished;
        mesh!.getVertexPosition(i, b);
        expect(a.distanceTo(b)).toBe(0);
      }
    }
    expect(normal.array).toEqual(before);
    finished.dispose();
  }
);
