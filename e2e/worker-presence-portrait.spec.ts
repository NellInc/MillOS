import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const IDLE_ASSET_PREFIX = '/assets/workers/idle/';

async function openWorkforce(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({
        state: { hasSeenIntro: true },
        version: 1,
      })
    );
    localStorage.setItem(
      'millos-graphics',
      JSON.stringify({
        state: { graphics: { quality: 'low' } },
        version: 4,
      })
    );
    localStorage.setItem(
      'millos-audio',
      JSON.stringify({
        version: 1,
        muted: true,
        volume: 0.5,
        musicEnabled: false,
        musicVolume: 0,
        machineVolume: 0,
        ttsEnabled: false,
      })
    );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Workforce', exact: true }).waitFor({ timeout: 240_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.sceneReady === 'true',
    undefined,
    { timeout: 240_000 }
  );
  await page.getByRole('button', { name: 'Workforce', exact: true }).click({ force: true });
  const workforce = page.getByRole('complementary', { name: 'Workforce sidebar panel' });
  await expect(workforce).toBeVisible();
  return workforce;
}

function collectIdleRequests(page: Page) {
  const idleRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith(IDLE_ASSET_PREFIX)) idleRequests.push(pathname);
  });
  return idleRequests;
}

test('lazy loads only the selected worker signature animation', async ({ page }) => {
  const idleRequests = collectIdleRequests(page);
  const workforce = await openWorkforce(page);
  expect(idleRequests).toEqual([]);

  const marcusResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/w1_marcus_chen_idle.webp'),
    { timeout: 60_000 }
  );
  await workforce.getByRole('button', { name: /Marcus Chen/ }).click({ force: true });
  const marcusResponse = await marcusResponsePromise;
  expect(marcusResponse.status()).toBe(200);
  expect(marcusResponse.headers()['content-type']).toContain('image/webp');

  const portrait = workforce.getByTestId('worker-presence-portrait');
  await expect(portrait).toHaveAttribute('data-worker-id', 'w1');
  await expect(portrait).toHaveAttribute('data-portrait-source', 'animation');
  await expect(portrait).toHaveJSProperty('complete', true);
  expect(await portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(192);
  expect(await portrait.evaluate((image: HTMLImageElement) => image.naturalHeight)).toBe(256);
  expect(idleRequests).toEqual(['/assets/workers/idle/w1_marcus_chen_idle.webp']);
});

test('serves the static rest frame under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const idleRequests = collectIdleRequests(page);
  const workforce = await openWorkforce(page);
  expect(idleRequests).toEqual([]);

  const kimRestResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith('/w5_david_kim_idle_rest.webp'),
    { timeout: 60_000 }
  );
  await workforce.getByRole('button', { name: /David Kim/ }).click({ force: true });
  const kimRestResponse = await kimRestResponsePromise;
  expect(kimRestResponse.status()).toBe(200);
  expect(kimRestResponse.headers()['content-type']).toContain('image/webp');

  const portrait = workforce.getByTestId('worker-presence-portrait');
  await expect(portrait).toHaveAttribute('data-worker-id', 'w5');
  await expect(portrait).toHaveAttribute('data-portrait-source', 'rest');
  await expect(portrait).toHaveJSProperty('complete', true);
  expect(idleRequests).toEqual(['/assets/workers/idle/w5_david_kim_idle_rest.webp']);
  expect(idleRequests).not.toContain('/assets/workers/idle/w5_david_kim_idle.webp');

  const frameBox = await workforce.getByTestId('worker-presence-frame').evaluate((frame) => {
    const bounds = frame.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(frameBox.width).toBeCloseTo(96, 0);
  expect(frameBox.height).toBeCloseTo(128, 0);

  const axeResults = await new AxeBuilder({ page }).include('#context-sidebar').analyze();
  expect(
    axeResults.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }))
  ).toEqual([]);
});
