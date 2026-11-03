import { afterEach, describe, expect, it, vi } from 'vitest';

// PLAYTEST-15: <html lang> must name the language the page is in, from boot
// and whichever way the locale changes.
afterEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.lang = 'en';
  vi.resetModules();
});

describe('<html lang>', () => {
  it('is pt-BR from boot when the page opens on ?lang=pt-BR', async () => {
    document.documentElement.lang = 'en';
    window.history.replaceState(null, '', '/?lang=pt-BR');
    vi.resetModules();
    const i18n = await import('../index');
    expect(i18n.getLocale()).toBe('pt-BR');
    expect(document.documentElement.lang).toBe('pt-BR');
  });

  it('follows a locale written straight to the store', async () => {
    vi.resetModules();
    const i18n = await import('../index');
    expect(document.documentElement.lang).toBe('en');
    i18n.useLocaleStore.setState({ locale: 'pt-BR' });
    expect(document.documentElement.lang).toBe('pt-BR');
    i18n.useLocaleStore.setState({ locale: 'en' });
    expect(document.documentElement.lang).toBe('en');
  });
});
