import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

// ==========================================
// SAFETY & EMERGENCY EQUIPMENT
// Safety signs, fire equipment, PPE, emergency facilities
// ==========================================

export const SafetySign: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  type: 'exit' | 'caution' | 'danger' | 'ppe';
}> = ({ position, rotation = [0, 0, 0], type }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const [isOn, _setIsOn] = useState(true);

  const colors = {
    exit: '#22c55e',
    caution: '#eab308',
    danger: '#ef4444',
    ppe: '#3b82f6',
  };

  const color = colors[type];

  // Blinking effect for danger signs using centralized manager
  const animationId = useMemo(() => `safety-sign-${position.join(',')}-${type}`, [position, type]);

  useAmbientAnimation(animationId, (time) => {
    if (type === 'danger' && lightRef.current) {
      const blink = Math.sin(time * 4) > 0;
      lightRef.current.intensity = blink ? 0.5 : 0.1;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Sign backing */}
      <mesh>
        <boxGeometry args={[0.6, 0.4, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* Sign face */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.55, 0.35]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>

      {/* Corner lights */}
      {[
        [-0.22, 0.12],
        [0.22, 0.12],
        [-0.22, -0.12],
        [0.22, -0.12],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.025]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={color}
            emissiveIntensity={type === 'danger' ? (isOn ? 1 : 0.2) : 0.5}
          />
        </mesh>
      ))}

      {/* Glow light */}
      <pointLight
        ref={lightRef}
        position={[0, 0, 0.1]}
        color={color}
        intensity={0.3}
        distance={2}
      />
    </group>
  );
};

// Large wall-mounted clock (for placement on factory walls)

export const FireExtinguisherStation: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => {
  const tagRef = useRef<THREE.Mesh>(null);

  // Gentle swaying for the inspection tag using centralized manager
  const animationId = useMemo(() => `fire-ext-tag-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (tagRef.current) {
      tagRef.current.rotation.z = Math.sin(time * 1.5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Wall mount bracket */}
      <mesh position={[0, 1.2, -0.1]}>
        <boxGeometry args={[0.3, 0.15, 0.1]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {/* Extinguisher body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.9, 16]} />
        <meshStandardMaterial color="#dc2626" roughness={0.4} />
      </mesh>

      {/* Top cap */}
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.08, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Handle */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.15, 0.04, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>

      {/* Nozzle */}
      <mesh position={[0.08, 1, 0.08]} rotation={[0.5, 0.3, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.15, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Hose */}
      <mesh position={[0.05, 0.85, 0.1]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Pressure gauge */}
      <mesh position={[0, 0.85, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>

      {/* Inspection tag */}
      <group position={[0.12, 0.9, 0]}>
        <mesh ref={tagRef} position={[0.04, -0.05, 0]}>
          <planeGeometry args={[0.06, 0.1]} />
          <meshStandardMaterial color="#f5f5f5" side={THREE.DoubleSide} />
        </mesh>
        {/* Tag string */}
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.002, 0.002, 0.08, 4]} />
          <meshBasicMaterial color="#94a3b8" />
        </mesh>
      </group>

      {/* Floor marking ring */}
      <mesh
        position={[0, FLOOR_LAYERS.safetyMain, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <ringGeometry args={[0.4, 0.5, 16]} />
        <meshStandardMaterial
          color="#ef4444"
          transparent
          opacity={0.4}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

// Loading dock door that opens/closes - ref-based animation

export const WarningLight: React.FC<{ position: [number, number, number]; isActive: boolean }> = ({
  position,
  isActive,
}) => {
  const lightRef = useRef<THREE.PointLight>(null);

  // Blinking animation using centralized manager
  const animationId = useMemo(() => `warning-light-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (lightRef.current && isActive) {
      lightRef.current.intensity = Math.abs(Math.sin(time * 4)) * 2;
    } else if (lightRef.current) {
      lightRef.current.intensity = 0;
    }
  });

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.15, 16]} />
        <meshStandardMaterial
          color={isActive ? '#f97316' : '#64748b'}
          emissive={isActive ? '#f97316' : '#000000'}
          emissiveIntensity={isActive ? 0.5 : 0}
        />
      </mesh>
      <pointLight ref={lightRef} color="#f97316" intensity={0} distance={5} />
    </group>
  );
};

// Blinking control panel LED

