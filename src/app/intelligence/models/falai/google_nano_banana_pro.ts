/**
 * Google Nano Banana Pro model definition.
 * Supports both text-to-image and image-to-image (edit) modes via fal.ai.
 */

import type { StandardImageRequest } from '../common/types';
import { runFalModel } from './provider_utils';
import type { ImageModelDef } from './types';
import { mapToValidAspectRatio } from './shared';

const MODEL_KEY = 'google/nano-banana-pro';
const MODEL_LABEL = 'Google Nano Banana Pro';
const FAL_T2I_MODEL = 'fal-ai/nano-banana-pro';
const FAL_EDIT_MODEL = 'fal-ai/nano-banana-pro/edit';

async function buildGoogleNanoBananaProInput(
  rawReq: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const req = rawReq as any as StandardImageRequest & { width: number; height: number; aspectRatio: string };
  const hasReferences = req.references && req.references.length > 0;
  
  // Map aspect ratio - nano-banana-pro accepts: auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16
  // If aspectRatio is provided, map it; otherwise use 'auto'
  let aspectRatio: string = 'auto';
  if (req.aspectRatio) {
    const mapped = mapToValidAspectRatio(req.aspectRatio);
    // Convert 'match_input_image' to 'auto' for this model
    aspectRatio = mapped === 'match_input_image' ? 'auto' : mapped;
  }
  
  // Base input common to both modes
  const baseInput: Record<string, unknown> = {
    prompt: req.prompt || 'Generate a high-quality product image',
    aspect_ratio: aspectRatio,
    output_format: 'png',
    resolution: '2K', // Default to 2K, can be overridden via options
    num_images: 1,
  };

  // Add model-specific options if provided
  if (req.options) {
    if (req.options.resolution && typeof req.options.resolution === 'string') {
      baseInput.resolution = req.options.resolution;
    }
    if (req.options.num_images && typeof req.options.num_images === 'number') {
      baseInput.num_images = req.options.num_images;
    }
    if (req.options.aspect_ratio && typeof req.options.aspect_ratio === 'string') {
      baseInput.aspect_ratio = req.options.aspect_ratio;
    }
    if (req.options.output_format && typeof req.options.output_format === 'string') {
      baseInput.output_format = req.options.output_format;
    }
    if (req.options.tiling !== undefined) {
      baseInput.tiling = !!req.options.tiling;
    }
  }

  // For edit mode, add image_urls
  if (hasReferences) {
    baseInput.image_urls = req.references;
  }

  return baseInput;
}

async function runGoogleNanoBananaPro(
  input: Record<string, unknown>,
  ...args: any[]
): Promise<{ url: string; requestId?: string }> {
  // Determine which model to use based on whether image_urls is present
  const hasImageUrls = Array.isArray(input.image_urls) && input.image_urls.length > 0;
  const modelSpecifier = hasImageUrls ? FAL_EDIT_MODEL : FAL_T2I_MODEL;

  console.log(`[Google Nano Banana Pro] Using ${hasImageUrls ? 'edit' : 'text-to-image'} model: ${modelSpecifier}`);

  const result = await runFalModel(modelSpecifier, input);
  return result;
}

export const googleNanoBananaPro: ImageModelDef = {
  key: MODEL_KEY,
  label: MODEL_LABEL,
  defaultProvider: 'fal',
  variants: {
    fal: {
      provider: 'fal',
      pricing: {
        usageType: 'per_image',
        costPerImage: 0.15, // From API docs: $0.15 per image (1K), 4K is double
        currency: 'USD',
        lastUpdated: Date.now(),
      },
      buildInput: buildGoogleNanoBananaProInput,
      run: runGoogleNanoBananaPro,
    },
  },
};
