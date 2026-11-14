/**
 * Plan 6.5 (report 04 F1, P9): the farm windmill and the henhouse took only an
 * orbit-view click, so in first person they showed no prompt and could not be
 * used, and finishing them left no trace. They now answer E (and the phone's
 * context button), keep first person while the lesson card takes the mouse,
 * and unlock their Datalinks notes. Plan 6.9: the first-person help lists R,
 * Q and X.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { setLocale } from '../i18n';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useUIStore } from '../stores/uiStore';
import { useKnowledgeStore } from '../stores/knowledgeStore';
import { useWindmillLearningStore } from '../stores/windmillLearningStore';
import { useProcessInspectionStore } from '../stores/processInspectionStore';
import { useAimedInteractableStore } from '../utils/worldInteractables';
import { unlinkSceneInteractables } from '../utils/sceneInteractables';
import { FirstPersonController, FPSInstructions } from './FirstPersonController';

const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  scene: null as unknown as THREE.Scene,
  canvas: null as unknown as HTMLCanvasElement,
  frame: (_: unknown, _dt: number) => {},
  lock: () => {},
  unlock: () => {},
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera: harness.camera,
    scene: harness.scene,
    gl: { domElement: harness.canvas },
  }),
  useFrame: (cb: typeof harness.frame) => {
    harness.frame = cb;
  },
}));
vi.mock('@react-three/drei', () => ({
  PointerLockControls: ({ onLock, onUnlock }: { onLock: () => void; onUnlock: () => void }) => {
    harness.lock = onLock;
    harness.unlock = onUnlock;
    return null;
  },
}));

const lockDescriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement');
const exitDescriptor = Object.getOwnPropertyDescriptor(document, 'exitPointerLock');
let locked: Element | null = null;
const exitPointerLock = vi.fn(() => {
  locked = null;
  harness.unlock();
});

/** A model 5 m ahead of an eye on the open hall floor, named as FarmArea names it. */
function placeModel(name: string) {
  const group = new THREE.Group();
  group.name = name;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3));
  mesh.position.y = 1.5;
  group.add(mesh);
  group.position.set(-30, 0, 5);
  harness.scene.add(group);
}

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  harness.camera = new THREE.PerspectiveCamera();
  harness.camera.position.set(-30, 6, 10);
  harness.scene = new THREE.Scene();
  harness.canvas = document.createElement('canvas');
  harness.canvas.requestPointerLock = vi.fn(() => {
    locked = harness.canvas;
    harness.lock();
    return Promise.resolve();
  }) as unknown as typeof harness.canvas.requestPointerLock;
  Object.defineProperty(document, 'pointerLockElement', {
    configurable: true,
    get: () => locked,
  });
  Object.defineProperty(document, 'exitPointerLock', {
    configurable: true,
    value: exitPointerLock,
  });
  exitPointerLock.mockClear();
  useUIStore.getState().setFpsMode(true);
  useKnowledgeStore.setState({ unlockedEntries: new Set(), newEntries: new Set() });
});
afterEach(() => {
  cleanup();
  unlinkSceneInteractables();
  useWindmillLearningStore.getState().close();
  useProcessInspectionStore.getState().close();
  useAimedInteractableStore.getState().setAimed(null);
  for (const [key, descriptor] of [
    ['pointerLockElement', lockDescriptor],
    ['exitPointerLock', exitDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(document, key, descriptor);
    else Reflect.deleteProperty(document, key);
  }
  locked = null;
  useUIStore.getState().setFpsMode(false);
  setLocale('en');
});

/** Mount, take the mouse, face the model and let the controller find it. */
function enterFacingModel() {
  render(<FirstPersonController />);
  locked = harness.canvas;
  act(() => harness.lock());
  harness.camera.lookAt(-30, 1.5, 5);
  act(() => harness.frame({}, 1 / 60));
  act(() => harness.frame({}, 1 / 60));
}
const pressE = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  });

