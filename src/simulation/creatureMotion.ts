import { sampleAmbientSequence, type WanderBounds } from './ambientWorld';

/** Stable timing identity; bounded rates preserve the species' authored character. */
export function creatureCadence(seed: number): number {
  return 0.88 + sampleAmbientSequence(seed, 17) * 0.24;
}

/** Heading-aware travel, with no target overshoot or backwards sliding on a turn. */
export function creatureTravelDistance(
  distanceToTarget: number,
  headingError: number,
  delta: number,
  speed: number
): number {
  return Math.min(
    Math.max(0, distanceToTarget),
    Math.max(0, speed * delta) * Math.max(0, Math.cos(headingError))
  );
}

/** Consume only the travel this driver applied, never an external teleport/reset. */
export function advanceCreatureStride(
  phase: number,
  distance: number,
  radiansPerMetre: number
): number {
  return (phase + Math.max(0, distance) * radiansPerMetre) % (Math.PI * 2);
}

/** Model metres per cycle. The farm driver divides world travel by instance scale. */
export const QUADRUPED_WALK = {
  cow: { cycle: 0.55, lift: 0.065, speed: 0.5 },
  pig: { cycle: 0.18, lift: 0.022, speed: 0.34 },
} as const;

export interface HoofStep {
  forward: number;
  lift: number;
}

/**
 * Four distinct footfalls: left hind, left fore, right hind, right fore.
 * During stance the hoof travels backwards by exactly the consumed model
 * distance. The short return arc has matching endpoint velocities and no
 * vertical cusp. Starts, turns and the owner's amplitude easing are not a
 * promise of world-space foot locking.
 */
export function sampleHoofStep(
  species: keyof typeof QUADRUPED_WALK,
  leg: number,
  phase: number,
  out: HoofStep
): HoofStep {
  const spec = QUADRUPED_WALK[species];
  const offset = leg < 2 ? leg * 0.5 : 0.25 + (leg - 2) * 0.5;
  const p = ((((Number.isFinite(phase) ? phase : 0) / (Math.PI * 2) + offset) % 1) + 1) % 1;
  const stance = 0.68;
  const half = (spec.cycle * stance) / 2;
  out.forward = half - spec.cycle * p;
  out.lift = 0;
  if (p > stance) {
    const u = (p - stance) / (1 - stance);
    const ease = u * u * (3 - 2 * u);
    out.forward = -half + half * 2 * ease - spec.cycle * (1 - stance) * u * (1 - u) * (1 - 2 * u);
    out.lift = spec.lift * Math.sin(u * Math.PI) ** 2;
  }
  return out;
}

/** Match the authored 15 Hz blend while remaining stable across dropped frames. */
export function creaturePoseBlend(authoredBlend: number, elapsed: number): number {
  return 1 - Math.pow(1 - authoredBlend, Math.max(0, elapsed) * 15);
}

/** Keep the entire .5m-radius generated ripple inside its measured 1.28m pool. */
export function fountainRippleScale(phase: number, poolRadius: number, ringRadius: number): number {
  return 1 + Math.max(0, Math.min(1, phase)) * (poolRadius / ringRadius - 1);
}

/** Individual forage bouts with quiet, head-up rests; never changes navigation. */
export function creatureForageWeight(time: number, seed: number): number {
  const period = 30 + sampleAmbientSequence(seed, 31) * 18;
  const phase = ((Math.max(0, time) / period + sampleAmbientSequence(seed, 32)) % 1) * period;
  const feedingEnd = period * 0.7;
  const ramp = Math.max(0, Math.min(1, phase / 2, (feedingEnd - phase) / 2));
  return ramp * ramp * (3 - 2 * ramp);
}

/** A brief look left or right, separated by long still intervals. */
export function creaturePerchLook(time: number, seed: number): number {
  const period = 15 + sampleAmbientSequence(seed, 41) * 9;
  const phase = (Math.max(0, time) + sampleAmbientSequence(seed, 42) * period) % period;
  return phase < 4
    ? Math.sin((phase / 4) * Math.PI) ** 2 * (sampleAmbientSequence(seed, 43) < 0.5 ? -0.4 : 0.4)
    : 0;
}

