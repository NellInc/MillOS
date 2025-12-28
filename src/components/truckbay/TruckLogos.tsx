import React, { useRef, useEffect } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { registerAnimation, unregisterAnimation } from './animationSystem';

const GrainCoLogo: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const xPos = side === 'right' ? 1.61 : -1.61;
  const rotY = side === 'right' ? Math.PI / 2 : -Math.PI / 2;

  return (
    <group position={[xPos, 2.5, 0]} rotation={[0, rotY, 0]}>
      {/* Base panel - deep maroon */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[9, 3.2, 0.08]} />
        <meshStandardMaterial color="#450a0a" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Main panel - rich red */}
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[8.7, 3, 0.05]} />
        <meshStandardMaterial color="#991b1b" metalness={0.35} roughness={0.55} />
      </mesh>

      {/* Gold border frame - top */}
      <mesh position={[0, 1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Gold border frame - bottom */}
      <mesh position={[0, -1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Gold border frame - left */}
      <mesh position={[-4.2, 0, 0.05]}>
        <boxGeometry args={[0.08, 2.72, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Gold border frame - right */}
      <mesh position={[4.2, 0, 0.05]}>
        <boxGeometry args={[0.08, 2.72, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* === SHIELD MEDALLION with WHEAT === */}
      <group position={[-2.8, 0, 0.06]}>
        {/* Shield outer - gold */}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.6, 1.9, 0.06]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Shield bottom point */}
        <mesh position={[0, -1.05, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.6, 0.6, 0.06]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>

        {/* Shield inner - dark */}
        <mesh position={[0, 0.1, 0.04]}>
          <boxGeometry args={[1.35, 1.6, 0.04]} />
          <meshStandardMaterial color="#7f1d1d" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.85, 0.04]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.42, 0.42, 0.04]} />
          <meshStandardMaterial color="#7f1d1d" metalness={0.4} roughness={0.5} />
        </mesh>

        {/* Wheat Icon - 3 stalks with chevron grains */}
        <group position={[0, 0.15, 0.08]}>
          {/* Center stalk */}
          <mesh position={[0, -0.3, 0]}>
            <boxGeometry args={[0.04, 0.6, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Center grain head - chevrons */}
          {[0.4, 0.25, 0.1, -0.05].map((y, i) => (
            <group key={`cg-${i}`} position={[0, y, 0]}>
              <mesh position={[-0.08, 0, 0]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.12, 0.04, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.08, 0, 0]} rotation={[0, 0, -0.5]}>
                <boxGeometry args={[0.12, 0.04, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
            </group>
          ))}

          {/* Left stalk */}
          <mesh position={[-0.25, -0.35, 0]} rotation={[0, 0, 0.15]}>
            <boxGeometry args={[0.035, 0.5, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Left grain head */}
          {[0.3, 0.18, 0.06].map((y, i) => (
            <group key={`lg-${i}`} position={[-0.28 - i * 0.02, y, 0]}>
              <mesh position={[-0.06, 0, 0]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.06, 0, 0]} rotation={[0, 0, -0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
            </group>
          ))}

          {/* Right stalk */}
          <mesh position={[0.25, -0.35, 0]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[0.035, 0.5, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Right grain head */}
          {[0.3, 0.18, 0.06].map((y, i) => (
            <group key={`rg-${i}`} position={[0.28 + i * 0.02, y, 0]}>
              <mesh position={[-0.06, 0, 0]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.06, 0, 0]} rotation={[0, 0, -0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
            </group>
          ))}

          {/* Ribbon tie */}
          <mesh position={[0, -0.55, 0]}>
            <boxGeometry args={[0.5, 0.08, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Ribbon tails */}
          <mesh position={[-0.3, -0.65, 0]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.15, 0.06, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.3, -0.65, 0]} rotation={[0, 0, -0.3]}>
            <boxGeometry args={[0.15, 0.06, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* Company name - GRAIN CO */}
      <Text
        position={[1.3, 0.5, 0.08]}
        fontSize={1.0}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
        fontWeight="bold"
      >
        GRAIN CO
      </Text>

      {/* Decorative line under name */}
      <mesh position={[1.3, 0.05, 0.06]}>
        <boxGeometry args={[4, 0.05, 0.02]} />
        <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Est. banner */}
      <group position={[1.3, -0.35, 0.06]}>
        <mesh>
          <boxGeometry args={[2.8, 0.4, 0.03]} />
          <meshStandardMaterial color="#7f1d1d" metalness={0.3} roughness={0.6} />
        </mesh>
        {/* Banner edge accents */}
        <mesh position={[-1.5, 0, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>
        <mesh position={[1.5, 0, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.22}
          color="#fef3c7"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
        >
          EST. 1952
        </Text>
      </group>

      {/* Tagline */}
      <Text
        position={[1.3, -0.85, 0.08]}
        fontSize={0.2}
        color="#fcd34d"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
      >
        PREMIUM MILLING QUALITY
      </Text>
    </group>
  );
};

// FLOUR EXPRESS Logo - Dynamic arrow design with clock badge
const FlourExpressLogo: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const xPos = side === 'right' ? 1.61 : -1.61;
  const rotY = side === 'right' ? Math.PI / 2 : -Math.PI / 2;

  return (
    <group position={[xPos, 2.5, 0]} rotation={[0, rotY, 0]}>
      {/* Base panel - deep navy */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[9, 3.2, 0.08]} />
        <meshStandardMaterial color="#020617" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Main panel - navy blue */}
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[8.7, 3, 0.05]} />
        <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Blue border frame - top */}
      <mesh position={[0, 1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Blue border frame - bottom */}
      <mesh position={[0, -1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* === FORWARD ARROW ICON === */}
      <group position={[-2.8, 0, 0.06]}>
        {/* Circle background - blue gradient effect */}
        <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.0, 1.0, 0.06, 32]} />
          <meshStandardMaterial color="#1e40af" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* Inner circle */}
        <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.85, 0.85, 0.04, 32]} />
          <meshStandardMaterial color="#1e3a8a" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* Arrow - main shaft */}
        <mesh position={[-0.1, 0, 0.05]}>
          <boxGeometry args={[0.8, 0.25, 0.03]} />
          <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Arrow - head top */}
        <mesh position={[0.35, 0.2, 0.05]} rotation={[0, 0, -0.7]}>
          <boxGeometry args={[0.45, 0.2, 0.03]} />
          <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Arrow - head bottom */}
        <mesh position={[0.35, -0.2, 0.05]} rotation={[0, 0, 0.7]}>
          <boxGeometry args={[0.45, 0.2, 0.03]} />
          <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Speed lines */}
        {[-0.15, 0, 0.15].map((y, i) => (
          <mesh key={i} position={[-0.65 - i * 0.05, y, 0.05]}>
            <boxGeometry args={[0.2 - i * 0.04, 0.04, 0.02]} />
            <meshStandardMaterial color="#60a5fa" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* === DYNAMIC STRIPE behind text === */}
      <mesh position={[0.5, 0, 0.04]} rotation={[0, 0, -0.05]}>
        <boxGeometry args={[5.5, 0.12, 0.02]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.7} roughness={0.25} />
      </mesh>

      {/* Company name - FLOUR */}
      <Text
        position={[0.8, 0.45, 0.08]}
        fontSize={0.9}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.1}
        fontWeight="bold"
      >
        FLOUR
      </Text>

      {/* EXPRESS */}
      <Text
        position={[0.8, -0.35, 0.08]}
        fontSize={0.7}
        color="#60a5fa"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.18}
        fontWeight="bold"
      >
        EXPRESS
      </Text>

      {/* === 24/7 CLOCK BADGE === */}
      <group position={[3.4, 0.6, 0.06]}>
        {/* Outer ring - red */}
        <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.06, 24]} />
          <meshStandardMaterial color="#dc2626" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* Inner circle - white */}
        <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.04, 24]} />
          <meshStandardMaterial color="#fef2f2" metalness={0.3} roughness={0.5} />
        </mesh>

        {/* Clock face marks */}
        {[0, 1, 2, 3].map((_: unknown, i: number) => (
          <mesh
            key={i}
            position={[
              Math.sin((i * Math.PI) / 2) * 0.32,
              Math.cos((i * Math.PI) / 2) * 0.32,
              0.05,
            ]}
          >
            <boxGeometry args={[0.04, 0.08, 0.02]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}

        {/* Clock hands */}
        <mesh position={[0.08, 0.08, 0.05]} rotation={[0, 0, -0.8]}>
          <boxGeometry args={[0.22, 0.03, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.02, -0.06, 0.05]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.15, 0.025, 0.02]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>

        {/* Center dot */}
        <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>

      {/* 24/7 text below clock */}
      <Text
        position={[3.4, -0.1, 0.07]}
        fontSize={0.25}
        color="#dc2626"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        24/7
      </Text>

      {/* Tagline */}
      <Text
        position={[0.5, -0.9, 0.08]}
        fontSize={0.18}
        color="#94a3b8"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        FAST + RELIABLE DELIVERY
      </Text>
    </group>
  );
};

// Mudflap with chains/weights (enhanced version)
// @ts-ignore - unused component kept for future use
const MudflapWithChains: React.FC<{
  position: [number, number, number];
}> = ({ position }) => {
  const chainRefs = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    const chainsId = `mudflap-chains-${Math.random()}`;

    registerAnimation(chainsId, 'custom', null, { chainRefs }, (time, _delta, _mesh, data) => {
      data.chainRefs.current.forEach((chain: THREE.Mesh | null, i: number) => {
        if (chain) {
          chain.rotation.x = Math.sin(time * 2 + i * 0.5) * 0.05;
          chain.rotation.z = Math.sin(time * 1.5 + i * 0.3) * 0.03;
        }
      });
    });

    return () => {
      unregisterAnimation(chainsId);
    };
  }, []);

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.6, 0.7, 0.02]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.32, 0.02]}>
        <boxGeometry args={[0.55, 0.06, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
      </mesh>
      {[-0.2, 0, 0.2].map((x, i) => (
        <group key={i} position={[x, -0.38, 0.02]}>
          {[0, 1, 2, 3].map((j) => (
            <mesh
              key={j}
              ref={(el) => {
                if (el) chainRefs.current[i * 4 + j] = el;
              }}
              position={[0, -j * 0.04, 0]}
            >
              <torusGeometry args={[0.015, 0.004, 6, 8]} />
              <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
            </mesh>
          ))}
          <mesh position={[0, -0.18, 0]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Tire Pressure Monitoring System sensor
// @ts-ignore - unused component kept for future use
const TPMSSensor: React.FC<{
  position: [number, number, number];
  pressure: number;
}> = ({ position, pressure }) => {
  const isLow = pressure < 85;
  const isHigh = pressure > 115;
  const statusColor = isLow ? '#ef4444' : isHigh ? '#f59e0b' : '#22c55e';

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.025, 0]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
};

// Trailer door lock rod handles
// @ts-ignore - unused component kept for future use
const TrailerLockRods: React.FC<{
  position: [number, number, number];
  isLocked: boolean;
}> = ({ position, isLocked }) => {
  const handleRotation = isLocked ? 0 : Math.PI / 4;

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, 3.5, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.6, 0.03]} rotation={[0, 0, handleRotation]}>
        <boxGeometry args={[0.08, 0.15, 0.03]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -1.6, 0.03]} rotation={[0, 0, handleRotation]}>
        <boxGeometry args={[0.08, 0.15, 0.03]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.08, 0, 0.02]} rotation={[0, 0, handleRotation]}>
        <boxGeometry args={[0.15, 0.06, 0.03]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <mesh position={[0.16, 0, 0.02]} rotation={[0, 0, handleRotation]}>
        <cylinderGeometry args={[0.025, 0.025, 0.08, 8]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>
    </group>
  );
};

// Reefer (refrigeration) unit for cold storage trailers
// @ts-ignore - unused component kept for future use
const ReeferUnit: React.FC<{
  position: [number, number, number];
  isRunning: boolean;
}> = ({ position, isRunning }) => {
  const fanRef = useRef<THREE.Group>(null);
  const statusLightRef = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    // Register fan rotation
    const fanId = `reefer-fan-${Math.random()}`;
    if (fanRef.current && isRunning) {
      registerAnimation(fanId, 'rotation', fanRef.current, { axis: 'z', speed: 15 });
    }

    return () => {
      unregisterAnimation(fanId);
    };
  }, [isRunning]);

  useEffect(() => {
    // Register status light pulse
    const lightId = `reefer-light-${Math.random()}`;
    if (statusLightRef.current) {
      registerAnimation(lightId, 'pulse', statusLightRef.current, {
        speed: 3,
        min: isRunning ? 0.6 : 0.1,
        max: isRunning ? 1.0 : 0.1,
      });
    }

    return () => {
      unregisterAnimation(lightId);
    };
  }, [isRunning]);

  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[2.8, 1.2, 0.5]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2, 0.26]}>
        <boxGeometry args={[2.4, 0.8, 0.02]} />
        <meshStandardMaterial color="#1f2937" metalness={0.3} roughness={0.7} />
      </mesh>
      <group ref={fanRef} position={[0, 2, 0.2]}>
        {[0, 1, 2, 3].map((_: unknown, i: number) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.6, 0.12, 0.02]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[1.1, 2.3, 0.26]}>
        <boxGeometry args={[0.4, 0.4, 0.06]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[1.1, 2.45, 0.3]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          ref={statusLightRef}
          color={isRunning ? '#22c55e' : '#ef4444'}
          emissive={isRunning ? '#22c55e' : '#ef4444'}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh position={[1.1, 2.2, 0.3]}>
        <planeGeometry args={[0.25, 0.12]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>
      <Text position={[1.1, 2.2, 0.31]} fontSize={0.06} color="#22c55e" anchorX="center">
        -18°C
      </Text>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[2.2, 0.6, 0.4]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
      </mesh>
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => (
        <mesh key={i} position={[x, 0.8, 0.21]}>
          <boxGeometry args={[0.12, 0.4, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      <mesh position={[-1.2, 0.4, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.5, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
};

// Aerodynamic trailer skirts

export { GrainCoLogo, FlourExpressLogo };
