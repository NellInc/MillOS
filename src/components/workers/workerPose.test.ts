// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORKER_EYE_CENTRES, createWorkerShirtTrim } from './SharedWorkerGeometries';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {
  createSeatedWorkerPose,
  createWorkerHandPose,
  createWorkerGesture,
  easeWorkerGesture,
  sampleWorkerGesture,
  createWorkerEyeBlink,
  createWorkerFaceExpression,
  sampleWorkerBlink,
  createWorkerGaze,
  sampleWorkerGaze,
} from './workerPose';
import { COMMUNITY_ANCHORS } from '../../constants/communityLayout';
import { getWorkerAppearance } from './workerTypes';
import { createWorkerBodyLod } from './workerBodyLod';
import {
  createWorkerFaceColours,
  dressWorkerHands,
  softenWorkerFaceNormals,
  retainWorkerBrows,
  shareWorkerSkin,
  createBakerApron,
  createWorkerAccessoryPair,
  setWorkerPupilPose,
  setWorkerPupilBlink,
} from '../models/WorkerModel';

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
          const gesture = createWorkerGesture(),
            targetGesture = createWorkerGesture();
          const pos = (name: string) =>
            scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
          let firstFeet: THREE.Vector3[] = [];
          let minimum = Infinity,
            maximum = -Infinity;
          for (let frame = 0; frame < 32; frame++) {
            sampleWorkerGesture(task, frame * 0.25, targetGesture);
            easeWorkerGesture(gesture, targetGesture, 0.25);
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

it('standing posture settles include quiet dwells and never leak into work or seated rest', () => {
  const gesture = createWorkerGesture();
  expect(sampleWorkerGesture('idle', 4, gesture).idleSettle).toBeCloseTo(0.018);
  expect(sampleWorkerGesture('idle', 13, gesture).idleSettle).toBeCloseTo(-0.0117);
  for (const t of [0, 1, 8, 9, 16, 19.7])
    expect(sampleWorkerGesture('idle', t, gesture).idleSettle).toBeCloseTo(0);
  for (const kind of [
    'rest',
    'operate',
    'inspect',
    'sample',
    'supervise',
    'repair',
    'radio',
    'garden',
    'bake',
  ] as const)
    expect(sampleWorkerGesture(kind, 4, gesture).idleSettle).toBe(0);
  expect(sampleWorkerGesture('greet', 4, gesture).idleSettle).toBeCloseTo(0.018);
});

it.each(['masculine', 'feminine'])(
  '%s standing settles retain boots and restore the incoming rig',
  (body) => {
    const gltf = bodies.get(body)!,
      scene = clone(gltf.scene),
      mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-idle')!).play();
    const pose = createSeatedWorkerPose(scene),
      gesture = createWorkerGesture();
    const abdomen = scene.getObjectByName('Abdomen')!,
      point = new THREE.Vector3();
    let largest = 0;
    for (let frame = 0; frame < 480; frame++) {
      mixer.update(1 / 24);
      scene.updateMatrixWorld(true);
      sampleWorkerGesture('idle', frame / 24, gesture);
      const feet = ['FootL', 'FootR'].map((n) =>
        scene.getObjectByName(n)!.getWorldPosition(point).clone()
      );
      const incoming = abdomen.quaternion.clone(),
        settle = gesture.idleSettle;
      gesture.idleSettle = 0;
      pose.applyIdle(gesture);
      const control = abdomen.quaternion.clone();
      pose.restore();
      gesture.idleSettle = settle;
      pose.applyIdle(gesture);
      largest = Math.max(largest, control.angleTo(abdomen.quaternion));
      expect(abdomen.userData.workerIdleSettle).toBe(settle);
      ['FootL', 'FootR'].forEach((n, i) =>
        expect(scene.getObjectByName(n)!.getWorldPosition(point).distanceTo(feet[i])).toBeLessThan(
          0.000001
        )
      );
      pose.restore();
      expect(abdomen.quaternion.angleTo(incoming)).toBeLessThan(0.000001);
    }
    expect(largest).toBeGreaterThan(0.015);
    expect(largest).toBeLessThan(0.019);
  }
);

it('holds discrete glances, returns to neutral and leaves a real quiet work interval', () => {
  const g = createWorkerGesture();
  const a = { ...sampleWorkerGesture('idle', 2.2, g) },
    b = { ...sampleWorkerGesture('idle', 2.8, g) };
  expect(a.lookYaw).toBe(0.22);
  expect(b.lookYaw).toBe(a.lookYaw);
  expect(b.lookPitch).toBe(a.lookPitch);
  for (const time of [0, 5, 7, 14, 16.899]) {
    sampleWorkerGesture('idle', time, g);
    expect(g.lookYaw).toBeCloseTo(0, 8);
    expect(g.lookPitch).toBeCloseTo(0, 8);
  }
  expect(sampleWorkerGesture('idle', 10, g).lookYaw).toBeLessThan(-0.15);
  for (const time of [6.1, 7, 8, 9.7]) {
    sampleWorkerGesture('inspect', time, g);
    expect(g.workStroke).toBeCloseTo(0, 8);
    expect(g.workCheck).toBeCloseTo(0, 8);
  }
  expect(Math.abs(sampleWorkerGesture('inspect', 2, g).workStroke)).toBeGreaterThan(0.1);
});

it('gives actual work roles distinct bounded cadences and retains their shared quiet dwell', () => {
  const g = createWorkerGesture();
  const profiles = new Map<string, number[]>();
  for (const kind of ['repair', 'sample', 'inspect', 'supervise', 'operate'] as const) {
    const points: number[] = [];
    for (let i = 0; i <= 196; i++) {
      const t = i * 0.05;
      sampleWorkerGesture(kind, t, g);
      const limit =
        kind === 'inspect' ? 0.45 : kind === 'supervise' ? 0.4 : kind === 'operate' ? 0.7 : 1;
      expect(Math.abs(g.workStroke)).toBeLessThanOrEqual(limit);
      expect(Math.abs(g.workCheck)).toBeLessThanOrEqual(1);
      if (t > 6 && t < 9.8) {
        expect(g.workStroke).toBeCloseTo(0, 8);
        expect(g.workCheck).toBeCloseTo(0, 8);
      }
      points.push(g.workStroke);
    }
    expect(sampleWorkerGesture(kind, 2.75, g)).toEqual(
      sampleWorkerGesture(kind, 2.75, createWorkerGesture())
    );
    profiles.set(kind, points);
  }
  expect(new Set([...profiles.values()].map((p) => JSON.stringify(p))).size).toBe(5);
});

it('eases the same finite gesture object with frame-rate-independent settling and exact paused targets', () => {
  const target = sampleWorkerGesture('garden', 2, createWorkerGesture());
  target.lookPitch = 0.16;
  target.greetingLift = 1;
  const a = createWorkerGesture(),
    b = createWorkerGesture();
  expect(easeWorkerGesture(a, target, 1 / 60)).toBe(a);
  expect(a.lookPitch).toBeGreaterThan(0);
  expect(a.lookPitch).toBeLessThan(0.04);
  expect(a.toolZ / a.toolY).toBeCloseTo(target.toolZ / target.toolY, 10);
  for (let i = 1; i < 60; i++) easeWorkerGesture(a, target, 1 / 60);
  for (let i = 0; i < 30; i++) easeWorkerGesture(b, target, 1 / 30);
  for (const key of Object.keys(a) as Array<keyof typeof a>) expect(a[key]).toBeCloseTo(b[key], 10);
  const before = { ...a };
  easeWorkerGesture(a, target, NaN);
  expect(a).toEqual(before);
  easeWorkerGesture(a, createWorkerGesture(), 0, true);
  expect(a).toEqual(createWorkerGesture());
});
for (const body of ['masculine', 'feminine'] as const) {
  it(`${body} face colour follows actual Head bind space without painting cached skin or geometry`, () => {
    const original = bodies.get(body)!;
    const scene = clone(original.scene);
    scene.updateMatrixWorld(true);
    const head = scene.getObjectByName('Head')!;
    let face: THREE.SkinnedMesh | undefined;
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (
        m.isSkinnedMesh &&
        m.parent?.name.includes('Worker_Head') &&
        !Array.isArray(m.material) &&
        m.material.name === 'Skin'
      )
        face = m;
    });
    const geometry = face!.geometry,
      originalPositions = geometry.getAttribute('position').array.slice();
    const colours = createWorkerFaceColours(face!, head, body)!;
    expect(colours.count).toBe(geometry.getAttribute('position').count);
    let warm = 0;
    for (let i = 0; i < colours.count; i++) {
      expect(colours.getX(i)).toBeGreaterThanOrEqual(0.9749);
      expect(colours.getX(i)).toBeLessThanOrEqual(1.0451);
      expect(colours.getZ(i)).toBeGreaterThanOrEqual(0.9099);
      if (colours.getX(i) - colours.getY(i) > 0.025) warm++;
    }
    expect(warm).toBeGreaterThan(20);
    scene.position.set(13, 4, -7);
    scene.rotation.y = 0.8;
    scene.updateMatrixWorld(true);
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(original.animations.find((c) => c.name === 'worker-inspect')!).play();
    mixer.update(0.45);
    scene.updateMatrixWorld(true);
    const moved = createWorkerFaceColours(face!, head, body)!;
    for (let i = 0; i < colours.array.length; i++)
      expect(moved.array[i]).toBeCloseTo(colours.array[i], 6);
    expect(geometry.getAttribute('color')).toBeUndefined();
    expect(geometry.getAttribute('position').array).toEqual(originalPositions);
  });
  it(`${body} workwear finish keeps original topology, creases and cached normals`, () => {
    const scene = clone(bodies.get(body)!.scene);
    let changed = 0,
      regions = 0;
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (
        !m.isSkinnedMesh ||
        !m.parent?.name.includes('Worker_Body') ||
        Array.isArray(m.material) ||
        ![
          'Skin',
          'LightBrown',
          'White',
          'Brown',
          'Brown_02',
          'Brown2',
          'Worker_Vest',
          'Worker_Yellow',
        ].includes(m.material.name)
      )
        return;
      const source = m.geometry,
        before = source.getAttribute('normal').array.slice();
      const finish = softenWorkerFaceNormals(source)!;
      regions++;
      expect(finish.index!.array).toEqual(source.index!.array);
      for (const key of Object.keys(source.attributes).filter((k) => k !== 'normal'))
        expect(finish.getAttribute(key).array).toEqual(source.getAttribute(key).array);
      const n = finish.getAttribute('normal'),
        old = source.getAttribute('normal');
      const a = new THREE.Vector3(),
        b = new THREE.Vector3();
      for (let i = 0; i < n.count; i++) {
        a.fromBufferAttribute(old, i).normalize();
        b.fromBufferAttribute(n, i);
        expect(b.length()).toBeCloseTo(1, 5);
        expect(a.angleTo(b)).toBeLessThan(Math.PI / 4);
        if (a.distanceTo(b) > 0.001) changed++;
      }
      expect(source.getAttribute('normal').array).toEqual(before);
      finish.dispose();
    });
    expect(regions).toBeGreaterThan(3);
    expect(changed).toBeGreaterThan(20);
  });
}

