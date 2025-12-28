import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard, RoundedBox } from '@react-three/drei';

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
import { MachineType } from '../types';

export const HolographicDisplays: React.FC = () => {
  // Use useShallow to prevent re-renders when unrelated store values change
  const { dockStatus, machines, metrics, totalBagsProduced, productionSpeed } = useProductionStore(
    useShallow((state) => ({
      dockStatus: state.dockStatus,
      machines: state.machines,
      metrics: state.metrics,
      totalBagsProduced: state.totalBagsProduced,
      productionSpeed: state.productionSpeed,
    }))
  );

  // Calculate real zone metrics from store data
  const zoneMetrics = useMemo(() => {
    // Zone 1: Silos - calculate capacity from silo machine data
    const silos = machines.filter((m) => m.type === MachineType.SILO);
    const siloCapacity =
      silos.length > 0
        ? Math.round(silos.reduce((acc, s) => acc + (s.metrics?.load || 80), 0) / silos.length)
        : 85;

    // Zone 2: Mills - calculate throughput
    const mills = machines.filter((m) => m.type === MachineType.ROLLER_MILL);
    const runningMills = mills.filter((m) => m.status === 'running').length;
    const throughput = Math.round(200 * runningMills * productionSpeed + 200);

    // Zone 3: Sifters - use quality metric from store
    const qualityGrade = metrics.quality;

    // Zone 4: Packers - calculate bags/min and daily total
    const packers = machines.filter((m) => m.type === MachineType.PACKER);
    const runningPackers = packers.filter((m) => m.status === 'running').length;
    const bagsPerMin = Math.round(12 * runningPackers * productionSpeed + 5);

    return {
      siloCapacity,
      throughput,
      qualityGrade,
      bagsPerMin,
      totalBags: totalBagsProduced,
    };
  }, [machines, metrics, totalBagsProduced, productionSpeed]);

  // Format dock display values
  const getStatusDisplay = (status: 'arriving' | 'loading' | 'departing' | 'clear') => {
    switch (status) {
      case 'arriving':
        return 'Incoming';
      case 'loading':
        return 'Loading';
      case 'departing':
        return 'Departing';
      case 'clear':
        return 'Clear';
    }
  };

  const getSubValue = (status: 'arriving' | 'loading' | 'departing' | 'clear', eta: number) => {
    if (status === 'arriving') return `ETA: ${eta} min`;
    if (status === 'loading') return `${eta} min left`;
    if (status === 'departing') return 'Bay clearing';
    return 'Awaiting truck';
  };

  return (
    <group>
      {/* Main production display - centered, high visibility */}
      <HoloPanel
        position={[0, 14, -30]}
        title="PRODUCTION STATUS"
        value="OPTIMAL"
        color="#22c55e"
        size={[14, 4.5]}
      />

      {/* Zone displays - repositioned for 120x160 floor */}
      <HoloPanel
        position={[-30, 10, -22]}
        title="ZONE 1: STORAGE"
        value={`${machines.filter((m) => m.type === MachineType.SILO).length} Silos Active`}
        subValue={`Capacity: ${zoneMetrics.siloCapacity}%`}
        color="#3b82f6"
        size={[7, 2.8]}
      />

      <HoloPanel
        position={[30, 10, -6]}
        title="ZONE 2: MILLING"
        value={`${machines.filter((m) => m.type === MachineType.ROLLER_MILL && m.status === 'running').length} Mills Running`}
        subValue={`Output: ${zoneMetrics.throughput.toLocaleString()} kg/hr`}
        color="#8b5cf6"
        size={[7, 2.8]}
      />

      <HoloPanel
        position={[-30, 12, 6]}
        title="ZONE 3: SIFTING"
        value={`${machines.filter((m) => m.type === MachineType.PLANSIFTER).length} Plansifters`}
        subValue={`Grade A: ${zoneMetrics.qualityGrade.toFixed(1)}%`}
        color="#ec4899"
        size={[7, 2.8]}
      />

      <HoloPanel
        position={[30, 10, 28]}
        title="ZONE 4: PACKING"
        value={`${zoneMetrics.bagsPerMin} bags/min`}
        subValue={`Today: ${zoneMetrics.totalBags.toLocaleString()} bags`}
        color="#f59e0b"
        size={[7, 2.8]}
      />

      {/* Dock status displays */}
      <HoloPanel
        position={[0, 8, 42]}
        title="SHIPPING DOCK"
        value={getStatusDisplay(dockStatus.shipping.status)}
        subValue={getSubValue(dockStatus.shipping.status, dockStatus.shipping.etaMinutes)}
        color={getDockStatusColor(dockStatus.shipping.status)}
        size={[5, 2]}
      />

      <HoloPanel
        position={[0, 8, -42]}
        title="RECEIVING DOCK"
        value={getStatusDisplay(dockStatus.receiving.status)}
        subValue={getSubValue(dockStatus.receiving.status, dockStatus.receiving.etaMinutes)}
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

      if (groupRef.current) {
        groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      }
      if (glowRef.current) {
        (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
          0.1 + Math.sin(state.clock.elapsedTime * 2) * 0.05;
      }
    });

    return (
      <group ref={groupRef} position={position}>
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
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 20 + 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
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
