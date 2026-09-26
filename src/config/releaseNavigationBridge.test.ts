import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import releaseMatrix from '../../release-matrix.json';

describe('historical release navigation bridge', () => {
  it('replaces an archived selector with the complete release matrix', async () => {
    const dom = new JSDOM(
      '<div><select aria-label="Select MillOS version"><option value="v0.20">0.20</option></select></div>',
      { runScripts: 'outside-only', url: 'https://www.millos.net/v0.20/' }
    );
    Object.defineProperty(dom.window, 'fetch', {
      value: vi.fn(async () => ({
        ok: true,
        json: async () => releaseMatrix,
      })),
    });

    dom.window.eval(readFileSync(resolve(process.cwd(), 'public/release-navigation.js'), 'utf8'));
    await new Promise((resolvePromise) => dom.window.setTimeout(resolvePromise, 0));

    const legacySelector = dom.window.document.querySelector('select');
    const host = dom.window.document.querySelector<HTMLElement>('[data-millos-release-nav]');
    const selector = host?.shadowRoot?.querySelector('select');
    const go = host?.shadowRoot?.querySelector('button');
    expect(legacySelector?.hidden).toBe(true);
    expect(Array.from(selector?.options ?? []).map((option) => option.value)).toEqual([
      'v0.40',
      'v0.30',
      'v0.20',
      'v0.10',
    ]);
    expect(Array.from(selector?.options ?? []).map((option) => option.textContent)).toEqual([
      '0.40 (current)',
      '0.30 (historical)',
      '0.20 (historical)',
      '0.10 (historical)',
    ]);
    expect(selector?.value).toBe('v0.20');
    expect(go?.disabled).toBe(true);

    if (!selector || !go) throw new Error('Release navigation bridge did not mount.');
    selector.value = 'v0.40';
    selector.dispatchEvent(new dom.window.Event('change'));
    expect(go.disabled).toBe(false);
    expect(go.getAttribute('aria-label')).toBe('Go to MillOS version 0.40');
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
  });

  it('also replaces the title-labelled selector rendered by the v0.10 and v0.20 bundles', async () => {
    const dom = new JSDOM(
      '<span><select title="Switch version"><option value="v0.10">v0.10</option></select></span>',
      { runScripts: 'outside-only', url: 'https://www.millos.net/v0.10/' }
    );
    Object.defineProperty(dom.window, 'fetch', {
      value: vi.fn(async () => ({
        ok: true,
        json: async () => releaseMatrix,
      })),
    });

    dom.window.eval(readFileSync(resolve(process.cwd(), 'public/release-navigation.js'), 'utf8'));
    await new Promise((resolvePromise) => dom.window.setTimeout(resolvePromise, 0));

    const legacySelector = dom.window.document.querySelector('select');
    const hosts = dom.window.document.querySelectorAll<HTMLElement>('[data-millos-release-nav]');
    const selector = hosts[0]?.shadowRoot?.querySelector('select');
    expect(hosts).toHaveLength(1);
    expect(legacySelector?.hidden).toBe(true);
    expect(Array.from(selector?.options ?? []).map((option) => option.value)).toEqual(
      releaseMatrix.releases.map((release) => release.version)
    );
    expect(selector?.value).toBe('v0.10');
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
  });
});
