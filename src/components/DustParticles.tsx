import React, {
  useRef,
  useMemo,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FACTORY_BOUNDS, SIFTER_LAYOUT, SITE_LAYOUT } from '../constants/siteLayout';
import { buildFactoryRoofGlazing } from './infrastructure/OptimizedFactoryInfrastructure';
import { useGraphicsStore } from '../stores/graphicsStore';
import { selectSafetyHoldActive, useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import { shouldRunThisFrame, getThrottleLevel } from '../utils/frameThrottle';
import { useShallow } from 'zustand/react/shallow';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { createColorDataTexture } from '../utils/textureGenerator';
import {
  buildSpoutRoutes,
  spoutMachineKey,
  SPOUT_PIPE_RADIUS,
  type SpoutRoute,
} from './flow/spoutRoutes';

// ============================================================
// Shared particle sprite
// ============================================================

/**
 * One 32x32 radial-falloff sprite, shared by every point-based system here.
 *
 * Without it a `pointsMaterial` draws an opaque SQUARE: grain and steam popped
 * as hard-edged tiles against everything behind them. The soft edge is also
 * what makes the geometry-intersection seam nearly invisible without a scene
 * depth texture - a particle's contribution is already ~0 at its silhouette.
 */
let particleSpriteCache: THREE.DataTexture | null = null;

const getParticleSprite = (): THREE.DataTexture => {
  if (particleSpriteCache) return particleSpriteCache;

  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const linear = 1 - d;
      // Smoothstep the falloff so the sprite has no visible ring at any mip.
      const alpha = linear * linear * (3 - 2 * linear);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 255);
    }
  }

  const texture = createColorDataTexture(data, size, size);
  // gl_PointCoord runs 0..1 across the sprite; repeat wrapping would fold the
  // falloff back on itself at the edges.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  particleSpriteCache = texture;
  return texture;
};

// ============================================================
// Dust Animation Manager - Centralized useFrame for all particle systems
// ============================================================

interface DustParticlesEntry {
  type: 'dustParticles';
  meshRef: React.RefObject<THREE.InstancedMesh | null>;
  pool: ParticlePool;
  colorArray: Float32Array;
  colorAttr: React.RefObject<THREE.InstancedBufferAttribute | null>;
  hiddenMatrix: THREE.Matrix4;
  count: number;
  isDaytime: boolean;
  throttleLevel: number;
}

interface GrainFlowEntry {
  type: 'grainFlow';
  particlesRef: React.RefObject<THREE.Points | null>;
  routes: readonly SpoutRoute[];
  /** Normalised arc position along the assigned route, 0..1. */
  progress: Float32Array;
  /** Per-particle speed jitter so product does not travel as a rigid comb. */
  rates: Float32Array;
  /** Which route each particle rides. */
  routeIndex: Uint16Array;
  /** In-bore offset (x,y,z) keeping product inside the pipe wall. */
  jitter: Float32Array;
  count: number;
  throttleLevel: number;
  speedMultiplier: number; // Production speed multiplier
}

interface MachineSteamEntry {
  type: 'machineSteam';
  particlesRef: React.RefObject<THREE.Points | null>;
  velocities: Float32Array;
  lifetimes: Float32Array;
  lifeAttr: React.RefObject<THREE.BufferAttribute | null>;
  count: number;
  steamType: 'steam' | 'dust' | 'exhaust';
}

type DustEntry = DustParticlesEntry | GrainFlowEntry | MachineSteamEntry;

interface DustAnimationContextValue {
  register: (id: string, entry: DustEntry) => void;
  unregister: (id: string) => void;
}

const DustAnimationContext = createContext<DustAnimationContextValue | null>(null);

export const DustAnimationManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const entriesRef = useRef<Map<string, DustEntry>>(new Map());
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const prefersReducedMotion = useReducedMotion();

  const register = useCallback((id: string, entry: DustEntry) => {
    entriesRef.current.set(id, entry);
  }, []);

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  useFrame((_, delta) => {
    if (!isTabVisible) return;

    // Accessibility gate. Every system here now SEEDS itself on mount, so under
    // `prefers-reduced-motion` the fields are still rendered - they simply hold
    // still. Previously the gate left dust as an unwritten (zero-matrix, black)
    // buffer, which is why it never appeared at all.
    if (prefersReducedMotion) return;

    entriesRef.current.forEach((entry) => {
      switch (entry.type) {
        case 'dustParticles':
          if (!shouldRunThisFrame(entry.throttleLevel)) return;
          animateDustParticles(entry, true);
          break;
        case 'grainFlow':
          if (!shouldRunThisFrame(entry.throttleLevel)) return;
          animateGrainFlow(entry, delta);
          break;
        case 'machineSteam':
          if (!shouldRunThisFrame(3)) return;
          animateMachineSteam(entry, Math.min(delta * 3, 0.1));
          break;
      }
    });
  });

  const contextValue = React.useMemo(() => ({ register, unregister }), [register, unregister]);

  return (
    <DustAnimationContext.Provider value={contextValue}>{children}</DustAnimationContext.Provider>
  );
};

function useDustAnimation() {
  return useContext(DustAnimationContext);
}

