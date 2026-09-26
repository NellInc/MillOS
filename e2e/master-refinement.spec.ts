import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import type { TestInfo } from '@playwright/test';

interface RuntimeDiagnostics {
  consoleErrors: string[];
  pageErrors: string[];
  requestFailures: string[];
}

interface E2EInteraction {
  at: number;
  kind: 'click' | 'mode';
  target?: string;
  trusted?: boolean;
  mode?: string | null;
  sidebarVisible?: string | null;
}

interface E2EDownload {
  filename: string;
  href: string;
}

async function expectNoWcagViolations(page: Page, testInfo: TestInfo, state: string) {
  // A newly visible sidebar is still fading in. Sample its settled colours,
  // rather than measuring white text halfway through the entrance animation.
  await expect
    .poll(() =>
      page
        .locator('aside:visible')
        .evaluateAll((panels) =>
          panels.every((panel) => Number(getComputedStyle(panel).opacity) >= 0.9999)
        )
    )
    .toBe(true);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      summary: node.failureSummary,
    })),
  }));

  if (violations.length > 0) {
    await testInfo.attach(`axe-${state}`, {
      body: Buffer.from(JSON.stringify(violations, null, 2)),
      contentType: 'application/json',
    });
  }
  expect(violations, `${state} has WCAG A or AA violations`).toEqual([]);
}

function collectRuntimeDiagnostics(page: Page): RuntimeDiagnostics {
  const diagnostics: RuntimeDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown failure';
    if (reason === 'net::ERR_ABORTED') return;
    diagnostics.requestFailures.push(`${request.method()} ${request.url()}: ${reason}`);
  });

  return diagnostics;
}

async function expectClientDownload(
  page: Page,
  action: () => Promise<void>,
  filenamePattern: RegExp
) {
  const countBefore = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __millosE2EDownloads?: E2EDownload[];
        }
      ).__millosE2EDownloads?.length ?? 0
  );

  await action();

  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __millosE2EDownloads?: E2EDownload[];
            }
          ).__millosE2EDownloads?.length ?? 0
      )
    )
    .toBeGreaterThan(countBefore);

  const download = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __millosE2EDownloads?: E2EDownload[];
        }
      ).__millosE2EDownloads?.at(-1) ?? null
  );
  expect(download?.filename).toMatch(filenamePattern);
  expect(download?.href).toMatch(/^blob:/);
}

async function activateRadioByLabel(page: Page, label: string) {
  await page.evaluate((accessibleLabel) => {
    const radio = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (control) => control.getAttribute('aria-label') === accessibleLabel
    );
    if (!radio) throw new Error(`Radio control not found: ${accessibleLabel}`);
    radio.click();
  }, label);
}

async function waitForCoreExperience(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({ state: { hasSeenIntro: true }, version: 1 })
    );
    localStorage.setItem('millos-has-played', 'true');
    sessionStorage.clear();

    const testWindow = window as typeof window & {
      __millosE2EInteractions?: E2EInteraction[];
      __millosE2EDownloads?: E2EDownload[];
    };
    const interactions: E2EInteraction[] = [];
    testWindow.__millosE2EInteractions = interactions;
    testWindow.__millosE2EDownloads = [];

    const nativeAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function millosE2EAnchorClick() {
      if (this.download) {
        testWindow.__millosE2EDownloads?.push({
          filename: this.download,
          href: this.href,
        });
      }
      nativeAnchorClick.call(this);
    };

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const control = target?.closest<HTMLElement>(
          'button, [role="button"], [role="menuitem"], [data-dock-mode]'
        );
        interactions.push({
          at: performance.now(),
          kind: 'click',
          target:
            control?.dataset.dockMode ??
            control?.getAttribute('aria-label') ??
            control?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ??
            target?.tagName ??
            'unknown',
          trusted: event.isTrusted,
        });
      },
      true
    );

    const modeObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.type !== 'attributes' ||
          !(record.target instanceof HTMLElement) ||
          record.target.dataset.testid !== 'game-interface'
        ) {
          continue;
        }
        interactions.push({
          at: performance.now(),
          kind: 'mode',
          mode: record.target.dataset.activeMode ?? null,
          sidebarVisible: record.target.dataset.sidebarVisible ?? null,
        });
      }
    });
    modeObserver.observe(document, {
      attributes: true,
      attributeFilter: ['data-active-mode', 'data-sidebar-visible'],
      subtree: true,
    });
  });
  await page.goto('/');
  await page
    .waitForSelector('text=INITIALIZING DIGITAL TWIN', { state: 'detached', timeout: 60_000 })
    .catch(() => {});
  await page.getByRole('button', { name: 'Mill Overview' }).waitFor({ timeout: 240_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.sceneReady === 'true',
    undefined,
    { timeout: 240_000 }
  );
  // The core scene intentionally becomes interactive before the deferred
  // authored world finishes mounting. Starting the onboarding click sequence
  // during that handover lets the loading surface briefly reclaim the pointer
  // between steps, which made the final action intermittently unactionable.
  await page.waitForFunction(
    () => document.documentElement.dataset.millosWorldReady === 'true',
    undefined,
    { timeout: 240_000 }
  );
}