describe('authored finger articulation', () => {
  for (const body of ['masculine', 'feminine']) {
    it(`${body} curls distal joints while preserving palm, wrist, feet and original assets`, () => {
      const asset = bodies.get(body)!,
        scene = clone(asset.scene);
      const mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(asset.animations.find((c) => c.name === 'worker-inspect')!).play();
      mixer.setTime(0.3);
      scene.updateMatrixWorld(true);
      const pose = createWorkerHandPose(scene, asset.animations);
      expect(pose.jointCount).toBe(20);
      const stableNames = ['WristL', 'WristR', 'Middle1L', 'Middle2L', 'Index1L', 'FootL', 'FootR'];
      const stable = stableNames.map((n) =>
        scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
      );
      const finger = scene.getObjectByName('Middle4L')!,
        wrist = scene.getObjectByName('WristL')!;
      const distance = () =>
        finger
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(wrist.getWorldPosition(new THREE.Vector3()));
      const beforeDistance = distance();
      const before = scene.getObjectByName('Index2L')!.quaternion.clone();
      const source = asset.scene.getObjectByName('Index2L')!.quaternion.clone();
      const motion = {
        activity: 'working' as const,
        enabled: false,
        seated: false,
        groundSpeed: 0,
        phase: 0,
      };
      const gesture = sampleWorkerGesture('repair', 2, createWorkerGesture());
      pose.apply(motion, 'wrench', gesture);
      scene.updateMatrixWorld(true);
      expect(distance()).toBeLessThan(beforeDistance - 0.003);
      expect(scene.getObjectByName('Index2L')!.quaternion.angleTo(before)).toBeGreaterThan(0.25);
      stableNames.forEach((n, i) =>
        expect(
          scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).distanceTo(stable[i])
        ).toBeLessThan(1e-7)
      );
      expect(asset.scene.getObjectByName('Index2L')!.quaternion.toArray()).toEqual(
        source.toArray()
      );
      const other = clone(asset.scene);
      expect(other.getObjectByName('Index2L')!.quaternion.toArray()).toEqual(source.toArray());
      const held = scene.getObjectByName('Index2L')!.quaternion.clone();
      for (let i = 0; i < 12; i++) {
        pose.restore();
        pose.apply(motion, 'wrench', gesture, 100);
        expect(scene.getObjectByName('Index2L')!.quaternion.toArray()).toEqual(held.toArray());
      }
      pose.restore();
      expect(scene.getObjectByName('Index2L')!.quaternion.toArray()).toEqual(before.toArray());
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    });

    it(`${body} distinguishes holds, releases greetings and leaves both locomotion clips exact`, () => {
      const asset = bodies.get(body)!,
        scene = clone(asset.scene),
        pose = createWorkerHandPose(scene, asset.animations);
      const motion = {
        activity: 'working' as 'working' | 'idle' | 'walking',
        enabled: false,
        seated: false,
        groundSpeed: 0,
        phase: 0,
        cycling: false,
      };
      const gesture = createWorkerGesture(),
        finger = scene.getObjectByName('Index2L')!,
        original = finger.quaternion.clone();
      const angle = (tool: 'wrench' | 'clipboard' | 'bread-tray') => {
        pose.restore();
        pose.apply(motion, tool, gesture);
        return finger.quaternion.angleTo(original);
      };
      const wrench = angle('wrench'),
        clipboard = angle('clipboard'),
        bread = angle('bread-tray');
      expect(wrench).toBeGreaterThan(clipboard);
      expect(clipboard).toBeGreaterThan(bread);
      pose.restore();
      motion.activity = 'idle';
      gesture.greetingLift = 1;
      const right = scene.getObjectByName('Index2R')!,
        rightBefore = right.quaternion.clone();
      pose.apply(motion, 'none', gesture);
      expect(right.quaternion.toArray()).toEqual(rightBefore.toArray());
      pose.restore();
      gesture.greetingLift = 0;
      motion.cycling = true;
      pose.apply(motion, 'none', gesture);
      expect(finger.quaternion.angleTo(original)).toBeGreaterThan(clipboard);
      pose.restore();
      motion.cycling = false;
      motion.activity = 'walking';
      const mixer = new THREE.AnimationMixer(scene);
      for (const name of ['worker-walk', 'worker-run']) {
        mixer.stopAllAction();
        mixer.clipAction(asset.animations.find((c) => c.name === name)!).play();
        mixer.setTime(0.35);
        scene.updateMatrixWorld(true);
        const before = new Map<string, number[]>();
        scene.traverse((o) => before.set(o.name, o.quaternion.toArray()));
        pose.apply(motion, 'none', gesture, 1 / 60);
        scene.traverse((o) => expect(o.quaternion.toArray()).toEqual(before.get(o.name)));
        pose.restore();
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      const cadence = (hz: number) => {
        const root = clone(asset.scene),
          p = createWorkerHandPose(root, asset.animations);
        motion.activity = 'idle';
        motion.enabled = true;
        p.apply(motion, 'none', gesture);
        p.restore();
        motion.activity = 'working';
        for (let i = 0; i < hz; i++) {
          p.restore();
          p.apply(motion, 'wrench', gesture, 1 / hz);
        }
        const q = root.getObjectByName('Index2L')!.quaternion.clone();
        p.restore();
        return q;
      };
      expect(cadence(24).angleTo(cadence(60))).toBeLessThan(1e-7);
    });
  }
  it('leaves incomplete or clip-less rigs unchanged', () => {
    const root = new THREE.Group();
    const pose = createWorkerHandPose(root, []);
    expect(pose.jointCount).toBe(0);
    pose.apply(
      { activity: 'idle', enabled: true, seated: false, groundSpeed: 0, phase: 0 },
      'none',
      createWorkerGesture(),
      1 / 60
    );
    pose.restore();
    expect(root.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });
});

for (const body of ['masculine', 'feminine']) {
  it(`${body} replaces only scalp triangles while keeping real brow vertices and skin bindings`, () => {
    const scene = clone(bodies.get(body)!.scene);
    scene.updateMatrixWorld(true);
    const head = scene.getObjectByName('Head')!;
    let checked = false;
    scene.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (
        !mesh.isSkinnedMesh ||
        Array.isArray(mesh.material) ||
        mesh.material.name !== (body === 'masculine' ? 'Eyebrows' : 'DarkBrown')
      )
        return;
      const source = mesh.geometry,
        oldIndex = source.index?.array.slice();
      const brows = retainWorkerBrows(mesh, head)!;
      expect(brows).toBeTruthy();
      expect(brows.index!.count).toBeGreaterThan(12);
      expect(brows.index!.count).toBeLessThan(
        (source.index?.count ?? source.attributes.position.count) / 2
      );
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        expect(brows.getAttribute(name).array).toEqual(source.getAttribute(name).array);
      }
      expect(source.index?.array).toEqual(oldIndex);
      const inverse = head.matrixWorld.clone().invert(),
        p = new THREE.Vector3();
      const ids = new Set(Array.from(brows.index!.array));
      expect(ids.size).toBe(body === 'masculine' ? 48 : 80);
      for (const id of ids) {
        p.fromBufferAttribute(brows.attributes.position, id);
        mesh.applyBoneTransform(id, p).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
        expect(p.y).toBeLessThan(0.16);
        expect(p.z).toBeGreaterThan(0.05);
      }
      // Selection is a whole-triangle centroid contract; an edge vertex may
      // extend behind the front threshold while preserving the original brow.
      const centre = new THREE.Vector3();
      for (let i = 0; i < brows.index!.count; i += 3) {
        centre.set(0, 0, 0);
        for (let c = 0; c < 3; c++) {
          p.fromBufferAttribute(brows.attributes.position, brows.index!.getX(i + c));
          mesh
            .applyBoneTransform(brows.index!.getX(i + c), p)
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(inverse);
          centre.add(p);
        }
        centre.divideScalar(3);
        expect(centre.y).toBeLessThan(0.142);
        expect(centre.z).toBeGreaterThan(0.08);
      }
      brows.dispose();
      checked = true;
    });
    expect(checked).toBe(true);
  });
}

it('eases the stationary garden-to-idle pelvis without an upward snap', () => {
  for (const body of ['masculine', 'feminine']) {
    const gltf = bodies.get(body)!;
    const scene = clone(gltf.scene);
    const mixer = new THREE.AnimationMixer(scene);
    const work = mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-break')!).play();
    const idle = mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-idle')!).play();
    work.setEffectiveWeight(1);
    idle.setEffectiveWeight(0);
    mixer.update(0);
    const pose = createSeatedWorkerPose(scene);
    const gesture = createWorkerGesture();
    pose.applyGarden(true, gesture, 0, true);
    const hips = scene.getObjectByName('Hips')!;
    const before = hips.getWorldPosition(new THREE.Vector3()).y;
    pose.restore();
    work.setEffectiveWeight(Math.exp(-11 / 60));
    idle.setEffectiveWeight(1 - Math.exp(-11 / 60));
    mixer.update(1 / 60);
    pose.applyGarden(false, gesture, 1 / 60);
    const step = hips.getWorldPosition(new THREE.Vector3()).y - before;
    console.info('garden exit first-frame pelvis metres', body, step);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.045);
  }
});

it('keeps real garden feet planted and chains unstretched through rise, pause and return', () => {
  for (const body of ['masculine', 'feminine'])
    for (const height of [0.95, 1.08]) {
      const gltf = bodies.get(body)!;
      const scene = clone(gltf.scene);
      const wrapper = new THREE.Group();
      const width = height === 0.95 ? 0.96 : 1.06;
      wrapper.scale.set(width, height, width);
      wrapper.add(scene);
      const mixer = new THREE.AnimationMixer(scene);
      const work = mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-break')!).play();
      const idle = mixer.clipAction(gltf.animations.find((c) => c.name === 'worker-idle')!).play();
      work.setEffectiveWeight(1);
      idle.setEffectiveWeight(0);
      mixer.update(0);
      const pose = createSeatedWorkerPose(scene, height, width);
      const gesture = createWorkerGesture();
      pose.applyGarden(true, gesture, 0, true);
      const pos = (name: string) =>
        scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
      let previousY = pos('Hips').y;
      let worstChain = '';
      let weight = 1,
        maxStep = 0,
        maxStretch = 0,
        maxFootError = 0,
        minSole = Infinity;
      let furthestLow = -Infinity,
        maxGripError = 0;
      const vertex = new THREE.Vector3();
      for (let frame = 0; frame < 240; frame++) {
        const working = frame >= 120;
        pose.restore();
        weight = THREE.MathUtils.damp(weight, working ? 1 : 0, 11, 1 / 60);
        work.setEffectiveWeight(weight);
        idle.setEffectiveWeight(1 - weight);
        mixer.update(1 / 60);
        pose.applyGarden(working, gesture, 1 / 60);
        const y = pos('Hips').y;
        maxStep = Math.max(maxStep, Math.abs(y - previousY));
        previousY = y;
        for (const side of ['L', 'R']) {
          const sign = side === 'L' ? 1 : -1;
          maxFootError = Math.max(
            maxFootError,
            pos(`Foot${side}`).distanceTo(new THREE.Vector3(sign * 0.15, 0.028, -0.1))
          );
          for (const kind of ['LowerLeg', 'LowerArm']) {
            const stretch = scene.getObjectByName(`${kind}${side}`)!.scale.y;
            if (stretch > maxStretch) {
              maxStretch = stretch;
              worstChain = `${kind}${side}/frame${frame}/hips${y}`;
            }
          }
          if (pose.gardenGripReady()) {
            const palm = pos(`Middle1${side}`).lerp(pos(`Middle2${side}`), 0.5);
            maxGripError = Math.max(
              maxGripError,
              palm.distanceTo(
                new THREE.Vector3(
                  side === 'L' ? 0.12 : -0.12,
                  side === 'L' ? 0.326 : 0.4,
                  side === 'L' ? 0.5205 : 0.26
                )
              )
            );
          }
        }
        if (frame % 20 === 0) {
          scene.traverse((object) => {
            const mesh = object as THREE.SkinnedMesh;
            if (!mesh.isSkinnedMesh) return;
            mesh.skeleton.update();
            if (!/Worker_(?:Feet|Legs)/.test(mesh.parent?.name ?? '')) return;
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
              mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
              minSole = Math.min(minSole, vertex.y);
              if (vertex.y < 0.255) furthestLow = Math.max(furthestLow, vertex.z);
            }
          });
        }
        if (frame === 20) {
          const heldY = pos('Hips').y;
          pose.restore();
          mixer.update(0);
          pose.applyGarden(false, gesture, 0);
          expect(pos('Hips').y).toBe(heldY);
        }
        if (frame === 119) {
          expect(y).toBeGreaterThan(0.75);
          expect(pose.gardenGripReady()).toBe(false);
        }
      }
      console.info('garden flow metrics', {
        worstChain,
        body,
        height,
        maxStep,
        maxStretch,
        maxFootError,
        minSole,
        furthestLow,
        maxGripError,
      });
      expect(maxStep).toBeLessThan(0.045);
      expect(maxStretch).toBeLessThan(1.05);
      expect(maxFootError).toBeLessThan(0.00001);
      expect(minSole).toBeGreaterThan(-0.015);
      expect(furthestLow + COMMUNITY_ANCHORS.allotmentGardener.position[2]).toBeLessThan(10.395);
      expect(maxGripError).toBeLessThan(0.012);
      expect(pose.gardenGripReady()).toBe(true);
      pose.restore();
      mixer.update(0);
      pose.releaseGarden();
      expect(pose.applyGarden(false, gesture, 1 / 60)).toBe(false);
      pose.applyGarden(true, gesture, 0, true);
      expect(pos('Hips').y).toBeCloseTo(0.44, 4);
      pose.restore();
      mixer.update(0);
      pose.applyGarden(false, gesture, 0, true);
      expect(pose.gardenGripReady()).toBe(false);
      expect(pos('Hips').y).toBeGreaterThan(0.75);
      pose.restore();
    }
});

