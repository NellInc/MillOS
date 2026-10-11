import { HeritageEmblem, IlluminatedSignText } from './HeritageSignage';
import { SceneText } from '../shared/SceneText';
import { ExteriorDownlight, EXTERIOR_LAMP_LENS_MATERIAL } from '../exterior/ExteriorLighting';
import { useGraphicsStore } from '../../stores/graphicsStore';

const LETTERING_FONT = `${import.meta.env.BASE_URL}fonts/MedievalSharp.ttf`;
const GOLD = '#e4c680';

/** Measured joinery and print, shared by the village shopfronts and civic signs.
 * Working if the longest title and its caption stay inside the inner keyline.
 */
export function VillageNameboard({
  title,
  caption,
  width,
  height = 0.72,
  colour = '#244d43',
  crest,
  illuminated = false,
}: {
  title: string;
  caption?: string;
  width: number;
  height?: number;
  colour?: string;
  crest?: 'wheat' | string;
  illuminated?: boolean;
}) {
  const textWidth = width - (crest ? height * 1.5 : 0.42);
  const textX = crest ? height * 0.45 : 0;
  // Small internally illuminated letters share the established dusk dimmer.
  // Timber, coloured fascia and keylines remain physically lit. Working if
  // shop titles are readable at night and civic/pub paint keeps its old finish.
  const Lettering = illuminated ? IlluminatedSignText : SceneText;
  return (
    <group name={`village-nameboard-${title.toLowerCase().replaceAll(' ', '-')}`}>
      <mesh castShadow>
        <boxGeometry args={[width, height, 0.14]} />
        <meshStandardMaterial color="#4a3625" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.084]}>
        <boxGeometry args={[width - 0.12, height - 0.1, 0.045]} />
        <meshStandardMaterial color={colour} roughness={0.63} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0, side * (height / 2 - 0.035), 0.09]}>
            <boxGeometry args={[width + 0.045, 0.055, 0.085]} />
            <meshStandardMaterial color={GOLD} roughness={0.5} metalness={0.05} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.035), 0, 0.09]}>
            <boxGeometry args={[0.055, height, 0.085]} />
            <meshStandardMaterial color={GOLD} roughness={0.5} metalness={0.05} />
          </mesh>
          <mesh position={[0, side * (height / 2 - 0.115), 0.112]}>
            <planeGeometry args={[width - 0.31, 0.009]} />
            <meshStandardMaterial color={GOLD} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {crest && (
        <group position={[-width / 2 + height * 0.63, 0, 0.115]}>
          <mesh>
            <ringGeometry args={[height * 0.27, height * 0.28, 32]} />
            <meshStandardMaterial color={GOLD} roughness={0.7} />
          </mesh>
          {crest === 'wheat' ? (
            <HeritageEmblem
              kind="wheat"
              width={height * 0.51}
              colour={GOLD}
              position={[0, 0, 0.006]}
              backlit={illuminated}
            />
          ) : (
            <Lettering
              position={[0, 0, 0.006]}
              font={LETTERING_FONT}
              fontSize={height * 0.4}
              maxWidth={height * 0.45}
              color={GOLD}
              anchorX="center"
              anchorY="middle"
              userData={{ noStaticBatch: illuminated }}
              surface="painted"
            >
              {crest}
            </Lettering>
          )}
        </group>
      )}
      <Lettering
        name={`village-lettering-${title}`}
        position={[textX, caption ? height * 0.1 : 0, 0.12]}
        font={LETTERING_FONT}
        fontSize={Math.min(height * (caption ? 0.47 : 0.52), textWidth / (title.length * 0.71))}
        maxWidth={textWidth}
        letterSpacing={0.035}
        textAlign="center"
        color="#fff2d5"
        outlineWidth={0.003}
        outlineColor="#fff2d5"
        anchorX="center"
        anchorY="middle"
        userData={{ noStaticBatch: illuminated }}
        surface="painted"
      >
        {title}
      </Lettering>
      {caption && (
        <Lettering
          name={`village-caption-${title}`}
          position={[textX, -height * 0.235, 0.12]}
          fontSize={Math.min(height * 0.14, textWidth / (caption.length * 0.65))}
          maxWidth={textWidth}
          letterSpacing={0.09}
          textAlign="center"
          color={GOLD}
          anchorX="center"
          anchorY="middle"
          userData={{ noStaticBatch: illuminated }}
          surface="painted"
        >
          {caption}
        </Lettering>
      )}
    </group>
  );
}

