/**
 * Google Nano Banana (Gemini 2.5) model definition.
 */

import { runReplicateModel } from './provider_utils';
import type { ImageModelDef } from './types';
import { mapToValidAspectRatio } from './shared';

const MODEL_KEY = 'google/nano-banana';
const MODEL_LABEL = 'Google Nano Banana';

async function buildGoogleNanoBananaInput(
  req: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const prompt = typeof req.prompt === 'string' ? req.prompt : 'Generate a high-quality product image';
  const references = Array.isArray(req.references) ? req.references : [];
  const aspectRatio = typeof req.aspectRatio === 'string' ? req.aspectRatio : undefined;

  return {
    prompt,
    ...(references.length !== 0 ? { image_input: references } : {}),
    aspect_ratio: aspectRatio
      ? mapToValidAspectRatio(aspectRatio)
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
