import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { FLOOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';

// ==========================================
// UTILITIES & INFRASTRUCTURE
// Electrical, plumbing, monitoring, and control systems
// ==========================================

export const CableTray: React.FC<{
  position: [number, number, number];
  length?: number;
  rotation?: [number, number, number];
}> = ({ position, length = 10, rotation = [0, 0, 0] }) => {
  const wiresRef = useRef<THREE.Group>(null);

  // Subtle wire sway using centralized manager
  const animationId = useMemo(() => `cable-tray-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (wiresRef.current) {
      wiresRef.current.children.forEach((wire, i) => {
        wire.rotation.z = Math.sin(time * 0.5 + i) * 0.02;
      });
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Tray base */}
      <mesh>
        <boxGeometry args={[length, 0.05, 0.3]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Tray sides */}
      {[-0.12, 0.12].map((z, i) => (
        <mesh key={i} position={[0, 0.05, z]}>
          <boxGeometry args={[length, 0.1, 0.02]} />
          <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* Support brackets */}
      {Array.from({ length: Math.floor(length / 2) }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + 1 + i * 2, 0.15, 0]}>
          <boxGeometry args={[0.05, 0.3, 0.35]} />
          <meshStandardMaterial color="#374151" metalness={0.5} />
        </mesh>
      ))}

      {/* Cables running through */}
      {[
        { color: '#ef4444', offset: -0.08 },
        { color: '#3b82f6', offset: 0 },
        { color: '#22c55e', offset: 0.08 },
      ].map((cable, i) => (
        <mesh key={i} position={[0, 0.02, cable.offset]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, length, 8]} />
          <meshStandardMaterial color={cable.color} roughness={0.6} />
        </mesh>
      ))}

      {/* Hanging wires */}
      <group ref={wiresRef}>
        {Array.from({ length: 3 }).map((_, i) => (
          <group key={i} position={[-length / 3 + i * (length / 3), -0.1, 0]}>
            <mesh>
              <cylinderGeometry args={[0.008, 0.008, 0.5 + Math.random() * 0.3, 6]} />
              <meshStandardMaterial color={['#ef4444', '#eab308', '#3b82f6'][i]} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

// Steam/vapor vent

export const ElectricalPanel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const sparkRef = useRef<THREE.PointLight>(null);
  const sparkState = useRef({ nextSpark: 5 + Math.random() * 30, sparking: false, sparkEnd: 0 });

  // Sparking animation using centralized manager
  const animationId = useMemo(() => `electrical-panel-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!sparkRef.current) return;

    if (time > sparkState.current.nextSpark && !sparkState.current.sparking) {
      sparkState.current.sparking = true;
      sparkState.current.sparkEnd = time + 0.1 + Math.random() * 0.2;
      sparkState.current.nextSpark = time + 20 + Math.random() * 60; // Very rare
    }

    if (sparkState.current.sparking) {
      if (time < sparkState.current.sparkEnd) {
        sparkRef.current.intensity = Math.random() > 0.5 ? 5 : 0;
      } else {
        sparkState.current.sparking = false;
        sparkRef.current.intensity = 0;
      }
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Panel box */}
      <mesh castShadow>
        <boxGeometry args={[0.6, 0.8, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Panel door */}
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.55, 0.75, 0.02]} />
        <meshStandardMaterial color="#52525b" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Warning label */}
      <mesh position={[0, 0.2, 0.1]}>
        <planeGeometry args={[0.3, 0.15]} />
        <meshStandardMaterial color="#eab308" />
      </mesh>

      {/* Handle */}
      <mesh position={[0.2, 0, 0.1]}>
        <boxGeometry args={[0.04, 0.12, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Conduit pipes */}
      {[-0.15, 0.15].map((x, i) => (
        <mesh key={i} position={[x, 0.5, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} />
        </mesh>
      ))}

      {/* Spark light */}
      <pointLight
        ref={sparkRef}
        position={[0, -0.2, 0.2]}
        color="#60a5fa"
        intensity={0}
        distance={2}
      />
    </group>
  );
};

// ==========================================
// AMBIENT LIFE
// ==========================================

// Pigeon in rafters

export const DrainageGrate: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 0.6,
}) => {
  return (
    <group position={position}>
      {/* Grate frame */}
      <mesh position={[0, FLOOR_LAYERS.puddle, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 0.4, size * 0.5, 4]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.7}
          roughness={0.4}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Grate bars - raised to prevent z-fighting with puddle layer */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh
          key={i}
          position={[0, FLOOR_LAYERS.puddle + 0.015, (i - 2) * size * 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <boxGeometry args={[size * 0.8, 0.02, 0.03]} />
          <meshStandardMaterial
            color="#1e293b"
            metalness={0.8}
            roughness={0.3}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
            polygonOffsetUnits={POLYGON_OFFSET.standard.units}
          />
        </mesh>
      ))}

      {/* Dark hole beneath - positioned below floor to prevent z-fighting */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[size * 0.4, 8]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  );
};