describe('actual-rig baker linen skinning and distant preservation', () => {
  for (const body of ['masculine', 'feminine'])
    for (const height of [0.95, 1.08]) {
      it(`${body}/${height} binds cloth to the actual palette through work and locomotion`, () => {
        const gltf = bodies.get(body)!;
        const scene = clone(gltf.scene),
          wrapper = new THREE.Group();
        wrapper.position.set(4, 0.4, -6);
        wrapper.rotation.y = 0.9;
        wrapper.scale.set(0.96, height, 1.06);
        wrapper.add(scene);
        const skeletons = shareWorkerSkin(scene);
        const inverses = skeletons[0].boneInverses.map((x) => x.elements.slice());
        const original = new Map<THREE.BufferGeometry, number[]>();
        scene.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (m.isSkinnedMesh) {
            original.set(m.geometry, Array.from(m.geometry.attributes.position.array));
            m.castShadow = !(m.parent?.name ?? '').includes('Worker_Feet');
          }
        });
        scene.updateWorldMatrix(true, true);
        const apron = createBakerApron(scene)!;
        expect(apron).not.toBeNull();
        scene.updateWorldMatrix(true, true);
        expect(apron.skeleton).toBe(skeletons[0]);
        expect(apron.material).toMatchObject({
          vertexColors: true,
          roughness: 0.94,
          metalness: 0,
          map: null,
          transparent: false,
        });
        const geometry = apron.geometry;
        expect(geometry.index).not.toBeNull();
        expect(geometry.index!.count / 3).toBeLessThan(2200);
        // The old sliding front maximum made 23 mm depth kinks between rows,
        // and its full-width flat hem projected into the swinging hands.
        const surface = geometry.attributes.position;
        const widths = Array.from(
          { length: 25 },
          (_, row) => (surface.getX(row * 21 + 20) - surface.getX(row * 21)) / 2
        );
        expect(Math.max(...widths)).toBeLessThan(0.22);
        expect(widths[24]).toBeLessThan(Math.max(...widths) * 0.9);
        const centreDepths = widths.map((_, row) => surface.getZ(row * 21 + 10));
        for (let row = 1; row < 24; row++)
          expect(
            Math.abs(centreDepths[row + 1] - 2 * centreDepths[row] + centreDepths[row - 1])
          ).toBeLessThan(0.0075);
        for (const column of [0, 20])
          expect(centreDepths[24] - surface.getZ(24 * 21 + column)).toBeGreaterThan(0.02);
        expect(geometry.attributes.skinIndex.array).toBeInstanceOf(Uint8Array);
        let weightError = 0;
        for (let i = 0; i < geometry.attributes.skinWeight.count; i++) {
          let total = 0;
          for (let j = 0; j < 4; j++) total += geometry.attributes.skinWeight.getComponent(i, j);
          weightError = Math.max(weightError, Math.abs(total - 1));
        }
        expect(weightError).toBeLessThan(1e-7);
        for (const key of ['position', 'normal', 'color', 'skinIndex', 'skinWeight'])
          expect(Array.from(geometry.attributes[key].array).every(Number.isFinite)).toBe(true);
        const lod = createWorkerBodyLod(scene)!;
        expect(lod).not.toBeNull();
        expect(lod.meshes).toHaveLength(2);
        const cast = lod.sources.filter((m) => m.castShadow === apron.castShadow);
        const offset = cast
          .slice(0, cast.indexOf(apron))
          .reduce((n, m) => n + m.geometry.attributes.position.count, 0);
        const far = lod.meshes.find((m) => m.castShadow === apron.castShadow)!;
        const mixer = new THREE.AnimationMixer(scene),
          pose = createSeatedWorkerPose(scene, height, 0.96);
        const actual = new THREE.Vector3(),
          expected = new THREE.Vector3(),
          raw = new THREE.Vector3(),
          part = new THREE.Vector3();
        const triangleA = new THREE.Vector3(),
          triangleB = new THREE.Vector3(),
          triangleC = new THREE.Vector3();
        const first = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, 1).transformDirection(scene.matrixWorld);
        const ray = new THREE.Raycaster(),
          rayOrigin = new THREE.Vector3();
        const trousers = scene.getObjectByName('Worker_Legs')!;
        const torsoSurfaces: THREE.SkinnedMesh[] = [];
        scene.traverse((object) => {
          const mesh = object as THREE.SkinnedMesh;
          if (
            mesh.isSkinnedMesh &&
            original.has(mesh.geometry) &&
            /Worker_(Body|Legs)/.test(mesh.parent?.name ?? '')
          )
            torsoSurfaces.push(mesh);
        });
        let maxBibDistance = 0,
          maxBibIntrusion = 0,
          maxUpperBibIntrusion = 0,
          worstBib = '',
          worstIntrusion = '';
        const bodyTriangles: number[][] = [];
        const trunkMeshes = torsoSurfaces;
        trunkMeshes.forEach((mesh, meshIndex) => {
          for (let i = 0; i < mesh.geometry.index!.count; i += 3)
            bodyTriangles.push([
              meshIndex,
              ...[0, 1, 2].map((k) => mesh.geometry.index!.getX(i + k)),
            ]);
        });
        let maxPokeThrough = 0,
          rayHits = 0,
          worstFit = '';
        let movement = 0,
          maxError = 0,
          maxFarError = 0;
        let sample = 0;
        for (const name of ['worker-idle', 'worker-walk', 'worker-run', 'worker-break']) {
          mixer.stopAllAction();
          const clip = gltf.animations.find((c) => c.name === name)!;
          mixer.clipAction(clip).reset().play();
          for (const phase of [0, 0.23, 0.58, 0.87]) {
            pose.restore();
            mixer.setTime(clip.duration * phase);
            if (name === 'worker-break') pose.applyTask('bake');
            scene.updateWorldMatrix(true, true);
            apron.skeleton.update();
            function checkFit(point: THREE.Vector3, location: string) {
              rayOrigin.copy(point).add(forward);
              ray.set(rayOrigin, part.copy(forward).negate());
              const hit = ray.intersectObject(trousers, true)[0];
              if (hit) {
                rayHits++;
                if (1 - hit.distance > maxPokeThrough) {
                  maxPokeThrough = 1 - hit.distance;
                  worstFit = `${name}/phase${phase}/${location}`;
                }
              }
            }
            {
              const posedTrunk = trunkMeshes.map((mesh) =>
                Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) =>
                  mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)
                )
              );
              const triangle = new THREE.Triangle(),
                closest = new THREE.Vector3();
              function checkBib(point: THREE.Vector3, location: string, upper = false) {
                let nearest = Infinity,
                  signed = 0;
                for (const [m, a, b, c] of bodyTriangles) {
                  triangle.set(posedTrunk[m][a], posedTrunk[m][b], posedTrunk[m][c]);
                  triangle.closestPointToPoint(point, closest);
                  const distance = closest.distanceTo(point);
                  if (distance < nearest) {
                    nearest = distance;
                    signed = triangle.getNormal(part).dot(raw.copy(point).sub(closest));
                  }
                }
                if (upper) maxUpperBibIntrusion = Math.max(maxUpperBibIntrusion, -signed);
                if (nearest > maxBibDistance) {
                  maxBibDistance = nearest;
                  worstBib = `${name}/${phase}/${location}`;
                }
                if (-signed > maxBibIntrusion) {
                  maxBibIntrusion = -signed;
                  worstIntrusion = `${name}/${phase}/${location}`;
                }
              }
              // Include the trousers supporting the waist transition. The shorter
              // feminine shirt ends above row14; the distant replica is excluded.
              for (const row of [1, 2, 5, 8, 11, 14])
                for (const column of row < 3 ? [1, 7, 10, 13, 19] : [7, 10, 13]) {
                  apron
                    .getVertexPosition(row * 21 + column, actual)
                    .applyMatrix4(apron.matrixWorld);
                  checkBib(actual, `row${row}/column${column}`, row < 3);
                }
              for (const row of [5, 11, 13]) {
                const a = row * 21 + 10,
                  b = a + 21;
                for (const ids of [
                  [a, b + 1, b],
                  [a, a + 1, b + 1],
                ]) {
                  apron.getVertexPosition(ids[0], triangleA).applyMatrix4(apron.matrixWorld);
                  apron.getVertexPosition(ids[1], triangleB).applyMatrix4(apron.matrixWorld);
                  apron.getVertexPosition(ids[2], triangleC).applyMatrix4(apron.matrixWorld);
                  actual
                    .copy(triangleA)
                    .add(triangleB)
                    .add(triangleC)
                    .multiplyScalar(1 / 3);
                  checkBib(actual, `triangle${ids.join('/')}`);
                }
              }
              for (const row of [16, 20, 22, 24])
                for (const column of [1, 3, 5, 8, 10, 12, 15, 17, 19]) {
                  apron
                    .getVertexPosition(row * 21 + column, actual)
                    .applyMatrix4(apron.matrixWorld);
                  checkFit(actual, `row${row}/column${column}`);
                }
              // Rasterised triangle interiors can intersect even when corners clear.
              for (const row of [16, 20, 22, 23])
                for (const column of [1, 3, 5, 8, 10, 12, 15, 17, 18]) {
                  const a = row * 21 + column,
                    b = a + 21;
                  for (const ids of [
                    [a, b + 1, b],
                    [a, a + 1, b + 1],
                  ]) {
                    apron.getVertexPosition(ids[0], triangleA).applyMatrix4(apron.matrixWorld);
                    apron.getVertexPosition(ids[1], triangleB).applyMatrix4(apron.matrixWorld);
                    apron.getVertexPosition(ids[2], triangleC).applyMatrix4(apron.matrixWorld);
                    actual
                      .copy(triangleA)
                      .add(triangleB)
                      .add(triangleC)
                      .multiplyScalar(1 / 3);
                    checkFit(actual, `triangle${ids.join('/')}`);
                  }
                }
            }
            for (let i = 0; i < geometry.attributes.position.count; i += 23) {
              raw
                .fromBufferAttribute(geometry.attributes.position, i)
                .applyMatrix4(apron.bindMatrix);
              expected.set(0, 0, 0);
              for (let j = 0; j < 4; j++) {
                const index = geometry.attributes.skinIndex.getComponent(i, j),
                  weight = geometry.attributes.skinWeight.getComponent(i, j);
                if (!weight) continue;
                part
                  .copy(raw)
                  .applyMatrix4(apron.skeleton.boneInverses[index])
                  .applyMatrix4(apron.skeleton.bones[index].matrixWorld);
                expected.addScaledVector(part, weight);
              }
              expected.applyMatrix4(apron.bindMatrixInverse).applyMatrix4(apron.matrixWorld);
              apron.getVertexPosition(i, actual).applyMatrix4(apron.matrixWorld);
              expect(actual.toArray().every(Number.isFinite)).toBe(true);
              maxError = Math.max(maxError, actual.distanceTo(expected));
              far.getVertexPosition(offset + i, part).applyMatrix4(far.matrixWorld);
              maxFarError = Math.max(maxFarError, actual.distanceTo(part));
              if (i === 0) {
                if (!sample) first.copy(actual);
                else movement = Math.max(movement, actual.distanceTo(first));
              }
            }
            sample++;
          }
        }
        expect(rayHits).toBeGreaterThan(100);
        expect(maxBibDistance, `bib stands away at ${worstBib}`).toBeLessThan(0.04);
        expect(maxUpperBibIntrusion).toBeLessThan(0.0005);
        expect(maxBibIntrusion, `bib penetrates at ${worstIntrusion}`).toBeLessThan(0.008);
        expect(geometry.userData.apronFit.maxDiscardedWeight).toBeLessThan(0.1);
        const torsoJoint = apron.skeleton.bones.findIndex((bone) => bone.name === 'Torso');
        expect(
          Array.from(geometry.attributes.skinIndex.array).some(
            (joint, i) => joint === torsoJoint && geometry.attributes.skinWeight.array[i] > 0
          )
        ).toBe(true);
        expect(maxPokeThrough, `trousers cover apron at ${worstFit}`).toBeLessThan(0.008);
        expect(maxError).toBeLessThan(1e-6);
        expect(maxFarError).toBeLessThan(1e-6);
        expect(movement).toBeGreaterThan(0.05);
        expect(apron.skeleton.boneInverses.map((x) => x.elements)).toEqual(inverses);
        for (const [g, p] of original) expect(Array.from(g.attributes.position.array)).toEqual(p);
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(4, 0.4, 110);
        lod.update(camera);
        expect(apron.visible).toBe(false);
        expect(lod.meshes.every((m) => m.visible)).toBe(true);
        camera.position.copy(wrapper.position);
        for (let i = 0; i < 12; i++) lod.update(camera);
        expect(apron.visible).toBe(true);
        pose.restore();
        lod.dispose();
        apron.geometry.dispose();
        apron.material.dispose();
      });
    }
});

