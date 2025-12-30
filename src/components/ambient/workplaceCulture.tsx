import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// ==========================================
// WORKPLACE CULTURE
// Break room items, displays, decorations, time-keeping
// ==========================================

export const VendingMachine: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const glowRef = useRef<THREE.Mesh>(null);

  // Vending machine glow animation using centralized manager
  const animationId = useMemo(() => `vending-machine-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.1;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Main body */}
      <mesh castShadow>
        <boxGeometry args={[0.8, 1.8, 0.7]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Display window */}
      <mesh ref={glowRef} position={[0, 0.3, 0.36]}>
        <planeGeometry args={[0.65, 0.9]} />
        <meshStandardMaterial color="#1e293b" emissive="#60a5fa" emissiveIntensity={0.3} />
      </mesh>

      {/* Product rows */}
      {[-0.2, 0, 0.2, 0.4].map((y, row) => (
        <group key={row} position={[0, y, 0.2]}>
          {[-0.2, 0, 0.2].map((x, col) => (
            <mesh key={col} position={[x, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
              <meshStandardMaterial color={['#ef4444', '#3b82f6', '#22c55e', '#eab308'][row]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Coin slot */}
      <mesh position={[0.25, 0, 0.36]}>
        <boxGeometry args={[0.08, 0.15, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Retrieval bin */}
      <mesh position={[0, -0.7, 0.36]}>
        <boxGeometry args={[0.4, 0.2, 0.05]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Logo area */}
      <mesh position={[0, 0.8, 0.36]}>
        <planeGeometry args={[0.5, 0.15]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
};

// Time clock punch station

export const TimeClockStation: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const displayRef = useRef<THREE.Mesh>(null);

  // Time clock display animation using centralized manager
  const animationId = useMemo(() => `time-clock-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (displayRef.current) {
      const mat = displayRef.current.material as THREE.MeshStandardMaterial;
      // Blinking colon effect
      mat.emissiveIntensity = Math.floor(time * 2) % 2 === 0 ? 0.5 : 0.3;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Main unit */}
      <mesh>
        <boxGeometry args={[0.3, 0.4, 0.12]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Digital display */}
      <mesh ref={displayRef} position={[0, 0.08, 0.061]}>
        <planeGeometry args={[0.2, 0.08]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.5} />
      </mesh>

      {/* Card slot */}
      <mesh position={[0, -0.08, 0.061]}>
        <boxGeometry args={[0.15, 0.01, 0.02]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Keypad */}
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} position={[((i % 3) - 1) * 0.04, -0.02 - Math.floor(i / 3) * 0.035, 0.062]}>
          <boxGeometry args={[0.03, 0.025, 0.01]} />
          <meshStandardMaterial color="#52525b" roughness={0.5} />
        </mesh>
      ))}

      {/* Card rack beside */}
      <mesh position={[0.22, 0, 0]}>
        <boxGeometry args={[0.12, 0.35, 0.08]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>

      {/* Time cards in rack */}
      {[-0.1, -0.05, 0, 0.05, 0.1].map((y, i) => (
        <mesh key={i} position={[0.22, y, 0.045]} visible={Math.random() > 0.3}>
          <boxGeometry args={[0.08, 0.04, 0.002]} />
          <meshStandardMaterial color="#fef3c7" />
        </mesh>
      ))}
    </group>
  );
};

// Old calendar on wall

