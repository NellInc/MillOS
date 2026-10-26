import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { applyWorldSurface } from '../../utils/worldSurface';
import {
  TANK_FARM_MANIFOLD,
  TANK_FARM_PAD_TOP,
  YARD_DRAIN,
  YARD_DRAINS,
  YARD_INTAKE,
  manifoldDropX,
  slotDrainKerbs,
  slotDrainPlates,
  tankUndersideY,
  type ManifoldTank,
} from './serviceYardDressingLayout';

/**
 * The tank-farm manifold and the yard's intake grate and drains
 * (`serviceYardDressingLayout.ts`). All lit matter; painted pipe, galvanised
 * grating, a red handwheel, and ground paint on the exterior overlay datum.
 */

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PIPE = new THREE.CylinderGeometry(1, 1, 1, 12);
const WHEEL = new THREE.TorusGeometry(1, 0.12, 6, 18);

const PIPE_PAINT = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#8c8f5a', roughness: 0.55, metalness: 0.2 }),
  'painted'
);
const GALVANISED = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#8a9396', roughness: 0.5, metalness: 0.6 }),
  'metal'
);
/**
 * The intake grating (once also the drain covers): weathered neutral steel. They lie
 * face-up, so at the galvanised finish's metalness 0.6 they mirrored the sky,
 * and at 18:30 the bars turned blue and the silo-edge drain read as a stray
 * thin blue line (judge-r5-1830). Mostly diffuse now, with a dull sheen.
 */
export const YARD_GRATING_STEEL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#7e7e7c', roughness: 0.68, metalness: 0.25 }),
  'metal'
);
/**
 * The drain covers: darker and duller than the grating, so the slot reads as a
 * channel at noon by its dark cover rather than by pale kerbs.
 */
export const YARD_DRAIN_COVER_STEEL = applyWorldSurface(
  new THREE.MeshStandardMaterial({ color: '#4f4f4e', roughness: 0.82, metalness: 0.12 }),
  'metal'
);
/**
 * Concrete kerb cast either side of each drain channel, at the apron's value.
 * At '#b8b4ab' (0.46 linear) the kerbs were the drain's two pale lines: 1.45x
 * the ground at noon and 2.1x at 18:30 (final6 yard), because the terrain's
 * hardstanding takes cavity AO on its indirect light and this does not. The
 * exterior's 0.72 environment response, and the apron's albedo.
 */
export const YARD_KERB_CONCRETE = new THREE.MeshStandardMaterial({
  color: '#7f7c75',
  roughness: 0.92,
  metalness: 0,
  envMapIntensity: 0.72,
});
const HANDWHEEL = new THREE.MeshStandardMaterial({
  color: '#a3322a',
  roughness: 0.5,
  metalness: 0.2,
});
/** Oil film in a drip tray and the dark of a pit or drain under its cover. */
const DARK = new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.9, metalness: 0 });
const overlay = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
    polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
    ...extra,
  });
const PIT = overlay('#141617');
const HAZARD_PAINT = overlay('#d9bb3f', { roughness: 0.8 });

/** A pipe between two points, as a scaled unit cylinder. */
const Pipe: React.FC<{
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  radius: number;
  material?: THREE.Material;
}> = ({ from, to, radius, material = PIPE_PAINT }) => {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize()
  );
  return (
    <mesh
      geometry={PIPE}
      material={material}
      position={mid}
      quaternion={quaternion}
      scale={[radius, a.distanceTo(b), radius]}
      castShadow
      receiveShadow
    />
  );
};

