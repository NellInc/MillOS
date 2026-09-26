import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { HeartParticle } from '../effects/HeartParticle';
import { playCritterSound } from '../../utils/critterAudio';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { CreatureBody, type CreatureRigHandle } from '../models/RiggedCreatureModel';

// Hover affordance for petting, matching every other clickable object in the
// scene.
const setPointerCursor = () => {
  document.body.style.cursor = 'pointer';
};
const resetCursor = () => {
  document.body.style.cursor = 'auto';
};

interface CatProps {
  position: [number, number, number];
  rotation?: number;
  color?: string;
  pose?: 'sitting' | 'sleeping';
}

/**
 * The sitting cat's primitive body, kept as the generated cat's fallback.
 *
 * Only the sitting pose is generated. The sleeping cat between the hay bales
 * stays procedural: the generated asset is a sitting animal, and posing its rig
 * into a curl is bespoke work rather than a swap. `color` therefore still
 * selects a coat on the sleeping cat and on this fallback, but the generated
 * sitting cat is one grey tabby wherever it appears.
 */
const CatSittingPrimitive: React.FC<{ color: string; isExcited: boolean }> = ({
  color,
  isExcited,
}) => (
  // The 0.4 lived on the Cat's own group until the generated cat arrived, where
  // it shrank a 0.5 m asset to 0.2 m. It belongs to the primitive, whose parts
  // are authored at 2.5x life size.
  <group scale={0.4}>
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
  </group>
);
CatSittingPrimitive.displayName = 'CatSittingPrimitive';

export const Cat = React.memo<CatProps>(
  ({ position, rotation = 0, color = '#1a1a1a', pose = 'sitting' }) => {
    const isSleeping = pose === 'sleeping';
    const groupRef = useRef<THREE.Group>(null);
    // `CREATURE_SPECS.cat` is `bend: 0` on purpose - a sitting cat does not
    // graze - but `setHeadShake` is not scaled by the spec, so the rig is still
    // the right channel for the pet response. Without this the sitting cat is
    // the one creature in the roster whose skeleton is never driven at all.
    const rigRef = useRef<CreatureRigHandle>(null);
    const heartCounter = useRef(0);
    const [isExcited, setIsExcited] = useState(false);
    const [hearts, setHearts] = useState<{ id: number; pos: [number, number, number] }[]>([]);

    // Handle Petting
    const handlePet = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      playCritterSound('cat');
      setIsExcited(true);
      // Spawn heart above cat (monotonic id avoids key collisions on rapid pets)
      const id = heartCounter.current++;
      setHearts((prev) => [...prev, { id, pos: [0, 1.5, 0] }]);
    };

    // Remove heart
    const removeHeart = (id: number) => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    };

    // A cat unmounted while hovered must not leave the pointer cursor stuck.
    useEffect(() => resetCursor, []);

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

      // The sitting cat's head, on the rig rather than on the group.
      //
      // Excited: a fast lateral shake at half the group's wobble rate, so the
      // head lags the body instead of tracking it - a cat looking round at
      // whoever petted it, not a rigid model shaken as one piece.
      //
      // Idle: a slow, wide look-around. This is the whole of the sitting cat's
      // animation, so without it the one creature on the wishing well is the
      // only body in the roster that never moves at all - and a pet-only
      // response cannot be verified by a motion probe, because a probe does not
      // pet anything. The period is deliberately long and prime-ish against the
      // 0.35 s sample step so successive looks do not land on the same angle.
      const rig = rigRef.current;
      if (!rig || isSleeping) return;
      if (!isExcited && !shouldRunThisFrame(4)) return;
      const time = state.clock.elapsedTime;
      rig.setHeadShake(
        isExcited
          ? Math.sin(time * 10) * 0.3
          : Math.sin(time * 0.23) * 0.45 + Math.sin(time * 0.61) * 0.12
      );
    });

    // Segment counts below stay where they are. The `onClick` on this group puts
    // every mesh under it into R3F's interaction list, so all of them are
    // raycast on each pointer move with no picking proxy to fall back on; and at
    // scale 0.4 the largest part is a 0.48 m sphere, with ears at 64 mm and eyes
    // at 32 mm. A faceted critter is the art direction here, not neglect.
    return (
      <group
        position={position}
        rotation={[0, rotation, 0]}
        onClick={handlePet}
        onPointerOver={setPointerCursor}
        onPointerOut={resetCursor}
      >
        <group ref={groupRef}>
          {isSleeping ? (
            // Sleeping Pose (Curled up). Still primitive: the generated cat is
            // a sitting animal, and posing its rig into a curl is bespoke work
            // rather than a swap. Carries the 0.4 that used to sit on the Cat's
            // own group, where it shrank the 0.5 m generated asset to 0.2 m.
            <group scale={0.4}>
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
            <CreatureBody
              creature="cat"
              ref={rigRef}
              fallback={<CatSittingPrimitive color={color} isExcited={isExcited} />}
            />
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
