import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the AI Partner workspace, accessed through the live ui-new shell
 * (GameInterface -> Dock -> ContextSidebar embeds <AICommandCenter embedded />).
 *
 * The legacy UIOverlay shell (and its ai-panel-toggle / ai-success-rate testids)
 * was removed; the canonical surface is the Dock's More menu, then "AI Partner".
 * The embedded panel renders a compact DEC count (data-testid ai-decisions-count)
 * inside a container ai-command-center. It has no CPU or MEM tile: the rules
 * layer has no such reading (review 10, F3).
 */

/**
 * Dismiss the current first-run tour. The AI reflection cards an older build
 * queued are cut (D14), so there is nothing else to dismiss.
 */
async function dismissOnboarding(page: Page) {
  const currentTour = page.getByRole('region', { name: /Getting started, step \d+ of \d+/ });
  if (await currentTour.isVisible().catch(() => false)) {
    await currentTour.getByRole('button', { name: 'Skip tour' }).click();
    await expect(currentTour).toBeHidden();
  }
}

/** Open the AI Partner workspace via the dock and wait for its decision count to mount. */
async function openAIPanel(page: Page) {
  await dismissOnboarding(page);
  await page.getByRole('button', { name: 'More workspaces and view controls' }).click();
  await page.getByRole('menuitem', { name: 'AI Partner I', exact: true }).click();
  await expect(page.getByTestId('ai-command-center')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('ai-decisions-count')).toBeVisible({ timeout: 5000 });
}

test.describe('AI Partner workspace (ui-new dock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => document.documentElement.dataset.sceneReady === 'true',
      undefined,
      { timeout: 240_000 }
    );
    await page
      .getByRole('progressbar', { name: 'Loading MillOS' })
      .waitFor({ state: 'detached', timeout: 60_000 });
    // Dock + status bar present once the staged core scene has mounted.
    // CI can still use software WebGL, so retain a generous cross-platform
    // timeout without forcing every local run to wait.
    await page.getByRole('button', { name: 'Mill Overview' }).waitFor({ timeout: 240000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.millosWorldReady === 'true',
      undefined,
      { timeout: 240_000 }
    );
  });

  test('opens the AI Partner and keeps its decision count valid', async ({ page }) => {
    await openAIPanel(page);
    await expect(page.getByTestId('ai-command-center')).toBeVisible();
    const dec = page.getByTestId('ai-decisions-count');

    // The CPU and MEM tiles were removed; nothing may bring them back.
    await expect(page.getByTestId('ai-cpu-value')).toHaveCount(0);
    await expect(page.getByTestId('ai-memory-value')).toHaveCount(0);
    await expect(dec).toBeVisible();
    await expect(dec).toHaveText(/^\d+$/);

    const initialDecisions = parseInt((await dec.textContent()) ?? '0', 10);

    await expect
      .poll(async () => parseInt((await dec.textContent()) ?? '0', 10), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(initialDecisions);
    await expect(dec).toHaveText(/^\d+$/);
  });
});
