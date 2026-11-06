import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({
  getBuildCacheDiagnostics: vi.fn(),
  updateServiceWorker: vi.fn(),
  clearServiceWorkerCache: vi.fn(),
  activateWaitingServiceWorker: vi.fn(),
}));

vi.mock('../../../utils/serviceWorkerRegistration', () => ({
  ...sw,
  addConnectivityListener: (callback: (online: boolean) => void) => {
    const online = () => callback(true);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  },
}));

import { BuildCacheDiagnostics } from './BuildCacheDiagnostics';
import { setLocale } from '../../../i18n';

const diagnostics = {
  appBuildId: 'build-a',
  appCacheVersion: 'v1',
  online: true,
  supported: true,
  controlled: true,
  controllerScriptUrl: null,
  registrationScope: null,
  updateWaiting: false,
  installing: false,
  worker: null,
  cacheEntries: 0,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const renderIdle = async () => {
  render(<BuildCacheDiagnostics />);
  await act(async () => {});
  expect(screen.getByRole('status').textContent).toBe('Build and cache status is current.');
};

describe('Build and cache diagnostics', () => {
  beforeEach(() => {
    setLocale('en');
    sw.getBuildCacheDiagnostics.mockResolvedValue(diagnostics);
    sw.updateServiceWorker.mockResolvedValue(true);
    sw.clearServiceWorkerCache.mockResolvedValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Every action marks all four buttons busy. A natively disabled button that
  // holds focus loses it (the browser's focus fixup) and the page's rescue
  // parks it on a section that never hands it back, so a keyboard player who
  // pressed Refresh status had to Tab in again from the top of Settings. jsdom
  // has no focus fixup, so the native `disabled` attribute is the proxy.
  // Working if the pressed button keeps focus and reads unavailable while busy.
  it('keeps focus on the pressed button while the action runs', async () => {
    await renderIdle();
    const pending = deferred<typeof diagnostics>();
    sw.getBuildCacheDiagnostics.mockReturnValueOnce(pending.promise);
    const refresh = screen.getByRole('button', { name: 'Refresh status' });
    refresh.focus();
    fireEvent.click(refresh);
    expect(refresh).not.toBeDisabled();
    expect(refresh).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(refresh);
    // Busy means busy: a second press meanwhile starts nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Clear this cache' }));
    expect(sw.clearServiceWorkerCache).not.toHaveBeenCalled();
    await act(async () => pending.resolve(diagnostics));
    expect(refresh).toHaveAttribute('aria-disabled', 'false');
    expect(document.activeElement).toBe(refresh);
  });

  // The connectivity and service-worker events refresh the status too. One
  // arriving mid-check set the panel idle: every button came back while the
  // check still ran, and the status said 'current' instead of 'Looking'.
  // Working if an event during an action leaves the action's state alone.
  it('stays busy through a connectivity event that arrives during a check', async () => {
    await renderIdle();
    const check = deferred<boolean>();
    sw.updateServiceWorker.mockReturnValueOnce(check.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Check for update' }));
    expect(screen.getByRole('status').textContent).toBe('Looking for a newer build.');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status').textContent).toBe('Looking for a newer build.');
    expect(screen.getByRole('button', { name: 'Clear this cache' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await act(async () => check.resolve(true));
    expect(screen.getByRole('status').textContent).toBe('Up to date.');
    expect(screen.getByRole('button', { name: 'Clear this cache' })).toHaveAttribute(
      'aria-disabled',
      'false'
    );
  });

  // A check that found a newer build left it installing (registration.installing),
  // and the status said 'Up to date.' for as long as the install ran.
  // Working if a check reports the build it found.
  it('does not say up to date when the check found a newer build installing', async () => {
    await renderIdle();
    sw.getBuildCacheDiagnostics.mockResolvedValue({ ...diagnostics, installing: true });
    fireEvent.click(screen.getByRole('button', { name: 'Check for update' }));
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe(
      'A newer build was found and is installing.'
    );
  });

  // With a build waiting, the status line always read 'A newer build is
  // waiting.' once idle, so 'Cache cleared.' and 'The waiting build could not
  // be activated.' never showed: Activate update failed in silence.
  // Working if each action's own result is read while an update waits.
  it('reports clear and activate results while an update is waiting', async () => {
    sw.getBuildCacheDiagnostics.mockResolvedValue({ ...diagnostics, updateWaiting: true });
    sw.activateWaitingServiceWorker.mockResolvedValue(false);
    render(<BuildCacheDiagnostics />);
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('A newer build is waiting.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear this cache' }));
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe('Cache cleared.');
    fireEvent.click(screen.getByRole('button', { name: 'Activate update' }));
    await act(async () => {});
    expect(screen.getByRole('status').textContent).toBe(
      'The waiting build could not be activated.'
    );
    // A later status event (the install settling, connectivity) reads current again.
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status').textContent).toBe('A newer build is waiting.');
  });
});
