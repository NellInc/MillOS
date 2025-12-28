import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { getThrottleLevel, shouldRunThisFrame } from '../../utils/frameThrottle';
import { MACHINE_MATERIALS } from '../../utils/sharedMaterials';
import { registerPanel, unregisterPanel } from './shared';

// Blinking control panel with LED indicators
export const ControlPanel: React.FC<{
  position: [number, number, number];
  rotation?: THREE.Euler | [number, number, number];
  status: 'running' | 'idle' | 'warning' | 'critical';
  enabled: boolean;
}> = React.memo(({ position, rotation = [0, 0, 0], status, enabled }) => {
  // Shared geometries - created once and reused
  const ledGeometry = useMemo(() => new THREE.CircleGeometry(0.02, 8), []);
  const buttonGeometry = useMemo(() => new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), []);

  const ledMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const screenMaterial = useRef<THREE.MeshStandardMaterial>(null);

  // Initialize material refs array
  if (ledMaterials.current.length === 0) {
    ledMaterials.current = Array(4)
      .fill(null)
      .map(
        () =>
          new THREE.MeshStandardMaterial({
            color: '#1e293b',
            emissive: '#1e293b',
            emissiveIntensity: 0,
            toneMapped: false,
          })
      );
  }

  // Register with manager
  useEffect(() => {
    if (!enabled) return;
    const id = `panel-${Math.random()}`;

    // Ensure screen material is ready
    if (screenMaterial.current) {
      registerPanel(id, {
        status,
        ledMaterials: ledMaterials.current,
        screenMaterial: screenMaterial.current,
      });
    }

    return () => unregisterPanel(id);
  }, [enabled, status]);

  if (!enabled) return null;

  return (
    <group
      position={position}
      rotation={Array.isArray(rotation) ? (rotation as [number, number, number]) : rotation}
    >
      {/* Panel backing - using shared materials */}
      {/* Panel box depth 0.05 means front face at z=0.025 */}
      <mesh>
        <boxGeometry args={[0.4, 0.3, 0.05]} />
        <primitive object={MACHINE_MATERIALS.panelBody} attach="material" />
      </mesh>

      {/* Screen/display area - z=0.035 for proper separation from panel front (0.025) */}
      <mesh position={[0, 0.02, 0.035]}>
        <planeGeometry args={[0.25, 0.12]} />
        <meshStandardMaterial
          ref={screenMaterial}
          color={status === 'critical' ? '#450a0a' : status === 'warning' ? '#451a03' : '#0f172a'}
          emissive={
            status === 'critical' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#3b82f6'
          }
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* LED indicators - z=0.04 (above screen at 0.035) */}
      {[
        [-0.12, -0.08],
        [-0.04, -0.08],
        [0.04, -0.08],
        [0.12, -0.08],
      ].map(([x, y], i) => (
        <mesh
          key={i}
          position={[x, y, 0.04]}
          geometry={ledGeometry}
          material={ledMaterials.current[i]}
        />
      ))}

      {/* Buttons - z=0.045 with depthWrite={false} to prevent z-fighting */}
      {[
        [0.15, 0.08],
        [0.15, 0.0],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.045]} geometry={buttonGeometry}>
          <meshStandardMaterial
            color={i === 0 ? '#22c55e' : '#ef4444'}
            roughness={0.4}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
});

