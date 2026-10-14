import { useTexture } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useFrame } from '@react-three/fiber';
import { communityBusNotice } from '../../simulation/communityLife';
import { EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';
import * as THREE from 'three';
import { SceneText } from '../shared/SceneText';

// The village's existing display face. Operating notices retain local Inter.
export const HERITAGE_LETTERING_FONT = `${import.meta.env.BASE_URL}fonts/MedievalSharp.ttf`;

/** Painted enamel contours, not another texture or transparency layer.
 * Working if rounded edges and inset holes stay inside their measured seats.
 */
export function createEnamelGeometry(width: number, height: number, radius: number, stroke = 0) {
  const contour = (path: THREE.Path, w: number, h: number, r: number) => {
    const x = w / 2,
      y = h / 2;
    r = Math.max(0, Math.min(r, x, y));
    path.moveTo(-x + r, -y);
    path.lineTo(x - r, -y);
    path.quadraticCurveTo(x, -y, x, -y + r);
    path.lineTo(x, y - r);
    path.quadraticCurveTo(x, y, x - r, y);
    path.lineTo(-x + r, y);
    path.quadraticCurveTo(-x, y, -x, y - r);
    path.lineTo(-x, -y + r);
    path.quadraticCurveTo(-x, -y, -x + r, -y);
    path.closePath();
  };
  const shape = new THREE.Shape();
  contour(shape, width, height, radius);
  if (stroke > 0) {
    const hole = new THREE.Path();
    contour(hole, width - stroke * 2, height - stroke * 2, radius - stroke);
    shape.holes.push(hole);
  }
  return new THREE.ShapeGeometry(shape, 8);
}

function EnamelPanel({
  width,
  height,
  radius,
  stroke = 0,
  ...props
}: {
  width: number;
  height: number;
  radius: number;
  stroke?: number;
} & Pick<ComponentProps<'mesh'>, 'name' | 'position' | 'material'>) {
  const geometry = useMemo(
    () => createEnamelGeometry(width, height, radius, stroke),
    [width, height, radius, stroke]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh {...props} geometry={geometry} />;
}

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
  const sealMaterial = useSignMaterial('#294b3c');
  return (
    <group name={`heritage-${brand}-poster`} userData={{ noStaticBatch: true }}>
      <mesh material={paperMaterial}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <EnamelPanel
        name={`heritage-${brand}-keyline`}
        width={width * 0.91}
        height={height * 0.93}
        radius={width * 0.055}
        stroke={width * 0.008}
        position={[0, 0, 0.006]}
        material={accentMaterial}
      />
      {!dino && (
        <mesh
          name="heritage-flour-seal"
          position={[0, height * 0.045, 0.008]}
          material={sealMaterial}
        >
          <circleGeometry args={[width * 0.325, 48]} />
        </mesh>
      )}
      <IlluminatedSignText
        name={`heritage-${brand}-heading`}
        font={HERITAGE_LETTERING_FONT}
        position={[0, height * 0.33, 0.01]}
        fontSize={width * 0.126}
        letterSpacing={0.035}
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
        colour={dino ? '#ffffff' : '#e4c680'}
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
      <EnamelPanel
        name="dead-dino-illustration-seat"
        width={3.36}
        height={2.58}
        radius={0.16}
        position={[0, 0.72, 0.008]}
        material={panelMaterial}
      />
      <EnamelPanel
        name="dead-dino-pylon-keyline"
        width={3.5}
        height={4.5}
        radius={0.15}
        stroke={0.028}
        position={[0, 0, 0.012]}
        material={panelMaterial}
      />
      <HeritageEmblem kind="dino" width={3.22} position={[0, 0.81, 0.018]} backlit />
      {(['DEAD', 'DINO'] as const).map((word, index) => (
        <IlluminatedSignText
          key={word}
          font={HERITAGE_LETTERING_FONT}
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

/** Enamel route board seated above the bench. The notice reads the actual bus
 * controller, including delay holds. Working if day/dusk print stays in its
 * measured frame, service notices agree with the bus, and no light/map is added.
 */
export function TransitServiceBoard() {
  const paper = useSignMaterial('#efe3c7');
  const enamel = useSignMaterial('#294b3c');
  const brass = useSignMaterial('#a27733');
  const noticePaper = useSignMaterial('#eadbb4');
  const bus = useRef<THREE.Object3D | null>(null);
  const [notice, setNotice] = useState('ROUTE INFORMATION');
  const last = useRef(notice);
  useFrame(({ scene }) => {
    if (!bus.current?.parent)
      bus.current = scene.getObjectByName('community-autonomous-village-bus') ?? null;
    let source: THREE.Object3D | null = bus.current,
      attached = false,
      visible = true;
    for (let node = source?.parent; node; node = node.parent) {
      visible = visible && node.visible;
      attached = attached || node === scene;
    }
    if (!attached || !visible) source = null;
    const value = communityBusNotice(
      source
        ? {
            serviceOpen: source.userData.communityServiceOpen,
            doorsOpen: source.userData.communityDoorsOpen,
          }
        : null
    );
    if (value !== last.current) {
      last.current = value;
      setNotice(value);
    }
  });
  return (
    <group name="bus-service-board" position={[0, 1.65, -0.84]} userData={{ noStaticBatch: true }}>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[0.88, 1.12, 0.055]} />
        <meshStandardMaterial color="#294b3c" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh material={paper}>
        <planeGeometry args={[0.78, 1.02]} />
      </mesh>
      <EnamelPanel
        name="bus-route-keyline"
        width={0.73}
        height={0.96}
        radius={0.055}
        stroke={0.009}
        position={[0, 0, 0.006]}
        material={brass}
      />
      <mesh name="bus-route-crest-field" position={[0, 0.285, 0.008]} material={enamel}>
        <circleGeometry args={[0.15, 48]} />
      </mesh>
      <mesh name="bus-route-crest-keyline" position={[0, 0.285, 0.009]} material={brass}>
        <ringGeometry args={[0.137, 0.142, 48]} />
      </mesh>
      <HeritageEmblem
        kind="wheat"
        width={0.24}
        position={[0, 0.285, 0.01]}
        colour="#e4c680"
        backlit
      />
      <EnamelPanel
        name="bus-service-paper"
        width={0.65}
        height={0.225}
        radius={0.028}
        position={[0, -0.325, 0.007]}
        material={noticePaper}
      />
      <IlluminatedSignText
        name="bus-route-heading"
        font={HERITAGE_LETTERING_FONT}
        position={[0, 0.035, 0.011]}
        fontSize={0.133}
        maxWidth={0.66}
        letterSpacing={0.015}
        color="#283f49"
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        Route 42
      </IlluminatedSignText>
      <IlluminatedSignText
        name="bus-route-destination"
        position={[0, -0.105, 0.011]}
        fontSize={0.065}
        maxWidth={0.62}
        color="#283f49"
        anchorX="center"
        anchorY="middle"
        surface="painted"
      >
        Town Centre
      </IlluminatedSignText>
      <IlluminatedSignText
        name="bus-service-notice"
        position={[0, -0.325, 0.012]}
        fontSize={0.058}
        maxWidth={0.59}
        lineHeight={1.45}
        textAlign="center"
        color="#283f49"
        anchorX="center"
        anchorY="middle"
        surface="painted"
        characters="ROUTE INFORMATIONBUS AT THE STOPSERVICE HOURS06:00 TO 22:00"
      >
        {notice}
      </IlluminatedSignText>
    </group>
  );
}