// Pure animation functions

/**
 * Write every dust instance's matrix and colour.
 *
 * `advance` is false for the mount-time seed pass. three zero-fills
 * `instanceMatrix` and the colour buffer, so without a seed every mote carried
 * a degenerate zero matrix and a pure-black vertex colour until the first
 * animation tick - and never got one at all under reduced motion.
 */
function animateDustParticles(entry: DustParticlesEntry, advance: boolean) {
  if (!entry.meshRef.current) return;
  const mesh = entry.meshRef.current;
  const particles = entry.pool.particles;

  for (let i = 0; i < entry.count; i++) {
    const particle = particles[i];

    if (!particle.active) {
      mesh.setMatrixAt(i, entry.hiddenMatrix);
      continue;
    }

    // Motes advance per tick, so a throttled tick steps by the throttle factor
    // to keep the same drift and cycle rate on every quality tier.
    if (advance) {
      particle.lifetime += entry.throttleLevel;

      if (particle.lifetime > particle.maxLifetime) {
        particle.t = Math.random() * 100;
        particle.xFactor = randomMoteX();
        particle.yFactor = randomMoteYFactor();
        particle.zFactor = randomMoteZ();
        particle.lifetime = 0;
        particle.maxLifetime = 200 + Math.random() * 300;
      }
    }

    const { factor, speed, xFactor, yFactor, zFactor } = particle;
    if (advance) particle.t += speed * entry.throttleLevel;
    const t = particle.t;

    const s = Math.max(0.3, Math.cos(t) * 0.5 + 0.5);

    const x = xFactor + Math.cos((t / 10) * factor) * 2;
    let y = yFactor + Math.sin((t / 10) * factor) * 2 + MOTE_BASE_Y;
    const z = zFactor + Math.cos((t / 10) * factor) * 2;

    if (y < 1) y = MOTE_MAX_Y - 2;
    if (y > MOTE_MAX_Y) y = MOTE_BASE_Y;

    const lightIntensity = entry.isDaytime ? isInLightShaft(x, y, z) : 0;

    // Motes swell AND brighten inside a shaft. With additive blending
    // brightness IS presence, so the old +0.004/+0.047/+0.22 colour nudge made
    // the shafts effectively invisible.
    const scaleMultiplier = 1 + lightIntensity * 2.5;
    const finalScale = s * 0.8 * scaleMultiplier;

    tempPosition.set(x, y, z);
    tempScale.setScalar(finalScale);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

    mesh.setMatrixAt(i, tempMatrix);

    const gain = 0.18 + 1.9 * lightIntensity;
    entry.colorArray[i * 3] = 0.996 * gain;
    entry.colorArray[i * 3 + 1] = 0.953 * gain;
    entry.colorArray[i * 3 + 2] = 0.78 * gain;
  }

  mesh.instanceMatrix.needsUpdate = true;

  if (entry.colorAttr.current) {
    entry.colorAttr.current.needsUpdate = true;
  }
}

/** World units/sec of product travel down a spouting run at productionSpeed 1. */
const GRAIN_FLOW_SPEED = 6.0;

// Module-level scratch - no allocation inside the frame loop.
const _grainPoint = new THREE.Vector3();

function animateGrainFlow(entry: GrainFlowEntry, delta: number) {
  const points = entry.particlesRef.current;
  if (!points || entry.routes.length === 0) return;
  const posAttr = points.geometry.attributes.position as THREE.BufferAttribute;
  const posArray = posAttr.array as Float32Array;

  // The old integrator added a raw per-frame velocity with no `delta`, so grain
  // fell at a rate proportional to framerate AND inversely proportional to the
  // quality throttle - 4x slower on low than on ultra.
  const cappedDelta = Math.min(delta * entry.throttleLevel, 0.1);
  const step = cappedDelta * entry.speedMultiplier * GRAIN_FLOW_SPEED;

  for (let i = 0; i < entry.count; i++) {
    const route = entry.routes[entry.routeIndex[i] % entry.routes.length];
    let t = entry.progress[i] + (step * entry.rates[i]) / Math.max(1, route.length);
    if (t >= 1) t -= Math.floor(t);
    entry.progress[i] = t;

    route.curve.getPointAt(t, _grainPoint);

    const idx = i * 3;
    posArray[idx] = _grainPoint.x + entry.jitter[idx];
    posArray[idx + 1] = _grainPoint.y + entry.jitter[idx + 1];
    posArray[idx + 2] = _grainPoint.z + entry.jitter[idx + 2];
  }

  posAttr.needsUpdate = true;
  // Positions span the whole pipe network; recomputing per frame would cost
  // more than it saves, so the bounds are set once at seed time.
}

