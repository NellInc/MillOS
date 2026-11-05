import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatgptClient } from './chatgptClient';
import { setLocale } from '../i18n';
import { keyedText } from '../i18n/alertCopy';

// The strategic request through the ChatGPT plan gives up after 125 s, and a
// stopped companion makes fetch itself fail. Both reached the AI settings as
// the browser's own words ("signal timed out", "Failed to fetch"), in English
// whatever the language, with no key to re-word them by.
// Working if a timed-out or unreachable request reads as the client's own
// keyed line in the language active now.
describe('ChatGPT companion failures the player reads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLocale('en');
  });

  const failure = async (cause: unknown) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(cause))
    );
    try {
      await chatgptClient.generateContent('Plan the shift.');
    } catch (error) {
      return error as Error & { copy?: Parameters<typeof keyedText>[0] };
    }
    throw new Error('generateContent did not fail');
  };

  it('words a timed-out request as a timeout, in Portuguese after a switch', async () => {
    const error = await failure(new DOMException('signal timed out', 'TimeoutError'));
    expect(error.copy).toBeDefined();
    setLocale('pt-BR');
    expect(keyedText(error.copy, error.message)).not.toMatch(/signal timed out/);
    expect(keyedText(error.copy, error.message)).toMatch(/ChatGPT/);
  });

  it('words an unreachable companion as not running', async () => {
    const error = await failure(new TypeError('Failed to fetch'));
    expect(error.copy).toMatchObject({ key: 'companionNotRunning' });
    expect(chatgptClient.isConnected()).toBe(false);
  });
});

// The companion answers a refusal with its own English words ("Select a
// ChatGPT model first", "Sign in with ChatGPT to use this backend", "ChatGPT
// inference failed (502)"). The client passed them on with no key, so the AI
// settings showed them in English after a switch to Portuguese. Working if
// each refusal reaches the player as the client's own keyed line.
describe('ChatGPT companion refusals the player reads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLocale('en');
  });

  const refusal = async (status: number, message: string) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: message }), {
            status,
            headers: { 'content-type': 'application/json' },
          })
      )
    );
    try {
      await chatgptClient.generateContent('Plan the shift.');
    } catch (error) {
      return error as Error & { copy?: Parameters<typeof keyedText>[0] };
    }
    throw new Error('generateContent did not fail');
  };

  it.each([
    [400, 'Select a ChatGPT model first', /Select a ChatGPT model/],
    [401, 'Sign in with ChatGPT to use this backend', /Sign in with ChatGPT/],
    [409, 'Active ChatGPT account changed', /Active ChatGPT account changed/],
    [502, 'ChatGPT inference failed (502)', /inference failed/],
  ])('words a %i refusal in Portuguese after a switch', async (status, message, english) => {
    const error = await refusal(status, message);
    expect(error.copy).toBeDefined();
    setLocale('pt-BR');
    const shown = keyedText(error.copy, error.message);
    expect(shown).not.toMatch(english);
    expect(shown).toMatch(/ChatGPT/);
  });

  it('treats a sign-in refusal as disconnected', async () => {
    await refusal(401, 'Sign in with ChatGPT to use this backend');
    expect(chatgptClient.isConnected()).toBe(false);
  });
});
