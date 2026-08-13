import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { GEMINI_MODEL_CANDIDATES, geminiClient } from '../geminiClient';

describe('GeminiClient', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    geminiClient.disconnect();
  });

  it('uses the current stable model chain', () => {
    expect(GEMINI_MODEL_CANDIDATES).toEqual([
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('initializes the current SDK, masks the key, and generates bounded content', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'Reduce mill 102 feed rate.' });

    expect(geminiClient.initialize('abcd-session-secret-wxyz')).toBe(true);
    expect(geminiClient.getMaskedApiKey()).toBe('abcd...wxyz');
    await expect(geminiClient.generateContent('plant-state-success')).resolves.toBe(
      'Reduce mill 102 feed rate.'
    );
    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'gemini-3.6-flash',
      contents: 'plant-state-success',
      config: { maxOutputTokens: 2048 },
    });
  });

  it('falls back only when the active model is unavailable', async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error('[404 Not Found] model is not found'))
      .mockResolvedValueOnce({ text: 'fallback response' });
    geminiClient.initialize('valid-test-key');

    await expect(geminiClient.generateContent('plant-state-fallback')).resolves.toBe(
      'fallback response'
    );
    expect(generateContentMock.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-3.6-flash',
      'gemini-3.5-flash',
    ]);
    expect(geminiClient.getActiveModelId()).toBe('gemini-3.5-flash');
  });

  it('opens the circuit after three ordinary failures', async () => {
    generateContentMock.mockRejectedValue(new Error('network unavailable'));
    geminiClient.initialize('valid-test-key');

    await expect(geminiClient.generateContent('failure-one')).resolves.toBeNull();
    await expect(geminiClient.generateContent('failure-two')).resolves.toBeNull();
    await expect(geminiClient.generateContent('failure-three')).resolves.toBeNull();

    expect(geminiClient.getCircuitBreakerStatus()).toEqual(
      expect.objectContaining({ failures: 3, isOpen: true })
    );
    expect(geminiClient.isConnected()).toBe(false);
  });

  it('tests connectivity through the active model and clears session credentials', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'MillOS connection successful' });
    geminiClient.initialize('short-key');

    await expect(geminiClient.testConnection()).resolves.toEqual({
      success: true,
      message: 'Connection verified (gemini-3.6-flash)',
    });
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.6-flash',
        config: { maxOutputTokens: 64 },
      })
    );

    geminiClient.disconnect();
    expect(geminiClient.getMaskedApiKey()).toBeNull();
    expect(geminiClient.isConnected()).toBe(false);
  });
});
