/**
 * Start every startup-world download at App load, in parallel.
 *
 * WHY: the complete world sits under ONE Suspense boundary (App.tsx, the
 * `<Suspense fallback={<CoreScenePreview />}>` around the authored scene), and
 * that is deliberate: world-ready means the whole site has resolved, so nothing
 * pops in behind the cover. But each loader hook that suspends throws away the
 * whole uncommitted render, React retries from the boundary when that one
 * promise resolves, and the retry reaches exactly one more uncached hook before
 * it suspends again. React's sibling prerender never finishes, because the
 * previous asset's ping (5-180 ms) arrives long before a 1-2.5 s world render
 * does. A 2026-10-19 cold-load trace measured 25 such waves, 37 s of React
 * render work and world-ready at 46.4 s, with every asset itself fetching in
 * under 0.2 s.
 *
 * Preloading through the hooks' OWN caches removes the serial discovery: when
 * the render reaches a hook, its entry is already in flight or resolved.
 * suspend-react keys every entry on [LoaderClass, url] (fiber's useLoader), so:
 *   useDracoGLTF(path)               <- preloadDracoModel(path)
 *   useTexture(url), useLoader(TextureLoader, url) <- useLoader.preload(TextureLoader, url)
 *   useLoader(FileLoader, url)       <- useLoader.preload(FileLoader, url)
 * Every request still passes through THREE.DefaultLoadingManager, so the
 * readiness counts (startupReadiness.ts) see each one; readiness is unchanged.
 *
 * WHAT IS LISTED: the assets a cold load at Medium requested before
 * world-ready, by their owning constants (a renamed file fails typecheck, a
 * missing one fails startupAssetPreload.test.ts). An asset that is mounted at
 * startup but missing here is not a bug, only one re-render wave of delay; an
 * asset listed here that 404s IS one (it raises a startup error), and an asset
 * listed here that is never mounted costs a download. Keep it to the startup set.
 *
 * This module is imported by App.tsx, so it must not import scene modules: the
 * URL tables live in dependency-free leaves for exactly this reason.
 */
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { preloadDracoModel } from './dracoLoader';
import {
  CREATURE_ASSET_PATHS,
  GENERATED_ASSET_PATHS,
  MODEL_PATHS,
  type CreatureId,
  type GeneratedAssetId,
} from './modelLoader';
import {
  BUSINESS_BRANDS,
  HERITAGE_PRINT_ART,
  STATION_RETAIL_ART,
  STATION_SOUVENIR_ART,
  WORKER_ASSET_PATHS,
} from '../constants/worldAssetUrls';
import {
  CIVIC_SHADOW_BAKE_READY,
  CIVIC_SHADOW_DEPTH_URL,
  CIVIC_SHADOW_METADATA_URL,
} from '../constants/civicSquareLighting';

/** In the order the cold-load trace first requested them. */
const STARTUP_GENERATED_MODELS: readonly GeneratedAssetId[] = [
  // Factory shell, machines, spouting and yard (first world render).
  'cityMasonryUnit',
  'factorySteelUnit',
  'factoryConcreteUnit',
  'machineSiloUnit',
  'machineMillUnit',
  'machineSifterUnit',
  'machinePackerUnit',
  'spoutingFlangeUnit',
  'spoutingColumnUnit',
  'spoutingCrossbeamUnit',
  'flourSackUnit',
  'dockLevelerLip',
  'dockLevelerPlate',
  'dockDoorFrame',
  'dockDoorPanel',
  'dockShelterFrame',
  'dockShelterSide',
  'dockShelterTop',
  'wheelChockBody',
  'yardManifestBody',
  'yardDockPlateBody',
  'yardBumperBody',
  'dockBumperRubber',
  'yardSafetyMirrorBody',
  'yardExtinguisherBody',
  'yardMaintenanceBody',
  'yardTelemetryBody',
  'truckCabUnit',
  'truckTrailerUnit',
  'forkliftChassisUnit',
  'truckTyreUnit',
  // Perimeter, park, travel stop and roadside.
  'fencePostUnit',
  'fenceRailUnit',
  'checkpointBooth',
  'parkTrunkUnit',
  'parkCanopyZeroUnit',
  'parkCanopyOneUnit',
  'parkBench',
  'smallOffice',
  'stationWallUnit',
  'stationRoofUnit',
  'stationCounter',
  'stationRegister',
  'stationCardReader',
  'stationShelving',
  'stationDrinksCabinet',
  'stationCoffeeMachine',
  'stationSlushieMachine',
  'stationGrill',
  'stationMagazineRack',
  'stationCanopy',
  'fuelPumpShell',
  'stationSignPoleUnit',
  'stationSignCabinetUnit',
  'caravan',
  'busShelter',
  'cuteCarSedan',
  'cuteCarHatchback',
  'cuteCarPickup',
  'cuteCarSuv',
  'parkCanopyTwoUnit',
  'victorianPortalUnit',
  'oakTrunkUnit',
  'oakCanopyUnit',
  'nissenHut',
  'officeApartment',
  'officeApartmentThree',
  'canalBoat',
  'lockGateStructure',
  'woodenFootbridge',
  'foodTruck',
  'brickCarport',
  'picnicTable',
  'frogAuthoredBody',
  'cupidAuthoredBody',
  'kioskCafe',
  'pathLampVictorian',
  'dockCanopyStructure',
  'bridgeHousingUnit',
  'bridgeSupportUnit',
  'utilityFuelShell',
  'utilityProcessShell',
  'propaneLargeShell',
  'propaneSmallShell',
  'pathLampModern',
  'woodenBollard',
  'metalBollard',
  'infoSign',
  'wasteBin',
  'hedgeUnit',
  // Castle, farm and village.
  'castle',
  'barn',
  'coop',
  'farmhouse',
  'gardenbed',
  'drainagePipeUnit',
  'fence',
  'windmill',
  'watertrough',
  'haybale',
  'pineTrunkUnit',
  'pineCanopyUnit',
  'church',
  'townhall',
  'pub',
  'school',
  'forge',
  'shop',
  'wishingwell',
  'marketstall',
  'fountain',
  'duckpond',
  'postbox',
  'birchTrunkUnit',
  'birchCanopyUnit',
];

