import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFocusRescue } from './focusRescue';

// Chromium 151 (checked with Playwright): a focused button set `disabled` loses
// focus to <body> and fires focusout with no relatedTarget. jsdom does not apply
// that rule, so blur() stands in for it here.
describe('focus rescue for a control that disables itself', () => {
  let dispose: () => void;
  let section: HTMLElement;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<main><section aria-label="Machine"><button id="maintain">Perform maintenance</button></section></main>';
    section = document.querySelector('section')!;
    button = document.querySelector('#maintain')!;
    dispose = installFocusRescue();
  });
  afterEach(() => {
    dispose();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  // Chromium's order: focus leaves for <body>, and the focusout it fires finds
  // the control already disabled, with no relatedTarget.
  const fixup = () => {
    button.focus();
    button.blur();
    button.disabled = true;
    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
  };

  it('lands on the control’s region, then hands focus back when it re-enables', async () => {
    fixup();
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(section);
    button.disabled = false;
    await Promise.resolve();
    expect(document.activeElement).toBe(button);
  });

  it('marks the landing only while focus rests on it for the busy control', () => {
    const other = document.createElement('button');
    document.body.append(other);
    fixup();
    vi.advanceTimersByTime(100);
    expect(section.hasAttribute('data-focus-rescued')).toBe(true);
    other.focus();
    expect(section.hasAttribute('data-focus-rescued')).toBe(false);
  });

  it('leaves focus a surface rescue already placed', () => {
    const other = document.createElement('button');
    section.append(other);
    fixup();
    other.focus();
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(other);
  });

  it('does not pull focus back once the player has moved on', async () => {
    const other = document.createElement('button');
    document.body.append(other);
    fixup();
    vi.advanceTimersByTime(100);
    other.focus();
    button.disabled = false;
    await Promise.resolve();
    expect(document.activeElement).toBe(other);
  });

  it('ignores an ordinary blur to another control', () => {
    const other = document.createElement('button');
    section.append(other);
    button.focus();
    other.focus();
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(other);
  });
});