describe('route-supported seat choreography on the actual rigs', () => {
  for (const body of ['masculine', 'feminine'])
    it(`${body} keeps canonical contacts across mixer phases and restores a private probe exactly`, () => {
      const gltf = bodies.get(body)!;
      const clip = gltf.animations.find((c) => c.name === 'worker-break')!;
      const walk = gltf.animations.find((c) => c.name === 'worker-walk')!;
      const buffers: Uint8Array[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isSkinnedMesh) return;
        for (const attribute of Object.values(mesh.geometry.attributes))
          buffers.push(
            new Uint8Array(
              attribute.array.buffer,
              attribute.array.byteOffset,
              attribute.array.byteLength
            )
          );
      });
      for (const track of [...clip.tracks, ...walk.tracks])
        for (const values of [track.times, track.values])
          buffers.push(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
      const beforeBuffers = buffers.map((buffer) => Buffer.from(buffer));
      const inverseBinds: number[][] = [];
      gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
          inverseBinds.push(
            ...(o as THREE.SkinnedMesh).skeleton.boneInverses.map((m) => m.toArray())
          );
      });
      const inverseBefore = JSON.stringify(inverseBinds);
      const contacts = new Map<number, number[]>();
      for (const phase of [0.07, 0.39, 0.83]) {
        const scene = clone(gltf.scene);
        const mixer = new THREE.AnimationMixer(scene);
        mixer.clipAction(walk).play().setEffectiveWeight(phase);
        mixer
          .clipAction(clip)
          .play()
          .setEffectiveWeight(1 - phase);
        mixer.setTime(walk.duration * phase);
        scene.updateMatrixWorld(true);
        const snapshot = () => {
          const values: number[] = [];
          scene.traverse((o) =>
            values.push(...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray())
          );
          return values;
        };
        const before = snapshot();
        let pose = createSeatedWorkerPose(scene, 1, 1, clip);
        expect(snapshot()).toEqual(before);
        // A rebuilt controller after a restored overlay sees the same source.
        pose.applySeat({ amount: 0.6, support: 1, x: 0, z: 0, yaw: 0 });
        pose.restore();
        expect(snapshot()).toEqual(before);
        pose = createSeatedWorkerPose(scene, 1, 1, clip);
        expect(snapshot()).toEqual(before);
        for (const amount of [0, 0.5, 1]) {
          mixer.setTime(walk.duration * (phase + amount * 0.11));
          pose.applySeat({ amount, support: 1, x: 0, z: 0, yaw: 0 });
          const values = ['FootL', 'FootR'].flatMap((name) => {
            const foot = scene.getObjectByName(name)!;
            return [
              ...foot.getWorldPosition(new THREE.Vector3()).toArray(),
              ...foot.getWorldQuaternion(new THREE.Quaternion()).toArray(),
            ];
          });
          const reference = contacts.get(amount);
          if (reference)
            values.forEach((v, i) => expect(Math.abs(v - reference[i])).toBeLessThan(1e-6));
          else contacts.set(amount, values);
          pose.restore();
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      }
      buffers.forEach((buffer, i) =>
        expect(Buffer.from(buffer).equals(beforeBuffers[i])).toBe(true)
      );
      const inverses: number[][] = [];
      gltf.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh)
          inverses.push(...(o as THREE.SkinnedMesh).skeleton.boneInverses.map((m) => m.toArray()));
      });
      expect(JSON.stringify(inverses)).toBe(inverseBefore);
    });
  for (const body of ['masculine', 'feminine'])
    for (const height of [0.95, 1.08]) {
      it(`${body}/${height} lowers and rises on canonical soles, preserving upper-body seat anchors`, () => {
        const gltf = bodies.get(body)!,
          scene = clone(gltf.scene),
          actor = new THREE.Group(),
          wrapper = new THREE.Group();
        const width = height === 0.95 ? 0.96 : 1.06;
        wrapper.scale.set(width, height, width);
        wrapper.add(scene);
        actor.add(wrapper);
        const mixer = new THREE.AnimationMixer(scene),
          clip = gltf.animations.find((c) => c.name === 'worker-break')!;
        mixer.clipAction(clip).play();
        mixer.setTime(clip.duration * 0.23);
        actor.updateMatrixWorld(true);
        const pose = createSeatedWorkerPose(scene, height, width, clip);
        const pos = (name: string) =>
          scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        const footGroup = scene.getObjectByName('Worker_Feet')!;
        const originals = new Map<
          THREE.Object3D,
          { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
        >();
        scene.traverse((o) =>
          originals.set(o, {
            position: o.position.clone(),
            quaternion: o.quaternion.clone(),
            scale: o.scale.clone(),
          })
        );
        pose.apply();
        const legacy = new Map<
          THREE.Object3D,
          { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
        >();
        scene.traverse((o) =>
          legacy.set(o, {
            position: o.position.clone(),
            quaternion: o.quaternion.clone(),
            scale: o.scale.clone(),
          })
        );
        pose.restore();
        pose.applySeat({ amount: 1, support: 1, x: 0, z: 0, yaw: 0 });
        for (const [o, b] of legacy) {
          // The new cue holds a canonical boot stance; legacy upper-body/seat
          // anchors stay exact, while legs are solved to fixed contacts.
          if (/^(UpperLeg|LowerLeg|Foot)/.test(o.name)) continue;
          expect(o.position.distanceTo(b.position)).toBeLessThan(1e-6);
          // GLB quaternions carry float32 norm error; compare actual components.
          expect(
            o.quaternion
              .toArray()
              .map((v, i) => Math.abs(v - b.quaternion.toArray()[i]))
              .every((v) => v < 1e-7),
            o.name
          ).toBe(true);
          expect(o.scale.distanceTo(b.scale)).toBeLessThan(1e-6);
        }
        pose.restore();
        let maxStep = 0,
          maxFootDrift = 0,
          maxStretch = 0,
          minSole = Infinity;
        for (const floor of [0, 0.048])
          for (const rising of [false, true]) {
            let previous: THREE.Vector3 | undefined, planted: THREE.Vector3[] | undefined;
            for (let frame = 0; frame <= 54; frame++) {
              const t = frame / 54,
                smooth = t * t * (3 - 2 * t),
                amount = rising ? 1 - smooth : smooth;
              pose.restore();
              mixer.setTime(clip.duration * 0.23);
              actor.updateMatrixWorld(true);
              pose.applySeat({ amount, support: 1, x: 0, z: 0, yaw: 0 }, floor);
              const pelvis = pos('Hips');
              if (previous) maxStep = Math.max(maxStep, pelvis.distanceTo(previous));
              previous = pelvis;
              const feet = [pos('FootL'), pos('FootR')];
              if (planted)
                for (let i = 0; i < 2; i++)
                  maxFootDrift = Math.max(maxFootDrift, feet[i].distanceTo(planted[i]));
              else planted = feet;
              for (const side of ['L', 'R'])
                maxStretch = Math.max(
                  maxStretch,
                  scene.getObjectByName('LowerLeg' + side)!.scale.y /
                    originals.get(scene.getObjectByName('LowerLeg' + side)!)!.scale.y
                );
              scene.traverse((o) => {
                if ((o as THREE.SkinnedMesh).isSkinnedMesh)
                  (o as THREE.SkinnedMesh).skeleton.update();
              });
              minSole = Math.min(
                minSole,
                new THREE.Box3().setFromObject(footGroup, true).min.y - floor
              );
              expect(
                [...pelvis.toArray(), ...feet.flatMap((f) => f.toArray())].every(Number.isFinite)
              ).toBe(true);
            }
          }
        expect(maxStep).toBeLessThan(0.025);
        expect(maxFootDrift).toBeLessThan(1e-5);
        expect(maxStretch).toBeLessThan(1.18);
        expect(minSole).toBeGreaterThan(-0.012);
        pose.restore();
        // Full support cancels the actual actor's moving position and eased yaw.
        let reference: THREE.Vector3[] | undefined, rotations: THREE.Quaternion[] | undefined;
        for (let frame = 0; frame <= 25; frame++) {
          const yaw = -1.4 + frame * 0.11;
          actor.position.set(frame * 0.006, 0, -frame * 0.004);
          actor.rotation.y = yaw;
          pose.restore();
          mixer.setTime(clip.duration * 0.23);
          actor.updateMatrixWorld(true);
          const dx = -actor.position.x,
            dz = -actor.position.z;
          pose.applySeat({
            amount: 0.5,
            support: 1,
            x: dx * Math.cos(yaw) - dz * Math.sin(yaw),
            z: dx * Math.sin(yaw) + dz * Math.cos(yaw),
            yaw: -yaw,
          });
          const points = [pos('Hips'), pos('FootL'), pos('FootR')],
            quats = ['FootL', 'FootR'].map((n) =>
              scene.getObjectByName(n)!.getWorldQuaternion(new THREE.Quaternion())
            );
          if (reference) {
            for (let i = 0; i < 3; i++)
              expect(points[i].distanceTo(reference[i])).toBeLessThan(1e-5);
            for (let i = 0; i < 2; i++) expect(quats[i].angleTo(rotations![i])).toBeLessThan(0.002);
          } else {
            reference = points;
            rotations = quats;
          }
        }
        pose.restore();
        actor.position.set(0, 0, 0);
        actor.rotation.y = 0;
        actor.updateMatrixWorld(true);
        // Placement/release steps clear both soles while either endpoint moves.
        for (const phase of Array.from({ length: 8 }, (_, i) => i / 8))
          for (const support of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
            mixer.stopAllAction();
            const walk = gltf.animations.find((c) => c.name === 'worker-walk')!;
            mixer.clipAction(walk).play();
            mixer.setTime(walk.duration * phase);
            actor.updateMatrixWorld(true);
            pose.applySeat({ amount: 0, support, x: 0, z: 0, yaw: 0 });
            scene.traverse((o) => {
              if ((o as THREE.SkinnedMesh).isSkinnedMesh)
                (o as THREE.SkinnedMesh).skeleton.update();
            });
            expect(new THREE.Box3().setFromObject(footGroup, true).min.y).toBeGreaterThan(0.001);
            for (const side of ['L', 'R'])
              expect(
                scene.getObjectByName('LowerLeg' + side)!.scale.y /
                  originals.get(scene.getObjectByName('LowerLeg' + side)!)!.scale.y
              ).toBeLessThan(1.18);
            pose.restore();
          }
        pose.restore();
      });
    }
});

