/**
 * Image Generation Model Configuration
 * 
 * Centralized configuration for image generation models.
 * Update this file to switch between different models.
 */

export interface ModelConfig {
  id: string;
  name: string;
  endpoint: string;
  modelId: string;
  category: 'text-to-image' | 'image-to-image';
  requiresReferenceImage: boolean;
  supportedAspectRatios: string[];
  defaultAspectRatio: string;
  defaultResolution: string;
  defaultOutputFormat: string;
  maxImages: number;
}

/**
 * Model configurations
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro (Text-to-Image)',
    endpoint: 'https://fal.run/fal-ai/nano-banana-pro',
    modelId: 'fal-ai/nano-banana-pro',
    category: 'text-to-image',
    requiresReferenceImage: false,
    supportedAspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'],
    defaultAspectRatio: 'auto',
    defaultResolution: '1K',
    defaultOutputFormat: 'png',
    maxImages: 4,
  },
  'nano-banana-pro-edit': {
    id: 'nano-banana-pro-edit',
    name: 'Nano Banana Pro (Image-to-Image)',
    endpoint: 'https://fal.run/fal-ai/nano-banana-pro/edit',
    modelId: 'fal-ai/nano-banana-pro/edit',
    category: 'image-to-image',
    requiresReferenceImage: true,
    supportedAspectRatios: ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'],
    defaultAspectRatio: 'auto',
    defaultResolution: '1K',
    defaultOutputFormat: 'png',
    maxImages: 4,
  },
};

/**
 * Current model configuration
 * Change this to switch models
 * Options: 'nano-banana-pro' (text-to-image) or 'nano-banana-pro-edit' (image-to-image)
 */
export const CURRENT_MODEL_ID = 'nano-banana-pro';
export const CURRENT_MODEL: ModelConfig = MODEL_CONFIGS[CURRENT_MODEL_ID];

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId?: string): ModelConfig {
  if (modelId && MODEL_CONFIGS[modelId]) {
    return MODEL_CONFIGS[modelId];
  }
  return CURRENT_MODEL;
}

/**
 * Map common aspect ratios to model-specific formats
 */
export function mapAspectRatio(
  aspectRatio: string | undefined,
  modelConfig: ModelConfig = CURRENT_MODEL
): string {
  if (!aspectRatio || aspectRatio === 'auto') {
    return modelConfig.defaultAspectRatio;
  }

  // Check if the aspect ratio is directly supported
  if (modelConfig.supportedAspectRatios.includes(aspectRatio)) {
    return aspectRatio;
  }

  // Map common formats to supported formats
  const aspectRatioMap: Record<string, string> = {
    '1:1': '1:1',
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
    '4:5': '4:5',
    '3:2': '3:2',
    '2:3': '2:3',
  };

  return aspectRatioMap[aspectRatio] || modelConfig.defaultAspectRatio;
}
