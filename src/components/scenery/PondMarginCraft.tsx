import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { createLakeReedLeaf, createLakeShoreStone } from '../exterior/lakeShoreDetails';
import { MineralFinish } from './MineralFinish';

export const POND_MARGIN_ANGLES = [0.72, 2.65, 4.48] as const;
export const POND_FROG_REST_Y = 0.29;

const PLANT_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'pond-crevice-planting',
  vertexColors: true,
  roughness: 0.91,
  side: THREE.DoubleSide,
});
const MINERAL_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'pond-mossed-minerals',
  vertexColors: true,
  roughness: 0.97,
});

/** Three broken pockets, confined to the existing coping rather than a new
 * ring over the paths. The decorative pond's retained flat
 * kerb supplies support; the village brick pond remains clean. No new terrain/water/depth layer.
 */
export function createPondMarginDetails(
  radius: number,
  support: (x: number, z: number) => number | undefined,
  minerals = true
) {
  const plants = new PlotGeometry(),
    stones = new PlotGeometry();
  const roots: THREE.Vector3[] = [],
    seats: THREE.Vector3[] = [];
  POND_MARGIN_ANGLES.forEach((angle, pocket) => {
    for (let clump = 0; clump < 4; clump++) {
      const a = angle + (clump - 1.5) * 0.038;
      const r = radius + Math.sin(clump + pocket) * 0.045;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        y = support(x, z);
      if (y === undefined) continue;
      const root = new THREE.Vector3(x, y - 0.006, z);
      roots.push(root);
      for (let leaf = 0; leaf < 6; leaf++) {
        const height = (clump === 0 ? 0.32 : 0.12) + ((leaf + pocket + clump) % 4) * 0.035;
        const geometry = createLakeReedLeaf(
          root,
          leaf * 2.399 + pocket,
          height,
          0.08 + (leaf % 3) * 0.035
        );
        plants.add(geometry, ['#526c41', '#71804a', '#426247'][(leaf + clump) % 3]);
      }
      if (clump === 2) {
        const top = root.clone().add(new THREE.Vector3(0.025, 0.21, 0));
        plants.add(
          new THREE.CylinderGeometry(0.003, 0.004, 0.21, 5).translate(x + 0.025, root.y + 0.105, z),
          '#65744b'
        );
        for (let petal = 0; petal < 5; petal++) {
          const a = (petal * Math.PI * 2) / 5;
          plants.add(
            new THREE.SphereGeometry(1, 6, 4)
              .scale(0.018, 0.007, 0.03)
              .rotateY(a)
              .translate(top.x + Math.sin(a) * 0.023, top.y, top.z + Math.cos(a) * 0.023),
            pocket % 2 ? '#b7b8b0' : '#d1c9a3'
          );
        }
      }
    }
    if (!minerals) return;
    for (let index = 0; index < 5; index++) {
      const a = angle + (index - 2) * 0.05,
        r = radius - 0.1;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        y = support(x, z);
      if (y === undefined) continue;
      const seat = new THREE.Vector3(x, y, z);
      seats.push(seat);
      const rock = createLakeShoreStone(
        index < 2 ? 0.14 : 0.065,
        index < 2 ? 0.12 : 0.055,
        pocket + index
      )
        .scale(1, index < 2 ? 0.6 : 0.3, 1)
        .rotateY(index + pocket);
      const p = rock.getAttribute('position');
      let lift = -Infinity;
      for (let i = 0; i < p.count; i++) {
        const ground = support(x + p.getX(i), z + p.getZ(i));
        if (ground !== undefined) lift = Math.max(lift, ground - p.getY(i));
      }
      rock.translate(x, (Number.isFinite(lift) ? lift : y) - 0.008, z);
      stones.add(rock, ['#858474', '#7a8174', '#96917f'][(index + pocket) % 3]);
      const colors = rock.getAttribute('color'),
        normals = rock.getAttribute('normal');
      const c = new THREE.Color(),
        moss = new THREE.Color('#526244');
      for (let i = 0; i < p.count; i++) {
        const patch =
          THREE.MathUtils.smoothstep(
            Math.sin(p.getX(i) * 17 + p.getZ(i) * 23 + pocket),
            0.15,
            0.85
          ) * Math.max(0, normals.getY(i));
        c.fromBufferAttribute(colors, i).lerp(moss, patch * 0.72);
        colors.setXYZ(i, c.r, c.g, c.b);
      }
    }
  });
  const finish = (build: PlotGeometry) => {
    if (build.parts.length) return build.finish();
    const empty = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color'])
      empty.setAttribute(name, new THREE.Float32BufferAttribute([], 3));
    empty.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
    empty.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    return empty;
  };
  return { plants: finish(plants), stones: finish(stones), roots, seats };
}

export function PondMarginCraft({ radius }: { radius: number }) {
  const details = useMemo(() => createPondMarginDetails(radius, () => 0.08), [radius]);
  useEffect(
    () => () => {
      details.plants.dispose();
      details.stones.dispose();
    },
    [details]
  );
  return (
    <group name="pond-margin-craft" dispose={null}>
      <mesh geometry={details.plants} material={PLANT_MATERIAL} receiveShadow />
      <mesh geometry={details.stones} receiveShadow castShadow>
        <MineralFinish base={MINERAL_MATERIAL} kind="limestone" />
      </mesh>
    </group>
  );
}

/** Infrequent, smooth in-place hop. Coordinates are LOCAL to the placed frog.
 * The owning creature's admitted active phase holds pause/hidden/reduced motion.
 */
export function samplePondFrogPose(
  time: number,
  offset: number,
  target: { y: number; pitch: number }
) {
  const cycle = (((time + offset * 3) % 36) + 36) % 36;
  const lift = cycle < 1.2 ? Math.sin((cycle / 1.2) * Math.PI) ** 2 : 0;
  target.y = lift * 0.16;
  target.pitch = lift === 0 ? 0 : -lift * 0.16;
  return target;
}

/** Existing creature admission pattern, interpolated per rendered frame rather
 * than quantised world-minute ticks. Never catches up a hidden/pause interval.
 */
export function advancePondFrogTime(
  time: number,
  delta: number,
  speed: number,
  visible: boolean,
  reduced: boolean
) {
  return visible && !reduced && speed > 0 ? time + (Math.min(delta, 0.1) * speed) / 30 : time;
}

/** Explicit pet feedback returns to the held idle phase even while paused. */
export function updatePondFrogMotion(
  phase: number,
  offset: number,
  delta: number,
  excited: boolean,
  paused: boolean,
  target: { y: number; pitch: number; petPhase: number; wasExcited: boolean }
) {
  if (excited) {
    target.petPhase += Math.min(delta, 0.1) * 30;
    target.y = Math.abs(Math.sin(target.petPhase)) * 0.1;
    target.pitch = 0;
  } else if (!paused || target.wasExcited) {
    samplePondFrogPose(phase, offset, target);
  }
  target.wasExcited = excited;
  return target;
}
