/// <reference lib="webworker" />
/**
 * Startup bake worker: runs one `STARTUP_TEXTURE_RECIPES` recipe per request
 * and posts back every texture that recipe generated, texel buffers
 * transferred. See `sharedTextureBake.ts` for the main-thread side.
 */
import { STARTUP_TEXTURE_RECIPES, type StartupTextureRecipeName } from './startupTextureRecipes';
import { setTextureGenerationRecorder } from './textureGenerator';
import {
  bakedTextureBuffers,
  snapshotGeneratedTexture,
  type BakedTexture,
} from './textureBakeCodec';

const workerScope = self as DedicatedWorkerGlobalScope;

let generated: BakedTexture[] = [];
setTextureGenerationRecorder((key, texture) => {
  generated.push(snapshotGeneratedTexture(key, texture));
});

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  const request = event.data as { type?: unknown; recipe?: unknown } | null;
  if (request?.type !== 'bake' || typeof request.recipe !== 'string') return;
  const recipe = request.recipe as StartupTextureRecipeName;
  generated = [];
  try {
    if (!Object.prototype.hasOwnProperty.call(STARTUP_TEXTURE_RECIPES, recipe)) {
      throw new Error(`unknown recipe ${recipe}`);
    }
    STARTUP_TEXTURE_RECIPES[recipe]();
    const textures = generated;
    generated = [];
    workerScope.postMessage(
      { type: 'baked', recipe, textures },
      // Deduplicated (listing one buffer twice makes postMessage throw), mip levels included.
      bakedTextureBuffers(textures)
    );
  } catch (error) {
    generated = [];
    workerScope.postMessage({
      type: 'failed',
      recipe,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
