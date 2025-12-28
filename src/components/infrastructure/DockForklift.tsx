import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useProductionStore } from '../../stores/productionStore';

interface DockForkliftProps {
  position: [number, number, number];
  rotation: [number, number, number];
  cycleOffset?: number;
  dockType?: 'shipping' | 'receiving'; // For truck timing sync
}

/**
 * DockForklift - Animated forklift that picks up crates from dock and deposits them
 *
 * Animation Cycle (loadCycle 0-1):
 * 0.00-0.30: Move forward to dock (empty)
 * 0.30-0.35: At dock, forks raise to pick up crate
 * 0.35-0.40: At dock, forks lower with cargo
 * 0.40-0.70: Move back with cargo
 * 0.70-0.75: At back, forks raise to deposit
 * 0.75-0.80: At back, forks lower (depositing cargo)
 * 0.80-1.00: Idle at back, then new crate fades in at dock
 */
export const DockForklift: React.FC<DockForkliftProps> = React.memo(
  ({ position, rotation, cycleOffset = 0, dockType = 'shipping' }) => {
    const forkliftRef = useRef<THREE.Group>(null);
    const forkRef = useRef<THREE.Group>(null);
    const cargoRef = useRef<THREE.Group>(null);
    const dockCrateRef = useRef<THREE.Group>(null);
    const depositCrateRef = useRef<THREE.Group>(null);
    const outerGroupRef = useRef<THREE.Group>(null);

    // Material refs for dock crate fade-in
    const dockCrateMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

    // Material refs for deposit crate fade
    const depositCrateMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

    // Refs for forklift materials (for truck-aware fade)
    const forkliftMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
    const cargoMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]); // Cargo on forks
    const currentOpacityRef = useRef(1); // For smooth fade transitions

    // Forklift geometry constants
    // Fork group is at z=1.2 relative to forklift, cargo sits at z=0.6 within fork group
    // So when forklift is at zPos, the cargo sits at zPos + 1.2 + 0.6 = zPos + 1.8
    // At pickup (zPos=2), cargo world z = 2 + 1.8 = 3.8
    // Dock crate should be at z=3.8 in forklift local space (since forklift starts offset)
    // But the forklift group position starts at z=-10, and zPos is applied to that
    // So at zPos=2, forklift is actually at z = -10 + 2 = -8 in the outer group
    // Forks tip at local z = 1.2 (fork base) + 1.0 (fork length) = 2.2
    // Cargo center on forks: z = 1.2 + 0.6 = 1.8
    // At pickup, forklift z=-10+2=-8, so world cargo z = -8 + 1.8 = -6.2? No wait...
    // Actually forklift ref position.z = zPos, starting position is [0,0,-10]
    // So position.z of forklift = zPos which ranges -8 to 2
    // Fork tips extend to z = 0.9 (mast) + 0.6 (fork extra) = ~1.5 from forklift origin
    // At zPos=2, forks tips are at 2 + 1.8 (fork group z + cargo offset) ≈ 3.8 in forklift space
    // But we start at -10, so 2 + (-10) = -8... I'm confusing myself.
    // Let's trace: forkliftRef position = [0, 0, -10], then in useFrame we set position.z = zPos
    // So at zPos=2, forkliftRef.position.z = 2, meaning forklift is at [0, 0, 2] relative to outer group
    // Fork group is at [0, forkHeight, 1.2] relative to forklift
    // Cargo is at [0, 0.1, 0.6] relative to fork group
    // So cargo world position (relative to outer group) = (0, forkHeight+0.1, 2 + 1.2 + 0.6) = (0, y, 3.8)
    // Dock crate should be at z=3.8 to align perfectly
    // But forkHeight varies, so when forks are up, cargo is higher
    // For visual match, dock crate pallet should be at floor level (y ≈ 0.08)

    // Fork tips reach: fork at z=0.4 within forkRef, forkRef at z=1.2 within forklift
    // Fork length is 1.2 units, so fork tip at z = 1.2 + 0.4 + 0.6 = 2.2 from forklift
    // At zPos=2, fork tips at 2 + 2.2 = 4.2? Let me check the mesh positions.
    // Fork mesh at [±0.3, 0, 0.4] with boxGeometry [0.1, 0.08, 1.2]
    // Center at z=0.4, length 1.2, so tip at z = 0.4 + 0.6 = 1.0
    // ForkRef at z=1.2, so fork tips at 1.2 + 1.0 = 2.2 from forklift
    // Cargo center at [0, 0.1, 0.6] within forkRef, so at z = 1.2 + 0.6 = 1.8 from forklift
    // At zPos=2, cargo at z = 2 + 1.8 = 3.8
    // Dock crate should be centered at z ≈ 3.8 to align

    useFrame((state, delta) => {
      if (!forkliftRef.current || !forkRef.current) return;

      const time = state.clock.elapsedTime + cycleOffset;
      // Animation speed scales with production speed (0.1 = 10s cycle, 0.3 = 3.3s cycle)
      const productionSpeed = useProductionStore.getState().productionSpeed;
      const animSpeed = 0.15 + productionSpeed * 0.1; // 0.15 to 0.35 based on speed
      const loadCycle = (time * animSpeed) % 1;
      let zPos: number;
      let forkHeight: number;
      let hasCargo: boolean;
      let showDockCrate: boolean;
      let showDepositCrate: boolean;
      let dockCrateOpacity: number = 1; // For fade-in effect

      // Calculate truck docking state (60s cycle, same as TruckBay)
      // TruckBay timing: adjustedTime = time * (productionSpeed * 0.25 + 0.2)
      // Phase durations: ENTER(8) + TURN(6) + BACK(8) + DOCKED(16) + PULLOUT(4) + EXIT(6) + LEAVE(12) = 60s
      // Truck nearby (blocking forklift) from cycle 8s (start turning) to 42s (after pullout)
      const TRUCK_CYCLE = 60;
      // Speed factor uses productionSpeed defined above
      const speedFactor = productionSpeed * 0.25 + 0.2;
      const adjustedTime = state.clock.elapsedTime * speedFactor;

      // Determine if truck is approaching or docked
      let truckNearby = false;
      if (dockType === 'shipping') {
        // Shipping truck uses: cycle = adjustedTime % 60
        const shippingCycle = adjustedTime % TRUCK_CYCLE;
        // Truck is turning/backing/docked from 8s to 42s
        truckNearby = shippingCycle > 6 && shippingCycle < 44; // Small buffer for fadeprospective
      } else {
        // Receiving truck uses: cycle = (adjustedTime + 30) % 60
        const receivingCycle = (adjustedTime + 30) % TRUCK_CYCLE;
        truckNearby = receivingCycle > 6 && receivingCycle < 44;
      }

      // Smoothly fade opacity based on truck proximity
      const targetOpacity = truckNearby ? 0 : 1;
      const fadeSpeed = 2; // Fade over ~0.5 seconds
      currentOpacityRef.current = THREE.MathUtils.lerp(
        currentOpacityRef.current,
        targetOpacity,
        Math.min(1, delta * fadeSpeed)
      );
      const allOpacity = currentOpacityRef.current;

      // Apply opacity to all forklift materials
      forkliftMaterialsRef.current.forEach((mat) => {
        if (mat) {
          mat.opacity = allOpacity;
          mat.transparent = allOpacity < 1;
        }
      });

      // Apply opacity to cargo materials
      cargoMaterialsRef.current.forEach((mat) => {
        if (mat) {
          mat.opacity = allOpacity;
          mat.transparent = allOpacity < 1;
        }
      });

      // Hide entire group if fully faded
      if (outerGroupRef.current) {
        outerGroupRef.current.visible = allOpacity > 0.01;
      }

      // Smoothstep easing function for smooth acceleration/deceleration
      const smoothstep = (t: number): number => t * t * (3 - 2 * t);

      // Animation cycle: Move Forward -> Pickup -> Move Back (forks up) -> Deposit
      if (loadCycle < 0.28) {
        // Move forward to dock (from -8 to 2) - empty, forks down
        const t = loadCycle / 0.28;
        const eased = smoothstep(t); // Smooth acceleration/deceleration
        zPos = THREE.MathUtils.lerp(-8, 2, eased);
        forkHeight = 0;
        hasCargo = false;
        showDockCrate = true; // Crate waiting at dock
        showDepositCrate = false;
      } else if (loadCycle < 0.38) {
        // At dock - raise forks under crate (smooth ease with extended duration)
        const t = (loadCycle - 0.28) / 0.1;
        const eased = smoothstep(t); // Smooth ease in/out
        zPos = 2;
        forkHeight = eased * 0.5; // Raise to carry height with easing
        hasCargo = false; // Crate still on floor until forks lift it
        showDockCrate = true;
        showDepositCrate = false;
      } else if (loadCycle < 0.4) {
        // At dock - forks at carry height, pickup complete
        zPos = 2;
        forkHeight = 0.5; // Stay at carry height
        // Instant transfer - no crossfade
        const pickupDone = loadCycle > 0.39;
        hasCargo = pickupDone;
        showDockCrate = !pickupDone; // Disappears instantly when picked up
        showDepositCrate = false;
      } else if (loadCycle < 0.68) {
        // Move back (carry) - FORKS STAY RAISED
        const t = (loadCycle - 0.4) / 0.28;
        const eased = smoothstep(t); // Smooth acceleration/deceleration
        zPos = THREE.MathUtils.lerp(2, -8, eased);
        forkHeight = 0.5; // Keep forks raised while carrying!
        hasCargo = true;
        showDockCrate = false;
        showDepositCrate = false;
      } else if (loadCycle < 0.8) {
        // At back - lower forks to deposit cargo (smooth ease with extended duration)
        const t = (loadCycle - 0.68) / 0.12;
        const eased = smoothstep(t); // Smooth ease in/out
        zPos = -8;
        forkHeight = 0.5 * (1 - eased); // Lower with easing
        // Instant cargo transfer at end
        const depositDone = t > 0.9;
        hasCargo = !depositDone;
        showDockCrate = false;
        showDepositCrate = depositDone; // Appears instantly when dropped
      } else {
        // Idle at back - wait, then dock crate respawns with fade-in
        const idleProgress = (loadCycle - 0.8) / 0.2;
        zPos = -8;
        forkHeight = 0;
        hasCargo = false;
        showDepositCrate = idleProgress < 0.5; // Visible first half, then disappears
        showDockCrate = idleProgress > 0.6; // New crate appears in second half
        // Fade in from 0.6 to 0.8 of idle phase (first 20% of visibility window)
        if (idleProgress > 0.6 && idleProgress < 0.8) {
          dockCrateOpacity = (idleProgress - 0.6) / 0.2; // 0 to 1 over this range
        } else if (idleProgress >= 0.8) {
          dockCrateOpacity = 1;
        } else {
          dockCrateOpacity = 0;
        }
      }

      forkliftRef.current.position.z = zPos;
      forkRef.current.position.y = forkHeight;

      // Update cargo visibility
      if (cargoRef.current) {
        cargoRef.current.visible = hasCargo;
      }

      // Update dock crate visibility and opacity (fade-in on spawn + truck-aware fade)
      if (dockCrateRef.current) {
        const combinedOpacity = dockCrateOpacity * allOpacity; // Combine spawn fade with truck fade
        dockCrateRef.current.visible = showDockCrate && combinedOpacity > 0.01;
        // Apply combined opacity for both fade effects
        dockCrateMaterialsRef.current.forEach((mat) => {
          mat.opacity = combinedOpacity;
          mat.transparent = combinedOpacity < 1;
        });
      }

      // Update deposit crate visibility with truck-aware fade
      if (depositCrateRef.current) {
        depositCrateRef.current.visible = showDepositCrate && allOpacity > 0.01;
        // Apply allOpacity for truck-aware fade
        depositCrateMaterialsRef.current.forEach((mat) => {
          mat.opacity = allOpacity;
          mat.transparent = allOpacity < 1;
        });
      }
    });

    // Dock crate z position: align with where cargo sits on forks when forklift at zPos=2
    // Cargo at z = zPos + 1.2 (fork group) + 0.6 (cargo offset) = 2 + 1.8 = 3.8
    // But forklift starts at z=-10, so actual forklift z = -10 + zPos = -10 + 2 = -8
    // Wait, forkliftRef.position starts at [0,0,-10], then we SET .z = zPos
    // So forkliftRef.position.z = zPos (overwriting -10)
    // Hmm, actually looking at the JSX: <group ref={forkliftRef} position={[0, 0, -10]}>
    // and in useFrame: forkliftRef.current.position.z = zPos
    // This sets the z component, so at zPos=2, forklift is at [0, 0, 2] (not -10+2)
    // The -10 in JSX is just initial, we overwrite to zPos each frame
    // So at pickup (zPos=2): fork tips at z = 2 + 1.2 + 0.4 + 0.6 = 4.2 (z of forks + extension)
    // Actually fork mesh center is at z=0.4, fork length is 1.2, so tip at z = 0.4 + 0.6 = 1.0
    // Plus forkRef at z=1.2. Plus forklift at zPos=2. Total: 2 + 1.2 + 1.0 = 4.2
    // Cargo on forks is at z = 1.2 + 0.6 = 1.8 from forklift, so at zPos=2: z = 2 + 1.8 = 3.8
    // Therefore dock crate should be at z = 3.8 - but wait, this is in the parent group space
    // The outer <group position={position}> doesn't affect our internal coordinates
    // So dock crate at position={[0, 0, 3.8]} should align with cargo on forks when zPos=2

    // Deposit location: same logic at zPos=-8
    // Cargo z = -8 + 1.8 = -6.2

    return (
      <group ref={outerGroupRef} position={position} rotation={rotation}>
        {/* ===== DOCK CRATE - Waiting at pickup point ===== */}
        {/* Position aligned with where cargo sits on forks when forklift at pickup (zPos=2) */}
        <group ref={dockCrateRef} position={[0, 0, 3.8]}>
          {/* Pallet */}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[1, 0.1, 1]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) dockCrateMaterialsRef.current[0] = mat;
              }}
              color="#92400e"
              roughness={0.9}
              transparent
            />
          </mesh>
          {/* Stacked flour sacks - layer 1 */}
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.9, 0.5, 0.9]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) dockCrateMaterialsRef.current[1] = mat;
              }}
              color="#f5f5f4"
              roughness={0.8}
              transparent
            />
          </mesh>
        </group>

        {/* ===== DEPOSIT CRATE - Dropped off at back ===== */}
        {/* Position aligned with cargo on forks when forklift at deposit (zPos=-8) */}
        <group ref={depositCrateRef} position={[0, 0, -6.2]} visible={false}>
          {/* Pallet */}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[1, 0.1, 1]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) depositCrateMaterialsRef.current[0] = mat;
              }}
              color="#92400e"
              roughness={0.9}
              transparent
            />
          </mesh>
          {/* Stacked flour sacks - layer 1 */}
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.9, 0.5, 0.9]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) depositCrateMaterialsRef.current[1] = mat;
              }}
              color="#f5f5f4"
              roughness={0.8}
              transparent
            />
          </mesh>
        </group>

        {/* ===== FORKLIFT ===== */}
        <group ref={forkliftRef} position={[0, 0, -10]}>
          {/* Forklift body */}
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[1.5, 1, 2]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) forkliftMaterialsRef.current[0] = mat;
              }}
              color="#f59e0b"
              metalness={0.4}
              roughness={0.6}
              transparent
            />
          </mesh>

          {/* Driver cage */}
          <mesh position={[0, 1.4, -0.2]}>
            <boxGeometry args={[1.3, 1.2, 1.2]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) forkliftMaterialsRef.current[1] = mat;
              }}
              color="#374151"
              metalness={0.3}
              roughness={0.7}
              transparent
            />
          </mesh>

          {/* Cage frame */}
          {[
            [-0.6, -0.6],
            [-0.6, 0.6],
            [0.6, -0.6],
            [0.6, 0.6],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x * 0.9, 1.6, -0.2 + z * 0.4]}>
              <cylinderGeometry args={[0.03, 0.03, 1.6, 6]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          ))}

          {/* Mast */}
          <mesh position={[0, 1.2, 0.9]}>
            <boxGeometry args={[0.15, 2, 0.15]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) forkliftMaterialsRef.current[2] = mat;
              }}
              color="#1f2937"
              metalness={0.6}
              roughness={0.3}
              transparent
            />
          </mesh>
          <mesh position={[0.4, 1.2, 0.9]}>
            <boxGeometry args={[0.15, 2, 0.15]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) forkliftMaterialsRef.current[3] = mat;
              }}
              color="#1f2937"
              metalness={0.6}
              roughness={0.3}
              transparent
            />
          </mesh>

          {/* Forks */}
          <group ref={forkRef} position={[0, 0.3, 1.2]}>
            <mesh position={[-0.3, 0, 0.4]}>
              <boxGeometry args={[0.1, 0.08, 1.2]} />
              <meshStandardMaterial
                ref={(mat) => {
                  if (mat) forkliftMaterialsRef.current[4] = mat;
                }}
                color="#64748b"
                metalness={0.7}
                roughness={0.3}
                transparent
              />
            </mesh>
            <mesh position={[0.3, 0, 0.4]}>
              <boxGeometry args={[0.1, 0.08, 1.2]} />
              <meshStandardMaterial
                ref={(mat) => {
                  if (mat) forkliftMaterialsRef.current[5] = mat;
                }}
                color="#64748b"
                metalness={0.7}
                roughness={0.3}
                transparent
              />
            </mesh>
            {/* Fork backrest */}
            <mesh position={[0, 0.4, -0.1]}>
              <boxGeometry args={[0.9, 0.8, 0.05]} />
              <meshStandardMaterial
                ref={(mat) => {
                  if (mat) forkliftMaterialsRef.current[6] = mat;
                }}
                color="#374151"
                transparent
              />
            </mesh>

            {/* Cargo on forks (visible only when carrying) */}
            <group ref={cargoRef} position={[0, 0.1, 0.6]} visible={false}>
              {/* Pallet */}
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[1, 0.1, 1]} />
                <meshStandardMaterial
                  ref={(mat) => {
                    if (mat) cargoMaterialsRef.current[0] = mat;
                  }}
                  color="#d4a373"
                  transparent
                />
              </mesh>
              {/* Flour sacks */}
              <mesh position={[0, 0.3, 0]}>
                <boxGeometry args={[0.9, 0.5, 0.9]} />
                <meshStandardMaterial
                  ref={(mat) => {
                    if (mat) cargoMaterialsRef.current[1] = mat;
                  }}
                  color="#e5e7eb"
                  transparent
                />
              </mesh>
            </group>
          </group>

          {/* Wheels */}
          {[
            [-0.6, 0.3, 0.6],
            [0.6, 0.3, 0.6],
            [-0.6, 0.3, -0.6],
            [0.6, 0.3, -0.6],
          ].map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.3, 0.3, 0.3, 16]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          ))}
        </group>
      </group>
    );
  }
);