function animateMachineSteam(entry: MachineSteamEntry, delta: number) {
  if (!entry.particlesRef.current) return;
  const pos = entry.particlesRef.current.geometry.attributes.position.array as Float32Array;

  for (let i = 0; i < entry.count; i++) {
    entry.lifetimes[i] += delta * (entry.steamType === 'steam' ? 1.5 : 1);

    if (entry.lifetimes[i] > 1) {
      entry.lifetimes[i] = 0;
      pos[i * 3] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = Math.random() * 0.3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      entry.velocities[i * 3] = (Math.random() - 0.5) * 0.3;
      entry.velocities[i * 3 + 1] =
        entry.steamType === 'steam' ? 0.8 + Math.random() * 0.5 : 0.3 + Math.random() * 0.3;
      entry.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }

    pos[i * 3] += entry.velocities[i * 3] * delta;
    pos[i * 3 + 1] += entry.velocities[i * 3 + 1] * delta;
    pos[i * 3 + 2] += entry.velocities[i * 3 + 2] * delta;

    entry.velocities[i * 3] += (Math.random() - 0.5) * delta * 0.5;
    entry.velocities[i * 3 + 2] += (Math.random() - 0.5) * delta * 0.5;

    if (entry.steamType === 'steam') {
      entry.velocities[i * 3 + 1] *= 0.98;
    }
  }

  entry.particlesRef.current.geometry.attributes.position.needsUpdate = true;
  // `lifetimes` is bound directly as the `aLife` attribute: the shader grows and
  // fades each puff over its own life, so puffs no longer pop in at full opacity.
  if (entry.lifeAttr.current) entry.lifeAttr.current.needsUpdate = true;
}

interface DustParticlesProps {
  count: number;
}

// Particle pool for reuse
interface PooledParticle {
  t: number;
  factor: number;
  speed: number;
  xFactor: number;
  yFactor: number;
  zFactor: number;
  active: boolean;
  lifetime: number;
  maxLifetime: number;
}

// Light shafts fall from the rendered roof glazing, so a brightened mote sits
// under a real skylight. The panes are the authoritative light-path targets.
const SKYLIGHT_XZ: readonly (readonly [number, number])[] = buildFactoryRoofGlazing().map(
  ({ position }) => [position[0], position[2]] as const
);
const LIGHT_SHAFT_BASE_Y = 5;
const LIGHT_SHAFT_TOP_Y = FACTORY_BOUNDS.maxY;

// The mote field fills the hall below the roof deck. Each mote wanders up to
// 2 m about its anchor, so anchors are inset 4 m to keep the field 2 m clear of
// the walls.
const MOTE_WANDER = 2;
const MOTE_WALL_INSET = 2 + MOTE_WANDER;
const MOTE_BASE_Y = 5;
const MOTE_MAX_Y = 20;
const MOTE_MIN_X = FACTORY_BOUNDS.minX + MOTE_WALL_INSET;
const MOTE_SPAN_X = FACTORY_BOUNDS.maxX - FACTORY_BOUNDS.minX - MOTE_WALL_INSET * 2;
const MOTE_MIN_Z = FACTORY_BOUNDS.minZ + MOTE_WALL_INSET;
const MOTE_SPAN_Z = FACTORY_BOUNDS.maxZ - FACTORY_BOUNDS.minZ - MOTE_WALL_INSET * 2;
/** Anchor heights keep the mote (base + anchor + wander) at or below MOTE_MAX_Y. */
const MOTE_SPAN_Y_FACTOR = MOTE_MAX_Y - MOTE_BASE_Y - MOTE_WANDER;
const randomMoteX = (): number => MOTE_MIN_X + Math.random() * MOTE_SPAN_X;
const randomMoteYFactor = (): number => Math.random() * MOTE_SPAN_Y_FACTOR;
const randomMoteZ = (): number => MOTE_MIN_Z + Math.random() * MOTE_SPAN_Z;
/** Culling volume for the whole mote field, wander included. */
const MOTE_BOUNDING_SPHERE = new THREE.Box3(
  new THREE.Vector3(FACTORY_BOUNDS.minX, 0, FACTORY_BOUNDS.minZ),
  new THREE.Vector3(FACTORY_BOUNDS.maxX, MOTE_MAX_Y, FACTORY_BOUNDS.maxZ)
).getBoundingSphere(new THREE.Sphere());

// Cached vectors for performance
const tempPosition = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempScale = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

// Check if a position is inside a light shaft cone (optimized)
// Pre-calculates cone radius once per Y level to avoid redundant calculations
const isInLightShaft = (x: number, y: number, z: number): number => {
  // Early exit for out-of-bounds
  if (y <= LIGHT_SHAFT_BASE_Y || y >= LIGHT_SHAFT_TOP_Y) return 0;

  // Pre-calculate cone properties once per call (not per light shaft)
  const normalizedY = (y - LIGHT_SHAFT_BASE_Y) / (LIGHT_SHAFT_TOP_Y - LIGHT_SHAFT_BASE_Y);
  const coneRadius = 3 + normalizedY * 3;
  const coneRadiusSq = coneRadius * coneRadius;
  const invConeRadius = 1 / coneRadius; // Pre-compute inverse for faster division

  // Check each light shaft
  for (let i = 0; i < SKYLIGHT_XZ.length; i++) {
    const [skylightX, skylightZ] = SKYLIGHT_XZ[i];
    const dx = x - skylightX;
    const dz = z - skylightZ;
    const distanceSq = dx * dx + dz * dz;

    if (distanceSq < coneRadiusSq) {
      // Return intensity based on how centered the particle is
      // Use inverse multiplication instead of division for better performance
      return 1 - Math.sqrt(distanceSq) * invConeRadius * 0.5;
    }
  }
  return 0;
};

