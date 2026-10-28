import { afterEach, describe, expect, it } from 'vitest';
import {
  useProcessInspectionStore as store,
  type ProcessInspectionSubject,
} from './processInspectionStore';
import { useWindmillLearningStore } from './windmillLearningStore';
const mill: ProcessInspectionSubject = { id: 'mill-1', kind: 'mill', name: 'R.M. 101' };
const silo: ProcessInspectionSubject = { id: 'silo-1', kind: 'silo', name: 'Alpha' };
const releases: (() => void)[] = [];
const mount = (subject = mill) => {
  const release = store.getState().register(subject);
  releases.push(release);
  return release;
};
afterEach(() => {
  releases.splice(0).forEach((release) => release());
  store.getState().close();
});

describe('process inspection state', () => {
  it('requires availability and ignores answers/navigation while closed', () => {
    expect(store.getState().start('missing')).toBe(false);
    store.getState().answer('a');
    store.getState().next();
    store.getState().back();
    expect(store.getState()).toMatchObject({ active: null, stage: 0, feedback: 'none' });
  });
  it('uses unique id-scoped leases and leaves a different active subject alone', () => {
    const first = mount();
    const last = mount();
    const siloRelease = mount(silo);
    store.getState().start(mill.id);
    first();
    first();
    expect(store.getState().available[mill.id]).toEqual(mill);
    store.getState().start(silo.id);
    last();
    expect(store.getState().available[mill.id]).toBeUndefined();
    expect(store.getState().active).toEqual(silo);
    siloRelease();
    expect(store.getState()).toMatchObject({ available: {}, active: null, stage: 0 });
  });
  it('keeps a repeated start, resets on switching, and closes the windmill lesson', () => {
    mount();
    mount(silo);
    const releaseWindmill = useWindmillLearningStore.getState().registerModel();
    try {
      useWindmillLearningStore.getState().start();
      store.getState().start(mill.id);
      expect(useWindmillLearningStore.getState().open).toBe(false);
      store.getState().answer('a');
      store.getState().next();
      store.getState().start(mill.id);
      expect(store.getState().stage).toBe(1);
      store.getState().start(silo.id);
      expect(store.getState()).toMatchObject({ active: silo, stage: 0, feedback: 'none' });
    } finally {
      releaseWindmill();
    }
  });
  it('gates both questions, resets on back and finishes closed', () => {
    mount();
    store.getState().start(mill.id);
    store.getState().answer('b');
    store.getState().next();
    expect(store.getState()).toMatchObject({ stage: 0, feedback: 'retry' });
    store.getState().answer('a');
    store.getState().next();
    store.getState().back();
    expect(store.getState()).toMatchObject({ stage: 0, feedback: 'none' });
    store.getState().answer('a');
    store.getState().next();
    store.getState().next();
    store.getState().answer('a');
    store.getState().next();
    expect(store.getState()).toMatchObject({ stage: 2, feedback: 'retry' });
    store.getState().answer('b');
    store.getState().next();
    store.getState().next();
    expect(store.getState()).toMatchObject({ active: null, stage: 0, feedback: 'none' });
  });
  it('imports no operational store and uses no persistence', async () => {
    const source = await import('./processInspectionStore.ts?raw');
    expect(source.default.match(/^import .*$/gm)).toEqual([
      "import { create } from 'zustand';",
      "import { useWindmillLearningStore } from './windmillLearningStore';",
    ]);
    expect(source.default).not.toMatch(/localStorage|persist\(/);
  });
});
