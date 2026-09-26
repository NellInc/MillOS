import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, RoundedBox } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';

// NOTE: The "unsupported GPOS table" warnings in the console are expected and harmless.
// They originate from the font parser in the underlying Troika library used by @react-three/drei's Text component.
// This occurs when using certain font files (like Google Fonts) that contain features not fully supported by the parser.
// It does not affect the visual rendering of the text.
import * as THREE from 'three';
import { useProductionStore } from '../stores/productionStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { getDockStatusColor } from '../utils/statusColors';
import { useShallow } from 'zustand/react/shallow';
import { shouldRunThisFrame, getThrottleLevel } from '../utils/frameThrottle';
import { MachineType, type MachineData } from '../types';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { useReducedMotion } from '../hooks/useReducedMotion';

/** Shared positions keep optional zone labels attached when production moves. */
export const HOLOGRAPHIC_ZONE_POSITIONS: Record<
  'storage' | 'milling' | 'sifting' | 'packing',
  [number, number, number]
> = {
  storage: [SITE_LAYOUT.machines.silos[0].position[0] - 9, 10, SITE_LAYOUT.factory.zones.silos],
  milling: [30, 10, SITE_LAYOUT.factory.zones.milling],
  sifting: [-30, SITE_LAYOUT.datum.mezzanine + 3, SITE_LAYOUT.factory.zones.sifting],
  packing: [24, 9, SITE_LAYOUT.factory.zones.packing],
};

/** Use observed counts and output. Zero remains zero; absent readings stay absent.
 * Working if stopped output is 0 bags/min and an empty silo is shown at 0%.
 */
export function getHolographicZoneMetrics(
  machines: readonly Pick<MachineData, 'type' | 'status' | 'fillLevel'>[],
  metrics: { throughput: number; quality: number },
  totalBags: number
) {
  const silos = machines.filter((machine) => machine.type === MachineType.SILO);
  const mills = machines.filter((machine) => machine.type === MachineType.ROLLER_MILL);
  // 'warning' still processes (the simulation runs it), so it counts as running.
  const isRunning = (machine: Pick<MachineData, 'status'>) =>
    machine.status === 'running' || machine.status === 'warning';
  const runningMills = mills.filter(isRunning).length;
  const siloLevel =
    silos.length > 0 && silos.every((silo) => Number.isFinite(silo.fillLevel))
      ? Math.round(
          silos.reduce((sum, silo) => sum + Math.max(0, Math.min(100, silo.fillLevel!)), 0) /
            silos.length
        )
      : null;
  return {
    siloLevel,
    runningMills,
    millAvailability: mills.length ? Math.round((runningMills / mills.length) * 100) : null,
    runningMachines: machines.filter(isRunning).length,
    qualityGrade: Number.isFinite(metrics.quality) ? metrics.quality : null,
    bagsPerMin: Number.isFinite(metrics.throughput) ? Math.max(0, metrics.throughput) / 60 : null,
    totalBags: Number.isFinite(totalBags) ? Math.max(0, totalBags) : null,
  };
}

type DockStatus = 'arriving' | 'loading' | 'departing' | 'clear';
type Dock = 'shipping' | 'receiving';

