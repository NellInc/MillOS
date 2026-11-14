#!/usr/bin/env node
/**
 * Playtest capture of the interface surfaces changed by the mechanics waves
 * (plan item 0.4). It drives a built MillOS the way a player does (dock, keys,
 * the shift pace, waiting at a raised pace) and takes one JPEG per state, so a
 * person can look at every changed surface without opening a browser window.
 *
 *   npm run playtest:surfaces -- --base-url=http://127.0.0.1:4173/v0.40/ \
 *     [--out=test-results/playtest-surfaces] [--only=hud,dock] [--lang=en|pt-BR|all] \
 *     [--viewport=desktop|phone|all] [--gl=llvmpipe|swiftshader] [--full-scene]
 *
 * It takes the repository's capture lock (scripts/lib/capture-lock.mjs) for the
 * whole run, so it never renders beside another capture or benchmark.
 *
 * Serve a build first (`VERSION=v0.40 npm run build && VERSION=v0.40 npx vite
 * preview`): --base-url must point at the built app, including its version base.
 *
 * Headless only. Every browser is launched with `headless: true`; nothing here
 * can open a window. Software GL: `--gl=llvmpipe` (default) uses Mesa through
 * ANGLE's EGL backend (needs Mesa's libEGL, e.g. `libegl1 libgl1-mesa-dri`),
 * which on a 4 vCPU VM draws the low tier at about 3 FPS; SwiftShader manages
 * about 1 FPS, too slow for the startup cover's slow-device door.
 *
 * Software GL cannot hold the full world, so unless --full-scene is given the
 * runtime's own perfDebug instrument switches off render-only subsystems as
 * soon as the runtime exists (environment, terrain, lights, surface finish,
 * water, machine finish and the CommunityLife figures; trucks, forklifts,
 * conveyors and machines stay, because deliveries advance inside them), and the
 * persisted tier is Low at a 0.35 resolution scale. The 3D view is therefore
 * dark: judge the DOM surfaces, not the scene.
 *
 * Startup goes through the cover's own "Open loaded scene (slow)" door.
 * Far states are reached by play at the fastest pace (4x), never by writing to
 * a store. A surface that cannot be reached is recorded with a failure frame and
 * the run exits non-zero. Per surface it records console errors, page errors and
 * failed requests in `manifest.json`.
 *
 * Variants: desktop 1280x720 English, desktop 1280x720 Brazilian Portuguese
 * (?lang=pt-BR), a narrow 390x844 English window (`narrow`, mouse), a
 * landscape phone 844x390 in both languages (`phone`: touch, mobile, device
 * scale 2) and one upright phone frame (`upright`: the rotate notice only).
 *
 * Seeds (`--seed-dir=<dir>`): far states (a signed Chronicle at shift 33, a
 * running trial, the long night, an open intake card) take hours of play at
 * this frame rate, so they are loaded as a returning player's saved game. Each
 * seed is one JSON object of localStorage keys, dumped by a harness that
 * played the real tick to that state (the Chronicle probe's player); the page
 * reloads with it in place of its own save. Every seeded step names its seed
 * in the manifest (`seed`), so no frame from one passes as reached by play.
 *
 * Per frame the manifest also records what a JPEG cannot show: elements still
 * carrying a `title` tooltip, and text cut by its box (scrollWidth past
 * clientWidth under overflow hidden or an ellipsis).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const baseUrl = arg('base-url');
const outDir = arg('out', 'test-results/playtest-surfaces');
if (!baseUrl) {
  console.error(
    'Usage: --base-url=<served app url> [--out=<directory>] [--only=a,b|final] [--lang=en|pt-BR|all] [--viewport=desktop,narrow,phone,upright|all] [--seed-dir=<dir>]'
  );
  process.exit(2);
}
const only = arg('only', '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const langOpt = arg('lang', 'all');
const viewportOpt = arg('viewport', 'all');
const gl = arg('gl', 'llvmpipe');
const fullScene = flag('full-scene');
const maxMinutes = Number(arg('max-minutes', '45'));
const seedDir = arg('seed-dir', '');

const SURFACES = [
  'hud',
  'dock',
  'overview',
  'inspector',
  'safety',
  'ai',
  'shiftcard',
  'autonomy',
  'chronicle',
  'planner',
  // The final pass (11 on): each reachable from a fresh boot or one seed.
  'cover',
  'about',
  'settings',
  'emergency',
  'datalinks',
  'proposals',
  'debrief',
  'seasons',
  'chronicle-states',
  'rotate',
];
/** The surfaces the final pass added; `--only=final` runs these. */
const FINAL = SURFACES.slice(SURFACES.indexOf('cover'));
if (only.includes('final')) only.splice(only.indexOf('final'), 1, ...FINAL);
for (const id of only)
  if (!SURFACES.includes(id)) {
    console.error(`Unknown surface "${id}". Known: ${SURFACES.join(', ')}`);
    process.exit(2);
  }
const wanted = (id) => only.length === 0 || only.includes(id);
const NUMBER = Object.fromEntries(
  SURFACES.map((id, index) => [id, String(index + 1).padStart(2, '0')])
);

const VARIANTS = [
  { id: 'desktop-en', viewport: { width: 1280, height: 720 }, lang: 'en', kind: 'desktop' },
  { id: 'desktop-pt', viewport: { width: 1280, height: 720 }, lang: 'pt-BR', kind: 'desktop' },
  { id: 'narrow-en', viewport: { width: 390, height: 844 }, lang: 'en', kind: 'narrow' },
  // A phone held sideways: touch, the mobile viewport and a phone's pixel density.
  { id: 'phone-en', viewport: { width: 844, height: 390 }, lang: 'en', kind: 'phone', touch: true },
  {
    id: 'phone-pt',
    viewport: { width: 844, height: 390 },
    lang: 'pt-BR',
    kind: 'phone',
    touch: true,
  },
  // Upright, a touch phone gets only the rotate notice; one frame of it.
  {
    id: 'upright-en',
    viewport: { width: 390, height: 844 },
    lang: 'en',
    kind: 'upright',
    touch: true,
  },
]
  .map((variant) => ({ ...variant, phone: variant.kind !== 'desktop' }))
  .filter(
    (variant) =>
      (langOpt === 'all' || langOpt === variant.lang) &&
      (viewportOpt === 'all' || viewportOpt.split(',').includes(variant.kind))
  );

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A name in either language, matched from its start. */
const name = (en, pt = en) => new RegExp(`^(${escape(en)}|${escape(pt)})`, 'i');

// Visible names in both catalogues (src/**/*.messages.ts).
const T = {
  openLoaded: name('Open loaded scene (slow)', 'Abrir a cena carregada (lenta)'),
  useLow: name('Use low graphics', 'Usar qualidade gráfica baixa'),
  closeSidebar: name('Close sidebar panel', 'Fechar painel lateral'),
  closeNotifications: name('Close notifications', 'Fechar notificações'),
  notifications: name('Notifications', 'Notificações'),
  more: name(
    'More workspaces and view controls',
    'Mais espaços de trabalho e controles de visualização'
  ),
  achievements: name('Achievements', 'Conquistas'),
  datalinks: name('Datalinks'),
  aiPartner: name('AI Partner', 'Parceiro de IA'),
  pace120: name('Fastest, 4x', 'Mais rápido, 4x'),
  pace30: name('Standard, 1x', 'Padrão, 1x'),
  planLogistics: name('Logistics planning', 'Planejamento logístico'),
  testBatch: name('Test batch', 'Testar lote'),
  openRepair: name('Open repair', 'Abrir reparo'),
  stopForklifts: name('STOP FORKLIFTS', 'PARAR EMPILHADEIRAS'),
  releaseForklifts: name('RELEASE FORKLIFT STOP', 'LIBERAR PARADA DAS EMPILHADEIRAS'),
  startDrill: name('START DRILL', 'INICIAR SIMULADO'),
  endDrill: name('END DRILL', 'ENCERRAR SIMULADO'),
  restartLine: name('RESTART LINE', 'REINICIAR LINHA'),
  tabControls: name('Controls', 'Controles'),
  tabConfig: name('Config', 'Configuração'),
  signCharter: name('Sign the charter', 'Assinar a carta'),
  acceptProgramme: name('Accept next delivery programme', 'Aceitar o próximo programa de entregas'),
  continueReading: name('Continue reading...', 'Continuar lendo...'),
  close: name('Close', 'Fechar'),
  about: name('About MillOS', 'Sobre o MillOS'),
  releaseOverlay: name('Release forklift stop', 'Liberar parada das empilhadeiras'),
  triggerStop: name('TRIGGER EMERGENCY STOP', 'ACIONAR PARADA DE EMERGÊNCIA'),
  clearEmergency: name('CLEAR EMERGENCY', 'ENCERRAR EMERGÊNCIA'),
  // Case-sensitive and whole: the panel's own TRIGGER EMERGENCY STOP, behind
  // the confirm dialog, matches the case-blind form first.
  confirmStop: /^(Trigger emergency stop|Acionar parada de emergência)$/,
  cleaning: name('Cleaning and Tempering', 'Limpeza e condicionamento'),
  reduceMotion: /^(Reduce motion|Reduzir movimento)/,
  openScadaWorkspace: name('Open full SCADA workspace', 'Abrir a área de trabalho SCADA completa'),
  closeScada: name('Close SCADA panel', 'Fechar o painel SCADA'),
  inspect: name('Inspect', 'Inspecionar'),
  closePanel: name('Close panel', 'Fechar painel'),
};

