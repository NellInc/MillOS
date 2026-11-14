/**
 * sceneInteractables finds residents and the farm lessons by the names their
 * owners give them, which live in other files. A rename there would quietly
 * take the resident card and the farm lessons out of first person, so the
 * names are pinned at their source.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('scene names first person reads', () => {
  it('CommunityLife names the residents group and keys each root by its roster id', () => {
    const community = source('src/components/CommunityLife.tsx');
    expect(community).toContain('name="world-personnel"');
    expect(community).toContain('communityId: person.id');
    expect(community).toMatch(/task: emergency \?/);
  });
  it('FarmArea names the windmill and henhouse groups', () => {
    const farm = source('src/components/FarmArea.tsx');
    expect(farm).toContain('name="farm-windmill"');
    expect(farm).toContain('name="farm-henhouse"');
  });
});
