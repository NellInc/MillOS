/** The small office retains its two illuminated outer windows at night. */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';
import { EXTERIOR_LAMP_LEVEL } from '../exterior/ExteriorLighting';

/**
 * `night` is the live exterior dimmer, so dusk and dawn
 * write one float instead of re-cloning the model and all of its materials.
 */
export function applyOfficeWindows(material: THREE.MeshStandardMaterial, night: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.officeNight = night;
    shader.uniforms.officeGlow = { value: new THREE.Color('#ffb74d').multiplyScalar(0.9) };
    shader.uniforms.officeGlass = { value: new THREE.Color('#ffd28a') };
    shader.vertexShader = `varying vec3 vOfficePosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvOfficePosition = position;'
    );
    shader.fragmentShader =
      `varying vec3 vOfficePosition;\nuniform float officeNight;\nuniform vec3 officeGlow;\nuniform vec3 officeGlass;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      // Blue glazing only. Source vertices span x=-0.5..0.5 before normalization;
      // the central bay stays dark. Height and front-face bounds exclude blue roof trim.
      float officeWindow = officeNight * step(0.095, abs(vOfficePosition.x))
        * step(-0.16, vOfficePosition.y) * (1.0 - step(0.14, vOfficePosition.y))
        * step(0.30, vOfficePosition.z)
        * smoothstep(0.015, 0.055, diffuseColor.b - diffuseColor.r)
        * smoothstep(0.008, 0.035, diffuseColor.g - diffuseColor.r);
      diffuseColor.rgb = mix(diffuseColor.rgb, officeGlass, officeWindow);
      totalEmissiveRadiance += officeGlow * officeWindow;`
      );
  };
  material.customProgramCacheKey = () => 'millos-generated-office-window-v2';
}

/** Reuse the village's bounded virtual room on the delivered apartments.
 * Their provider UVs are an irregular atlas, so pane coordinates come from
 * measured facade bays and local heights, not from texture-sheet coordinates.
 * Both retain the 16.1-metre source Y scale after the middle-storey cut.
 * Working if close views reveal linen and rooms while alternating night floors,
 * the cyan cornices, concrete, doors and roof keep their original boundaries.
 */
export function applyApartmentWindows(
  material: THREE.MeshStandardMaterial,
  night: { value: number },
  floors: 3 | 4 = 4
) {
  applyVillageWindows(material, night, true, 'pane');
  const compileRoom = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compileRoom.call(material, shader, renderer);
    shader.uniforms.officeNight = night;
    shader.uniforms.officeGlow = { value: new THREE.Color('#ffdcb0').multiplyScalar(0.38) };
    shader.uniforms.villageGlow = shader.uniforms.officeGlow;
    shader.uniforms.villageRoomLight = shader.uniforms.officeGlow;
    shader.uniforms.villageLinen = { value: new THREE.Color('#e4e6dd') };
    shader.uniforms.apartmentFloorLow = {
      value: new THREE.Vector4(-0.42368, -0.20059, floors === 3 ? 0.01059 : 0.01663, 0.22798),
    };
    shader.uniforms.apartmentFloorHigh = {
      value: new THREE.Vector4(-0.30431, -0.08121, floors === 3 ? 0.13193 : 0.13014, 0.34932),
    };
    shader.vertexShader = `varying vec3 vOfficePosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvOfficePosition = position;'
    );
    shader.fragmentShader = `varying vec3 vOfficePosition;
      uniform vec4 apartmentFloorLow;
      uniform vec4 apartmentFloorHigh;
      ${shader.fragmentShader}`.replace(
      'float glazing = mix(1.0, atlasGlazing, villageAtlas);',
      `float roomHeight = (vOfficePosition.y + 0.5) * 16.1;
       float storey = floor(roomHeight / 3.5);
       float occupiedFloor = mod(floor(roomHeight / 3.5), 2.0);
       float aboveSill = step(0.52, mod(roomHeight, 3.5));
       // Retain the measured relative-chroma mask: masonry shares blue hues.
       float glazing = smoothstep(0.40, 0.55,
         (diffuseColor.b - diffuseColor.r) / max(0.001, diffuseColor.b))
         * smoothstep(0.32, 0.46,
         (diffuseColor.g - diffuseColor.r) / max(0.001, diffuseColor.g));
       glazing *= aboveSill * step(1.3, roomHeight) * (1.0 - step(13.8, roomHeight));`
    );
    const paneStart = shader.fragmentShader.indexOf('vec2 pane = mix(');
    const paneEnd = shader.fragmentShader.indexOf('vec2 du = dFdx(pane)', paneStart);
    shader.fragmentShader =
      shader.fragmentShader.slice(0, paneStart) +
      `// Front/back have three bays; the sides have four. The first-floor
       // central entrance shares cyan glass but stays outside these bays.
       float sideFacade = step(0.25, abs(vOfficePosition.x))
         * (1.0 - step(0.43, abs(vOfficePosition.z)));
       float horizontal = mix(vOfficePosition.x, vOfficePosition.z, sideFacade);
       float pitch = mix(0.192, 0.200, sideFacade);
       float column = floor((horizontal + mix(0.3493, 0.400, sideFacade)) / pitch);
       float centre = mix(-0.2533, -0.300, sideFacade) + column * pitch;
       float paneWidth = mix(0.1194, 0.1233, sideFacade);
       int floorIndex = int(clamp(storey, 0.0, 3.0));
       float floorLow = apartmentFloorLow[floorIndex];
       float floorHigh = apartmentFloorHigh[floorIndex];
       vec2 pane = vec2((horizontal - centre) / paneWidth + 0.5,
         1.0 - (vOfficePosition.y - floorLow) / max(0.01, floorHigh - floorLow));
       // The broad ground-floor door is glass, rather than a domestic room.
       glazing *= 1.0 - (1.0 - step(1.0, storey)) * sideFacade
         * (1.0 - step(0.22, abs(horizontal)));
       ` +
      shader.fragmentShader.slice(paneEnd);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'float occupied = step(0.22, seed);',
        'float occupied = occupiedFloor * step(0.22, seed);'
      )
      .replace('* villageNight;', '* villageNight * occupiedFloor;')
      .replace('* villageNight * glazing;', '* villageNight * occupiedFloor * glazing;');
  };
  material.customProgramCacheKey = () => 'millos-generated-apartment-window-v3';
}