// ---------------------------------------------------------------- page helpers

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function visible(locator) {
  return locator
    .first()
    .isVisible()
    .catch(() => false);
}

async function click(page, role, label, { scope = page, timeout = 20_000, optional = false } = {}) {
  const locator = scope.getByRole(role, { name: label });
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const target = locator.nth(index);
    if (!(await target.isVisible().catch(() => false))) continue;
    await target.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
    await target.click({ timeout });
    return true;
  }
  if (optional) return false;
  throw new Error(`No visible ${role} named ${label}`);
}

async function key(page, value, settle = 1500) {
  // Keys go to the page, not a focused field: blur any input first.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active && active !== document.body && /INPUT|SELECT|TEXTAREA/.test(active.tagName))
      active.blur();
  });
  await page.keyboard.press(value);
  await sleep(settle);
}

async function dock(page, mode) {
  const button = page.locator(`[data-dock-mode="${mode}"]`).first();
  if (await visible(button)) {
    await button.click({ timeout: 20_000 });
    await sleep(2000);
    return;
  }
  throw new Error(`Dock entry ${mode} is not visible`);
}

async function closeSidebar(page) {
  await click(page, 'button', T.closeSidebar, { optional: true, timeout: 5000 }).catch(() => {});
  await sleep(800);
}

/** Scroll the first visible text matching `pattern` into view; false if none. */
async function revealText(page, pattern) {
  const target = page.getByText(pattern).first();
  if (!(await target.count())) return false;
  await target.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
  await sleep(700);
  return true;
}

async function observe(page) {
  return page.evaluate(() => {
    const read = (domainId, fields) =>
      window.__MILLOS_AGENT__?.query({ view: 'domain', domainId, fields }).data?.state ?? null;
    const campaign = read('campaign', ['initialized', 'elapsedMinutes', 'orders']);
    const simulation = read('simulation', ['gameSpeed']);
    return {
      elapsedMinutes: campaign?.elapsedMinutes ?? null,
      gameSpeed: simulation?.gameSpeed ?? null,
      orders: (campaign?.orders ?? []).map((order) => ({
        id: order.id,
        status: order.status,
        shippedKg: Math.round(order.shippedKg ?? 0),
        requiredKg: order.requiredKg,
      })),
    };
  });
}

async function waitFor(page, label, predicate, minutes) {
  const deadline = Date.now() + minutes * 60_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await observe(page).catch(() => null);
    if (last && predicate(last)) return last;
    await sleep(5000);
  }
  throw new Error(`Timed out after ${minutes} min waiting for ${label}: ${JSON.stringify(last)}`);
}

const orderFulfilled = (id) => (state) =>
  state.orders.some(
    (order) => order.id === id && (order.status === 'fulfilled' || order.status === 'cancelled')
  );

async function setPace(page, phone, label) {
  // The shift pace buttons live in the Overview workspace (desktop) and the
  // phone's Overview sheet.
  if (!(await click(page, 'button', label, { optional: true, timeout: 5000 }))) {
    if (phone) await openPhoneSheet(page, 'overview');
    else await dock(page, 'overview');
    await click(page, 'button', label);
  }
  await sleep(1000);
}

async function openPhoneSheet(page, which) {
  // Phone: the compact overlay's own buttons, or More.
  const labels = {
    overview: name('Mill Overview', 'Visão geral do moinho'),
    autonomy: name('Autonomy', 'Autonomia'),
    safety: name('Safety & Emergency', 'Segurança e emergência'),
    chronicle: name('Mill Chronicle', 'Crônica do moinho'),
    scada: name('Simulated SCADA', 'SCADA simulado'),
    ai: T.aiPartner,
  };
  if (await click(page, 'button', labels[which], { optional: true, timeout: 8000 })) {
    await sleep(2000);
    return;
  }
  await click(page, 'button', T.more);
  await sleep(1000);
  if (!(await click(page, 'menuitem', labels[which], { optional: true, timeout: 8000 })))
    await click(page, 'button', labels[which]);
  await sleep(2000);
}

// ---------------------------------------------------------------- the run

async function boot(page, variant, onSlowDoor) {
  const url = new URL(baseUrl);
  url.searchParams.set('quality', 'low');
  if (variant.lang !== 'en') url.searchParams.set('lang', variant.lang);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitForInterface(page, onSlowDoor);
}

/** `onSlowDoor` runs (awaited) each time the slow-device door is about to be opened. */
async function waitForInterface(page, onSlowDoor) {
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => ({
        ready: document.documentElement.dataset.millosStartupReady === 'true',
        cover: !!document.querySelector(
          '[aria-label="Loading MillOS"],[aria-label="Carregando o MillOS"]'
        ),
        opened: !document.querySelector('[role="dialog"][aria-modal="true"] [role="progressbar"]'),
      }))
      .catch(() => null);
    const coverGone =
      state &&
      (await page
        .getByRole('progressbar')
        .count()
        .catch(() => 1)) === 0 &&
      (await page
        .getByTestId('game-interface')
        .isVisible()
        .catch(() => false));
    if (coverGone) return;
    if (await visible(page.getByRole('button', { name: T.openLoaded }))) {
      if (onSlowDoor) await onSlowDoor();
      await page
        .getByRole('button', { name: T.openLoaded })
        .first()
        .click({ timeout: 30_000 })
        .catch(() => {});
    }
    await sleep(4000);
  }
  throw new Error('The startup cover never opened (neither ready nor the slow-device door).');
}

async function dismissIntro(page) {
  // The first-visit AI reflection card covers the right of the view.
  // Its close button is the first plain "Close" on the page at startup.
  await click(page, 'button', /^(Close|Fechar)$/, { optional: true, timeout: 8000 }).catch(
    () => {}
  );
  // A touch phone first shows the walk controls card.
  await click(page, 'button', /^(Start exploring|Começar a explorar)$/, {
    optional: true,
    timeout: 5000,
  }).catch(() => {});
  await sleep(500);
}

