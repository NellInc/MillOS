import { describe, expect, it } from 'vitest';
import { releaseNavigationKey } from '../cameraNavigation';

// macOS browsers send no keyup for a key released while Cmd is held: hold W,
// press Cmd (a screenshot shortcut), let go of W, then Cmd, and W stayed in
// the camera's key set, so the camera kept moving until W was pressed again.
// Working if releasing Cmd clears the held keys.
describe('releasing camera keys', () => {
  it('releases a key on its own keyup', () => {
    const keys = new Set(['KeyW', 'KeyA']);
    releaseNavigationKey(keys, { key: 'w', code: 'KeyW' });
    expect([...keys]).toEqual(['KeyA']);
  });

  it('releases every held key when Cmd is released', () => {
    const keys = new Set(['KeyW']);
    releaseNavigationKey(keys, { key: 'Meta', code: 'MetaLeft' });
    expect(keys.size).toBe(0);
  });
});