// Animated gauge with needle
export const AnimatedGauge: React.FC<{
  position: [number, number, number];
  value: number;
  maxValue: number;
}> = React.memo(({ position, value, maxValue }) => {
  const needleRef = useRef<THREE.Mesh>(null);
  const targetAngle = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore.getState().graphics.quality;
  const isLowQuality = graphicsQuality === 'low';
  const gaugeThrottle = useMemo(
    () => Math.max(getThrottleLevel(graphicsQuality), 3),
    [graphicsQuality]
  );

  useFrame(() => {
    if (!isTabVisible || isLowQuality) return;
    // Throttle gauge animation - 15-20fps is sufficient for smooth needle movement
    if (!shouldRunThisFrame(gaugeThrottle)) return;
    if (!needleRef.current) return;
    // Map value to angle (-135 to +135 degrees)
    const normalizedValue = Math.min(value / maxValue, 1);
    targetAngle.current = (-0.75 + normalizedValue * 1.5) * Math.PI;
    // Increase lerp factor to compensate for lower framerate
    needleRef.current.rotation.z = THREE.MathUtils.lerp(
      needleRef.current.rotation.z,
      targetAngle.current,
      0.12
    );
  });

  return (
    <group position={position}>
      {/* Gauge face - base layer at z=0 */}
      <mesh>
        <circleGeometry args={[0.12, 32]} />
        <meshBasicMaterial color="#1e293b" />
      </mesh>
      {/* Gauge markings (green ring) - z=0.005 */}
      <mesh position={[0, 0, 0.005]}>
        <ringGeometry args={[0.08, 0.1, 32, 1, -2.35, 4.7]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Warning zone (red ring) - z=0.006 (above green ring) */}
      <mesh position={[0, 0, 0.006]}>
        <ringGeometry args={[0.08, 0.1, 32, 1, 1.57, 0.78]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      {/* Needle - z=0.01 (well above rings) */}
      <mesh ref={needleRef} position={[0, 0, 0.01]}>
        <boxGeometry args={[0.015, 0.08, 0.005]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      {/* Center cap - z=0.015 (top layer) */}
      <mesh position={[0, 0, 0.015]}>
        <circleGeometry args={[0.02, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
});

// Alarm indicator that pulses when there are active alarms
export const AlarmIndicator: React.FC<{
  position: [number, number, number];
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  pulseSpeed: number;
  hasUnacknowledged: boolean;
}> = React.memo(({ position, priority, pulseSpeed, hasUnacknowledged }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const graphics = useGraphicsStore((state) => state.graphics.quality);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const indicatorThrottle = useMemo(() => Math.max(getThrottleLevel(graphics), 3), [graphics]);

  const colors = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    MEDIUM: '#eab308',
    LOW: '#3b82f6',
  };

  const color = priority ? colors[priority] : '#3b82f6';

  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(indicatorThrottle)) return;
    // Skip animation when not visible
    if (!meshRef.current || pulseSpeed === 0 || !priority || graphics === 'low') return;

    const t = state.clock.elapsedTime * pulseSpeed;
    const pulse = hasUnacknowledged ? Math.sin(t) * 0.5 + 0.5 : 0.3;

    // Pulse the emissive intensity
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.5 + pulse * 2;

    // Scale the glow
    if (glowRef.current) {
      const scale = 1 + pulse * 0.3;
      glowRef.current.scale.setScalar(scale);
    }
  });

  // Skip rendering on low graphics or no alarm
  if (graphics === 'low' || !priority) return null;

  return (
    <group position={position}>
      {/* Outer glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {/* Inner indicator */}
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
});

// SCADA value display overlay
export const SCADAValueOverlay: React.FC<{
  position: [number, number, number];
  tagValues: {
    temperature?: number;
    vibration?: number;
    rpm?: number;
    current?: number;
    level?: number;
  };
  temperatureColor: string;
  vibrationColor: string;
}> = React.memo(({ position, tagValues, temperatureColor, vibrationColor }) => {
  const graphics = useGraphicsStore((state) => state.graphics.quality);

  // Skip on low/medium graphics
  if (graphics === 'low' || graphics === 'medium') return null;

  return (
    <Html position={position} center distanceFactor={15}>
      <div className="bg-slate-900/85 backdrop-blur px-2 py-1 rounded border border-slate-700/50 min-w-[80px] pointer-events-none">
        <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">SCADA Live</div>
        <div className="space-y-0.5">
          {tagValues.temperature !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">Temp</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: temperatureColor }}>
                {tagValues.temperature.toFixed(1)}C
              </span>
            </div>
          )}
          {tagValues.vibration !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">Vib</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: vibrationColor }}>
                {tagValues.vibration.toFixed(2)} mm/s
              </span>
            </div>
          )}
          {tagValues.rpm !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">RPM</span>
              <span className="text-[10px] font-mono font-bold text-cyan-400">
                {Math.round(tagValues.rpm)}
              </span>
            </div>
          )}
          {tagValues.current !== undefined && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-400">Curr</span>
              <span className="text-[10px] font-mono font-bold text-purple-400">
                {tagValues.current.toFixed(1)}A
              </span>
            </div>
          )}
        </div>
      </div>
    </Html>
  );
});
