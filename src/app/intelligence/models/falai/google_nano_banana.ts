/**
 * Google Nano Banana (Gemini 2.5) model definition.
 */

import type { StandardImageRequest } from '../common/types';
import { runReplicateModel } from './provider_utils';
import type { ImageModelDef } from './types';
import { mapToValidAspectRatio } from './shared';

const MODEL_KEY = 'google/nano-banana';
const MODEL_LABEL = 'Google Nano Banana';

async function buildGoogleNanoBananaInput(
  req: StandardImageRequest & { width: number; height: number; aspectRatio: string }
): Promise<Record<string, unknown>> {
  return {
    prompt: req.prompt || 'Generate a high-quality product image',
    ...(req.references && req.references.length !== 0 ? { image_input: req.references } : {}),
    aspect_ratio: req.aspectRatio
      ? mapToValidAspectRatio(req.aspectRatio)
      : 'match_input_image',
    output_format: 'png',
  };
}

export const googleNanoBanana: ImageModelDef = {
  key: MODEL_KEY,
  label: MODEL_LABEL,
  defaultProvider: 'replicate',
  variants: {
    replicate: {
      provider: 'replicate',
      pricing: {
        usageType: 'per_image',
        costPerImage: 0.039, // From DB: costPerImage: 0.039
        currency: 'USD',
        lastUpdated: Date.now(),
      },
      buildInput: buildGoogleNanoBananaInput,
      run: async (input: Record<string, unknown>) => {
        return await runReplicateModel(MODEL_KEY, input);
      },
    },
  },
};
