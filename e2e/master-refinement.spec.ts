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

async function expectNoWcagViolations(page: Page, testInfo: TestInfo, state: string) {
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

async function waitForCoreExperience(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('millos-ui');
    sessionStorage.clear();

    const testWindow = window as typeof window & {
      __millosE2EInteractions?: E2EInteraction[];
    };
    const interactions: E2EInteraction[] = [];
    testWindow.__millosE2EInteractions = interactions;

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
    const diagnostics = collectRuntimeDiagnostics(page);
    await waitForCoreExperience(page);

    await expect(page.getByRole('banner', { name: 'System status bar' })).toBeVisible();
    const sceneCanvas = page.locator('canvas').first();
    await expect(sceneCanvas).toBeVisible();
    await sceneCanvas.evaluate((canvas) => {
      canvas.dataset.e2eStableCanvas = 'true';
    });

    const introStepOne = page.getByRole('region', { name: 'Getting started, step 1 of 3' });
    await expect(introStepOne).toBeVisible({ timeout: 15_000 });
    await introStepOne.getByRole('button', { name: 'Next' }).click();
    const introStepTwo = page.getByRole('region', { name: 'Getting started, step 2 of 3' });
    await expect(introStepTwo).toBeVisible();
    await introStepTwo.getByRole('button', { name: 'Back' }).click();
    await expect(introStepOne).toBeVisible();
    await introStepOne.getByRole('button', { name: 'Next' }).click();
    await introStepTwo.getByRole('button', { name: 'Next' }).click();
    const introStepThree = page.getByRole('region', { name: 'Getting started, step 3 of 3' });
    await expect(introStepThree).toBeVisible();
    const startOperating = introStepThree.getByRole('button', { name: 'Start operating' });
    await startOperating.focus();
    await expect(startOperating).toBeFocused();
    await startOperating.press('Enter');
    await expect(introStepThree).toBeHidden();
    await expectNoWcagViolations(page, testInfo, 'default-desktop');

    const welcomeReflection = page.getByRole('complementary', { name: 'AI reflection' });
    await expect(welcomeReflection).toBeVisible();
    await welcomeReflection.getByRole('button', { name: 'Close' }).click();
    await expect(welcomeReflection).toBeHidden();

    const aiDockButton = page.getByRole('button', { name: 'AI Partner', exact: true });
    await aiDockButton.focus();
    await expect(aiDockButton).toBeFocused();
    await aiDockButton.press('Enter');
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

    const trendDownloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'CSV', exact: true }).click();
    const trendDownload = await trendDownloadPromise;
    expect(trendDownload.suggestedFilename()).toMatch(/\.csv$/);

    await workspace.getByRole('tab', { name: 'Simulation Lab', exact: true }).click();
    await workspace.getByRole('button', { name: /spike/i }).click();
    await expect(workspace.getByText('Active Faults')).toBeVisible();

    await workspace.getByRole('tab', { name: /Alarms/ }).click();
    await workspace.getByLabel('Simulated operator').fill('Runtime verifier');
    await workspace
      .getByLabel('Operator note or disposition reason')
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
    await test.step('complete the simulated drill without leaving Safety', async () => {
      await safetyDockButton.click();
      await expect(gameInterface).toHaveAttribute('data-active-mode', 'safety');
      await expect(safetySidebar).toBeVisible();
      await safetySidebar.getByRole('button', { name: 'START DRILL' }).click();
      await expect(safetySidebar.getByRole('button', { name: 'END DRILL' })).toBeVisible();
      const drillBanner = page.getByRole('alert', {
        name: 'Simulated fire drill',
        exact: true,
      });
      await expect(drillBanner).toBeVisible();
      await expect(page.getByLabel('AI reflection', { exact: true })).toHaveCount(0);
      await expectNoWcagViolations(page, testInfo, 'fire-drill');
      await page.screenshot({
        path: testInfo.outputPath('safety-fire-drill.png'),
        animations: 'disabled',
      });
      await safetySidebar.getByRole('button', { name: 'END DRILL' }).click();
      await expect(safetySidebar.getByRole('button', { name: 'START DRILL' })).toBeVisible();
      await expect(drillBanner).toBeHidden();
      await expect(gameInterface).toHaveAttribute('data-active-mode', 'safety');
      await expect(safetyDockButton).toHaveAttribute('aria-pressed', 'true');
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
      name: /Enable PA captions|Disable PA captions/,
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

    await settingsSidebar.getByRole('radio', { name: 'low quality' }).click();
    await expect(settingsSidebar.getByRole('radio', { name: 'low quality' })).toBeChecked();
    await expect(page.locator('canvas[data-e2e-stable-canvas="true"]')).toHaveCount(1);
    await settingsSidebar.getByRole('radio', { name: 'medium quality' }).click();
    await expect(settingsSidebar.getByRole('radio', { name: 'medium quality' })).toBeChecked();
    await expect(page.locator('canvas[data-e2e-stable-canvas="true"]')).toHaveCount(1);

    const uiScale = settingsSidebar.locator('#ui-scale-slider');
    await uiScale.fill('1.25');
    await expect(settingsSidebar.locator('output[for="ui-scale-slider"]')).toHaveText('125%');
    await expect(settingsSidebar.getByText('Build and cache', { exact: true })).toBeVisible();
    await expect(settingsSidebar.getByText('Application build', { exact: true })).toBeVisible();
    await expect(settingsSidebar.getByText('Connection', { exact: true })).toBeVisible();
    await expectNoWcagViolations(page, testInfo, 'settings-desktop');

    const replayDownloadPromise = page.waitForEvent('download');
    await settingsSidebar.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const replayDownload = await replayDownloadPromise;
    expect(replayDownload.suggestedFilename()).toMatch(/^millos-diagnostic-.*\.json$/);
    await page.screenshot({
      path: testInfo.outputPath('settings-desktop.png'),
      animations: 'disabled',
    });

    await page.getByRole('button', { name: 'About MillOS' }).click();
    const aboutDialog = page.getByRole('dialog', { name: 'About MillOS' });
    await expect(aboutDialog).toBeVisible();
    await expect(aboutDialog.getByText('Fanfare for Space', { exact: false })).toBeVisible();
    await expect(aboutDialog.getByText('Forklift by Mantas Stankaitis')).toBeVisible();
    await expect(aboutDialog.getByText('Ultimate Modular Men Pack by Quaternius')).toBeVisible();
    await expect(
      aboutDialog.getByRole('link', { name: 'Complete 26-track credits and ISRCs' })
    ).toHaveAttribute('href', /MUSIC_CREDITS\.txt$/);
    await expectNoWcagViolations(page, testInfo, 'about-credits');
    await page.screenshot({
      path: testInfo.outputPath('about-credits.png'),
      animations: 'disabled',
    });
    await aboutDialog.getByRole('button', { name: 'Close about dialog' }).click();
    await expect(aboutDialog).toBeHidden();

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
    const dockBox = await dock.boundingBox();
    expect(dockBox).not.toBeNull();
    expect((dockBox?.x ?? 0) + (dockBox?.width ?? 0)).toBeLessThanOrEqual(390.5);
    expect(dockBox?.x ?? 0).toBeGreaterThanOrEqual(-0.5);

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
    await page.getByRole('menuitem', { name: 'Workforce', exact: true }).click();
    const mobileWorkforce = page.getByRole('dialog', { name: 'Workforce mobile panel' });
    await expect(mobileWorkforce).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mobileWorkforce).toBeHidden();
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

    expect(diagnostics.consoleErrors, diagnostics.consoleErrors.join('\n')).toEqual([]);
    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toEqual([]);
    expect(diagnostics.requestFailures, diagnostics.requestFailures.join('\n')).toEqual([]);
  });
});
