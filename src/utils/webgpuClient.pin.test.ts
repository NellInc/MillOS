import { describe, expect, it } from 'vitest';
import { isValidSRI, prebuiltAppConfig } from '@mlc-ai/web-llm';
import {
  fastLaneDownloadGb,
  fastLaneModelId,
  modelRecordFor,
  pinnedAppConfig,
  pinnedModelRecord,
  WEBGPU_MODEL_PROFILES,
  type WebGPUModelId,
} from './webgpuClient';

const allIds = Object.keys(WEBGPU_MODEL_PROFILES) as WebGPUModelId[];
const isDerived = (id: WebGPUModelId) => 'derived' in WEBGPU_MODEL_PROFILES[id];
// Builds web-llm lists itself; derived MillOS builds are covered below.
const ids = allIds.filter((id) => !isDerived(id));
const derivedIds = allIds.filter(isDerived);
const prebuilt = (id: string) => {
  const record = prebuiltAppConfig.model_list.find((entry) => entry.model_id === id);
  if (!record) throw new Error(`web-llm has no record for ${id}`);
  return record;
};

describe('pinned model records', () => {
  it.each(ids)('%s pins the weights, the library and the hashes', (id) => {
    const record = prebuilt(id);
    const pinned = pinnedModelRecord(record);
    const pin = WEBGPU_MODEL_PROFILES[id].pin;
    expect(pinned.model).toBe(`https://huggingface.co/mlc-ai/${id}/resolve/${pin.modelCommit}/`);
    expect(pinned.model_lib).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/[0-9a-f]{40}\/web-llm-models\//
    );
    expect(pinned.integrity).toEqual(pin.integrity);
    for (const sri of [
      pin.integrity.config,
      pin.integrity.model_lib,
      ...Object.values(pin.integrity.tokenizer),
    ])
      expect(isValidSRI(sri)).toBe(true);
    // web-llm loads tokenizer.json when present and verifies only what it loads.
    expect(Object.keys(pin.integrity.tokenizer)).toEqual(['tokenizer.json']);
    // Everything else is web-llm's own record, unchanged.
    expect({ ...pinned, model: '', model_lib: '', integrity: undefined }).toEqual({
      ...record,
      model: '',
      model_lib: '',
      integrity: undefined,
    });
  });

  it.each(ids)('%s still matches the library web-llm ships, or must be re-pinned', (id) => {
    // A web-llm upgrade that moves its libraries changes this path: re-pin
    // MODEL_LIB_COMMIT and the model_lib hashes, then update the expected path.
    const record = prebuilt(id);
    expect(record.model).toBe(`https://huggingface.co/mlc-ai/${id}`);
    expect(record.model_lib).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/main\/web-llm-models\/v0_2_86\/base\//
    );
    expect(pinnedModelRecord(record).model_lib.split('/').slice(-3)).toEqual(
      record.model_lib.split('/').slice(-3)
    );
  });

  it('leaves records without a pin as they are', () => {
    const other = prebuiltAppConfig.model_list.find(
      (entry) => !(entry.model_id in WEBGPU_MODEL_PROFILES)
    );
    expect(other).toBeDefined();
    expect(pinnedModelRecord(other!)).toBe(other);
  });

  it.each(derivedIds)('%s borrows its base build record and loads its own pinned weights', (id) => {
    const profile = WEBGPU_MODEL_PROFILES[id] as unknown as {
      derived: { from: WebGPUModelId; repo: string };
      pin: { modelCommit: string; integrity: unknown };
    };
    // web-llm must not list it, or the borrowed record would never be used.
    expect(prebuiltAppConfig.model_list.some((entry) => entry.model_id === id)).toBe(false);
    const base = prebuilt(profile.derived.from);
    const record = modelRecordFor(prebuiltAppConfig, id)!;
    expect(record).toEqual({
      ...base,
      model_id: id,
      model: `https://huggingface.co/${profile.derived.repo}`,
    });
    const pinned = pinnedModelRecord(record);
    expect(pinned.model).toBe(
      `https://huggingface.co/${profile.derived.repo}/resolve/${profile.pin.modelCommit}/`
    );
    // Same library as the base build, at the same pinned commit.
    expect(pinned.model_lib).toBe(pinnedModelRecord(base).model_lib);
    expect(pinned.integrity).toEqual(profile.pin.integrity);
    // The config and tokenizer are the base build's files unchanged.
    expect(profile.pin.integrity).toEqual(
      WEBGPU_MODEL_PROFILES[profile.derived.from].pin.integrity
    );

    const config = pinnedAppConfig(prebuiltAppConfig, id, fastLaneModelId(id));
    expect(config.model_list).toHaveLength(prebuiltAppConfig.model_list.length + 2);
    expect(config.model_list.find((entry) => entry.model_id === id)).toEqual(pinned);
    expect(config.model_list.find((entry) => entry.model_id === fastLaneModelId(id))).toEqual({
      ...pinned,
      model_id: fastLaneModelId(id),
    });
    // The base build's own record is left as web-llm ships it.
    expect(config.model_list.find((entry) => entry.model_id === profile.derived.from)).toBe(base);
  });

  it('gives the Qwen3.5 fast lane to the routing build, with its own pinned record', () => {
    const id: WebGPUModelId = 'Qwen3.5-4B-q4f16_1-MLC';
    const lane = fastLaneModelId(id);
    expect(lane).toBe('Qwen3.5-4B-millos-routing-q4f16_1-MLC');
    expect(fastLaneDownloadGb(id)).toBe(WEBGPU_MODEL_PROFILES[lane as WebGPUModelId].downloadGb);
    const config = pinnedAppConfig(prebuiltAppConfig, id, lane);
    const main = config.model_list.find((entry) => entry.model_id === id);
    const routing = config.model_list.find((entry) => entry.model_id === lane);
    expect(main).toEqual(pinnedModelRecord(prebuilt(id)));
    expect(routing).toEqual(pinnedModelRecord(modelRecordFor(prebuiltAppConfig, lane)!));
    // Its own weights, the main build's library.
    expect(routing!.model).not.toBe(main!.model);
    expect(routing!.model_lib).toBe(main!.model_lib);
    expect(config.model_list).toHaveLength(prebuiltAppConfig.model_list.length + 1);
    expect(pinnedAppConfig(prebuiltAppConfig, id).model_list).toHaveLength(
      prebuiltAppConfig.model_list.length
    );
  });

  it('keeps a same-build fast lane as a copy of the main record, sharing its download', () => {
    const id: WebGPUModelId = 'Qwen3-4B-q4f16_1-MLC';
    const lane = fastLaneModelId(id);
    expect(lane).toBe(`${id}-fast-lane`);
    expect(fastLaneDownloadGb(id)).toBe(0);
    const config = pinnedAppConfig(prebuiltAppConfig, id, lane);
    const main = config.model_list.find((entry) => entry.model_id === id);
    expect(config.model_list.find((entry) => entry.model_id === lane)).toEqual({
      ...main,
      model_id: lane,
    });
    expect(config.model_list).toHaveLength(prebuiltAppConfig.model_list.length + 1);
  });
});