// Particle pool class for efficient memory management
class ParticlePool {
  particles: PooledParticle[];
  maxCount: number;
  activeCount: number;

  constructor(maxCount: number) {
    this.maxCount = maxCount;
    this.activeCount = 0;
    this.particles = [];

    // Pre-allocate all particles
    for (let i = 0; i < maxCount; i++) {
      this.particles.push(this.createParticle(false));
    }
  }

  createParticle(active = true): PooledParticle {
    return {
      t: Math.random() * 100,
      factor: 20 + Math.random() * 80,
      speed: 0.005 + Math.random() / 300,
      xFactor: randomMoteX(),
      yFactor: randomMoteYFactor(),
      zFactor: randomMoteZ(),
      active,
      lifetime: 0,
      maxLifetime: 200 + Math.random() * 300, // Particles live 200-500 frames
    };
  }

  activateParticle(index: number): void {
    if (index < this.maxCount && !this.particles[index].active) {
      const p = this.particles[index];
      p.active = true;
      p.lifetime = 0;
      p.t = Math.random() * 100;
      p.factor = 20 + Math.random() * 80;
      p.speed = 0.005 + Math.random() / 300;
      p.xFactor = randomMoteX();
      p.yFactor = randomMoteYFactor();
      p.zFactor = randomMoteZ();
      p.maxLifetime = 200 + Math.random() * 300;
      this.activeCount++;
    }
  }

  deactivateParticle(index: number): void {
    if (index < this.maxCount && this.particles[index].active) {
      this.particles[index].active = false;
      this.activeCount--;
    }
  }

  // Ensure we have the right number of active particles
  setActiveCount(count: number): void {
    count = Math.min(count, this.maxCount);

    // Activate particles if needed
    while (this.activeCount < count) {
      for (let i = 0; i < this.maxCount; i++) {
        if (!this.particles[i].active) {
          this.activateParticle(i);
          break;
        }
      }
    }

    // Deactivate particles if needed
    while (this.activeCount > count) {
      for (let i = this.maxCount - 1; i >= 0; i--) {
        if (this.particles[i].active) {
          this.deactivateParticle(i);
          break;
        }
      }
    }
  }
}

// ============================================================
// Dust mote material
// ============================================================

/** FIXED literal, never a timestamp - a changing cache key recompiles the
 *  program every frame (see CLAUDE.md, "Shader Cache Key Bug"). */
const DUST_MOTE_CACHE_KEY = 'millos-dust-mote-v1';

/**
 * Camera-facing additive mote.
 *
 * Two triangles instead of a 36-vertex dodecahedron, always facing the camera,
 * with a radial alpha falloff so it reads as an out-of-focus speck rather than
 * a polygon. `depthTest` stays ON (motes are correctly occluded by geometry);
 * `depthWrite` is off so they never occlude each other.
 */
const createDustMoteMaterial = (): THREE.MeshBasicMaterial => {
  const material = new THREE.MeshBasicMaterial({
    // White. The instance colours below are authoritative; a tint here would
    // multiply the same hue in twice.
    color: '#ffffff',
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vMoteUv;
        varying float vMoteViewZ;`
      )
      .replace(
        '#include <project_vertex>',
        `// Billboard around the instance's translation. The instance SCALE is
        // read back explicitly: it carries both the light-shaft size response
        // and the zero-scale used to hide pooled-but-inactive motes, so
        // dropping it would make every inactive particle visible.
        float moteScale = length( instanceMatrix[ 0 ].xyz );
        vec4 mvPosition = modelViewMatrix * vec4( ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz, 1.0 );
        mvPosition.xy += position.xy * moteScale;
        gl_Position = projectionMatrix * mvPosition;
        vMoteUv = uv;
        vMoteViewZ = - mvPosition.z;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vMoteUv;
        varying float vMoteViewZ;`
      )
      .replace(
        '#include <opaque_fragment>',
        `float moteFalloff = 1.0 - smoothstep( 0.16, 0.5, length( vMoteUv - 0.5 ) );
        // Near-camera ramp. This is an APPROXIMATION of a soft particle: it
        // removes the near-clip pop, but without a scene depth texture a mote
        // still terminates where it meets geometry. The radial falloff above is
        // what keeps that seam from reading as a hard edge.
        moteFalloff *= smoothstep( 0.6, 2.5, vMoteViewZ );
        diffuseColor.a *= moteFalloff;
        #include <opaque_fragment>`
      );
  };

  material.customProgramCacheKey = () => DUST_MOTE_CACHE_KEY;
  return material;
};

