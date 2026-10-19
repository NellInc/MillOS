import { expect, test } from '@playwright/test';
import { expectNoWcagViolations } from './support/wcag';

/**
 * The loading cover is up for seconds on every visit, yet the rest of the
 * suite only scans after it has gone. Holding one counted scene asset stops
 * the cover in a stable state, so it can be scanned before and after its
 * slow-load recovery controls appear, and readiness must still arrive once
 * the asset is released.
 *
 * The worker body is a THREE.DefaultLoadingManager asset (startupReadiness.ts
 * counts it), not a lazy chunk, so holding it trips no import timeout. It is
 * requested at App load by utils/startupAssetPreload.ts.
 */
const HELD_ASSET = /\/models\/worker\/worker-masculine\.glb(?:\?|$)/;
const COVER = { name: 'Loading MillOS' } as const;

// page.route never sees a request a service worker answers.
test.use({ serviceWorkers: 'block' });

test('the loading cover passes WCAG A/AA before and after its recovery controls', async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);

  // Every value the progress bar shows, from its first render.
  await page.addInitScript(() => {
    const seen: number[] = [];
    (window as typeof window & { __millosE2EProgress?: number[] }).__millosE2EProgress = seen;
    const record = (bar: Element | null) => {
      const value = Number(bar?.getAttribute('aria-valuenow'));
      if (bar && Number.isFinite(value) && seen.at(-1) !== value) seen.push(value);
    };
    new MutationObserver((records) => {
      for (const entry of records) {
        if (entry.target instanceof Element && entry.target.matches('[role="progressbar"]'))
          record(entry.target);
        for (const node of entry.addedNodes)
          if (node instanceof Element) record(node.querySelector('[role="progressbar"]'));
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    });
  });

  let releaseHeld: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (releaseHeld = resolve));
  let heldUrl: string | null = null;
  await page.route(HELD_ASSET, async (route) => {
    heldUrl ??= route.request().url();
    await released;
    await route.continue().catch(() => undefined);
  });

  try {
    await page.goto('/');
    const cover = page.getByRole('dialog', COVER);
    await expect(cover).toBeVisible({ timeout: 240_000 });
    await expect.poll(() => heldUrl, { timeout: 240_000 }).not.toBeNull();

    // State A: held, before the 30 s recovery timer. No controls yet.
    await page.waitForTimeout(2_000);
    await expect(cover).toBeVisible();
    await expect(cover.getByRole('progressbar', COVER)).toHaveAttribute(
      'aria-valuetext',
      'Preparing the complete scene'
    );
    await expect(cover.getByRole('button')).toHaveCount(0);
    await expectNoWcagViolations(page, testInfo, 'loading-cover-held');

    // State B: the slow-load recovery controls, with the sentence that says why.
    await expect(cover.getByRole('button', { name: 'Use low graphics' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      cover.getByText(
        'Loading is taking longer than usual. Low graphics can help on a slower device.'
      )
    ).toBeVisible();
    await expectNoWcagViolations(page, testInfo, 'loading-cover-recovery');
  } finally {
    releaseHeld();
  }

  // Released: strict readiness still arrives and the cover leaves.
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.millosStartupReady === 'true' &&
      document.querySelector('[aria-label="Loading MillOS"]') === null,
    undefined,
    { timeout: 240_000 }
  );

  const progress = await page.evaluate(
    () => (window as typeof window & { __millosE2EProgress?: number[] }).__millosE2EProgress ?? []
  );
  expect(progress.length).toBeGreaterThan(1);
  for (let i = 1; i < progress.length; i++)
    expect(progress[i], `progress ${progress.join(' > ')}`).toBeGreaterThanOrEqual(progress[i - 1]);
  expect(progress.at(-1)).toBe(100);
});