describe('duty handover continuity', () => {
  for (const body of ['masculine', 'feminine'])
    it(`${body} releases a tray posture without a semantic wrist jump`, () => {
      const asset = bodies.get(body)!;
      for (const height of [0.95, 1.08]) {
        const scene = clone(asset.scene),
          actor = new THREE.Group();
        const width = height === 0.95 ? 0.96 : 1.06;
        actor.scale.set(width, height, width);
        actor.position.set(3, 0, -4);
        actor.rotation.y = 0.7;
        actor.add(scene);
        const mixer = new THREE.AnimationMixer(scene);
        const pose = createSeatedWorkerPose(scene, height, width);
        const gesture = sampleWorkerGesture('bake', 2.2, createWorkerGesture());
        const objects: THREE.Object3D[] = [];
        scene.traverse((o) => objects.push(o));
        const snapshot = () =>
          objects.flatMap((o) => [
            ...o.position.toArray(),
            ...o.quaternion.toArray(),
            ...o.scale.toArray(),
          ]);
        const pos = (name: string) =>
          scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
        const clip = asset.animations.find((c) => c.name === 'worker-break')!;
        mixer.clipAction(clip).play();
        mixer.setTime(0.3);
        actor.updateMatrixWorld(true);
        const source = snapshot();
        pose.applyTask('bake', gesture);
        const endpoint = snapshot();
        pose.restore();
        pose.applyDuty('bake', gesture, 1);
        expect(snapshot()).toEqual(endpoint);
        pose.restore();
        expect(snapshot()).toEqual(source);
        pose.applyIdle(gesture);
        const base = snapshot();
        pose.restore();
        pose.applyDuty('bake', gesture, 0);
        expect(snapshot()).toEqual(base);
        pose.restore();
        let previous: THREE.Vector3 | undefined, previousKnees: THREE.Vector3[] | undefined;
        let maxStep = 0,
          maxStretch = 0,
          maxKneeStep = 0;
        const footGroup = scene.getObjectByName('Worker_Feet')!;
        scene.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
        });
        const sourceSole = new THREE.Box3().setFromObject(footGroup, true).min.y;
        const calfScales = ['L', 'R'].map(
          (side) => scene.getObjectByName('LowerLeg' + side)!.scale.y
        );
        for (const target of [1, 0, 1, 0]) {
          let weight = target === 1 ? 0 : 1;
          for (let frame = 0; frame < 48; frame++) {
            weight = THREE.MathUtils.damp(weight, target, 4.5, 1 / 60);
            const amount = THREE.MathUtils.smoothstep(weight, 0.002, 0.98);
            const feet = [pos('FootL'), pos('FootR')];
            pose.applyDuty('bake', gesture, amount);
            const wrist = pos('WristL');
            if (previous) maxStep = Math.max(maxStep, wrist.distanceTo(previous));
            previous = wrist;
            const knees = ['LowerLegL', 'LowerLegR'].map(pos);
            if (previousKnees)
              knees.forEach((p, i) => {
                maxKneeStep = Math.max(maxKneeStep, p.distanceTo(previousKnees![i]));
              });
            previousKnees = knees;
            if (frame % 6 === 0) {
              scene.traverse((o) => {
                if ((o as THREE.SkinnedMesh).isSkinnedMesh)
                  (o as THREE.SkinnedMesh).skeleton.update();
              });
              expect(new THREE.Box3().setFromObject(footGroup, true).min.y).toBeGreaterThan(
                sourceSole - 0.008
              );
            }
            for (let i = 0; i < 2; i++) {
              expect(pos('Foot' + ['L', 'R'][i]).distanceTo(feet[i])).toBeLessThan(1e-6);
              maxStretch = Math.max(
                maxStretch,
                scene.getObjectByName('LowerLeg' + ['L', 'R'][i])!.scale.y / calfScales[i]
              );
            }
            expect(snapshot().every(Number.isFinite)).toBe(true);
            pose.restore();
            expect(snapshot()).toEqual(source);
          }
          previous = undefined;
          previousKnees = undefined;
        }
        expect(maxStep).toBeLessThan(0.04);
        expect(maxStretch).toBeLessThan(1.18);
        expect(maxKneeStep).toBeLessThan(0.04);
        // Incoming gait contacts belong to this sample, never a frozen duty episode.
        mixer.stopAllAction();
        const walk = asset.animations.find((c) => c.name === 'worker-walk')!;
        mixer.clipAction(walk).play();
        for (const phase of [0.1, 0.35, 0.7])
          for (const amount of [0.15, 0.5, 0.85]) {
            mixer.setTime(walk.duration * phase);
            actor.updateMatrixWorld(true);
            const feet = ['FootL', 'FootR'].map((n) => pos(n));
            const source = snapshot();
            pose.applyDuty('bake', gesture, amount, true);
            feet.forEach((p, i) =>
              expect(pos(['FootL', 'FootR'][i]).distanceTo(p)).toBeLessThan(1e-6)
            );
            pose.restore();
            expect(snapshot()).toEqual(source);
          }
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      }
    });
  for (const body of ['masculine', 'feminine'])
    it(`${body} blends ordinary duties over the same source without changing gait or restore`, () => {
      const asset = bodies.get(body)!,
        scene = clone(asset.scene);
      const mixer = new THREE.AnimationMixer(scene);
      const pose = createSeatedWorkerPose(scene);
      const objects: THREE.Object3D[] = [];
      scene.traverse((o) => objects.push(o));
      const snapshot = () =>
        objects.flatMap((o) => [
          ...o.position.toArray(),
          ...o.quaternion.toArray(),
          ...o.scale.toArray(),
        ]);
      for (const action of [
        'inspect',
        'operate',
        'sample',
        'repair',
        'supervise',
        'radio',
      ] as const) {
        mixer.stopAllAction();
        mixer
          .clipAction(
            asset.animations.find(
              (c) => c.name === 'worker-' + (action === 'operate' ? 'inspect' : action)
            )!
          )
          .play();
        mixer.setTime(0.38);
        scene.updateMatrixWorld(true);
        const source = snapshot();
        const gesture = sampleWorkerGesture(action, 2.1, createWorkerGesture());
        pose.applyWork(action, gesture);
        const full = snapshot();
        pose.restore();
        pose.applyDuty(action, gesture, 1);
        expect(snapshot()).toEqual(full);
        pose.restore();
        const feet = ['FootL', 'FootR'].map((n) =>
          scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
        );
        for (const amount of [0, 0.15, 0.5, 0.85, 1]) {
          pose.applyDuty(action, gesture, amount, true);
          feet.forEach((p, i) =>
            expect(
              scene
                .getObjectByName(['FootL', 'FootR'][i])!
                .getWorldPosition(new THREE.Vector3())
                .distanceTo(p)
            ).toBeLessThan(1e-7)
          );
          pose.restore();
          expect(snapshot()).toEqual(source);
        }
      }
      mixer.stopAllAction();
    });
});

describe('balanced stationary duty support on the real rigs', () => {
  for (const body of ['masculine', 'feminine'])
    it(`${body} plants ordinary duties without changing incoming gait or pose restore`, () => {
      const asset = bodies.get(body)!;
      for (const [height, width] of [
        [0.95, 0.94],
        [1.08, 1.07],
      ]) {
        const scene = clone(asset.scene),
          parent = new THREE.Group();
        parent.position.set(9, 0.4, -11);
        parent.rotation.y = 1.2;
        parent.scale.set(width, height, width);
        parent.add(scene);
        parent.updateMatrixWorld(true);
        const pose = createSeatedWorkerPose(
          scene,
          height,
          width,
          asset.animations.find((c) => c.name === 'worker-break')
        );
        const mixer = new THREE.AnimationMixer(scene);
        const objects: THREE.Object3D[] = [];
        const feet: THREE.SkinnedMesh[] = [];
        scene.traverse((o) => {
          objects.push(o);
          if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.parent?.name.includes('Worker_Feet'))
            feet.push(o as THREE.SkinnedMesh);
        });
        const snapshot = () =>
          objects.flatMap((o) => [
            ...o.position.toArray(),
            ...o.quaternion.toArray(),
            ...o.scale.toArray(),
          ]);
        const localFoot = (side: string) =>
          parent.worldToLocal(
            scene.getObjectByName('Foot' + side)!.getWorldPosition(new THREE.Vector3())
          );
        for (const action of [
          'inspect',
          'operate',
          'repair',
          'sample',
          'radio',
          'supervise',
        ] as const) {
          mixer.stopAllAction();
          const clip = asset.animations.find(
            (c) => c.name === 'worker-' + (action === 'operate' ? 'inspect' : action)
          )!;
          mixer.clipAction(clip).play();
          for (const phase of [0, 0.19, 0.53, 0.8]) {
            mixer.setTime(clip.duration * phase);
            parent.updateMatrixWorld(true);
            const incoming = snapshot(),
              gesture = sampleWorkerGesture(action, phase * 7, createWorkerGesture());
            pose.applyDuty(action, gesture, 1);
            const ankles = ['L', 'R'].map(localFoot);
            expect(
              Math.abs(ankles[0].z - ankles[1].z),
              `${action}/${phase} fore-aft stance`
            ).toBeLessThan(0.06);
            expect(Math.abs(ankles[0].x - ankles[1].x)).toBeGreaterThan(0.14);
            for (const side of ['L', 'R']) {
              const foot = scene.getObjectByName('Foot' + side)!;
              let sole = Infinity,
                hits = 0;
              for (const mesh of feet) {
                mesh.skeleton.update();
                const joint = mesh.skeleton.bones.indexOf(foot as THREE.Bone);
                const indices = mesh.geometry.attributes.skinIndex,
                  weights = mesh.geometry.attributes.skinWeight;
                for (let i = 0; i < indices.count; i++) {
                  let belongs = false;
                  for (let j = 0; j < 4; j++)
                    if (indices.getComponent(i, j) === joint && weights.getComponent(i, j) > 0.5)
                      belongs = true;
                  if (!belongs) continue;
                  const p = mesh
                    .getVertexPosition(i, new THREE.Vector3())
                    .applyMatrix4(mesh.matrixWorld);
                  sole = Math.min(sole, p.y - parent.position.y);
                  hits++;
                }
              }
              expect(hits).toBeGreaterThan(8);
              expect(sole, `${action}/${phase}/${side} actual skin sole`).toBeGreaterThan(-0.003);
              expect(sole, `${action}/${phase}/${side} actual skin sole`).toBeLessThan(0.003);
            }
            pose.restore();
            expect(snapshot()).toEqual(incoming);
            const incomingFeet = ['L', 'R'].map(localFoot);
            for (const amount of [0, 0.2, 0.6, 1]) {
              pose.applyDuty(action, gesture, amount, true);
              ['L', 'R'].forEach((side, i) =>
                expect(localFoot(side).distanceTo(incomingFeet[i])).toBeLessThan(1e-7)
              );
              pose.restore();
              expect(snapshot()).toEqual(incoming);
            }
          }
        }
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      }
    });
});

describe('fitted pupil contact and quiet directional attention', () => {
  for (const body of ['masculine', 'feminine'] as const) {
    it(`${body} keeps pupils within actual animated eye fronts through gaze and affine blinks`, () => {
      const scene = clone(bodies.get(body)!.scene),
        parent = new THREE.Group();
      parent.position.set(9, 0.4, -11);
      parent.rotation.y = 1.2;
      parent.scale.set(0.96, 1.08, 0.96);
      parent.add(scene);
      parent.updateMatrixWorld(true);
      const head = scene.getObjectByName('Head')!;
      let eye: THREE.SkinnedMesh | undefined;
      scene.traverse((o) => {
        if (
          (o as THREE.SkinnedMesh).isSkinnedMesh &&
          o.parent?.name.includes('Worker_Head') &&
          !Array.isArray((o as THREE.Mesh).material) &&
          ((o as THREE.Mesh).material as THREE.Material).name ===
            (body === 'masculine' ? 'Eye' : 'Brown')
        )
          eye = o as THREE.SkinnedMesh;
      });
      expect(eye).toBeDefined();
      const source = eye!.geometry,
        borrowed = Array.from(source.attributes.position.array);
      const headPoint = (index: number) =>
        eye!
          .getVertexPosition(index, new THREE.Vector3())
          .applyMatrix4(eye!.matrixWorld)
          .applyMatrix4(head.matrixWorld.clone().invert());
      const frontIndices = [new Set<number>(), new Set<number>()];
      for (let i = 0; i < source.index!.count; i += 3) {
        const ids = [source.index!.getX(i), source.index!.getX(i + 1), source.index!.getX(i + 2)];
        const [a, b, c] = ids.map(headPoint),
          n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (n.z > 0.8) for (const j of ids) frontIndices[headPoint(j).x < 0 ? 0 : 1].add(j);
      }
      expect(frontIndices.map((s) => s.size)).toEqual([4, 4]);
      const corners = frontIndices.map((set) => {
        const ids = [...set],
          origin = headPoint(ids[0]);
        const right = ids.slice(1).find((j) => {
          const p = headPoint(j).sub(origin);
          return Math.abs(p.x) > Math.abs(p.y) * 2;
        })!;
        const up = ids.slice(1).find((j) => {
          const p = headPoint(j).sub(origin);
          return Math.abs(p.y) > Math.abs(p.x) * 2;
        })!;
        return [ids[0], right, up];
      });
      const blink = createWorkerEyeBlink(scene, body);
      expect(blink.surfaces).toHaveLength(2);
      const material = new THREE.MeshStandardMaterial();
      const pair = createWorkerAccessoryPair('eye-pupils', material, blink.surfaces, body);
      const neighbour = createWorkerAccessoryPair('eye-pupils', material, blink.surfaces, body);
      const original = Array.from(pair.instanceMatrix.array),
        other = Array.from(neighbour.instanceMatrix.array);
      const mount = new THREE.Group();
      mount.position.fromArray(WORKER_EYE_CENTRES[body]);
      head.add(mount);
      mount.add(pair);
      const mixer = new THREE.AnimationMixer(scene),
        matrix = new THREE.Matrix4(),
        point = new THREE.Vector3();
      const closureBounds: Record<string, { minV: number; maxV: number }> = {};
      let minimumU = 1,
        maximumU = 0,
        minimumV = 1,
        maximumV = 0,
        minBack = 0,
        maxFront = 0,
        contained = true,
        maxAffineError = 0;
      for (const clipName of ['worker-idle', 'worker-walk', 'worker-sample']) {
        const clip = bodies.get(body)!.animations.find((c) => c.name === clipName)!;
        expect(clip).toBeDefined();
        mixer.stopAllAction();
        mixer.clipAction(clip).play();
        for (const phase of [0.2, 0.7]) {
          mixer.setTime(phase);
          parent.updateMatrixWorld(true);
          for (const closure of [0, 0.35, 0.499, 0.75, 1]) {
            blink.apply(closure);
            for (const [x, y] of [
              [0, 0],
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ]) {
              setWorkerPupilPose(pair, 0, x, y);
              const openMatrix = Array.from(pair.instanceMatrix.array);
              setWorkerPupilPose(pair, closure, x, y);
              pair.instanceMatrix.array.forEach((value, i) => {
                const row = i % 16,
                  scale = [1, 5, 9, 13].includes(row) ? 1 - closure * 0.92 : 1;
                maxAffineError = Math.max(maxAffineError, Math.abs(value - openMatrix[i] * scale));
              });
              parent.updateMatrixWorld(true);
              expect(pair.visible).toBe(closure < 0.5);
              for (let instance = 0; instance < 2; instance++) {
                const [a, b, c] = corners[instance].map(headPoint),
                  h = b.sub(a),
                  v = c.sub(a);
                const n = h.clone().cross(v).normalize();
                if (n.z < 0) n.negate();
                const hh = h.dot(h),
                  vv = v.dot(v),
                  hv = h.dot(v),
                  det = hh * vv - hv * hv;
                pair.getMatrixAt(instance, matrix);
                const intoHead = head.matrixWorld
                  .clone()
                  .invert()
                  .multiply(pair.matrixWorld)
                  .multiply(matrix);
                let back = Infinity,
                  front = -Infinity;
                for (let j = 0; j < pair.geometry.attributes.position.count; j++) {
                  point
                    .fromBufferAttribute(pair.geometry.attributes.position, j)
                    .applyMatrix4(matrix);
                  contained &&=
                    pair.boundingBox!.containsPoint(point) &&
                    pair.boundingSphere!.containsPoint(point);
                  point
                    .fromBufferAttribute(pair.geometry.attributes.position, j)
                    .applyMatrix4(intoHead)
                    .sub(a);
                  const ph = point.dot(h),
                    pv = point.dot(v),
                    u = (ph * vv - pv * hv) / det,
                    w = (pv * hh - ph * hv) / det;
                  if (closure < 0.5) {
                    minimumU = Math.min(minimumU, u);
                    maximumU = Math.max(maximumU, u);
                    const cb = (closureBounds[closure] ??= { minV: 1, maxV: 0 });
                    cb.minV = Math.min(cb.minV, w);
                    cb.maxV = Math.max(cb.maxV, w);
                    minimumV = Math.min(minimumV, w);
                    maximumV = Math.max(maximumV, w);
                  }
                  back = Math.min(back, point.dot(n));
                  front = Math.max(front, point.dot(n));
                }
                expect(back).toBeLessThan(0);
                expect(front).toBeGreaterThan(0);
                minBack = Math.min(minBack, back);
                maxFront = Math.max(maxFront, front);
              }
            }
          }
        }
      }
      expect(maxAffineError).toBeLessThan(1e-8);
      expect(minimumU).toBeGreaterThan(-0.0001);
      expect(maximumU).toBeLessThan(1.0001);
      expect(minimumV, JSON.stringify(closureBounds)).toBeGreaterThan(-0.0001);
      expect(maximumV).toBeLessThan(1.0001);
      expect(minBack).toBeGreaterThan(-0.002);
      expect(maxFront).toBeLessThan(0.0041);
      expect(contained).toBe(true);
      setWorkerPupilPose(pair, 0, 1, -1);
      const looking = Array.from(pair.instanceMatrix.array);
      setWorkerPupilBlink(pair, 0.35);
      setWorkerPupilBlink(pair, 0);
      expect(Array.from(pair.instanceMatrix.array)).toEqual(looking);
      setWorkerPupilPose(pair, 0, 0, 0);
      expect(Array.from(pair.instanceMatrix.array)).toEqual(original);
      expect(Array.from(neighbour.instanceMatrix.array)).toEqual(other);
      const version = pair.instanceMatrix.version;
      setWorkerPupilPose(pair, NaN, NaN, Infinity);
      expect(pair.instanceMatrix.version).toBe(version);
      expect(Array.from(source.attributes.position.array)).toEqual(borrowed);
      blink.dispose();
      expect(eye!.geometry).toBe(source);
      pair.dispose();
      neighbour.dispose();
      material.dispose();
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    });
  }

  it('leads the eased head, retains downward work attention and settles without an independent clock', () => {
    const target = createWorkerGesture(),
      head = createWorkerGesture(),
      out = createWorkerGaze();
    target.lookYaw = 0.22;
    target.lookPitch = 0.16;
    sampleWorkerGaze(target, head, 1 / 60, out);
    expect(out.horizontal).toBeGreaterThan(0);
    expect(out.vertical).toBeLessThan(0);
    const held = { ...out };
    sampleWorkerGaze(target, head, 0, out);
    expect(out).toEqual(held);
    head.lookYaw = target.lookYaw;
    head.lookPitch = target.lookPitch;
    for (let i = 0; i < 120; i++) sampleWorkerGaze(target, head, 1 / 60, out);
    expect(out.horizontal).toBeCloseTo(0.3, 6);
    expect(out.vertical).toBeCloseTo(-0.65, 6);
    target.lookYaw = head.lookYaw = 0;
    target.lookPitch = head.lookPitch = 0;
    for (let i = 0; i < 120; i++) sampleWorkerGaze(target, head, 1 / 60, out);
    expect(out).toEqual(createWorkerGaze());
    const samples = [15, 30, 60, 120].map((fps) => {
      const gaze = createWorkerGaze();
      target.lookYaw = 0.22;
      for (let i = 0; i < fps; i++) sampleWorkerGaze(target, head, 1 / fps, gaze);
      return gaze;
    });
    samples.forEach((g) => expect(g.horizontal).toBeCloseTo(samples[0].horizontal, 8));
    target.lookYaw = NaN;
    target.lookPitch = Infinity;
    sampleWorkerGaze(target, head, NaN, out);
    expect(Object.values(out).every(Number.isFinite)).toBe(true);
  });
});

