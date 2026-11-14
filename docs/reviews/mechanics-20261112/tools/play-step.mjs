#!/usr/bin/env node
/**
 * Play-test step: connects to the page play-host.mjs is holding, runs the
 * commands given in order, and disconnects. The game keeps running between
 * calls, as it would while a player thinks.
 *
 *   node play-step.mjs <command> [args] [-- <command> [args]] ...
 *
 * Commands
 *   look [name]         what a player can see: dialogs, alerts, panels, buttons,
 *                       plus a screenshot (path printed)
 *   shot [name]         screenshot only
 *   click <name>        a button, tab, radio, link or menu item by its visible
 *                       name; falls back to visible text
 *   at <x> <y>          click the page at those pixels (for the 3D view)
 *   key <Key>           press a key (P, Escape, w, Space, ...)
 *   hold <Key> <secs>   hold a key down
 *   type <text>         type into the focused field
 *   drag <x1> <y1> <x2> <y2>   drag the mouse (orbit the camera)
 *   wheel <deltaY>      scroll or zoom at the centre of the view
 *   wait <secs>         let the game run
 *   text <css>          print the text of the first element matching a selector
 *   reload              reload the page, as a returning player would
 *   status              host time left and machine load
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The checkout this file sits in (docs/reviews/mechanics-20261112/tools).
const WORKTREE = path.resolve(HERE, '../../../..');
const require = createRequire(path.join(WORKTREE, 'package.json'));
const { chromium } = require('@playwright/test');

const stateFile = path.join(HERE, 'host.json');
if (!existsSync(stateFile)) {
  console.log('NO HOST: the play host is not running (it stops itself after its hold).');
  console.log('Start it again with play-host.mjs; your saved game is kept in the profile.');
  process.exit(2);
}
const host = JSON.parse(readFileSync(stateFile, 'utf8'));
const shots = path.join(HERE, 'shots');
mkdirSync(shots, { recursive: true });

const commands = [];
let current = [];
for (const token of process.argv.slice(2)) {
  if (token === '--') {
    if (current.length) commands.push(current);
    current = [];
  } else current.push(token);
}
if (current.length) commands.push(current);
if (!commands.length) commands.push(['look']);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${host.cdp}`);
const page = browser
  .contexts()
  .flatMap((context) => context.pages())
  .find((candidate) => candidate.url().startsWith('http://127.0.0.1:'));
if (!page) {
  console.log('NO PAGE: the host is up but the game page is gone.');
  await browser.close();
  process.exit(2);
}

const nextShot = (name) => {
  const index = String(readdirSync(shots).filter((file) => file.endsWith('.jpg')).length + 1).padStart(
    3,
    '0'
  );
  return path.join(shots, `${index}-${(name ?? 'view').replace(/[^a-z0-9-]/gi, '_')}.jpg`);
};

async function shot(name) {
  const file = nextShot(name);
  await page.screenshot({ path: file, type: 'jpeg', quality: 62, timeout: 60_000 });
  console.log(`SCREENSHOT ${file}`);
}

async function look(name) {
  const seen = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      if (rect.bottom < 0 || rect.right < 0) return false;
      if (rect.top > innerHeight || rect.left > innerWidth) return false;
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
    };
    const clean = (value, limit) => {
      const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      return text.length > limit ? `${text.slice(0, limit)}...` : text;
    };
    const nameOf = (element) =>
      clean(
        element.getAttribute('aria-label') ||
          (element.getAttribute('aria-labelledby') &&
            document.getElementById(element.getAttribute('aria-labelledby').split(' ')[0])
              ?.innerText) ||
          element.getAttribute('title') ||
          element.innerText ||
          element.value,
        70
      );
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
    };
    const blocks = [];
    const push = (kind, element, limit) => {
      if (!visible(element)) return;
      blocks.push({ kind, name: nameOf(element), at: box(element), text: clean(element.innerText, limit) });
    };
    document
      .querySelectorAll('[role="dialog"],[role="alertdialog"]')
      .forEach((element) => push('DIALOG', element, 900));
    document.querySelectorAll('[role="alert"]').forEach((element) => push('ALERT', element, 300));
    document.querySelectorAll('[role="status"]').forEach((element) => push('STATUS', element, 240));
    document
      .querySelectorAll(
        '[role="region"][aria-label],[role="region"][aria-labelledby],[role="complementary"],aside,[role="banner"],header,[role="tabpanel"]'
      )
      .forEach((element) => push('PANEL', element, 700));
    document.querySelectorAll('h1,h2,h3').forEach((element) => push('HEADING', element, 90));
    const controls = [];
    document
      .querySelectorAll(
        'button,[role="button"],[role="tab"],[role="radio"],[role="checkbox"],[role="menuitem"],[role="switch"],a[href],select,input,textarea'
      )
      .forEach((element) => {
        if (!visible(element)) return;
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const state = [
          element.disabled || element.getAttribute('aria-disabled') === 'true' ? 'disabled' : '',
          element.getAttribute('aria-pressed') === 'true' ? 'pressed' : '',
          element.getAttribute('aria-selected') === 'true' ? 'selected' : '',
          element.getAttribute('aria-checked') === 'true' ? 'checked' : '',
          element.getAttribute('aria-expanded') === 'true' ? 'open' : '',
        ]
          .filter(Boolean)
          .join(',');
        controls.push(`${role}${state ? `(${state})` : ''}: ${nameOf(element) || '(no name)'}`);
      });
    const runtime = window.__MILLOS_RUNTIME__;
    let instruments = null;
    try {
      const motion = runtime?.motionSnapshot?.();
      const snapshot = runtime?.snapshot?.();
      instruments = {
        ready: runtime?.ready ?? null,
        gameSpeed: motion?.gameSpeed ?? null,
        productionSpeed: motion?.productionSpeed ?? null,
        fps: snapshot ? Math.round(snapshot.averageFps) : null,
        quality: snapshot?.quality ?? null,
        focus: nameOf(document.activeElement ?? document.body) || document.activeElement?.tagName,
      };
    } catch (error) {
      instruments = { error: String(error) };
    }
    return { blocks, controls, instruments, title: document.title, scroll: scrollY };
  });
  const left = Math.max(0, Math.round((host.stopsAt - Date.now()) / 1000));
  console.log(
    `== LOOK ${new Date().toISOString().slice(11, 19)} | host stops in ${left}s | load ${os
      .loadavg()[0]
      .toFixed(0)} ==`
  );
  console.log(`INSTRUMENTS (not visible to a player): ${JSON.stringify(seen.instruments)}`);
  const dedupe = new Set();
  for (const block of seen.blocks) {
    const line = `${block.kind} [${block.name}] @${block.at}: ${block.text}`;
    const key = `${block.kind}|${block.text.slice(0, 120)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    console.log(line);
  }
  const unique = [...new Set(seen.controls)];
  console.log(`CONTROLS (${unique.length}): ${unique.slice(0, 90).join(' | ')}`);
  await shot(name ?? 'look');
}

async function click(name) {
  const exact = { name, exact: true };
  const candidates = [
    page.getByRole('button', exact),
    page.getByRole('tab', exact),
    page.getByRole('radio', exact),
    page.getByRole('menuitem', exact),
    page.getByRole('link', exact),
    page.getByRole('checkbox', exact),
    page.getByRole('switch', exact),
    page.getByRole('button', { name }),
    page.getByRole('tab', { name }),
    page.getByRole('radio', { name }),
    page.getByRole('menuitem', { name }),
    page.getByText(name, { exact: true }),
    page.getByText(name),
  ];
  for (const locator of candidates) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const target = locator.nth(index);
      if (!(await target.isVisible().catch(() => false))) continue;
      try {
        await target.click({ timeout: 8_000 });
        console.log(`CLICKED "${name}"${count > 1 ? ` (match ${index + 1} of ${count})` : ''}`);
        return;
      } catch (error) {
        console.log(`could not click a match for "${name}": ${String(error.message).split('\n')[0]}`);
      }
    }
  }
  console.log(`NOT FOUND or not clickable: "${name}"`);
}

for (const [command, ...args] of commands) {
  try {
    if (command === 'look') await look(args[0]);
    else if (command === 'shot') await shot(args[0]);
    else if (command === 'click') await click(args.join(' '));
    else if (command === 'at') {
      await page.mouse.click(Number(args[0]), Number(args[1]));
      console.log(`CLICKED at ${args[0]},${args[1]}`);
    } else if (command === 'key') {
      await page.keyboard.press(args[0]);
      console.log(`PRESSED ${args[0]}`);
    } else if (command === 'hold') {
      await page.keyboard.down(args[0]);
      await page.waitForTimeout(Number(args[1] ?? 1) * 1000);
      await page.keyboard.up(args[0]);
      console.log(`HELD ${args[0]} for ${args[1] ?? 1}s`);
    } else if (command === 'type') {
      await page.keyboard.type(args.join(' '));
      console.log(`TYPED ${args.join(' ')}`);
    } else if (command === 'drag') {
      const [x1, y1, x2, y2] = args.map(Number);
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 12 });
      await page.mouse.up();
      console.log(`DRAGGED ${x1},${y1} to ${x2},${y2}`);
    } else if (command === 'wheel') {
      await page.mouse.move(host.viewport.width / 2, host.viewport.height / 2);
      await page.mouse.wheel(0, Number(args[0]));
      console.log(`WHEEL ${args[0]}`);
    } else if (command === 'wait') {
      await page.waitForTimeout(Number(args[0] ?? 1) * 1000);
      console.log(`WAITED ${args[0] ?? 1}s`);
    } else if (command === 'text') {
      const text = await page
        .locator(args.join(' '))
        .first()
        .innerText({ timeout: 5_000 })
        .catch(() => '(nothing matches)');
      console.log(`TEXT ${args.join(' ')}: ${text.replace(/\s+/g, ' ').slice(0, 1500)}`);
    } else if (command === 'select') {
      // select <field name> :: <option text>
      const [field, option] = args.join(' ').split('::').map((part) => part.trim());
      const box = page.getByRole('combobox', { name: field }).first();
      const options = await box.locator('option').allInnerTexts();
      const match = options.find((text) => text.includes(option));
      console.log(`OPTIONS for "${field}": ${options.join(' | ')}`);
      if (match) {
        await box.selectOption({ label: match });
        console.log(`SELECTED "${match}"`);
      } else console.log(`no option containing "${option}"`);
    } else if (command === 'reload') {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
      console.log('RELOADED');
    } else if (command === 'status') {
      const left = Math.max(0, Math.round((host.stopsAt - Date.now()) / 1000));
      console.log(`host stops in ${left}s; load ${os.loadavg().map((v) => v.toFixed(0)).join(' ')}`);
    } else console.log(`unknown command: ${command}`);
  } catch (error) {
    console.log(`ERROR in ${command}: ${String(error.message).split('\n')[0]}`);
  }
}

// Disconnect only: the host owns the browser and the page keeps running.
await browser.close().catch(() => {});
process.exit(0);