export const FirstAidKit: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Box */}
      <mesh castShadow>
        <boxGeometry args={[0.35, 0.25, 0.1]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
      </mesh>

      {/* Red cross */}
      <mesh position={[0, 0, 0.051]}>
        <boxGeometry args={[0.15, 0.05, 0.001]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      <mesh position={[0, 0, 0.051]}>
        <boxGeometry args={[0.05, 0.15, 0.001]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>

      {/* Handle */}
      <mesh position={[0.12, 0, 0.06]}>
        <boxGeometry args={[0.03, 0.08, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} />
      </mesh>
    </group>
  );
};

// Extension cord snaking across floor

export const EmergencyShower: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Vertical pipe */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 12]} />
        <meshStandardMaterial color="#22c55e" roughness={0.4} />
      </mesh>

      {/* Shower head */}
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.15, 0.12, 0.08, 16]} />
        <meshStandardMaterial color="#22c55e" roughness={0.4} />
      </mesh>

      {/* Shower head perforations */}
      <mesh position={[0, 2.26, 0]} rotation={[Math.PI, 0, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Pull handle */}
      <group position={[0.15, 1.5, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.6} />
        </mesh>
        {/* Triangle pull */}
        <mesh position={[0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.06, 0.15, 3]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      </group>

      {/* Base drain */}
      <mesh
        position={[0, FLOOR_LAYERS.wornPrimary, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <ringGeometry args={[0.3, 0.5, 16]} />
        <meshStandardMaterial
          color="#fbbf24"
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Sign */}
      <mesh position={[0, 2.6, 0.05]}>
        <planeGeometry args={[0.4, 0.2]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
  );
};

// Eye wash station

export const EyeWashStation: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Wall mount base */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[0.5, 0.4, 0.08]} />
        <meshStandardMaterial color="#22c55e" roughness={0.4} />
      </mesh>

      {/* Bowl */}
      <mesh position={[0, -0.1, 0.1]}>
        <sphereGeometry args={[0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#e2e8f0"
          metalness={0.4}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Nozzles */}
      {[-0.06, 0.06].map((x, i) => (
        <group key={i} position={[x, 0.02, 0.08]}>
          <mesh>
            <cylinderGeometry args={[0.015, 0.02, 0.06, 8]} />
            <meshStandardMaterial color="#71717a" metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Push handle */}
      <mesh position={[0, 0.12, 0.15]}>
        <boxGeometry args={[0.25, 0.04, 0.04]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Dust cover (flip-up) */}
      <mesh position={[0, 0.05, 0.12]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.2, 0.01, 0.1]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.8} />
      </mesh>

      {/* Sign above */}
      <mesh position={[0, 0.25, 0]}>
        <planeGeometry args={[0.35, 0.12]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
  );
};

// Ear plug dispenser

export const EarPlugDispenser: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Dispenser body */}
      <mesh>
        <boxGeometry args={[0.15, 0.25, 0.1]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </mesh>

      {/* Clear front */}
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={[0.12, 0.18]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.4} />
      </mesh>

      {/* Ear plugs visible inside (orange/yellow) */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[((i % 2) - 0.5) * 0.04, (Math.floor(i / 2) - 1) * 0.05, 0.03]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#f97316' : '#eab308'} />
        </mesh>
      ))}

      {/* Dispense slot */}
      <mesh position={[0, -0.1, 0.051]}>
        <boxGeometry args={[0.08, 0.03, 0.01]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Label */}
      <mesh position={[0, 0.1, 0.052]}>
        <planeGeometry args={[0.1, 0.04]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
};

// Safety goggles rack

export const SafetyGogglesRack: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Backing board */}
      <mesh>
        <boxGeometry args={[0.5, 0.3, 0.03]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>

      {/* Hooks */}
      {[-0.15, 0, 0.15].map((x, i) => (
        <group key={i} position={[x, -0.05, 0.03]}>
          <mesh rotation={[0.3 + Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.08, 6]} />
            <meshStandardMaterial color="#71717a" metalness={0.7} />
          </mesh>

          {/* Goggles hanging */}
          {i !== 1 && ( // Leave one hook empty
            <group position={[0, -0.06, 0.04]}>
              {/* Strap */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.04, 0.005, 6, 12]} />
                <meshStandardMaterial color={i === 0 ? '#1e293b' : '#3b82f6'} />
              </mesh>
              {/* Lenses */}
              <mesh position={[0, 0, 0.02]}>
                <boxGeometry args={[0.08, 0.03, 0.015]} />
                <meshStandardMaterial color="#0f172a" transparent opacity={0.8} />
              </mesh>
            </group>
          )}
        </group>
      ))}

      {/* Label */}
      <mesh position={[0, 0.1, 0.02]}>
        <planeGeometry args={[0.3, 0.06]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
};

// ==========================================
// MORE LIFE DETAILS
// ==========================================

// Flies buzzing around

export const ChalkOutline: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 256);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);

    // Draw simple body outline
    ctx.beginPath();
    // Head
    ctx.arc(64, 30, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(64, 50);
    ctx.lineTo(64, 140);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(64, 70);
    ctx.lineTo(20, 110);
    ctx.moveTo(64, 70);
    ctx.lineTo(108, 110);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(64, 140);
    ctx.lineTo(30, 230);
    ctx.moveTo(64, 140);
    ctx.lineTo(98, 230);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.2, 2.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

// "Days since last accident" board

export const AccidentBoard: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  days?: number;
}> = ({ position, rotation = [0, 0, 0], days: _days = 47 }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Board backing */}
      <mesh>
        <boxGeometry args={[1, 0.7, 0.05]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.6} />
      </mesh>

      {/* Header */}
      <mesh position={[0, 0.22, 0.03]}>
        <planeGeometry args={[0.9, 0.15]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {/* Days display */}
      <mesh position={[0, -0.05, 0.03]}>
        <planeGeometry args={[0.5, 0.35]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* LED-style number display */}
      <mesh position={[0, -0.05, 0.04]}>
        <planeGeometry args={[0.45, 0.3]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
      </mesh>

      {/* Frame */}
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[1.02, 0.72, 0.02]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.4} />
      </mesh>

      {/* Small safety icon */}
      <mesh position={[-0.35, 0.22, 0.04]}>
        <circleGeometry args={[0.04, 16]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
    </group>
  );
};

// Employee of the month photo frame