describe('authored closed mouth and greeting brow contact', () => {
  for (const body of ['masculine', 'feminine'] as const) {
    for (const preserveScalp of [false, true]) {
      it(`${body} fits the full expression sweep and preserves ${preserveScalp ? 'helmet scalp' : 'civilian brows'} across real clips`, () => {
        const scene = clone(bodies.get(body)!.scene),
          parent = new THREE.Group();
        parent.position.set(-7, 0.3, 13);
        parent.rotation.y = 1.1;
        parent.scale.set(
          preserveScalp ? 1.06 : 0.96,
          preserveScalp ? 0.95 : 1.08,
          preserveScalp ? 1.06 : 0.96
        );
        parent.add(scene);
        parent.updateMatrixWorld(true);
        const head = scene.getObjectByName('Head')!;
        let skin: THREE.SkinnedMesh | undefined, brow: THREE.SkinnedMesh | undefined;
        scene.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (
            !m.isSkinnedMesh ||
            !m.parent?.name.includes('Worker_Head') ||
            Array.isArray(m.material)
          )
            return;
          if (m.material.name === 'Skin') skin = m;
          if (m.material.name === (body === 'masculine' ? 'Eyebrows' : 'DarkBrown')) brow = m;
        });
        expect(skin).toBeDefined();
        expect(brow).toBeDefined();
        const cached = brow!.geometry,
          cachedPositions = Array.from(cached.attributes.position.array);
        const fitted = retainWorkerBrows(brow!, head, preserveScalp)!;
        expect(fitted).not.toBeNull();
        brow!.geometry = fitted;
        const sourceStorage = Array.from(fitted.attributes.position.array);
        const source = Array.from({ length: fitted.attributes.position.count * 3 }, (_, i) =>
          fitted.attributes.position.getComponent(Math.floor(i / 3), i % 3)
        );
        const sourceIndices = Array.from(fitted.index!.array);
        const islands = fitted.userData.workerBrowIslands as number[][];
        expect(islands).toHaveLength(2);
        if (preserveScalp)
          expect(Array.from(fitted.index!.array)).toEqual(Array.from(cached.index!.array));
        const selected = new Set(islands.flat());
        const skinSource = skin!.geometry,
          skinPositions = Array.from(skinSource.attributes.position.array);
        const helper = createWorkerFaceExpression(scene, body, '#b08b6f');
        expect(helper.mouth).not.toBeNull();
        const neighbour = createWorkerFaceExpression(
          clone(bodies.get(body)!.scene),
          body,
          '#e0bba4'
        );
        const neighbourPositions = Array.from(neighbour.mouth!.geometry.attributes.position.array);
        expect(neighbour.mouth!.geometry).not.toBe(helper.mouth!.geometry);
        expect(neighbour.mouth!.material).not.toBe(helper.mouth!.material);
        expect(brow!.geometry).not.toBe(fitted);
        expect(Array.from(brow!.geometry.index!.array)).toEqual(sourceIndices);
        for (const name of ['normal', 'uv', 'skinIndex', 'skinWeight'])
          expect(Array.from(brow!.geometry.attributes[name].array)).toEqual(
            Array.from(fitted.attributes[name].array)
          );
        const mouth = new THREE.Mesh(helper.mouth!.geometry, helper.mouth!.material);
        head.add(mouth);
        expect(mouth.geometry.attributes.position.count).toBe(39);
        expect(mouth.material.vertexColors).toBe(true);
        expect(mouth.material.emissive.getHex()).toBe(0);
        const originalMouth = Array.from(mouth.geometry.attributes.position.array);
        const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
          hit = new THREE.Vector3();
        const inverse = new THREE.Matrix4(),
          point = new THREE.Vector3();
        const headPoint = (mesh: THREE.Mesh, index: number) =>
          mesh
            .getVertexPosition(index, new THREE.Vector3())
            .applyMatrix4(mesh.matrixWorld)
            .applyMatrix4(inverse);
        const faces: THREE.Triangle[] = [];
        const refresh = () => {
          parent.updateMatrixWorld(true);
          inverse.copy(head.matrixWorld).invert();
          faces.length = 0;
          const g = skin!.geometry;
          for (let i = 0; i < g.index!.count; i += 3) {
            const f = new THREE.Triangle(
              ...([0, 1, 2].map((c) => headPoint(skin!, g.index!.getX(i + c))) as [
                THREE.Vector3,
                THREE.Vector3,
                THREE.Vector3,
              ])
            );
            if (f.getNormal(point).z > 0.5) faces.push(f);
          }
        };
        const depth = (x: number, y: number) => {
          ray.origin.set(x, y, 0.4);
          let z = -Infinity;
          for (const f of faces)
            if (ray.intersectTriangle(f.a, f.b, f.c, false, hit)) z = Math.max(z, hit.z);
          return z;
        };
        refresh();
        const browNeutral = new Map([...selected].map((i) => [i, headPoint(brow!, i)]));
        let minimum = Infinity,
          maximum = -Infinity,
          maxBrowClearanceChange = 0,
          maxScalpDelta = 0,
          maxLift = 0,
          supportedBrowPoints = 0,
          unsupportedBrowPoints = 0,
          minArea = Infinity;
        const samples = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
          [0.5, 0.5, 0],
          [0, 0.5, 0.5],
          [0.5, 0, 0.5],
          [1 / 3, 1 / 3, 1 / 3],
        ];
        for (let step = 0; step <= 20; step++) {
          helper.apply(step / 20);
          parent.updateMatrixWorld(true);
          const g = mouth.geometry,
            p = g.attributes.position;
          for (let t = 0; t < g.index!.count; t += 3) {
            const vertices = [0, 1, 2].map((c) =>
              new THREE.Vector3().fromBufferAttribute(p, g.index!.getX(t + c))
            );
            minArea = Math.min(
              minArea,
              new THREE.Triangle(
                ...(vertices as [THREE.Vector3, THREE.Vector3, THREE.Vector3])
              ).getArea()
            );
            for (const weights of samples) {
              point.set(0, 0, 0);
              vertices.forEach((v, c) => point.addScaledVector(v, weights[c]));
              const z = depth(point.x, point.y);
              minimum = Math.min(minimum, point.z - z);
              maximum = Math.max(maximum, point.z - z);
            }
          }
          for (let i = 0; i < brow!.geometry.attributes.position.count; i++) {
            const attr = brow!.geometry.attributes.position;
            if (!selected.has(i))
              for (let axis = 0; axis < 3; axis++)
                maxScalpDelta = Math.max(
                  maxScalpDelta,
                  Math.abs(attr.getComponent(i, axis) - source[i * 3 + axis])
                );
            else {
              const before = browNeutral.get(i)!,
                after = headPoint(brow!, i);
              maxLift = Math.max(maxLift, after.y - before.y);
              const beforeDepth = depth(before.x, before.y),
                afterDepth = depth(after.x, after.y);
              if (Number.isFinite(beforeDepth)) {
                expect(Number.isFinite(afterDepth)).toBe(true);
                supportedBrowPoints++;
                maxBrowClearanceChange = Math.max(
                  maxBrowClearanceChange,
                  Math.abs(after.z - afterDepth - (before.z - beforeDepth))
                );
              } else unsupportedBrowPoints++;
              const shift = after.clone().sub(before);
              expect(Math.abs(shift.x)).toBeLessThan(0.000001);
              expect(shift.length()).toBeLessThan(0.004);
            }
          }
          for (let i = 0; i < p.count; i++) {
            point.fromBufferAttribute(p, i);
            expect(g.boundingBox!.containsPoint(point)).toBe(true);
            expect(
              g.boundingSphere!.containsPoint(point),
              JSON.stringify({
                step,
                i,
                distanceSquared: g.boundingSphere!.center.distanceToSquared(point),
                radius: g.boundingSphere!.radius,
              })
            ).toBe(true);
          }
        }
        expect(minimum).toBeGreaterThan(0.00015);
        expect(maximum).toBeLessThan(0.0015);
        expect(minArea).toBeGreaterThan(1e-10);
        expect(maxLift).toBeCloseTo(0.0025, 5);
        expect(supportedBrowPoints).toBeGreaterThan(20);
        expect(maxBrowClearanceChange).toBeLessThan(0.0015);
        expect(maxScalpDelta).toBe(0);
        const mixer = new THREE.AnimationMixer(scene);
        for (const name of ['worker-idle', 'worker-walk', 'worker-inspect']) {
          mixer.stopAllAction();
          mixer.clipAction(bodies.get(body)!.animations.find((c) => c.name === name)!).play();
          for (const phase of [0.2, 0.7]) {
            mixer.setTime(phase);
            refresh();
            for (const amount of [0, 0.5, 1]) {
              helper.apply(amount);
              parent.updateMatrixWorld(true);
              for (let i = 0; i < mouth.geometry.attributes.position.count; i++) {
                point.copy(headPoint(mouth, i));
                expect(point.z - depth(point.x, point.y)).toBeGreaterThan(0.00015);
                expect(point.z - depth(point.x, point.y)).toBeLessThan(0.0015);
              }
            }
          }
        }
        // Constant expression must follow a changed Head/Neck pose too.
        mixer.stopAllAction();
        parent.updateMatrixWorld(true);
        helper.apply(0.5);
        const attachedBefore = Array.from(mouth.geometry.attributes.position.array);
        const headRotation = head.quaternion.clone(),
          neckRotation = scene.getObjectByName('Neck')!.quaternion.clone();
        head.rotation.x += 0.16;
        head.rotation.y += 0.22;
        scene.getObjectByName('Neck')!.rotation.x -= 0.2;
        refresh();
        helper.apply(0.5);
        const attachedAfter = Array.from(mouth.geometry.attributes.position.array);
        expect(
          Math.max(...attachedAfter.map((v, i) => Math.abs(v - attachedBefore[i])))
        ).toBeGreaterThan(0.00001);
        for (let t = 0; t < mouth.geometry.index!.count; t += 3) {
          const corners = [0, 1, 2].map((c) =>
            new THREE.Vector3().fromBufferAttribute(
              mouth.geometry.attributes.position,
              mouth.geometry.index!.getX(t + c)
            )
          );
          for (const weights of samples) {
            point.set(0, 0, 0);
            corners.forEach((v, c) => point.addScaledVector(v, weights[c]));
            expect(point.z - depth(point.x, point.y)).toBeGreaterThan(0.00015);
            expect(point.z - depth(point.x, point.y)).toBeLessThan(0.0015);
          }
        }
        head.quaternion.copy(headRotation);
        scene.getObjectByName('Neck')!.quaternion.copy(neckRotation);
        parent.updateMatrixWorld(true);
        helper.apply(0);
        expect(Array.from(mouth.geometry.attributes.position.array)).toEqual(originalMouth);
        expect(Array.from(brow!.geometry.attributes.position.array)).toEqual(source);
        const version = mouth.geometry.attributes.position.version;
        helper.apply(NaN);
        helper.apply(-1);
        expect(mouth.geometry.attributes.position.version).toBe(version);
        expect(Array.from(cached.attributes.position.array)).toEqual(cachedPositions);
        expect(Array.from(skinSource.attributes.position.array)).toEqual(skinPositions);
        expect(skin!.geometry).toBe(skinSource);
        let disposals = 0;
        mouth.geometry.addEventListener('dispose', () => disposals++);
        helper.dispose();
        expect(Array.from(neighbour.mouth!.geometry.attributes.position.array)).toEqual(
          neighbourPositions
        );
        neighbour.dispose();
        expect(disposals).toBe(1);
        expect(brow!.geometry).toBe(fitted);
        expect(Array.from(fitted.attributes.position.array)).toEqual(sourceStorage);
        fitted.dispose();
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      });
    }
  }
  it('retains unknown and missing faces without creating guessed fittings', () => {
    const scene = new THREE.Group(),
      head = new THREE.Bone();
    head.name = 'Head';
    scene.add(head);
    const helper = createWorkerFaceExpression(scene, 'feminine', '#8f604c');
    expect(helper.mouth).toBeNull();
    helper.apply(1);
    helper.apply(Infinity);
    helper.dispose();
    expect(scene.children).toEqual([head]);
  });
});

