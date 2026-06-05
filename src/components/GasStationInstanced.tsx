import * as THREE from 'three';
import React, { useRef, useMemo, useEffect } from 'react';
import { SceneText as Text } from './shared/SceneText';

// ============================================================================
// Module-level shared geometries (singleton instances)
// ============================================================================
const GEOMETRIES = {
  shelfProduct: new THREE.BoxGeometry(0.15, 0.25, 0.2),
  drinkBottle: new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8),
  canopyColumn: new THREE.CylinderGeometry(0.25, 0.25, 5, 8),
  magazine: new THREE.BoxGeometry(0.6, 0.35, 0.02),
  // Pump hose/handle geometries
  hoseSegment: new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6),
  nozzleHandle: new THREE.BoxGeometry(0.06, 0.15, 0.04),
  nozzleSpout: new THREE.CylinderGeometry(0.015, 0.012, 0.12, 6),
  hoseConnector: new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6),
};

// ============================================================================
// Module-level shared materials (singleton instances with vertexColors)
// ============================================================================
const MATERIALS = {
  shelfProduct: new THREE.MeshStandardMaterial({
    color: '#ffffff', // White base - instance colors will tint this
    roughness: 0.3,
    metalness: 0.1,
  }),
  drinkBottle: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.15,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85,
  }),
  canopyColumn: new THREE.MeshStandardMaterial({
    color: '#9e9e9e',
    roughness: 0.4,
    metalness: 0.3,
  }),
  magazine: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.4,
  }),
  // Pump hose/handle materials
  hose: new THREE.MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.8,
  }),
  nozzleMetal: new THREE.MeshStandardMaterial({
    color: '#2d2d2d',
    roughness: 0.4,
    metalness: 0.6,
  }),
  nozzleGrip: new THREE.MeshStandardMaterial({
    color: '#1565c0', // Blue grip (could also be green/red for fuel types)
    roughness: 0.6,
  }),
};

// ============================================================================
// Color definitions - bright, saturated retail product colors
// ============================================================================
const SHELF_PRODUCT_COLORS = ['#ff1744', '#ffea00', '#00e676', '#2979ff', '#d500f9']; // Vivid red, yellow, green, blue, purple
const DRINK_BOTTLE_COLORS = ['#ff1744', '#00e676', '#ff9100', '#00b0ff']; // Red, green, orange, cyan
const MAGAZINE_COLORS = ['#ff5252', '#448aff', '#ffff00']; // Red, blue, bright yellow

// ============================================================================
// Instanced Gas Station Component
// ============================================================================
interface GasStationProps {
  position?: [number, number, number];
  rotation?: number;
}