type OfficeAsset = 'smallOffice' | 'officeApartment' | 'officeApartmentThree';
export function GeneratedOfficeModel({ asset = 'smallOffice' }: { asset?: OfficeAsset }) {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS[asset]);
  const night = EXTERIOR_LAMP_LEVEL;
  const { model, materials } = useMemo(() => {
    const model = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!(object.material instanceof THREE.MeshStandardMaterial))
        throw new Error('Office lighting requires a standard material');
      const material = object.material.clone();
      if (asset === 'smallOffice') applyOfficeWindows(material, night);
      else applyApartmentWindows(material, night, asset === 'officeApartmentThree' ? 3 : 4);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      materials.push(material);
    });
    return { model, materials };
  }, [scene, night, asset]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  return <primitive object={model} />;
}

/** Runtime paired-control strength; changing it does not rebuild a material. */
export const VILLAGE_INTERIOR_STRENGTH = { value: 1 };

/** The authored village atlas reserves column 2, row 2 for glazing only.
 * Blender exports flipped V, so its delivered glTF interval is [0.25, 0.5).
 * UV selection keeps slate roofs and blue paint dark, regardless of texture grain.
 * The inset's padded UV square supplies a shallow virtual room, with curtains
 * nearer the glass than its back wall. Derivatives recover each pane's centre
 * and view basis even on rotated facades. All geometry, maps and lights remain
 * unchanged. Working if close oblique views reveal depth and fabric, with dark
 * rooms among the warm windows and no treatment outside the glass atlas tile.
 */