export const DustParticles: React.FC<DustParticlesProps> = ({ count }) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const idRef = useRef(`dustParticles-${Math.random().toString(36).slice(2, 9)}`);
  const context = useDustAnimation();
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const prefersReducedMotion = useReducedMotion();

  // PERF: Only re-render when daytime status changes, not every tick
  const isDaytime = useGameSimulationStore(
    useShallow((state) => state.gameTime >= 7 && state.gameTime < 18)
  );

  const { dustParticleCount, enableDustParticles, quality } = useGraphicsStore(
    useShallow((state) => ({
      dustParticleCount: state.graphics.dustParticleCount,
      enableDustParticles: state.graphics.enableDustParticles,
      quality: state.graphics.quality,
    }))
  );

  // Use graphics setting for particle count
  const effectiveCount = Math.min(count, dustParticleCount);

  // Create particle pool with max count
  const pool = useMemo(() => new ParticlePool(count), [count]);

  // Ensure correct number of active particles
  useEffect(() => {
    pool.setActiveCount(effectiveCount);
  }, [pool, effectiveCount]);

  // Pre-allocated color array for vertex colors
  const colorArray = useMemo(() => new Float32Array(count * 3).fill(0), [count]);
  const colorAttr = useRef<THREE.InstancedBufferAttribute | null>(null);

  const material = useMemo(() => createDustMoteMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  // Hidden matrix for inactive particles (scaled to 0)
  const hiddenMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    return m;
  }, []);

  // Check if dust particles are enabled (after all hooks)
  const isEnabled = enableDustParticles;

  // Throttle particle updates based on graphics quality (200+ particles is expensive)
  const throttleLevel = getThrottleLevel(quality);

  // Seed matrices and colours BEFORE the first frame, and pin the culling
  // volume.
  //
  // `InstancedMesh` carries its own `boundingSphere` field, and
  // `Frustum.intersectsObject` prefers it over the geometry's - so the old
  // `mesh.geometry.boundingSphere = ...` assignment did nothing for culling,
  // and three instead auto-computed a sphere from the (then all-zero) instance
  // matrices: radius 0 at the world origin. Assign the object-level sphere.
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;

    pool.setActiveCount(effectiveCount);
    animateDustParticles(
      {
        type: 'dustParticles',
        meshRef: mesh,
        pool,
        colorArray,
        colorAttr,
        hiddenMatrix,
        count,
        isDaytime,
        throttleLevel,
      },
      false
    );

    // Particles fill the factory hall below MOTE_MAX_Y.
    instanced.boundingSphere = MOTE_BOUNDING_SPHERE.clone();
  }, [count, effectiveCount, pool, colorArray, hiddenMatrix, isDaytime, throttleLevel]);

  // Register with manager if available
  useEffect(() => {
    if (context && isEnabled) {
      context.register(idRef.current, {
        type: 'dustParticles',
        meshRef: mesh,
        pool,
        colorArray,
        colorAttr,
        hiddenMatrix,
        count,
        isDaytime,
        throttleLevel,
      });
      return () => context.unregister(idRef.current);
    }
  }, [context, isEnabled, pool, colorArray, hiddenMatrix, count, isDaytime, throttleLevel]);

  // Fallback useFrame when not in manager context
  useFrame(() => {
    if (context) return; // Manager handles animation
    if (!mesh.current || !isEnabled || !isTabVisible || prefersReducedMotion) return;
    if (!shouldRunThisFrame(throttleLevel)) return;
    animateDustParticles(
      {
        type: 'dustParticles',
        meshRef: mesh,
        pool,
        colorArray,
        colorAttr,
        hiddenMatrix,
        count,
        isDaytime,
        throttleLevel,
      },
      true
    );
  });

  // Return null if disabled (after all hooks have been called)
  if (!isEnabled) {
    return null;
  }

  // Use key to force remount when count changes, preventing buffer resize error
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, count]}
      material={material}
      frustumCulled={true}
      key={`dust-particles-${count}`}
    >
      {/* Two triangles per mote, billboarded in the vertex shader - the old
          dodecahedron was 36 vertices and still read as a hard polygon. */}
      <planeGeometry args={[0.09, 0.09]}>
        <instancedBufferAttribute
          ref={colorAttr}
          attach="attributes-color"
          count={count}
          array={colorArray}
          itemSize={3}
          args={[colorArray, 3]}
        />
      </planeGeometry>
    </instancedMesh>
  );
};

// ============================================================
// Grain flow (product travelling inside the spouting network)
// ============================================================

const GRAIN_FLOW_COUNT = 200;

/** Linear-space tints per route family. Vertex colours are NOT colour-managed
 *  by three, so the sRGB hex has to be converted here. */
const GRAIN_FAMILY_COLORS = {
  intake: new THREE.Color('#e8c86a'),
  pneumatic: new THREE.Color('#efd9a0'),
  finished: new THREE.Color('#f0e3c2'),
} as const;

