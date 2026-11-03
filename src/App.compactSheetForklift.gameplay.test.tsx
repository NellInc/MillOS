import { act, cleanup, render } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineData } from './types';
import type { ForkliftData } from './components/ForkliftSystem';

// Same harness as App.closeSelection: the Canvas keeps its children so the
// scene's selection callbacks can be read, and each lazy chunk records props.
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
const { useMobileControlStore } = await import('./stores/mobileControlStore');

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
  return props[props.length - 1] as { selectedForklift: ForkliftData | null };
};

const forklift = { id: 'forklift-1' } as unknown as ForkliftData;

// On a phone or a window under 768 px the dock, I, O and the guide open a
// sheet instead of the sidebar, and none of them goes through the selection
// clear the sidebar routes use. The forklift card (fixed, z-50 at the page
// root) then sat over the sheet, whose overlay is a z-30 layer: over its Close
// button in a narrow window, over its content on a phone.
// Working if opening any sheet closes the forklift card, as a panel does.
describe('App closes the forklift card when a compact sheet opens', () => {
  beforeEach(() => {
    captured.lazyProps = [];
    document.documentElement.dataset.sceneReady = 'true';
    useMobileControlStore.getState().closeMobilePanel();
  });
  afterEach(() => {
    cleanup();
    useMobileControlStore.getState().closeMobilePanel();
    delete document.documentElement.dataset.sceneReady;
  });

  it('clears the forklift selection when a sheet opens', () => {
    render(<App />);
    const scene = findSceneCallbacks(captured.canvasChildren);
    act(() => scene!.onSelectForklift(forklift));
    expect(operationalUI().selectedForklift).toBe(forklift);

    act(() => useMobileControlStore.getState().openMobilePanel('safety'));
    expect(operationalUI().selectedForklift).toBeNull();
  });

  it('leaves a forklift picked after the sheet closed alone', () => {
    render(<App />);
    act(() => useMobileControlStore.getState().openMobilePanel('safety'));
    act(() => useMobileControlStore.getState().closeMobilePanel());
    const scene = findSceneCallbacks(captured.canvasChildren);
    act(() => scene!.onSelectForklift(forklift));
    expect(operationalUI().selectedForklift).toBe(forklift);
  });
});
