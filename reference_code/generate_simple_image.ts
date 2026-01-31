import { workflow } from '../../../workflow';
import { v } from 'convex/values';
import { internal } from '../../../_generated/api';
import type { Id } from '../../../_generated/dataModel';
import type { ModelResolution } from '../actions/image_generation_types';
import { sanitizeCosts } from '../lib/costs';

export const generateSimpleImage = workflow.define({
  args: {
    prompt: v.string(),
    productReferenceStorageKeys: v.optional(v.array(v.string())),
    /**
     * @deprecated Prefer `productReferenceStorageKeys` (R2). This is legacy Convex `_storage`.
     */
    productReferenceStorageIds: v.optional(v.array(v.id('_storage'))),
    filename: v.optional(v.string()),
    orgSlug: v.string(),
    userId: v.id('users'),
    authUserId: v.optional(v.string()), // Auth user ID for PostHog tracking
    relatedAssetId: v.optional(v.id('assets')),
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
    // Resolve product references (keys preferred; ids are legacy fallback)
    const productReferenceUrls: Array<string> =
      Array.isArray(args.productReferenceStorageKeys) &&
      args.productReferenceStorageKeys.length > 0
        ? await step.runAction(
            internal.products.ai.actions.resolve_storage_urls
              .resolveStorageUrls,
            { storageKeys: args.productReferenceStorageKeys }
          )
        : Array.isArray(args.productReferenceStorageIds) &&
            args.productReferenceStorageIds.length > 0
          ? await step.runAction(
              internal.products.ai.actions.resolve_storage_urls
                .resolveStorageUrls,
              { storageIds: args.productReferenceStorageIds }
            )
          : [];

    // Run simple flow
    const simple = await step.runAction(
      internal.products.ai.flows.without_product_simple_flow
        .runWithoutProductSimpleFlow,
      {
        userPrompt: args.prompt,
        productReferenceUrls,
      }
    );

    // Update temp image URL with the latest provider URL
    if (args.relatedAssetId) {
      const interimUrl = simple.pipeline.imageUrl ?? null;
      if (interimUrl) {
        try {
          await step.runMutation(internal.assets.mutations.updateAssetTempUrl, {
            assetId: args.relatedAssetId,
            tempImageUrl: interimUrl,
          });
        } catch {}
      }
    }

    // Persist first (with retry)
    const { storage, alternateStorageKeys } = await step.runAction(
      internal.products.ai.lib.persist_only.persistOnly,
      {
        finalPipeline: simple.pipeline,
        alternatePipelines: [],
        filename: args.filename,
        orgSlug: args.orgSlug,
      },
      {
        name: 'persistOnly',
        retry: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
      }
    );

    // Finalize asset if provided
    if (args.relatedAssetId) {
      try {
        console.log(
          `[generateSimpleImage] Starting metadata extraction for asset ${args.relatedAssetId}`
        );
        // Extract metadata from storage URL with retries (same retry config as persistOnly)
        // Storage URLs may not be immediately available after persistence
        let meta: {
          width: number;
          height: number;
          fileSize: number;
          mimeType: string;
        } | null = null;

        try {
          console.log(
            `[generateSimpleImage] Attempting metadata extraction from storage URL: ${storage.url}`
          );
          meta = await step.runAction(
            internal.node.image_utils.extractImageMetadata,
            { url: storage.url },
            {
              name: 'extractImageMetadata',
              retry: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
            }
          );
          console.log(
            `[generateSimpleImage] Successfully extracted metadata from storage URL:`,
            {
              width: meta.width,
              height: meta.height,
              fileSize: meta.fileSize,
              mimeType: meta.mimeType,
            }
          );
        } catch (error) {
          console.warn(
            `[generateSimpleImage] Metadata extraction from storage URL failed, trying fallback:`,
            {
              error: error instanceof Error ? error.message : String(error),
              storageUrl: storage.url,
            }
          );
          // If storage URL fails, try fallback to original pipeline imageUrl
          try {
            console.log(
              `[generateSimpleImage] Attempting metadata extraction from fallback URL: ${simple.pipeline.imageUrl}`
            );
            meta = await step.runAction(
              internal.node.image_utils.extractImageMetadata,
              { url: simple.pipeline.imageUrl },
              {
                name: 'extractImageMetadataFallback',
                retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
              }
            );
            console.log(
              `[generateSimpleImage] Successfully extracted metadata from fallback URL:`,
              {
                width: meta.width,
                height: meta.height,
                fileSize: meta.fileSize,
                mimeType: meta.mimeType,
              }
            );
          } catch (fallbackError) {
            // Both failed - log and continue without finalizing
            console.error(
              `[generateSimpleImage] Failed to extract metadata for asset ${args.relatedAssetId}. ` +
                `Storage URL error: ${error instanceof Error ? error.message : String(error)}. ` +
                `Fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
            );
          }
        }

        // Only finalize if we have valid metadata (extractImageMetadata validates this)
        if (meta) {
          console.log(
            `[generateSimpleImage] Finalizing asset ${args.relatedAssetId} with metadata:`,
            {
              width: meta.width,
              height: meta.height,
              fileSize: meta.fileSize,
              mimeType: meta.mimeType,
              storageKey: storage.storageKey,
            }
          );
          await step.runMutation(internal.assets.mutations.finalizeAsset, {
            assetId: args.relatedAssetId as Id<'assets'>,
            imageUrl: storage.url,
            width: meta.width,
            height: meta.height,
            fileSize: meta.fileSize,
            ...(meta.mimeType ? { mimeType: meta.mimeType } : {}),
            storageKey: storage.storageKey,
            ...(alternateStorageKeys && alternateStorageKeys.length > 0
              ? { alternateStorageKeys }
              : {}),
          });
          console.log(
            `[generateSimpleImage] Successfully finalized asset ${args.relatedAssetId}`
          );
        } else {
          // Log warning but don't throw - asset will remain pending
          console.warn(
            `[generateSimpleImage] Failed to extract valid metadata for asset ${args.relatedAssetId}. ` +
              `Asset will remain pending.`
          );
        }
      } catch (error) {
        // Non-fatal: asset will remain pending or be handled elsewhere
        console.error(
          `[generateSimpleImage] Error finalizing asset ${args.relatedAssetId}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Bill after (non-throwing)
    try {
      await step.runAction(internal.products.ai.lib.bill_only.billOnly, {
        finalPipeline: simple.pipeline,
        billingResolution: simple.billingResolution,
        orgSlug: args.orgSlug,
        userId: args.userId,
        relatedAssetId: args.relatedAssetId,
      });
    } catch {}

    // PostHog tracking is emitted from calculateAndChargeCosts (via billOnly),
    // which standardizes ctcUsd + creditsCharged + billingStatus across all image flows.

    return {
      model: simple.pipeline.finalModelName,
      storageKey: storage.storageKey,
      url: storage.url,
      totalCost: simple.pipeline.totalCost,
      ...(alternateStorageKeys.length > 0 ? { alternateStorageKeys } : {}),
      costs: sanitizeCosts(simple.billingResolution.costs),
    };
  },
});