export const GrainFlow: React.FC = () => {
  const particlesRef = useRef<THREE.Points>(null);
  const colorAttrRef = useRef<THREE.BufferAttribute>(null);
  const idRef = useRef(`grainFlow-${Math.random().toString(36).slice(2, 9)}`);
  const context = useDustAnimation();
  const { enableGrainFlow, quality } = useGraphicsStore(
    useShallow((state) => ({
      enableGrainFlow: state.graphics.enableGrainFlow,
      quality: state.graphics.quality,
    }))
  );
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const isEnabled = enableGrainFlow;

  // Read the machine layout directly rather than take it as a prop, so this
  // component needs no MillScene change to learn where the pipes are.
  // Subscribe to the layout string, not the machines array: status ticks every
  // simulation step and would otherwise re-render and rebuild every curve.
  const machineKey = useProductionStore((state) => spoutMachineKey(state.machines));
  const routes = useMemo(
    () => buildSpoutRoutes(useProductionStore.getState().machines),
    [machineKey]
  );

  const count = GRAIN_FLOW_COUNT;

  const buffers = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3).fill(1);
    const progress = new Float32Array(count);
    const rates = new Float32Array(count);
    const routeIndex = new Uint16Array(count);
    const jitter = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      progress[i] = Math.random();
      rates[i] = 0.85 + Math.random() * 0.3;
      // Uniform-ish disc inside the bore so product hugs the pipe wall the way
      // pneumatically conveyed grain actually does.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * SPOUT_PIPE_RADIUS * 0.7;
      jitter[i * 3] = Math.cos(angle) * radius;
      jitter[i * 3 + 1] = Math.sin(angle) * radius * 0.6;
      jitter[i * 3 + 2] = Math.sin(angle) * radius;
    }

    return { positions, colors, progress, rates, routeIndex, jitter };
  }, [count]);

  const sprite = useMemo(() => getParticleSprite(), []);

  // Assign particles to routes, tint them by family and seed their positions.
  // Runs on mount and whenever the layout changes - never per frame.
  useLayoutEffect(() => {
    const points = particlesRef.current;
    if (!points || routes.length === 0) return;

    const { positions, colors, routeIndex, progress, jitter } = buffers;
    const point = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const index = i % routes.length;
      routeIndex[i] = index;
      const route = routes[index];

      const tint = GRAIN_FAMILY_COLORS[route.family];
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;

      route.curve.getPointAt(progress[i], point);
      positions[i * 3] = point.x + jitter[i * 3];
      positions[i * 3 + 1] = point.y + jitter[i * 3 + 1];
      positions[i * 3 + 2] = point.z + jitter[i * 3 + 2];
    }

    const geometry = points.geometry;
    geometry.attributes.position.needsUpdate = true;
    if (colorAttrRef.current) colorAttrRef.current.needsUpdate = true;

    // Bound the whole ROUTE NETWORK, not the seeded sample. Positions are
    // rewritten every frame; a sphere fitted to one instant's sample would pop
    // particles in and out as they travel to the ends of their runs.
    const bounds = new THREE.Box3();
    routes.forEach((route) => {
      bounds.union(route.bounds);
    });
    bounds.expandByScalar(0.5);
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  }, [routes, buffers, count]);

  // Throttle grain flow updates
  const throttleLevel = getThrottleLevel(quality);

  // Get production speed for velocity scaling. A fire drill or emergency stop
  // halts product in the spouts along with the machines feeding them.
  const productionSpeed = useProductionStore((state) => state.productionSpeed);
  const safetyHold = useGameSimulationStore(selectSafetyHoldActive);

  const entry = useMemo<GrainFlowEntry>(
    () => ({
      type: 'grainFlow',
      particlesRef,
      routes,
      progress: buffers.progress,
      rates: buffers.rates,
      routeIndex: buffers.routeIndex,
      jitter: buffers.jitter,
      count,
      throttleLevel,
      speedMultiplier: safetyHold ? 0 : productionSpeed,
    }),
    [routes, buffers, count, throttleLevel, productionSpeed, safetyHold]
  );

  // Register with manager if available. Machines load asynchronously, so on the
  // normal startup path `routes` is empty for the first few frames; `entry`
  // depends on `routes`, so this re-registers as soon as the layout arrives.
  useEffect(() => {
    if (context && isEnabled && routes.length > 0) {
      context.register(idRef.current, entry);
      return () => context.unregister(idRef.current);
    }
  }, [context, isEnabled, entry, routes]);

  // Fallback useFrame when not in manager context
  useFrame((_, delta) => {
    if (context) return; // Manager handles animation
    if (!particlesRef.current || !isEnabled || !isTabVisible) return;
    if (!shouldRunThisFrame(throttleLevel)) return;
    animateGrainFlow(entry, delta);
  });

  // Return null if disabled (after all hooks have been called).
  // Also bail with no routes: the position buffer would still be all zeros and
  // would render 200 points piled on the world origin.
  if (!isEnabled || routes.length === 0) {
    return null;
  }

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={buffers.positions}
          itemSize={3}
          args={[buffers.positions, 3]}
        />
        <bufferAttribute
          ref={colorAttrRef}
          attach="attributes-color"
          count={count}
          array={buffers.colors}
          itemSize={3}
          args={[buffers.colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.09}
        map={sprite}
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

// Atmospheric haze for depth and industrial atmosphere
export const AtmosphericHaze: React.FC = () => {
  const enableAtmosphericHaze = useGraphicsStore((state) => state.graphics.enableAtmosphericHaze);
  const isEnabled = enableAtmosphericHaze;

  // Pre-created materials for better performance - depthTest false to prevent flickering
  const materials = useMemo(
    () => ({
      main: new THREE.MeshBasicMaterial({
        color: '#fef3c7',
        transparent: true,
        opacity: 0.012,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
      lower: new THREE.MeshBasicMaterial({
        color: '#e2e8f0',
        transparent: true,
        opacity: 0.018,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
      accent: new THREE.MeshBasicMaterial({
        color: '#fcd34d',
        transparent: true,
        opacity: 0.008,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    }),
    []
  );

  // Return null if disabled (after all hooks have been called)
  if (!isEnabled) {
    return null;
  }

  return (
    <group>
      {/* Main atmospheric volume - subtle golden industrial haze */}
      <mesh position={[0, 15, 0]} material={materials.main}>
        <boxGeometry args={[100, 30, 80]} />
      </mesh>

      {/* Lower haze layer - denser near floor */}
      <mesh position={[0, 4, 0]} material={materials.lower}>
        <boxGeometry args={[100, 8, 80]} />
      </mesh>

      {/* Accent haze near machinery zones */}
      <mesh position={[0, 8, -15]} material={materials.accent}>
        <boxGeometry args={[60, 12, 20]} />
      </mesh>
    </group>
  );
};

// ============================================================
// Machine steam / dust vents
// ============================================================

const MACHINE_STEAM_CACHE_KEY = 'millos-machine-steam-v1';

/**
 * Steam material with per-point life response.
 *
 * `lifetimes` is bound straight to the geometry as `aLife`, so the shader can
 * grow each puff as it rises and fade it in and out over its own life. Before
 * this, `lifetimes` only decided when to respawn: every puff popped to full
 * opacity the instant it recycled.
 */
const createMachineSteamMaterial = (
  color: string,
  size: number,
  opacity: number
): THREE.PointsMaterial => {
  const material = new THREE.PointsMaterial({
    color,
    size,
    opacity,
    map: getParticleSprite(),
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLife;
        varying float vLifeAlpha;`
      )
      .replace(
        '#include <logdepthbuf_vertex>',
        `// Puffs expand as they rise - the single strongest cue that reads as
        // vapour rather than dots. Clamped because gl_PointSize above the
        // driver's ALIASED_POINT_SIZE_RANGE is silently clamped anyway.
        gl_PointSize *= 1.0 + 1.6 * aLife;
        gl_PointSize = clamp( gl_PointSize, 1.0, 64.0 );
        vLifeAlpha = smoothstep( 0.0, 0.12, aLife ) * ( 1.0 - smoothstep( 0.55, 1.0, aLife ) );
        #include <logdepthbuf_vertex>`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vLifeAlpha;`
      )
      .replace(
        '#include <alphatest_fragment>',
        `diffuseColor.a *= vLifeAlpha;
        #include <alphatest_fragment>`
      );
  };

  material.customProgramCacheKey = () => MACHINE_STEAM_CACHE_KEY;
  return material;
};

// Machine steam/dust effect for industrial atmosphere
interface MachineSteamProps {
  position: [number, number, number];
  type: 'steam' | 'dust' | 'exhaust';
  intensity?: number;
}

const MachineSteamParticle: React.FC<MachineSteamProps> = ({ position, type, intensity = 1 }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const lifeAttrRef = useRef<THREE.BufferAttribute>(null);
  const idRef = useRef(`machineSteam-${Math.random().toString(36).slice(2, 9)}`);
  const context = useDustAnimation();
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const prefersReducedMotion = useReducedMotion();
  const count = type === 'dust' ? 30 : 20;

  const { positions, velocities, lifetimes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Start at machine position with small random offset
      pos[i * 3] = (Math.random() - 0.5) * 0.5;
      pos[i * 3 + 1] = Math.random() * 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      // Upward velocity with drift
      vel[i * 3] = (Math.random() - 0.5) * 0.3;
      vel[i * 3 + 1] = type === 'steam' ? 0.8 + Math.random() * 0.5 : 0.3 + Math.random() * 0.3;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;

      life[i] = Math.random(); // Random starting lifetime
    }

    return { positions: pos, velocities: vel, lifetimes: life };
  }, [count, type]);

  const color = type === 'steam' ? '#e2e8f0' : type === 'dust' ? '#d4a574' : '#9ca3af';
  const baseOpacity = type === 'steam' ? 0.34 : 0.44;
  const baseSize = type === 'steam' ? 0.34 : 0.2;

  const material = useMemo(
    () => createMachineSteamMaterial(color, baseSize * intensity, baseOpacity * intensity),
    [color, baseSize, baseOpacity, intensity]
  );
  useEffect(() => () => material.dispose(), [material]);

  const entry = useMemo<MachineSteamEntry>(
    () => ({
      type: 'machineSteam',
      particlesRef,
      velocities,
      lifetimes,
      lifeAttr: lifeAttrRef,
      count,
      steamType: type,
    }),
    [velocities, lifetimes, count, type]
  );

  // Register with manager if available
  useEffect(() => {
    if (context) {
      context.register(idRef.current, entry);
      return () => context.unregister(idRef.current);
    }
  }, [context, entry]);

  // Fallback useFrame when not in manager context
  useFrame((_, delta) => {
    if (context) return; // Manager handles animation
    if (!particlesRef.current || !isTabVisible || prefersReducedMotion) return;
    if (!shouldRunThisFrame(3)) return;
    animateMachineSteam(entry, Math.min(delta * 3, 0.1));
  });

  // Use key to force remount when count changes, preventing buffer resize error
  return (
    <points
      ref={particlesRef}
      position={position}
      material={material}
      key={`steam-${count}-${type}`}
    >
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
        <bufferAttribute
          ref={lifeAttrRef}
          attach="attributes-aLife"
          count={count}
          array={lifetimes}
          itemSize={1}
          args={[lifetimes, 1]}
        />
      </bufferGeometry>
    </points>
  );
};

// Vents are anchored to SITE_LAYOUT.machines and sit just outside a real
// surface of each CompactMachines part, so every puff leaves the casing:
// - roller mills: beside the louvred vent face on the west side (x - 2.4),
// - plansifters: at the front corner of the cap deck opposite the status
//   beacon (MACHINE_BEACON_MOUNTS), clear of the central inlet,
// - packers: on the hopper lid (HOPPER is 1.5 m tall at y 5.72), off its centre.
type SteamSource = {
  position: [number, number, number];
  type: 'steam' | 'dust' | 'exhaust';
  intensity: number;
};

/** Grinding heat: alternate steam and exhaust along the mill row. */
const MILL_VENTS: readonly Pick<SteamSource, 'type' | 'intensity'>[] = [
  { type: 'steam', intensity: 0.8 },
  { type: 'exhaust', intensity: 0.6 },
  { type: 'steam', intensity: 0.9 },
  { type: 'exhaust', intensity: 0.7 },
];
const SIFTER_DUST_INTENSITY = [1, 0.9, 0.8] as const;
const PACKER_DUST_INTENSITY = [0.7, 0.8, 0.6] as const;

const MILL_VENT_OFFSET: [number, number, number] = [-2.85, 2.3, -0.5];
const SIFTER_VENT_OFFSET: [number, number, number] = [
  -2.2,
  SIFTER_LAYOUT.capCentreY + SIFTER_LAYOUT.capHeight / 2 + 0.1,
  1.9,
];
const PACKER_VENT_OFFSET: [number, number, number] = [0.45, 5.72 + 1.5 / 2 + 0.1, 0.45];

const offsetFrom = (
  [x, y, z]: readonly [number, number, number],
  [dx, dy, dz]: readonly [number, number, number]
): [number, number, number] => [x + dx, y + dy, z + dz];

const STEAM_SOURCES: readonly SteamSource[] = [
  ...SITE_LAYOUT.machines.rollerMills.map(({ position }, i) => ({
    position: offsetFrom(position, MILL_VENT_OFFSET),
    ...MILL_VENTS[i % MILL_VENTS.length],
  })),
  ...SITE_LAYOUT.machines.sifters.map(({ position }, i) => ({
    position: offsetFrom(position, SIFTER_VENT_OFFSET),
    type: 'dust' as const,
    intensity: SIFTER_DUST_INTENSITY[i % SIFTER_DUST_INTENSITY.length],
  })),
  ...SITE_LAYOUT.machines.packers.map(({ position }, i) => ({
    position: offsetFrom(position, PACKER_VENT_OFFSET),
    type: 'dust' as const,
    intensity: PACKER_DUST_INTENSITY[i % PACKER_DUST_INTENSITY.length],
  })),
];

// Steam vents component - renders multiple steam sources near machines.
//
// Distance culling used to write the camera position into React state twice a
// second. Each write re-rendered this component, changed the child key set and
// remounted every `<points>` - a fresh BufferGeometry and Float32Array upload,
// forever. The vents are now permanently mounted and culled by toggling
// `.visible` inside the frame loop: zero React renders, zero reallocation.
export const MachineSteamVents: React.FC = () => {
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const isEnabled = quality !== 'low';
  const groupRef = useRef<THREE.Group>(null);
  // Machines stop under a fire drill or emergency stop, and so do their vents.
  const safetyHold = useGameSimulationStore(selectSafetyHoldActive);

  // Distance threshold for culling steam sources (in world units)
  const cullDistance = quality === 'ultra' ? 60 : quality === 'high' ? 50 : 40;

  // On medium quality, render half the sources. Depends on `quality` only, so
  // the child list is stable between renders.
  const activeSources = useMemo(
    () => (quality === 'medium' ? STEAM_SOURCES.filter((_, i) => i % 2 === 0) : STEAM_SOURCES),
    [quality]
  );

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;
    // Visibility only; cheap enough to leave un-throttled, but there is no
    // reason to run it at full rate.
    if (!shouldRunThisFrame(10)) return;

    group.visible = !safetyHold;
    if (safetyHold) return;

    const cullDistSq = cullDistance * cullDistance;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];
      const dx = child.position.x - camera.position.x;
      const dz = child.position.z - camera.position.z;
      child.visible = dx * dx + dz * dz < cullDistSq;
    }
  });

  // Return null if disabled (after all hooks have been called)
  if (!isEnabled) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {activeSources.map((source) => (
        <MachineSteamParticle
          key={`steam-${source.position[0]}-${source.position[2]}`}
          position={source.position}
          type={source.type}
          intensity={source.intensity}
        />
      ))}
    </group>
  );
};
