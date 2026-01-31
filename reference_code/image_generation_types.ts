'use node';

import type { Id } from '../../../_generated/dataModel';

export type ModelResolution = {
  name: string;
  provider: 'replicate' | 'fal';
  providerModel: string;
  costs: {
    inputCostPerToken?: number;
    outputCostPerToken?: number;
    costPerImage?: number;
    costPerSecond?: number;
    costPerGeneration?: number;
    usageType: 'per_image' | 'per_second' | 'per_generation';
    usageParameter?: string;
    currency: 'USD';
    lastUpdated: number;
  } & Record<string, string| number| boolean| undefined>;
};

export type ImageGeneration = {
  imageUrl: string;
  totalCost: number;
  baseCost?: number; // Base provider cost (for ctc tracking)
  refinerCost?: number; // Refiner cost (if used)
  refinerUsed: boolean;
  finalModelName: string;
};

export type StorageResult = {
  storageId: Id<'_storage'>;
  storageUrl: string;
  hash: string;
  imageBlob: Blob;
};

export type DecompositionPlan = {
  fullScenePrompt: string;
  finalCompositionPrompt: string;
};
