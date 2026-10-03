import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CASTLE_STEPS,
  CASTLE_ACCESS_LANTERNS,
  CASTLE_STAIR_X,
  CASTLE_STAIR_WIDTH,
  CASTLE_ROCK_SINK,
} from '../../constants/castleAccess';
import { useGraphicsStore } from '../../stores/graphicsStore';
import {
  ExteriorLampPool,
  ExteriorPointLight,
  EXTERIOR_LAMP_LENS_MATERIAL,
} from '../exterior/ExteriorLighting';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { applyWorldSurface } from '../../utils/worldSurface';

// One draw for the treads and the two stone cheek walls. Shared by the delivered
// palace and its fallback, so loading failure cannot remove the walking route.
export function createCastleStepsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const { minZ, maxZ, height } of CASTLE_STEPS) {
    parts.push(
      new THREE.BoxGeometry(CASTLE_STAIR_WIDTH, height, maxZ - minZ).translate(
        CASTLE_STAIR_X,
        height / 2,
        (minZ + maxZ) / 2
      )
    );
  }
  // Smooth parapet caps follow each flight; the resting landing is horizontal.
  const profile = new THREE.Shape();
  profile.moveTo(15.7, 0);
  profile.lineTo(24.7, 0);
  profile.lineTo(24.7, 1.005);
  profile.lineTo(21.1, 2.38);
  profile.lineTo(20.2, 2.38);
  profile.lineTo(16.6, 3.88);
  profile.lineTo(15.7, 3.88);
  profile.closePath();
  for (const side of [-1, 1]) {
    const cheek = new THREE.ExtrudeGeometry(profile, { depth: 0.2, bevelEnabled: false, steps: 1 });
    // profile x becomes local z, extrusion becomes local x.
    cheek.rotateY(-Math.PI / 2);
    cheek.translate(CASTLE_STAIR_X + side * (CASTLE_STAIR_WIDTH / 2) + (side > 0 ? 0.2 : 0), 0, 0);
    parts.push(cheek);
  }
  const nonIndexed = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(nonIndexed);
  for (const part of new Set([...parts, ...nonIndexed])) part.dispose();
  return merged;
}
const GEOMETRY = createCastleStepsGeometry();
const MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#dce5e9', roughness: 0.94 }),
  'masonry'
);

const LANTERN_GEOMETRY = (() => {
  const g = new PlotGeometry();
  for (const [x, y, z] of CASTLE_ACCESS_LANTERNS) {
    g.box([0.1, 0.83, 0.1], [x, y - 0.59, z], '#394a49');
    for (const level of [-0.24, 0.24]) g.box([0.45, 0.07, 0.45], [x, y + level, z], '#394a49');
    for (const side of [-1, 1])
      for (const edge of [-1, 1])
        g.box([0.04, 0.48, 0.04], [x + side * 0.19, y, z + edge * 0.19], '#394a49');
  }
  return g.finish();
})();
const LANTERN_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
const LENS_GEOMETRY = new THREE.BoxGeometry(0.34, 0.42, 0.34);

export function CastleSteps() {
  const realLight = useGraphicsStore(
    (s) => s.graphics.quality !== 'low' && !s.graphics.perfDebug.disableLightingPolish
  );
  return (
    <group position={[0, -CASTLE_ROCK_SINK, 0]}>
      <mesh
        name="castle-access-stairs"
        geometry={GEOMETRY}
        material={MATERIAL}
        castShadow
        receiveShadow
        dispose={null}
      />
      <group name="castle-access-lanterns">
        <mesh
          geometry={LANTERN_GEOMETRY}
          material={LANTERN_MATERIAL}
          castShadow
          receiveShadow
          dispose={null}
        />
        {CASTLE_ACCESS_LANTERNS.map((p, i) => (
          <mesh
            key={i}
            position={[...p]}
            geometry={LENS_GEOMETRY}
            material={EXTERIOR_LAMP_LENS_MATERIAL}
            dispose={null}
          />
        ))}
        <group position={[CASTLE_STAIR_X, 1.7, 20.65]} scale={[1, 1, 0.28]}>
          <ExteriorLampPool radius={1.4} />
        </group>
        <group position={[CASTLE_STAIR_X, 3.2, 16.15]} scale={[1, 1, 0.28]}>
          <ExteriorLampPool radius={1.4} />
        </group>
        {/* One clock-dimmed, non-shadow light covers both flights. Low keeps the
            inexpensive lens/pool cues; the existing isolation switch is retained. */}
        {realLight && (
          <ExteriorPointLight
            position={[...CASTLE_ACCESS_LANTERNS[0]]}
            intensity={32}
            distance={18}
          />
        )}
      </group>
    </group>
  );
}
