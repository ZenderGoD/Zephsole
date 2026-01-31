'use node';

import { internal } from '../../../_generated/api';
import { Id } from '../../../_generated/dataModel';
import { internalAction } from '../../../_generated/server';
import { ConvexError, v } from 'convex/values';
import type { ModelResolution } from './image_generation_types';
import { validateImageGenerationInputs } from './image_generation_decompose';
import { runImageGenerationPipeline } from '../providers/image_providers';
import { sanitizeCosts } from '../lib/costs';
import { friendlyProviderErrorMessage } from '../lib/utils';
import { resolveImageModelFromCode } from '../providers/image_models';
import { createFalLoadTrackingFunctions } from '../providers/fal_load_tracking_helpers';
import { POSTHOG_PROP } from '../../../posthog_constants';

/**
 * Simplified image generation action for thread assets.
 * This action takes a reference image URL, generates an image, and upscales the result.
 */
export const generateThreadImage = internalAction({
  args: {
    prompt: v.string(),
    referenceImageUrls: v.array(v.string()),
    filename: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    output_aspect_ratio: v.string(),
    orgSlug: v.string(),
    userId: v.id('users'),
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
    ctx,
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
    try {
      // Validate inputs
      validateImageGenerationInputs(
        args.width,
        args.height,
        args.output_aspect_ratio
      );

      // Get model resolution
      const modelResolutionRaw = resolveImageModelFromCode(
        'google/nano-banana',
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

      // Generate and upscale in one step
      const { getDbIndex, getKeyLoads, incrementKeyLoad, decrementKeyLoad } =
        createFalLoadTrackingFunctions(ctx);
      const pipeline = await runImageGenerationPipeline(
        {
          provider: modelResolution.provider,
          model: modelResolution.providerModel,
          prompt: args.prompt,
          references: args.referenceImageUrls,
          refine: true,
          costs: modelResolution.costs,
        },
        getDbIndex,
        getKeyLoads,
        incrementKeyLoad,
        decrementKeyLoad
      );

      const sanitizedCosts = sanitizeCosts(modelResolution.costs);

      const { storage, alternateStorageKeys } = await ctx.runAction(
        internal.products.ai.lib.persist_and_bill.persistAndBill,
        {
          finalPipeline: pipeline,
          alternatePipelines: [],
          filename: args.filename,
          billingResolution: modelResolution,
          userId: args.userId,
          orgSlug: args.orgSlug,
          usageContext: 'thread_asset',
        }
      );

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
    } catch (err) {
      const anyErr = err as unknown;
      const userMessage =
        friendlyProviderErrorMessage(anyErr) ??
        'Thread image generation failed. Please try again later.';
      console.error('Thread image generation failed:', err);
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const e = err instanceof Error ? err : new Error(String(err));
        await ctx.runAction(internal.posthog.captureException, {
          distinctId: String(args.userId),
          errorMessage: e.message,
          errorName: e.name,
          ...(e.stack ? { errorStack: e.stack } : {}),
          properties: {
            [POSTHOG_PROP.CONTEXT_EVENT]: 'thread_image_generation_failed',
            ...(args.orgSlug ? { orgSlug: args.orgSlug } : {}),
            width: args.width,
            height: args.height,
            output_aspect_ratio: args.output_aspect_ratio,
            referenceCount: args.referenceImageUrls.length,
          },
        });
      } catch (posthogError) {
        console.warn(
          '[generateThreadImage] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      throw new ConvexError(userMessage);
    }
  },
});