export const HolographicDisplays: React.FC = () => {
  // Use useShallow to prevent re-renders when unrelated store values change
  const { dockStatus, machines, metrics, totalBagsProduced } = useProductionStore(
    useShallow((state) => ({
      dockStatus: state.dockStatus,
      machines: state.machines,
      metrics: state.metrics,
      totalBagsProduced: state.totalBagsProduced,
    }))
  );

  const zoneMetrics = useMemo(
    () => getHolographicZoneMetrics(machines, metrics, totalBagsProduced),
    [machines, metrics, totalBagsProduced]
  );

  // Format dock display values. Shipping loads flour out; receiving unloads grain.
  const getStatusDisplay = (status: DockStatus, dock: Dock) => {
    switch (status) {
      case 'arriving':
        return 'Incoming';
      case 'loading':
        return dock === 'shipping' ? 'Loading' : 'Unloading';
      case 'departing':
        return 'Departing';
      case 'clear':
        return 'Clear';
    }
  };

  // TruckBay publishes etaMinutes = 0 while a truck is at the bay and the
  // next-arrival minutes while the bay is clear.
  const getSubValue = (status: DockStatus, dock: Dock, eta: number) => {
    if (status === 'arriving') return 'On approach';
    if (status === 'loading') return dock === 'shipping' ? 'Loading flour' : 'Unloading grain';
    if (status === 'departing') return 'Bay clearing';
    return eta > 0 ? `Next truck in ${eta} min` : 'Awaiting truck';
  };

  return (
    <group>
      {/* Main production display - centered, high visibility */}
      <HoloPanel
        position={[0, 14, -30]}
        title="PRODUCTION STATUS"
        value={`${zoneMetrics.runningMachines}/${machines.length} RUNNING`}
        color="#22c55e"
        size={[14, 4.5]}
      />

      {/* Zone displays follow the canonical production layout. */}
      <HoloPanel
        position={HOLOGRAPHIC_ZONE_POSITIONS.storage}
        title="ZONE 1: STORAGE"
        value={`${machines.filter((m) => m.type === MachineType.SILO).length} Silos Monitored`}
        subValue={
          zoneMetrics.siloLevel === null
            ? 'Level unavailable'
            : `Mean level: ${zoneMetrics.siloLevel}%`
        }
        color="#3b82f6"
        size={[7, 2.8]}
      />

      <HoloPanel
        position={HOLOGRAPHIC_ZONE_POSITIONS.milling}
        title="ZONE 2: MILLING"
        value={`${zoneMetrics.runningMills} Mills Running`}
        subValue={
          zoneMetrics.millAvailability === null
            ? 'No mills configured'
            : `Running: ${zoneMetrics.millAvailability}%`
        }
        color="#8b5cf6"
        size={[7, 2.8]}
      />

      <HoloPanel
        position={HOLOGRAPHIC_ZONE_POSITIONS.sifting}
        title="ZONE 3: SIFTING"
        value={`${machines.filter((m) => m.type === MachineType.PLANSIFTER).length} Plansifters`}
        subValue={
          zoneMetrics.qualityGrade === null
            ? 'Quality unavailable'
            : `Quality: ${zoneMetrics.qualityGrade.toFixed(1)}%`
        }
        color="#ec4899"
        size={[7, 2.8]}
      />

      <HoloPanel
        position={HOLOGRAPHIC_ZONE_POSITIONS.packing}
        title="ZONE 4: PACKING"
        value={
          zoneMetrics.bagsPerMin === null
            ? 'Output unavailable'
            : `${zoneMetrics.bagsPerMin.toFixed(1)} bags/min`
        }
        subValue={
          zoneMetrics.totalBags === null
            ? 'Total unavailable'
            : `Total: ${zoneMetrics.totalBags.toLocaleString()} bags`
        }
        color="#f59e0b"
        size={[7, 2.8]}
      />

      {/* Dock status displays */}
      <HoloPanel
        position={[0, 8, 42]}
        title="SHIPPING DOCK"
        value={getStatusDisplay(dockStatus.shipping.status, 'shipping')}
        subValue={getSubValue(
          dockStatus.shipping.status,
          'shipping',
          dockStatus.shipping.etaMinutes
        )}
        color={getDockStatusColor(dockStatus.shipping.status)}
        size={[5, 2]}
      />

      <HoloPanel
        position={[0, 8, -42]}
        title="RECEIVING DOCK"
        value={getStatusDisplay(dockStatus.receiving.status, 'receiving')}
        subValue={getSubValue(
          dockStatus.receiving.status,
          'receiving',
          dockStatus.receiving.etaMinutes
        )}
        color={getDockStatusColor(dockStatus.receiving.status)}
        size={[5, 2]}
      />

      {/* Floating data particles */}
      <DataParticles />
    </group>
  );
};

interface HoloPanelProps {
  position: [number, number, number];
  title: string;
  value: string;
  subValue?: string;
  color: string;
  size: [number, number];
}

