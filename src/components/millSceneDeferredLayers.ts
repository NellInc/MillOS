/**
 * MillScene's lazily loaded layers, and the preload that fetches the ones its
 * first render reaches all at once.
 *
 * Without the preload, React met these chunks one at a time as it rendered the
 * scene. In some runs it paused on each unresolved chunk and fetched the next
 * only after rendering the previous one: the cold-start traces showed the
 * authored site arriving serially (FactoryExterior 2.6 s ... PostProcessing
 * 8.4 s, world-ready 3-4 s late) in about 1 run in 4, on round 5 and round 6
 * builds alike. Preloading starts every chunk together, and a chunk that has
 * landed renders without suspending (see recoverableLazy).
 *
 * Working if a cold-start trace requests every chunk in FIRST_RENDER_CHUNKS in
 * one wave, in every run.
 */
import { useGraphicsStore, isPostProcessingActive } from '../stores/graphicsStore';
import { recoverableLazy, type PreloadableComponent } from '../utils/recoverableLazy';

// Lazy load heavy optional layers while preserving the complete authored world.
// Quality changes may reduce effects and geometry density, but never swap the
// user into a different factory or remove the surrounding site.
export const TruckBay = recoverableLazy(() =>
  import('./TruckBay').then((module) => ({ default: module.TruckBay }))
);
export const AuthoredFactoryExterior = recoverableLazy(() =>
  import('./FactoryExterior').then((module) => ({ default: module.FactoryExterior }))
);
export const AuthoredCastle = recoverableLazy(() =>
  import('./scenery/FairytaleCastle').then((module) => ({ default: module.FairytaleCastle }))
);
export const AuthoredFarm = recoverableLazy(() =>
  import('./FarmArea').then((module) => ({ default: module.FarmArea }))
);
export const AuthoredVillage = recoverableLazy(() =>
  import('./VillageArea').then((module) => ({ default: module.VillageArea }))
);
export const CommunityLife = recoverableLazy(() =>
  import('./CommunityLife').then((module) => ({ default: module.CommunityLife }))
);
export const AuthoredTerrain = recoverableLazy(() =>
  import('./terrain').then((module) => ({ default: module.TerrainGround }))
);
export const AuthoredDockOpening = recoverableLazy(() =>
  import('./infrastructure/OpenDockOpening').then((module) => ({
    default: module.OpenDockOpening,
  }))
);
export const OperationalConveyors = recoverableLazy(() =>
  import('./ConveyorSystem').then((module) => ({ default: module.ConveyorSystem }))
);
export const OperationalForklifts = recoverableLazy(() =>
  import('./ForkliftSystem').then((module) => ({ default: module.ForkliftSystem }))
);
export const EnhancedHolographicDisplays = recoverableLazy(() =>
  import('./HolographicDisplays').then((module) => ({
    default: module.HolographicDisplays,
  }))
);
export const OptionalCascadeVisualization = recoverableLazy(() =>
  import('./CascadeVisualization').then((module) => ({
    default: module.CascadeVisualization,
  }))
);
export const OptionalStrategicOverlay = recoverableLazy(() =>
  import('./StrategicOverlay3D').then((module) => ({ default: module.StrategicOverlay3D }))
);
export const OptionalBlueprintMode = recoverableLazy(() =>
  import('./blueprint').then((module) => ({ default: module.BlueprintMode }))
);
export const HighDetailSpoutingSystem = recoverableLazy(() =>
  import('./SpoutingSystem').then((module) => ({ default: module.SpoutingSystem }))
);
export const PostProcessing = recoverableLazy(() =>
  import('./PostProcessing').then((module) => ({ default: module.PostProcessing }))
);
export const OperationalWorldSignals = recoverableLazy(() =>
  import('./OperationalWorldSignals').then((module) => ({
    default: module.OperationalWorldSignals,
  }))
);

/**
 * Start every chunk MillScene's first render will mount, in parallel. The
 * conditions mirror the JSX gates in MillScene.tsx, so a tier or perfDebug
 * isolation that leaves a layer out does not evaluate its module either.
 * Cascade ('K') and the Ultra holograms are fetched on demand, so they stay
 * out. Never rejects; a failed chunk is retried by its own render.
 */
export function preloadAuthoredSite(): Promise<void> {
  const { graphics } = useGraphicsStore.getState();
  const perfDebug = graphics.perfDebug;
  const isLowGraphics = graphics.quality === 'low';
  const layers: Array<Pick<PreloadableComponent<never>, 'preload'> | false | undefined> = [
    !isLowGraphics && AuthoredDockOpening,
    !isLowGraphics && !perfDebug?.disableMachines && HighDetailSpoutingSystem,
    !perfDebug?.disableConveyorSystem && OperationalConveyors,
    !perfDebug?.disableForkliftSystem && OperationalForklifts,
    !perfDebug?.disableTruckBay && TruckBay,
    !perfDebug?.disableTerrain && AuthoredTerrain,
    CommunityLife,
    AuthoredFactoryExterior,
    AuthoredCastle,
    AuthoredFarm,
    AuthoredVillage,
    OperationalWorldSignals,
    OptionalStrategicOverlay,
    OptionalBlueprintMode,
    isPostProcessingActive(graphics) && PostProcessing,
  ];
  return Promise.all(layers.map((layer) => (layer ? layer.preload() : undefined))).then(
    () => undefined
  );
}