export function applyVillageWindows(
  material: THREE.MeshStandardMaterial,
  night = EXTERIOR_LAMP_LEVEL,
  curtains = true,
  glazing: 'glass' | 'amber' | 'pane' | 'stained' | 'castle' = 'glass'
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.villageNight = night;
    shader.uniforms.villageGlow = { value: new THREE.Color('#ffc875').multiplyScalar(0.65) };
    shader.uniforms.villageInteriorStrength = VILLAGE_INTERIOR_STRENGTH;
    shader.uniforms.villageCurtains = { value: curtains ? 1 : 0 };
    shader.uniforms.villageRooms = { value: glazing === 'stained' ? 0 : 1 };
    shader.uniforms.villageLinen = { value: new THREE.Color('#e6d6b9') };
    shader.uniforms.villageRoomLight = { value: new THREE.Color('#ffe0b5').multiplyScalar(0.62) };
    shader.uniforms.villageAtlas = { value: glazing === 'pane' ? 0 : 1 };
    shader.uniforms.villageTileOrigin = {
      value: new THREE.Vector2(
        glazing === 'amber' || glazing === 'castle' ? 0.75 : 0.5,
        glazing === 'castle' ? 0.75 : 0.25
      ),
    };
    // Castle atlas slot 3 uses .015 padding; village slot 10 uses .03.
    // Working if only the delivered glass UVs receive rooms, with no roof glow.
    shader.uniforms.villagePaneUV = {
      value: new THREE.Vector2(
        glazing === 'castle' ? 0.00375 : 0.0075,
        glazing === 'castle' ? 0.2425 : 0.235
      ),
    };
    shader.vertexShader =
      `varying vec2 vVillageUV;\nvarying vec3 vVillageWorld;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvVillageUV = uv;\nvVillageWorld = (modelMatrix * vec4(position, 1.0)).xyz;'
      );
    shader.fragmentShader = `varying vec2 vVillageUV;
       varying vec3 vVillageWorld;
       uniform float villageNight;
       uniform vec3 villageGlow;
       uniform vec3 villageLinen;
       uniform vec3 villageRoomLight;
       uniform float villageInteriorStrength;
       uniform float villageCurtains;
       uniform float villageRooms;
       uniform float villageAtlas;
       uniform vec2 villageTileOrigin;
       uniform vec2 villagePaneUV;
       ${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float atlasGlazing = step(villageTileOrigin.x, vVillageUV.x)
         * (1.0 - step(villageTileOrigin.x + 0.25, vVillageUV.x))
         * step(villageTileOrigin.y, vVillageUV.y)
         * (1.0 - step(villageTileOrigin.y + 0.25, vVillageUV.y));
       float glazing = mix(1.0, atlasGlazing, villageAtlas);
       if (villageRooms < 0.5) {
         // Only the church uses stained mode. Its rose petals occupy the
         // green/glass/amber swatches in row 2 and rose in row 3.
         // Working if those colours glow through glass without lighting stone.
         float stainedRow = step(0.25, vVillageUV.x) * (1.0 - step(1.0, vVillageUV.x))
           * step(0.25, vVillageUV.y) * (1.0 - step(0.5, vVillageUV.y));
         float roseTile = step(0.75, vVillageUV.x) * (1.0 - step(1.0, vVillageUV.x))
           * step(0.0, vVillageUV.y) * (1.0 - step(0.25, vVillageUV.y));
         glazing = max(stainedRow, roseTile);
       }
       // Derivatives must run outside the non-uniform glass branch. Delivered
       // atlas padding and span differ between village and castle panes.
       vec2 pane = mix(vec2(vVillageUV.x, 1.0 - vVillageUV.y),
         (vVillageUV - villageTileOrigin - vec2(villagePaneUV.x)) / villagePaneUV.y, villageAtlas);
       vec2 du = dFdx(pane), dv = dFdy(pane);
       vec3 wx = dFdx(vVillageWorld), wy = dFdy(vVillageWorld);
       vec3 px = dFdx(-vViewPosition), py = dFdy(-vViewPosition);
       float determinant = du.x * dv.y - du.y * dv.x;
       float inverseDet = sign(determinant) / max(abs(determinant), 0.00000001);
       if (glazing > 0.5 && abs(determinant) > 0.00000001 && villageRooms > 0.5) {
         vec3 worldU = (wx * dv.y - wy * du.y) * inverseDet;
         vec3 worldV = (wy * du.x - wx * dv.x) * inverseDet;
         vec3 centre = vVillageWorld + worldU * (0.5 - pane.x) + worldV * (0.5 - pane.y);
         vec3 roomId = floor(centre * 2.0 + 0.173);
         float seed = fract(sin(dot(roomId, vec3(12.9898, 37.719, 78.233))) * 43758.5453);
         float occupied = step(0.22, seed);
         vec3 tangent = (px * dv.y - py * du.y) * inverseDet;
         vec3 bitangent = (py * du.x - px * dv.x) * inverseDet;
         tangent /= max(length(tangent), 0.0001);
         bitangent /= max(length(bitangent), 0.0001);
         vec3 paneNormal = normalize(cross(tangent, bitangent));
         vec3 eye = normalize(vViewPosition);
         float facing = abs(dot(eye, paneNormal));
         vec2 viewSlope = clamp(vec2(dot(eye, tangent), dot(eye, bitangent))
           / max(facing, 0.25), vec2(-1.5), vec2(1.5));
         // Depths are fractions of one window, never world-metre bump strengths.
         vec2 room = pane - viewSlope * 0.22;
         vec2 cloth = pane - viewSlope * 0.035;
         float edge = min(min(room.x, 1.0 - room.x), min(room.y, 1.0 - room.y));
         float reveal = 0.30 + 0.70 * smoothstep(-0.02, 0.07, edge);
         float ceiling = 1.0 - smoothstep(0.10, 0.20, room.y);
         float floorBand = smoothstep(0.76, 0.90, room.y);
         float wall = (0.68 + 0.22 * room.y) * (1.0 - ceiling * 0.42 - floorBand * 0.28);
         vec3 roomColour = vec3(0.86, 0.72, 0.53) * wall * reveal;
         float width = 0.16 + 0.10 * seed - 0.06 * sin(clamp(cloth.y, 0.0, 1.0) * 3.14159);
         float curtain = (1.0 - smoothstep(width, width + 0.014, cloth.x))
           + smoothstep(1.0 - width - 0.014, 1.0 - width, cloth.x);
         // Small lantern glass shares the pub's amber tile, but is not a room.
         float roomScale = step(0.5, min(length(worldU), length(worldV)));
         curtain = max(curtain, 1.0 - smoothstep(0.06, 0.095, cloth.y)) * villageCurtains * roomScale;
         float foldDetail = 1.0 - smoothstep(0.015, 0.055, max(abs(du.x), abs(dv.x)));
         float folds = 0.78 + foldDetail * (0.16 * cos(cloth.x * 145.0) + 0.06 * cos(cloth.x * 71.0));
         vec3 interior = mix(roomColour, villageLinen * folds, clamp(curtain, 0.0, 1.0));
         float brightness = (0.58 + seed * 0.42) * mix(0.09, 1.0, occupied);
         // Linen receives room light, with a softer contribution than the opening.
         vec3 roomEmission = villageRoomLight * interior * brightness
           * mix(1.0, 0.58, clamp(curtain, 0.0, 1.0));
         float reflection = pow(1.0 - clamp(facing, 0.0, 1.0), 4.0);
         vec3 daylightRoom = interior * (0.28 + occupied * villageNight * 0.18);
         diffuseColor.rgb = mix(diffuseColor.rgb, daylightRoom,
           villageInteriorStrength * roomScale * (1.0 - reflection * 0.85));
         totalEmissiveRadiance += mix(villageGlow, roomEmission, villageInteriorStrength * roomScale)
           * villageNight;
       } else {
         totalEmissiveRadiance += mix(diffuseColor.rgb * 0.85, villageGlow, villageRooms)
           * villageNight * glazing;
       }`
    );
  };
  material.customProgramCacheKey = () => 'millos-authored-village-windows-v4';
}