const HoloPanel: React.FC<HoloPanelProps> = React.memo(
  ({ position, title, value, subValue, color, size }) => {
    const groupRef = useRef<THREE.Group>(null);
    const glowRef = useRef<THREE.Mesh>(null);
    const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const reducedMotion = useReducedMotion();

    // Guard against NaN/invalid dimensions
    const safeW = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 2;
    const safeH = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 1.5;

    // Memoize computed positions to prevent array recreation on each render
    const topBorderPos = useMemo(() => [0, safeH / 2 - 0.1, 0.03] as const, [safeH]);
    const titlePos = useMemo(() => [0, safeH / 2 - 0.35, 0.04] as const, [safeH]);
    const valuePos = useMemo(() => [0, subValue ? 0.1 : 0, 0.04] as const, [subValue]);
    const cornerPositions = useMemo(
      () =>
        [
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ].map(([x, y]) => [x * (safeW / 2 - 0.15), y * (safeH / 2 - 0.15), 0.03] as const),
      [safeW, safeH]
    );

    useFrame((state) => {
      // PERFORMANCE: Skip when tab hidden
      if (!isTabVisible) return;
      // Use shared throttle utility for consistent performance
      const throttle = getThrottleLevel(graphicsQuality);
      if (!shouldRunThisFrame(throttle)) return;

      // Reduced motion: hold the panel at rest instead of bobbing and pulsing.
      const t = reducedMotion ? 0 : state.clock.elapsedTime;
      if (groupRef.current) {
        groupRef.current.position.y = position[1] + Math.sin(t * 0.5) * 0.1;
      }
      if (glowRef.current) {
        (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
          0.1 + Math.sin(t * 2) * 0.05;
      }
    });

    return (
      <group ref={groupRef} position={position} scale={0.6}>
        <Billboard>
          {/* Glow background - depthWrite false to prevent z-fighting */}
          <mesh ref={glowRef} position={[0, 0, -0.1]}>
            <planeGeometry args={[safeW + 1, safeH + 0.5]} />
            <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
          </mesh>

          {/* Main panel - depthWrite false for transparent material */}
          <RoundedBox args={[safeW, safeH, 0.05]} radius={0.1} smoothness={4}>
            <meshStandardMaterial
              color="#0f172a"
              transparent
              opacity={0.9}
              metalness={0.5}
              roughness={0.5}
              depthWrite={false}
            />
          </RoundedBox>

          {/* Border glow - depthWrite false to prevent z-fighting */}
          <mesh position={[0, 0, 0.03]}>
            <planeGeometry args={[safeW - 0.1, safeH - 0.1]} />
            <meshBasicMaterial color={color} transparent opacity={0.05} depthWrite={false} />
          </mesh>

          {/* Top border accent */}
          <mesh position={topBorderPos}>
            <planeGeometry args={[safeW - 0.2, 0.05]} />
            <meshBasicMaterial color={color} />
          </mesh>

          {/* Title */}
          <Text
            position={titlePos}
            fontSize={0.2}
            color="#94a3b8"
            anchorX="center"
            anchorY="middle"
          >
            {title}
          </Text>

          {/* Main value */}
          <Text position={valuePos} fontSize={0.5} color={color} anchorX="center" anchorY="middle">
            {value}
          </Text>

          {/* Sub value */}
          {subValue && (
            <Text
              position={[0, -0.5, 0.04]}
              fontSize={0.25}
              color="#64748b"
              anchorX="center"
              anchorY="middle"
            >
              {subValue}
            </Text>
          )}

          {/* Corner accents */}
          {cornerPositions.map((pos, i) => (
            <mesh key={i} position={pos}>
              <circleGeometry args={[0.05, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
          ))}
        </Billboard>
      </group>
    );
  }
);

const DataParticles: React.FC = React.memo(() => {
  const particlesRef = useRef<THREE.Points>(null);
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const count = graphicsQuality === 'low' ? 50 : 100; // Reduce particle count on low

  const positions = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const xSequence = ((i * 73) % 101) / 100;
      const ySequence = ((i * 47 + 19) % 103) / 102;
      const zSequence = ((i * 89 + 31) % 107) / 106;
      pos[i * 3] = (xSequence - 0.5) * 80;
      pos[i * 3 + 1] = ySequence * 20 + 5;
      pos[i * 3 + 2] = (zSequence - 0.5) * 60;
    }
    return pos;
  }, [count]);

  useFrame(() => {
    // PERFORMANCE: Skip when tab hidden
    if (!isTabVisible) return;
    // Use shared throttle utility for consistent performance
    const throttle = getThrottleLevel(graphicsQuality);
    if (!shouldRunThisFrame(throttle)) return;

    if (!particlesRef.current) return;
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
    // Compensate speed for throttle level (higher throttle = faster movement per frame)
    const speed = 0.02 * throttle;

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] += speed;
      if (positions[i * 3 + 1] > 25) {
        positions[i * 3 + 1] = 5;
      }
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  // Use key to force remount when count changes, preventing buffer resize error
  return (
    <points ref={particlesRef} key={`data-particles-${count}`}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        color="#06b6d4"
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
});
