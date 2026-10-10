/** Keep the narrowboat's warm glazing on its generated cabin. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import { EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';

/** One live dimmer and one diagnostic strength, with no extra texture or light. */
export const BOAT_INTERIOR_STRENGTH = { value: 1 };

/**
 * Cabin glass occupies atlas slot 10. The eight portholes, four door panes, brass
 * rims and closed hull remain unchanged. Shallow cabin shading sits behind
 * that glass in object-rest metres, so it follows the boat and the viewer.
 */
export function applyBoatPortholes(material: THREE.MeshStandardMaterial, night: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.boatNight = night;
    shader.uniforms.boatInteriorStrength = BOAT_INTERIOR_STRENGTH;
    shader.uniforms.boatLinen = { value: new THREE.Color('#e8dbc0') };
    shader.uniforms.boatWall = { value: new THREE.Color('#ba946b') };
    shader.uniforms.boatTimber = { value: new THREE.Color('#62432f') };
    shader.uniforms.boatRoomLight = { value: new THREE.Color('#ffdbab').multiplyScalar(0.85) };
    shader.vertexShader = `varying vec3 vBoatPosition;
      varying vec2 vBoatUV;
      varying vec3 vBoatAxisX;
      varying vec3 vBoatAxisZ;
      ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vBoatPosition = position;
       vBoatUV = uv;
       vBoatAxisX = (modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
       vBoatAxisZ = (modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;`
    );
    shader.fragmentShader = `varying vec3 vBoatPosition;
      varying vec2 vBoatUV;
      varying vec3 vBoatAxisX;
      varying vec3 vBoatAxisZ;
      uniform float boatNight;
      uniform float boatInteriorStrength;
      uniform vec3 boatLinen;
      uniform vec3 boatWall;
      uniform vec3 boatTimber;
      uniform vec3 boatRoomLight;
      ${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       // Atlas identity excludes hull, roof, roses and brass regardless of
       // albedo or illumination. The four end panes share the same occupied cabin.
       float glassTile = step(0.50, vBoatUV.x) * (1.0 - step(0.75, vBoatUV.x))
         * step(0.25, vBoatUV.y) * (1.0 - step(0.50, vBoatUV.y));
       float porthole = glassTile * step(1.18, abs(vBoatPosition.x))
         * (1.0 - step(1.20, abs(vBoatPosition.x)))
         * step(1.80, vBoatPosition.y) * (1.0 - step(2.26, vBoatPosition.y));
       // Derivatives are evaluated before the aperture branch. Folds fade at
       // distance rather than aliasing across the small physical glazing disc.
       float endPane = glassTile * step(3.54, abs(vBoatPosition.z))
         * (1.0 - step(4.14, abs(vBoatPosition.z)))
         * step(1.92, vBoatPosition.y) * (1.0 - step(2.28, vBoatPosition.y))
         * (1.0 - step(0.44, abs(vBoatPosition.x)));
       float glazing = max(porthole, endPane);
       float foldFilter = mix(
         clamp(1.0 - fwidth(vBoatPosition.z) * 45.0, 0.0, 1.0),
         clamp(1.0 - fwidth(vBoatPosition.x) * 75.0, 0.0, 1.0), endPane);
       if (glazing > 0.5) {
         float bay = clamp(floor((vBoatPosition.z + 3.60) / 1.60), 0.0, 3.0);
         float centreZ = -2.80 + bay * 1.60;
         vec2 sidePane = vec2(vBoatPosition.z - centreZ, vBoatPosition.y - 2.03) / 0.205;
         // Measured upper-door glass: two 0.247 x 0.340 m panes at each end.
         vec2 doorPane = vec2(
           (vBoatPosition.x - sign(vBoatPosition.x) * 0.298164) / 0.123378,
           (vBoatPosition.y - 2.10) / 0.170);
         vec2 pane = mix(sidePane, doorPane, endPane);
         bay = mix(bay, 4.0 + step(0.0, vBoatPosition.x), endPane);
         vec3 axisX = normalize(vBoatAxisX), axisZ = normalize(vBoatAxisZ);
         vec3 axisY = normalize(cross(axisZ, axisX));
         vec3 eye = normalize(vViewPosition);
         vec3 outward = mix(axisX * sign(vBoatPosition.x), axisZ * sign(vBoatPosition.z), endPane);
         vec3 across = mix(axisZ, axisX, endPane);
         float facing = max(0.25, dot(eye, outward));
         vec2 slope = vec2(dot(eye, across), dot(eye, axisY)) / facing;
         vec2 inside = pane - clamp(slope, vec2(-1.6), vec2(1.6)) * 1.10;
         vec3 room = boatWall * (0.62 + 0.18 * smoothstep(-1.2, 0.8, inside.y));
         float timber = 1.0 - smoothstep(-0.34, -0.27, inside.y);
         room = mix(room, boatTimber * 0.82, timber);
         float shelf = (1.0 - smoothstep(0.035, 0.075, abs(inside.y + 0.12)))
           * (1.0 - smoothstep(0.65, 0.95, abs(inside.x)));
         room = mix(room, boatTimber, shelf * 0.55);
         float curtainEdge = 0.68 - 0.20 * smoothstep(-0.25, 0.75, pane.y);
         float curtain = smoothstep(curtainEdge - 0.035, curtainEdge + 0.035, abs(pane.x));
         float fold = 0.78 + 0.08 * cos(pane.x * 9.0) * foldFilter;
         room = mix(room, boatLinen * fold, curtain);
         // Reading lights alternate across bays, seen through
         // the opening. Front curtains occlude it rather than glowing through.
         vec2 lampAt = vec2(mix(-0.32, 0.32, mod(bay, 2.0)), 0.06);
         float lamp = (1.0 - smoothstep(0.10, 0.22, length(inside - lampAt)))
           * (1.0 - curtain);
         float strength = clamp(boatInteriorStrength, 0.0, 1.0);
         diffuseColor.rgb = mix(diffuseColor.rgb, room, strength * mix(0.32, 0.72, boatNight));
         totalEmissiveRadiance += boatRoomLight * (room * 0.75 + vec3(lamp * 0.55))
           * boatNight * strength;
       }`
    );
  };
  material.customProgramCacheKey = () => 'millos-authored-boat-portholes-v4';
}

export function GeneratedBoatModel() {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.canalBoat);
  const night = EXTERIOR_LAMP_LEVEL;
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!(object.material instanceof THREE.MeshStandardMaterial))
        throw new Error('Boat lighting requires a standard material');
      const material = object.material.clone();
      applyBoatPortholes(material, night);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials };
  }, [scene, night]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}
