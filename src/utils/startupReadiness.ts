import * as THREE from 'three';

export interface StartupSnapshot {
  pendingAssets: number;
  pendingTasks: number;
  loadedAssets: number;
  totalAssets: number;
  errors: number;
  revision: number;
  prepared: boolean;
  opened: boolean;
  ready: boolean;
}

let snapshot: StartupSnapshot = {
  pendingAssets: 0,
  pendingTasks: 0,
  loadedAssets: 0,
  totalAssets: 0,
  errors: 0,
  revision: 0,
  prepared: false,
  opened: false,
  ready: false,
};
const listeners = new Set<() => void>();
let notificationQueued = false;
let preparationGuard: (() => boolean) | null = null;

function update(changes: Partial<StartupSnapshot>, resourceChanged = true): void {
  if (resourceChanged) preparationGuard = null;
  snapshot = {
    ...snapshot,
    ...(resourceChanged ? { prepared: false } : {}),
    ...changes,
    revision: snapshot.revision + Number(resourceChanged),
  };
  // Asset/import starts can happen while React renders a suspending child.
  // Publish synchronously for the frame probe, notify React after that render.
  if (notificationQueued) return;
  notificationQueued = true;
  queueMicrotask(() => {
    notificationQueued = false;
    listeners.forEach((listener) => listener());
  });
}

export const getStartupSnapshot = (): StartupSnapshot => snapshot;
export const subscribeStartup = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Every started unit of work must release its token, including failed work. */
export function beginStartupTask(): (failed?: boolean) => void {
  update({ pendingTasks: snapshot.pendingTasks + 1 });
  let finished = false;
  return (failed = false) => {
    if (finished) return;
    finished = true;
    update({ pendingTasks: snapshot.pendingTasks - 1, errors: snapshot.errors + Number(failed) });
  };
}

/**
 * Observe the queue methods rather than callbacks: Drei installs its own
 * callbacks when its lazy bundle loads. Preserve all existing manager behavior.
 * This module loads with App, before the lazy world starts asset requests.
 */
const manager = THREE.DefaultLoadingManager;
const itemStart = manager.itemStart.bind(manager);
const itemEnd = manager.itemEnd.bind(manager);
const itemError = manager.itemError.bind(manager);
manager.itemStart = (url) => {
  update({ pendingAssets: snapshot.pendingAssets + 1, totalAssets: snapshot.totalAssets + 1 });
  itemStart(url);
};
manager.itemEnd = (url) => {
  update({
    pendingAssets: Math.max(0, snapshot.pendingAssets - 1),
    loadedAssets: snapshot.loadedAssets + 1,
  });
  itemEnd(url);
};
manager.itemError = (url) => {
  update({ errors: snapshot.errors + 1 });
  itemError(url);
};

export function markStartupReady(): void {
  if (snapshot.ready) return;
  update({ ready: true, prepared: true, opened: true }, false);
  document.documentElement.dataset.millosStartupReady = 'true';
  performance.mark('millos:startup-ready');
  window.dispatchEvent(new Event('millos:startup-ready'));
}

/** Preparation never grants access or changes the resource revision. */
export function markStartupPrepared(prepared: boolean, guard?: () => boolean): void {
  preparationGuard = prepared ? (guard ?? null) : null;
  if (snapshot.prepared !== prepared) update({ prepared }, false);
}

export function resetStartupPreparation(): void {
  update({ prepared: false });
}

/** Explicit access to a complete slow world never certifies smooth readiness. */
export function openPreparedStartup(): boolean {
  if (snapshot.opened) return true;
  if (
    !snapshot.prepared ||
    snapshot.pendingAssets !== 0 ||
    snapshot.pendingTasks !== 0 ||
    snapshot.errors !== 0 ||
    !preparationGuard?.()
  ) {
    markStartupPrepared(false);
    return false;
  }
  update({ opened: true }, false);
  document.documentElement.dataset.millosStartupDegraded = 'true';
  return true;
}

export interface StartupFrame {
  now: number;
  prerequisitesReady: boolean;
  revision: string;
}

/**
 * Inter-frame time includes the previous frame's render/compile/upload work.
 * Strict readiness retains the original settled 30 FPS window. A separate
 * prepared window permits explicit slow-device access only after actual work
 * is complete. Working if slow frames never set the strict readiness marker.
 */
export class StartupFrameWindow {
  private previousTime: number | null = null;
  private revision = '';
  private frames: number[] = [];

  get prepared(): boolean {
    return this.frames.length === 45;
  }

  sample({ now, prerequisitesReady, revision }: StartupFrame): boolean {
    const elapsed = this.previousTime === null ? 0 : now - this.previousTime;
    this.previousTime = now;
    if (!prerequisitesReady || revision !== this.revision || elapsed <= 0 || elapsed > 1000) {
      this.frames = [];
      this.revision = revision;
      return false;
    }
    this.frames.push(elapsed);
    if (this.frames.length > 45) this.frames.shift();
    if (this.frames.length < 45) return false;
    const ordered = [...this.frames].sort((a, b) => a - b);
    const mean = this.frames.reduce((sum, value) => sum + value, 0) / this.frames.length;
    return mean <= 34 && ordered[40] <= 34 && elapsed <= 50 && ordered[44] <= 75;
  }
}