async function runVariant(browser, variant, results) {
  const context = await browser.newContext({
    viewport: variant.viewport,
    // A touch phone held upright gets only the "Rotate to landscape" notice
    // (RotateDeviceOverlay, which also holds the clock): the `narrow` variant
    // is the 390 px compact layout as a window with a mouse, as
    // capture-operational-review.mjs does; `phone` is the touch phone sideways.
    hasTouch: !!variant.touch,
    isMobile: !!variant.touch,
    deviceScaleFactor: variant.touch ? 2 : 1,
    locale: variant.lang === 'en' ? 'en-GB' : 'pt-BR',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
    colorScheme: 'dark',
  });
  await context.addInitScript((light) => {
    if (!sessionStorage.getItem('millos-playtest-fixture')) {
      sessionStorage.setItem('millos-playtest-fixture', 'ready');
      localStorage.clear();
      localStorage.setItem(
        'millos-audio',
        JSON.stringify({
          version: 2,
          muted: true,
          volume: 0,
          musicEnabled: false,
          musicVolume: 0,
          machineVolume: 0,
        })
      );
      // No demo preference: the default cooperative season may arrive by itself
      // after the first delivery (D4), which is how its debrief is reached.
      localStorage.setItem(
        'millos-ui',
        JSON.stringify({ state: { hasSeenIntro: true }, version: 1 })
      );
      localStorage.setItem(
        'millos-graphics',
        JSON.stringify({
          state: { graphics: { quality: 'low', resolutionScale: 0.35 } },
          version: 6,
        })
      );
    }
    if (!light) return;
    const timer = setInterval(() => {
      const runtime = window.__MILLOS_RUNTIME__;
      if (!runtime?.setPerfDebug) return;
      clearInterval(timer);
      runtime.setPerfDebug({
        disableEnvironment: true,
        disableTerrain: true,
        disablePunctualLights: true,
        disableLightingPolish: true,
        disableInteriorLightBanks: true,
        disableSurfaceTreatment: true,
        disableWaterCaustics: true,
        disableMachineFinish: true,
        disableCommunityLife: true,
      });
    }, 5);
  }, !fullScene);
  // Seeds: each applies once, on the load after `seedReload` names it, before
  // any of the app's scripts run, so the app restores it as its own save.
  for (const [seedName, data] of Object.entries(SEEDS))
    await context.addInitScript(
      ({ seedName, data }) => {
        if (sessionStorage.getItem('millos-playtest-apply') !== seedName) return;
        sessionStorage.removeItem('millos-playtest-apply');
        const keep = new Set(['millos-audio', 'millos-ui', 'millos-graphics']);
        for (const key of Object.keys(localStorage))
          if (key.startsWith('millos-') && !keep.has(key)) localStorage.removeItem(key);
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('__')) continue;
          let stored = value;
          // A harness mounts no scene, so its record has no scene participants
          // (trucks, forklifts, crossings, personnel), and a record without
          // them is refused. They come from this page's own last save.
          if (key === 'millos-physical-session') {
            const live = sessionStorage.getItem('millos-playtest-participants');
            const record = JSON.parse(value);
            if (live && (!record.participants || record.participants.length === 0)) {
              record.participants = JSON.parse(live);
              stored = JSON.stringify(record);
            }
          }
          localStorage.setItem(key, stored);
        }
      },
      { seedName, data }
    );

  const page = await context.newPage();
  const diagnostics = [];
  page.on('console', (message) => {
    if (message.type() === 'error')
      diagnostics.push({ kind: 'console', text: message.text().slice(0, 500) });
  });
  page.on('pageerror', (error) =>
    diagnostics.push({ kind: 'page', text: String(error.message).slice(0, 500) })
  );
  page.on('requestfailed', (request) =>
    diagnostics.push({
      kind: 'request',
      text: `${request.url()} ${request.failure()?.errorText ?? ''}`,
    })
  );

  const vp = variant.kind === 'desktop' ? 'desktop' : variant.kind;
  const lang = variant.lang === 'en' ? 'en' : 'pt';
  const files = new Map();
  const frames = new Map();
  let seed = null;
  const shot = async (surface, slug, { fullPage = false } = {}) => {
    const file = `${NUMBER[surface]}-${slug}-${vp}-${lang}.jpg`;
    await page.screenshot({
      path: path.join(outDir, file),
      type: 'jpeg',
      quality: 70,
      fullPage,
      animations: 'disabled',
      caret: 'hide',
      timeout: 120_000,
    });
    if (!files.has(surface)) files.set(surface, []);
    files.get(surface).push(file);
    frames.set(file, { seed, ...(await probeFrame(page)) });
    console.log(`  ${file}${seed ? ` (seed ${seed})` : ''}`);
  };
  /** Reload as a returning player whose saved game is this seed. */
  const seedReload = async (name, { keepEvent = false } = {}) => {
    if (!SEEDS[name]) throw new Error(`No seed "${name}" in ${seedDir || '(no --seed-dir)'}`);
    await page.evaluate((value) => {
      sessionStorage.setItem('millos-playtest-apply', value);
      // The scene participants of this page's own save (see the init script).
      try {
        const own = JSON.parse(localStorage.getItem('millos-physical-session') ?? 'null');
        if (own?.participants?.length)
          sessionStorage.setItem('millos-playtest-participants', JSON.stringify(own.participants));
      } catch {
        // Keep the participants stashed by an earlier seed.
      }
    }, name);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
    seed = name;
    await waitForInterface(page);
    await sleep(3000);
    await dismissIntro(page);
    // Hold the clock as a player does while reading.
    if ((await observe(page).catch(() => ({ gameSpeed: 0 }))).gameSpeed > 0)
      await key(page, 'p', 800);
    if (!keepEvent) await deferEvent(page);
  };
  const ctx = { page, variant, phone: variant.phone, shot, seedReload };

  const runStep = async (surface, label, fn) => {
    if (!wanted(surface)) return;
    const from = diagnostics.length;
    const started = Date.now();
    console.log(`[${variant.id}] ${surface}: ${label}`);
    try {
      await fn(ctx);
      results.push({
        variant: variant.id,
        surface,
        step: label,
        ok: true,
        seconds: Math.round((Date.now() - started) / 1000),
      });
    } catch (error) {
      const failure = `${NUMBER[surface]}-${surface}-${label.replace(/[^a-z0-9]+/gi, '-')}-FAILED-${vp}-${lang}.jpg`;
      await page
        .screenshot({
          path: path.join(outDir, failure),
          type: 'jpeg',
          quality: 60,
          timeout: 60_000,
        })
        .catch(() => {});
      console.error(`  FAILED: ${error.message.split('\n')[0]}`);
      // Leave nothing open for the next step to trip on.
      await key(page, 'Escape', 500).catch(() => {});
      await key(page, 'Escape', 500).catch(() => {});
      await click(page, 'button', T.closePanel, { optional: true, timeout: 3000 }).catch(() => {});
      await closeSidebar(page).catch(() => {});
      results.push({
        variant: variant.id,
        surface,
        step: label,
        ok: false,
        error: error.message,
        failure,
      });
    } finally {
      results.at(-1).diagnostics = diagnostics.slice(from);
      results.at(-1).files = files.get(surface)?.splice(0) ?? [];
      results.at(-1).frames = Object.fromEntries(
        results.at(-1).files.map((file) => [file, frames.get(file)])
      );
      if (seed) results.at(-1).seed = seed;
    }
  };
  /** A step that only moves the game on; it runs when any later surface needs it. */
  const advance = async (label, needed, fn) => {
    if (!needed.some(wanted)) return;
    console.log(`[${variant.id}] advance: ${label}`);
    const from = diagnostics.length;
    try {
      await fn(ctx);
      results.push({ variant: variant.id, surface: 'advance', step: label, ok: true });
    } catch (error) {
      results.push({
        variant: variant.id,
        surface: 'advance',
        step: label,
        ok: false,
        error: error.message,
      });
      throw error;
    } finally {
      results.at(-1).diagnostics = diagnostics.slice(from);
    }
  };

  try {
    const s = SURFACES_IMPL;
    if (variant.kind === 'upright') {
      // Upright, the phone shows only the rotate notice: one frame, no play.
      await runStep('rotate', 'rotate notice', s.rotateNotice);
      return;
    }
    const bootFrom = diagnostics.length;
    // The slow-device door is where the cover's sourced fact shows: the
    // cover step photographs it there, once, before the door is opened.
    let coverTaken = !wanted('cover');
    await boot(page, variant, async () => {
      if (coverTaken) return;
      coverTaken = true;
      await runStep('cover', 'slow-load cover', s.cover);
    });
    results.push({
      variant: variant.id,
      surface: 'boot',
      step: 'startup cover',
      ok: true,
      diagnostics: diagnostics.slice(bootFrom),
    });
    await dismissIntro(page);

    // Phase A: the first order is open. Hold the clock (P) so the order stays
    // open while the static surfaces are taken.
    await runStep('hud', 'order open', s.hudOrderOpen);
    await runStep('autonomy', 'before first delivery', s.autonomyBeforeFirstDelivery);
    await runStep('chronicle', 'charter', s.chronicleCharter);
    await runStep('dock', 'dock and keys', s.dock);
    await runStep('overview', 'overview', s.overview);
    await runStep('safety', 'safety', s.safety);
    await runStep('ai', 'ai', s.ai);
    await runStep('planner', 'planner and captions', s.planner);
    await runStep('inspector', 'inspector', s.inspector);

    // The final pass, fresh plant: About, Settings, the stops and their
    // overlay (with the muted PA caption), the Inspector's held Restart under
    // a facility stop, Datalinks over a stop, the new milling category.
    await runStep('about', 'about', s.about);
    await runStep('settings', 'reduce motion', s.settings);
    await runStep('emergency', 'stops and overlay', s.emergency);
    await runStep('datalinks', 'how flour is milled', s.datalinks);
    await runStep('seasons', 'season start and refusal', s.seasonStart);

    // Phase B: play at 4x until the first order ships (the win line).
    await advance(
      'first delivery at 4x',
      ['hud', 'shiftcard', 'autonomy', 'chronicle', 'inspector'],
      async () => {
        await key(page, 'Escape', 300);
        await setPace(page, variant.phone, T.pace120);
        await closeSidebar(page);
        await waitFor(page, 'order-001 fulfilled', orderFulfilled('order-001'), 20);
      }
    );
    await runStep('hud', 'win line', s.hudWin);
    // A returning player: reload while the next order is open; the compact
    // guide should open on it once.
    await runStep('hud', 'reload with an order open', s.guideReloadOrderOpen);
    await runStep('inspector', 'wear notice', s.inspectorWear);

    // Phase C: the programme completes; the shift card offers three ways on.
    await runStep('shiftcard', 'programme complete', s.shiftCard);

    // Phase D: the Chronicle signed, then played to shift 3 for the long night.
    await runStep('chronicle', 'signed tabs', s.chronicleSigned);
    await runStep('autonomy', 'season', s.autonomySeason);
    if (!flag('skip-long')) {
      await runStep('autonomy', 'season debrief', s.seasonDebrief);
      await runStep('chronicle', 'long night', s.chronicleLongNight);
    }
    await runStep('shiftcard', 'guide after reload', s.guideAfterReload);

    // The final pass, seeded: each a returning player's saved game (see the
    // header). The asked intake card and its bell; the debrief with the
    // partner's record; the Chronicle at the states play reaches in hours.
    if (seedDir) {
      await runStep('proposals', 'asked cards and the bell', s.proposals);
      await runStep('debrief', 'shift debrief', s.debrief);
      await runStep('chronicle-states', 'chronicle states', s.chronicleStates);
    }
  } catch (error) {
    results.push({
      variant: variant.id,
      surface: 'session',
      step: 'session',
      ok: false,
      error: error.message,
    });
    await page
      .screenshot({
        path: path.join(outDir, `00-session-FAILED-${vp}-${lang}.jpg`),
        type: 'jpeg',
        quality: 60,
      })
      .catch(() => {});
  } finally {
    await context.close();
  }
}

