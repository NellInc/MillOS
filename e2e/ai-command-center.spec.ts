import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for the AI Command Center, accessed through the live ui-new shell
 * (GameInterface -> Dock -> ContextSidebar embeds <AICommandCenter embedded />).
 *
 * The legacy UIOverlay shell (and its ai-panel-toggle / ai-success-rate testids)
 * was removed; the canonical surface is the bottom Dock's "AI Command" button.
 * The embedded panel renders compact CPU / MEM / DEC metrics (integer percents),
 * tagged with data-testids: ai-cpu-value, ai-memory-value, ai-decisions-count,
 * and a container ai-command-center.
 */

/** Dismiss the first-run "AI Reflection" onboarding modal if present. Its blur
 *  backdrop intercepts pointer events, so the dock can't be clicked until closed. */
async function dismissOnboarding(page: Page) {
  // First-run onboarding is a QUEUE of narration steps: closing one surfaces
  // the next after a short delay, so keep dismissing until none remain.
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

/** Open the AI Command Center via the dock and wait for its metrics to mount. */
async function openAIPanel(page: Page) {
  await dismissOnboarding(page);
  await page.getByRole('button', { name: 'AI Command' }).click();
  await expect(page.getByTestId('ai-command-center')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('ai-cpu-value')).toBeVisible({ timeout: 5000 });
}

test.describe('AI Command Center (ui-new dock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the loading overlay (drei useProgress) to clear.
    await page
      .waitForSelector('text=INITIALIZING DIGITAL TWIN', { state: 'detached', timeout: 60000 })
      .catch(() => {});
    // Dock + status bar present once the shell has mounted. Headless
    // chromium renders WebGL in software: procedural texture generation
    // alone takes ~155s, and the shell mounts only after it completes.
    await page.getByRole('button', { name: 'Mill Overview' }).waitFor({ timeout: 240000 });
    await page.waitForTimeout(2000);
  });

  test('opens the AI Command Center panel from the dock', async ({ page }) => {
    await openAIPanel(page);
    await expect(page.getByTestId('ai-command-center')).toBeVisible();
  });

  test('displays a valid CPU percentage', async ({ page }) => {
    await openAIPanel(page);
    const cpu = page.getByTestId('ai-cpu-value');
    await expect(cpu).toBeVisible();
    await expect(cpu).toHaveText(/^\d+%$/);
  });

  test('displays a valid memory percentage', async ({ page }) => {
    await openAIPanel(page);
    const mem = page.getByTestId('ai-memory-value');
    await expect(mem).toBeVisible();
    await expect(mem).toHaveText(/^\d+%$/);
  });

  test('displays an integer decisions count', async ({ page }) => {
    await openAIPanel(page);
    const dec = page.getByTestId('ai-decisions-count');
    await expect(dec).toBeVisible();
    await expect(dec).toHaveText(/^\d+$/);
  });

  test('metrics format remains valid over time and decisions count never decreases', async ({
    page,
  }) => {
    await openAIPanel(page);
    const cpu = page.getByTestId('ai-cpu-value');
    const dec = page.getByTestId('ai-decisions-count');
    const initialDecisions = parseInt((await dec.textContent()) ?? '0', 10);

    // Metrics refresh on an interval; poll instead of a fixed sleep. The CPU
    // value must stay a valid integer percent throughout.
    await expect
      .poll(async () => (await cpu.textContent()) ?? '', { timeout: 10_000 })
      .toMatch(/^\d+%$/);

    // Decisions are a cumulative counter: monotonically non-decreasing.
    await expect
      .poll(async () => parseInt((await dec.textContent()) ?? '0', 10), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(initialDecisions);
    await expect(dec).toHaveText(/^\d+$/);
  });
});