describe('the farm lessons in first person', () => {
  it('starts the windmill lesson on E, keeps first person, and unlocks its note', () => {
    const release = useWindmillLearningStore.getState().registerModel();
    placeModel('farm-windmill');
    enterFacingModel();
    expect(useAimedInteractableStore.getState().prompt).toBe('windmillLesson');

    pressE();
    expect(useWindmillLearningStore.getState().open).toBe(true);
    // The mouse is handed to the lesson card; first person stays.
    expect(exitPointerLock).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().fpsMode).toBe(true);

    const lesson = useWindmillLearningStore.getState();
    act(() => {
      lesson.answer('runner');
      lesson.next();
      useWindmillLearningStore.getState().next();
      useWindmillLearningStore.getState().answer('bed');
      useWindmillLearningStore.getState().next();
    });
    expect(useWindmillLearningStore.getState().stage).toBe('collect');
    expect(useKnowledgeStore.getState().isUnlocked('history-windmills')).toBe(true);

    // Finishing takes the mouse back into first person.
    act(() => useWindmillLearningStore.getState().next());
    expect(harness.canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(document.pointerLockElement).toBe(harness.canvas);
    expect(useUIStore.getState().fpsMode).toBe(true);
    release();
  });

  it('starts the henhouse inspection on E and unlocks the henhouse note', () => {
    const release = useProcessInspectionStore
      .getState()
      .register({ id: 'henhouse', kind: 'henhouse', name: 'Henhouse' });
    placeModel('farm-henhouse');
    enterFacingModel();
    expect(useAimedInteractableStore.getState().prompt).toBe('henhouseInspection');
    pressE();
    expect(useProcessInspectionStore.getState().active?.id).toBe('henhouse');
    act(() => {
      const s = useProcessInspectionStore.getState();
      s.answer('a');
      s.next();
      useProcessInspectionStore.getState().next();
      useProcessInspectionStore.getState().answer('b');
      useProcessInspectionStore.getState().next();
    });
    expect(useProcessInspectionStore.getState().stage).toBe(3);
    expect(useKnowledgeStore.getState().isUnlocked('farm-henhouse')).toBe(true);
    release();
  });

  it('leaves first person if the mouse cannot be taken back', () => {
    const release = useWindmillLearningStore.getState().registerModel();
    harness.canvas.requestPointerLock = vi.fn(() =>
      Promise.reject(new Error('no gesture'))
    ) as unknown as typeof harness.canvas.requestPointerLock;
    placeModel('farm-windmill');
    enterFacingModel();
    pressE();
    expect(useUIStore.getState().fpsMode).toBe(true);
    return act(async () => {
      useWindmillLearningStore.getState().close();
      await Promise.resolve();
    }).then(() => {
      expect(useUIStore.getState().fpsMode).toBe(false);
      release();
    });
  });
});

describe('a refused lock where the request returns nothing', () => {
  it('leaves first person on pointerlockerror after the lesson closes', () => {
    const release = useWindmillLearningStore.getState().registerModel();
    harness.canvas.requestPointerLock = vi.fn(
      () => undefined
    ) as unknown as typeof harness.canvas.requestPointerLock;
    placeModel('farm-windmill');
    enterFacingModel();
    pressE();
    act(() => useWindmillLearningStore.getState().close());
    expect(useUIStore.getState().fpsMode).toBe(true);
    act(() => {
      document.dispatchEvent(new Event('pointerlockerror'));
    });
    expect(useUIStore.getState().fpsMode).toBe(false);
    release();
  });

  it('does not take the mouse for a lesson that was already open', () => {
    const release = useWindmillLearningStore.getState().registerModel();
    act(() => {
      useWindmillLearningStore.getState().start();
    });
    placeModel('farm-windmill');
    enterFacingModel();
    act(() => useWindmillLearningStore.getState().answer('sails'));
    expect(exitPointerLock).not.toHaveBeenCalled();
    release();
  });
});

describe('the first-person help', () => {
  it('lists R and Q for the forks and X for the forklift stop, in both languages', () => {
    render(<FPSInstructions visible />);
    expect(screen.getByTestId('fps-help-forks').textContent).toBe('RQRaise and lower the forks');
    expect(screen.getByTestId('fps-help-forklift-stop').textContent).toBe('XStop the forklifts');
    act(() => setLocale('pt-BR'));
    expect(screen.getByTestId('fps-help-forks').textContent).toContain('Erguer e baixar os garfos');
    expect(screen.getByTestId('fps-help-forklift-stop').textContent).toContain(
      'Parar as empilhadeiras'
    );
  });
});