it.each(['masculine', 'feminine'])(
  '%s route attention changes only the actual Head through walking and running',
  (body) => {
    const gltf = bodies.get(body)!,
      scene = clone(gltf.scene),
      mixer = new THREE.AnimationMixer(scene),
      pose = createSeatedWorkerPose(scene, 1);
    for (const clip of ['worker-walk', 'worker-run']) {
      mixer.stopAllAction();
      mixer.clipAction(gltf.animations.find((c) => c.name === clip)!).play();
      for (let frame = 0; frame < 24; frame++) {
        pose.restore();
        mixer.update(1 / 24);
        scene.updateMatrixWorld(true);
        const bones: THREE.Bone[] = [];
        scene.traverse((o) => {
          if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
        });
        const before = bones.map((b) => [
          ...b.position.toArray(),
          ...b.quaternion.toArray(),
          ...b.scale.toArray(),
        ]);
        const contacts = ['FootL', 'FootR', 'WristL', 'WristR'].map((n) =>
          scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3())
        );
        const gesture = createWorkerGesture();
        gesture.lookYaw = frame % 2 ? 0.6 : -0.6;
        pose.applyWalkingLook(gesture);
        bones.forEach((b, i) => {
          if (b.name === 'Head')
            expect(b.quaternion.toArray()).toEqual(
              new THREE.Quaternion()
                .fromArray(before[i], 3)
                .multiply(
                  new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 1, 0),
                    gesture.lookYaw * 0.35
                  )
                )
                .toArray()
            );
          else
            expect([
              ...b.position.toArray(),
              ...b.quaternion.toArray(),
              ...b.scale.toArray(),
            ]).toEqual(before[i]);
        });
        ['FootL', 'FootR', 'WristL', 'WristR'].forEach((n, i) =>
          expect(
            scene.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).distanceTo(contacts[i])
          ).toBeLessThan(1e-9)
        );
        pose.restore();
        bones.forEach((b, i) =>
          expect([
            ...b.position.toArray(),
            ...b.quaternion.toArray(),
            ...b.scale.toArray(),
          ]).toEqual(before[i])
        );
      }
    }
  }
);

function civilianClothRig(body: string) {
  const scene = clone(bodies.get(body)!.scene),
    skeletons = shareWorkerSkin(scene),
    surfaces: THREE.SkinnedMesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (
      m.isSkinnedMesh &&
      m.parent?.name === 'Worker_Body' &&
      !Array.isArray(m.material) &&
      m.material.name !== 'Skin'
    ) {
      m.geometry = softenWorkerFaceNormals(m.geometry)!;
      surfaces.push(m);
    }
  });
  return { scene, skeletons, surfaces };
}
it.each(['masculine', 'feminine'])(
  '%s civilian tailoring keeps original buffers and skin while adding supported detail in the same draw',
  (body) => {
    const { scene, surfaces } = civilianClothRig(body),
      owned: THREE.BufferGeometry[] = [];
    for (const [material, kind] of [
      ['Worker_Vest', 'collar'],
      [body === 'masculine' ? 'LightBrown' : 'White', 'shirt'],
    ] as const) {
      const mesh = surfaces.find((m) => (m.material as THREE.Material).name === material)!,
        source = mesh.geometry;
      const g = createWorkerShirtTrim(mesh, kind);
      expect(g).not.toBeNull();
      if (!g) throw Error('No fitted ' + kind);
      owned.push(g);
      const d = g.userData.workerTailoring;
      expect(d.addedTriangles).toBeGreaterThan(3);
      expect(d.addedTriangles).toBeLessThan(400);
      expect(d.maxDiscardedWeight).toBe(0);
      expect(d.attachment).toBe('source-vertex');
      expect(g.index!.array.slice(0, source.index!.count)).toEqual(source.index!.array);
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const actual = g.attributes[name];
        expect(actual.array.constructor).toBe(attribute.array.constructor);
        expect(actual.itemSize).toBe(attribute.itemSize);
        expect(actual.normalized).toBe(attribute.normalized);
        expect((actual as THREE.BufferAttribute).gpuType).toBe(
          attribute instanceof THREE.InterleavedBufferAttribute
            ? THREE.FloatType
            : attribute.gpuType
        );
        // The GLB interleaves position/UV data. mergeGeometries deinterleaves;
        // every logical component, rather than unrelated backing-buffer fields,
        // must survive in the original vertex range.
        for (let vertex = 0; vertex < attribute.count; vertex++)
          for (let component = 0; component < attribute.itemSize; component++)
            expect(actual.getComponent(vertex, component)).toBe(
              attribute.getComponent(vertex, component)
            );
      }
      expect(
        Array.from(g.attributes.color.array.slice(0, d.baseVertices * 3)).every((v) => v === 1)
      ).toBe(true);
      for (const a of Object.values(g.attributes))
        expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
      const weight = g.attributes.skinWeight;
      for (let i = d.baseVertices; i < weight.count; i++)
        expect([0, 1, 2, 3].reduce((sum, c) => sum + weight.getComponent(i, c), 0)).toBeCloseTo(
          1,
          6
        );
      const normal = g.attributes.normal;
      for (let i = d.baseVertices; i < normal.count; i++)
        expect(new THREE.Vector3().fromBufferAttribute(normal, i).length()).toBeCloseTo(1, 5);
      expect(mesh.geometry).toBe(source);
      mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
      (mesh.material as THREE.MeshStandardMaterial).vertexColors = true;
      mesh.geometry = g;
      mesh.castShadow = true;
    }
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) m.castShadow = !m.parent?.name.includes('Worker_Feet');
    });
    const lod = createWorkerBodyLod(scene);
    expect(lod).not.toBeNull();
    expect(lod!.meshes).toHaveLength(2);
    for (const mesh of lod!.meshes)
      for (const key of ['position', 'normal', 'skinIndex', 'skinWeight'])
        expect((mesh.geometry.attributes[key] as THREE.BufferAttribute).gpuType).toBe(
          THREE.FloatType
        );
    expect(lod!.meshes.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0)).toBe(
      lod!.sources.reduce((sum, m) => sum + m.geometry.attributes.position.count, 0)
    );
    lod!.dispose();
    owned.forEach((g) => g.dispose());
  }
);