test.describe('MillOS master refinement runtime', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
    const interactions = await page
      .evaluate(
        () =>
          (
            window as typeof window & {
              __millosE2EInteractions?: E2EInteraction[];
            }
          ).__millosE2EInteractions ?? []
      )
      .catch(() => []);
    await testInfo.attach('workspace-interactions', {
      body: Buffer.from(JSON.stringify(interactions, null, 2)),
      contentType: 'application/json',
    });
  });

  test('operates the core scene, SCADA, safety, settings, access, and responsive surfaces', async ({
    page,
  }, testInfo) => {
    test.setTimeout(600_000);
    const diagnostics = collectRuntimeDiagnostics(page);
    await waitForCoreExperience(page);

    await expect(page.getByRole('banner', { name: 'System status bar' })).toBeVisible();
    const sceneCanvas = page.locator('canvas').first();
    await expect(sceneCanvas).toBeVisible();
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('MillOS scene canvas is unavailable');
      }
      canvas.dataset.e2eStableCanvas = 'true';
    });

    await expect(page.getByRole('region', { name: /Getting started, step/ })).toHaveCount(0);
    await expectNoWcagViolations(page, testInfo, 'default-desktop');

    const overviewDockButton = page.getByRole('button', { name: 'Mill Overview', exact: true });
    await overviewDockButton.click();
    const overviewSidebar = page.getByRole('complementary', {
      name: 'Mill Overview sidebar panel',
    });
    await expect(overviewSidebar).toBeVisible();
    await expect(
      overviewSidebar.getByRole('heading', { name: 'Batch genealogy and quality' })
    ).toBeVisible();
    const versionSelector = overviewSidebar.getByRole('combobox', {
      name: 'Select MillOS version',
    });
    await expect(versionSelector).toHaveValue('v0.40');
    await expect(versionSelector.locator('option')).toHaveText([
      '0.40 (current)',
      '0.30 (historical)',
      '0.20 (historical)',
      '0.10 (historical)',
    ]);
    await expect(
      overviewSidebar.getByRole('alert', { name: 'Mill Overview unavailable' })
    ).toHaveCount(0);
    await expectNoWcagViolations(page, testInfo, 'mill-overview');
    await overviewSidebar.getByRole('button', { name: 'Close sidebar panel' }).click();
    await expect(overviewSidebar).toBeHidden();
    await expect(overviewDockButton).toBeFocused();

    const productionButton = page.getByRole('button', { name: 'Production', exact: true });
    await productionButton.click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const runtime = (
            window as typeof window & {
              __MILLOS_RUNTIME__?: { snapshot(): { camera: { position: number[]; fov: number } } };
            }
          ).__MILLOS_RUNTIME__;
          const camera = runtime?.snapshot().camera;
          return camera ? Math.abs(camera.position[1] - 4.5) + Math.abs(camera.fov - 50) : Infinity;
        })
      )
      .toBeLessThan(0.1);
    await page.getByRole('button', { name: 'Close sidebar panel', exact: true }).click();

    const aiDockButton = page.getByRole('button', { name: 'More workspaces and view controls' });
    await aiDockButton.click();
    await page.getByRole('menuitem', { name: 'AI Partner I', exact: true }).click();
    const aiSidebar = page.getByRole('complementary', { name: 'AI Partner sidebar panel' });
    await expect(aiSidebar).toBeVisible();
    await expect(aiSidebar.getByTestId('ai-command-center')).toBeVisible();
    await expect(aiSidebar.getByTestId('ai-cpu-value')).toHaveText(/^\d+%$/);
    await expect(aiSidebar.getByTestId('ai-memory-value')).toHaveText(/^\d+%$/);
    await expect(aiSidebar.getByTestId('ai-decisions-count')).toHaveText(/^\d+$/);
    await aiSidebar.getByRole('button', { name: 'Close sidebar panel' }).click();
    await expect(aiSidebar).toBeHidden();
    await expect(aiDockButton).toBeFocused();

    const scadaDockButton = page.getByRole('button', { name: 'Simulated SCADA', exact: true });
    await scadaDockButton.click();
    const scadaSidebar = page.getByRole('complementary', {
      name: 'Simulated SCADA sidebar panel',
    });
    await expect(scadaSidebar).toBeVisible();
    await expect(scadaSidebar.getByText('SCADA Simulation')).toBeVisible();
    await scadaSidebar.getByRole('tab', { name: /Alarms/ }).click();
    await expect(scadaSidebar.getByRole('tabpanel', { name: /Alarms/ })).toBeVisible();
    await scadaSidebar.getByRole('tab', { name: /Tags/ }).click();

    const workspaceOpener = scadaSidebar.getByRole('button', {
      name: 'Open full SCADA workspace',
    });
    await workspaceOpener.click();
    const workspace = page.getByRole('dialog', { name: 'Full simulated SCADA workspace' });
    await expect(workspace).toBeVisible();
    const workspaceBox = await workspace.boundingBox();
    expect(workspaceBox?.width ?? 0).toBeGreaterThan(1100);
    await expect(workspace.getByRole('button', { name: 'Close SCADA panel' })).toBeFocused();

    await workspace.getByRole('tab', { name: 'Tags', exact: true }).click();
    await expect(workspace.getByLabel('Search tags')).toBeVisible();

    await workspace.getByRole('tab', { name: 'Trends', exact: true }).click();
    const trendOptions = workspace.getByTestId('scada-trend-tag-option');
    await expect.poll(() => trendOptions.count()).toBeGreaterThanOrEqual(6);
    for (let index = 0; index < 6; index += 1) {
      await trendOptions.nth(index).click();
    }
    await expect(workspace.getByText('6/6 tags selected')).toBeVisible();
    await workspace.getByRole('button', { name: 'table', exact: true }).click();
    await expect(workspace.getByRole('table')).toBeVisible();

    await expectClientDownload(
      page,
      () => workspace.getByRole('button', { name: 'CSV', exact: true }).click(),
      /\.csv$/
    );

    await workspace.getByRole('tab', { name: 'Simulation Lab', exact: true }).click();
    await workspace.getByRole('button', { name: /spike/i }).click();
    await expect(workspace.getByText('Active Faults')).toBeVisible();

    await workspace.getByRole('tab', { name: /Alarms/ }).click();
    await workspace.getByLabel('Control identity').fill('Runtime verification controller');
    await workspace
      .getByLabel('Control note or disposition reason')
      .fill('Deterministic browser verification');
    const acknowledgeAll = workspace.getByRole('button', { name: /Acknowledge All/ });
    await expect(acknowledgeAll).toBeVisible({ timeout: 15_000 });
    await acknowledgeAll.click();
    await expect(acknowledgeAll).toBeHidden();

    await workspace.getByRole('tab', { name: 'Events', exact: true }).click();
    await workspace.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(workspace.getByRole('list', { name: 'SCADA alarm event timeline' })).toBeVisible({
      timeout: 15_000,
    });

    await workspace.getByRole('tab', { name: 'Simulation Lab', exact: true }).click();
    await workspace.getByRole('button', { name: 'Clear All Faults' }).click();
    await expect(workspace.getByText('Active Faults')).toBeHidden();

    await workspace.getByRole('tab', { name: 'Connections', exact: true }).click();
    await expect(workspace.getByText('Current mode:')).toBeVisible();
    await expectNoWcagViolations(page, testInfo, 'scada-workspace');
    await page.screenshot({
      path: testInfo.outputPath('scada-workspace.png'),
      animations: 'disabled',
    });

    await workspace.getByRole('button', { name: 'Close SCADA panel' }).click();
    await expect(workspace).toBeHidden();
    await expect(workspaceOpener).toBeFocused();
    await scadaSidebar.getByRole('button', { name: 'Close sidebar panel' }).click();
    await expect(scadaSidebar).toBeHidden();
    await expect(scadaDockButton).toBeFocused();

    const gameInterface = page.getByTestId('game-interface');
    const safetyDockButton = page.getByRole('button', {
      name: 'Safety & Emergency',
      exact: true,
    });
    const safetySidebar = page.getByRole('complementary', {
      name: 'Safety & Emergency sidebar panel',
    });
    await test.step('keep the Safety workspace uncrewed and accessible', async () => {
      await safetyDockButton.click();
      await expect(gameInterface).toHaveAttribute('data-active-mode', 'safety');
      await expect(safetySidebar).toBeVisible();
      await expect(safetySidebar.getByRole('button', { name: 'START DRILL' })).toBeVisible();
      await expect(safetySidebar.getByRole('button', { name: 'END DRILL' })).toHaveCount(0);
      await expect(page.getByRole('alert', { name: 'Simulated fire drill' })).toHaveCount(0);
      await expect(page.getByLabel('AI reflection', { exact: true })).toHaveCount(0);
      await expectNoWcagViolations(page, testInfo, 'safety-uncrewed');
      await page.screenshot({
        path: testInfo.outputPath('safety-uncrewed.png'),
        animations: 'disabled',
      });
      await expect(gameInterface).toHaveAttribute('data-active-mode', 'safety');
      await expect(safetyDockButton).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('run the automated service-egress verification to completion', async () => {
      await safetySidebar.getByRole('button', { name: 'START DRILL' }).click();
      const drillBanner = page.getByRole('alert', { name: 'Simulated fire drill' });
      await expect(drillBanner).toBeVisible();
      await expect(safetySidebar.getByRole('button', { name: 'END DRILL' })).toBeVisible();
      await expect(
        safetySidebar.getByRole('group', { name: 'Emergency egress verification drill' })
      ).toContainText('zones verified');
      // Four zones at 4 s each, followed by the sequencer's next tick and 5 s hold.
      await expect(
        safetySidebar.getByRole('group', { name: 'Emergency egress verification drill' })
      ).toContainText('All zones verified', { timeout: 22_000 });
      await expect(drillBanner).toBeHidden({ timeout: 12_000 });
      await expect(safetySidebar.getByRole('button', { name: 'START DRILL' })).toBeVisible();
      await expect(safetySidebar.getByRole('button', { name: 'END DRILL' })).toHaveCount(0);
    });

    await test.step('trigger and clear the facility emergency interlock', async () => {
      await safetySidebar.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }).click();
      const emergencyDialog = page.getByRole('dialog', {
        name: 'Trigger facility emergency stop?',
      });
      await expect(emergencyDialog).toBeVisible();
      await emergencyDialog.getByRole('button', { name: 'Trigger emergency stop' }).click();
      await expect(safetySidebar.getByRole('button', { name: 'CLEAR EMERGENCY' })).toBeVisible();
      const emergencyBanner = page.getByRole('alert', {
        name: 'Facility emergency stop',
        exact: true,
      });
      await expect(emergencyBanner).toBeVisible();
      await safetySidebar.getByRole('button', { name: 'CLEAR EMERGENCY' }).click();
      await expect(
        safetySidebar.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' })
      ).toBeVisible();
      await expect(emergencyBanner).toBeHidden();
      await expect(gameInterface).toHaveAttribute('data-active-mode', 'safety');
      await safetySidebar.getByRole('button', { name: 'Close sidebar panel' }).click();
      await expect(safetyDockButton).toBeFocused();
    });

    const settingsDockButton = page.getByRole('button', { name: 'Settings', exact: true });
    await settingsDockButton.click();
    const settingsSidebar = page.getByRole('complementary', {
      name: 'System Settings sidebar panel',
    });
    await expect(settingsSidebar).toBeVisible();
    await expect(gameInterface).toHaveAttribute('data-active-mode', 'settings');
    await expect(page.getByLabel('AI reflection', { exact: true })).toHaveCount(0);

    const muteButton = settingsSidebar.getByRole('button', { name: /Mute audio|Unmute audio/ });
    const muteWasPressed = await muteButton.getAttribute('aria-pressed');
    await muteButton.click();
    await expect(muteButton).not.toHaveAttribute('aria-pressed', muteWasPressed ?? 'false');
    await muteButton.click();

    const captionsButton = settingsSidebar.getByRole('button', {
      name: 'PA captions',
      exact: true,
    });
    const captionsWerePressed = await captionsButton.getAttribute('aria-pressed');
    await captionsButton.click();
    await expect(captionsButton).not.toHaveAttribute(
      'aria-pressed',
      captionsWerePressed ?? 'false'
    );
    await captionsButton.click();

    await settingsSidebar.getByRole('radio', { name: 'Off', exact: true }).click();
    await expect(settingsSidebar.getByRole('radio', { name: 'Off', exact: true })).toBeChecked();
    await settingsSidebar.getByRole('radio', { name: 'Focused', exact: true }).click();
    await expect(
      settingsSidebar.getByRole('radio', { name: 'Focused', exact: true })
    ).toBeChecked();

    // Switching render presets remounts expensive scene resources. Dispatch the
    // activation directly, then prove the resulting accessible state and canvas
    // continuity instead of making Playwright retain a handle through the remount.
    await activateRadioByLabel(page, 'low quality');
    await expect(settingsSidebar.getByRole('radio', { name: 'low quality' })).toBeChecked();
    await expect(page.locator('canvas[data-e2e-stable-canvas="true"]')).toHaveCount(1);
    await activateRadioByLabel(page, 'medium quality');
    await expect(settingsSidebar.getByRole('radio', { name: 'medium quality' })).toBeChecked();
    await expect(page.locator('canvas[data-e2e-stable-canvas="true"]')).toHaveCount(1);

    const uiScale = settingsSidebar.locator('#ui-scale-slider');
    await uiScale.fill('1.25');
    await expect(settingsSidebar.locator('output[for="ui-scale-slider"]')).toHaveText('125%');
    await expect(settingsSidebar.getByText('Build and cache', { exact: true })).toBeVisible();
    await expect(settingsSidebar.getByText('Application build', { exact: true })).toBeVisible();
    await expect(settingsSidebar.getByText('Connection', { exact: true })).toBeVisible();
    await expectNoWcagViolations(page, testInfo, 'settings-desktop');

    await expectClientDownload(
      page,
      () => settingsSidebar.getByRole('button', { name: 'Export JSON', exact: true }).click(),
      /^millos-diagnostic-.*\.json$/
    );
    await page.screenshot({
      path: testInfo.outputPath('settings-desktop.png'),
      animations: 'disabled',
    });

    await page.keyboard.press('Escape');
    await expect(settingsSidebar).toBeHidden();
    await expect(settingsDockButton).toBeFocused();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedTransitionDuration = await settingsDockButton.evaluate((button) =>
      Number.parseFloat(getComputedStyle(button).transitionDuration)
    );
    expect(reducedTransitionDuration).toBeLessThanOrEqual(0.001);

    await page.setViewportSize({ width: 390, height: 844 });
    const dock = page.getByRole('navigation', { name: 'Main Navigation' });
    await expect(dock).toBeVisible();
    // Viewport emulation can return before React commits the compact dock.
    // Keep the actual bounds assertion, retrying through that resize commit.
    await expect(async () => {
      const dockBox = await dock.boundingBox();
      expect(dockBox).not.toBeNull();
      expect((dockBox?.x ?? 0) + (dockBox?.width ?? 0)).toBeLessThanOrEqual(390.5);
      expect(dockBox?.x ?? 0).toBeGreaterThanOrEqual(-0.5);
    }).toPass({ timeout: 15_000 });

    const minimumDockTarget = await dock.locator('button:visible').evaluateAll((buttons) =>
      Math.min(
        ...buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return Math.min(rect.width, rect.height);
        })
      )
    );
    expect(minimumDockTarget).toBeGreaterThanOrEqual(43.5);

    const moreDockButton = page.getByRole('button', {
      name: 'More workspaces and view controls',
    });
    await moreDockButton.click();
    await expect(page.getByRole('menuitem', { name: 'Workforce', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('menuitem', { name: 'Bilateral Autonomy System', exact: true })
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(moreDockButton).toBeFocused();

    await moreDockButton.click();
    await page.getByRole('menuitem', { name: 'Bilateral Autonomy System', exact: true }).click();
    const mobileAutonomy = page.getByRole('dialog', {
      name: 'Bilateral Autonomy mobile panel',
    });
    await expect(mobileAutonomy).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mobileAutonomy).toBeHidden();
    await expect(moreDockButton).toBeFocused();

    await settingsDockButton.click();
    const mobileSettings = page.getByRole('dialog', { name: 'Settings mobile panel' });
    await expect(mobileSettings).toBeVisible();
    await expect(gameInterface).toHaveAttribute('inert', '');
    await expect(gameInterface).toHaveAttribute('aria-hidden', 'true');
    const music = page.locator('section[aria-label="Music player"]');
    await expect(music).toBeHidden();
    await page.keyboard.press('Shift+Tab');
    expect(await mobileSettings.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(
      true
    );
    await expectNoWcagViolations(page, testInfo, 'settings-mobile');
    await page.screenshot({
      path: testInfo.outputPath('settings-mobile.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(mobileSettings).toBeHidden();
    await expect(settingsDockButton).toBeFocused();
    await expect(music).toBeVisible();

    expect(diagnostics.consoleErrors, diagnostics.consoleErrors.join('\n')).toEqual([]);
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
    expect(diagnostics.requestFailures, diagnostics.requestFailures.join('\n')).toEqual([]);
  });
});
