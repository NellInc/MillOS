// Dump what the app's strategic prompt is built from, so the retention set for the
// routing tune is shaped exactly like the real thing:
//   node scripts/local-router-tune/dump_strategy_prompts.mjs
// Writes data/strategy_source.json: the live machines (id, type, status, metrics),
// production metrics, shift and weather, and aiEngine.strategicPrompt's output in
// English and pt-BR for the live plant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { acquireCaptureLock } from '../lib/capture-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PORT = 3444;
const lock = await acquireCaptureLock('router-strategy-dump', { root: ROOT });
const server = await createServer({
  root: ROOT,
  server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const out = {};
  for (const lang of ['en', 'pt-BR']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      localStorage.setItem(
        'millos-ui',
        JSON.stringify({ state: { hasSeenIntro: true }, version: 2 })
      );
    });
    await page.goto(`http://127.0.0.1:${PORT}/?quality=low&pa=off&scada=false&lang=${lang}`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    });
    await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready, null, { timeout: 900_000 });
    await page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 900_000 });
    await page.waitForFunction(
      async () => {
        const { useProductionStore } = await import('/src/stores/productionStore.ts');
        return useProductionStore.getState().machines.length > 0;
      },
      null,
      { timeout: 600_000, polling: 1000 }
    );
    await page.waitForTimeout(8000);
    out[lang] = await page.evaluate(async () => {
      const { strategicPrompt } = await import('/src/utils/aiEngine.ts');
      const { useProductionStore } = await import('/src/stores/productionStore.ts');
      const { useGameSimulationStore } = await import('/src/stores/gameSimulationStore.ts');
      const production = useProductionStore.getState();
      const simulation = useGameSimulationStore.getState();
      return {
        prompt: strategicPrompt(production.machines),
        machines: production.machines.map((m) => ({
          id: m.id,
          type: m.type,
          status: m.status,
          metrics: m.metrics,
        })),
        metrics: production.metrics,
        shift: simulation.currentShift,
        weather: simulation.weather,
      };
    });
    await page.close();
  }
  fs.mkdirSync(path.join(HERE, 'data'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'data', 'strategy_source.json'), JSON.stringify(out, null, 1));
  console.log(out.en.prompt);
  console.log('---');
  console.log(out['pt-BR'].prompt.split('\n').slice(0, 5).join('\n'));
} finally {
  await browser.close();
  await server.close();
  await lock.release();
}