/**
 * What the HUD row shows of itself: whether the metrics row overflows, and
 * whether the commitment, the clock, the held chip and the result line end
 * inside the screen and are what is drawn at their centre (not covered).
 * Logged as one JSON line per call, beside the frame it explains.
 */
async function probeHud(page, label) {
  const facts = await page
    .evaluate(() => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          onTop: !!top && (el === top || el.contains(top)),
          text: (el.textContent ?? '').slice(0, 120),
        };
      };
      const row = document.querySelector('[data-hud-metrics]');
      const commitment = document.querySelector(
        'button[aria-label^="Open the commitment"], button[aria-label^="Abrir o compromisso"]'
      );
      return {
        viewport: window.innerWidth,
        row: row && {
          scrollWidth: row.scrollWidth,
          clientWidth: row.clientWidth,
          right: Math.round(row.getBoundingClientRect().right),
        },
        commitment: box(commitment),
        clock: box(document.querySelector('header time')),
        holdChip: box(document.querySelector('[data-testid="clock-hold-chip"]')),
        result: box(document.querySelector('[data-testid="hud-result"]')),
      };
    })
    .catch((error) => ({ error: String(error) }));
  console.log(`  probe ${label}: ${JSON.stringify(facts)}`);
}

// ---------------------------------------------------------------- surfaces

