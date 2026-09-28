// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createSeatedWorkerPose, createWorkerGesture, sampleWorkerGesture } from './workerPose';
import { COMMUNITY_ANCHORS } from '../../constants/communityLayout';
import { getWorkerAppearance } from './workerTypes';

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
          expect(maximum - minimum).toBeGreaterThan(task === 'garden' ? 0.07 : 0.035);
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
