import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { applyFirstVisitQuality, isWeakDevice } from '../firstVisitQuality';

describe('first-visit quality on weak devices', () => {
  beforeEach(() => useGraphicsStore.setState(useGraphicsStore.getInitialState(), true));
  const empty = { getItem: () => null };

  it('classifies software and integrated renderers and small devices as weak', () => {
    expect(isWeakDevice({ renderer: 'Google SwiftShader' })).toBe(true);
    expect(isWeakDevice({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620, D3D11)' })).toBe(
      true
    );
    expect(isWeakDevice({ renderer: 'Mali-G52 MC2' })).toBe(true);
    expect(
      isWeakDevice({
        renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max)',
        cores: 10,
        deviceMemoryGb: 8,
      })
    ).toBe(false);
    expect(isWeakDevice({ renderer: 'NVIDIA GeForce RTX 3060', cores: 4 })).toBe(true);
    expect(
      isWeakDevice({ renderer: 'NVIDIA GeForce RTX 3060', cores: 12, deviceMemoryGb: 8 })
    ).toBe(false);
  });

  it('opens a first visit on a weak device at Low, without counting it as a choice', () => {
    const revision = useGraphicsStore.getState().qualityChoiceRevision;
    expect(applyFirstVisitQuality(empty, () => ({ renderer: 'Google SwiftShader' }))).toBe(true);
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
    expect(useGraphicsStore.getState().qualityChoiceRevision).toBe(revision);
  });

  it('leaves a returning visitor and a capable device alone', () => {
    const saved = { getItem: () => '{"state":{"graphics":{"quality":"high"}}}' };
    expect(applyFirstVisitQuality(saved, () => ({ renderer: 'Google SwiftShader' }))).toBe(false);
    expect(
      applyFirstVisitQuality(empty, () => ({ renderer: 'Apple M2', cores: 8, deviceMemoryGb: 8 }))
    ).toBe(false);
    expect(useGraphicsStore.getState().graphics.quality).toBe('medium');
  });
});
