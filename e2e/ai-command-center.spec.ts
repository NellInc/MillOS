import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the AI Partner workspace, accessed through the live ui-new shell
 * (GameInterface -> Dock -> ContextSidebar embeds <AICommandCenter embedded />).
 *
 * The legacy UIOverlay shell (and its ai-panel-toggle / ai-success-rate testids)
 * was removed; the canonical surface is the Dock's More menu, then "AI Partner".
 * The embedded panel renders compact CPU / MEM / DEC metrics (integer percents),
 * tagged with data-testids: ai-cpu-value, ai-memory-value, ai-decisions-count,
 * and a container ai-command-center.
 */

/** Dismiss the current first-run tour, with a legacy reflection fallback. */
async function dismissOnboarding(page: Page) {
  const currentTour = page.getByRole('region', { name: /Getting started, step \d+ of \d+/ });
  if (await currentTour.isVisible().catch(() => false)) {
    await currentTour.getByRole('button', { name: 'Skip tour' }).click();
    await expect(currentTour).toBeHidden();
    return;
  }

  // Older builds queued reflection cards, so retain a bounded compatibility path.
  for (let i = 0; i < 5; i++) {
    const reflection = page.getByText('AI Reflection', { exact: false });
    if (!(await reflection.isVisible().catch(() => false))) break;
    // The modal close button is the icon button in its header.
    await page
      .getByRole('button', { name: /close/i })
      .first()
      .click({ timeout: 2000 })
      .catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(1000);
  }
}

/** Open the AI Partner workspace via the dock and wait for its metrics to mount. */
async function openAIPanel(page: Page) {
  await dismissOnboarding(page);
  await page.getByRole('button', { name: 'More workspaces and view controls' }).click();
  await page.getByRole('menuitem', { name: 'AI Partner I', exact: true }).click();
  await expect(page.getByTestId('ai-command-center')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('ai-cpu-value')).toBeVisible({ timeout: 5000 });
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

  test('opens the AI Partner and keeps all compact metrics valid', async ({ page }) => {
    await openAIPanel(page);
    await expect(page.getByTestId('ai-command-center')).toBeVisible();
    const cpu = page.getByTestId('ai-cpu-value');
    const mem = page.getByTestId('ai-memory-value');
    const dec = page.getByTestId('ai-decisions-count');

    await expect(cpu).toBeVisible();
    await expect(cpu).toHaveText(/^\d+%$/);
    await expect(mem).toBeVisible();
    await expect(mem).toHaveText(/^\d+%$/);
    await expect(dec).toBeVisible();
    await expect(dec).toHaveText(/^\d+$/);

    const initialDecisions = parseInt((await dec.textContent()) ?? '0', 10);

    await expect
      .poll(async () => (await cpu.textContent()) ?? '', { timeout: 10_000 })
      .toMatch(/^\d+%$/);
    await expect
      .poll(async () => parseInt((await dec.textContent()) ?? '0', 10), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(initialDecisions);
    await expect(dec).toHaveText(/^\d+$/);
  });
});
