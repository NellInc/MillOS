import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

interface HistoricalPhotoProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  type?: 'founding' | 'old_equipment' | 'worker_group' | 'first_shipment';
}

export const HistoricalPhoto: React.FC<HistoricalPhotoProps> = ({
  position,
  rotation = [0, 0, 0],
  type = 'founding',
}) => {
  // Sepia-toned photo texture
  const photoTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    // Sepia background gradient
    const gradient = ctx.createLinearGradient(0, 0, 256, 192);
    gradient.addColorStop(0, '#d4a373');
    gradient.addColorStop(1, '#9c6644');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 192);

    // Add grain/noise for vintage effect
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 192;
      const brightness = Math.random() * 60 - 30;
      ctx.fillStyle = `rgba(${brightness > 0 ? 255 : 0}, ${brightness > 0 ? 255 : 0}, ${brightness > 0 ? 255 : 0}, ${Math.abs(brightness) / 100})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // Simple silhouettes based on type
    ctx.fillStyle = '#5d4e37';
    switch (type) {
      case 'founding':
        // Building outline
        ctx.fillRect(80, 60, 96, 80);
        ctx.fillRect(100, 40, 56, 20);
        // Windows
        ctx.fillStyle = '#8b7355';
        for (let x = 0; x < 3; x++) {
          for (let y = 0; y < 3; y++) {
            ctx.fillRect(90 + x * 25, 70 + y * 20, 15, 12);
          }
        }
        break;
      case 'old_equipment':
        // Machine shape
        ctx.fillRect(60, 80, 40, 60);
        ctx.fillRect(110, 70, 50, 70);
        ctx.fillRect(75, 60, 70, 15);
        break;
      case 'worker_group':
        // Multiple silhouettes
        for (let i = 0; i < 5; i++) {
          const x = 40 + i * 35;
          ctx.beginPath();
          ctx.arc(x + 15, 70, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(x, 82, 30, 50);
        }
        break;
      case 'first_shipment':
        // Truck outline
        ctx.fillRect(50, 90, 80, 40);
        ctx.fillRect(130, 100, 40, 30);
        // Wheels
        ctx.fillStyle = '#3e2723';
        ctx.beginPath();
        ctx.arc(70, 130, 12, 0, Math.PI * 2);
        ctx.arc(110, 130, 12, 0, Math.PI * 2);
        ctx.arc(150, 130, 12, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    // Vignette effect
    const vignetteGradient = ctx.createRadialGradient(128, 96, 50, 128, 96, 180);
    vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, 256, 192);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [type]);

  // Photo metadata
  const photoInfo = useMemo(() => {
    switch (type) {
      case 'founding':
        return {
          title: 'Est. 1952',
          description: 'Grand Opening - Mill Founders',
        };
      case 'old_equipment':
        return {
          title: '1967',
          description: 'Original Roller Mill Installation',
        };
      case 'worker_group':
        return {
          title: '1985',
          description: 'Production Team - Record Year',
        };
      case 'first_shipment':
        return {
          title: '1952',
          description: 'First Shipment - 1000 Bags',
        };
      default:
        return {
          title: 'Historical',
          description: 'Archive Photo',
        };
    }
  }, [type]);

  return (
    <group position={position} rotation={rotation}>
      {/* Wooden frame backing */}
      <mesh position={[0, 0, -0.015]}>
        <boxGeometry args={[0.42, 0.34, 0.03]} />
        <meshStandardMaterial color="#3e2723" roughness={0.8} />
      </mesh>

      {/* Inner frame */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[0.38, 0.3]} />
        <meshStandardMaterial color="#1e1410" roughness={0.6} />
      </mesh>

      {/* Photo */}
      <mesh position={[0, 0.02, 0]}>
        <planeGeometry args={[0.34, 0.26]} />
        <meshStandardMaterial map={photoTexture} roughness={0.4} />
      </mesh>

      {/* Glass reflection overlay */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[0.36, 0.28]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.05}
          roughness={0.1}
          metalness={0.8}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.strong.factor}
          polygonOffsetUnits={POLYGON_OFFSET.strong.units}
        />
      </mesh>

      {/* Caption plaque */}
      <mesh position={[0, -0.18, 0]}>
        <planeGeometry args={[0.32, 0.05]} />
        <meshStandardMaterial color="#d4af37" roughness={0.4} metalness={0.6} />
      </mesh>

      <Html
        position={[0, -0.18, 0.01]}
        transform
        distanceFactor={0.18}
        style={{
          width: '180px',
          fontSize: '6px',
          color: '#1e293b',
          fontFamily: 'serif',
          textAlign: 'center',
          pointerEvents: 'none',
          userSelect: 'none',
          fontWeight: 'bold',
        }}
      >
        <div>{photoInfo.title}</div>
        <div style={{ fontSize: '5px', fontWeight: 'normal' }}>{photoInfo.description}</div>
      </Html>
    </group>
  );
};

// Convenience component for gallery wall
interface HistoricalPhotosGalleryProps {
  positions?: Array<{
    pos: [number, number, number];
    rotation?: [number, number, number];
    type?: HistoricalPhotoProps['type'];
  }>;
}

export const HistoricalPhotosGallery: React.FC<HistoricalPhotosGalleryProps> = ({ positions }) => {
  const defaultPositions = useMemo(
    () => [
      {
        pos: [-28, 2.5, -15] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
        type: 'founding' as const,
      },
      {
        pos: [-28, 2.5, -14] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
        type: 'old_equipment' as const,
      },
      {
        pos: [-28, 2.5, -13] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
        type: 'worker_group' as const,
      },
      {
        pos: [-28, 2.5, -12] as [number, number, number],
        rotation: [0, Math.PI / 2, 0] as [number, number, number],
        type: 'first_shipment' as const,
      },
    ],
    []
  );

  const gallery = positions ?? defaultPositions;

  return (
    <group>
      {gallery.map((photo, i) => (
        <HistoricalPhoto key={i} position={photo.pos} rotation={photo.rotation} type={photo.type} />
      ))}
    </group>
  );
};
