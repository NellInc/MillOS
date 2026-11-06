import { act, cleanup, render } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineData } from './types';
import type { ForkliftData } from './components/ForkliftSystem';

// The 3D Canvas cannot run here. It is replaced by a stub that keeps its
// children, so the scene's selection callbacks can be read off the element
// tree, and every lazy chunk is a stub that records the props it was given.
const captured = vi.hoisted(() => ({
  canvasChildren: null as unknown,
  lazyProps: [] as Record<string, unknown>[],
}));

vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: ({ children }: { children?: ReactNode }) => {
    captured.canvasChildren = children;
    return null;
  },
}));
vi.mock('./utils/recoverableLazy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/recoverableLazy')>();
  return {
    ...actual,
    recoverableLazy: () => {
      const Stub = (props: Record<string, unknown>) => {
        captured.lazyProps.push(props);
        return null;
      };
      return Object.assign(Stub, { preload: () => Promise.resolve() });
    },
  };
});
vi.mock('./components/LoadingScreen', () => ({ LoadingScreen: () => null }));

const { default: App } = await import('./App');

type SceneCallbacks = {
  onSelectMachine: (machine: MachineData) => void;
  onSelectForklift: (forklift: ForkliftData) => void;
};

function findSceneCallbacks(node: unknown): SceneCallbacks | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSceneCallbacks(child);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown>;
  if (typeof props.onSelectForklift === 'function' && typeof props.onSelectMachine === 'function')
    return props as unknown as SceneCallbacks;
  return findSceneCallbacks(props.fallback) ?? findSceneCallbacks(props.children);
}

const operationalUI = () => {
  const props = captured.lazyProps.filter((candidate) => 'selectedForklift' in candidate);
  return props[props.length - 1] as {
    selectedMachine: MachineData | null;
    selectedForklift: ForkliftData | null;
  };
};

const machine = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: 'ROLLER_MILL',
  position: [0, 0, 0],
} as unknown as MachineData;
const forklift = { id: 'forklift-1' } as unknown as ForkliftData;

// One selection at a time: the forklift card sat over the machine inspector's
// header and close button when both were selected.
describe('App keeps a single scene selection', () => {
  beforeEach(() => {
    captured.lazyProps = [];
    document.documentElement.dataset.sceneReady = 'true';
  });
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.sceneReady;
  });

  it('clears the machine when a forklift is picked, and the forklift when a machine is', () => {
    render(<App />);
    const scene = findSceneCallbacks(captured.canvasChildren);
    expect(scene).not.toBeNull();

    act(() => scene!.onSelectMachine(machine));
    expect(operationalUI().selectedMachine).toBe(machine);

    act(() => scene!.onSelectForklift(forklift));
    expect(operationalUI().selectedForklift).toBe(forklift);
    expect(operationalUI().selectedMachine).toBeNull();

    act(() => scene!.onSelectMachine(machine));
    expect(operationalUI().selectedMachine).toBe(machine);
    expect(operationalUI().selectedForklift).toBeNull();
  });
});
