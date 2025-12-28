/**
 * QCLabRoom Component
 *
 * Quality Control Laboratory in the east wing (x=+50).
 * Contains microscope, analytical scales, sample containers, and results display.
 */

import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useProductionStore } from '../../stores/productionStore';
import { FLOOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';

// Lab bench with stainless steel top
const LabBench: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Bench top - stainless steel */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 0.1, 2]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Bench legs */}
      {[
        [-1.7, 0.4, -0.7],
        [1.7, 0.4, -0.7],
        [-1.7, 0.4, 0.7],
        [1.7, 0.4, 0.7],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <boxGeometry args={[0.1, 0.8, 0.1]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* Under-bench cabinet */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[3.6, 0.7, 1.8]} />
        <meshStandardMaterial color="#4b5563" roughness={0.6} />
      </mesh>
    </group>
  );
};

// Microscope with eyepiece glow
const Microscope: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[0.3, 0.1, 0.4]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Arm */}
      <mesh position={[0, 0.25, -0.1]} castShadow>
        <boxGeometry args={[0.08, 0.4, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Eyepiece tube */}
      <mesh position={[0, 0.5, 0.05]} rotation={[Math.PI * 0.15, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.2, 8]} />
        <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Eyepiece lens glow */}
      <mesh position={[0, 0.58, 0.08]} rotation={[Math.PI * 0.15, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 8]} />
        <meshStandardMaterial
          color="#60a5fa"
          emissive="#60a5fa"
          emissiveIntensity={0.3}
          transparent
          opacity={0.8}
        />
      </mesh>
      {/* Stage */}
      <mesh position={[0, 0.2, 0.1]} castShadow>
        <boxGeometry args={[0.2, 0.02, 0.2]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Objective lenses */}
      <mesh position={[0, 0.28, 0.1]} castShadow>
        <cylinderGeometry args={[0.02, 0.015, 0.08, 6]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
};

// Analytical Scales with LED display
const AnalyticalScales: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Base unit */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[0.35, 0.16, 0.4]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.3} />
      </mesh>
      {/* Weighing chamber */}
      <mesh position={[0, 0.2, 0.05]}>
        <boxGeometry args={[0.25, 0.15, 0.25]} />
        <meshStandardMaterial color="#f8fafc" transparent opacity={0.3} />
      </mesh>
      {/* Weighing pan */}
      <mesh position={[0, 0.17, 0.05]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.01, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Display */}
      <mesh position={[0, 0.12, -0.15]}>
        <boxGeometry args={[0.15, 0.06, 0.02]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
};

// Sample containers - glass jars with grain samples
const SampleContainers: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const jarColors = ['#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f59e0b'];

  return (
    <group position={position}>
      {jarColors.map((color, i) => (
        <group key={i} position={[(i - 2) * 0.15, 0, 0]}>
          {/* Jar */}
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.15, 8]} />
            <meshStandardMaterial color="#f8fafc" transparent opacity={0.4} roughness={0.1} />
          </mesh>
          {/* Sample inside */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.08, 8]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          {/* Lid */}
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.02, 8]} />
            <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Results display board
const ResultsDisplay: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const latestTest = useProductionStore((state) => state.qcLab.testHistory[0]);
  const certStatus = useProductionStore((state) => state.qcLab.certificationStatus);

  const gradeColor = useMemo(() => {
    if (!latestTest) return '#6b7280';
    switch (latestTest.grade) {
      case 'A':
        return '#22c55e';
      case 'B':
        return '#eab308';
      case 'C':
        return '#f97316';
      case 'FAIL':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  }, [latestTest]);

  return (
    <group position={position}>
      {/* Display frame */}
      <mesh castShadow>
        <boxGeometry args={[1, 0.6, 0.05]} />
        <meshStandardMaterial color="#1f2937" roughness={0.4} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.9, 0.5, 0.01]} />
        <meshStandardMaterial color="#0f172a" emissive="#1e293b" emissiveIntensity={0.2} />
      </mesh>
      {/* Grade indicator light */}
      <mesh position={[0.35, 0.2, 0.04]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshStandardMaterial color={gradeColor} emissive={gradeColor} emissiveIntensity={0.8} />
      </mesh>
      {/* HTML overlay for text */}
      <Html position={[0, 0, 0.05]} center transform scale={0.15}>
        <div className="bg-slate-900/90 p-3 rounded text-center min-w-[200px]">
          <div className="text-xs text-gray-400 mb-1">LATEST TEST</div>
          {latestTest ? (
            <>
              <div className="text-3xl font-bold" style={{ color: gradeColor }}>
                {latestTest.grade}
              </div>
              <div className="text-xs text-gray-500 mt-1">{latestTest.machineId}</div>
            </>
          ) : (
            <div className="text-lg text-gray-500">NO DATA</div>
          )}
          <div className="mt-2 pt-2 border-t border-gray-700">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                certStatus === 'valid'
                  ? 'bg-green-500/20 text-green-400'
                  : certStatus === 'expiring'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-red-500/20 text-red-400'
              }`}
            >
              {certStatus.toUpperCase()}
            </span>
          </div>
        </div>
      </Html>
    </group>
  );
};

// Certification plaque on wall
const CertificationPlaque: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Frame */}
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.4, 0.02]} />
        <meshStandardMaterial color="#78350f" roughness={0.3} />
      </mesh>
      {/* Certificate */}
      <mesh position={[0, 0, 0.015]}>
        <boxGeometry args={[0.45, 0.35, 0.01]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.8} />
      </mesh>
    </group>
  );
};

// Safety shower
const SafetyShower: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 2.4, 8]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} />
      </mesh>
      {/* Shower head */}
      <mesh position={[0, 2.3, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.1, 0.1, 8]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} />
      </mesh>
      {/* Pull handle */}
      <mesh position={[0, 1.5, 0.15]} castShadow>
        <boxGeometry args={[0.02, 0.3, 0.02]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} />
      </mesh>
      {/* Sign */}
      <Html position={[0, 1.8, 0.1]} center>
        <div className="bg-yellow-500 text-black text-xs font-bold px-1 py-0.5 rounded whitespace-nowrap">
          SAFETY SHOWER
        </div>
      </Html>
    </group>
  );
};

// Main QC Lab Room component
export const QCLabRoom: React.FC<{
  position?: [number, number, number];
}> = ({ position = [50, 0, 0] }) => {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      {/* Floor area indicator */}
      <mesh
        position={[0, FLOOR_LAYERS.wornPrimary, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[6, 5]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.8}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Lab bench with equipment */}
      <LabBench position={[0, 0, 0]} />
      <Microscope position={[-1, 1, 0]} />
      <AnalyticalScales position={[0, 0.95, 0]} />
      <SampleContainers position={[1, 0.95, 0]} />

      {/* Wall-mounted displays */}
      <ResultsDisplay position={[0, 2, -2.3]} />
      <CertificationPlaque position={[1.5, 1.8, -2.3]} />

      {/* Safety equipment */}
      <SafetyShower position={[2.5, 0, -1]} />

      {/* Lab lighting - bright for precision work */}
      <pointLight position={[0, 3, 0]} intensity={20} distance={8} color="#f8fafc" />

      {/* Room label */}
      <Html position={[0, 2.8, 0]} center>
        <div className="bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded whitespace-nowrap">
          QUALITY CONTROL LAB
        </div>
      </Html>
    </group>
  );
};

export default QCLabRoom;
