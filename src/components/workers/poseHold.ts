import * as THREE from 'three';
import type { WorkerMotionState } from './workerTypes';

/**
 * Held transforms for a person standing still.
 *
 * three recomposes every object's local matrix and multiplies its world matrix
 * on every frame (`Object3D.updateMatrixWorld`), whether or not anything moved.
 * A person who is not walking has `motion.enabled` false, and WorkerModel then
 * leaves every bone where it was, yet their skeleton, garments and props, about
 * a hundred objects each, were still recomputed every frame. The four people
 * added on 2026-11-07 took that cost far enough to hold the CI runner's strict
 * startup window over its 34 ms frame budget.
 *
 * WorkerModel says, each frame, whether it left the pose untouched
 * (`notePoseSettled`) or is about to write it (`resumePose`). The parent that
 * places the person holds the subtree (`holdPose`) only after a settled frame
 * with its own root where it was, so the held world matrices are exactly the
 * last drawn ones. `resumePose`, a moved root or an unmount releases the hold
 * before the next draw.
 *
 * Working if a held person draws identically and costs no matrix work, and no
 * pose or root change ever draws with a held matrix.
 *
 * The state lives here, never on the motion object, which the replay and the
 * physical save capture whole.
 */
const settled = new WeakSet<WorkerMotionState>();
const held = new WeakMap<WorkerMotionState, { root: THREE.Object3D; nodes: THREE.Object3D[] }>();
/** A held root's self-placed subtrees: all that the shield still updates. */
const heldRoots = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

/** WorkerModel left every bone where it was this frame. */
export function notePoseSettled(motion: WorkerMotionState): void {
  settled.add(motion);
}

/** WorkerModel is about to write the pose, or re-rendered: release any hold. */
export function resumePose(motion: WorkerMotionState): void {
  settled.delete(motion);
  releaseHeldPose(motion);
}

export const isPoseSettled = (motion: WorkerMotionState): boolean => settled.has(motion);
export const isPoseHeld = (motion: WorkerMotionState): boolean => held.has(motion);

/**
 * `userData` key for an object that places itself every frame or mounts on its
 * own (a pager on the hip, a cane in the hand, turning wheels, a label that
 * turns to the camera). Its subtree is never held and is still updated under a
 * held parent, from that parent's exact world matrix.
 */
export const SELF_PLACED = 'poseHoldSelfPlaced';

/**
 * Stop three recomposing this subtree. Objects that already manage their own
 * matrix (`matrixAutoUpdate` false) are left alone and stay that way, and so is
 * every `SELF_PLACED` subtree.
 */
export function holdPose(motion: WorkerMotionState, root: THREE.Object3D): void {
  if (held.has(motion)) return;
  const nodes: THREE.Object3D[] = [];
  const selfPlaced: THREE.Object3D[] = [];
  const visit = (node: THREE.Object3D): void => {
    if (node.userData[SELF_PLACED] === true) {
      selfPlaced.push(node);
      return;
    }
    if (node.matrixAutoUpdate) {
      node.matrixAutoUpdate = false;
      nodes.push(node);
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  held.set(motion, { root, nodes });
  heldRoots.set(root, selfPlaced);
}

/**
 * Stop three's `force` above the held people. Every auto-updating ancestor,
 * the scene included, recomposes each frame and passes `force` to its whole
 * subtree, so a held body would still have every world matrix multiplied.
 * Installed on a container that never moves (`world-personnel`): a held
 * child is not walked at all, only its self-placed subtrees are updated, unless
 * the container's own world matrix changed, when every child is forced exactly
 * as three would. Nothing else can change inside a held body: WorkerModel
 * releases before it poses and after every commit. Returns the uninstall.
 */
export function shieldHeldChildren(container: THREE.Object3D): () => void {
  const drawn = new THREE.Matrix4();
  let first = true;
  container.updateMatrixWorld = function updateMatrixWorld(this: THREE.Object3D, force = false) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate) {
        if (this.parent === null) this.matrixWorld.copy(this.matrix);
        else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
    }
    const moved = first || !this.matrixWorld.equals(drawn);
    first = false;
    if (moved) drawn.copy(this.matrixWorld);
    for (const child of this.children) {
      const props = moved ? undefined : heldRoots.get(child);
      if (props) for (const prop of props) prop.updateMatrixWorld(false);
      else child.updateMatrixWorld(moved || (force && child.matrixAutoUpdate));
    }
  };
  return () => {
    Reflect.deleteProperty(container, 'updateMatrixWorld');
  };
}

/** A root's x, y, z, yaw, scale and visibility as last placed; NaN until then. */
export const createHeldRootRecord = (): Float64Array => new Float64Array(6).fill(Number.NaN);

/**
 * The parent's per-frame decision, after it has placed the root. Hold only
 * when `eligible`, the motion is disabled, WorkerModel left the last frame's
 * pose alone, and the root is exactly where it was placed last frame (`last`,
 * which this updates); otherwise release. Returns whether the person is held.
 */
export function placeHeldPose(
  motion: WorkerMotionState,
  root: THREE.Object3D,
  last: Float64Array,
  eligible: boolean
): boolean {
  const still =
    last[0] === root.position.x &&
    last[1] === root.position.y &&
    last[2] === root.position.z &&
    last[3] === root.rotation.y &&
    last[4] === root.scale.x &&
    last[5] === Number(root.visible);
  last[0] = root.position.x;
  last[1] = root.position.y;
  last[2] = root.position.z;
  last[3] = root.rotation.y;
  last[4] = root.scale.x;
  last[5] = Number(root.visible);
  if (eligible && still && !motion.enabled && settled.has(motion)) {
    holdPose(motion, root);
    return true;
  }
  releaseHeldPose(motion);
  return false;
}

/** Hand the held objects back to three's per-frame update. */
export function releaseHeldPose(motion: WorkerMotionState): void {
  const entry = held.get(motion);
  if (!entry) return;
  held.delete(motion);
  heldRoots.delete(entry.root);
  for (const node of entry.nodes) node.matrixAutoUpdate = true;
}