export interface HorseRestPose {
  breath: number;
  leftEar: number;
  rightEar: number;
  tail: number;
}

export const createHorseRestPose = (): HorseRestPose => ({
  breath: 0,
  leftEar: 0,
  rightEar: 0,
  tail: 0,
});

/** Existing owner time only: brief attention, long still dwells, no wall clock. */
export function sampleHorseRest(time: number, seed: number, out: HorseRestPose): HorseRestPose {
  out.breath = out.leftEar = out.rightEar = out.tail = 0;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const cadence = creatureCadence(identity);
  const pulse = (period: number, delay: number, duration: number) => {
    const phase = (time * cadence) % period;
    return phase > delay && phase < delay + duration
      ? Math.sin(((phase - delay) / duration) * Math.PI) ** 2
      : 0;
  };
  out.breath = Math.sin((time * cadence * Math.PI * 2) / 4.7);
  out.leftEar = pulse(12.5, 2.5 + sampleAmbientSequence(identity, 61) * 2, 0.9);
  out.rightEar = pulse(16.5, 6.5 + sampleAmbientSequence(identity, 62) * 2, 1.2);
  const tailPhase = (time * cadence) % 21;
  const tailDelay = 10 + sampleAmbientSequence(identity, 63) * 2;
  const tailProgress = (tailPhase - tailDelay) / 2.6;
  if (tailProgress > 0 && tailProgress < 1)
    out.tail = Math.sin(tailProgress * Math.PI) ** 2 * Math.sin(tailProgress * Math.PI * 2);
  return out;
}

/** Quiet dairy-herd life, sampled only from the existing owner's admitted time. */
export const createCowRestPose = createHorseRestPose;
export function sampleCowRest(time: number, seed: number, out: HorseRestPose): HorseRestPose {
  out.breath = out.leftEar = out.rightEar = out.tail = 0;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const t = time * creatureCadence(identity);
  const onset = Math.min(1, t / 0.8);
  out.breath =
    Math.sin((t * Math.PI * 2) / 5.1 + sampleAmbientSequence(identity, 81) * Math.PI * 2) *
    onset *
    onset *
    (3 - 2 * onset);
  const left = ((t % 17) - 3 - sampleAmbientSequence(identity, 82) * 3) / 1.1;
  const right = ((t % 23) - 8 - sampleAmbientSequence(identity, 83) * 3) / 1.3;
  if (left > 0 && left < 1) out.leftEar = Math.sin(left * Math.PI) ** 2;
  if (right > 0 && right < 1) out.rightEar = Math.sin(right * Math.PI) ** 2;
  const tail = ((t % 19) - 7 - sampleAmbientSequence(identity, 84) * 3) / 2.6;
  if (tail > 0 && tail < 1) out.tail = Math.sin(tail * Math.PI) ** 2 * Math.sin(tail * Math.PI * 2);
  return out;
}

export type SheepRestPose = Pick<HorseRestPose, 'breath' | 'leftEar' | 'rightEar'>;
export const createSheepRestPose = (): SheepRestPose => ({ breath: 0, leftEar: 0, rightEar: 0 });

/** Quiet flank breathing and separate ear attention, driven by admitted farm time. */
export function sampleSheepRest(time: number, seed: number, out: SheepRestPose): SheepRestPose {
  out.breath = out.leftEar = out.rightEar = 0;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const t = time * creatureCadence(identity);
  const onset = Math.min(1, t / 0.7);
  out.breath =
    Math.sin((t * Math.PI * 2) / 3.9 + sampleAmbientSequence(identity, 71) * Math.PI * 2) *
    onset *
    onset *
    (3 - 2 * onset);
  const left = ((t % 13) - 2 - sampleAmbientSequence(identity, 72) * 3) / 1.1;
  const right = ((t % 17) - 7 - sampleAmbientSequence(identity, 73) * 3) / 1.3;
  if (left > 0 && left < 1) out.leftEar = Math.sin(left * Math.PI) ** 2;
  if (right > 0 && right < 1) out.rightEar = Math.sin(right * Math.PI) ** 2;
  return out;
}

