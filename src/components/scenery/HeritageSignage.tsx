import { useTexture } from '@react-three/drei';
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { SceneText } from '../shared/SceneText';

export const HERITAGE_ART = {
  dino: `${import.meta.env.BASE_URL}textures/signage/dead-dino.webp`,
  wheat: `${import.meta.env.BASE_URL}textures/signage/wheat-sheaf.webp`,
} as const;

/** Printed enamel/ink, never emissive. The same marks serve every sign face.
 * Alpha test keeps the graphic in the opaque pass, without poster-sized glass
 * sorting planes. useTexture participates in the existing startup barrier.
 */
export function HeritageEmblem({
  kind,
  width,
  position = [0, 0, 0],
  colour = '#ffffff',
}: {
  kind: keyof typeof HERITAGE_ART;
  width: number;
  position?: [number, number, number];
  colour?: string;
}) {
  const texture = useTexture(HERITAGE_ART[kind]);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh name={`heritage-${kind}-printed-emblem`} position={position}>
      <planeGeometry args={[width, kind === 'dino' ? (width * 683) / 1024 : width]} />
      <meshStandardMaterial map={texture} color={colour} roughness={0.74} alphaTest={0.5} />
    </mesh>
  );
}

/** Coordinates are in metres, preserving the shelter's measured panel seats. */
export function HeritagePoster({
  brand,
  width = 1.4,
  height = 2,
}: {
  brand: 'dino' | 'flour';
  width?: number;
  height?: number;
}) {
  const dino = brand === 'dino';
  const ink = dino ? '#254b3c' : '#283f49';
  const accent = dino ? '#bb582b' : '#a27733';
  return (
    <group name={`heritage-${brand}-poster`}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#efe3c7" roughness={0.83} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, side * height * 0.452, 0.006]}>
          <planeGeometry args={[width * 0.88, height * 0.009]} />
          <meshStandardMaterial color={accent} roughness={0.8} />
        </mesh>
      ))}
      <SceneText
        name={`heritage-${brand}-heading`}
        position={[0, height * 0.33, 0.01]}
        fontSize={width * 0.112}
        letterSpacing={0.025}
        maxWidth={width * 0.84}
        textAlign="center"
        outlineWidth={width * 0.0008}
        outlineColor={ink}
        color={ink}
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        {dino ? 'DEAD DINO' : 'MillOS FLOUR'}
      </SceneText>
      <HeritageEmblem
        kind={dino ? 'dino' : 'wheat'}
        width={width * (dino ? 0.91 : 0.61)}
        position={[0, height * 0.045, 0.013]}
        colour={dino ? '#ffffff' : accent}
      />
      <SceneText
        name={`heritage-${brand}-tagline`}
        position={[0, -height * 0.235, 0.016]}
        fontSize={width * 0.068}
        maxWidth={width * 0.82}
        lineHeight={1.35}
        textAlign="center"
        color={ink}
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        {dino ? 'PREMIUM\nFOSSIL FUEL' : 'MILLED HERE.\nBAKED WITH LOVE.'}
      </SceneText>
      <SceneText
        name={`heritage-${brand}-footer`}
        position={[0, -height * 0.36, 0.016]}
        fontSize={width * 0.053}
        letterSpacing={0.025}
        maxWidth={width * 0.82}
        lineHeight={1.3}
        textAlign="center"
        color={accent}
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        {dino ? 'COFFEE & PROVISIONS' : 'FINE FLOUR SINCE 1952'}
      </SceneText>
    </group>
  );
}

export function DeadDinoPylonFace() {
  return (
    <group name="dead-dino-enamel-pylon-face">
      <mesh>
        <planeGeometry args={[3.7, 4.7]} />
        <meshStandardMaterial color="#c46535" roughness={0.66} />
      </mesh>
      <mesh position={[0, 0.72, 0.008]}>
        <planeGeometry args={[3.36, 2.58]} />
        <meshStandardMaterial color="#efe3c7" roughness={0.74} />
      </mesh>
      <HeritageEmblem kind="dino" width={3.22} position={[0, 0.81, 0.018]} />
      {(['DEAD', 'DINO'] as const).map((word, index) => (
        <SceneText
          key={word}
          position={[0, -0.87 - index * 0.66, 0.022]}
          fontSize={0.67}
          letterSpacing={0.11}
          maxWidth={3.15}
          textAlign="center"
          outlineWidth={0.008}
          outlineColor="#fff0cd"
          color="#fff0cd"
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          {word}
        </SceneText>
      ))}
      <SceneText
        position={[0, -2.06, 0.023]}
        fontSize={0.2}
        maxWidth={3.15}
        textAlign="center"
        color="#fff0cd"
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        PREMIUM FOSSIL FUEL
      </SceneText>
    </group>
  );
}
