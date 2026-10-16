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
  material.customProgramCacheKey = () => 'millos-generated-apartment-window-v5';
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

/** Shared with the existing chimney schedule, no additional frame subscription.
 * Working if the hearth warms only during forge hours and the rest of the atlas stays unchanged.
 */
export const FORGE_HEAT_LEVEL = { value: 0 };
export const FORGE_HEAT_STRENGTH = { value: 1 };

export function applyForgeWindows(material: THREE.MeshStandardMaterial) {
  applyVillageWindows(material, undefined, false, 'glass');
  const windows = material.onBeforeCompile;
  const windowKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    windows.call(material, shader, renderer);
    shader.uniforms.forgeHeat = FORGE_HEAT_LEVEL;
    shader.uniforms.forgeHeatStrength = FORGE_HEAT_STRENGTH;
    shader.vertexShader = `varying vec3 vForgePosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvForgePosition = position;'
    );
    shader.fragmentShader = `varying vec3 vForgePosition;
      uniform float forgeHeat;
      uniform float forgeHeatStrength;
      ${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      // Measured delivered firebox face, in object-rest metres. Ink atlas only.
      float hearth = step(-0.89, vForgePosition.x) * (1.0 - step(0.09, vForgePosition.x))
        * step(0.817, vForgePosition.y) * (1.0 - step(1.376, vForgePosition.y))
        * step(2.425, vForgePosition.z) * (1.0 - step(2.435, vForgePosition.z))
        * step(0.5, vVillageUV.x) * (1.0 - step(0.75, vVillageUV.x))
        * (1.0 - step(0.25, vVillageUV.y));
      if (hearth > 0.5) {
        // Irregular packed coal, rather than a repeated grate or rows of dots.
        vec2 coal = (vForgePosition.xy - vec2(-0.89, 0.817)) * vec2(9.0, 14.0);
        vec2 cell = floor(coal), local = fract(coal);
        float nearest = 8.0, second = 8.0, seed = 0.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbour = vec2(float(x), float(y));
            vec2 id = cell + neighbour;
            vec2 hash = fract(sin(vec2(dot(id, vec2(127.1, 311.7)),
              dot(id, vec2(269.5, 183.3)))) * 43758.5453);
            vec2 delta = neighbour + 0.08 + hash * 0.84 - local;
            float distanceSq = dot(delta, delta);
            if (distanceSq < nearest) {
              second = nearest;
              nearest = distanceSq;
              seed = hash.x;
            } else second = min(second, distanceSq);
          }
        }
        float seam = smoothstep(0.018, 0.13, second - nearest);
        float bed = smoothstep(0.0, 0.035, vForgePosition.y - 0.817)
          * (1.0 - smoothstep(0.12, 0.29, vForgePosition.y - 0.817));
        vec3 ember = mix(vec3(0.18, 0.009, 0.001), vec3(0.78, 0.14, 0.012),
          seed * (0.45 + seam * 0.55));
        totalEmissiveRadiance += ember * seam * bed * forgeHeat * forgeHeatStrength;
      }`
    );
  };
  material.customProgramCacheKey = () => `millos-forge-hearth-v3:${windowKey()}`;
}

/** Runtime paired-control strength; changing it does not rebuild a material. */
export const VILLAGE_INTERIOR_STRENGTH = { value: 1 };
/** Fabric-only paired control; no geometry, occupancy or lamp changes. */
export const VILLAGE_FABRIC_STRENGTH = { value: 1 };

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
  glazing: 'glass' | 'amber' | 'pane' | 'stained' | 'castle' | 'civic' = 'glass'
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.villageNight = night;
    shader.uniforms.villageGlow = { value: new THREE.Color('#ffc875').multiplyScalar(0.65) };
    shader.uniforms.villageInteriorStrength = VILLAGE_INTERIOR_STRENGTH;
    shader.uniforms.villageFabricStrength = VILLAGE_FABRIC_STRENGTH;
    shader.uniforms.villageCurtains = { value: curtains ? 1 : 0 };
    shader.uniforms.villageRooms = { value: glazing === 'stained' ? 0 : 1 };
    shader.uniforms.villageCivic = { value: glazing === 'civic' ? 1 : 0 };
    shader.uniforms.villagePalace = { value: glazing === 'castle' ? 1 : 0 };
    shader.uniforms.villageLinen = {
      value: new THREE.Color(glazing === 'castle' ? '#e7dcc3' : '#e6d6b9'),
    };
    shader.uniforms.villageRoomLight = {
      value: new THREE.Color(glazing === 'castle' ? '#ffe2ac' : '#ffe0b5').multiplyScalar(
        glazing === 'castle' ? 0.7 : 0.62
      ),
    };
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
       uniform float villageFabricStrength;
       uniform float villageCurtains;
       uniform float villageRooms;
       uniform float villageCivic;
       uniform float villagePalace;
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
       float weaveDetail = 1.0 - smoothstep(0.006, 0.010, max(abs(du.y), abs(dv.y)));
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
         occupied = mix(occupied, 1.0, villageCivic);
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
         if (villagePalace > 0.5) {
           // Recessed timber dado and cornice belong to the back-wall depth,
           // behind the retained near-glass linen. No room mesh/light added.
           float dado = smoothstep(0.69, 0.73, room.y);
           float panel = 0.82 + 0.18 * smoothstep(0.025, 0.065, abs(fract(room.x * 4.0) - 0.5));
           roomColour = mix(roomColour, vec3(0.26, 0.18, 0.11) * panel * reveal, dado);
           float cornice = 1.0 - smoothstep(0.012, 0.027, abs(room.y - 0.20));
           roomColour *= 1.0 - cornice * 0.22;
         }
         float width = mix(0.16, 0.10, villageCivic) + 0.10 * seed - 0.06 * sin(clamp(cloth.y, 0.0, 1.0) * 3.14159);
         float curtain = (1.0 - smoothstep(width, width + 0.014, cloth.x))
           + smoothstep(1.0 - width - 0.014, 1.0 - width, cloth.x);
         // Small lantern glass shares the pub's amber tile, but is not a room.
         float roomScale = step(0.5, min(length(worldU), length(worldV)));
         curtain = max(curtain, 1.0 - smoothstep(0.06, 0.095, cloth.y)) * villageCurtains * roomScale;
         float foldDetail = 1.0 - smoothstep(0.015, 0.055, max(abs(du.x), abs(dv.x)));
         // Restrained woven linen and a stitched hem, filtered before four pixels
         // per thread. Working if distant panes stay calm and strength zero
         // restores the previous folds without changing rooms or occupancy.
         float fabric = clamp(villageFabricStrength, 0.0, 1.0);
         float folds = 0.78 + foldDetail * (mix(0.16, 0.12, fabric) * cos(cloth.x * 145.0)
           + mix(0.06, 0.04, fabric) * cos(cloth.x * 71.0));
         float weave = weaveDetail * 0.012 * cos(cloth.y * 157.0796 + seed * 6.28318);
         float hem = smoothstep(0.82, 0.85, cloth.y) * (1.0 - smoothstep(0.89, 0.92, cloth.y));
         vec3 linen = villageLinen * folds * (1.0 + fabric * (weave - 0.13 * hem));
         vec3 interior = mix(roomColour, linen, clamp(curtain, 0.0, 1.0));
         // Civic rooms remain visibly open at dusk. A recessed desk silhouettes
         // against the warm rear wall; only actual atlas glazing is affected.
         // Working if masonry stays unlit by this term and window depth moves with view.
         float desk = smoothstep(0.18, 0.21, room.x) * (1.0 - smoothstep(0.78, 0.81, room.x))
           * smoothstep(0.63, 0.65, room.y) * (1.0 - smoothstep(0.69, 0.71, room.y));
         interior *= 1.0 - desk * villageCivic * 0.65;
         // Furniture shares the back-wall parallax, while linen remains near
         // the glass. A bookcase and small shaded pendant give the civic rooms
         // scale with arithmetic only, no interior meshes or extra lights.
         // Working if oblique views separate the furnishing from the curtains.
         float shelfSide = smoothstep(0.68, 0.71, room.x) * (1.0 - smoothstep(0.93, 0.96, room.x));
         float shelves = (1.0 - smoothstep(0.012, 0.022, abs(room.y - 0.38)))
           + (1.0 - smoothstep(0.012, 0.022, abs(room.y - 0.55)));
         float bookRows = smoothstep(0.22, 0.25, room.y) * (1.0 - smoothstep(0.53, 0.55, room.y));
         float books = smoothstep(0.16, 0.25, fract(room.x * 43.0)) * bookRows;
         float furnishing = shelfSide * max(clamp(shelves, 0.0, 1.0), books * 0.6)
           * max(villageCivic, step(0.58, seed)) * roomScale;
         interior = mix(interior, vec3(0.19, 0.14, 0.10), furnishing * (1.0 - curtain));
         float pendantX = mix(0.35, 0.58, seed);
         float pendant = (1.0 - smoothstep(0.055, 0.075, abs(room.x - pendantX)))
           * (1.0 - smoothstep(0.03, 0.05, abs(room.y - 0.23))) * villageCivic;
         interior = mix(interior, vec3(1.0, 0.79, 0.43), pendant * (1.0 - curtain));
         float brightness = (0.58 + seed * 0.42) * mix(0.09, 1.0, occupied);
         // Linen receives room light, with a softer contribution than the opening.
         vec3 roomEmission = villageRoomLight * interior * brightness
           * mix(1.0, 0.58, clamp(curtain, 0.0, 1.0));
         roomEmission *= mix(1.0, 2.5, villageCivic);
         roomEmission *= mix(vec3(1.0), vec3(1.0, 0.82, 0.50), villageCivic);
         float reflection = pow(1.0 - clamp(facing, 0.0, 1.0), 4.0);
         vec3 daylightRoom = interior * (mix(0.28, 0.10, villageCivic) + occupied * villageNight * 0.18);
         diffuseColor.rgb = mix(diffuseColor.rgb, daylightRoom,
           villageInteriorStrength * roomScale * (1.0 - reflection * 0.85));
         totalEmissiveRadiance += mix(villageGlow, roomEmission, villageInteriorStrength * roomScale)
           * villageNight;
         if (villagePalace > 0.5) {
           // Castle glazing has slender lead divisions. Derivative filtering
           // removes them below useful resolution instead of distant moire.
           // Working if only delivered glass gains divisions, roofs stay dark,
           // and strength zero restores the pre-finish glazing response.
           float palacePixel = max(max(abs(du.x), abs(dv.x)), max(abs(du.y), abs(dv.y)));
           float palaceAA = max(0.001, palacePixel * 0.8);
           float mullion = 1.0 - smoothstep(0.011, 0.011 + palaceAA, abs(pane.x - 0.5));
           float transom = 1.0 - smoothstep(0.009, 0.009 + palaceAA, abs(pane.y - 0.62));
           float lead = max(mullion, transom) * (1.0 - smoothstep(0.025, 0.065, palacePixel))
             * villageInteriorStrength * roomScale;
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.065, 0.085, 0.088), lead);
           totalEmissiveRadiance *= 1.0 - lead;
         }
       } else {
         totalEmissiveRadiance += mix(diffuseColor.rgb * 0.85, villageGlow, villageRooms)
           * villageNight * glazing;
       }`
    );
  };
  material.customProgramCacheKey = () => 'millos-authored-village-windows-v8';
}