// ==========================================
// ANIMATED ELEMENTS
// ==========================================

// Flickering fluorescent light

export const PressureGauge: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const needleRef = useRef<THREE.Mesh>(null);

  // Pressure gauge needle animation using centralized manager
  const animationId = useMemo(() => `pressure-gauge-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (needleRef.current) {
      // Subtle needle wobble
      needleRef.current.rotation.z = -0.5 + Math.sin(time * 0.5) * 0.1;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Gauge body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.04, 24]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Gauge face */}
      <mesh position={[0, 0, 0.021]}>
        <circleGeometry args={[0.065, 24]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>

      {/* Gauge markings arc */}
      <mesh position={[0, 0.01, 0.022]}>
        <ringGeometry args={[0.04, 0.055, 24, 1, -Math.PI * 0.7, Math.PI * 1.4]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>

      {/* Red danger zone */}
      <mesh position={[0, 0.01, 0.022]}>
        <ringGeometry args={[0.04, 0.055, 12, 1, Math.PI * 0.5, Math.PI * 0.2]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>

      {/* Needle */}
      <mesh ref={needleRef} position={[0, 0, 0.025]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.05, 0.005, 0.002]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Center cap */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>

      {/* Pipe connection */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} />
      </mesh>
    </group>
  );
};

// Valve wheel

export const ValveWheel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}> = ({ position, rotation = [0, 0, 0], size = 0.15 }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Wheel rim */}
      <mesh>
        <torusGeometry args={[size, size * 0.1, 8, 24]} />
        <meshStandardMaterial color="#ef4444" roughness={0.5} />
      </mesh>

      {/* Spokes */}
      {[0, Math.PI / 3, (Math.PI * 2) / 3, Math.PI, (Math.PI * 4) / 3, (Math.PI * 5) / 3].map(
        (angle, i) => (
          <mesh key={i} rotation={[0, 0, angle]}>
            <boxGeometry args={[size * 2 * 0.8, size * 0.15, size * 0.08]} />
            <meshStandardMaterial color="#ef4444" roughness={0.5} />
          </mesh>
        )
      )}

      {/* Center hub */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size * 0.25, size * 0.25, size * 0.2, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Stem */}
      <mesh position={[0, 0, -size * 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size * 0.1, size * 0.1, size * 0.4, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} />
      </mesh>
    </group>
  );
};

// Pulsing indicator light synced to audio

export const PASpeaker: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Mounting bracket */}
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[0.1, 0.15, 0.05]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Horn body */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.15, 0.3, 12, 1, true]} />
        <meshStandardMaterial
          color="#d4d4d8"
          metalness={0.4}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Driver housing */}
      <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} />
      </mesh>
    </group>
  );
};

// Alarm bell

export const AlarmBell: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const bellRef = useRef<THREE.Mesh>(null);
  const hammerRef = useRef<THREE.Mesh>(null);

  // Occasional test ring animation using centralized manager
  const animationId = useMemo(() => `alarm-bell-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    // Ring every ~30 seconds for a brief moment
    if (Math.floor(time) % 30 === 0 && time % 1 < 0.5) {
      if (bellRef.current) {
        bellRef.current.rotation.z = Math.sin(time * 40) * 0.05;
      }
      if (hammerRef.current) {
        hammerRef.current.rotation.z = Math.sin(time * 40) * 0.3;
      }
    }
  });

  return (
    <group position={position}>
      {/* Mounting plate */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.2, 0.2, 0.02]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>

      {/* Bell dome */}
      <mesh ref={bellRef}>
        <sphereGeometry args={[0.08, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Hammer */}
      <mesh ref={hammerRef} position={[0.1, 0, 0.02]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Hammer arm */}
      <mesh position={[0.06, 0, 0]}>
        <boxGeometry args={[0.06, 0.01, 0.01]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
    </group>
  );
};

// Pressure gauge on pipe

export const ExtensionCord: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
}> = ({ start, end, color = '#f97316' }) => {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segments = 20;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      // Add some waviness
      const wave = Math.sin(t * Math.PI * 3) * 0.3;
      const perpX = -(end[2] - start[2]);
      const perpZ = end[0] - start[0];
      const len = Math.sqrt(perpX * perpX + perpZ * perpZ);

      pts.push(new THREE.Vector3(x + (perpX / len) * wave, 0.01, z + (perpZ / len) * wave));
    }

    return pts;
  }, [start, end]);

  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 30, 0.015, 8, false]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Plug at start */}
      <mesh position={start} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.04, 0.02, 0.06]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Socket at end */}
      <mesh position={[end[0], 0.02, end[2]]}>
        <boxGeometry args={[0.06, 0.03, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
};

// ==========================================
// ENVIRONMENTAL STORYTELLING
// ==========================================

// Chalk body outline (safety training prop)

export const ControlPanel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Panel body */}
      <mesh>
        <boxGeometry args={[0.8, 0.6, 0.15]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Panel face */}
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[0.7, 0.5]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>

      {/* Status LEDs */}
      <ControlPanelLED position={[-0.25, 0.15, 0.09]} color="#22c55e" blinkPattern="pulse" />
      <ControlPanelLED position={[-0.15, 0.15, 0.09]} color="#22c55e" blinkPattern="steady" />
      <ControlPanelLED position={[-0.05, 0.15, 0.09]} color="#eab308" blinkPattern="slow" />
      <ControlPanelLED position={[0.05, 0.15, 0.09]} color="#22c55e" blinkPattern="steady" />
      <ControlPanelLED position={[0.15, 0.15, 0.09]} color="#3b82f6" blinkPattern="fast" />
      <ControlPanelLED position={[0.25, 0.15, 0.09]} color="#22c55e" blinkPattern="steady" />

      {/* Buttons */}
      {[
        [-0.2, -0.05],
        [0, -0.05],
        [0.2, -0.05],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
          <meshStandardMaterial color={['#22c55e', '#eab308', '#ef4444'][i]} roughness={0.3} />
        </mesh>
      ))}

      {/* Small display */}
      <mesh position={[0, -0.15, 0.09]}>
        <planeGeometry args={[0.4, 0.1]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
};