export function VillageShopSign({ trade }: { trade?: string }) {
  const bakery = trade === 'BAKER' || trade === 'BAKERY';
  const butcher = trade === 'BUTCHER';
  return (
    <group position={[0, 3.23, 2.52]}>
      <VillageNameboard
        title={bakery ? 'BAKERY' : (trade ?? 'VILLAGE SHOP')}
        caption={
          bakery ? 'BREAD & PATISSERIE' : butcher ? 'FARMHOUSE MEATS' : 'PROVISIONS & FINE GOODS'
        }
        width={5.24}
        illuminated
        colour={bakery ? '#75454a' : butcher ? '#365043' : '#263f55'}
        crest={bakery ? 'wheat' : butcher ? 'B' : 'G'}
      />
    </group>
  );
}

export function FlourAndBarrelSign() {
  return (
    <group name="flour-and-barrel-hanging-sign" position={[4.02, 4.52, 1.2]}>
      <mesh position={[0.73, 0, 0]} castShadow>
        <boxGeometry args={[1.56, 0.07, 0.07]} />
        <meshStandardMaterial color="#303531" roughness={0.65} metalness={0.5} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0.93 + side * 0.46, -0.18, 0]}>
          <boxGeometry args={[0.026, 0.36, 0.026]} />
          <meshStandardMaterial color="#b99b61" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
      {[0, Math.PI].map((yaw) => (
        <group key={yaw} position={[0.93, -0.8, yaw === 0 ? 0.08 : -0.08]} rotation={[0, yaw, 0]}>
          <VillageNameboard
            title={'Flour & Barrel'}
            caption="VILLAGE INN"
            width={1.78}
            height={0.91}
          />
        </group>
      ))}
    </group>
  );
}

/** Small shielded fittings illuminate paint rather than making it emissive.
 * Working if all three nameboard faces read at night, the sources fade to zero
 * at clear noon and the existing celestial shadow-map count stays unchanged.
 */
export const PUB_SIGN_LAMPS = [
  { id: 'fascia', position: [0, 4.65, 3.68], intensity: 12, distance: 3.2, width: 1.3 },
  {
    id: 'hanging-front',
    position: [4.95, 4.35, 1.68],
    intensity: 3.2,
    distance: 1.65,
    width: 0.65,
  },
  { id: 'hanging-back', position: [4.95, 4.35, 0.72], intensity: 3.2, distance: 1.65, width: 0.65 },
] as const;

/** The retained pub wall lanterns sit beside the doorway, not above the sign.
 * Working if these short warm cones reveal the threshold at dusk, stay off at
 * clear noon and on Low, and allocate no additional shadow map or fitting.
 */
export const PUB_DOOR_LAMPS = [-1, 1].map((side) => ({
  id: side < 0 ? 'left' : 'right',
  position: [side * 0.98, 2.62, 3.48] as [number, number, number],
  intensity: 16,
  distance: 4.1,
}));

export function PubSignLighting() {
  const disabled = useGraphicsStore((s) => s.graphics.perfDebug.disableLightingPolish);
  const doorwayLight = useGraphicsStore(
    (s) =>
      s.graphics.quality !== 'low' &&
      !s.graphics.perfDebug.disablePunctualLights &&
      !s.graphics.perfDebug.disableLightingPolish
  );
  return (
    <group name="pub-painted-sign-lighting">
      {doorwayLight &&
        PUB_DOOR_LAMPS.map((lamp) => (
          <ExteriorDownlight
            key={lamp.id}
            name={`pub-door-lamp:${lamp.id}`}
            position={lamp.position}
            intensity={lamp.intensity}
            distance={lamp.distance}
            color="#ffe0a0"
          />
        ))}
      {PUB_SIGN_LAMPS.map((lamp) => (
        <group key={lamp.id} position={[...lamp.position]}>
          <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
            <boxGeometry args={[lamp.width, 0.085, 0.22]} />
            <meshStandardMaterial color="#34453e" roughness={0.56} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.008, 0]} material={EXTERIOR_LAMP_LENS_MATERIAL}>
            <boxGeometry args={[lamp.width * 0.85, 0.012, 0.12]} />
          </mesh>
          <mesh
            position={[
              0,
              0.11,
              lamp.id === 'hanging-back' ? 0.25 : lamp.id === 'fascia' ? -0.35 : -0.25,
            ]}
            castShadow
          >
            <boxGeometry args={[0.055, 0.07, lamp.id === 'fascia' ? 0.7 : 0.5]} />
            <meshStandardMaterial color="#34453e" roughness={0.56} metalness={0.4} />
          </mesh>
          <ExteriorDownlight
            name={`pub-sign-lamp:${lamp.id}`}
            position={[0, 0, 0]}
            intensity={disabled ? 0 : lamp.intensity}
            distance={lamp.distance}
            color="#ffe0a0"
          />
        </group>
      ))}
    </group>
  );
}
