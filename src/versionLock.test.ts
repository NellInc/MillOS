import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageMetadata from '../package.json';
import { SYSTEM_REGISTRY_SOURCE } from './agent/registry/systemRegistrySource.js';
import { CURRENT_RELEASE_VERSION } from './config/releaseVersions';
import { AI_NARRATIONS } from './stores/aiNarrationStore';
import { useIncidentReplayStore } from './stores/incidentReplayStore';

describe('MillOS product version lock', () => {
  it('keeps feature development on the 0.40 release line', () => {
    expect(packageMetadata.version).toBe('0.40.0');
    expect(SYSTEM_REGISTRY_SOURCE.product.version).toBe(packageMetadata.version);
    expect(AI_NARRATIONS[0].content).toContain(`MillOS ${CURRENT_RELEASE_VERSION}.`);
    expect(useIncidentReplayStore.getState().simulationSeed).toBe(
      `millos-${CURRENT_RELEASE_VERSION}-default`
    );
  });

  it('keeps retired multiplayer code out of the autonomous runtime', () => {
    expect(existsSync(resolve(process.cwd(), 'src/multiplayer'))).toBe(false);
    expect(packageMetadata.dependencies).not.toHaveProperty('peerjs');
  });
});
