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
    selectedForklift: ForkliftData | null;
    onCloseSelection: () => void;
  };
};

const forklift = { id: 'forklift-1' } as unknown as ForkliftData;

// Every dock workspace, the I key and the workspace event clear the scene
// selection through onCloseSelection before the sidebar opens. It cleared the
// machine only, so the forklift card (fixed top right, above the sidebar) stayed
// over the panel's heading and Close button. Working if opening a panel closes
// the forklift card, as Escape already does.
describe('App clears the whole scene selection when a panel opens', () => {
  beforeEach(() => {
    captured.lazyProps = [];
    document.documentElement.dataset.sceneReady = 'true';
  });
  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.sceneReady;
  });

  it('closes the forklift card on onCloseSelection', () => {
    render(<App />);
    const scene = findSceneCallbacks(captured.canvasChildren);
    act(() => scene!.onSelectForklift(forklift));
    expect(operationalUI().selectedForklift).toBe(forklift);

    act(() => operationalUI().onCloseSelection());
    expect(operationalUI().selectedForklift).toBeNull();
  });
});
