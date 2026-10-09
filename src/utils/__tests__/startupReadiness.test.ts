import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { beginStartupTask, getStartupSnapshot, StartupFrameWindow } from '../startupReadiness';

describe('StartupFrameWindow', () => {
  it('requires completed prerequisites and 45 rendered intervals', () => {
    const window = new StartupFrameWindow();
    for (let i = 0; i < 100; i++) {
      expect(window.sample({ now: i * 16, prerequisitesReady: false, revision: 'a' })).toBe(false);
    }
    for (let i = 100; i < 144; i++) {
      expect(window.sample({ now: i * 16, prerequisitesReady: true, revision: 'a' })).toBe(false);
    }
    expect(window.sample({ now: 144 * 16, prerequisitesReady: true, revision: 'a' })).toBe(true);
  });

  it.each(['new shader', 'asset finished', 'geometry uploaded'])(
    'restarts the window after %s',
    (revision) => {
      const window = new StartupFrameWindow();
      for (let i = 0; i < 45; i++) {
        window.sample({ now: i * 16, prerequisitesReady: true, revision: 'a' });
      }
      expect(window.sample({ now: 45 * 16, prerequisitesReady: true, revision })).toBe(false);
      expect(window.sample({ now: 46 * 16, prerequisitesReady: true, revision })).toBe(false);
    }
  );

  it('rejects a stalled frame and requires a fresh window', () => {
    const window = new StartupFrameWindow();
    for (let i = 0; i <= 45; i++) {
      window.sample({ now: i * 16, prerequisitesReady: true, revision: 'a' });
    }
    expect(window.sample({ now: 1900, prerequisitesReady: true, revision: 'a' })).toBe(false);
    for (let i = 1; i < 45; i++) {
      expect(window.sample({ now: 1900 + i * 16, prerequisitesReady: true, revision: 'a' })).toBe(
        false
      );
    }
    expect(window.sample({ now: 1900 + 45 * 16, prerequisitesReady: true, revision: 'a' })).toBe(
      true
    );
  });

  it('distinguishes a prepared slow world from strict readiness', () => {
    const window = new StartupFrameWindow();
    for (let i = 0; i < 45; i++) {
      expect(window.sample({ now: i * 60, prerequisitesReady: true, revision: 'a' })).toBe(false);
    }
    expect(window.sample({ now: 45 * 60, prerequisitesReady: true, revision: 'a' })).toBe(false);
    expect(window.prepared).toBe(true);
  });

  it('retains the original pacing gate despite a prepared jittery world', () => {
    const steady = new StartupFrameWindow();
    const jittery = new StartupFrameWindow();
    let jitterTime = 0;
    for (let i = 0; i < 45; i++) {
      steady.sample({ now: i * (1000 / 30), prerequisitesReady: true, revision: 'a' });
      jitterTime += i % 3 === 0 ? 60 : 16;
      expect(jittery.sample({ now: jitterTime, prerequisitesReady: true, revision: 'a' })).toBe(
        false
      );
    }
    expect(steady.sample({ now: 45 * (1000 / 30), prerequisitesReady: true, revision: 'a' })).toBe(
      true
    );
    expect(jittery.sample({ now: jitterTime + 16, prerequisitesReady: true, revision: 'a' })).toBe(
      false
    );
    expect(jittery.prepared).toBe(true);
  });

  it.each([999, 1000])('never calls a %sms frame smooth readiness', (interval) => {
    const window = new StartupFrameWindow();
    for (let i = 0; i <= 45; i++) {
      expect(window.sample({ now: i * interval, prerequisitesReady: true, revision: 'a' })).toBe(
        false
      );
    }
    expect(window.prepared).toBe(true);
  });

  it('requires 45 new strict intervals after a hitch above the original 75ms limit', () => {
    const window = new StartupFrameWindow();
    for (let i = 0; i <= 45; i++)
      window.sample({ now: i * 16, prerequisitesReady: true, revision: 'a' });
    const hitch = 45 * 16 + 90;
    expect(window.sample({ now: hitch, prerequisitesReady: true, revision: 'a' })).toBe(false);
    for (let i = 1; i < 45; i++)
      expect(window.sample({ now: hitch + i * 16, prerequisitesReady: true, revision: 'a' })).toBe(
        false
      );
    expect(window.sample({ now: hitch + 45 * 16, prerequisitesReady: true, revision: 'a' })).toBe(
      true
    );
  });
});