// Pipe condensation drip effect - ref-based animation (no setState in useFrame)

export const ControlPanelLED: React.FC<{
  position: [number, number, number];
  color?: string;
  blinkPattern?: 'steady' | 'slow' | 'fast' | 'pulse';
}> = ({ position, color = '#22c55e', blinkPattern = 'steady' }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // LED blinking animation using centralized manager
  const animationId = useMemo(
    () => `control-led-${position.join(',')}-${blinkPattern}`,
    [position, blinkPattern]
  );

  useAmbientAnimation(animationId, (time) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;

    let intensity = 1;
    switch (blinkPattern) {
      case 'slow':
        intensity = Math.sin(time * 1) > 0 ? 1 : 0.1;
        break;
      case 'fast':
        intensity = Math.sin(time * 5) > 0 ? 1 : 0.1;
        break;
      case 'pulse':
        intensity = 0.3 + Math.abs(Math.sin(time * 2)) * 0.7;
        break;
      default:
        intensity = 0.8;
    }

    mat.emissiveIntensity = intensity;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
    </mesh>
  );
};

// Control panel with multiple LEDs

export const VibrationIndicator: React.FC<{
  position: [number, number, number];
  machineId: string;
}> = ({ position, machineId: _machineId }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [vibrationLevel, _setVibrationLevel] = useState(0.5);

  // Vibration animation using centralized manager
  const animationId = useMemo(
    () => `vibration-${position.join(',')}-${_machineId}`,
    [position, _machineId]
  );

  useAmbientAnimation(animationId, (time) => {
    if (!groupRef.current) return;

    // Simulate vibration based on audio manager state
    // In a real implementation, this would read from audio analysis
    const baseVibration = 0.02;
    const audioModulation = Math.sin(time * 20) * 0.01;
    const randomJitter = (Math.random() - 0.5) * 0.005;

    const totalVibration = (baseVibration + audioModulation + randomJitter) * vibrationLevel;

    groupRef.current.position.x = position[0] + (Math.random() - 0.5) * totalVibration;
    groupRef.current.position.y = position[1] + (Math.random() - 0.5) * totalVibration;
    groupRef.current.position.z = position[2] + (Math.random() - 0.5) * totalVibration;
  });

  return <group ref={groupRef} />;
};

// ==========================================
// ENVIRONMENTAL PROPS
// ==========================================

// Stacked pallets in corners

export const PulsingIndicator: React.FC<{
  position: [number, number, number];
  baseColor?: string;
  size?: number;
}> = ({ position, baseColor = '#22c55e', size = 0.1 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Pulsing animation using centralized manager
  const animationId = useMemo(() => `pulsing-indicator-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!meshRef.current || !lightRef.current) return;

    // Pulse based on simulated audio level
    const audioLevel = 0.5 + Math.sin(time * 3) * 0.3 + Math.sin(time * 7) * 0.2;

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = audioLevel;

    lightRef.current.intensity = audioLevel * 0.5;
    meshRef.current.scale.setScalar(1 + audioLevel * 0.1);
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={0.5}
          transparent
          opacity={0.9}
        />
      </mesh>
      <pointLight ref={lightRef} color={baseColor} intensity={0.5} distance={3} />
    </group>
  );
};

// ==========================================
// MICRO-DETAILS - OBSESSIVE PERFECTION
// ==========================================

// Cigarette butts near back door