const SURFACES_IMPL = {
  async hudOrderOpen({ page, phone, shot }) {
    await shot('hud', 'hud-order');
    await probeHud(page, 'hud-order');
    // Hold the clock as a player does (P); the phone shows its held-clock chip.
    await key(page, 'p');
    await shot('hud', 'hud-held');
    await probeHud(page, 'hud-held');
    if (phone) {
      await click(page, 'button', T.notifications, { optional: true });
      await sleep(1500);
      await shot('hud', 'hud-bell');
      await key(page, 'Escape', 800);
    }
  },

  async autonomyBeforeFirstDelivery({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'autonomy');
    else await dock(page, 'management');
    await shot('autonomy', 'autonomy-before-first-delivery');
    // The season's own start (Cooperative season), pressed
    // before order-001 ships: what does the player see?
    const lab = page.getByRole('region', {
      name: name('Cooperative season', 'Temporada cooperativa'),
    });
    if (await lab.count()) {
      const start = lab.getByRole('button', {
        name: name(
          'Start 3-shift cooperative season (1x)',
          'Iniciar temporada cooperativa de 3 turnos (1x)'
        ),
      });
      if (await start.count()) {
        await start
          .first()
          .scrollIntoViewIfNeeded()
          .catch(() => {});
        await sleep(500);
        await shot('autonomy', 'autonomy-lab-season-start-before-first');
        await start
          .first()
          .click({ timeout: 20_000 })
          .catch(() => {});
        await sleep(2500);
        await shot('autonomy', 'autonomy-lab-season-start-pressed');
        // Where does the refusal appear, if anywhere?
        const refusal = page
          .getByText(/starts after the first delivery|começa depois da primeira entrega/i)
          .first();
        if (await refusal.count()) {
          await refusal.scrollIntoViewIfNeeded().catch(() => {});
          await sleep(600);
          await shot('autonomy', 'autonomy-lab-season-refusal');
        }
      }
    }
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async chronicleCharter({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'chronicle');
    else await dock(page, 'chronicle');
    const sign = page.getByRole('button', { name: T.signCharter }).first();
    await sign.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await sleep(800);
    await shot('chronicle', 'chronicle-charter');
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async dock({ page, phone, shot }) {
    if (phone) {
      await click(page, 'button', T.more);
      await sleep(1200);
      await shot('dock', 'dock-more-menu');
      await click(page, 'menuitem', T.achievements);
      await sleep(2000);
      await shot('dock', 'dock-achievements');
      await key(page, 'Escape', 800);
      return;
    }
    await shot('dock', 'dock');
    for (const [k, slug] of [
      ['n', 'key-n-commitment'],
      ['b', 'key-b-bell'],
      ['l', 'key-l-safety'],
      ['m', 'key-m-chronicle'],
    ]) {
      await key(page, k, 2500);
      await shot('dock', `dock-${slug}`);
      await key(page, 'Escape', 600);
      await closeSidebar(page);
    }
    await key(page, '?', 2500);
    const workspaces = page.getByText(/^(Workspaces|Áreas de trabalho)$/).first();
    await workspaces.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
    await sleep(600);
    await shot('dock', 'dock-help-workspaces');
    await key(page, 'Escape', 800);
  },

  async overview({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'overview');
    else await dock(page, 'overview');
    await shot('overview', 'overview-top');
    // The lab: test the first batch and read its readings.
    const test = page.getByRole('button', { name: T.testBatch }).first();
    if (await test.count()) {
      await test.scrollIntoViewIfNeeded({ timeout: 15_000 });
      await test.click({ timeout: 20_000 });
      await sleep(4000);
      await shot('overview', 'overview-lab');
    } else await shot('overview', 'overview-lab-no-batch');
    for (const [text, slug] of [
      [/^(Programme|Programa)/, 'overview-programme'],
      [/^(PRODUCTION SUMMARY|RESUMO DA PRODUÇÃO)/i, 'overview-production'],
      [/^(Predictive Maintenance|Manutenção preditiva)/i, 'overview-predictive'],
    ]) {
      const target = page.getByText(text).first();
      if (await target.count()) {
        await target.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
        await sleep(600);
        await shot('overview', slug);
      }
    }
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
    // The production tracker (T) and the multi-objective dashboard (Y).
    if (!phone) {
      await click(
        page,
        'button',
        name('Show production target tracker', 'Mostrar o acompanhamento da meta de produção'),
        {
          optional: true,
        }
      );
      await sleep(2000);
      await shot('overview', 'overview-tracker');
      await key(page, 'y', 2500);
      await shot('overview', 'overview-multi-objective');
      // Both dashboards at once, then the energy one beside an open sidebar.
      await key(page, 'u', 2500);
      await shot('overview', 'overview-both-dashboards');
      await key(page, 'y', 800);
      await dock(page, 'overview');
      await sleep(1500);
      await shot('overview', 'overview-energy-with-sidebar');
      await key(page, 'u', 800);
      await closeSidebar(page);
    }
  },

  async safety({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'safety');
    else await dock(page, 'safety');
    await shot('safety', 'safety-controls');
    await click(page, 'button', T.stopForklifts);
    await sleep(2500);
    await shot('safety', 'safety-forklifts-stopped');
    await click(page, 'button', T.releaseForklifts);
    await sleep(2500);
    await shot('safety', 'safety-forklifts-released');
    await click(page, 'button', T.startDrill);
    await sleep(3000);
    await shot('safety', 'safety-drill');
    await click(page, 'button', T.endDrill);
    await sleep(2000);
    // D13: ending the drill left the line idle; restart it before moving on.
    await shot('safety', 'safety-restart-line');
    // Optional: builds from before D13 have no RESTART LINE control.
    await click(page, 'button', T.restartLine, { optional: true, timeout: 8000 });
    await sleep(1500);
    await click(page, 'tab', T.tabConfig);
    await sleep(1500);
    await click(page, 'button', name('Safety Configuration', 'Configuração de segurança'));
    await sleep(1500);
    await shot('safety', 'safety-config');
    const sliders = page.getByRole('slider');
    if (await sliders.count()) {
      await sliders
        .last()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await sleep(500);
      await shot('safety', 'safety-config-sliders');
    }
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async ai({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'ai');
    else await key(page, 'i', 3000);
    await shot('ai', 'ai-command-center');
    const card = page.getByText(/accept|aceitar/i).first();
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(500);
      await shot('ai', 'ai-card');
    }
    if (phone) await key(page, 'Escape', 800);
    else await key(page, 'i', 1500);
  },

  async planner({ page, phone, shot }) {
    // Layout planner from the dock's More menu (plan 7.8).
    await click(page, 'button', T.more);
    await sleep(800);
    await shot('planner', 'more-menu');
    await click(page, 'menuitem', T.planLogistics);
    await sleep(3000);
    await shot('planner', 'planner-paused');
    const tables = page.getByRole('table');
    const count = await tables.count();
    for (let index = 0; index < count; index += 1) {
      await tables
        .nth(index)
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await sleep(500);
      await shot('planner', `planner-table-${index + 1}`);
    }
    // The operate strip: run, then pause again, from its own buttons.
    await page
      .getByRole('button', { name: name('Run production', 'Rodar produção') })
      .first()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await click(page, 'button', name('Run production', 'Rodar produção'));
    await sleep(3000);
    // Run production hands the view back to the plant; reopen the planner to
    // see its operate strip while the mill runs.
    if (!(await visible(page.getByRole('button', { name: name('Pause mill', 'Pausar moinho') })))) {
      await click(page, 'button', T.more);
      await click(page, 'menuitem', T.planLogistics);
    }
    await sleep(3000);
    await shot('planner', 'planner-running');
    // Apply answers with the store's refusal while the mill runs, when there is
    // a proposal to apply; with none it stays disabled.
    const applyMill = page
      .getByRole('button', { name: name('Apply to mill', 'Aplicar ao moinho') })
      .first();
    if (await applyMill.isEnabled().catch(() => false)) {
      await applyMill.click({ timeout: 20_000 });
      await sleep(2000);
      await shot('planner', 'planner-apply-while-running');
    }
    const pauseMill = page
      .getByRole('button', { name: name('Pause mill', 'Pausar moinho') })
      .first();
    if (await pauseMill.isEnabled().catch(() => false)) await pauseMill.click({ timeout: 20_000 });
    await sleep(2000);
    await key(page, 'Escape', 1000);
    // The planner's run released the P hold: hold the clock again if it runs.
    if ((await observe(page)).gameSpeed > 0) await key(page, 'p', 800);
    // SCADA setpoint form, before and after Apply.
    if (phone) await openPhoneSheet(page, 'scada');
    else await key(page, 'o', 3000);
    await click(
      page,
      'button',
      name('Open full SCADA workspace', 'Abrir a área de trabalho SCADA completa'),
      {
        optional: true,
      }
    );
    await sleep(3000);
    await shot('planner', 'scada');
    // The workspace's own Tags tab (the sidebar's is "Tags (122)"), filtered to
    // setpoints; the first mill's group holds the setpoint form.
    await click(page, 'tab', /^Tags$/, { optional: true });
    await sleep(2000);
    await click(page, 'button', /^SETPOINT$/, { optional: true });
    await sleep(1500);
    await click(page, 'button', /^rm-101\b/, { optional: true });
    await sleep(2000);
    const apply = page.getByRole('button', { name: /^(Apply|Aplicar)$/ }).first();
    if (await apply.count()) {
      await apply.scrollIntoViewIfNeeded().catch(() => {});
      // The treatment state: a roll speed above 1,000 RPM, a rate above 100% (plan 7.5).
      await page
        .getByRole('spinbutton')
        .first()
        .fill('1200')
        .catch(() => {});
      await sleep(500);
      await shot('planner', 'scada-setpoint-before');
      await apply.click({ timeout: 20_000 }).catch(() => {});
      await sleep(2500);
      await shot('planner', 'scada-setpoint-after');
    }
    await click(page, 'button', name('Close SCADA panel', 'Fechar o painel SCADA'), {
      optional: true,
    });
    await sleep(1000);
    await key(page, 'Escape', 1000);
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
    // Datalinks from More.
    await click(page, 'button', T.more);
    await sleep(1000);
    await click(page, 'menuitem', T.datalinks);
    await sleep(3000);
    await shot('planner', 'datalinks');
    await key(page, 'Escape', 1000);
    // Energy dashboard (U).
    if (!phone) {
      await key(page, 'u', 3000);
      await shot('planner', 'energy');
      await key(page, 'u', 1000);
    }
  },

  async inspector({ page, phone, shot }) {
    // Predictive maintenance lives in Overview; a wear notice opens the unit.
    if (phone) await openPhoneSheet(page, 'overview');
    else await dock(page, 'overview');
    const heading = page.getByText(/^(Predictive Maintenance|Manutenção preditiva)/i).first();
    await heading.scrollIntoViewIfNeeded({ timeout: 15_000 });
    await sleep(600);
    await shot('inspector', 'predictive-maintenance');
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async hudWin({ page, shot }) {
    await key(page, 'p', 300); // hold, so the result line is still there
    await shot('hud', 'hud-win');
    await probeHud(page, 'hud-win');
    // The notices list over whatever card is on screen now (the AI reflection
    // card, as a rule): nothing behind it may read through.
    await click(page, 'button', T.notifications, { optional: true });
    await sleep(1500);
    await shot('hud', 'hud-win-bell');
    await key(page, 'Escape', 800);
    await key(page, 'p', 500);
  },

  async inspectorWear({ page, phone, shot }) {
    await click(page, 'button', T.notifications);
    await sleep(1500);
    const repair = page.getByRole('button', { name: T.openRepair }).first();
    if (!(await repair.count())) {
      await key(page, 'Escape', 600);
      throw new Error('No wear notice with "Open repair" in the bell yet.');
    }
    await shot('inspector', 'bell-wear-notice');
    await repair.click({ timeout: 20_000 });
    await sleep(3000);
    await shot('inspector', 'inspector-from-wear-notice');
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async shiftCard({ page, shot, phone, variant }) {
    // The programme completes at 4x; its card offers three ways on.
    await setPace(page, phone, T.pace120);
    if (!phone) await closeSidebar(page);
    const offer = page.getByRole('button', { name: name('Chronicle charter', 'Carta da Crônica') });
    const deadline = Date.now() + 25 * 60_000;
    let hudTaken = false;
    while (Date.now() < deadline) {
      const state = await observe(page);
      const open = state.orders.some((order) => order.status === 'active');
      if (!open && state.orders.length && !hudTaken) {
        hudTaken = true;
        await shot('hud', 'hud-no-order');
      }
      if (await visible(offer)) break;
      if (!open) {
        // The completed card lives in the Overview workspace.
        if (phone) await openPhoneSheet(page, 'overview');
        else await dock(page, 'overview');
        await sleep(1500);
        if (await visible(offer)) break;
        await shot('shiftcard', 'overview-after-programme');
        if (phone) await key(page, 'Escape', 500);
        else await closeSidebar(page);
      }
      await sleep(15_000);
    }
    if (!(await visible(offer)))
      throw new Error('No programme-complete card with the Chronicle offer within 25 min.');
    await key(page, 'p', 500);
    await offer.scrollIntoViewIfNeeded().catch(() => {});
    await shot('shiftcard', 'shift-card');
    if (!phone) {
      // As opened: every scrolling ancestor of the card back at its top, so
      // the frame shows what is visible without scrolling at 1280 x 657.
      await page.setViewportSize({ width: 1280, height: 657 });
      await sleep(1500);
      await offer.evaluate((el) => {
        for (let node = el.parentElement; node; node = node.parentElement)
          if (node.scrollHeight > node.clientHeight) node.scrollTop = 0;
      });
      await sleep(800);
      await shot('shiftcard', 'shift-card-657');
      const inView = await offer.evaluate(
        (el) => el.getBoundingClientRect().bottom <= window.innerHeight
      );
      console.log(`  probe shift-card-657: charter button inside the viewport: ${inView}`);
      await page.setViewportSize(variant.viewport);
    }
    await key(page, 'p', 500);
  },

  async chronicleSigned({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'chronicle');
    else await dock(page, 'chronicle');
    await click(page, 'button', T.signCharter);
    await sleep(3000);
    await shot('chronicle', 'chronicle-signed-overview');
    if (await revealText(page, /^(Needs you|Precisa de você)/))
      await shot('chronicle', 'chronicle-needs-you');
    const extra = {
      plans: /prepares .* for the long night|para a longa noite/,
      partners: /^(Regional federation|Federação regional)/,
      ledger: /^(Batches that passed QC|Lotes aprovados no CQ)/,
    };
    for (const tab of ['policy', 'plans', 'partners', 'ledger']) {
      await page.locator(`#chronicle-tab-${tab}`).click({ timeout: 20_000 });
      await sleep(2000);
      await shot('chronicle', `chronicle-${tab}`);
      if (extra[tab] && (await revealText(page, extra[tab])))
        await shot('chronicle', `chronicle-${tab}-2`);
    }
    await page.locator('#chronicle-tab-overview').click({ timeout: 20_000 });
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async autonomySeason({ page, phone, shot }) {
    if (phone) await openPhoneSheet(page, 'autonomy');
    else await dock(page, 'management');
    await shot('autonomy', 'autonomy-after-first-delivery');
    if (phone) await key(page, 'Escape', 800);
    else await closeSidebar(page);
  },

  async seasonDebrief({ page, phone, shot }) {
    // A season needs an open commitment: accept the next programme, then let
    // the fictional roles decide, so the season plays itself at 4x.
    if (phone) await openPhoneSheet(page, 'overview');
    else await dock(page, 'overview');
    await click(
      page,
      'button',
      name('Accept next delivery programme', 'Aceitar o próximo programa de entregas'),
      {
        optional: true,
      }
    );
    await sleep(2000);
    if (phone) await openPhoneSheet(page, 'autonomy');
    else await dock(page, 'management');
    await click(
      page,
      'button',
      name('Let fictional roles decide', 'Deixar as funções fictícias decidirem'),
      {
        optional: true,
      }
    );
    await sleep(3000);
    await shot('autonomy', 'season-running');
    await setPace(page, phone, T.pace120);
    if (!phone) await closeSidebar(page);
    const debrief = name('Read the season debrief', 'Ler o balanço da temporada');
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      if (phone) await openPhoneSheet(page, 'autonomy');
      else await dock(page, 'management');
      const open = page.getByText(debrief).first();
      if (await visible(open)) {
        await open.scrollIntoViewIfNeeded().catch(() => {});
        await open.click({ timeout: 20_000 }).catch(() => {});
        await sleep(2000);
        await shot('autonomy', 'season-debrief');
        if (!phone) {
          await page.setViewportSize({ width: 390, height: 844 });
          await sleep(2500);
          await shot('autonomy', 'season-debrief-390');
          await page.setViewportSize({ width: 1280, height: 720 });
          await sleep(1500);
        }
        return;
      }
      if (phone) await key(page, 'Escape', 500);
      else await closeSidebar(page);
      await sleep(30_000);
    }
    throw new Error('No season debrief within 30 min at 4x.');
  },

  async chronicleLongNight({ page, phone, shot }) {
    await setPace(page, phone, T.pace120);
    if (!phone) await closeSidebar(page);
    // Shift 3 of the charter: two more closes at 4x (about 4 real minutes each
    // at this frame rate). Decisions that appear are photographed and taken
    // on their default.
    const deadline = Date.now() + 25 * 60_000;
    let decisions = 0;
    while (Date.now() < deadline) {
      const dialog = page.getByRole('dialog').filter({ hasText: /Because|Porque/ });
      if ((await dialog.count()) && decisions < 2) {
        decisions += 1;
        await shot('chronicle', `chronicle-decision-${decisions}`);
      }
      if (phone) await openPhoneSheet(page, 'chronicle');
      else await dock(page, 'chronicle');
      const night = page.getByText(/long night|longa noite/i).first();
      if (await visible(night)) {
        await night.scrollIntoViewIfNeeded().catch(() => {});
        await shot('chronicle', 'chronicle-long-night');
        return;
      }
      if (phone) await key(page, 'Escape', 500);
      else await closeSidebar(page);
      await sleep(30_000);
    }
    throw new Error('The long night card did not appear within 25 min at 4x.');
  },

  async hudNoOrder({ page, shot }) {
    const state = await observe(page);
    if (state.orders.some((order) => order.status === 'active'))
      throw new Error(`An order is still active: ${JSON.stringify(state.orders)}`);
    await shot('hud', 'hud-no-order');
  },

  async guideReloadOrderOpen({ page, phone, shot }) {
    const state = await observe(page);
    if (!state.orders.some((order) => order.status === 'active'))
      throw new Error(`No order open to reload on: ${JSON.stringify(state.orders)}`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForInterface(page);
    await sleep(4000);
    await shot('shiftcard', 'guide-reload-order-open');
    // Back to the fastest pace for what follows.
    await setPace(page, phone, T.pace120);
    if (!phone) await closeSidebar(page);
  },

  async guideAfterReload({ page, shot }) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForInterface(page);
    await sleep(3000);
    await shot('shiftcard', 'guide-after-reload');
  },

  // ------------------------------------------------------------ final pass

  async rotateNotice({ page, variant, shot }) {
    const url = new URL(baseUrl);
    url.searchParams.set('quality', 'low');
    if (variant.lang !== 'en') url.searchParams.set('lang', variant.lang);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 180_000 });
    // The loading cover sits above the notice until the scene opens.
    await waitForInterface(page);
    await page
      .getByText(/^(Rotate to landscape|Gire para o modo paisagem)/)
      .first()
      .waitFor({ timeout: 180_000 });
    await sleep(2000);
    await shot('rotate', 'rotate-notice');
  },

  async cover({ page, phone, shot }) {
    // The fact mounts with the slow-load controls; give it a moment to settle.
    await sleep(3000);
    await shot('cover', 'cover-slow-fact');
    if (!phone) return;
    // On a short screen the stalled cover (Reload as well) is the tallest:
    // its way out must stay reachable by scrolling the cover.
    await page
      .getByRole('button', { name: /^(Reload|Recarregar)$/ })
      .first()
      .waitFor({ timeout: 120_000 })
      .catch(() => {});
    await sleep(1500);
    await shot('cover', 'cover-stalled');
    await page
      .getByRole('button', { name: T.openLoaded })
      .first()
      .scrollIntoViewIfNeeded({ timeout: 10_000 })
      .catch(() => {});
    await sleep(800);
    await shot('cover', 'cover-stalled-scrolled');
  },

  async about({ page, phone, shot }) {
    // About sits in the side panel's footer; on a phone, at the end of Settings' sheet.
    if (phone) await click(page, 'button', name('Settings', 'Configurações'));
    else await dock(page, 'overview');
    await sleep(1500);
    if (phone) {
      await revealText(page, T.about);
      await shot('about', 'settings-sheet-about-button');
    }
    await click(page, 'button', T.about);
    await sleep(2000);
    await shot('about', 'about');
    await key(page, 'Escape', 1000);
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await closeSidebar(page);
  },

  async settings({ page, phone, shot }) {
    if (phone) await click(page, 'button', name('Settings', 'Configurações'));
    else await dock(page, 'settings');
    await sleep(1500);
    await revealText(page, T.reduceMotion);
    await shot('settings', 'settings-reduce-motion');
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await closeSidebar(page);
  },

  async emergency({ page, phone, shot }) {
    // 1. The forklift stop: X on a desktop, the Safety sheet's button on a
    //    phone. The overlay, the PA caption it raises (muted: captions only)
    //    and the overlay's own Release.
    if (phone) {
      await openPhoneSheet(page, 'safety');
      await click(page, 'button', T.stopForklifts);
      await sleep(1500);
      await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    } else {
      await key(page, 'x', 2500);
    }
    await sleep(1500);
    await shot('emergency', 'forklift-stop-overlay');
    await click(page, 'button', T.releaseOverlay);
    await sleep(2500);
    await shot('emergency', 'forklift-stop-released');
    // 2. The facility stop from Safety, confirmed; its held controls.
    if (phone) await openPhoneSheet(page, 'safety');
    else await dock(page, 'safety');
    await click(page, 'button', T.triggerStop);
    await sleep(1500);
    await shot('emergency', 'facility-stop-confirm');
    await click(page, 'button', T.confirmStop);
    await sleep(3000);
    await shot('emergency', 'facility-stop-safety');
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await closeSidebar(page);
    await sleep(1000);
    await shot('emergency', 'facility-stop-overlay');
    // 3. A dialog over the stop: Datalinks.
    await click(page, 'button', T.more);
    await sleep(800);
    await click(page, 'menuitem', T.datalinks);
    await sleep(2500);
    await shot('emergency', 'facility-stop-datalinks');
    await key(page, 'Escape', 1000);
    // 4. The Inspector under the stop: a held Restart and Maintain, each with
    //    its reason. The SCADA workspace's process view points the camera at
    //    R.M. 101; the unit is then picked in the view, at its centre.
    if (!phone) {
      await key(page, 'o', 2500);
      await click(page, 'button', T.openScadaWorkspace);
      await sleep(2500);
      await revealText(page, /^rm-101$/);
      await click(page, 'button', /^rm-101$/);
      await sleep(2000);
      await click(page, 'button', T.closeScada);
      await sleep(1000);
      await closeSidebar(page);
      await sleep(4000);
      const size = page.viewportSize();
      await page.mouse.click(size.width / 2, size.height / 2 + 30);
      await sleep(3000);
      await shot('emergency', 'inspector-facility-stop');
      await revealText(page, /^(Perform Maintenance|Fazer manutenção)/);
      await shot('emergency', 'inspector-maintenance-held');
      // Inspect is a <details> summary, not a button.
      await page
        .locator('summary')
        .filter({ hasText: T.inspect })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await sleep(1500);
      await revealText(page, /^(Restart Unit|Reiniciar unidade)/);
      await shot('emergency', 'inspector-restart-held');
      await closeSidebar(page);
    }
    // 5. Clear the stop and restart the line.
    if (phone) await openPhoneSheet(page, 'safety');
    else await dock(page, 'safety');
    await click(page, 'button', T.clearEmergency);
    await sleep(2500);
    await click(page, 'button', T.restartLine, { optional: true, timeout: 8000 });
    await sleep(1500);
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await closeSidebar(page);
  },

  async datalinks({ page, shot }) {
    await click(page, 'button', T.more);
    await sleep(800);
    await click(page, 'menuitem', T.datalinks);
    await sleep(2500);
    await shot('datalinks', 'datalinks-categories');
    await click(page, 'button', T.cleaning);
    await sleep(2000);
    await shot('datalinks', 'datalinks-cleaning-tempering');
    await key(page, 'Escape', 1000);
  },

  async seasonStart(ctx) {
    // The season's start and its refusal before the first delivery (Autonomy),
    // then the Overview's own start "on this order", where it shows.
    await SURFACES_IMPL.autonomyBeforeFirstDelivery({
      ...ctx,
      shot: (_surface, slug) => ctx.shot('seasons', slug),
    });
    const { page, phone, shot } = ctx;
    if (phone) await openPhoneSheet(page, 'overview');
    else await dock(page, 'overview');
    if (
      await revealText(
        page,
        /^(Start 3-shift cooperative season on this order|Iniciar temporada cooperativa de 3 turnos com este pedido)/
      )
    )
      await shot('seasons', 'overview-season-on-this-order');
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await closeSidebar(page);
  },

  async proposals({ page, phone, shot, seedReload }) {
    // An asked card: the grain intake under a signed charter, and the early
    // programme, both asked by default (seed: the probe's first close).
    await seedReload('proposal-open-intake');
    await probeHud(page, 'proposals-hud');
    await shot('proposals', 'hud-with-open-cards');
    if (phone) await openPhoneSheet(page, 'ai');
    else await key(page, 'i', 3000);
    await shot('proposals', 'asked-cards');
    const card = page.locator('[data-testid^="partner-proposal-"]').nth(1);
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(600);
      await shot('proposals', 'asked-cards-2');
    }
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await key(page, 'i', 1500);
    // The early programme, asked: its priced "Take it now" beside the wait.
    if (SEEDS['proposal-open-commitment']) {
      await seedReload('proposal-open-commitment');
      if (phone) await openPhoneSheet(page, 'ai');
      else await key(page, 'i', 3000);
      await shot('proposals', 'asked-commitment');
      if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
      else await key(page, 'i', 1500);
    }
    // Decided and told: the bell lines of a later shift.
    await seedReload('event-because');
    await click(page, 'button', T.notifications, { optional: true });
    await sleep(1500);
    await shot('proposals', 'bell-decided-told');
    if (await revealText(page, /^(Partner decided|O parceiro decidiu)/))
      await shot('proposals', 'bell-partner-decided');
    await key(page, 'Escape', 800);
    // The kinds the probe met decided: an incident (shift 43), the temper card (shift 18).
    for (const [seedName, slug] of [
      ['struck', 'bell-incident-decided'],
      ['shift-18', 'bell-temper-decided'],
    ]) {
      if (!SEEDS[seedName]) continue;
      await seedReload(seedName);
      await click(page, 'button', T.notifications, { optional: true });
      await sleep(1500);
      if (await revealText(page, /^(Partner decided|O parceiro decidiu)/))
        await shot('proposals', slug);
      await key(page, 'Escape', 800);
    }
  },

  async debrief({ page, phone, shot }) {
    // Continues on the last seed: a chronicle's plant with closed shifts.
    if (phone) await openPhoneSheet(page, 'overview');
    else await dock(page, 'overview');
    if (await revealText(page, /^(Shift debrief|Balanço do turno)/))
      await shot('debrief', 'debrief-top');
    if (await revealText(page, /^OEE /)) await shot('debrief', 'debrief-oee-purchases');
    if (await revealText(page, /^(The partner's proposals|Propostas do parceiro)/))
      await shot('debrief', 'debrief-partner-record');
    if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
    else await closeSidebar(page);
  },

  async chronicleStates({ page, phone, shot, seedReload }) {
    const open = async () => {
      if (phone) await openPhoneSheet(page, 'chronicle');
      else await dock(page, 'chronicle');
      await sleep(1500);
    };
    const shut = async () => {
      if (phone) await click(page, 'button', T.closePanel, { optional: true, timeout: 5000 });
      else await closeSidebar(page);
    };
    const tab = async (id, slug) => {
      await page.locator(`#chronicle-tab-${id}`).click({ timeout: 20_000 });
      await sleep(1500);
      await shot('chronicle-states', slug);
    };
    // Each block runs where its seed is in --seed-dir, so a recapture can
    // carry only the seeds it needs.
    // Shift 33: an event with a Because line, Grid Winter announced.
    if (SEEDS['event-because']) {
      await seedReload('event-because', { keepEvent: true });
      const dialog = page.getByRole('dialog').filter({ hasText: /Because|Porque/ });
      if (await dialog.count()) await shot('chronicle-states', 'event-because');
      await deferEvent(page);
      await open();
      await shot('chronicle-states', 'overview-needs-you');
      if (await revealText(page, /^(Grid Winter|Inverno na rede elétrica)$/))
        await shot('chronicle-states', 'trial-announced-grid-winter');
      await tab('partners', 'partners');
      await tab('ledger', 'ledger');
      await tab('plans', 'plans');
      await tab('notes', 'notes');
      if (await click(page, 'button', /^(Start the quiz|Iniciar o quiz)/, { optional: true })) {
        await sleep(1500);
        await shot('chronicle-states', 'quiz');
      }
      await page.locator('#chronicle-tab-overview').click({ timeout: 20_000 });
      await shut();
    }
    // Shift 38: Grid Winter running.
    if (SEEDS['trial-active-grid_winter']) {
      await seedReload('trial-active-grid_winter');
      await open();
      if (await revealText(page, /^(Grid Winter|Inverno na rede elétrica)$/))
        await shot('chronicle-states', 'trial-running-grid-winter');
      await shut();
    }
    // Shift 43: a forecast that struck, in the Notes tab's notices.
    if (SEEDS.struck) {
      await seedReload('struck');
      await open();
      await page.locator('#chronicle-tab-notes').click({ timeout: 20_000 });
      await sleep(1500);
      if (await revealText(page, /(it struck|concretizou-se)/))
        await shot('chronicle-states', 'forecast-struck');
      await page.locator('#chronicle-tab-overview').click({ timeout: 20_000 });
      await shut();
    }
    // An idle player's shortfall, where the probe met one.
    if (SEEDS.shortfall) {
      // The shortfall asks in its own dialog; it is kept on screen.
      await seedReload('shortfall', { keepEvent: true });
      await open();
      await shot('chronicle-states', 'shortfall-overview');
      await shut();
    }
    // Shift 54: the long night, with "Leave it to the AI partner".
    if (SEEDS['long-night']) {
      await seedReload('long-night', { keepEvent: true });
      await sleep(2000);
      await shot('chronicle-states', 'long-night');
      const leave = page
        .getByRole('button', { name: /^(Leave it to the AI partner|Deixar com o parceiro de IA)/ })
        .first();
      if (await leave.count()) {
        await leave.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(600);
        await shot('chronicle-states', 'long-night-ai-partner');
      }
    }
  },
};

/**
 * A seeded shift opens with a pending Chronicle decision on screen; on a phone
 * it covers the bell and the dock. "Think it over" sets it aside, as a player
 * would to reach them (the event step photographs it first).
 */
async function deferEvent(page) {
  // Several decisions can be pending; each "Think it over" brings the next.
  for (let index = 0; index < 4; index += 1) {
    const deferred = await click(page, 'button', /^(Think it over|Pensar melhor)$/, {
      optional: true,
      timeout: 5000,
    }).catch(() => false);
    await sleep(800);
    if (!deferred) return;
  }
}

/** What a JPEG cannot show: `title` tooltips and text its box cuts. */
async function probeFrame(page) {
  return page
    .evaluate(() => {
      const shown = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) return false;
        if (r.right < 0 || r.left > innerWidth) return false;
        return el.checkVisibility
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : true;
      };
      const titles = [];
      for (const el of document.querySelectorAll('[title]'))
        if (shown(el)) titles.push(el.getAttribute('title').slice(0, 80));
      const cut = [];
      for (const el of document.querySelectorAll('body *')) {
        if (cut.length >= 12 || el.children.length > 3 || el.clientWidth < 2) continue;
        const text = (el.textContent ?? '').trim();
        if (!text || el.scrollWidth <= el.clientWidth + 1 || !shown(el)) continue;
        const style = getComputedStyle(el);
        if (style.textOverflow === 'ellipsis' || style.overflowX === 'hidden')
          cut.push(`${text.slice(0, 60)} (${el.scrollWidth}>${el.clientWidth})`);
      }
      return { titles: [...new Set(titles)], cut };
    })
    .catch((error) => ({ error: String(error) }));
}

// ---------------------------------------------------------------- main

await mkdir(outDir, { recursive: true });
/** name -> { localStorage key: value }, from --seed-dir (index.json is the dumper's list). */
const SEEDS = {};
if (seedDir)
  for (const file of await readdir(seedDir))
    if (file.endsWith('.json') && file !== 'index.json')
      SEEDS[file.slice(0, -5)] = JSON.parse(await readFile(path.join(seedDir, file), 'utf8'));
// Renders must not overlap (CLAUDE.md): a second headless Chromium on the same
// GPU halves both, so the lock is held from launch until the browser closes.
const captureLock = await acquireCaptureLock('playtest-surfaces', { root: process.cwd() });
const startedAt = new Date().toISOString();
const browser = await chromium.launch({
  headless: true,
  channel: gl === 'llvmpipe' ? 'chromium' : undefined,
  args: [
    '--mute-audio',
    '--ignore-gpu-blocklist',
    ...(arg('cdp-port') ? [`--remote-debugging-port=${arg('cdp-port')}`] : []),
    ...(gl === 'llvmpipe'
      ? ['--use-gl=angle', '--use-angle=gl-egl']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  ],
});
const renderer = await (async () => {
  const page = await browser.newPage();
  const value = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2');
    const info = context?.getExtension('WEBGL_debug_renderer_info');
    return info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  });
  await page.close();
  return value;
})();
console.log(`Renderer: ${renderer}`);

const results = [];
const hardStop = setTimeout(
  () => {
    console.error(`Stopping after ${maxMinutes} min.`);
    process.exit(3);
  },
  maxMinutes * 60_000 * Math.max(1, VARIANTS.length)
);
/** Written after every variant, so a stopped run keeps the record of what it took. */
const writeManifest = () =>
  writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        baseUrl,
        renderer,
        gl,
        fullScene,
        only,
        // Seeded steps are a returning player's saved game, not play (header).
        seedDir: seedDir || null,
        seeds: Object.fromEntries(
          Object.entries(SEEDS).map(([seedName, data]) => [seedName, data.__seed ?? null])
        ),
        results,
      },
      null,
      2
    )}\n`
  );
try {
  for (const variant of VARIANTS) {
    await runVariant(browser, variant, results);
    await writeManifest();
  }
} finally {
  clearTimeout(hardStop);
  await browser.close();
  await captureLock.release();
}

const failed = results.filter((result) => !result.ok);
await writeManifest();
console.log(
  `\n${results.length - failed.length} steps passed, ${failed.length} failed. Manifest: ${path.join(outDir, 'manifest.json')}`
);
for (const failure of failed)
  console.log(
    `  FAILED ${failure.variant} ${failure.surface} (${failure.step}): ${failure.error?.split('\n')[0]}`
  );
process.exitCode = failed.length ? 1 : 0;
