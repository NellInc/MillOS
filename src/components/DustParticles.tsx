import React, { useRef, useMemo, createContext, useContext, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FACTORY_ZONE_Z } from '../constants/factoryLayout';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import { shouldRunThisFrame, getThrottleLevel } from '../utils/frameThrottle';
import { useShallow } from 'zustand/react/shallow';

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
  velocities: Float32Array;
  count: number;
  throttleLevel: number;
  speedMultiplier: number; // Production speed multiplier
}

interface MachineSteamEntry {
  type: 'machineSteam';
  particlesRef: React.RefObject<THREE.Points | null>;
  velocities: Float32Array;
  lifetimes: Float32Array;
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

  const register = useCallback((id: string, entry: DustEntry) => {
    entriesRef.current.set(id, entry);
  }, []);

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  useFrame((_, delta) => {
    if (!isTabVisible) return;

    entriesRef.current.forEach((entry) => {
      switch (entry.type) {
        case 'dustParticles':
          if (!shouldRunThisFrame(entry.throttleLevel)) return;
          animateDustParticles(entry);
          break;
        case 'grainFlow':
          if (!shouldRunThisFrame(entry.throttleLevel)) return;
          animateGrainFlow(entry);
          break;
        case 'machineSteam':
          if (!shouldRunThisFrame(3)) return;
          animateMachineSteam(entry, delta);
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
function animateDustParticles(entry: DustParticlesEntry) {
  if (!entry.meshRef.current) return;
  const mesh = entry.meshRef.current;
  const particles = entry.pool.particles;

  for (let i = 0; i < entry.count; i++) {
    const particle = particles[i];

    if (!particle.active) {
      mesh.setMatrixAt(i, entry.hiddenMatrix);
      continue;
    }

    particle.lifetime++;

    if (particle.lifetime > particle.maxLifetime) {
      particle.t = Math.random() * 100;
      particle.xFactor = -40 + Math.random() * 80;
      particle.yFactor = Math.random() * 25;
      particle.zFactor = -30 + Math.random() * 60;
      particle.lifetime = 0;
      particle.maxLifetime = 200 + Math.random() * 300;
    }

    const { factor, speed, xFactor, yFactor, zFactor } = particle;
    particle.t += speed;
    const t = particle.t;

    const s = Math.max(0.3, Math.cos(t) * 0.5 + 0.5);

    const x = xFactor + Math.cos((t / 10) * factor) * 2;
    let y = yFactor + Math.sin((t / 10) * factor) * 2 + 5;
    const z = zFactor + Math.cos((t / 10) * factor) * 2;

    if (y < 1) y = 25;
    if (y > 30) y = 5;

    const lightIntensity = entry.isDaytime ? isInLightShaft(x, y, z) : 0;

    const scaleMultiplier = 1 + lightIntensity * 1.5;
    const finalScale = s * 0.8 * scaleMultiplier;

    tempPosition.set(x, y, z);
    tempScale.setScalar(finalScale);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);

    mesh.setMatrixAt(i, tempMatrix);

    const baseR = 0.996;
    const baseG = 0.953;
    const baseB = 0.78;
    entry.colorArray[i * 3] = baseR + lightIntensity * 0.004;
    entry.colorArray[i * 3 + 1] = baseG + lightIntensity * 0.047;
    entry.colorArray[i * 3 + 2] = baseB + lightIntensity * 0.22;
  }

  mesh.instanceMatrix.needsUpdate = true;

  if (entry.colorAttr.current) {
    entry.colorAttr.current.needsUpdate = true;
  }
}

function animateGrainFlow(entry: GrainFlowEntry) {
  if (!entry.particlesRef.current) return;
  const posArray = entry.particlesRef.current.geometry.attributes.position.array as Float32Array;

  // Scale velocity by production speed (higher speed = faster grain flow)
  const speedScale = entry.speedMultiplier;

  for (let i = 0; i < entry.count; i++) {
    const idx = i * 3;

    posArray[idx] += entry.velocities[idx] * speedScale;
    posArray[idx + 1] += entry.velocities[idx + 1] * speedScale;
    posArray[idx + 2] += entry.velocities[idx + 2] * speedScale;

    if (posArray[idx + 1] < 2) {
      posArray[idx] = (Math.random() - 0.5) * 30;
      posArray[idx + 1] = 18 + Math.random() * 5;
      posArray[idx + 2] = -15;
    }
  }
  entry.particlesRef.current.geometry.attributes.position.needsUpdate = true;
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

// Skylight positions for light shaft calculation
const SKYLIGHT_POSITIONS = [-20, 0, 20];
const LIGHT_SHAFT_Z = 0;

// Cached vectors for performance
const tempPosition = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();
const tempScale = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

// Check if a position is inside a light shaft cone (optimized)
// Pre-calculates cone radius once per Y level to avoid redundant calculations
const isInLightShaft = (x: number, y: number, z: number): number => {
  // Early exit for out-of-bounds
  if (y <= 5 || y >= 32) return 0;

  // Pre-calculate cone properties once per call (not per light shaft)
  const normalizedY = (y - 5) / 27;
  const coneRadius = 3 + normalizedY * 3;
  const coneRadiusSq = coneRadius * coneRadius;
  const invConeRadius = 1 / coneRadius; // Pre-compute inverse for faster division

  // Check each light shaft
  for (let i = 0; i < SKYLIGHT_POSITIONS.length; i++) {
    const skylightX = SKYLIGHT_POSITIONS[i];
    const dx = x - skylightX;
    const dz = z - LIGHT_SHAFT_Z;
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
      xFactor: -40 + Math.random() * 80,
      yFactor: Math.random() * 25,
      zFactor: -30 + Math.random() * 60,
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
      p.xFactor = -40 + Math.random() * 80;
      p.yFactor = Math.random() * 25;
      p.zFactor = -30 + Math.random() * 60;
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

export const DustParticles: React.FC<DustParticlesProps> = ({ count }) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const idRef = useRef(`dustParticles-${Math.random().toString(36).slice(2, 9)}`);
  const context = useDustAnimation();
  // const gameTime = useGameSimulationStore((state) => state.gameTime); // Replaced with shallow selector below
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

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
  useMemo(() => {
    pool.setActiveCount(effectiveCount);
  }, [pool, effectiveCount]);

  // Pre-allocated color array for vertex colors
  const colorArray = useMemo(() => new Float32Array(count * 3).fill(0), [count]);
  const colorAttr = useRef<THREE.InstancedBufferAttribute | null>(null);

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

  // Set proper bounding sphere for frustum culling
  // Particles span roughly x: [-40, 40], y: [5, 30], z: [-30, 30]
  useEffect(() => {
    if (mesh.current && mesh.current.geometry) {
      mesh.current.geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(0, 17.5, 0), // Center of particle volume
        60 // Radius encompassing all possible particle positions
      );
    }
  }, [count]);

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
    if (!mesh.current || !isEnabled || !isTabVisible) return;
    if (!shouldRunThisFrame(throttleLevel)) return;
    animateDustParticles({
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
      frustumCulled={true}
      key={`dust-particles-${count}`}
    >
      <dodecahedronGeometry args={[0.04, 0]}>
        <instancedBufferAttribute
          ref={colorAttr}
          attach="attributes-color"
          count={count}
          array={colorArray}
          itemSize={3}
          args={[colorArray, 3]}
        />
      </dodecahedronGeometry>
      <meshBasicMaterial color="#fef3c7" transparent opacity={0.5} vertexColors />
    </instancedMesh>
  );
};

// Grain particles flowing through pipes (visual effect) - with pooling
export const GrainFlow: React.FC = () => {
  const particlesRef = useRef<THREE.Points>(null);
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

  const count = 200;

  // Pre-allocated arrays for better memory management
  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Position along pipe paths
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = 5 + Math.random() * 15;
      pos[i * 3 + 2] = -15 + Math.random() * 20;

      // Pre-compute velocities with slight variation
      vel[i * 3] = 0;
      vel[i * 3 + 1] = -0.04 - Math.random() * 0.02; // Gravity
      vel[i * 3 + 2] = 0.015 + Math.random() * 0.01; // Forward
    }

    return { positions: pos, velocities: vel };
  }, []);

  // Throttle grain flow updates
  const throttleLevel = getThrottleLevel(quality);

  // Get production speed for velocity scaling
  const productionSpeed = useProductionStore((state) => state.productionSpeed);

  // Register with manager if available
  useEffect(() => {
    if (context && isEnabled) {
      context.register(idRef.current, {
        type: 'grainFlow',
        particlesRef,
        velocities,
        count,
        throttleLevel,
        speedMultiplier: productionSpeed,
      });
      return () => context.unregister(idRef.current);
    }
  }, [context, isEnabled, velocities, throttleLevel, productionSpeed]);

  // Fallback useFrame when not in manager context
  useFrame(() => {
    if (context) return; // Manager handles animation
    if (!particlesRef.current || !isEnabled || !isTabVisible) return;
    if (!shouldRunThisFrame(throttleLevel)) return;
    animateGrainFlow({
      type: 'grainFlow',
      particlesRef,
      velocities,
      count,
      throttleLevel,
      speedMultiplier: productionSpeed,
    });
  });

  // Return null if disabled (after all hooks have been called)
  if (!isEnabled) {
    return null;
  }

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.12} color="#fcd34d" transparent opacity={0.8} sizeAttenuation />
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

// Machine steam/dust effect for industrial atmosphere
interface MachineSteamProps {
  position: [number, number, number];
  type: 'steam' | 'dust' | 'exhaust';
  intensity?: number;
}

const MachineSteamParticle: React.FC<MachineSteamProps> = ({ position, type, intensity = 1 }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const idRef = useRef(`machineSteam-${Math.random().toString(36).slice(2, 9)}`);
  const context = useDustAnimation();
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
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

  // Register with manager if available
  useEffect(() => {
    if (context) {
      context.register(idRef.current, {
        type: 'machineSteam',
        particlesRef,
        velocities,
        lifetimes,
        count,
        steamType: type,
      });
      return () => context.unregister(idRef.current);
    }
  }, [context, velocities, lifetimes, count, type]);

  // Fallback useFrame when not in manager context
  useFrame((_, delta) => {
    if (context) return; // Manager handles animation
    if (!particlesRef.current || !isTabVisible) return;
    if (!shouldRunThisFrame(3)) return;
    animateMachineSteam(
      {
        type: 'machineSteam',
        particlesRef,
        velocities,
        lifetimes,
        count,
        steamType: type,
      },
      delta
    );
  });

  const color = type === 'steam' ? '#e2e8f0' : type === 'dust' ? '#d4a574' : '#9ca3af';
  const opacity = type === 'steam' ? 0.3 : 0.4;
  const size = type === 'steam' ? 0.15 : 0.08;

  // Use key to force remount when count changes, preventing buffer resize error
  return (
    <points ref={particlesRef} position={position} key={`steam-${count}-${type}`}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size * intensity}
        color={color}
        transparent
        opacity={opacity * intensity}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};

// Steam vents component - renders multiple steam sources near machines
// Uses distance-based culling to only render nearby steam sources
export const MachineSteamVents: React.FC = () => {
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const isEnabled = quality !== 'low';
  const [cameraX, setCameraX] = React.useState(0);
  const [cameraZ, setCameraZ] = React.useState(0);
  const lastUpdateRef = useRef(0);

  // Update camera position for distance culling (throttled to every 500ms)
  useFrame(({ camera, clock }) => {
    const now = clock.elapsedTime;
    if (now - lastUpdateRef.current > 0.5) {
      lastUpdateRef.current = now;
      setCameraX(camera.position.x);
      setCameraZ(camera.position.z);
    }
  });

  // Machine positions from MillScene zones:
  // Zone 2 (z=-6): Roller Mills - hot grinding process creates steam/heat
  // Zone 3 (z=6, y=9): Plansifters - dust from sifting
  // Zone 4 (z=25): Packers - dust from packaging

  const steamSources = useMemo(
    () => [
      // Roller mill steam vents (grinding creates heat)
      {
        position: [-18, 4, FACTORY_ZONE_Z.milling] as [number, number, number],
        type: 'steam' as const,
        intensity: 0.8,
      },
      {
        position: [-10, 4, FACTORY_ZONE_Z.milling] as [number, number, number],
        type: 'steam' as const,
        intensity: 0.7,
      },
      {
        position: [-2, 4, FACTORY_ZONE_Z.milling] as [number, number, number],
        type: 'exhaust' as const,
        intensity: 0.6,
      },
      {
        position: [6, 4, FACTORY_ZONE_Z.milling] as [number, number, number],
        type: 'steam' as const,
        intensity: 0.9,
      },
      {
        position: [14, 4, FACTORY_ZONE_Z.milling] as [number, number, number],
        type: 'exhaust' as const,
        intensity: 0.7,
      },

      // Plansifter dust (sifting creates fine flour dust)
      {
        position: [-12, 12, FACTORY_ZONE_Z.sifting] as [number, number, number],
        type: 'dust' as const,
        intensity: 1,
      },
      {
        position: [0, 12, FACTORY_ZONE_Z.sifting] as [number, number, number],
        type: 'dust' as const,
        intensity: 0.9,
      },
      {
        position: [12, 12, FACTORY_ZONE_Z.sifting] as [number, number, number],
        type: 'dust' as const,
        intensity: 0.8,
      },

      // Packer dust (packaging creates airborne flour)
      {
        position: [-15, 3, FACTORY_ZONE_Z.packing] as [number, number, number],
        type: 'dust' as const,
        intensity: 0.7,
      },
      {
        position: [0, 3, FACTORY_ZONE_Z.packing] as [number, number, number],
        type: 'dust' as const,
        intensity: 0.8,
      },
      {
        position: [15, 3, FACTORY_ZONE_Z.packing] as [number, number, number],
        type: 'dust' as const,
        intensity: 0.6,
      },
    ],
    []
  );

  // Distance threshold for culling steam sources (in world units)
  const cullDistance = quality === 'ultra' ? 60 : quality === 'high' ? 50 : 40;

  // On medium quality, reduce number of sources; also apply distance culling
  const activeSources = useMemo(() => {
    const qualityFiltered =
      quality === 'medium' ? steamSources.filter((_, i) => i % 2 === 0) : steamSources;

    // Apply distance culling based on camera position
    const cullDistSq = cullDistance * cullDistance;
    return qualityFiltered.filter((source) => {
      const dx = source.position[0] - cameraX;
      const dz = source.position[2] - cameraZ;
      const distSq = dx * dx + dz * dz;
      return distSq < cullDistSq;
    });
  }, [steamSources, quality, cullDistance, cameraX, cameraZ]);

  // Return null if disabled (after all hooks have been called)
  if (!isEnabled) {
    return null;
  }

  return (
    <group>
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