/** Short swims and long dabbling stops, always within 0.4 m of the authored anchor. */
export function duckSwimPose(time: number, seed: number) {
  const period = 44 + sampleAmbientSequence(seed, 51) * 18;
  const offset = sampleAmbientSequence(seed, 52) * period;
  const sample = (seconds: number) => {
    const phase = ((Math.max(0, seconds) + offset) % period) / period;
    const progress = Math.min(1, phase / 0.62);
    const angle = progress * progress * (3 - 2 * progress) * Math.PI * 2;
    return { x: Math.sin(angle) * 0.2, z: Math.cos(angle) * 0.2, angle, swimming: phase < 0.62 };
  };
  const start = sample(0);
  const current = sample(time);
  const progress = Math.min(1, ((Math.max(0, time) + offset) % period) / (period * 0.62));
  return {
    x: current.x - start.x,
    z: current.z - start.z,
    heading: Math.PI / 2 + current.angle,
    swimming: current.swimming,
    // Derivative of the retained circle, in metres per admitted duck-clock second.
    speed: current.swimming
      ? (0.2 * 6 * progress * (1 - progress) * Math.PI * 2) / (period * 0.62)
      : 0,
  };
}

export const createDuckWaterLife = () => ({
  look: 0,
  opacity: 0,
  scale: 0.5,
  stretch: 1,
  aft: 0.08,
});

/** Water contact follows admitted travel/bill motion, never an independent clock.
 * Working if stationary head-up birds leave no foam and each wrap is invisible.
 */
export function sampleDuckWaterLife(
  time: number,
  seed: number,
  swim: Pick<ReturnType<typeof duckSwimPose>, 'swimming' | 'speed'>,
  dabble: number,
  out: ReturnType<typeof createDuckWaterLife>
) {
  out.look = out.opacity = 0;
  out.scale = 0.5;
  out.stretch = 1;
  out.aft = 0.08;
  if (!Number.isFinite(time) || time <= 0) return out;
  const identity = Number.isFinite(seed) ? seed : 0;
  const phase = (time * 0.48 + sampleAmbientSequence(identity, 84)) % 1;
  const travel = Number.isFinite(swim.speed) ? Math.max(0, Math.min(1, swim.speed / 0.06)) : 0;
  const bill = Number.isFinite(dabble) ? Math.max(0, Math.min(1, (dabble - 0.55) / 0.35)) : 0;
  const billContact = bill * bill * (3 - 2 * bill);
  const look = swim.swimming
    ? 0
    : creaturePerchLook(time, identity + 900) * 0.45 * (1 - billContact);
  out.look = look === 0 ? 0 : look;
  out.opacity = 0.17 * Math.max(travel, billContact * 0.8) * Math.sin(phase * Math.PI) ** 2;
  out.scale = 0.5 + phase * 1.15;
  out.stretch = 1 + travel * 0.25;
  // A swim leaves stern contact; a stopped feeding bird disturbs water at its bill.
  out.aft = 0.08 + travel * 0.18 - billContact * (1 - travel) * 0.3;
  return out;
}

/** Conservative posed herd envelopes, including room for authored motion.
 * Working if real posed vertices remain inside this radius at every heading.
 */
export const PIG_CLEARANCE_RADIUS = 0.76;
export const COW_CLEARANCE_RADIUS = 1.12;
const PIG_SPACE = { radius: PIG_CLEARANCE_RADIUS, ...QUADRUPED_WALK.pig };
export const COW_SPACE = { radius: COW_CLEARANCE_RADIUS, ...QUADRUPED_WALK.cow };

export interface PigSpaceState {
  target: { x: number; y: number; z: number };
  isIdle: boolean;
  idleTime: number;
  seed: number;
  sequenceStep: number;
  stridePhase: number;
  moving: boolean;
  cadence: number;
}
interface PigSpaceRoot {
  position: { x: number; y: number; z: number };
  rotation: { y: number };
  scale: { x: number };
}
interface PigProposal {
  x: number;
  z: number;
  yaw: number;
  distance: number;
  score: number;
}
export function createPigSpaceWorkspace() {
  return {
    options: Array.from({ length: 3 }, () =>
      Array.from({ length: 13 }, (): PigProposal => ({ x: 0, z: 0, yaw: 0, distance: 0, score: 0 }))
    ),
    headings: new Float64Array(12),
    counts: new Uint8Array(3),
    chosen: new Uint8Array(3),
    best: new Uint8Array(3),
  };
}
type PigSpaceWorkspace = ReturnType<typeof createPigSpaceWorkspace>;

