import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphicsStore } from '../../stores/graphicsStore';

// Each deferred scene chunk is replaced by a stub whose module factory counts
// how many times the chunk is evaluated, so the test sees the scene's own
// import thunks being called (the same ones its React.lazy wrappers use).
const loads = vi.hoisted(() => new Map<string, number>());
const count = (name: string) => loads.set(name, (loads.get(name) ?? 0) + 1);
const stub = () => null;

vi.mock('../TruckBay', () => (count('TruckBay'), { TruckBay: stub }));
vi.mock('../FactoryExterior', () => (count('FactoryExterior'), { FactoryExterior: stub }));
vi.mock('../scenery/FairytaleCastle', () => (count('FairytaleCastle'), { FairytaleCastle: stub }));
vi.mock('../FarmArea', () => (count('FarmArea'), { FarmArea: stub }));
vi.mock('../VillageArea', () => (count('VillageArea'), { VillageArea: stub }));
vi.mock('../CommunityLife', () => (count('CommunityLife'), { CommunityLife: stub }));
vi.mock('../terrain', () => (count('terrain'), { TerrainGround: stub }));
vi.mock(
  '../infrastructure/OpenDockOpening',
  () => (count('OpenDockOpening'), { OpenDockOpening: stub })
);
vi.mock('../ConveyorSystem', () => (count('ConveyorSystem'), { ConveyorSystem: stub }));
vi.mock('../ForkliftSystem', () => (count('ForkliftSystem'), { ForkliftSystem: stub }));
vi.mock(
  '../HolographicDisplays',
  () => (count('HolographicDisplays'), { HolographicDisplays: stub })
);
vi.mock(
  '../CascadeVisualization',
  () => (count('CascadeVisualization'), { CascadeVisualization: stub })
);
vi.mock('../StrategicOverlay3D', () => (count('StrategicOverlay3D'), { StrategicOverlay3D: stub }));
vi.mock('../blueprint', () => (count('blueprint'), { BlueprintMode: stub }));
vi.mock('../SpoutingSystem', () => (count('SpoutingSystem'), { SpoutingSystem: stub }));
vi.mock('../PostProcessing', () => (count('PostProcessing'), { PostProcessing: stub }));
vi.mock(
  '../OperationalWorldSignals',
  () => (count('OperationalWorldSignals'), { OperationalWorldSignals: stub })
);

// Every lazy chunk the first scene render reaches on the default (medium) tier.
// Cascade ('K') and the Ultra holograms are fetched on demand later.
const FIRST_RENDER_CHUNKS = [
  'OpenDockOpening',
  'SpoutingSystem',
  'ConveyorSystem',
  'ForkliftSystem',
  'TruckBay',
  'terrain',
  'CommunityLife',
  'FactoryExterior',
  'FairytaleCastle',
  'FarmArea',
  'VillageArea',
  'OperationalWorldSignals',
  'StrategicOverlay3D',
  'blueprint',
  'PostProcessing',
];

describe('MillScene deferred chunk preload', () => {
  beforeEach(() => {
    useGraphicsStore.getState().setGraphicsQuality('medium');
  });

  it('fetches every chunk of the first scene render in parallel, once', async () => {
    // Before the preload, React met these one at a time: a render that paused
    // on each unresolved chunk fetched them serially (about 3-4 s in 1 run of
    // 4 in the runtime traces).
    const { preloadAuthoredSite } = await import('../millSceneDeferredLayers');
    await preloadAuthoredSite();
    await preloadAuthoredSite();

    for (const name of FIRST_RENDER_CHUNKS) {
      expect(loads.get(name), `${name} was not preloaded exactly once`).toBe(1);
    }
    expect(loads.get('CascadeVisualization')).toBeUndefined();
    expect(loads.get('HolographicDisplays')).toBeUndefined();
  });

  it('starts the preload the moment the scene chunk arrives, before its first render', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const start = app.indexOf('const AuthoredMillScene = recoverableLazy(');
    const declaration = app.slice(start, app.indexOf('\n);', start));
    expect(start).toBeGreaterThan(-1);
    expect(declaration).toMatch(
      /void preloadAuthoredSite\(\);\s+return import\(.\.\/components\/MillScene.\)/
    );
  });
});