for (const body of ['masculine', 'feminine'])
  for (const mode of ['walk', 'run', 'idle', 'break', 'bake', 'garden'])
    it(`${body} civilian tailoring stays against independently posed source surfaces during ${mode}`, () => {
      const { scene, surfaces } = civilianClothRig(body),
        wrapper = new THREE.Group(),
        height = body === 'masculine' ? 1.08 : 0.95;
      wrapper.position.set(4, 0.4, -6);
      wrapper.rotation.y = 0.9;
      wrapper.scale.set(0.96, height, 1.06);
      wrapper.add(scene);
      wrapper.updateMatrixWorld(true);
      const pairs = ['Worker_Vest', body === 'masculine' ? 'LightBrown' : 'White'].map(
        (name, i) => {
          const source = surfaces.find((m) => (m.material as THREE.Material).name === name)!,
            geometry = createWorkerShirtTrim(source, i === 0 ? 'collar' : 'shirt');
          expect(geometry).not.toBeNull();
          if (!geometry) throw Error('Missing real trim');
          const trim = new THREE.SkinnedMesh(geometry, source.material);
          trim.position.copy(source.position);
          trim.quaternion.copy(source.quaternion);
          trim.scale.copy(source.scale);
          trim.bindMode = source.bindMode;
          trim.bind(source.skeleton, source.bindMatrix);
          trim.bindMatrixInverse.copy(source.bindMatrixInverse);
          source.parent!.add(trim);
          return { source, trim };
        }
      );
      const mixer = new THREE.AnimationMixer(scene),
        clip = bodies
          .get(body)!
          .animations.find(
            (c) => c.name === 'worker-' + (mode === 'bake' || mode === 'garden' ? 'break' : mode)
          )!;
      mixer.clipAction(clip).play();
      const pose = createSeatedWorkerPose(scene, height),
        gesture = createWorkerGesture(),
        point = new THREE.Vector3(),
        closest = new THREE.Vector3(),
        candidate = new THREE.Vector3(),
        normal = new THREE.Vector3();
      const samples = [
        [1 / 3, 1 / 3, 1 / 3],
        [0.6, 0.2, 0.2],
        [0.2, 0.6, 0.2],
        [0.2, 0.2, 0.6],
        [0, 0.5, 0.5],
        [0.5, 0, 0.5],
        [0.5, 0.5, 0],
      ];
      let minimum = Infinity,
        maximum = 0,
        count = 0,
        worst = '';
      for (let frame = 0; frame < 8; frame++) {
        pose.restore();
        mixer.setTime(((frame + 0.23) / 8) * clip.duration);
        wrapper.updateMatrixWorld(true);
        if (mode === 'bake')
          pose.applyTask('bake', sampleWorkerGesture('bake', frame * 0.8, gesture));
        if (mode === 'garden')
          pose.applyGarden(true, sampleWorkerGesture('garden', frame * 0.8, gesture), 1 / 30, true);
        wrapper.updateMatrixWorld(true);
        for (const { source, trim } of pairs) {
          const g = source.geometry,
            vertices = Array.from({ length: g.attributes.position.count }, (_, i) =>
              source.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(source.matrixWorld)
            ),
            donors: THREE.Triangle[] = [];
          for (let i = 0; i < g.index!.count; i += 3) {
            const ids = [0, 1, 2].map((c) => g.index!.getX(i + c));
            donors.push(new THREE.Triangle(vertices[ids[0]], vertices[ids[1]], vertices[ids[2]]));
          }
          const boxes = donors.map((t) => new THREE.Box3().setFromPoints([t.a, t.b, t.c]));
          const detail = trim.geometry,
            d = detail.userData.workerTailoring,
            posed = new Map<number, THREE.Vector3>();
          for (let i = d.baseIndices; i < detail.index!.count; i += 3) {
            const ids = [0, 1, 2].map((c) => detail.index!.getX(i + c));
            for (const id of ids)
              if (!posed.has(id))
                posed.set(
                  id,
                  trim.getVertexPosition(id, new THREE.Vector3()).applyMatrix4(trim.matrixWorld)
                );
            const triangle = ids.map((id) => posed.get(id)!);
            for (const weights of samples) {
              point.set(0, 0, 0);
              triangle.forEach((p, i) => point.addScaledVector(p, weights[i]));
              let distance = Infinity,
                nearest = -1;
              for (let i = 0; i < donors.length; i++) {
                if (boxes[i].distanceToPoint(point) > distance) continue;
                donors[i].closestPointToPoint(point, candidate);
                const next = candidate.distanceTo(point);
                if (next < distance) {
                  distance = next;
                  nearest = i;
                  closest.copy(candidate);
                }
              }
              expect(nearest).toBeGreaterThanOrEqual(0);
              donors[nearest].getNormal(normal);
              const signed = point.clone().sub(closest).dot(normal);
              count++;
              maximum = Math.max(maximum, distance);
              if (signed < minimum) {
                minimum = signed;
                worst = `${body}/${mode}/frame${frame}/${d.kind}/face${(i - d.baseIndices) / 3}`;
              }
            }
          }
        }
      }
      expect(count).toBeGreaterThan(400);
      expect(minimum, `${worst}, max distance ${maximum}`).toBeGreaterThan(-0.0001);
      expect(maximum, `${body}/${mode}`).toBeLessThan(0.012);
      pose.restore();
      pairs.forEach((p) => p.trim.geometry.dispose());
    });

it.each([undefined, THREE.FloatType, THREE.IntType])(
  'distant clothing preserves mixed-layout skin values and explicit GPU type %s',
  (gpuType) => {
    const { scene } = civilianClothRig('masculine'),
      sources: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry = m.geometry.clone();
      const original = m.geometry.attributes.skinIndex;
      if (sources.length % 2 === 0) {
        const data = new Uint8Array(original.count * 6);
        for (let i = 0; i < original.count; i++)
          for (let c = 0; c < 4; c++) data[i * 6 + 1 + c] = original.getComponent(i, c);
        m.geometry.setAttribute(
          'skinIndex',
          new THREE.InterleavedBufferAttribute(
            new THREE.InterleavedBuffer(data, 6),
            4,
            1,
            original.normalized
          )
        );
      }
      Object.assign(m.geometry.attributes.skinIndex, { gpuType });
      m.castShadow = true;
      sources.push(m);
    });
    const before = sources.map((m) => m.geometry.attributes.skinIndex),
      values = before.flatMap((a) =>
        Array.from({ length: a.count * 4 }, (_, i) => a.getComponent(Math.floor(i / 4), i % 4))
      ),
      lod = createWorkerBodyLod(scene);
    expect(lod).not.toBeNull();
    expect(lod!.meshes).toHaveLength(1);
    const result = lod!.meshes[0].geometry.attributes.skinIndex as THREE.BufferAttribute;
    expect(result.gpuType).toBe(gpuType ?? THREE.FloatType);
    expect(Array.from(result.array)).toEqual(values);
    sources.forEach((m, i) => {
      expect(m.geometry.attributes.skinIndex).toBe(before[i]);
      expect((before[i] as THREE.BufferAttribute).gpuType).toBe(gpuType);
    });
    lod!.dispose();
    sources.forEach((m) => m.geometry.dispose());
  }
);

it('keeps genuinely incompatible explicit integer/float skin uploads on their complete near bodies', () => {
  const { scene } = civilianClothRig('masculine'),
    geometry: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.geometry = m.geometry.clone();
    Object.assign(m.geometry.attributes.skinIndex, {
      gpuType: geometry.length === 0 ? THREE.IntType : THREE.FloatType,
    });
    geometry.push(m.geometry);
    m.castShadow = true;
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(createWorkerBodyLod(scene)).toBeNull();
    expect(error.mock.calls.flat().join(' ')).toContain('gpuType must be consistent');
    expect(scene.getObjectByName('worker-distant-body')).toBeUndefined();
  } finally {
    error.mockRestore();
    geometry.forEach((g) => g.dispose());
  }
});

it.each(['masculine', 'feminine'])(
  '%s actual arm finish reduces tube seams while retaining hands, skin, poses and distant normals',
  (body) => {
    const scene = clone(bodies.get(body)!.scene),
      skeletons = shareWorkerSkin(scene),
      wrapper = new THREE.Group();
    wrapper.position.set(5, 0.3, -4);
    wrapper.rotation.y = 0.7;
    wrapper.scale.set(0.96, 1.07, 1.02);
    wrapper.add(scene);
    wrapper.updateMatrixWorld(true);
    let skin: THREE.SkinnedMesh | undefined;
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (
        m.isSkinnedMesh &&
        m.parent?.name === 'Worker_Body' &&
        !Array.isArray(m.material) &&
        m.material.name === 'Skin'
      )
        skin = m;
    });
    const mesh = skin!,
      source = mesh.geometry,
      sourceNormals = source.attributes.normal.array.slice(),
      joints = source.attributes.skinIndex,
      weights = source.attributes.skinWeight,
      armJoints = mesh.skeleton.bones.flatMap((b, i) =>
        /^(UpperArm|LowerArm)[LR]$/.test(b.name) ? [i] : []
      ),
      old = softenWorkerFaceNormals(source)!,
      finished = softenWorkerFaceNormals(source, armJoints)!;
    expect(armJoints).toHaveLength(4);
    for (const name of Object.keys(source.attributes).filter((n) => n !== 'normal'))
      expect(finished.attributes[name].array).toEqual(source.attributes[name].array);
    expect(finished.index!.array).toEqual(source.index!.array);
    const armWeight = (i: number) =>
        [0, 1, 2, 3].reduce(
          (sum, c) =>
            sum + (armJoints.includes(joints.getComponent(i, c)) ? weights.getComponent(i, c) : 0),
          0
        ),
      groups = new Map<string, number[]>(),
      a = new THREE.Vector3(),
      b = new THREE.Vector3();
    let changed = 0,
      hands = 0,
      fingers = 0,
      before = 0,
      after = 0,
      edges = 0;
    for (let i = 0; i < source.attributes.position.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(finished.attributes.normal, i);
      expect(n.length()).toBeCloseTo(1, 5);
      const delta = n.distanceTo(a.fromBufferAttribute(old.attributes.normal, i));
      if (armWeight(i) <= 0.25) {
        expect(delta).toBeLessThan(1e-7);
        hands++;
      }
      const fingerWeight = [0, 1, 2, 3].reduce(
        (sum, c) =>
          sum +
          (/Thumb|Index|Middle|Ring|Pinky/.test(
            mesh.skeleton.bones[joints.getComponent(i, c)]?.name ?? ''
          )
            ? weights.getComponent(i, c)
            : 0),
        0
      );
      if (fingerWeight > 0.1) {
        expect(delta).toBeLessThan(1e-7);
        fingers++;
      }
      if (delta > 1e-4) changed++;
      if (armWeight(i) < 0.85) continue;
      const key = [0, 1, 2]
        .map((c) => Math.round(source.attributes.position.getComponent(i, c) * 1e5))
        .join(',');
      const group = groups.get(key);
      if (group) group.push(i);
      else groups.set(key, [i]);
    }
    for (const group of groups.values())
      for (const i of group)
        for (const j of group) {
          if (i >= j) continue;
          const dot = a
            .fromBufferAttribute(source.attributes.normal, i)
            .dot(b.fromBufferAttribute(source.attributes.normal, j));
          if (dot < Math.cos((68 * Math.PI) / 180) || dot > 0.999) continue;
          before += a
            .fromBufferAttribute(old.attributes.normal, i)
            .angleTo(b.fromBufferAttribute(old.attributes.normal, j));
          after += a
            .fromBufferAttribute(finished.attributes.normal, i)
            .angleTo(b.fromBufferAttribute(finished.attributes.normal, j));
          edges++;
        }
    expect(changed).toBeGreaterThan(200);
    expect(hands).toBeGreaterThan(3000);
    expect(fingers).toBeGreaterThan(3500);
    expect(edges).toBeGreaterThan(100);
    expect(after, JSON.stringify({ body, before, after, edges, changed, hands })).toBeLessThan(
      before * 0.55
    );
    mesh.geometry = finished;
    scene.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) m.castShadow = !m.parent?.name.includes('Worker_Feet');
    });
    const lod = createWorkerBodyLod(scene);
    expect(lod).not.toBeNull();
    expect(lod!.meshes).toHaveLength(2);
    const far = lod!.meshes.find((m) => m.castShadow)!;
    let offset = 0;
    for (const m of lod!.sources.filter((m) => m.castShadow)) {
      if (m === mesh) break;
      offset += m.geometry.attributes.position.count;
    }
    for (let i = 0; i < finished.attributes.normal.count; i++)
      for (let c = 0; c < 3; c++)
        expect(far.geometry.attributes.normal.getComponent(offset + i, c)).toBe(
          finished.attributes.normal.getComponent(i, c)
        );
    const control = new THREE.SkinnedMesh(source, mesh.material);
    control.position.copy(mesh.position);
    control.quaternion.copy(mesh.quaternion);
    control.scale.copy(mesh.scale);
    control.bindMode = mesh.bindMode;
    control.bind(mesh.skeleton, mesh.bindMatrix);
    control.bindMatrixInverse.copy(mesh.bindMatrixInverse);
    mesh.parent!.add(control);
    const mixer = new THREE.AnimationMixer(scene),
      pose = createSeatedWorkerPose(scene, 1.07),
      gesture = createWorkerGesture();
    let samples = 0,
      movement = 0;
    const first = new THREE.Vector3();
    for (const mode of ['walk', 'run', 'idle', 'break', 'bake', 'garden']) {
      mixer.stopAllAction();
      const clip = bodies
        .get(body)!
        .animations.find(
          (c) => c.name === 'worker-' + (['bake', 'garden'].includes(mode) ? 'break' : mode)
        )!;
      mixer.clipAction(clip).play();
      for (let frame = 0; frame < 6; frame++) {
        pose.restore();
        mixer.setTime(((frame + 0.2) / 6) * clip.duration);
        wrapper.updateMatrixWorld(true);
        if (mode === 'bake')
          pose.applyTask('bake', sampleWorkerGesture('bake', frame * 0.6, gesture));
        if (mode === 'garden')
          pose.applyGarden(true, sampleWorkerGesture('garden', frame * 0.6, gesture), 1 / 30, true);
        wrapper.updateMatrixWorld(true);
        for (let i = 0; i < finished.attributes.position.count; i += 11) {
          mesh.getVertexPosition(i, a).applyMatrix4(mesh.matrixWorld);
          control.getVertexPosition(i, b).applyMatrix4(control.matrixWorld);
          expect(a.distanceTo(b)).toBeLessThan(1e-9);
          far.getVertexPosition(offset + i, b).applyMatrix4(far.matrixWorld);
          expect(a.distanceTo(b)).toBeLessThan(1e-6);
          samples++;
          if (i === 0) {
            if (!movement && samples === 1) first.copy(a);
            else movement = Math.max(movement, a.distanceTo(first));
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(10000);
    expect(movement).toBeGreaterThan(0.01);
    expect(mesh.geometry).toBe(finished);
    expect(source.attributes.normal).not.toBe(finished.attributes.normal);
    expect(source.attributes.normal.array).toEqual(sourceNormals);
    pose.restore();
    mixer.stopAllAction();
    mixer.uncacheRoot(scene);
    control.removeFromParent();
    lod!.dispose();
    old.dispose();
    finished.dispose();
    skeletons.forEach((s) => s.dispose());
  }
);
