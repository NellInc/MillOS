import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useFrame, type ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';

/**
 * Distance level of detail, and the one switch that turns all of it off.
 *
 * Every LOD in the scene goes through this module: `DistanceLod` for an object
 * that swaps as a whole (the grain field, the shop kits, the scarecrow), and
 * `useInstanceDistanceLod` for an `InstancedMesh` whose instances are spread
 * over the site (park trunks, spout flanges), where each instance chooses its
 * own level. `perfDebug.disableDistanceLod` (benchmark alias `lod`) forces
 * every one of them to its nearest level in the same page load, which is the
 * paired control a frame-time or pixel comparison needs: CLAUDE.md, "one page
 * load, one variable".
 */
export const DISTANCE_LOD = { enabled: true };

/** Mount once in the scene; mirrors the perf-debug flag into module state. */
export function DistanceLodIsolation() {
  const disabled = useGraphicsStore((state) => state.graphics.perfDebug.disableDistanceLod);
  useEffect(() => {
    DISTANCE_LOD.enabled = !disabled;
  }, [disabled]);
  // Module state outlives this component; an unmount must not leave every LOD
  // pinned to full detail.
  useEffect(
    () => () => {
      DISTANCE_LOD.enabled = true;
    },
    []
  );
  return null;
}

/**
 * A `THREE.LOD` that honours `DISTANCE_LOD`. three's renderer calls `update`
 * itself while projecting the scene (`autoUpdate`), so no per-frame hook is
 * registered; disabled, level 0 shows.
 */
export class SwitchableLOD extends THREE.LOD {
  override update(camera: THREE.Camera) {
    if (DISTANCE_LOD.enabled) {
      super.update(camera);
      return;
    }
    const levels = this.levels;
    for (let i = 0; i < levels.length; i++) levels[i].object.visible = i === 0;
  }
}

type DistanceLodProps = Omit<ThreeElements['group'], 'ref' | 'children'> & {
  /** One distance per child, ascending, the first 0. */
  distances: readonly number[];
  /** Fraction of a level's distance it holds for on the way back in. */
  hysteresis?: number;
  children: React.ReactNode;
};

/** A `SwitchableLOD` with one child per level, in the order given. */
export const DistanceLod = forwardRef<THREE.LOD, DistanceLodProps>(
  ({ distances, hysteresis = 0, children, ...props }, ref) => {
    const lod = useMemo(() => new SwitchableLOD(), []);
    useImperativeHandle(ref, () => lod, [lod]);
    useLayoutEffect(() => {
      lod.levels.length = 0;
      lod.children.forEach((object, index) =>
        lod.levels.push({ object, distance: distances[index] ?? 0, hysteresis })
      );
    });
    return (
      <primitive object={lod} {...props}>
        {children}
      </primitive>
    );
  }
);
DistanceLod.displayName = 'DistanceLod';

export interface InstancePartition {
  nearCount: number;
  farCount: number;
  changed: boolean;
}

/**
 * Assigns every instance a level from its distance to the camera. Pure, so it
 * is unit-tested directly. An instance goes far at `distance` and comes back
 * near only inside `distance * (1 - hysteresis)`. Disabled, all are near.
 * `far` holds the previous levels and is updated in place; `nearOut` and
 * `farOut` receive instance indices in ascending order.
 */
export function partitionInstances(
  positions: Float32Array,
  camera: { readonly x: number; readonly y: number; readonly z: number },
  far: Uint8Array,
  distance: number,
  hysteresis: number,
  enabled: boolean,
  nearOut: Uint32Array,
  farOut: Uint32Array
): InstancePartition {
  const goFar = distance * distance;
  const comeBack = (distance * (1 - hysteresis)) ** 2;
  let nearCount = 0,
    farCount = 0,
    changed = false;
  for (let i = 0; i < far.length; i++) {
    const dx = positions[i * 3] - camera.x,
      dy = positions[i * 3 + 1] - camera.y,
      dz = positions[i * 3 + 2] - camera.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const next = enabled && (far[i] ? d2 >= comeBack : d2 >= goFar) ? 1 : 0;
    if (next !== far[i]) {
      far[i] = next;
      changed = true;
    }
    if (next) farOut[farCount++] = i;
    else nearOut[nearCount++] = i;
  }
  return { nearCount, farCount, changed };
}

const _camera = new THREE.Vector3();
const _position = new THREE.Vector3();

/**
 * Per-instance LOD for instanced meshes that share one set of instance
 * matrices. `near` meshes start owning every instance (their owner writes all
 * of `matrices`, as before); this hook repacks the near set and the `far`
 * meshes whenever an instance changes level. Instance colours are not carried,
 * so meshes with `instanceColor` are not supported. Parents must be static:
 * world positions are read once per `matrices` identity.
 */
export function useInstanceDistanceLod(options: {
  near: readonly React.RefObject<THREE.InstancedMesh | null>[];
  far: readonly React.RefObject<THREE.InstancedMesh | null>[];
  matrices: readonly THREE.Matrix4[];
  distance: number;
  hysteresis: number;
}) {
  const { near, far, matrices, distance, hysteresis } = options;
  const state = useRef<{
    positions: Float32Array;
    levels: Uint8Array;
    nearOut: Uint32Array;
    farOut: Uint32Array;
    located: boolean;
    dirty: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const count = matrices.length;
    state.current = {
      positions: new Float32Array(count * 3),
      levels: new Uint8Array(count),
      nearOut: new Uint32Array(count),
      farOut: new Uint32Array(count),
      located: false,
      dirty: true,
    };
    // A fresh far mesh holds `count` zero matrices; it must draw none of them
    // before the first partition.
    for (const ref of far) if (ref.current) ref.current.count = 0;
    for (const ref of near) if (ref.current) ref.current.count = count;
  }, [matrices, near, far]);

  useFrame(({ camera }) => {
    const s = state.current;
    const anchor = near[0]?.current;
    if (!s || !anchor || matrices.length === 0) return;
    if (!s.located) {
      anchor.updateWorldMatrix(true, false);
      for (let i = 0; i < matrices.length; i++) {
        _position.setFromMatrixPosition(matrices[i]).applyMatrix4(anchor.matrixWorld);
        s.positions[i * 3] = _position.x;
        s.positions[i * 3 + 1] = _position.y;
        s.positions[i * 3 + 2] = _position.z;
      }
      s.located = true;
    }
    camera.getWorldPosition(_camera);
    const result = partitionInstances(
      s.positions,
      _camera,
      s.levels,
      distance,
      hysteresis,
      DISTANCE_LOD.enabled,
      s.nearOut,
      s.farOut
    );
    if (!result.changed && !s.dirty) return;
    s.dirty = false;
    const write = (
      refs: readonly React.RefObject<THREE.InstancedMesh | null>[],
      indices: Uint32Array,
      count: number
    ) => {
      for (const ref of refs) {
        const mesh = ref.current;
        if (!mesh) continue;
        for (let k = 0; k < count; k++) mesh.setMatrixAt(k, matrices[indices[k]]);
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    };
    write(near, s.nearOut, result.nearCount);
    write(far, s.farOut, result.farCount);
  });
}
