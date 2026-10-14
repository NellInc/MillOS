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

export const HERITAGE_ART = {
  dino: `${import.meta.env.BASE_URL}textures/signage/dead-dino.webp`,
  wheat: `${import.meta.env.BASE_URL}textures/signage/wheat-sheaf.webp`,
} as const;

/** Complete raster prints retain painted lettering, illustration and paper together.
 * Working if each fitted print stays in the old seat, loads through useTexture,
 * and its actual colour texture also drives the existing dimmed emission.
 */
export const HERITAGE_PRINT_ART = {
  flour: `${import.meta.env.BASE_URL}textures/signage/flour-painted-v1.webp`,
  dino: `${import.meta.env.BASE_URL}textures/signage/dino-painted-v2.webp`,
  route: `${import.meta.env.BASE_URL}textures/signage/route-painted-v1.webp`,
  bakery: `${import.meta.env.BASE_URL}textures/signage/bakery-painted-v1.webp`,
  butcher: `${import.meta.env.BASE_URL}textures/signage/butcher-painted-v1.webp`,
  grocer: `${import.meta.env.BASE_URL}textures/signage/grocer-painted-v1.webp`,
} as const;
export type HeritagePrintKind = keyof typeof HERITAGE_PRINT_ART;

/** Each world business owns its name, symbol and application field.
 * Working if all seven names keep distinct raster identities on their old seats.
 */
export const BUSINESS_BRANDS = {
  dino: {
    name: 'DEAD DINO',
    field: '#143c36',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-dead-dino-v2.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-dead-dino-fascia-v2.webp`,
    pylon: `${import.meta.env.BASE_URL}textures/signage/brand-dead-dino-pylon-v2.webp`,
  },
  bakery: {
    name: 'Riverside Bakers',
    field: '#2d2530',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-riverside-bakers-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-riverside-bakers-fascia-v1.webp`,
  },
  butcher: {
    name: 'Fieldgate Butchers',
    field: '#183b30',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-fieldgate-butchers-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-fieldgate-butchers-fascia-v1.webp`,
  },
  grocer: {
    name: 'Canalside Provisions',
    field: '#1c354b',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-canalside-provisions-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-canalside-provisions-fascia-v1.webp`,
  },
  mill: {
    name: 'MillOS',
    field: '#173c45',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-millos-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-millos-v1.webp`,
  },
  flourExpress: {
    name: 'FLOUR EXPRESS',
    field: '#703828',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-flour-express-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-flour-express-v1.webp`,
  },
  grainCo: {
    name: 'GRAIN CO',
    field: '#183d35',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-grain-co-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-grain-co-v1.webp`,
  },
} as const;
export type BusinessBrandKind = keyof typeof BUSINESS_BRANDS;

export function transportBrandForCompany(company: string): 'flourExpress' | 'grainCo' | null {
  return company === 'FLOUR EXPRESS' ? 'flourExpress' : company === 'GRAIN CO' ? 'grainCo' : null;
}

/** Contain the print without stretching letters or clipping its perimeter. */
export function heritagePrintSize(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number
) {
  const aspect = imageWidth / imageHeight;
  const w = Math.min(width, height * aspect);
  return [w, w / aspect] as [number, number];
}

type RasterSignProps = {
  width: number;
  height: number;
  name?: string;
  position?: [number, number, number];
  backlit?: boolean;
  surfaceRadius?: number;
};

export function HeritageRasterPrint({
  art,
  ...props
}: RasterSignProps & { art: HeritagePrintKind }) {
  return <RasterSignPrint {...props} url={HERITAGE_PRINT_ART[art]} printId={art} />;
}

export function BusinessBrandMark({
  brand,
  variant = 'primary',
  ...props
}: RasterSignProps & { brand: BusinessBrandKind; variant?: 'primary' | 'fascia' | 'pylon' }) {
  const identity = BUSINESS_BRANDS[brand];
  const url =
    variant === 'pylon' && brand === 'dino'
      ? BUSINESS_BRANDS.dino.pylon
      : variant === 'fascia'
        ? identity.fascia
        : identity.primary;
  return <RasterSignPrint {...props} url={url} printId={`brand-${brand}-${variant}`} />;
}

function RasterSignPrint({
  url,
  printId,
  width,
  height,
  name,
  position = [0, 0, 0],
  backlit = true,
  surfaceRadius,
}: RasterSignProps & { url: string; printId: string }) {
  const texture = useTexture(url);
  const material = useSignMaterial('#ffffff', texture, backlit);
  useLayoutEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);
  // useTexture resolves the actual image before this component mounts.
  const image = texture.image as { width: number; height: number };
  const size = heritagePrintSize(width, height, image.width, image.height);
  const angle = surfaceRadius ? size[0] / surfaceRadius : 0;
  return (
    <mesh
      name={name ?? `heritage-${printId}-raster-print`}
      position={position}
      material={material}
      userData={{ noStaticBatch: backlit, heritagePrint: printId }}
    >
      {surfaceRadius ? (
        <cylinderGeometry
          args={[surfaceRadius, surfaceRadius, size[1], 32, 1, true, -angle / 2, angle]}
        />
      ) : (
        <planeGeometry args={size} />
      )}
    </mesh>
  );
}

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
  return (
    <group name={`heritage-${brand}-poster`} userData={{ noStaticBatch: true }}>
      <HeritageRasterPrint art={brand} width={width} height={height} />
    </group>
  );
}

export function DeadDinoPylonFace() {
  const fieldMaterial = useSignMaterial(BUSINESS_BRANDS.dino.field);
  return (
    <group name="dead-dino-enamel-pylon-face" userData={{ noStaticBatch: true }}>
      <mesh material={fieldMaterial}>
        <planeGeometry args={[3.7, 4.7]} />
      </mesh>
      <BusinessBrandMark
        brand="dino"
        variant="pylon"
        width={3.7}
        height={4.7}
        position={[0, 0, 0.01]}
      />
    </group>
  );
}

/** Enamel route board seated above the bench. The notice reads the actual bus
 * controller, including delay holds. Working if day/dusk print stays in its
 * measured frame, service notices agree with the bus, and no light is added.
 */
export function TransitServiceBoard() {
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
      <HeritageRasterPrint art="route" name="bus-route-raster-print" width={0.78} height={1.02} />
      <IlluminatedSignText
        name="bus-service-notice"
        position={[0, -0.35, 0.012]}
        fontSize={0.055}
        maxWidth={0.59}
        lineHeight={1.3}
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
