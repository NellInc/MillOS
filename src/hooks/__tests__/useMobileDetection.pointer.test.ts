import { afterEach, expect, it, vi } from 'vitest';
import { getMobileDetection } from '../useMobileDetection';

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setDevice(width: number, height: number, coarse: boolean) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 10 });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
});

// A touchscreen laptop at 1280x600 CSS px reported isMobile: the app forced
// walk mode with the touch-only first-person controller, turned off mouse
// orbit and drew a D-pad that answers only touch, so its mouse moved nothing.
it('keeps a touchscreen laptop driven by a mouse on the desktop controls', () => {
  setDevice(1280, 600, false);
  const detection = getMobileDetection();
  expect(detection.isMobile).toBe(false);
  expect(detection.isCompactLayout).toBe(false);
  expect(detection.isTouchDevice).toBe(true);
});

it('still treats a phone held landscape as mobile', () => {
  setDevice(844, 390, true);
  const detection = getMobileDetection();
  expect(detection.isMobile).toBe(true);
  expect(detection.isCompactLayout).toBe(true);
  expect(detection.isLandscape).toBe(true);
});
