import { describe, expect, it } from 'vitest';
import {
  persistTexture,
  removePersistedResource,
  saveGPUSettings,
  suspendResourcePersistence,
} from '../resourcePersistence';

describe('resource persistence', () => {
  it('stops writing once Reset Simulation has suspended it', () => {
    saveGPUSettings({ lastQuality: 'high' });
    persistTexture('wood', '/textures/wood.jpg', 'test');
    expect(localStorage.getItem('millos-gpu-settings')).toContain('high');
    expect(localStorage.getItem('millos-gpu-resources')).toContain('wood');

    suspendResourcePersistence();
    localStorage.removeItem('millos-gpu-settings');
    localStorage.removeItem('millos-gpu-resources');
    saveGPUSettings({ lastQuality: 'low' });
    persistTexture('stone', '/textures/stone.jpg', 'test');
    removePersistedResource('wood');

    expect(localStorage.getItem('millos-gpu-settings')).toBeNull();
    expect(localStorage.getItem('millos-gpu-resources')).toBeNull();
  });
});
