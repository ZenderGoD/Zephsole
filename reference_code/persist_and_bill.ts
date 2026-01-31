'use node';

import { internalAction } from '../../../_generated/server';
import { v } from 'convex/values';
import type { Id } from '../../../_generated/dataModel';

import { internal } from '../../../_generated/api';
import {
  imageGenerationValidator,
  modelResolutionValidator,
} from '../actions/image_generation_validators';

type StorageSummary = {
  storageKey: string;
  url: string;
  /**
   * @deprecated Legacy Convex `_storage` id. New writes should not create this.
   */
  storageId?: Id<'_storage'>;
  /**
   * @deprecated Use `url` (R2). This was the Convex storage URL.
   */
  storageUrl?: string;
  /**
   * @deprecated Previously derived from Convex storage metadata sha256.
   */
  hash?: string;
};

export const persistAndBill = internalAction({
  args: {
    finalPipeline: imageGenerationValidator,
    alternatePipelines: v.array(imageGenerationValidator),
    filename: v.optional(v.string()),
    billingResolution: modelResolutionValidator,
    // User who triggered this generation (required for billing attribution)
    userId: v.id('users'),
    orgSlug: v.string(),
    relatedAssetId: v.optional(v.id('assets')),
    usageContext: v.optional(
      v.union(
        v.literal('thread_asset'),
        v.literal('product_asset'),
        v.literal('upscale'),
        v.literal('aspect_ratio_change'),
        v.literal('miscellaneous_editing')
      )
    ),
    outputWidth: v.optional(v.number()),
    outputHeight: v.optional(v.number()),
    upscaleTier: v.optional(
      v.union(v.literal('efficient'), v.literal('advanced'))
    ),
  },
  returns: v.object({
    storage: v.object({
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
    }),
    alternateStorageKeys: v.array(v.string()),
    /**
     * @deprecated Legacy Convex `_storage` ids. New writes should not create these.
     */
    alternateStorageIds: v.optional(v.array(v.id('_storage'))),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    storage: StorageSummary;
    alternateStorageKeys: Array<string>;
    alternateStorageIds?: Array<Id<'_storage'>>;
  }> => {
    console.log('[persist_and_bill] 💾 Starting persist and bill:', {
      model: args.finalPipeline.finalModelName,
      alternatePipelines: args.alternatePipelines.map((p) => p.finalModelName),
      filename: args.filename,
      orgSlug: args.orgSlug,
      relatedAssetId: args.relatedAssetId,
      usageContext: args.usageContext,
    });

    let storage: StorageSummary;
    try {
      storage = await ctx.runAction(
        internal.products.ai.actions.store_and_register_image
          .storeAndRegisterImage,
        {
          pipeline: args.finalPipeline,
          filename: args.filename,
          orgSlug: args.orgSlug,
        }
      );
    } catch {
      storage = await ctx.runAction(
        internal.products.ai.actions.image_generation_helpers
          .storeAndRegisterImage,
        {
          pipeline: args.finalPipeline,
          filename: args.filename,
          orgSlug: args.orgSlug,
        }
      );
    }

    let alternateStorageKeys: Array<string> = [];
    if (args.alternatePipelines.length > 0) {
      const settled = await Promise.allSettled(
        args.alternatePipelines.map(async (pipeline, idx) => {
          try {
            const res = await ctx.runAction(
              internal.products.ai.actions.store_and_register_image
                .storeAndRegisterImage,
              {
                pipeline,
                filename: args.filename
                  ? args.filename.replace(/(\.[^.]+)?$/, `-alt${idx + 1}$1`)
                  : undefined,
                orgSlug: args.orgSlug,
              }
            );
            return res;
          } catch {
            return await ctx.runAction(
              internal.products.ai.actions.image_generation_helpers
                .storeAndRegisterImage,
              {
                pipeline,
                filename: args.filename
                  ? args.filename.replace(/(\.[^.]+)?$/, `-alt${idx + 1}$1`)
                  : undefined,
                orgSlug: args.orgSlug,
              }
            );
          }
        })
      );
      alternateStorageKeys = settled
        .filter(
          (r): r is PromiseFulfilledResult<StorageSummary> =>
            r.status === 'fulfilled'
        )
        .map((r) => r.value.storageKey);
    }

    await ctx.runAction(
      internal.products.ai.actions.image_generation_helpers
        .calculateAndChargeCosts,
      {
        pipeline: args.finalPipeline,
        resolution: args.billingResolution,
        userId: args.userId,
        orgSlug: args.orgSlug,
        relatedAssetId: args.relatedAssetId,
        usageContext: args.usageContext,
        outputWidth: args.outputWidth,
        outputHeight: args.outputHeight,
        upscaleTier: args.upscaleTier,
      }
    );

    return {
      storage,
      alternateStorageKeys,
    };
  },
});