/** Farm walls retain irregular baked UVs, so only measured recessed apertures
 * receive rooms. The barn loft has a recessed source backing behind its X
 * brace; it receives a simpler working room without curtains. No roof/vent glows.
 * Working if the three house windows gain linen and depth, opaque joinery stays
 * intact, and strength zero restores the original host material response.
 */
export const FARM_INTERIOR_STRENGTH = { value: 1 };
export function applyFarmWindows(
  material: THREE.MeshStandardMaterial,
  kind: 'farmhouse' | 'barn',
  night = EXTERIOR_LAMP_LEVEL
) {
  applyVillageWindows(material, night, kind === 'farmhouse', 'pane');
  material.userData.farmInteriorStrength = FARM_INTERIOR_STRENGTH;
  const compileRoom = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    compileRoom.call(material, shader, renderer);
    shader.uniforms.farmInteriorStrength = FARM_INTERIOR_STRENGTH;
    shader.uniforms.villageRoomLight = {
      value: new THREE.Color(kind === 'farmhouse' ? '#ffd79e' : '#ffc885').multiplyScalar(
        kind === 'farmhouse' ? 1.05 : 0.6
      ),
    };
    shader.uniforms.villageLinen = { value: new THREE.Color('#ece0c9') };
    shader.vertexShader = `varying vec3 vFarmPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvFarmPosition = position;'
    );
    shader.fragmentShader = `varying vec3 vFarmPosition;
      uniform float farmInteriorStrength;
      ${shader.fragmentShader}`.replace(
      'float glazing = mix(1.0, atlasGlazing, villageAtlas);',
      kind === 'farmhouse'
        ? `// Delivered local coordinates, before the retained 6.001m node scale.
       float endFacade = step(0.37, abs(vFarmPosition.z));
       float sideFacade = step(0.38, vFarmPosition.x);
       float horizontal = mix(vFarmPosition.x, vFarmPosition.z, sideFacade);
       float low = mix(-0.335, 0.130, sideFacade);
       float high = mix(-0.235, 0.252, sideFacade);
       float aperture = step(low, horizontal) * (1.0 - step(high, horizontal))
         * step(-0.247, vFarmPosition.y) * (1.0 - step(-0.139, vFarmPosition.y))
         * max(endFacade, sideFacade);
       // Within those apertures, retain the baked green mullions and frames.
       // Albedo has already been decoded to linear by the ordinary map chunk.
       float darkGlass = (1.0 - smoothstep(0.070, 0.120,
         max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))))
         * (1.0 - smoothstep(0.018, 0.045, diffuseColor.g - diffuseColor.r));
       float recess = mix(mix(step(-0.390, vFarmPosition.z),
         1.0 - step(0.439, vFarmPosition.z), step(0.0, vFarmPosition.z)),
         1.0 - step(0.405, vFarmPosition.x), sideFacade);
       float glazing = aperture * recess * darkGlass * farmInteriorStrength;`
        : `// Existing dark loft backing is at z=.369; the retained X is z=.378.
       float aperture = step(-0.105, vFarmPosition.x) * (1.0 - step(0.105, vFarmPosition.x))
         * step(-0.061, vFarmPosition.y) * (1.0 - step(0.071, vFarmPosition.y))
         * step(0.360, vFarmPosition.z) * (1.0 - step(0.375, vFarmPosition.z));
       float darkGlass = 1.0 - smoothstep(0.025, 0.060,
         max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
       float glazing = aperture * darkGlass * farmInteriorStrength;`
    );
    const start = shader.fragmentShader.indexOf('vec2 pane = mix(');
    const end = shader.fragmentShader.indexOf('vec2 du = dFdx(pane)', start);
    shader.fragmentShader =
      shader.fragmentShader.slice(0, start) +
      (kind === 'farmhouse'
        ? `vec2 pane = vec2((horizontal - low) / (high - low),
          1.0 - (vFarmPosition.y + 0.247) / 0.108);
       `
        : `vec2 pane = vec2((vFarmPosition.x + 0.105) / 0.210,
          1.0 - (vFarmPosition.y + 0.061) / 0.132);
       `) +
      shader.fragmentShader.slice(end);
    // These are authored lit interiors, not claims about resident schedules.
    shader.fragmentShader = shader.fragmentShader.replace(
      'float occupied = step(0.22, seed);',
      'float occupied = 1.0;'
    );
    // The isolation control also restores the original daytime host albedo.
    shader.fragmentShader = shader.fragmentShader.replace(
      'villageInteriorStrength * roomScale * (1.0 - reflection * 0.85)',
      'villageInteriorStrength * roomScale * farmInteriorStrength * (1.0 - reflection * 0.85)'
    );
  };
  material.customProgramCacheKey = () => `millos-farm-window-${kind}-v1`;
}

/** The delivered castle paving is one 31.85m slab, atlas slot 6.
 * Keep its real height/mesh and add metre-scaled joints only to its upper face.
 * Working if first-person stone joints remain fine, walls/glass stay unchanged,
 * and the shared strength control restores the original surface exactly.
 */
export const CASTLE_PAVING_STRENGTH = { value: 1 };
export const CASTLE_PAVING_TILE = [0.5, 0.5, 0.75, 0.75] as const;
export function applyCastlePaving(material: THREE.MeshStandardMaterial) {
  const windows = material.onBeforeCompile;
  const windowKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    windows(shader, renderer);
    shader.uniforms.castlePavingStrength = CASTLE_PAVING_STRENGTH;
    shader.uniforms.castlePavingTile = { value: new THREE.Vector4(...CASTLE_PAVING_TILE) };
    shader.vertexShader = `varying vec2 vCastlePavingLocal;
      varying float vCastlePavingTop;
      ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vCastlePavingLocal = position.xz;
       vCastlePavingTop = step(0.99, normal.y) * step(3.18, position.y);`
    );
    shader.fragmentShader = `varying vec2 vCastlePavingLocal;
      varying float vCastlePavingTop;
      uniform float castlePavingStrength;
      uniform vec4 castlePavingTile;
      ${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float castlePaving = step(castlePavingTile.x, vVillageUV.x) * (1.0 - step(castlePavingTile.z, vVillageUV.x))
         * step(castlePavingTile.y, vVillageUV.y) * (1.0 - step(castlePavingTile.w, vVillageUV.y)) * vCastlePavingTop;
       // Rest metres align the running bond with the castle, including its yaw.
       // At the shipping 1.5 scale these flags measure 1.17 x 0.78 world metres.
       vec2 flag = vCastlePavingLocal / vec2(0.78, 0.52);
       flag.x += mod(floor(flag.y), 2.0) * 0.5;
       vec2 seamDistance = min(fract(flag), 1.0 - fract(flag)) * vec2(0.78, 0.52);
       vec2 seamAA = max(fwidth(vCastlePavingLocal), vec2(0.001));
       vec2 stoneEdge = smoothstep(vec2(0.003), vec2(0.006) + seamAA, seamDistance);
       float joint = 1.0 - stoneEdge.x * stoneEdge.y;
       float stone = fract(sin(dot(floor(flag), vec2(127.1, 311.7))) * 43758.5453);
       // Derivatives run outside the non-uniform atlas branch. Relief is 0.45mm
       // in view metres, a shallow bevel rather than a displaced walking floor.
       float flagHeight = (1.0 - joint) * 0.00045 * castlePavingStrength;
       vec2 heightGradient = vec2(dFdx(flagHeight), dFdy(flagHeight));
       vec3 flagSigmaX = dFdx(-vViewPosition), flagSigmaY = dFdy(-vViewPosition);
       vec3 flagR1 = cross(flagSigmaY, normal), flagR2 = cross(normal, flagSigmaX);
       float flagDet = dot(flagSigmaX, flagR1) * (gl_FrontFacing ? 1.0 : -1.0);
       if (castlePaving > 0.5 && castlePavingStrength > 0.0) {
         diffuseColor.rgb *= mix(1.0, (0.976 + 0.048 * stone) * (1.0 - joint * 0.20), castlePavingStrength);
         roughnessFactor = mix(roughnessFactor, 0.90 + 0.06 * stone, castlePavingStrength);
         if (abs(flagDet) > 0.00000001) {
           vec3 flagGradient = sign(flagDet) * (heightGradient.x * flagR1 + heightGradient.y * flagR2);
           normal = normalize(abs(flagDet) * normal - flagGradient);
         }
       }`
    );
  };
  material.customProgramCacheKey = () => `millos-castle-paving-v1:${windowKey()}`;
}

export type VillageShopTrade = 'bakery' | 'butcher' | 'general';

// Match the installed nameboards and each trade's goods. The green joinery,
// canvas stripe and dedicated display slot are treated; cream linen, masonry, roof and glass keep
// their authored albedo. This is an intentional paint palette, not a global
// colour-space compensator. Working if three real fronts have distinct paint
// while their cream stripes and warm rooms remain unchanged.
export const SHOP_JOINERY_COLOURS = {
  bakery: '#75454a',
  butcher: '#365043',
  general: '#263f55',
} as const;
// Shared by display geometry and pigment classification, in object-rest metres.
export const SHOP_DISPLAY_ITEM_GRID = [0.35, 2.25] as const;

/** Give only the authored display goods physical volume; the cached GLB stays immutable.
 * Private attributes and indices are intentional: Three disposes GPU buffers without
 * reference counting. Working if body vertices are unchanged, shelf/rear contact stays
 * fixed, and each owned variant is released without disposing the cached source.
 */
export function createShopDisplayGeometry(
  source: THREE.BufferGeometry,
  trade: VillageShopTrade
): THREE.BufferGeometry {
  const positions = source.getAttribute('position');
  const normals = source.getAttribute('normal');
  const uv = source.getAttribute('uv');
  if (!positions || !normals || !uv) return source;
  const items = new Map<number, { vertices: number[]; min: THREE.Vector3; max: THREE.Vector3 }>();
  const point = new THREE.Vector3();
  for (let i = 0; i < uv.count; i++) {
    if (uv.getX(i) <= 0.75 || uv.getX(i) >= 1 || uv.getY(i) <= 0.25 || uv.getY(i) >= 0.5) continue;
    point.fromBufferAttribute(positions, i);
    const band = Math.floor((point.x + SHOP_DISPLAY_ITEM_GRID[0]) * SHOP_DISPLAY_ITEM_GRID[1]);
    let item = items.get(band);
    if (!item) {
      item = { vertices: [], min: point.clone(), max: point.clone() };
      items.set(band, item);
    }
    item.vertices.push(i);
    item.min.min(point);
    item.max.max(point);
  }
  if (!items.size) return source;
  const geometry = source.clone();
  const outputPositions = geometry.getAttribute('position');
  const outputNormals = geometry.getAttribute('normal');
  for (const [band, { vertices, min, max }] of items) {
    // Five supported loaves, three real silhouettes. Rear/shelf contact and
    // the original indices stay fixed, with no extra geometry or draw.
    // Working if round loaves, batards and baguettes differ inside the window.
    const [sx, sy, sz] =
      trade === 'general'
        ? [0.58, 1.2, 8]
        : trade === 'butcher'
          ? [1, 0.9, 4]
          : band % 3 === 0
            ? [0.76, 1.38, 8]
            : band % 3 === 1
              ? [1, 1.12, 7]
              : [1.4, 0.8, 5];
    const centreX = (min.x + max.x) * 0.5;
    for (const i of vertices) {
      outputPositions.setXYZ(
        i,
        centreX + (positions.getX(i) - centreX) * sx,
        min.y + (positions.getY(i) - min.y) * sy,
        min.z + (positions.getZ(i) - min.z) * sz
      );
      // Inverse transpose of the affine scale, preserving authored smooth normals.
      point.set(normals.getX(i) / sx, normals.getY(i) / sy, normals.getZ(i) / sz).normalize();
      outputNormals.setXYZ(i, point.x, point.y, point.z);
    }
  }
  if (trade === 'general' && geometry.index) {
    // Fifteen pieces in five small supported piles, within the real window.
    // Reuse the same body, atlas and draw; private buffers retain cached GLB custody.
    // Working if the grocer reads as stocked, while other trades and the building stay exact.
    // GLTFLoader may interleave position, normal and UV in one backing array.
    // Read logical components so packed stride never becomes a vertex count.
    const p: number[] = [],
      n: number[] = [],
      u: number[] = [];
    const outputUV = geometry.getAttribute('uv');
    for (let i = 0; i < outputPositions.count; i++) {
      p.push(outputPositions.getX(i), outputPositions.getY(i), outputPositions.getZ(i));
      n.push(outputNormals.getX(i), outputNormals.getY(i), outputNormals.getZ(i));
      u.push(outputUV.getX(i), outputUV.getY(i));
    }
    const indices = Array.from(geometry.index.array);
    const originalIndices = [...indices];
    const stem = new THREE.CylinderGeometry(0.0035, 0.005, 0.027, 4);
    for (const [band, { vertices }] of items) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity);
      const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      for (const i of vertices) {
        point.fromBufferAttribute(outputPositions, i);
        min.min(point);
        max.max(point);
      }
      const cx = (min.x + max.x) * 0.5,
        cz = (min.z + max.z) * 0.5;
      const height = max.y - min.y;
      for (const [copy, dx, dy, scale] of [
        [0, 0, 0, 1],
        [1, 0.145, 0, 1],
        [2, 0.0725, height * 0.88, 0.88],
      ]) {
        const pear = band % 3 === 1 && copy === 1;
        const yScale = pear ? 1.22 : 1;
        if (copy > 0) {
          const remap = new Map<number, number>();
          for (const i of vertices) {
            const x = outputPositions.getX(i) - cx,
              z = outputPositions.getZ(i) - cz;
            const t = (outputPositions.getY(i) - min.y) / height;
            const profile = pear ? 1 - 0.36 * t * t : 1;
            const slope = pear ? (-0.72 * t) / height : 0;
            remap.set(i, p.length / 3);
            p.push(
              cx + dx + x * scale * profile,
              min.y + dy + t * height * scale * yScale,
              cz + z * scale * profile
            );
            const nx = outputNormals.getX(i),
              ny = outputNormals.getY(i),
              nz = outputNormals.getZ(i);
            // Inverse transpose of the tapered pear's Jacobian, not sphere normals.
            point
              .set(
                nx / profile,
                (ny - (slope * (x * nx + z * nz)) / profile) / yScale,
                nz / profile
              )
              .normalize();
            n.push(point.x, point.y, point.z);
            u.push(uv.getX(i), uv.getY(i));
          }
          for (let j = 0; j < originalIndices.length; j += 3) {
            const a = remap.get(originalIndices[j]),
              b = remap.get(originalIndices[j + 1]),
              c = remap.get(originalIndices[j + 2]);
            if (a !== undefined && b !== undefined && c !== undefined) indices.push(a, b, c);
          }
        }
        const offset = p.length / 3;
        const sp = stem.getAttribute('position'),
          sn = stem.getAttribute('normal');
        const top = min.y + dy + height * scale * yScale;
        for (let i = 0; i < sp.count; i++) {
          p.push(cx + dx + sp.getX(i), top + 0.008 + sp.getY(i), cz + sp.getZ(i));
          n.push(sn.getX(i), sn.getY(i), sn.getZ(i));
          u.push(0.625, 0.625); // Existing oak atlas, ordinary lit matter, never fruit/glass.
        }
        for (const index of stem.index!.array) indices.push(offset + index);
      }
    }
    stem.dispose();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    geometry.setIndex(indices);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const AUTHORED_SHOP_GREEN = new THREE.Color('#476454');
const SHOP_DISPLAY_PALETTES = {
  bakery: ['#bc965b', '#96572d', '#e9c99a'],
  butcher: ['#a95e57', '#7b3736', '#e2c4ae'],
  general: ['#be4d3d', '#718547', '#d1a85a'],
} as const;

export function applyShopWindows(material: THREE.MeshStandardMaterial, trade: VillageShopTrade) {
  applyVillageWindows(material);
  const windows = material.onBeforeCompile;
  const windowKey = material.customProgramCacheKey;
  const paint = new THREE.Color(SHOP_JOINERY_COLOURS[trade]);
  const ratio = new THREE.Color().setRGB(
    paint.r / AUTHORED_SHOP_GREEN.r,
    paint.g / AUTHORED_SHOP_GREEN.g,
    paint.b / AUTHORED_SHOP_GREEN.b
  );
  material.onBeforeCompile = (shader, renderer) => {
    windows.call(material, shader, renderer);
    shader.uniforms.shopJoineryTint = { value: ratio };
    shader.uniforms.shopDisplayTrade = { value: { bakery: 0, butcher: 1, general: 2 }[trade] };
    shader.uniforms.shopDisplayWarm = { value: new THREE.Color(SHOP_DISPLAY_PALETTES[trade][0]) };
    shader.uniforms.shopDisplayCool = { value: new THREE.Color(SHOP_DISPLAY_PALETTES[trade][1]) };
    shader.uniforms.shopDisplayPale = { value: new THREE.Color(SHOP_DISPLAY_PALETTES[trade][2]) };
    // Five delivered goods span separate 0.447m centres in object-rest space.
    // This grid assigns each whole oval one stable variety, never a world-space swim.
    shader.uniforms.shopDisplayItemGrid = { value: new THREE.Vector2(...SHOP_DISPLAY_ITEM_GRID) };
    shader.vertexShader = `varying float vShopDisplayItem;
uniform vec2 shopDisplayItemGrid;
${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vShopDisplayItem = floor((position.x + shopDisplayItemGrid.x) * shopDisplayItemGrid.y);`
    );
    shader.fragmentShader = `uniform vec3 shopJoineryTint;
      uniform float shopDisplayTrade;
      uniform vec3 shopDisplayWarm;
      uniform vec3 shopDisplayCool;
      uniform vec3 shopDisplayPale;
      varying float vShopDisplayItem;
      ${shader.fragmentShader}`
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
       // Green is slot 9: column 1, flipped glTF row 1. The padded
       // swatch never touches glass in column 2 or linen in column 0.
       float shopJoinery = step(0.25, vVillageUV.x) * (1.0 - step(0.5, vVillageUV.x))
         * step(0.25, vVillageUV.y) * (1.0 - step(0.5, vVillageUV.y));
       diffuseColor.rgb *= mix(vec3(1.0), shopJoineryTint, shopJoinery);
       // Slot 11 is only the five actual display goods. Bakery retains the baked
       // crust atlas under its finish; trades remain PBR matter, never emission.
       // Working if meat and produce differ while linen, paint, shadows and
       // room brightness are unchanged and the same program is shared.
       float shopDisplay = step(0.75, vVillageUV.x) * (1.0 - step(1.0, vVillageUV.x))
         * step(0.25, vVillageUV.y) * (1.0 - step(0.5, vVillageUV.y));
       if (shopDisplay > 0.5) {
         vec2 goodsUV = (vVillageUV - vec2(0.75, 0.25)) * 4.0;
         float variety = mod(vShopDisplayItem, 3.0);
         if (shopDisplayTrade < 0.5) {
           // Bread's own padded UVs keep crust and shallow scoring on the loaf.
           // Derivative-filtered cuts cannot shimmer into stripes at distance.
           vec3 crust = variety < 0.5 ? shopDisplayWarm : shopDisplayCool;
           float scoreField = sin(goodsUV.x * 18.0 + goodsUV.y * 5.0);
           float scoreWidth = max(fwidth(scoreField), 0.10);
           float score = 1.0 - smoothstep(0.0, scoreWidth, abs(scoreField));
           score *= smoothstep(0.42, 0.62, goodsUV.y);
           diffuseColor.rgb *= mix(vec3(1.0), crust / shopDisplayWarm, 0.5);
           diffuseColor.rgb = mix(diffuseColor.rgb, shopDisplayPale, score * 0.58);
         } else if (shopDisplayTrade < 1.5) {
           float veinField = sin(goodsUV.x * 22.0 + sin(goodsUV.y * 9.0) * 1.6);
           float veinWidth = max(fwidth(veinField), 0.09);
           float marbling = 1.0 - smoothstep(0.0, veinWidth, abs(veinField));
           vec3 meat = mix(shopDisplayWarm, shopDisplayCool, variety * 0.18);
           diffuseColor.rgb = mix(meat, shopDisplayPale, marbling * 0.38);
         } else {
           vec3 peel = variety < 0.5 ? shopDisplayWarm
             : variety < 1.5 ? shopDisplayCool : shopDisplayPale;
           float mottling = sin(goodsUV.x * 36.0) * sin(goodsUV.y * 31.0);
           float blush = sin(goodsUV.x * 7.0 + goodsUV.y * 5.0);
           diffuseColor.rgb = peel * (0.96 + mottling * 0.035 + blush * 0.045);
         }
       }`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
       // The five opaque display goods sit in front of the virtual glass.
       // Give them that room's diffuse light, using its existing live dimmer.
       // Slot 11 belongs only to these goods in the authored shop. Paint,
       // masonry, glazing and street-facing furnishings keep ordinary lighting.
       // Working if goods stay readable with the room at night, darken when
       // its strength is zero, and retain normal-based shaping without lamps.
       if (shopDisplay > 0.5) {
         vec3 roomUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
         float roomDiffuse = 0.55 + 0.45 * max(dot(normal, roomUp), 0.0);
         reflectedLight.indirectDiffuse += villageRoomLight * 3.0
           * BRDF_Lambert(diffuseColor.rgb) * roomDiffuse
           * villageNight * villageInteriorStrength;
       }`
      );
  };
  // All three paints share one compiled variant; only linear uniform values
  // differ. Installing again resets the window hook before wrapping it.
  material.customProgramCacheKey = () =>
    `millos-authored-shop-joinery-v4|${windowKey.call(material)}`;
}