/** Rigged animals, read through useDracoGLTF(CREATURE_ASSET_PATHS[id]). */
const STARTUP_CREATURES: readonly CreatureId[] = [
  'chicken',
  'pig',
  'cow',
  'sheep',
  'crow',
  'horse',
  'cat',
  'duck',
];

/**
 * Models only Medium and above mount: the authored forklift and its chassis
 * surface (ForkliftModel.tsx, Low renders CompactForklift) and the high-detail
 * spouting runs (MillScene.tsx, `!isLowGraphics`).
 */
const DETAIL_ONLY_MODELS: ReadonlySet<string> = new Set([
  MODEL_PATHS.forklift,
  GENERATED_ASSET_PATHS.forkliftChassisUnit,
  GENERATED_ASSET_PATHS.spoutingFlangeUnit,
  GENERATED_ASSET_PATHS.spoutingColumnUnit,
  GENERATED_ASSET_PATHS.spoutingCrossbeamUnit,
]);

/** Raster prints read through useTexture by the signage, truck and shop components. */
const STARTUP_TEXTURES: readonly string[] = [
  BUSINESS_BRANDS.mill.primary,
  BUSINESS_BRANDS.flourExpress.primary,
  BUSINESS_BRANDS.grainCo.primary,
  BUSINESS_BRANDS.security.primary,
  BUSINESS_BRANDS.workshop.primary,
  STATION_RETAIL_ART,
  STATION_SOUVENIR_ART,
  BUSINESS_BRANDS.dino.fascia,
  BUSINESS_BRANDS.dino.pylon,
  HERITAGE_PRINT_ART.flour,
  HERITAGE_PRINT_ART.dino,
  HERITAGE_PRINT_ART.route,
  BUSINESS_BRANDS.electrical.primary,
  BUSINESS_BRANDS.cafe.primary,
  BUSINESS_BRANDS.townHall.primary,
  BUSINESS_BRANDS.inn.fascia,
  BUSINESS_BRANDS.inn.primary,
  BUSINESS_BRANDS.school.primary,
  BUSINESS_BRANDS.blacksmith.primary,
  BUSINESS_BRANDS.bakery.fascia,
  BUSINESS_BRANDS.butcher.fascia,
  BUSINESS_BRANDS.grocer.fascia,
  BUSINESS_BRANDS.greengrocer.primary,
  BUSINESS_BRANDS.cheesemonger.primary,
  BUSINESS_BRANDS.breadRolls.primary,
  BUSINESS_BRANDS.harvest.primary,
];

// CivicSquareLighting.tsx loads the baked atlas only when the bake is retained
// and this is not an export build; mirror that so no unused request is made.
const CIVIC_SHADOWS_LOADED =
  CIVIC_SHADOW_BAKE_READY && import.meta.env.VITE_CIVIC_BAKE_EXPORT !== '1';

export interface StartupAssetManifest {
  /** GLBs read through useDracoGLTF. */
  models: string[];
  /** Images read through useTexture or useLoader(TextureLoader). */
  textures: string[];
  /** Text read through useLoader(FileLoader). */
  files: string[];
}

export function startupAssetManifest(quality: string): StartupAssetManifest {
  const models = [
    ...STARTUP_GENERATED_MODELS.map((id) => GENERATED_ASSET_PATHS[id]),
    ...STARTUP_CREATURES.map((id) => CREATURE_ASSET_PATHS[id]),
    MODEL_PATHS.forklift,
    WORKER_ASSET_PATHS.masculine,
    WORKER_ASSET_PATHS.feminine,
  ].filter((path) => quality !== 'low' || !DETAIL_ONLY_MODELS.has(path));
  return {
    models,
    textures: [...STARTUP_TEXTURES, ...(CIVIC_SHADOWS_LOADED ? [CIVIC_SHADOW_DEPTH_URL] : [])],
    files: CIVIC_SHADOWS_LOADED ? [CIVIC_SHADOW_METADATA_URL] : [],
  };
}

let started = false;

/**
 * Queue every startup download once per page load. Returns false when an
 * earlier call already did. A quality change later needs no second pass: Low
 * only removes models, and anything a higher tier adds loads on demand.
 */
export function preloadStartupWorldAssets(quality: string): boolean {
  if (started) return false;
  started = true;
  const { models, textures, files } = startupAssetManifest(quality);
  for (const path of models) preloadDracoModel(path);
  for (const url of textures) useLoader.preload(THREE.TextureLoader, url);
  for (const url of files) useLoader.preload(THREE.FileLoader, url);
  return true;
}

export function resetStartupWorldAssetPreloadForTests(): void {
  started = false;
}
