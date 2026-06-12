import React, { useMemo, useEffect } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface BulletinBoardProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export const BulletinBoard: React.FC<BulletinBoardProps> = ({ position, rotation = [0, 0, 0] }) => {
  // Memoized cork texture
  const corkTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Cork base color
    ctx.fillStyle = '#c19a6b';
    ctx.fillRect(0, 0, 256, 256);

    // Cork texture pattern
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const brightness = Math.random() * 40 - 20;
      ctx.fillStyle = `rgb(${193 + brightness}, ${154 + brightness}, ${107 + brightness})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // Memoized employee photo frame texture
  const photoTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Photo background (sepia tone)
    ctx.fillStyle = '#d4a373';
    ctx.fillRect(0, 0, 128, 128);

    // Simple silhouette
    ctx.fillStyle = '#8b6f47';
    ctx.beginPath();
    ctx.arc(64, 45, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(44, 65, 40, 50);

    // Frame
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 120);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // Dispose the manually-created GPU textures on unmount
  useEffect(
    () => () => {
      corkTexture.dispose();
      photoTexture.dispose();
    },
    [corkTexture, photoTexture]
  );

  return (
    <group position={position} rotation={rotation}>
      {/* Cork board backing */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[1.5, 1.2, 0.04]} />
        <meshStandardMaterial map={corkTexture} roughness={0.9} />
      </mesh>

      {/* Wooden frame */}
      <group>
        <mesh position={[0, 0.62, 0]}>
          <boxGeometry args={[1.54, 0.04, 0.04]} />
          <meshStandardMaterial color="#3e2723" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.62, 0]}>
          <boxGeometry args={[1.54, 0.04, 0.04]} />
          <meshStandardMaterial color="#3e2723" roughness={0.8} />
        </mesh>
        <mesh position={[-0.77, 0, 0]}>
          <boxGeometry args={[0.04, 1.2, 0.04]} />
          <meshStandardMaterial color="#3e2723" roughness={0.8} />
        </mesh>
        <mesh position={[0.77, 0, 0]}>
          <boxGeometry args={[0.04, 1.2, 0.04]} />
          <meshStandardMaterial color="#3e2723" roughness={0.8} />
        </mesh>
      </group>

      {/* Employee of the Month photo - top left */}
      <mesh position={[-0.4, 0.35, 0.01]}>
        <planeGeometry args={[0.35, 0.35]} />
        <meshStandardMaterial map={photoTexture} />
      </mesh>

      {/* HTML overlay for readable text */}
      <Html
        position={[-0.4, 0.05, 0.01]}
        transform
        distanceFactor={0.6}
        style={{
          width: '220px',
          fontSize: '9px',
          color: '#1e293b',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ background: '#fef3c7', padding: '6px', border: '1px solid #92400e' }}>
          <strong>EMPLOYEE OF THE MONTH</strong>
          <br />
          Marcus Chen
          <br />
          Supervisor - 15 Years
        </div>
      </Html>

      {/* Safety poster - top right */}
      <Html
        position={[0.4, 0.35, 0.01]}
        transform
        distanceFactor={0.6}
        style={{
          width: '200px',
          fontSize: '8px',
          color: '#fef3c7',
          fontFamily: 'Arial, sans-serif',
          pointerEvents: 'none',
          userSelect: 'none',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: '#dc2626',
            padding: '8px',
            border: '2px solid #991b1b',
            fontWeight: 'bold',
          }}
        >
          SAFETY FIRST
          <br />
          PRODUCTION SECOND
          <br />
          <div style={{ fontSize: '6px', marginTop: '4px' }}>Look Out For Each Other</div>
        </div>
      </Html>

      {/* Shift schedule - middle left */}
      <Html
        position={[-0.4, -0.15, 0.01]}
        transform
        distanceFactor={0.6}
        style={{
          width: '200px',
          fontSize: '7px',
          color: '#1e293b',
          fontFamily: 'monospace',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ background: '#e0f2fe', padding: '5px', border: '1px solid #0284c7' }}>
          <strong>SHIFT SCHEDULE</strong>
          <br />
          Day: 06:00 - 14:00
          <br />
          Swing: 14:00 - 22:00
          <br />
          Night: 22:00 - 06:00
        </div>
      </Html>

      {/* Company announcement - bottom */}
      <Html
        position={[0, -0.45, 0.01]}
        transform
        distanceFactor={0.6}
        style={{
          width: '280px',
          fontSize: '7px',
          color: '#1e293b',
          fontFamily: 'Arial, sans-serif',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ background: '#ffffff', padding: '6px', border: '1px solid #94a3b8' }}>
          <strong>ANNOUNCEMENTS:</strong>
          <br />
          - New coffee machine installed in break room!
          <br />
          - Safety drill scheduled for Thursday 10:00
          <br />- Reminder: PPE required in all production zones
        </div>
      </Html>

      {/* Push pins */}
      {[
        [-0.55, 0.5],
        [-0.25, 0.5],
        [0.25, 0.5],
        [0.55, 0.5],
        [-0.55, -0.3],
        [0.55, -0.3],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.02]}>
          <cylinderGeometry args={[0.01, 0.015, 0.02, 8]} />
          <meshStandardMaterial color={['#dc2626', '#3b82f6', '#eab308'][i % 3]} />
        </mesh>
      ))}
    </group>
  );
};