describe('explicit prepared-world admission', () => {
  it('rejects stale preparation and pending work, then opens without certifying strict readiness', async () => {
    const manager = THREE.DefaultLoadingManager;
    const original = {
      itemStart: manager.itemStart,
      itemEnd: manager.itemEnd,
      itemError: manager.itemError,
    };
    vi.resetModules();
    const startup = await import('../startupReadiness');
    delete document.documentElement.dataset.millosStartupReady;
    try {
      expect(startup.openPreparedStartup()).toBe(false);
      startup.markStartupPrepared(true, () => false);
      expect(startup.openPreparedStartup()).toBe(false);
      startup.markStartupPrepared(true, () => true);
      const finish = startup.beginStartupTask();
      expect(startup.getStartupSnapshot().prepared).toBe(false);
      expect(startup.openPreparedStartup()).toBe(false);
      finish();
      startup.markStartupPrepared(true, () => true);
      const revision = startup.getStartupSnapshot().revision;
      const notified = vi.fn();
      const unsubscribe = startup.subscribeStartup(notified);
      expect(startup.openPreparedStartup()).toBe(true);
      await Promise.resolve();
      expect(notified).toHaveBeenCalledTimes(1);
      unsubscribe();
      expect(startup.getStartupSnapshot()).toMatchObject({ opened: true, ready: false, revision });
      expect(document.documentElement.dataset.millosStartupReady).toBeUndefined();
      expect(document.documentElement.dataset.millosStartupDegraded).toBe('true');
      startup.markStartupReady();
      expect(startup.getStartupSnapshot()).toMatchObject({ opened: true, ready: true, revision });
    } finally {
      Object.assign(manager, original);
      delete document.documentElement.dataset.millosStartupReady;
      delete document.documentElement.dataset.millosStartupDegraded;
    }
  });

  it('does not admit a world with unresolved loading errors', async () => {
    const manager = THREE.DefaultLoadingManager;
    const original = {
      itemStart: manager.itemStart,
      itemEnd: manager.itemEnd,
      itemError: manager.itemError,
    };
    vi.resetModules();
    const startup = await import('../startupReadiness');
    try {
      startup.beginStartupTask()(true);
      startup.markStartupPrepared(true, () => true);
      expect(startup.openPreparedStartup()).toBe(false);
      expect(startup.getStartupSnapshot().opened).toBe(false);
    } finally {
      Object.assign(manager, original);
    }
  });
});

describe('startup work tracking', () => {
  it('tracks concurrent tasks and releases failed/cancelled work exactly once', () => {
    const initial = getStartupSnapshot();
    const first = beginStartupTask();
    const second = beginStartupTask();
    expect(getStartupSnapshot().pendingTasks).toBe(initial.pendingTasks + 2);
    first();
    first();
    expect(getStartupSnapshot().pendingTasks).toBe(initial.pendingTasks + 1);
    second(true);
    expect(getStartupSnapshot().pendingTasks).toBe(initial.pendingTasks);
    expect(getStartupSnapshot().errors).toBe(initial.errors + 1);
  });

  it('tracks Three asset starts, errors, and ends without replacing callbacks', () => {
    const initial = getStartupSnapshot();
    const manager = THREE.DefaultLoadingManager;
    manager.itemStart('startup-test-asset');
    expect(getStartupSnapshot().pendingAssets).toBe(initial.pendingAssets + 1);
    manager.itemError('startup-test-asset');
    manager.itemEnd('startup-test-asset');
    expect(getStartupSnapshot().pendingAssets).toBe(initial.pendingAssets);
    expect(getStartupSnapshot().loadedAssets).toBe(initial.loadedAssets + 1);
    expect(getStartupSnapshot().errors).toBe(initial.errors + 1);
  });
});
