import { afterEach, describe, expect, it } from 'vitest';
import { useWindmillLearningStore as store } from './windmillLearningStore';

const leases: (() => void)[] = [];
const mount = () => {
  const release = store.getState().registerModel();
  leases.push(release);
  return release;
};
afterEach(() => {
  leases.splice(0).forEach((release) => release());
  store.getState().close();
});

describe('windmill lesson state', () => {
  it('cannot open or progress without a mounted model', () => {
    expect(store.getState().ready).toBe(false);
    expect(store.getState().start()).toBe(false);
    store.getState().answer('runner');
    store.getState().next();
    expect(store.getState()).toMatchObject({ open: false, stage: 'power', feedback: 'none' });
  });
  it('requires both answers, resets feedback on navigation and closes on finish', () => {
    mount();
    store.getState().start();
    store.getState().answer('sails');
    store.getState().next();
    expect(store.getState()).toMatchObject({ stage: 'power', feedback: 'retry' });
    store.getState().answer('runner');
    store.getState().next();
    expect(store.getState()).toMatchObject({ stage: 'feed', feedback: 'none' });
    store.getState().next();
    store.getState().answer('runner');
    store.getState().next();
    expect(store.getState()).toMatchObject({ stage: 'grind', feedback: 'retry' });
    store.getState().answer('bed');
    store.getState().next();
    expect(store.getState().stage).toBe('collect');
    store.getState().next();
    expect(store.getState()).toMatchObject({ open: false, stage: 'power', feedback: 'none' });
  });
  it('is idempotent while open and starts fresh after closing', () => {
    mount();
    store.getState().start();
    store.getState().answer('runner');
    store.getState().next();
    store.getState().start();
    expect(store.getState().stage).toBe('feed');
    store.getState().back();
    expect(store.getState()).toMatchObject({ stage: 'power', feedback: 'none' });
    store.getState().answer('runner');
    store.getState().close();
    store.getState().start();
    expect(store.getState()).toMatchObject({ open: true, stage: 'power', feedback: 'none' });
  });
  it('keeps readiness until the last unique model lease releases', () => {
    const first = mount();
    const last = mount();
    store.getState().start();
    first();
    first();
    expect(store.getState()).toMatchObject({ ready: true, open: true });
    last();
    expect(store.getState()).toMatchObject({ ready: false, open: false });
  });
  it('has no persistence or operational store dependency', async () => {
    const source = await import('./windmillLearningStore.ts?raw');
    expect(source.default.match(/^import .*$/gm)).toEqual(["import { create } from 'zustand';"]);
    expect(source.default).not.toMatch(/localStorage|persist\(/);
  });
});
