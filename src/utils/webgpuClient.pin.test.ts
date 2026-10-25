import { describe, expect, it } from 'vitest';
import { isValidSRI, prebuiltAppConfig } from '@mlc-ai/web-llm';
import {
  fastLaneModelId,
  pinnedAppConfig,
  pinnedModelRecord,
  WEBGPU_MODEL_PROFILES,
  type WebGPUModelId,
} from './webgpuClient';

const ids = Object.keys(WEBGPU_MODEL_PROFILES) as WebGPUModelId[];
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

  it('builds one app config with the pinned record and the fast lane copy', () => {
    const id: WebGPUModelId = 'Qwen3.5-4B-q4f16_1-MLC';
    const lane = fastLaneModelId(id);
    const config = pinnedAppConfig(prebuiltAppConfig, id, lane);
    const main = config.model_list.find((entry) => entry.model_id === id);
    const copy = config.model_list.find((entry) => entry.model_id === lane);
    expect(main).toEqual(pinnedModelRecord(prebuilt(id)));
    expect(copy).toEqual({ ...main, model_id: lane });
    expect(config.model_list).toHaveLength(prebuiltAppConfig.model_list.length + 1);
    expect(pinnedAppConfig(prebuiltAppConfig, id).model_list).toHaveLength(
      prebuiltAppConfig.model_list.length
    );
  });
});
