/**
 * Runtime model loader with DRACO support and procedural fallbacks.
 *
 * Only autonomous equipment is eligible for the current v0.40 delivery.
 * Canonical source assets remain under assets/source/models, while this module
 * exposes only the derivatives that may be mounted by the live simulation.
 */

import { useEffect, useState } from 'react';
import { disposeDracoLoader, getDracoLoader, preloadDracoModel, useDracoGLTF } from './dracoLoader';

export { disposeDracoLoader, getDracoLoader, preloadDracoModel, useDracoGLTF };

const BASE = import.meta.env.BASE_URL;

/**
 * Generated farm and village assets: nine rigged creatures and twenty-one
 * static structures and props, all validated against
 * `public/models/asset-manifest.json` before delivery.
 *
 * Kept out of `MODEL_PATHS` for the same reason the two authored worker bodies
 * are: `ModelType` drives the availability probe and the disabled list, and
 * these are delivery-validated bundled assets that need neither.
 *
 * None of them is **preloaded**. `preloadAvailableModels` still has no caller,
 * and unlike the worker bodies every one of these has a real fallback to stream
 * in behind: each call site keeps the primitive it replaced, rendered under both
 * a Suspense boundary and an error boundary, so a slow download shows the old
 * geometry for a moment and a missing file shows it permanently - rather than
 * an empty paddock or a torn-down subtree. If the preloader is ever wired to
 * app init, these belong beside the two worker paths.
 */
export const CREATURE_ASSET_PATHS = {
  cow: `${BASE}models/farm/cow.glb`,
  sheep: `${BASE}models/farm/sheep.glb`,
  pig: `${BASE}models/farm/pig.glb`,
  horse: `${BASE}models/farm/horse.glb`,
  chicken: `${BASE}models/farm/chicken.glb`,
  crow: `${BASE}models/farm/crow.glb`,
  duck: `${BASE}models/farm/duck.glb`,
  cat: `${BASE}models/village/cat.glb`,
} as const;

export type CreatureId = keyof typeof CREATURE_ASSET_PATHS;

export const GENERATED_ASSET_PATHS = {
  fuelPumpShell: `${BASE}models/world/fuel-pump-shell.glb`,
  stationCanopy: `${BASE}models/world/station-canopy.glb`,
  checkpointBooth: `${BASE}models/world/checkpoint-booth.glb`,
  cuteCarHatchback: `${BASE}models/world/cute-car-hatchback.glb`,
  cuteCarPickup: `${BASE}models/world/cute-car-pickup.glb`,
  brickCarport: `${BASE}models/world/brick-carport.glb`,
  pathLampModern: `${BASE}models/world/path-lamp-modern.glb`,
  pathLampVictorian: `${BASE}models/world/path-lamp-victorian.glb`,
  infoSign: `${BASE}models/world/info-sign.glb`,
  foodTruck: `${BASE}models/world/food-truck.glb`,
  officeApartmentThree: `${BASE}models/world/office-apartment-three.glb`,
  canalBoat: `${BASE}models/world/canal-boat.glb`,
  cuteCarSuv: `${BASE}models/world/cute-car-suv.glb`,
  kioskCafe: `${BASE}models/world/kiosk-cafe.glb`,
  officeApartment: `${BASE}models/world/office-apartment.glb`,
  wasteBin: `${BASE}models/world/waste-bin.glb`,
  caravan: `${BASE}models/world/caravan.glb`,
  cuteCarSedan: `${BASE}models/world/cute-car-sedan.glb`,
  smallOffice: `${BASE}models/world/small-office.glb`,
  picnicTable: `${BASE}models/world/picnic-table.glb`,
  nissenHut: `${BASE}models/world/nissen-hut.glb`,
  parkBench: `${BASE}models/world/park-bench.glb`,
  busShelter: `${BASE}models/world/bus-shelter.glb`,
  dinoMascot: `${BASE}models/world/dino-mascot.glb`,
  barn: `${BASE}models/farm/barn.glb`,
  coop: `${BASE}models/farm/coop.glb`,
  farmhouse: `${BASE}models/farm/farmhouse.glb`,
  windmill: `${BASE}models/farm/windmill.glb`,
  haybale: `${BASE}models/farm/haybale.glb`,
  watertrough: `${BASE}models/farm/watertrough.glb`,
  gardenbed: `${BASE}models/farm/gardenbed.glb`,
  fence: `${BASE}models/farm/fence.glb`,
  cottage: `${BASE}models/village/cottage.glb`,
  shop: `${BASE}models/village/shop.glb`,
  church: `${BASE}models/village/church.glb`,
  townhall: `${BASE}models/village/townhall.glb`,
  pub: `${BASE}models/village/pub.glb`,
  school: `${BASE}models/village/school.glb`,
  forge: `${BASE}models/village/forge.glb`,
  wishingwell: `${BASE}models/village/wishingwell.glb`,
  marketstall: `${BASE}models/village/marketstall.glb`,
  postbox: `${BASE}models/village/postbox.glb`,
  fountain: `${BASE}models/village/fountain.glb`,
  duckpond: `${BASE}models/village/duckpond.glb`,
  castle: `${BASE}models/village/castle.glb`,
} as const;

