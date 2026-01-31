import { workflow } from '../../../workflow';
import { v } from 'convex/values';
import { internal } from '../../../_generated/api';
import { validateImageGenerationInputs } from '../actions/image_generation_decompose';
import type { ModelResolution } from '../actions/image_generation_types';
import { sanitizeCosts } from '../lib/costs';
import { resolveImageModelFromCode } from '../providers/image_models';
import type { Id } from '../../../_generated/dataModel';

export const generateThreadImage = workflow.define({
  args: {
    prompt: v.string(),
    referenceImageUrls: v.array(v.string()),
    filename: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    output_aspect_ratio: v.string(),
    orgSlug: v.string(),
    userId: v.id('users'),
    authUserId: v.optional(v.string()), // Auth user ID for PostHog tracking
    relatedAssetId: v.optional(v.id('assets')),
    options: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.object({
    model: v.string(),
    storageKey: v.string(),
    url: v.string(),
    /**
     * @deprecated Legacy Convex `_storage` id. New writes should not create this.
     */
    storageId: v.optional(v.id('_storage')),
    /**
     * @deprecated Use `url` (R2). This was the Convex storage URL.
     */
    storageUrl: v.optional(v.string()),
    /**
     * @deprecated Previously derived from Convex storage metadata sha256.
     */
    hash: v.optional(v.string()),
    totalCost: v.number(),
    alternateStorageKeys: v.optional(v.array(v.string())),
    /**
     * @deprecated Legacy Convex `_storage` ids. New writes should not create these.
     */
    alternateStorageIds: v.optional(v.array(v.id('_storage'))),
    costs: v.object({
      inputCostPerToken: v.optional(v.number()),
      outputCostPerToken: v.optional(v.number()),
      costPerImage: v.optional(v.number()),
      costPerSecond: v.optional(v.number()),
      costPerGeneration: v.optional(v.number()),
      usageType: v.optional(
        v.union(
          v.literal('per_image'),
          v.literal('per_second'),
          v.literal('per_generation')
        )
      ),
      usageParameter: v.optional(v.string()),
      currency: v.string(),
      lastUpdated: v.number(),
    }),
  }),
  handler: async (
    step,
    args
  ): Promise<{
    model: string;
    storageKey: string;
    url: string;
    storageId?: Id<'_storage'>;
    storageUrl?: string;
    hash?: string;
    totalCost: number;
    alternateStorageKeys?: Array<string>;
    alternateStorageIds?: Array<Id<'_storage'>>;
    costs: ModelResolution['costs'];
  }> => {
    // Validate inputs
    validateImageGenerationInputs(
      args.width,
      args.height,
      args.output_aspect_ratio
    );

    // Get model resolution
    const modelResolutionRaw = resolveImageModelFromCode(
      'google/nano-banana-pro',
      ['replicate', 'fal']
    );
    const modelResolution: ModelResolution = {
      name: modelResolutionRaw.name,
      provider:
        modelResolutionRaw.provider === 'replicate' ||
        modelResolutionRaw.provider === 'fal'
          ? modelResolutionRaw.provider
          : 'replicate',
      providerModel: modelResolutionRaw.providerModel,
      costs: modelResolutionRaw.costs,
    };

    console.log('[generateThreadImage] 🚀 Starting simple generation flow');
    console.log(
      '[generateThreadImage] 📸 Reference image URLs:',
      args.referenceImageUrls
    );

    // Compute aspect ratio for provider.
    // IMPORTANT: For edit/reference-based flows we want the provider to match the
    // input image aspect ratio directly (many models support match_input_image/auto).
    // Do NOT derive a ratio from width/height here, because callers may pass a
    // placeholder size. Instead, pass match_input_image through.
    const aspectRatio: string = (() => {
      if (args.output_aspect_ratio === 'auto') {
        // "auto" is not supported across all model adapters; normalize to match_input_image.
        return 'match_input_image';
      }
      return args.output_aspect_ratio;
    })();

    // Generate and upscale in one step
    const pipeline = await step.runAction(
      internal.products.ai.actions.run_thread_pipeline.runThreadPipeline,
      {
        provider: modelResolution.provider,
        model: modelResolution.providerModel,
        prompt: args.prompt,
        references: args.referenceImageUrls,
        width: args.width,
        height: args.height,
        aspectRatio,
        refine: true,
        costs: modelResolution.costs,
        options: args.options,
      }
    );

    console.log('[generateThreadImage] ✓ Generation and upscaling completed');

    const sanitizedCosts = sanitizeCosts(modelResolution.costs);

    console.log('[generateThreadImage] 💾 Persisting results and billing');
    // Persist and bill with retry
    const { storage, alternateStorageKeys } = await step.runAction(
      internal.products.ai.lib.persist_and_bill.persistAndBill,
      {
        finalPipeline: pipeline,
        alternatePipelines: [],
        filename: args.filename,
        billingResolution: modelResolution,
        userId: args.userId,
        orgSlug: args.orgSlug,
        usageContext: 'thread_asset',
        relatedAssetId: args.relatedAssetId,
      },
      {
        name: 'persistAndBill',
        retry: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
      }
    );

    console.log('[generateThreadImage] ✓ Persist and billing completed');

    // Step 4: Update the asset status to completed if relatedAssetId was provided
    if (args.relatedAssetId) {
      console.log(
        '[generateThreadImage] 🆙 Updating asset status to completed',
        {
          assetId: args.relatedAssetId,
          storageKey: storage.storageKey,
        }
      );

      // Extract metadata from the stored URL
      let meta: {
        width: number;
        height: number;
        fileSize: number;
        mimeType: string;
      } | null = null;
      try {
        meta = await step.runAction(
          internal.node.image_utils.extractImageMetadata,
          { url: storage.url },
          {
            name: 'extractImageMetadata',
            retry: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
          }
        );
      } catch (error) {
        console.warn(
          '[generateThreadImage] Metadata extraction failed (non-fatal):',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }

      await step.runMutation(internal.assets.mutations.updateAssetWithResult, {
        assetId: args.relatedAssetId,
        storageKey: storage.storageKey,
        url: storage.url,
        status: 'completed',
        completedAt: Date.now(),
        metadata: meta
          ? {
              width: meta.width,
              height: meta.height,
              fileSize: meta.fileSize,
              mimeType: meta.mimeType,
            }
          : {},
      });
    }
    // PostHog tracking is emitted from calculateAndChargeCosts (via persistAndBill),
    // which standardizes ctcUsd + creditsCharged + billingStatus across all image flows.

    return {
      model: pipeline.finalModelName,
      storageKey: storage.storageKey,
      url: storage.url,
      totalCost: pipeline.totalCost,
      ...(alternateStorageKeys.length > 0 ? { alternateStorageKeys } : {}),
      costs: {
        inputCostPerToken: sanitizedCosts.inputCostPerToken,
        outputCostPerToken: sanitizedCosts.outputCostPerToken,
        costPerImage: sanitizedCosts.costPerImage,
        costPerSecond: sanitizedCosts.costPerSecond,
        costPerGeneration: sanitizedCosts.costPerGeneration,
        usageType: sanitizedCosts.usageType,
        usageParameter: sanitizedCosts.usageParameter,
        currency: sanitizedCosts.currency,
        lastUpdated: sanitizedCosts.lastUpdated,
      },
    };
  },
});
