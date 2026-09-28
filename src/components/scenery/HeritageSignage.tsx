import { useTexture } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, type ComponentProps } from 'react';
import { useFrame } from '@react-three/fiber';
import { EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';
import * as THREE from 'three';
import { SceneText } from '../shared/SceneText';

export const HERITAGE_ART = {
  dino: `${import.meta.env.BASE_URL}textures/signage/dead-dino.webp`,
  wheat: `${import.meta.env.BASE_URL}textures/signage/wheat-sheaf.webp`,
} as const;

/** Backlighting follows the shared dusk/weather dimmer. Keep these materials
 * outside static batching: its cloned output would freeze the initial value.
 * Matching the emission colour/map to the print preserves dark ink and artwork.
 */
export function createSignMaterial(colour: string, map: THREE.Texture | null = null) {
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: 0,
    map,
    emissiveMap: map,
    alphaTest: map ? 0.5 : 0,
    roughness: 0.74,
  });
  material.name = 'sign-backlight';
  return material;
}

function useSignMaterial(colour: string, map: THREE.Texture | null = null, backlit = true) {
  const material = useMemo(() => createSignMaterial(colour, map), [colour, map]);
  useFrame(() => {
    material.emissiveIntensity = backlit ? EXTERIOR_LAMP_LEVEL.value * 0.85 : 0;
  });
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

export function IlluminatedSignText({
  color,
  ...props
}: Omit<ComponentProps<typeof SceneText>, 'color' | 'material'> & { color: string }) {
  const material = useSignMaterial(color);
  return <SceneText {...props} color={color} material={material} />;
}

/** Printed enamel/ink, with opt-in lightbox illumination. The same marks serve
 * every sign face. Alpha test keeps the graphic in the opaque pass.
 * useTexture participates in the existing startup barrier.
 */
export function HeritageEmblem({
  kind,
  width,
  position = [0, 0, 0],
  colour = '#ffffff',
  backlit = false,
}: {
  kind: keyof typeof HERITAGE_ART;
  width: number;
  position?: [number, number, number];
  colour?: string;
  backlit?: boolean;
}) {
  const texture = useTexture(HERITAGE_ART[kind]);
  const material = useSignMaterial(colour, texture, backlit);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh
      name={`heritage-${kind}-printed-emblem`}
      position={position}
      material={material}
      userData={{ noStaticBatch: backlit }}
    >
      <planeGeometry args={[width, kind === 'dino' ? (width * 683) / 1024 : width]} />
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
  const paperMaterial = useSignMaterial('#efe3c7');
  const accentMaterial = useSignMaterial(accent);
  return (
    <group name={`heritage-${brand}-poster`} userData={{ noStaticBatch: true }}>
      <mesh material={paperMaterial}>
        <planeGeometry args={[width, height]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, side * height * 0.452, 0.006]} material={accentMaterial}>
          <planeGeometry args={[width * 0.88, height * 0.009]} />
        </mesh>
      ))}
      <IlluminatedSignText
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
      </IlluminatedSignText>
      <HeritageEmblem
        kind={dino ? 'dino' : 'wheat'}
        width={width * (dino ? 0.91 : 0.61)}
        position={[0, height * 0.045, 0.013]}
        colour={dino ? '#ffffff' : accent}
        backlit
      />
      <IlluminatedSignText
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
      </IlluminatedSignText>
      <IlluminatedSignText
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
      </IlluminatedSignText>
    </group>
  );
}

export function DeadDinoPylonFace() {
  const fieldMaterial = useSignMaterial('#c46535');
  const panelMaterial = useSignMaterial('#efe3c7');
  return (
    <group name="dead-dino-enamel-pylon-face" userData={{ noStaticBatch: true }}>
      <mesh material={fieldMaterial}>
        <planeGeometry args={[3.7, 4.7]} />
      </mesh>
      <mesh position={[0, 0.72, 0.008]} material={panelMaterial}>
        <planeGeometry args={[3.36, 2.58]} />
      </mesh>
      <HeritageEmblem kind="dino" width={3.22} position={[0, 0.81, 0.018]} backlit />
      {(['DEAD', 'DINO'] as const).map((word, index) => (
        <IlluminatedSignText
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
        </IlluminatedSignText>
      ))}
      <IlluminatedSignText
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
      </IlluminatedSignText>
    </group>
  );
}