/** Farm-local; mounted inside the tank farm group. */
export const TankFarmManifold: React.FC<{ tanks: readonly ManifoldTank[] }> = ({ tanks }) => {
  const m = TANK_FARM_MANIFOLD;
  const { header, stand, branch, valve, tray } = m;
  return (
    <group name="tank-farm-manifold">
      <Pipe
        from={[header.x, header.y, header.z0]}
        to={[header.x, header.y, header.z1]}
        radius={header.radius}
      />
      {/* Blind flanges on both header ends. */}
      {[header.z0, header.z1].map((z) => (
        <Pipe
          key={`flange-${z}`}
          from={[header.x, header.y, z - 0.03]}
          to={[header.x, header.y, z + 0.03]}
          radius={header.radius * 1.7}
          material={GALVANISED}
        />
      ))}
      {/* Low stands: two posts, a cross bar under the pipe, a base plate. */}
      {m.standZs.map((z) => (
        <group key={`stand-${z}`} position={[header.x, 0, z]}>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              geometry={BOX}
              material={GALVANISED}
              position={[
                (side * stand.width) / 2,
                (TANK_FARM_PAD_TOP + header.y - header.radius) / 2,
                0,
              ]}
              scale={[stand.post, header.y - header.radius - TANK_FARM_PAD_TOP, stand.post]}
              castShadow
              receiveShadow
            />
          ))}
          <mesh
            geometry={BOX}
            material={GALVANISED}
            position={[0, header.y - header.radius - 0.03, 0]}
            scale={[stand.width + stand.post, 0.06, stand.post]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={BOX}
            material={GALVANISED}
            position={[0, TANK_FARM_PAD_TOP + 0.01, 0]}
            scale={[stand.width + stand.plate, 0.02, stand.plate]}
            receiveShadow
          />
        </group>
      ))}
      {/* The wheel's torus is its rim; its centre must meet the valve stem.
          Crossed spokes reach the rim centreline, all inside its existing envelope. */}
      <group name="valve-handwheel-connections">
        <BoxSet
          material={HANDWHEEL}
          parts={tanks.flatMap((tank) => {
            const position: [number, number, number] = [valve.x, header.y + valve.stem, tank.z];
            return [
              { position, scale: [0.09, 0.06, 0.09] as [number, number, number] },
              { position, scale: [2 * valve.wheel, 0.025, 0.03] as [number, number, number] },
              { position, scale: [0.03, 0.025, 2 * valve.wheel] as [number, number, number] },
            ];
          })}
        />
      </group>
      {tanks.map((tank) => {
        const x = manifoldDropX(tank);
        const top = tankUndersideY(tank, TANK_FARM_PAD_TOP);
        return (
          <group key={`branch-${tank.z}`}>
            {/* Drop from the barrel's underside, its flange seated on the shell. */}
            <Pipe
              from={[x, top + 0.02, tank.z]}
              to={[x, header.y, tank.z]}
              radius={branch.radius}
            />
            <Pipe
              from={[x, top - 0.08, tank.z]}
              to={[x, top - 0.02, tank.z]}
              radius={branch.radius * 1.8}
              material={GALVANISED}
            />
            {/* Branch out to the header. */}
            <Pipe
              from={[x, header.y, tank.z]}
              to={[header.x, header.y, tank.z]}
              radius={branch.radius}
            />
            {/* Gate valve: body, bonnet and stem, handwheel. */}
            <mesh
              geometry={BOX}
              material={PIPE_PAINT}
              position={[valve.x, header.y, tank.z]}
              scale={[valve.body * 0.7, valve.body, valve.body]}
              castShadow
              receiveShadow
            />
            <Pipe
              from={[valve.x, header.y + valve.body / 2, tank.z]}
              to={[valve.x, header.y + valve.stem, tank.z]}
              radius={0.03}
              material={GALVANISED}
            />
            <mesh
              geometry={WHEEL}
              material={HANDWHEEL}
              position={[valve.x, header.y + valve.stem, tank.z]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[valve.wheel, valve.wheel, valve.wheel]}
              castShadow
            />
            {/* Drip tray on the pad under the valve: floor, four walls, oil film. */}
            <group position={[valve.x, TANK_FARM_PAD_TOP, tank.z]}>
              <mesh
                geometry={BOX}
                material={GALVANISED}
                position={[0, 0.01, 0]}
                scale={[tray.width, 0.02, tray.depth]}
                receiveShadow
              />
              {[-1, 1].map((side) => (
                <React.Fragment key={side}>
                  <mesh
                    geometry={BOX}
                    material={GALVANISED}
                    position={[(side * (tray.width - tray.wall)) / 2, tray.height / 2, 0]}
                    scale={[tray.wall, tray.height, tray.depth]}
                    castShadow
                    receiveShadow
                  />
                  <mesh
                    geometry={BOX}
                    material={GALVANISED}
                    position={[0, tray.height / 2, (side * (tray.depth - tray.wall)) / 2]}
                    scale={[tray.width - 2 * tray.wall, tray.height, tray.wall]}
                    castShadow
                    receiveShadow
                  />
                </React.Fragment>
              ))}
              <mesh
                geometry={BOX}
                material={DARK}
                position={[0, 0.035, 0]}
                scale={[tray.width - 2 * tray.wall - 0.01, 0.01, tray.depth - 2 * tray.wall - 0.01]}
                receiveShadow
              />
            </group>
          </group>
        );
      })}
    </group>
  );
};

