import { HeritageEmblem } from './HeritageSignage';
import { SceneText } from '../shared/SceneText';

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
}: {
  title: string;
  caption?: string;
  width: number;
  height?: number;
  colour?: string;
  crest?: 'wheat' | string;
}) {
  const textWidth = width - (crest ? height * 1.5 : 0.42);
  const textX = crest ? height * 0.45 : 0;
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
            />
          ) : (
            <SceneText
              position={[0, 0, 0.006]}
              font={LETTERING_FONT}
              fontSize={height * 0.4}
              maxWidth={height * 0.45}
              color={GOLD}
              anchorX="center"
              anchorY="middle"
              surface="painted"
            >
              {crest}
            </SceneText>
          )}
        </group>
      )}
      <SceneText
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
        surface="painted"
      >
        {title}
      </SceneText>
      {caption && (
        <SceneText
          name={`village-caption-${title}`}
          position={[textX, -height * 0.235, 0.12]}
          fontSize={Math.min(height * 0.14, textWidth / (caption.length * 0.65))}
          maxWidth={textWidth}
          letterSpacing={0.09}
          textAlign="center"
          color={GOLD}
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          {caption}
        </SceneText>
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