export const WallCalendar: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const pageRef = useRef<THREE.Mesh>(null);

  // Subtle page flutter using centralized manager
  const animationId = useMemo(() => `wall-calendar-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (pageRef.current) {
      pageRef.current.rotation.x = Math.sin(time * 0.5) * 0.02;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Calendar backing */}
      <mesh>
        <boxGeometry args={[0.25, 0.35, 0.01]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>

      {/* Picture area (faded) */}
      <mesh position={[0, 0.08, 0.006]}>
        <planeGeometry args={[0.22, 0.18]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>

      {/* Date grid */}
      <mesh ref={pageRef} position={[0, -0.1, 0.008]}>
        <planeGeometry args={[0.22, 0.12]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
      </mesh>

      {/* Month header */}
      <mesh position={[0, 0.02, 0.007]}>
        <planeGeometry args={[0.15, 0.03]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>

      {/* Hanging hole */}
      <mesh position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.015, 8]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
};

// Forgotten birthday decorations

export const BirthdayDecorations: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => {
  const balloonRef = useRef<THREE.Group>(null);
  const streamersRef = useRef<THREE.Group>(null);

  // Birthday decoration animation using centralized manager
  const animationId = useMemo(() => `birthday-decor-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (balloonRef.current) {
      balloonRef.current.rotation.z = Math.sin(time * 0.5) * 0.1;
      balloonRef.current.position.y = Math.sin(time * 0.3) * 0.02;
    }
    if (streamersRef.current) {
      streamersRef.current.children.forEach((streamer, i) => {
        streamer.rotation.z = Math.sin(time * 0.8 + i) * 0.15;
      });
    }
  });

  return (
    <group position={position}>
      {/* Deflated balloons (sad, drooping) */}
      <group ref={balloonRef}>
        {/* Balloon 1 - partially deflated */}
        <mesh position={[-0.1, 0.3, 0]}>
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshStandardMaterial color="#ef4444" roughness={0.6} />
        </mesh>
        <mesh position={[-0.1, 0.2, 0]}>
          <cylinderGeometry args={[0.002, 0.002, 0.15, 4]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>

        {/* Balloon 2 - more deflated */}
        <mesh position={[0.05, 0.25, 0.05]} scale={[1, 0.7, 1]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.6} />
        </mesh>
        <mesh position={[0.05, 0.17, 0.05]}>
          <cylinderGeometry args={[0.002, 0.002, 0.12, 4]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
      </group>

      {/* Drooping streamers */}
      <group ref={streamersRef}>
        {[
          { color: '#ef4444', x: -0.15 },
          { color: '#eab308', x: 0 },
          { color: '#22c55e', x: 0.15 },
        ].map((s, i) => (
          <mesh key={i} position={[s.x, 0, 0]} rotation={[0, 0, 0.2 * (i - 1)]}>
            <planeGeometry args={[0.02, 0.4]} />
            <meshStandardMaterial
              color={s.color}
              side={THREE.DoubleSide}
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}
      </group>

      {/* Faded "HAPPY BIRTHDAY" banner piece */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, 0.1]}>
        <planeGeometry args={[0.4, 0.08]} />
        <meshStandardMaterial color="#fde047" transparent opacity={0.5} />
      </mesh>
    </group>
  );
};

// ==========================================
// MORE INDUSTRIAL DETAILS
// ==========================================

// PA system speaker horn

export const Graffiti: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  type?: 'tag' | 'drawing' | 'message';
}> = ({ position, rotation = [0, 0, 0], type = 'tag' }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 64);

    switch (type) {
      case 'tag': {
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(50, 50, 50, 0.6)';
        const tags = ['JAKE WUZ HERE', 'B.M. 2019', 'MILL CREW', 'SHIFT 3'];
        ctx.fillText(tags[Math.floor(Math.random() * tags.length)], 10, 40);
        break;
      }
      case 'drawing':
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
        ctx.lineWidth = 2;
        // Simple smiley
        ctx.beginPath();
        ctx.arc(64, 32, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(56, 28, 3, 0, Math.PI * 2);
        ctx.arc(72, 28, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(64, 32, 12, 0.2, Math.PI - 0.2);
        ctx.stroke();
        break;
      case 'message':
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(40, 40, 40, 0.5)';
        ctx.fillText('CALL MOM', 10, 25);
        ctx.fillText('555-0123', 10, 45);
        break;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [type]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[0.8, 0.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// Bulletin board with pinned notices

export const BulletinBoard: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const paperRef = useRef<THREE.Group>(null);

  // Gentle paper flutter using centralized manager
  const animationId = useMemo(() => `bulletin-board-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (paperRef.current) {
      paperRef.current.children.forEach((paper, i) => {
        paper.rotation.z = Math.sin(time * 2 + i * 0.5) * 0.02;
      });
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Cork board */}
      <mesh>
        <boxGeometry args={[1.2, 0.9, 0.05]} />
        <meshStandardMaterial color="#b45309" roughness={0.9} />
      </mesh>

      {/* Frame */}
      {[
        [-0.6, 0],
        [0.6, 0],
        [0, -0.45],
        [0, 0.45],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.03]} rotation={[0, 0, i < 2 ? 0 : Math.PI / 2]}>
          <boxGeometry args={[0.05, i < 2 ? 0.95 : 1.25, 0.03]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
      ))}

      {/* Pinned papers */}
      <group ref={paperRef}>
        {/* Safety notice */}
        <group position={[-0.35, 0.2, 0.04]}>
          <mesh>
            <planeGeometry args={[0.3, 0.4]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.18, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>

        {/* Schedule */}
        <group position={[0.1, 0.15, 0.04]}>
          <mesh rotation={[0, 0, 0.1]}>
            <planeGeometry args={[0.35, 0.3]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
          </mesh>
          <mesh position={[0.1, 0.1, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        </group>

        {/* Memo */}
        <group position={[0.35, -0.1, 0.04]}>
          <mesh rotation={[0, 0, -0.15]}>
            <planeGeometry args={[0.25, 0.25]} />
            <meshStandardMaterial color="#fde047" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.1, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </group>

        {/* Photo */}
        <group position={[-0.3, -0.2, 0.04]}>
          <mesh rotation={[0, 0, 0.05]}>
            <planeGeometry args={[0.2, 0.15]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
          </mesh>
          <mesh position={[-0.05, 0.06, 0.01]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>

        {/* Flyer */}
        <group position={[0, -0.25, 0.04]}>
          <mesh rotation={[0, 0, -0.08]}>
            <planeGeometry args={[0.28, 0.2]} />
            <meshStandardMaterial color="#bfdbfe" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.08, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// Scorch marks near welding/hot areas

export const EmployeeOfMonth: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[0.4, 0.5, 0.03]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>

      {/* Photo area */}
      <mesh position={[0, 0.05, 0.02]}>
        <planeGeometry args={[0.28, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>

      {/* Silhouette placeholder */}
      <mesh position={[0, 0.08, 0.025]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, -0.02, 0.025]}>
        <planeGeometry args={[0.15, 0.1]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>

      {/* Name plate */}
      <mesh position={[0, -0.17, 0.02]}>
        <planeGeometry args={[0.3, 0.08]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.5} />
      </mesh>

      {/* Star decoration */}
      <mesh position={[0, 0.2, 0.025]}>
        <circleGeometry args={[0.02, 5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
};

// Old radio playing static

export const OldRadio: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const speakerRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Radio animation using centralized manager
  const animationId = useMemo(() => `old-radio-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (speakerRef.current) {
      // Subtle vibration from "playing"
      speakerRef.current.scale.z = 1 + Math.sin(time * 30) * 0.02;
    }
    if (lightRef.current) {
      // Flickering dial light
      lightRef.current.intensity = 0.2 + Math.random() * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Radio body */}
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.2, 0.15]} />
        <meshStandardMaterial color="#78350f" roughness={0.7} />
      </mesh>

      {/* Speaker grille */}
      <mesh ref={speakerRef} position={[0.05, 0, 0.08]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>

      {/* Tuning dial */}
      <mesh position={[-0.08, 0.02, 0.08]}>
        <planeGeometry args={[0.08, 0.04]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.3} />
      </mesh>

      {/* Dial light */}
      <pointLight
        ref={lightRef}
        position={[-0.08, 0.02, 0.1]}
        color="#fef3c7"
        intensity={0.2}
        distance={0.5}
      />

      {/* Knobs */}
      {[-0.1, -0.05].map((x, i) => (
        <mesh key={i} position={[x, -0.06, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.02, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
      ))}

      {/* Antenna */}
      <mesh position={[0.12, 0.2, 0]}>
        <cylinderGeometry args={[0.003, 0.002, 0.3, 6]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} />
      </mesh>

      {/* Handle */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.15, 0.02, 0.02]} />
        <meshStandardMaterial color="#a16207" roughness={0.6} />
      </mesh>
    </group>
  );
};

// ==========================================
// INDUSTRIAL SAFETY EQUIPMENT
// ==========================================

// Emergency shower station

export const FactoryWallClock: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const secondHandRef = useRef<THREE.Mesh>(null);

  const hourAngle = ((gameTime % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  const minuteAngle = (((gameTime % 1) * 60) / 60) * Math.PI * 2 - Math.PI / 2;

  // Animate second hand using centralized manager
  const animationId = useMemo(() => `factory-clock-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (secondHandRef.current) {
      const seconds = (time * 10) % 60;
      const secondAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
      secondHandRef.current.rotation.z = -secondAngle;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Clock body */}
      <mesh>
        <cylinderGeometry args={[0.6, 0.6, 0.1, 32]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Clock face */}
      <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>

      {/* Clock rim */}
      <mesh position={[0, 0, 0.06]}>
        <torusGeometry args={[0.55, 0.05, 8, 32]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Hour markers */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const isHour = i % 3 === 0;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.45, 0.065, Math.cos(angle) * 0.45]}
            rotation={[Math.PI / 2, 0, -angle]}
          >
            <boxGeometry args={[0.03, isHour ? 0.1 : 0.05, 0.02]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        );
      })}

      {/* Hour hand */}
      <group position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, -hourAngle]}>
        <mesh position={[0.12, 0, 0]}>
          <boxGeometry args={[0.25, 0.04, 0.015]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* Minute hand */}
      <group position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, -minuteAngle]}>
        <mesh position={[0.17, 0, 0]}>
          <boxGeometry args={[0.35, 0.025, 0.012]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      </group>

      {/* Second hand */}
      <group ref={secondHandRef} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0.18, 0, 0]}>
          <boxGeometry args={[0.38, 0.012, 0.008]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      </group>

      {/* Center cap */}
      <mesh position={[0, 0.085, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>

      {/* Backlight glow */}
      <pointLight position={[0, 0.2, 0]} color="#fef3c7" intensity={0.2} distance={2} />
    </group>
  );
};

// Fire extinguisher station with animated inspection tag