/** Instanced boxes from a list of (position, scale), laid out once. */
const BoxSet: React.FC<{
  parts: readonly { position: [number, number, number]; scale: [number, number, number] }[];
  material: THREE.Material;
}> = ({ parts, material }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    parts.forEach(({ position, scale }, index) => {
      dummy.position.set(...position);
      dummy.scale.set(...scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [parts]);
  // After the overlays (renderOrder 1): their exteriorOverlay bias would
  // otherwise win the depth test over steel standing 2-4 cm above them, and
  // the grate read as a solid black pit (y5b med-12 yard).
  return (
    <instancedMesh ref={ref} args={[BOX, material, parts.length]} receiveShadow renderOrder={2} />
  );
};

const GROUND = EXTERIOR_LAYERS.ground;
const grate = YARD_INTAKE.grate;

/** The grating: bearing bars along z, cross bars, and the angle frame. */
const GRATE_STEEL = (() => {
  const parts: { position: [number, number, number]; scale: [number, number, number] }[] = [];
  const { bar, frame, crossBars } = YARD_INTAKE;
  const innerW = grate.width - 2 * frame.width;
  const innerL = grate.length - 2 * frame.width;
  const count = Math.floor(innerW / bar.pitch);
  for (let i = 0; i <= count; i += 1) {
    const x = grate.x - innerW / 2 + (i * innerW) / count;
    parts.push({
      position: [x, GROUND + bar.height / 2, grate.z],
      scale: [bar.width, bar.height, innerL],
    });
  }
  for (let i = 1; i <= crossBars; i += 1) {
    const z = grate.z - innerL / 2 + (i * innerL) / (crossBars + 1);
    parts.push({
      position: [grate.x, GROUND + bar.height * 0.4, z],
      scale: [innerW, bar.height * 0.8, bar.width],
    });
  }
  // Frame, standing a little proud of the bars.
  for (const side of [-1, 1]) {
    parts.push({
      position: [
        grate.x + (side * (grate.width - frame.width)) / 2,
        GROUND + frame.height / 2,
        grate.z,
      ],
      scale: [frame.width, frame.height, grate.length],
    });
    parts.push({
      position: [
        grate.x,
        GROUND + frame.height / 2,
        grate.z + (side * (grate.length - frame.width)) / 2,
      ],
      scale: [grate.width - 2 * frame.width, frame.height, frame.width],
    });
  }
  return parts;
})();

/** Slotted drain covers: short plates with a gap between, along every drain. */
const DRAIN_PLATES = YARD_DRAINS.flatMap((drain) =>
  slotDrainPlates(drain).map(({ x, z, alongX }) => ({
    position: [x, GROUND + YARD_DRAIN.height / 2, z] as [number, number, number],
    scale: (alongX
      ? [YARD_DRAIN.plate, YARD_DRAIN.height, YARD_DRAIN.width - 0.06]
      : [YARD_DRAIN.width - 0.06, YARD_DRAIN.height, YARD_DRAIN.plate]) as [number, number, number],
  }))
);

/** Concrete kerbs either side of every drain run (`slotDrainKerbs`). */
const DRAIN_KERBS = YARD_DRAINS.flatMap((drain) =>
  slotDrainKerbs(drain).map(({ x, z, size }) => ({
    position: [x, GROUND + YARD_DRAIN.kerbHeight / 2, z] as [number, number, number],
    scale: [size[0], YARD_DRAIN.kerbHeight, size[1]] as [number, number, number],
  }))
);

/** World metres; mounted with the continuous exterior. */
export const YardIntake: React.FC = () => {
  const { border } = YARD_INTAKE;
  const outerL = grate.length + 2 * border;
  return (
    <group name="yard-intake">
      {/* The pit's dark under the grating. */}
      <mesh
        material={PIT}
        position={[grate.x, EXTERIOR_LAYERS.groundOverlay, grate.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[grate.width, grate.length]} />
      </mesh>
      {/* Hazard band round the frame, as four painted strips. */}
      {[-1, 1].map((side) => (
        <React.Fragment key={side}>
          <mesh
            material={HAZARD_PAINT}
            position={[
              grate.x + (side * (grate.width + border)) / 2,
              EXTERIOR_LAYERS.groundOverlay,
              grate.z,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <planeGeometry args={[border, outerL]} />
          </mesh>
          <mesh
            material={HAZARD_PAINT}
            position={[
              grate.x,
              EXTERIOR_LAYERS.groundOverlay,
              grate.z + (side * (grate.length + border)) / 2,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <planeGeometry args={[grate.width, border]} />
          </mesh>
        </React.Fragment>
      ))}
      <BoxSet parts={GRATE_STEEL} material={YARD_GRATING_STEEL} />
      {/* Slot drains: the dark channel, its slotted cover on top. */}
      {YARD_DRAINS.map((drain) => {
        const dx = drain.to[0] - drain.from[0];
        const dz = drain.to[1] - drain.from[1];
        const alongX = Math.abs(dx) > 0;
        const length = Math.hypot(dx, dz);
        return (
          <mesh
            key={drain.id}
            material={PIT}
            position={[
              (drain.from[0] + drain.to[0]) / 2,
              EXTERIOR_LAYERS.groundOverlay,
              (drain.from[1] + drain.to[1]) / 2,
            ]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <planeGeometry
              args={alongX ? [length, YARD_DRAIN.width] : [YARD_DRAIN.width, length]}
            />
          </mesh>
        );
      })}
      <BoxSet parts={DRAIN_PLATES} material={YARD_DRAIN_COVER_STEEL} />
      <BoxSet parts={DRAIN_KERBS} material={YARD_KERB_CONCRETE} />
    </group>
  );
};
