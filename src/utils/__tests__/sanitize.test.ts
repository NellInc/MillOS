import { describe, expect, it } from 'vitest';
import { sanitizeChatMessage, sanitizePlayerName, sanitizeRoomCode } from '../sanitize';

describe('multiplayer input normalization', () => {
  it('keeps plain HTML-like text idempotent for React text rendering', () => {
    const message = '<b>grain & flour</b>';

    expect(sanitizeChatMessage(message)).toBe(message);
    expect(sanitizeChatMessage(sanitizeChatMessage(message))).toBe(message);
  });

  it('strips control characters and bounds chat payloads', () => {
    expect(sanitizeChatMessage('  hello\u0000\u001f world  ')).toBe('hello world');
    expect(sanitizeChatMessage('x'.repeat(501))).toHaveLength(500);
    expect(sanitizeChatMessage(null)).toBe('');
  });

  it('enforces player name and room code contracts', () => {
    expect(sanitizePlayerName('  Nell<script>  ')).toBe('Nellscript');
    expect(sanitizePlayerName('a'.repeat(25))).toHaveLength(20);
    expect(sanitizeRoomCode(' a1-b2_c3 ')).toBe('A1B2C3');
    expect(sanitizeRoomCode('short')).toBe('');
  });
});
