import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { HeartParticle } from '../effects/HeartParticle';
import { playCritterSound } from '../../utils/critterAudio';

interface CatProps {
  position: [number, number, number];
  rotation?: number;
  color?: string;
  pose?: 'sitting' | 'sleeping';
}

export const Cat = React.memo<CatProps>(
  ({ position, rotation = 0, color = '#1a1a1a', pose = 'sitting' }) => {
    const isSleeping = pose === 'sleeping';
    const groupRef = useRef<THREE.Group>(null);
    const [isExcited, setIsExcited] = useState(false);
    const [hearts, setHearts] = useState<{ id: number; pos: [number, number, number] }[]>([]);

    // Handle Petting
    const handlePet = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      playCritterSound('cat');
      setIsExcited(true);
      // Spawn heart above cat
      const id = Date.now();
      setHearts((prev) => [...prev, { id, pos: [0, 1.5, 0] }]);
    };

    // Remove heart
    const removeHeart = (id: number) => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    };

    // Reset excitement
    useEffect(() => {
      if (isExcited) {
        const timer = setTimeout(() => setIsExcited(false), 1000);
        return () => clearTimeout(timer);
      }
    }, [isExcited]);

    // Animation
    useFrame((state) => {
      if (!groupRef.current) return;

      let yOffset = 0;
      let rOffset = 0;

      if (isExcited) {
        const t = state.clock.elapsedTime * 20;
        // Purr wobble / Happy wiggle
        rOffset = Math.sin(t) * 0.1;
        if (!isSleeping) {
          yOffset = Math.abs(Math.sin(t * 0.5)) * 0.2; // Little jumps if sitting
        }
      }

      groupRef.current.rotation.z = rOffset; // Wiggle side to side
      if (!isSleeping) groupRef.current.position.y = yOffset;
    });

    return (
      <group position={position} rotation={[0, rotation, 0]} scale={0.4} onClick={handlePet}>
        <group ref={groupRef}>
          {isSleeping ? (
            // Sleeping Pose (Curled up)
            <group>
              {/* Curled Body */}
              <mesh position={[0, 0.3, 0]} castShadow>
                <sphereGeometry args={[0.6, 12, 12]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* Head tucked in */}
              <mesh position={[0.4, 0.3, 0.2]} rotation={[0, 0, 0.5]} castShadow>
                <sphereGeometry args={[0.35, 12, 12]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* Ears (Lower/Relaxed) */}
              {[-0.15, 0.15].map((x, i) => (
                <mesh
                  key={i}
                  position={[0.4 + x, 0.55, 0.2]}
                  rotation={[0, 0, i === 0 ? 0.4 : 0.6]}
                >
                  <coneGeometry args={[0.08, 0.2, 8]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              ))}
              {/* Tail wrapped around */}
              <mesh position={[-0.4, 0.2, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.5, 0.1, 6, 12, Math.PI]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* Closed Eyes (Sleepy lines) */}
              {[-0.12, 0.12].map((x, i) => (
                <mesh
                  key={i}
                  position={[0.4 + x, 0.4, 0.48]}
                  rotation={[0, 0, i === 0 ? -0.2 : 0.2]}
                >
                  <boxGeometry args={[0.12, 0.02, 0.02]} />
                  <meshStandardMaterial color="#000" />
                </mesh>
              ))}
            </group>
          ) : (
            // Sitting Pose
            <group>
              {/* Body (Sitting) */}
              <mesh position={[0, 0.6, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.4, 1.2, 12]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* Head */}
              <mesh position={[0, 1.4, 0.2]} castShadow>
                <sphereGeometry args={[0.35, 12, 12]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* Ears */}
              {[-0.15, 0.15].map((x, i) => (
                <mesh key={i} position={[x, 1.7, 0.2]} rotation={[0, 0, i === 0 ? 0.2 : -0.2]}>
                  <coneGeometry args={[0.08, 0.25, 8]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              ))}
              {/* Tail (Curled around) */}
              <mesh position={[0.4, 0.2, 0.2]} rotation={[0, 0, -0.5]}>
                <torusGeometry args={[0.4, 0.08, 6, 12, 2.5]} />
                <meshStandardMaterial color={color} />
              </mesh>
              {/* Eyes (Glowing/Open) */}
              {[-0.12, 0.12].map((x, i) => (
                <mesh key={i} position={[x, 1.5, 0.48]}>
                  <sphereGeometry args={[0.04, 8, 8]} />
                  <meshStandardMaterial
                    color={isExcited ? '#ef4444' : '#fbbf24'}
                    emissive={isExcited ? '#ef4444' : '#fbbf24'}
                    emissiveIntensity={0.5}
                  />
                </mesh>
              ))}
            </group>
          )}
        </group>
        {/* Local Hearts */}
        {hearts.map((h) => (
          <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
        ))}
      </group>
    );
  }
);

Cat.displayName = 'Cat';
