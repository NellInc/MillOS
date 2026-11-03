import { act, cleanup, render } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineData } from './types';
import type { ForkliftData } from './components/ForkliftSystem';
import { audioManager } from './utils/audioManager';

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

// Escape on a selected machine closes its inspector once. The shortcut played
// the panel-close sound and then App's selection effect played it again, so
// one press sounded twice. Working if one close is one sound.
describe('App closes a selection with one sound', () => {
  beforeEach(() => {
    captured.lazyProps = [];
    document.documentElement.dataset.sceneReady = 'true';
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete document.documentElement.dataset.sceneReady;
  });

  it('plays the panel-close sound once when Escape clears a selected machine', () => {
    const open = vi.spyOn(audioManager, 'playPanelOpen').mockImplementation(() => {});
    const close = vi.spyOn(audioManager, 'playPanelClose').mockImplementation(() => {});
    render(<App />);
    const scene = findSceneCallbacks(captured.canvasChildren);
    act(() => scene!.onSelectMachine(machine));
    expect(open).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(operationalUI().selectedMachine).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
