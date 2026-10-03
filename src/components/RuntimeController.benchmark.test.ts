import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import * as THREE from 'three';

interface MotionEntity {
  id: string;
  type: string;
  position: [number, number, number];
  speed: number;
  steeringAngle: number;
  wheelTravel: number;
  routeDistance: number;
  stopReason?: string;
}
interface MotionSample {
  elapsedMs: number;
  entities: MotionEntity[];
}
interface MotionSummary {
  id: string;
  telemetry: Record<string, { min: number; max: number; delta: number; travel: number }>;
}
interface MotionPacing {
  id: string;
  movingSamples: number;
  maxMovingPlateauSamples: number;
  maxSingleStepDistance: number;
}
interface MotionWindow {
  samples: MotionSample[];
  framePacing: { sampleCount: number; worstFrameMs: number; framesOver50Ms: number };
}
type BrowserEvaluation = (args: { sampleDurationMs: number }) => Promise<MotionWindow>;

// Run the actual harness functions without launching its CLI/browser. This is
// the same AST-extraction pattern used by the real-store journey tests.
const source = ts.createSourceFile(
  'run-performance-benchmark.mjs',
  readFileSync('scripts/run-performance-benchmark.mjs', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
const names = [
  'summarizeMotion',
  'summarizeMotionPacing',
  'evaluateMotionAcceptance',
  'collectDisplayCadenceMotion',
];
const functions = source.statements.filter(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && !!node.name && names.includes(node.name.text)
);
expect(functions).toHaveLength(names.length);
const actual = new Function(
  'options',
  `${functions.map((node) => node.getText(source)).join('\n')}; return {${names.join(',')}};`
)({ motionEnabled: true }) as {
  summarizeMotion(samples: MotionSample[]): MotionSummary[];
  summarizeMotionPacing(samples: MotionSample[]): MotionPacing[];
  evaluateMotionAcceptance(
    samples: MotionSample[],
    summary: MotionSummary[],
    pacing: MotionPacing[]
  ): { checks: { id: string; passed: boolean }[] };
  collectDisplayCadenceMotion(
    page: { evaluate(callback: BrowserEvaluation, args: { sampleDurationMs: number }): unknown },
    durationMs: number
  ): Promise<MotionWindow>;
};

function sample(elapsedMs: number, x: number, speed: number, wheelTravel: number): MotionSample {
  return {
    elapsedMs,
    entities: [
      {
        id: 'shipping-truck',
        type: 'truck',
        position: [x, 0, 0],
        speed,
        steeringAngle: 0,
        wheelTravel,
        routeDistance: x,
        stopReason: 'none',
      },
    ],
  };
}
function check(samples: MotionSample[], id: string) {
  return actual
    .evaluateMotionAcceptance(
      samples,
      actual.summarizeMotion(samples),
      actual.summarizeMotionPacing(samples)
    )
    .checks.find((row) => row.id === id)?.passed;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('actual native benchmark motion measurements', () => {
  it('counts wheel travel when a truck drives forwards then reverses to its start', () => {
    const samples = [sample(0, 0, 1, 0), sample(50, 1, 1, 1), sample(100, 0, -1, 0)];
    expect(actual.summarizeMotion(samples)[0].telemetry.wheelTravel).toMatchObject({
      delta: 0,
      travel: 2,
    });
    expect(check(samples, 'wheel-travel-follows-motion')).toBe(true);
  });

  it('still rejects visible vehicle travel with stationary wheels', () => {
    expect(check([sample(0, 0, 1, 0), sample(50, 1, 1, 0)], 'wheel-travel-follows-motion')).toBe(
      false
    );
  });

  it('observes reversing vehicles at display cadence', () => {
    const samples = [sample(0, 2, -1, 2), sample(16, 1.5, -1, 1.5), sample(32, 1, -1, 1)];
    expect(actual.summarizeMotionPacing(samples)[0].movingSamples).toBe(2);
    expect(check(samples, 'display-cadence-motion-observed')).toBe(true);
  });

  it('detects a staccato plateau while reversing, as well as moving forwards', () => {
    const samples = Array.from({ length: 5 }, (_, i) => sample(i * 16, 1, -1, 1));
    expect(actual.summarizeMotionPacing(samples)[0].maxMovingPlateauSamples).toBe(4);
    expect(check(samples, 'moving-vehicles-have-no-staccato-plateau')).toBe(false);
  });

  it('retains the unchanged single-frame displacement limit', () => {
    expect(
      check([sample(0, 0, 17, 0), sample(16, 1.6, 17, 1.6)], 'single-frame-displacement-is-bounded')
    ).toBe(false);
  });

  it.each([120, 240])('does not call smooth %i Hz crawl a stationary plateau', (hz) => {
    const samples = Array.from({ length: 8 }, (_, i) =>
      sample((i * 1000) / hz, (i * 0.3) / hz, 0.3, (i * 0.3) / hz)
    );
    expect(actual.summarizeMotionPacing(samples)[0].maxMovingPlateauSamples).toBe(0);
    expect(check(samples, 'moving-vehicles-have-no-staccato-plateau')).toBe(true);
  });

  it('retains the 2 mm per 60 Hz motion floor and detects real high-refresh stalls', () => {
    const belowFloor = Array.from({ length: 8 }, (_, i) =>
      sample((i * 1000) / 60, i * 0.0019, 0.3, i * 0.005)
    );
    const stalled = Array.from({ length: 8 }, (_, i) => sample((i * 1000) / 240, 1, 0.3, i));
    expect(check(belowFloor, 'moving-vehicles-have-no-staccato-plateau')).toBe(false);
    expect(check(stalled, 'moving-vehicles-have-no-staccato-plateau')).toBe(false);
  });

  it('retains sub-millimetre motion in the actual runtime snapshot', () => {
    const controller = ts.createSourceFile(
      'RuntimeController.tsx',
      readFileSync('src/components/RuntimeController.tsx', 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let declaration: ts.VariableDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(controller) === 'motionSnapshot')
        declaration = node;
      ts.forEachChild(node, visit);
    };
    visit(controller);
    if (!declaration?.initializer) throw new Error('Actual motion snapshot contract changed');
    const round = controller.statements.find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) && node.name?.text === 'rounded'
    );
    if (!round) throw new Error('Actual runtime rounding helper changed');
    const js = ts.transpileModule(
      `${round.getText(controller)}; const capture = ${declaration.initializer.getText(controller)};`,
      { compilerOptions: { target: ts.ScriptTarget.ESNext } }
    ).outputText;
    const scene = new THREE.Group();
    const vehicles = Array.from({ length: 4 }, (_, i) => {
      const vehicle = new THREE.Object3D();
      vehicle.userData.forkliftId = `forklift-${i + 1}`;
      scene.add(vehicle);
      return vehicle;
    });
    vehicles[0].position.set(0.003125, 0.00021, -42.000625);
    const capture = new Function(
      'trackedMotionObjects',
      'refreshTrackedMotionObjects',
      'motionPosition',
      'motionQuaternion',
      'motionEuler',
      'readRuntimeMotionTelemetry',
      'useGameSimulationStore',
      'useProductionStore',
      'useMaterialFlowStore',
      `${js};return capture;`
    )(
      vehicles,
      () => {},
      new THREE.Vector3(),
      new THREE.Quaternion(),
      new THREE.Euler(),
      () => ({}),
      { getState: () => ({ gameSpeed: 1 }) },
      { getState: () => ({ productionSpeed: 1 }) },
      { getState: () => ({ simulationTime: 0 }) }
    ) as () => { entities: { position: number[] }[] };
    capture().entities[0].position.forEach((value, i) => {
      expect(Math.abs(value - vehicles[0].position.toArray()[i])).toBeLessThanOrEqual(0.0000051);
    });
  });

  it('takes every animation-frame sample instead of conflating several frames into one', async () => {
    const frames = [0, 16, 32, 48, 64];
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('window', {
      __MILLOS_RUNTIME__: {
        motionSnapshot: () => ({ entities: [] }),
        framePacingSnapshot: () => ({ sampleCount: 5, worstFrameMs: 16, framesOver50Ms: 0 }),
      },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      const time = frames.shift();
      if (time === undefined) throw new Error('Collector failed to terminate');
      queueMicrotask(() => callback(time));
      return time;
    });
    const page = {
      evaluate: (callback: BrowserEvaluation, args: { sampleDurationMs: number }) => callback(args),
    };
    const collection = await actual.collectDisplayCadenceMotion(page, 64);
    expect(collection.samples.map((row) => row.elapsedMs)).toEqual([0, 16, 32, 48, 64]);
  });

  it('freezes the real frame window before exporting telemetry and retains real slow frames', async () => {
    let frameCount = 0;
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('window', {
      __MILLOS_RUNTIME__: {
        motionSnapshot: () => ({ entities: [] }),
        framePacingSnapshot: () => ({
          sampleCount: frameCount,
          worstFrameMs: 70,
          framesOver50Ms: 1,
        }),
      },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      const time = frameCount++ * 16;
      queueMicrotask(() => callback(time));
      return time;
    });
    const page = {
      evaluate: async (callback: BrowserEvaluation, args: { sampleDurationMs: number }) => {
        const collection = await callback(args);
        frameCount += 100; // Transport takes time while the page continues rendering.
        return collection;
      },
    };
    const collection = await actual.collectDisplayCadenceMotion(page, 64);
    expect(frameCount).toBe(105);
    expect(collection.framePacing).toEqual({
      sampleCount: 5,
      worstFrameMs: 70,
      framesOver50Ms: 1,
    });
  });

  it('reads actual frame pacing without scene inspection and copies long-task evidence', () => {
    const controller = ts.createSourceFile(
      'RuntimeController.tsx',
      readFileSync('src/components/RuntimeController.tsx', 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    let declaration: ts.VariableDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(controller) === 'framePacingSnapshot')
        declaration = node;
      ts.forEachChild(node, visit);
    };
    visit(controller);
    if (!declaration?.initializer) throw new Error('Actual frame-window snapshot contract changed');
    const helpers = controller.statements.filter(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) &&
        !!node.name &&
        ['rounded', 'percentile', 'summarizeFramePacing'].includes(node.name.text)
    );
    expect(helpers).toHaveLength(3);
    const js = ts.transpileModule(
      `${helpers.map((node) => node.getText(controller).replace(/^export /, '')).join('\n')};
      const capture = ${declaration.initializer.getText(controller)};`,
      { compilerOptions: { target: ts.ScriptTarget.ESNext } }
    ).outputText;
    const frames = { current: [16, 70, 16] };
    const tasks = { current: [{ startTime: 10, duration: 70 }] };
    // No scene or renderer is provided: an expensive inspection would fail.
    const capture = new Function(
      'frameTimesRef',
      'firstFrameAtRef',
      'longTasksRef',
      `${js};return capture;`
    )(frames, { current: 123 }, tasks) as () => {
      sampleCount: number;
      worstFrameMs: number;
      framesOver50Ms: number;
      firstFrameAt: number;
      longTasks: { startTime: number; duration: number }[];
    };
    const frozen = capture();
    frames.current.push(100);
    tasks.current[0].duration = 200;
    tasks.current.push({ startTime: 300, duration: 100 });
    expect(frozen).toMatchObject({
      sampleCount: 3,
      worstFrameMs: 70,
      framesOver50Ms: 1,
      firstFrameAt: 123,
      longTasks: [{ startTime: 10, duration: 70 }],
    });
    expect(capture().sampleCount).toBe(4);
  });

  it('rejects missing frame-window telemetry rather than substituting a later snapshot', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.stubGlobal('window', { __MILLOS_RUNTIME__: { motionSnapshot: () => ({ entities: [] }) } });
    vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
      queueMicrotask(() => callback(64));
      return 1;
    });
    const page = {
      evaluate: (callback: BrowserEvaluation, args: { sampleDurationMs: number }) => callback(args),
    };
    await expect(actual.collectDisplayCadenceMotion(page, 64)).rejects.toThrow(
      'Runtime frame-window telemetry was unavailable'
    );
  });
});