export const GasStation = React.memo<GasStationProps>(
  ({ position = [-85, 0, 140], rotation = 0 }) => {
    // Refs for instanced meshes
    const shelfProductsRef = useRef<THREE.InstancedMesh>(null);
    const drinkBottlesRef = useRef<THREE.InstancedMesh>(null);
    const canopyColumnsRef = useRef<THREE.InstancedMesh>(null);
    const magazinesRef = useRef<THREE.InstancedMesh>(null);
    // Pump hose/nozzle refs (4 pumps total)
    const hoseSegmentsRef = useRef<THREE.InstancedMesh>(null);
    const hoseConnectorsRef = useRef<THREE.InstancedMesh>(null);
    const nozzleHandlesRef = useRef<THREE.InstancedMesh>(null);
    const nozzleSpoutsRef = useRef<THREE.InstancedMesh>(null);

    // Pre-compute shelf product positions and colors (3 shelves x 5 products = 15)
    const shelfProductData = useMemo(() => {
      const positions: [number, number, number][] = [];
      const colors: THREE.Color[] = [];

      // Shop interior offset: [-12, 0, 0] relative to gas station
      // Shelf unit offset: [-3, 0, 0] relative to interior
      // Combined: [-15, 0, 0] relative to gas station center
      const baseX = -15 + 0.35; // -12 (interior) + -3 (shelf) + 0.35 (product offset)
      const shelfYValues = [0.9, 1.7, 2.5]; // Three shelf heights
      const zPositions = [-2, -1, 0, 1, 2]; // 5 products per shelf

      shelfYValues.forEach((y) => {
        zPositions.forEach((zIdx, prodIdx) => {
          positions.push([baseX, y + 0.15, zIdx * 0.9]);
          colors.push(new THREE.Color(SHELF_PRODUCT_COLORS[prodIdx]));
        });
      });

      return { positions, colors };
    }, []);

    // Pre-compute drink bottle positions and colors (4 columns x 3 rows = 12)
    const drinkBottleData = useMemo(() => {
      const positions: [number, number, number][] = [];
      const colors: THREE.Color[] = [];

      // Shop interior offset: [-12, 0, 0]
      // Fridge offset: [0, 0, -4]
      // Combined: [-12, 0, -4] relative to gas station center
      const baseX = -12;
      const baseZ = -4 + 0.1; // Fridge z + offset
      const xPositions = [-1.2, -0.4, 0.4, 1.2]; // 4 columns
      const yPositions = [0.6, 1.5, 2.4]; // 3 rows

      xPositions.forEach((x, colIdx) => {
        yPositions.forEach((y) => {
          positions.push([baseX + x, y, baseZ]);
          colors.push(new THREE.Color(DRINK_BOTTLE_COLORS[colIdx]));
        });
      });

      return { positions, colors };
    }, []);

    // Pre-compute canopy column positions (4 columns)
    const canopyColumnData = useMemo(() => {
      const positions: [number, number, number][] = [
        [-6, 2.5, -4],
        [-6, 2.5, 4],
        [6, 2.5, -4],
        [6, 2.5, 4],
      ];
      return { positions };
    }, []);

    // Pre-compute magazine positions and colors (3 magazines)
    const magazineData = useMemo(() => {
      const positions: [number, number, number][] = [];
      const rotations: THREE.Euler[] = [];
      const colors: THREE.Color[] = [];

      // Shop interior offset: [-12, 0, 0]
      // Magazine rack offset: [1.5, 0, 3]
      // Combined: [-10.5, 0, 3] relative to gas station center
      const baseX = -10.5;
      const baseZ = 3 + 0.22; // rack z + offset
      const yOffsets = [0, 0.3, 0.6];

      yOffsets.forEach((yOffset, i) => {
        positions.push([baseX, 0.2 + yOffset * 0.5, baseZ]);
        rotations.push(new THREE.Euler(0.3, 0, 0));
        colors.push(new THREE.Color(MAGAZINE_COLORS[i]));
      });

      return { positions, rotations, colors };
    }, []);

    // Pre-compute pump hose/nozzle positions (4 pumps: 2 pairs back-to-back)
    const pumpHoseData = useMemo(() => {
      const hoseMatrices: THREE.Matrix4[] = [];
      const connectorMatrices: THREE.Matrix4[] = [];
      const handleMatrices: THREE.Matrix4[] = [];
      const spoutMatrices: THREE.Matrix4[] = [];

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();

      // New layout: pump pairs at x = -3 and +3, each pair back-to-back at z = ±0.9
      const pairXPositions = [-3, 3];

      pairXPositions.forEach((pairX) => {
        // Pump facing +Z (at z=0.9, rotated 90° around Y)
        // Hose hangs toward +Z direction
        const plusZPumpZ = 0.9;
        pos.set(pairX, 0.5, plusZPumpZ + 0.5);
        quaternion.setFromEuler(new THREE.Euler(-0.4, 0, 0)); // Angle toward +Z
        matrix.compose(pos, quaternion, scale);
        hoseMatrices.push(matrix.clone());

        pos.set(pairX, 0.55, plusZPumpZ + 0.35);
        quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
        matrix.compose(pos, quaternion, scale);
        connectorMatrices.push(matrix.clone());

        pos.set(pairX, 0.25, plusZPumpZ + 0.65);
        quaternion.setFromEuler(new THREE.Euler(-0.3, 0, 0));
        matrix.compose(pos, quaternion, scale);
        handleMatrices.push(matrix.clone());

        pos.set(pairX, 0.15, plusZPumpZ + 0.75);
        quaternion.setFromEuler(new THREE.Euler(-0.8, 0, 0));
        matrix.compose(pos, quaternion, scale);
        spoutMatrices.push(matrix.clone());

        // Pump facing -Z (at z=-0.9, rotated -90° around Y)
        // Hose hangs toward -Z direction
        const minusZPumpZ = -0.9;
        pos.set(pairX, 0.5, minusZPumpZ - 0.5);
        quaternion.setFromEuler(new THREE.Euler(0.4, 0, 0)); // Angle toward -Z
        matrix.compose(pos, quaternion, scale);
        hoseMatrices.push(matrix.clone());

        pos.set(pairX, 0.55, minusZPumpZ - 0.35);
        quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
        matrix.compose(pos, quaternion, scale);
        connectorMatrices.push(matrix.clone());

        pos.set(pairX, 0.25, minusZPumpZ - 0.65);
        quaternion.setFromEuler(new THREE.Euler(0.3, 0, 0));
        matrix.compose(pos, quaternion, scale);
        handleMatrices.push(matrix.clone());

        pos.set(pairX, 0.15, minusZPumpZ - 0.75);
        quaternion.setFromEuler(new THREE.Euler(0.8, 0, 0));
        matrix.compose(pos, quaternion, scale);
        spoutMatrices.push(matrix.clone());
      });

      return { hoseMatrices, connectorMatrices, handleMatrices, spoutMatrices };
    }, []);

    // Initialize shelf products
    useEffect(() => {
      if (!shelfProductsRef.current) return;

      const matrix = new THREE.Matrix4();
      shelfProductData.positions.forEach((pos, i) => {
        matrix.setPosition(pos[0], pos[1], pos[2]);
        shelfProductsRef.current!.setMatrixAt(i, matrix);
        shelfProductsRef.current!.setColorAt(i, shelfProductData.colors[i]);
      });
      shelfProductsRef.current.instanceMatrix.needsUpdate = true;
      if (shelfProductsRef.current.instanceColor) {
        shelfProductsRef.current.instanceColor.needsUpdate = true;
      }
    }, [shelfProductData]);

    // Initialize drink bottles
    useEffect(() => {
      if (!drinkBottlesRef.current) return;

      const matrix = new THREE.Matrix4();
      drinkBottleData.positions.forEach((pos, i) => {
        matrix.setPosition(pos[0], pos[1], pos[2]);
        drinkBottlesRef.current!.setMatrixAt(i, matrix);
        drinkBottlesRef.current!.setColorAt(i, drinkBottleData.colors[i]);
      });
      drinkBottlesRef.current.instanceMatrix.needsUpdate = true;
      if (drinkBottlesRef.current.instanceColor) {
        drinkBottlesRef.current.instanceColor.needsUpdate = true;
      }
    }, [drinkBottleData]);

    // Initialize canopy columns
    useEffect(() => {
      if (!canopyColumnsRef.current) return;

      const matrix = new THREE.Matrix4();
      canopyColumnData.positions.forEach((pos, i) => {
        matrix.setPosition(pos[0], pos[1], pos[2]);
        canopyColumnsRef.current!.setMatrixAt(i, matrix);
      });
      canopyColumnsRef.current.instanceMatrix.needsUpdate = true;
    }, [canopyColumnData]);

    // Initialize magazines
    useEffect(() => {
      if (!magazinesRef.current) return;

      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      const posVec = new THREE.Vector3();

      magazineData.positions.forEach((pos, i) => {
        quaternion.setFromEuler(magazineData.rotations[i]);
        posVec.set(pos[0], pos[1], pos[2]);
        matrix.compose(posVec, quaternion, scale);
        magazinesRef.current!.setMatrixAt(i, matrix);
        magazinesRef.current!.setColorAt(i, magazineData.colors[i]);
      });
      magazinesRef.current.instanceMatrix.needsUpdate = true;
      if (magazinesRef.current.instanceColor) {
        magazinesRef.current.instanceColor.needsUpdate = true;
      }
    }, [magazineData]);

    // Initialize pump hoses and nozzles
    useEffect(() => {
      // Hose segments
      if (hoseSegmentsRef.current) {
        pumpHoseData.hoseMatrices.forEach((m, i) => {
          hoseSegmentsRef.current!.setMatrixAt(i, m);
        });
        hoseSegmentsRef.current.instanceMatrix.needsUpdate = true;
      }
      // Connectors
      if (hoseConnectorsRef.current) {
        pumpHoseData.connectorMatrices.forEach((m, i) => {
          hoseConnectorsRef.current!.setMatrixAt(i, m);
        });
        hoseConnectorsRef.current.instanceMatrix.needsUpdate = true;
      }
      // Handles
      if (nozzleHandlesRef.current) {
        pumpHoseData.handleMatrices.forEach((m, i) => {
          nozzleHandlesRef.current!.setMatrixAt(i, m);
        });
        nozzleHandlesRef.current.instanceMatrix.needsUpdate = true;
      }
      // Spouts
      if (nozzleSpoutsRef.current) {
        pumpHoseData.spoutMatrices.forEach((m, i) => {
          nozzleSpoutsRef.current!.setMatrixAt(i, m);
        });
        nozzleSpoutsRef.current.instanceMatrix.needsUpdate = true;
      }
    }, [pumpHoseData]);

    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* ========== STATION BUILDING ========== */}
        <group position={[-12, 0, 0]}>
          {/* Back wall (solid) */}
          <mesh position={[-3.9, 2.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 5, 10]} />
            <meshStandardMaterial color="#e0e0e0" roughness={0.6} />
          </mesh>
          {/* Left side wall (solid) */}
          <mesh position={[0, 2.5, -4.9]} castShadow receiveShadow>
            <boxGeometry args={[8, 5, 0.2]} />
            <meshStandardMaterial color="#e0e0e0" roughness={0.6} />
          </mesh>
          {/* Right side wall (with door opening) - top section */}
          <mesh position={[0, 4, 4.9]} castShadow receiveShadow>
            <boxGeometry args={[8, 2, 0.2]} />
            <meshStandardMaterial color="#e0e0e0" roughness={0.6} />
          </mesh>
          {/* Right side wall - left of door */}
          <mesh position={[-2.65, 1.5, 4.9]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 3, 0.2]} />
            <meshStandardMaterial color="#e0e0e0" roughness={0.6} />
          </mesh>
          {/* Right side wall - right of door */}
          <mesh position={[2.65, 1.5, 4.9]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 3, 0.2]} />
            <meshStandardMaterial color="#e0e0e0" roughness={0.6} />
          </mesh>
          {/* Front wall - large glass window section (transparent) */}
          <mesh position={[3.9, 2.5, 0]}>
            <boxGeometry args={[0.2, 5, 10]} />
            <meshStandardMaterial
              color="#81d4fa"
              transparent
              opacity={0.3}
              metalness={0.4}
              roughness={0.1}
              side={2}
            />
          </mesh>
        </group>

        {/* Building roof */}
        <mesh position={[-12, 5.3, 0]} castShadow>
          <boxGeometry args={[9, 0.5, 11]} />
          <meshStandardMaterial color="#b71c1c" roughness={0.5} />
        </mesh>

        {/* Door */}
        <mesh position={[-12, 1.2, 5]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.2, 2.4]} />
          <meshStandardMaterial color="#424242" roughness={0.7} side={2} />
        </mesh>

        {/* ========== SHOP INTERIOR (visible through window) ========== */}
        <group position={[-12, 0, 0]}>
          {/* Interior floor - checkered tiles */}
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[7.5, 9.5]} />
            <meshStandardMaterial color="#e8e8e8" roughness={0.8} />
          </mesh>

          {/* Checkout counter near window */}
          <group position={[3, 0, -1]}>
            {/* Counter base */}
            <mesh position={[0, 0.5, 0]} castShadow>
              <boxGeometry args={[1.5, 1, 2.5]} />
              <meshStandardMaterial color="#5d4037" roughness={0.7} />
            </mesh>
            {/* Counter top */}
            <mesh position={[0, 1.02, 0]} castShadow>
              <boxGeometry args={[1.6, 0.05, 2.6]} />
              <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.3} />
            </mesh>
            {/* Cash register */}
            <mesh position={[0, 1.25, 0]} castShadow>
              <boxGeometry args={[0.5, 0.4, 0.4]} />
              <meshStandardMaterial color="#212121" roughness={0.5} />
            </mesh>
            {/* Register screen */}
            <mesh position={[0.26, 1.35, 0]} rotation={[0, 0, 0.2]}>
              <planeGeometry args={[0.3, 0.2]} />
              <meshBasicMaterial color="#4fc3f7" />
            </mesh>
            {/* Card reader */}
            <mesh position={[0, 1.1, 0.6]} castShadow>
              <boxGeometry args={[0.15, 0.08, 0.2]} />
              <meshStandardMaterial color="#37474f" roughness={0.5} />
            </mesh>
          </group>

          {/* Product shelves - back wall */}
          <group position={[-3, 0, 0]}>
            {/* Shelf unit frame */}
            <mesh position={[0, 2, 0]} castShadow>
              <boxGeometry args={[0.3, 4, 6]} />
              <meshStandardMaterial color="#5d4037" roughness={0.8} />
            </mesh>
            {/* Shelves */}
            {[0.8, 1.6, 2.4, 3.2].map((y, i) => (
              <mesh key={`shelf-${i}`} position={[0.2, y, 0]} castShadow>
                <boxGeometry args={[0.6, 0.08, 5.5]} />
                <meshStandardMaterial color="#8d6e63" roughness={0.7} />
              </mesh>
            ))}
          </group>

          {/* Refrigerated drinks cabinet - side wall */}
          <group position={[0, 0, -4]}>
            {/* Cabinet frame */}
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[4, 3, 0.8]} />
              <meshStandardMaterial color="#37474f" roughness={0.5} metalness={0.3} />
            </mesh>
            {/* Glass front */}
            <mesh position={[0, 1.5, 0.41]}>
              <boxGeometry args={[3.8, 2.8, 0.02]} />
              <meshStandardMaterial color="#b3e5fc" transparent opacity={0.4} roughness={0.1} />
            </mesh>
          </group>

          {/* Coffee machine */}
          <group position={[2, 0, -3.5]}>
            <mesh position={[0, 1.1, 0]} castShadow>
              <boxGeometry args={[0.8, 2.2, 0.6]} />
              <meshStandardMaterial color="#212121" roughness={0.4} metalness={0.4} />
            </mesh>
            {/* Coffee display panel */}
            <mesh position={[0.41, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.4, 0.5]} />
              <meshBasicMaterial color="#4caf50" />
            </mesh>
            {/* Cup dispenser */}
            <mesh position={[0, 0.3, 0.35]} castShadow>
              <cylinderGeometry args={[0.15, 0.12, 0.3, 12]} />
              <meshStandardMaterial color="#424242" roughness={0.5} />
            </mesh>
          </group>

          {/* Slushie machine - Dead Dino branded! */}
          <group position={[2, 0, -2]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <boxGeometry args={[0.7, 1.8, 0.5]} />
              <meshStandardMaterial color="#e65100" roughness={0.4} />
            </mesh>
            {/* Slushie tanks */}
            {[-0.15, 0.15].map((x, i) => (
              <mesh key={`slush-${i}`} position={[x, 1.3, 0.1]} castShadow>
                <cylinderGeometry args={[0.12, 0.12, 0.6, 12]} />
                <meshStandardMaterial
                  color={i === 0 ? '#e53935' : '#2196f3'}
                  transparent
                  opacity={0.7}
                  roughness={0.2}
                />
              </mesh>
            ))}
            {/* "SLUSH" label */}
            <mesh position={[0.36, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[0.3, 0.3]} />
              <meshBasicMaterial color="#fff3e0" />
            </mesh>
          </group>

          {/* Hot dog roller grill */}
          <group position={[2, 0, -0.5]}>
            <mesh position={[0, 0.9, 0]} castShadow>
              <boxGeometry args={[0.6, 0.4, 0.5]} />
              <meshStandardMaterial color="#9e9e9e" roughness={0.4} metalness={0.5} />
            </mesh>
            {/* Hot dogs */}
            {[-0.15, 0, 0.15].map((z, i) => (
              <mesh
                key={`hotdog-${i}`}
                position={[0, 1.15, z]}
                rotation={[0, 0, Math.PI / 2]}
                castShadow
              >
                <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
                <meshStandardMaterial color="#c97a5d" roughness={0.6} />
              </mesh>
            ))}
            {/* Glass cover */}
            <mesh position={[0, 1.25, 0]}>
              <boxGeometry args={[0.55, 0.25, 0.45]} />
              <meshStandardMaterial color="#e3f2fd" transparent opacity={0.3} roughness={0.1} />
            </mesh>
          </group>

          {/* Magazine/newspaper rack near door */}
          <group position={[1.5, 0, 3]}>
            <mesh position={[0, 0.6, 0]} castShadow>
              <boxGeometry args={[0.8, 1.2, 0.4]} />
              <meshStandardMaterial color="#5d4037" roughness={0.8} />
            </mesh>
          </group>

          {/* Interior ceiling light */}
          <mesh position={[0, 4.5, 0]}>
            <boxGeometry args={[1.5, 0.1, 1.5]} />
            <meshBasicMaterial color="#fff9c4" />
          </mesh>
        </group>

        {/* ========== CANOPY STRUCTURE ========== */}
        {/* Canopy roof */}
        <mesh position={[0, 5, 0]} castShadow>
          <boxGeometry args={[16, 0.4, 12]} />
          <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
        </mesh>
        {/* Canopy fascia with Dead Dino orange brand color */}
        <mesh position={[0, 4.6, 0]}>
          <boxGeometry args={[16.5, 0.4, 12.5]} />
          <meshStandardMaterial color="#e65100" roughness={0.5} />
        </mesh>

        {/* ========== FUEL PUMPS (back-to-back, line toward shop) ========== */}
        {/* Single island running along X axis toward shop */}
        <mesh position={[0, 0.1, 0]} receiveShadow>
          <boxGeometry args={[10, 0.2, 3]} />
          <meshStandardMaterial color="#616161" roughness={0.8} />
        </mesh>

        {/* Pump pairs at x=-3 and x=+3, back-to-back facing +Z and -Z */}
        {[-3, 3].map((x) => (
          <group key={`pump-pair-${x}`} position={[x, 0, 0]}>
            {/* Pump facing +Z (serves vehicles on +Z side) - screen & nozzle face outward */}
            <group position={[0, 0, 0.9]} rotation={[0, -Math.PI / 2, 0]}>
              {/* Pump body */}
              <mesh position={[0, 0.9, 0]} castShadow>
                <boxGeometry args={[0.6, 1.6, 0.5]} />
                <meshStandardMaterial color="#ffffff" roughness={0.5} />
              </mesh>
              {/* Pump top - Dead Dino orange */}
              <mesh position={[0, 1.8, 0]} castShadow>
                <boxGeometry args={[0.7, 0.2, 0.6]} />
                <meshStandardMaterial color="#e65100" roughness={0.5} />
              </mesh>
              {/* Screen */}
              <mesh position={[0.31, 1.1, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[0.3, 0.4]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
              {/* Nozzle holder */}
              <mesh position={[0.35, 0.6, 0]} castShadow>
                <boxGeometry args={[0.1, 0.5, 0.4]} />
                <meshStandardMaterial color="#212121" roughness={0.6} />
              </mesh>
            </group>

            {/* Pump facing -Z (serves vehicles on -Z side) - screen & nozzle face outward */}
            <group position={[0, 0, -0.9]} rotation={[0, Math.PI / 2, 0]}>
              {/* Pump body */}
              <mesh position={[0, 0.9, 0]} castShadow>
                <boxGeometry args={[0.6, 1.6, 0.5]} />
                <meshStandardMaterial color="#ffffff" roughness={0.5} />
              </mesh>
              {/* Pump top - Dead Dino orange */}
              <mesh position={[0, 1.8, 0]} castShadow>
                <boxGeometry args={[0.7, 0.2, 0.6]} />
                <meshStandardMaterial color="#e65100" roughness={0.5} />
              </mesh>
              {/* Screen */}
              <mesh position={[0.31, 1.1, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[0.3, 0.4]} />
                <meshBasicMaterial color="#000000" />
              </mesh>
              {/* Nozzle holder */}
              <mesh position={[0.35, 0.6, 0]} castShadow>
                <boxGeometry args={[0.1, 0.5, 0.4]} />
                <meshStandardMaterial color="#212121" roughness={0.6} />
              </mesh>
            </group>
          </group>
        ))}

        {/* ========== DEAD DINO SIGN ========== */}
        <group position={[10, 0, 0]}>
          {/* Sign pole */}
          <mesh position={[0, 4, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 8, 8]} />
            <meshStandardMaterial color="#757575" roughness={0.5} metalness={0.3} />
          </mesh>
          {/* Sign background - orange for fun retro gas station vibe */}
          <mesh position={[0, 7.2, 0]} castShadow>
            <boxGeometry args={[4, 5, 0.3]} />
            <meshStandardMaterial color="#e65100" roughness={0.5} />
          </mesh>
          {/* Sign border - front */}
          <mesh position={[0, 7.2, 0.16]}>
            <boxGeometry args={[3.7, 4.7, 0.02]} />
            <meshStandardMaterial color="#fff3e0" roughness={0.5} />
          </mesh>
          {/* Sign border - back */}
          <mesh position={[0, 7.2, -0.16]}>
            <boxGeometry args={[3.7, 4.7, 0.02]} />
            <meshStandardMaterial color="#fff3e0" roughness={0.5} />
          </mesh>

          {/* Cute Dead Dino Logo - FRONT */}
          <group position={[0, 7.8, 0.25]}>
            {/* Dino body - chubby oval */}
            <mesh position={[0, 0, 0]} castShadow>
              <sphereGeometry args={[0.7, 16, 12]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Dino belly */}
            <mesh position={[0, -0.1, 0.3]}>
              <sphereGeometry args={[0.45, 12, 10]} />
              <meshStandardMaterial color="#a5d6a7" roughness={0.6} />
            </mesh>
            {/* Dino head */}
            <mesh position={[0.5, 0.5, 0]} castShadow>
              <sphereGeometry args={[0.45, 14, 12]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Dino snout */}
            <mesh position={[0.85, 0.4, 0]} castShadow>
              <sphereGeometry args={[0.25, 12, 10]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* X eyes (dead!) - left eye */}
            <group position={[0.65, 0.6, 0.3]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
            </group>
            {/* X eyes - right eye */}
            <group position={[0.55, 0.6, -0.25]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
            </group>
            {/* Tongue sticking out (cute!) */}
            <mesh position={[0.95, 0.25, 0.1]} rotation={[0, 0, -0.3]}>
              <boxGeometry args={[0.15, 0.08, 0.06]} />
              <meshStandardMaterial color="#f48fb1" roughness={0.4} />
            </mesh>
            {/* Tiny arms (T-Rex style) */}
            <mesh position={[0.25, 0.1, 0.5]} rotation={[0.3, 0.5, 0.2]} castShadow>
              <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <mesh position={[0.25, 0.1, -0.5]} rotation={[-0.3, -0.5, 0.2]} castShadow>
              <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Stubby legs */}
            <mesh position={[-0.2, -0.6, 0.35]} castShadow>
              <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <mesh position={[-0.2, -0.6, -0.35]} castShadow>
              <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Tail */}
            <mesh position={[-0.7, -0.1, 0]} rotation={[0, 0, 0.4]} castShadow>
              <coneGeometry args={[0.2, 0.8, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Back spikes (cute bumps) */}
            {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
              <mesh key={`spike-${i}`} position={[x, 0.65 - Math.abs(x) * 0.3, 0]} castShadow>
                <coneGeometry args={[0.08, 0.18, 6]} />
                <meshStandardMaterial color="#81c784" roughness={0.6} />
              </mesh>
            ))}
          </group>

          {/* Cute Dead Dino Logo - BACK (mirrored) */}
          <group position={[0, 7.8, -0.25]} rotation={[0, Math.PI, 0]}>
            {/* Dino body - chubby oval */}
            <mesh position={[0, 0, 0]} castShadow>
              <sphereGeometry args={[0.7, 16, 12]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Dino belly */}
            <mesh position={[0, -0.1, 0.3]}>
              <sphereGeometry args={[0.45, 12, 10]} />
              <meshStandardMaterial color="#a5d6a7" roughness={0.6} />
            </mesh>
            {/* Dino head */}
            <mesh position={[0.5, 0.5, 0]} castShadow>
              <sphereGeometry args={[0.45, 14, 12]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Dino snout */}
            <mesh position={[0.85, 0.4, 0]} castShadow>
              <sphereGeometry args={[0.25, 12, 10]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* X eyes (dead!) - left eye */}
            <group position={[0.65, 0.6, 0.3]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
            </group>
            {/* X eyes - right eye */}
            <group position={[0.55, 0.6, -0.25]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.18, 0.04, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
            </group>
            {/* Tongue sticking out (cute!) */}
            <mesh position={[0.95, 0.25, 0.1]} rotation={[0, 0, -0.3]}>
              <boxGeometry args={[0.15, 0.08, 0.06]} />
              <meshStandardMaterial color="#f48fb1" roughness={0.4} />
            </mesh>
            {/* Tiny arms (T-Rex style) */}
            <mesh position={[0.25, 0.1, 0.5]} rotation={[0.3, 0.5, 0.2]} castShadow>
              <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <mesh position={[0.25, 0.1, -0.5]} rotation={[-0.3, -0.5, 0.2]} castShadow>
              <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Stubby legs */}
            <mesh position={[-0.2, -0.6, 0.35]} castShadow>
              <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <mesh position={[-0.2, -0.6, -0.35]} castShadow>
              <capsuleGeometry args={[0.12, 0.25, 4, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Tail */}
            <mesh position={[-0.7, -0.1, 0]} rotation={[0, 0, 0.4]} castShadow>
              <coneGeometry args={[0.2, 0.8, 8]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            {/* Back spikes (cute bumps) */}
            {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
              <mesh key={`spike-back-${i}`} position={[x, 0.65 - Math.abs(x) * 0.3, 0]} castShadow>
                <coneGeometry args={[0.08, 0.18, 6]} />
                <meshStandardMaterial color="#81c784" roughness={0.6} />
              </mesh>
            ))}
          </group>

          {/* "DEAD" text - front */}
          <Text
            position={[0, 6.5, 0.2]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DEAD
          </Text>
          {/* "DINO" text - front */}
          <Text
            position={[0, 5.9, 0.2]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DINO
          </Text>
          {/* Tagline - front */}
          <Text
            position={[0, 5.35, 0.2]}
            fontSize={0.22}
            color="#5d4037"
            anchorX="center"
            anchorY="middle"
          >
            Premium Fossil Fuel
          </Text>

          {/* "DEAD" text - back */}
          <Text
            position={[0, 6.5, -0.2]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DEAD
          </Text>
          {/* "DINO" text - back */}
          <Text
            position={[0, 5.9, -0.2]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.55}
            color="#212121"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DINO
          </Text>
          {/* Tagline - back */}
          <Text
            position={[0, 5.35, -0.2]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.22}
            color="#5d4037"
            anchorX="center"
            anchorY="middle"
          >
            Premium Fossil Fuel
          </Text>
        </group>

        {/* Forecourt ground */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 14]} />
          <meshStandardMaterial color="#4a4a4a" roughness={0.85} />
        </mesh>

        {/* ========== INSTANCED ELEMENTS ========== */}

        {/* Instanced Shelf Products (15 total: 3 shelves x 5 products) */}
        <instancedMesh
          ref={shelfProductsRef}
          args={[GEOMETRIES.shelfProduct, MATERIALS.shelfProduct, 15]}
          castShadow
        />

        {/* Instanced Drink Bottles (12 total: 4 columns x 3 rows) */}
        <instancedMesh
          ref={drinkBottlesRef}
          args={[GEOMETRIES.drinkBottle, MATERIALS.drinkBottle, 12]}
          castShadow
        />

        {/* Instanced Canopy Columns (4 total) */}
        <instancedMesh
          ref={canopyColumnsRef}
          args={[GEOMETRIES.canopyColumn, MATERIALS.canopyColumn, 4]}
          castShadow
        />

        {/* Instanced Magazines (3 total) */}
        <instancedMesh
          ref={magazinesRef}
          args={[GEOMETRIES.magazine, MATERIALS.magazine, 3]}
          castShadow
        />

        {/* ========== INSTANCED PUMP HOSES & NOZZLES (4 pumps) ========== */}

        {/* Hose segments */}
        <instancedMesh
          ref={hoseSegmentsRef}
          args={[GEOMETRIES.hoseSegment, MATERIALS.hose, 4]}
          castShadow
        />

        {/* Hose connectors (attach to pump) */}
        <instancedMesh
          ref={hoseConnectorsRef}
          args={[GEOMETRIES.hoseConnector, MATERIALS.nozzleMetal, 4]}
          castShadow
        />

        {/* Nozzle handles (grip) */}
        <instancedMesh
          ref={nozzleHandlesRef}
          args={[GEOMETRIES.nozzleHandle, MATERIALS.nozzleGrip, 4]}
          castShadow
        />

        {/* Nozzle spouts */}
        <instancedMesh
          ref={nozzleSpoutsRef}
          args={[GEOMETRIES.nozzleSpout, MATERIALS.nozzleMetal, 4]}
          castShadow
        />
      </group>
    );
  }
);

GasStation.displayName = 'GasStation';