/** Joint swept admission: overlapping starts may separate, never deepen contact.
 * Working if crossing peers cannot tunnel and held peers are never displaced.
 */
export function pigPairClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  adx: number,
  adz: number,
  bdx: number,
  bdz: number,
  radius: number
): boolean {
  const x = ax - bx,
    z = az - bz,
    vx = adx - bdx,
    vz = adz - bdz;
  const before = x * x + z * z,
    velocity = vx * vx + vz * vz;
  const dot = x * vx + z * vz;
  if (before < radius * radius - 1e-10) return dot >= -1e-12;
  const t = velocity > 0 ? Math.max(0, Math.min(1, -dot / velocity)) : 0;
  return (x + vx * t) ** 2 + (z + vz * t) ** 2 >= radius * radius - 1e-10;
}

/** One fixed admitted herd step, with the existing pig configuration as default.
 * Working if targets stay authored, accepted travel drives feet and waiting has no stride.
 */
export function stepPigSpace(
  roots: readonly (PigSpaceRoot | null)[],
  states: readonly PigSpaceState[],
  delta: number,
  bounds: WanderBounds,
  nextPlan: (
    seed: number,
    step: number,
    bounds: WanderBounds
  ) => { x: number; z: number; idleSeconds: number },
  workspace: PigSpaceWorkspace,
  config: { radius: number; speed: number; cycle: number } = PIG_SPACE
): void {
  if (!(delta > 0)) return;
  const speed = config.speed,
    count = roots.length;
  for (let i = 0; i < count; i++) {
    const root = roots[i],
      state = states[i],
      options = workspace.options[i];
    state.moving = false;
    let candidates = 0;
    if (root && !state.isIdle) {
      const dx = state.target.x - root.position.x,
        dz = state.target.z - root.position.z,
        distance = Math.hypot(dx, dz);
      if (distance < 0.1) {
        state.isIdle = true;
        const plan = nextPlan(state.seed, state.sequenceStep++, bounds);
        state.target.x = plan.x;
        state.target.y = 0;
        state.target.z = plan.z;
        state.idleTime = plan.idleSeconds / state.cadence;
      } else {
        const heading = Math.atan2(dx, dz),
          side = state.seed % 2 ? -1 : 1,
          headings = workspace.headings;
        headings[0] = heading;
        for (let k = 0; k < 4; k++) {
          const angle = k === 0 ? 0.55 : k === 1 ? 1.1 : k === 2 ? 1.57 : 2.2;
          headings[1 + k * 2] = heading + side * angle;
          headings[2 + k * 2] = heading - side * angle;
        }
        let headingCount = 9;
        let goalPriority = state.seed;
        let contestedGoal = false;
        for (let j = 0; j < count; j++) {
          if (
            j !== i &&
            roots[j] &&
            !states[j].isIdle &&
            Math.hypot(states[j].target.x - state.target.x, states[j].target.z - state.target.z) <
              0.1
          ) {
            goalPriority = Math.min(goalPriority, states[j].seed);
            contestedGoal = true;
          }
        }
        const yieldingGoal = goalPriority < state.seed;
        // Stable seed priority clears a contested goal for one genuine arrival.
        // Working if shared destinations do not leave three peers orbiting forever.
        if (yieldingGoal) headings[headingCount++] = heading + Math.PI;
        for (let j = 0; j < count; j++) {
          const other = roots[j];
          if (!other || j === i) continue;
          const px = root.position.x - other.position.x,
            pz = root.position.z - other.position.z;
          const gap = Math.hypot(px, pz);
          if (gap < config.radius * (root.scale.x + other.scale.x) + 0.1)
            headings[headingCount++] =
              gap > 1e-9 ? Math.atan2(px, pz) : ((state.seed % 3) * Math.PI * 2) / 3;
        }
        for (let k = 0; k < headingCount; k++) {
          const desired = headings[k];
          const turn = Math.atan2(
            Math.sin(desired - root.rotation.y),
            Math.cos(desired - root.rotation.y)
          );
          const yaw = root.rotation.y + turn * (1 - Math.exp(-delta * 5));
          const travel = Math.min(distance, speed * delta) * Math.max(0, Math.cos(desired - yaw));
          const x = Math.sin(desired) * travel,
            z = Math.cos(desired) * travel;
          if (
            root.position.x + x < bounds.minX ||
            root.position.x + x > bounds.maxX ||
            root.position.z + z < bounds.minZ ||
            root.position.z + z > bounds.maxZ
          )
            continue;
          const progress = (x * dx + z * dz) / distance;
          let score = progress * (yieldingGoal ? -4 : contestedGoal ? 8 : 1) - k * 0.000001;
          for (let j = 0; j < count; j++) {
            const other = roots[j];
            if (!other || i === j) continue;
            const px = root.position.x - other.position.x,
              pz = root.position.z - other.position.z;
            const gap = Math.hypot(px, pz),
              limit = config.radius * (root.scale.x + other.scale.x);
            if (gap < 1e-9) {
              const away = ((state.seed % 3) * Math.PI * 2) / 3;
              score += (x * Math.sin(away) + z * Math.cos(away)) * 8;
            } else if (gap < limit + 0.08)
              score += ((x * px + z * pz) / gap) * (gap < limit ? 8 : 1.5);
          }
          const proposal = options[candidates++];
          proposal.x = x;
          proposal.z = z;
          proposal.yaw = yaw;
          proposal.distance = travel;
          proposal.score = score;
        }
      }
    } else if (root && state.isIdle) {
      state.idleTime -= delta;
      if (state.idleTime <= 0) state.isIdle = false;
    }
    const stop = options[candidates++];
    stop.x = stop.z = stop.distance = 0;
    stop.yaw = root?.rotation.y ?? 0;
    stop.score = -0.001;
    workspace.counts[i] = candidates;
    workspace.best[i] = candidates - 1;
    workspace.chosen[i] = 0;
  }
  let bestScore = -Infinity,
    done = false;
  // Fixed three-pig mixed-radix enumeration reuses indices and proposal storage.
  // Working if the owner can step without allocating arrays, closures or vectors.
  while (!done) {
    let clear = true,
      score = 0;
    for (let i = 0; i < count && clear; i++) {
      const root = roots[i],
        proposal = workspace.options[i][workspace.chosen[i]];
      score += proposal.score;
      if (!root) continue;
      for (let j = 0; j < i; j++) {
        const other = roots[j];
        if (!other) continue;
        const q = workspace.options[j][workspace.chosen[j]];
        if (
          !pigPairClear(
            root.position.x,
            root.position.z,
            other.position.x,
            other.position.z,
            proposal.x,
            proposal.z,
            q.x,
            q.z,
            config.radius * (root.scale.x + other.scale.x)
          )
        ) {
          clear = false;
          break;
        }
      }
    }
    if (clear && score > bestScore) {
      bestScore = score;
      for (let i = 0; i < count; i++) workspace.best[i] = workspace.chosen[i];
    }
    let digit = count - 1;
    while (digit >= 0) {
      workspace.chosen[digit]++;
      if (workspace.chosen[digit] < workspace.counts[digit]) break;
      workspace.chosen[digit] = 0;
      digit--;
    }
    done = digit < 0;
  }
  for (let i = 0; i < count; i++) {
    const root = roots[i];
    if (!root) continue;
    const p = workspace.options[i][workspace.best[i]];
    root.position.x += p.x;
    root.position.z += p.z;
    root.rotation.y = p.yaw;
    states[i].moving = p.distance > 0.00001;
    states[i].stridePhase = advanceCreatureStride(
      states[i].stridePhase,
      p.distance / root.scale.x,
      (Math.PI * 2) / config.cycle
    );
  }
}