export type GeneratedAssetId = keyof typeof GENERATED_ASSET_PATHS;

export const MODEL_PATHS = {
  forklift: `${BASE}models/forklift/forklift.glb`,
  silo: `${BASE}models/machines/silo.glb`,
  rollerMill: `${BASE}models/machines/mill.glb`,
  plansifter: `${BASE}models/machines/plansifter.glb`,
  packer: `${BASE}models/machines/packer.glb`,
} as const;

export type ModelType = keyof typeof MODEL_PATHS;

// Required by public/models/asset-manifest.json and validated before delivery.
const BUNDLED_MODELS: ReadonlySet<ModelType> = new Set(['forklift']);

export function isBundledModel(modelType: ModelType): boolean {
  return BUNDLED_MODELS.has(modelType);
}

// The factory machines use authored procedural and instanced models. Their old
// third-party GLBs are intentionally disabled so deployment does not probe for
// absent or quarantined files.
const DISABLED_MODELS: readonly ModelType[] = ['silo', 'rollerMill', 'plansifter', 'packer'];

const modelAvailability: Record<string, boolean | null> = {};
const modelAvailabilityChecks = new Map<string, Promise<boolean>>();

/** Check an optional model without accepting an HTML SPA fallback as a model. */
export async function checkModelExists(path: string): Promise<boolean> {
  if (modelAvailability[path] !== undefined && modelAvailability[path] !== null) {
    return modelAvailability[path] as boolean;
  }

  const activeCheck = modelAvailabilityChecks.get(path);
  if (activeCheck) return activeCheck;

  const check = (async (): Promise<boolean> => {
    try {
      const response = await fetch(path, { method: 'HEAD' });
      if (!response.ok || (response.headers.get('Content-Type') ?? '').includes('text/html')) {
        modelAvailability[path] = false;
        return false;
      }
      modelAvailability[path] = true;
      return true;
    } catch {
      modelAvailability[path] = false;
      return false;
    } finally {
      modelAvailabilityChecks.delete(path);
    }
  })();

  modelAvailabilityChecks.set(path, check);
  return check;
}

export function useModelAvailable(modelType: ModelType): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(() =>
    isBundledModel(modelType) ? true : null
  );
  const path = MODEL_PATHS[modelType];

  useEffect(() => {
    if (DISABLED_MODELS.includes(modelType)) {
      setAvailable(false);
      return;
    }
    if (isBundledModel(modelType)) {
      setAvailable(true);
      return;
    }
    void checkModelExists(path).then(setAvailable);
  }, [modelType, path]);

  return available;
}

/** Warm only delivery-approved autonomous equipment. */
export async function preloadAvailableModels(): Promise<void> {
  getDracoLoader();

  await Promise.all(
    Object.entries(MODEL_PATHS).map(async ([key, path]) => {
      const modelType = key as ModelType;
      if (DISABLED_MODELS.includes(modelType)) return;
      if (isBundledModel(modelType)) {
        preloadDracoModel(path);
        return;
      }
      if (await checkModelExists(path)) {
        try {
          preloadDracoModel(path);
        } catch {
          // Preloading is opportunistic. The mounted component retains its fallback.
        }
      }
    })
  );
}

export function getModelStatus(): Record<string, boolean | null> {
  return { ...modelAvailability };
}
