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
  parkTrunkUnit: `${BASE}models/world/park-trunk-unit.glb`,
  parkCanopyZeroUnit: `${BASE}models/world/park-canopy-zero-unit.glb`,
  parkCanopyOneUnit: `${BASE}models/world/park-canopy-one-unit.glb`,
  parkCanopyTwoUnit: `${BASE}models/world/park-canopy-two-unit.glb`,
  oakTrunkUnit: `${BASE}models/world/oak-trunk-unit.glb`,
  oakCanopyUnit: `${BASE}models/world/oak-canopy-unit.glb`,
  birchTrunkUnit: `${BASE}models/world/birch-trunk-unit.glb`,
  birchCanopyUnit: `${BASE}models/world/birch-canopy-unit.glb`,
  pineTrunkUnit: `${BASE}models/world/pine-trunk-unit.glb`,
  pineCanopyUnit: `${BASE}models/world/pine-canopy-unit.glb`,
  flourSackUnit: `${BASE}models/world/flour-sack-unit.glb`,
  spoutingFlangeUnit: `${BASE}models/world/spouting-flange-unit.glb`,
  spoutingColumnUnit: `${BASE}models/world/spouting-column-unit.glb`,
  spoutingCrossbeamUnit: `${BASE}models/world/spouting-crossbeam-unit.glb`,
  forkliftChassisUnit: `${BASE}models/world/forklift-chassis-unit.glb`,
  truckCabUnit: `${BASE}models/world/truck-cab-unit.glb`,
  truckTrailerUnit: `${BASE}models/world/truck-trailer-unit.glb`,
  truckTyreUnit: `${BASE}models/world/truck-tyre-unit.glb`,
  victorianPortalUnit: `${BASE}models/world/victorian-portal-unit.glb`,
  industrialPortalUnit: `${BASE}models/world/industrial-portal-unit.glb`,
  drainagePipeUnit: `${BASE}models/world/drainage-pipe-unit.glb`,
  fencePostUnit: `${BASE}models/world/fence-post-unit.glb`,
  fenceRailUnit: `${BASE}models/world/fence-rail-unit.glb`,
  hedgeUnit: `${BASE}models/world/hedge-unit.glb`,
  bridgeHousingUnit: `${BASE}models/world/bridge-housing-unit.glb`,
  bridgeSupportUnit: `${BASE}models/world/bridge-support-unit.glb`,
  factorySteelUnit: `${BASE}models/world/factory-steel-unit.glb`,
  factoryConcreteUnit: `${BASE}models/world/factory-concrete-unit.glb`,
  cityMasonryUnit: `${BASE}models/world/city-masonry-unit.glb`,
  stationSignPoleUnit: `${BASE}models/world/station-sign-pole-unit.glb`,
  stationSignCabinetUnit: `${BASE}models/world/station-sign-cabinet-unit.glb`,
  stationWallUnit: `${BASE}models/world/station-wall-unit.glb`,
  stationRoofUnit: `${BASE}models/world/station-roof-unit.glb`,
  machineSiloUnit: `${BASE}models/world/machine-silo-unit.glb`,
  machineMillUnit: `${BASE}models/world/machine-mill-unit.glb`,
  machineSifterUnit: `${BASE}models/world/machine-sifter-unit.glb`,
  machinePackerUnit: `${BASE}models/world/machine-packer-unit.glb`,
  dockLevelerPlate: `${BASE}models/world/dock-leveler-plate.glb`,
  dockLevelerLip: `${BASE}models/world/dock-leveler-lip.glb`,
  dockDoorPanel: `${BASE}models/world/dock-door-panel.glb`,
  dockDoorFrame: `${BASE}models/world/dock-door-frame.glb`,
  dockShelterSide: `${BASE}models/world/dock-shelter-side.glb`,
  dockShelterTop: `${BASE}models/world/dock-shelter-top.glb`,
  dockShelterFrame: `${BASE}models/world/dock-shelter-frame.glb`,
  palletStagingBody: `${BASE}models/world/pallet-staging-body.glb`,
  wheelChockBody: `${BASE}models/world/wheel-chock-body.glb`,
  dockBumperRubber: `${BASE}models/world/dock-bumper-rubber.glb`,
  cupidAuthoredBody: `${BASE}models/world/cupid-authored-body.glb`,
  frogAuthoredBody: `${BASE}models/world/frog-authored-body.glb`,
  yardAccessNodeBody: `${BASE}models/world/yard-access-node-body.glb`,
  yardAirHoseBody: `${BASE}models/world/yard-air-hose-body.glb`,
  yardBumperBody: `${BASE}models/world/yard-bumper-body.glb`,
  yardCompactorBody: `${BASE}models/world/yard-compactor-body.glb`,
  yardCraneBody: `${BASE}models/world/yard-crane-body.glb`,
  yardDockPlateBody: `${BASE}models/world/yard-dock-plate-body.glb`,
  yardDumpsterBody: `${BASE}models/world/yard-dumpster-body.glb`,
  yardExtinguisherBody: `${BASE}models/world/yard-extinguisher-body.glb`,
  yardFuelIslandBody: `${BASE}models/world/yard-fuel-island-body.glb`,
  yardGuardShackBody: `${BASE}models/world/yard-guard-shack-body.glb`,
  yardIntercomBody: `${BASE}models/world/yard-intercom-body.glb`,
  yardJockeyBody: `${BASE}models/world/yard-jockey-body.glb`,
  yardMaintenanceBody: `${BASE}models/world/yard-maintenance-body.glb`,
  yardManifestBody: `${BASE}models/world/yard-manifest-body.glb`,
  yardPalletChargerBody: `${BASE}models/world/yard-pallet-charger-body.glb`,
  yardSafetyMirrorBody: `${BASE}models/world/yard-safety-mirror-body.glb`,
  yardScaleKioskBody: `${BASE}models/world/yard-scale-kiosk-body.glb`,
  yardStretchWrapBody: `${BASE}models/world/yard-stretch-wrap-body.glb`,
  yardTelemetryBody: `${BASE}models/world/yard-telemetry-body.glb`,
  yardTireInspectionBody: `${BASE}models/world/yard-tire-inspection-body.glb`,
  yardTruckWashBody: `${BASE}models/world/yard-truck-wash-body.glb`,
  yardWeightScaleBody: `${BASE}models/world/yard-weight-scale-body.glb`,
  grainSiloLargeShell: `${BASE}models/world/grain-silo-large-shell.glb`,
  grainSiloSmallShell: `${BASE}models/world/grain-silo-small-shell.glb`,
  grainElevatorAuthoredBody: `${BASE}models/world/grain-elevator-authored-body.glb`,
  utilityFuelShell: `${BASE}models/world/utility-fuel-shell.glb`,
  utilityProcessShell: `${BASE}models/world/utility-process-shell.glb`,
  propaneLargeShell: `${BASE}models/world/propane-large-shell.glb`,
  propaneSmallShell: `${BASE}models/world/propane-small-shell.glb`,
  woodenBollard: `${BASE}models/world/wooden-bollard.glb`,
  metalBollard: `${BASE}models/world/metal-bollard.glb`,
  woodenFootbridge: `${BASE}models/world/wooden-footbridge.glb`,
  lockGateStructure: `${BASE}models/world/lock-gate-structure.glb`,
  dockCanopyStructure: `${BASE}models/world/dock-canopy-structure.glb`,
  stationCounter: `${BASE}models/world/station-counter.glb`,
  stationRegister: `${BASE}models/world/station-register.glb`,
  stationCardReader: `${BASE}models/world/station-card-reader.glb`,
  stationShelving: `${BASE}models/world/station-shelving.glb`,
  stationDrinksCabinet: `${BASE}models/world/station-drinks-cabinet.glb`,
  stationCoffeeMachine: `${BASE}models/world/station-coffee-machine.glb`,
  stationSlushieMachine: `${BASE}models/world/station-slushie-machine.glb`,
  stationGrill: `${BASE}models/world/station-grill.glb`,
  stationMagazineRack: `${BASE}models/world/station-magazine-rack.glb`,

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
