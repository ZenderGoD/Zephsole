import { ConvexError, v } from 'convex/values';
import { api, internal, components } from '../_generated/api';
import { workflow } from '../workflow';
import { Doc, Id } from '../_generated/dataModel';
import { vWorkflowId } from '@convex-dev/workflow';
import type { WorkflowId } from '@convex-dev/workflow';
import { vResultValidator } from '@convex-dev/workpool';
import {
  action,
  internalAction,
  internalMutation,
  mutation,
} from '../_generated/server';
import { getAuthUserId } from '../authUtils';
import {
  refineImage,
  runImageGenerationPipeline,
} from '../products/ai/providers/image_providers';
import {
  calculateUpscaleCostUsd,
  computeUpscaleFactor,
  TOPAZ_MODEL_IDENTIFIER,
  upscaleImageWithProvider,
} from '../products/ai/providers/upscalers';
import { clamp_upscale_factor } from '../products/ai/providers/upscalers/model_limits';
import { resolveImageModelFromCode } from '../products/ai/providers/image_models';
import type { ModelResolution } from '../products/ai/actions/image_generation_types';
import { resolveUrl } from '../media/resolve';
import { recordAssetCompletionEvent } from './asset_completion_events';
import { R2 } from '@convex-dev/r2';
import { POSTHOG_PROP } from '../posthog_constants';

const r2 = new R2(components.r2);

type AssetVersionHistory = NonNullable<Doc<'assets'>['versionHistory']>;
type VersionHistoryEntry = AssetVersionHistory[number];

function computeUpdatedVersionHistory(
  asset: Doc<'assets'>,
  newStorageId: Id<'_storage'> | null | undefined,
  newStorageKey: string | null | undefined,
  editType?: string
): AssetVersionHistory | null {
  const currentStorageId = asset.storageId;
  const currentStorageKey = asset.storageKey;

  // Need at least one identifier (storageId or storageKey) to track version history
  if (!currentStorageId && !currentStorageKey) {
    return null;
  }

  // Check if this is actually a change
  // A history entry should only be skipped if both storageId and storageKey are unchanged
  const currentIdStr = currentStorageId ? String(currentStorageId) : undefined;
  const newIdStr = newStorageId ? String(newStorageId) : undefined;
  if (currentIdStr === newIdStr && currentStorageKey === newStorageKey) {
    return null;
  }

  // Add current version to history
  // Include both storageId (if available) and storageKey (if available)
  const historyEntry: VersionHistoryEntry = {
    ...(currentStorageId ? { storageId: currentStorageId } : {}),
    ...(currentStorageKey ? { storageKey: currentStorageKey } : {}),
    metadata: asset.metadata ?? {},
    replacedAt: Date.now(),
    ...(editType ? { editType } : {}),
  };

  const previousHistory = Array.isArray(asset.versionHistory)
    ? asset.versionHistory
    : [];
  return [...previousHistory, historyEntry];
}

/**
 * @deprecated Legacy Convex Storage upload URL.
 *
 * All new uploads should use `api.media.uploads.generateUploadUrlForMedia`
 * (signed PUT to R2) and persist `storageKey` + `url`.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError('AUTH_REQUIRED');
    }

    throw new ConvexError(
      'LEGACY_UPLOAD_URL_DISABLED: use api.media.uploads.generateUploadUrlForMedia'
    );
  },
});

// Delete an uploaded file from storage when it is no longer needed
export const deleteUpload = mutation({
  args: {
    storageKey: v.optional(v.string()),
    /**
     * @deprecated Prefer `storageKey` (R2). This is legacy Convex `_storage`.
     */
    storageId: v.optional(v.id('_storage')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError('AUTH_REQUIRED');
    }

    if (!args.storageKey && !args.storageId) return null;

    if (args.storageKey) {
      const assetUsingKey = await ctx.db
        .query('assets')
        .withIndex('by_storageKey', (q) => q.eq('storageKey', args.storageKey))
        .first();
      if (assetUsingKey) return null;

      const linkUsingKey = await ctx.db
        .query('orgThreadLinks')
        .withIndex('by_storageKey', (q) => q.eq('storageKey', args.storageKey))
        .first();
      if (linkUsingKey) return null;

      try {
        await r2.deleteObject(ctx, args.storageKey);
      } catch {
        // Swallow errors (e.g., already deleted)
      }
      return null;
    }

    // Legacy Convex storage fallback
    const storageId = args.storageId;
    if (!storageId) return null;

    const assetUsingStorage = await ctx.db
      .query('assets')
      .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
      .first();
    if (assetUsingStorage) {
      return null;
    }

    const linkUsingStorage = await ctx.db
      .query('orgThreadLinks')
      .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
      .first();
    if (linkUsingStorage) {
      return null;
    }

    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Swallow errors (e.g., already deleted)
    }

    return null;
  },
});

// Create asset from uploaded file
export const createAssetFromUpload = mutation({
  args: {
    versionId: v.id('versions'),
    productId: v.id('products'),
    type: v.union(v.literal('image'), v.literal('video'), v.literal('3d')),
    assetGroup: v.string(),
    storageKey: v.optional(v.string()),
    /**
     * @deprecated Prefer `storageKey` (R2). This is legacy Convex `_storage`.
     */
    storageId: v.optional(v.id('_storage')),
    /**
     * Optional absolute URL for the uploaded file (e.g. R2 public URL).
     * If provided, this is used directly.
     */
    url: v.optional(v.string()),
    prompt: v.optional(v.string()),
    referenceIds: v.optional(v.array(v.id('_storage'))), // Storage IDs of files used to create this asset
    metadata: v.optional(
      v.object({
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        duration: v.optional(v.number()),
        fileSize: v.optional(v.number()),
        mimeType: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError('AUTH_REQUIRED');
    }

    // Verify version exists and get product
    const version = await ctx.db.get('versions', args.versionId);
    if (!version) {
      throw new ConvexError('VERSION_NOT_FOUND');
    }

    const product = await ctx.db.get('products', version.productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Verify user has access
    if (product.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', product.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) {
        throw new Error('Access denied');
      }
    } else if (product.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Resolve URL (R2-first). Prefer explicit url, then storageKey, then legacy storageId.
    const url = await resolveUrl(
      { url: args.url, storageKey: args.storageKey, storageId: args.storageId },
      ctx
    );
    if (!url) {
      throw new Error('File not found in storage');
    }

    const now = Date.now();
    const assetId = await ctx.db.insert('assets', {
      versionId: args.versionId,
      productId: args.productId,
      ownerId: userId,
      ...(product.organizationId && { organizationId: product.organizationId }),
      type: args.type,
      assetGroup: args.assetGroup,
      status: 'completed',
      url,
      ...(args.storageKey ? { storageKey: args.storageKey } : {}),
      ...(args.storageId ? { storageId: args.storageId } : {}),
      ...(args.prompt && { prompt: args.prompt }),
      ...(args.referenceIds && { referenceIds: args.referenceIds }),
      metadata: args.metadata || {},
      createdAt: now,
      completedAt: now,
    });

    await recordAssetCompletionEvent(ctx, {
      assetId,
      versionId: args.versionId,
      productId: args.productId,
      ...(product.organizationId
        ? { organizationId: product.organizationId }
        : {}),
      completedAt: now,
    });

    // Bump version activity
    try {
      await ctx.db.patch('versions', args.versionId, { updatedAt: now });
    } catch {}

    return assetId;
  },
});

// Create a placeholder asset
export const createPlaceholderAsset = internalMutation({
  args: {
    productId: v.optional(v.id('products')), // Keep for backward compatibility
    versionId: v.optional(v.id('versions')), // New field
    ownerId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    assetGroup: v.string(),
    prompt: v.optional(v.string()),
    tempImageUrl: v.optional(v.string()),
    imageModel: v.optional(v.string()),
    referenceIds: v.optional(v.array(v.id('_storage'))), // Storage IDs of files used to create this asset
    type: v.optional(
      v.union(v.literal('image'), v.literal('video'), v.literal('3d'))
    ), // Add type support
    upscaledFromAssetId: v.optional(v.id('assets')),
    // Aesthetic board(s) that inspired this generation
    relatedAestheticId: v.optional(v.id('aesthetics')), // deprecated - use relatedAestheticIds
    relatedAestheticIds: v.optional(v.array(v.id('aesthetics'))),
    relatedAestheticAssetId: v.optional(v.id('aestheticAssets')),
    // Optional target dimensions for pending placeholders (used for layout/aspect ratio only).
    targetWidth: v.optional(v.number()),
    targetHeight: v.optional(v.number()),
    // Optional auto-generation run identifier to group assets created from the same run
    autoGenRunId: v.optional(v.string()),
    schematicTabId: v.optional(v.string()),
    schematicSectionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Determine the version and product
    // These are derived and not reassigned after being set
    let versionId: Id<'versions'>;
    let productId: Id<'products'>;

    if (args.versionId) {
      // If versionId is provided, use it
      const version = await ctx.db.get('versions', args.versionId);
      if (!version) {
        throw new Error('Version not found');
      }
      versionId = args.versionId;
      productId = version.productId;
    } else if (args.productId) {
      // If only productId is provided, use the latest version by creation time
      const latestVersion = await ctx.db
        .query('versions')
        .withIndex('by_product', (q) => q.eq('productId', args.productId!))
        .order('desc')
        .first();

      if (!latestVersion) {
        throw new Error('No version found for this product');
      }
      versionId = latestVersion._id;
      productId = args.productId;
    } else {
      throw new Error('Either productId or versionId must be provided');
    }

    const now = Date.now();
    const assetId = await ctx.db.insert('assets', {
      versionId,
      productId,
      ownerId: args.ownerId,
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
      type: args.type || 'image', // Use provided type or default to image
      assetGroup: args.assetGroup,
      ...(args.tempImageUrl ? { tempImageUrl: args.tempImageUrl } : {}),
      status: 'pending',
      statusMessage: 'Creating Asset',
      ...(args.prompt ? { prompt: args.prompt } : {}),
      ...(args.referenceIds && { referenceIds: args.referenceIds }),
      ...(args.upscaledFromAssetId
        ? { upscaledFromAssetId: args.upscaledFromAssetId }
        : {}),
      ...(args.relatedAestheticIds && args.relatedAestheticIds.length > 0
        ? { relatedAestheticIds: args.relatedAestheticIds }
        : args.relatedAestheticId
          ? { relatedAestheticId: args.relatedAestheticId }
          : {}),
      ...(args.relatedAestheticAssetId
        ? { relatedAestheticAssetId: args.relatedAestheticAssetId }
        : {}),
      ...(args.autoGenRunId ? { autoGenRunId: args.autoGenRunId } : {}),
      // For pending placeholders, we can seed metadata width/height with the
      // intended target dimensions so masonry layouts can honor aspect ratio
      // before the final image metadata is available. FinalizeAsset will
      // overwrite these with actual dimensions when the asset is completed.
      metadata: {
        ...(typeof args.targetWidth === 'number' && args.targetWidth > 0
          ? { width: args.targetWidth }
          : {}),
        ...(typeof args.targetHeight === 'number' && args.targetHeight > 0
          ? { height: args.targetHeight }
          : {}),
        ...(args.schematicTabId ? { schematicTabId: args.schematicTabId } : {}),
        ...(args.schematicSectionId
          ? { schematicSectionId: args.schematicSectionId }
          : {}),
      },
      createdAt: now,
    });

    // Increment usage counter for the referenced aesthetic asset when it's used as inspiration.
    // We increment at placeholder creation time to reflect that this aesthetic asset was chosen
    // as inspiration, regardless of whether the generation ultimately succeeds.
    if (args.relatedAestheticAssetId) {
      try {
        const aestheticAsset = await ctx.db.get(
          'aestheticAssets',
          args.relatedAestheticAssetId
        );
        if (aestheticAsset) {
          const currentCount = aestheticAsset.usageCount ?? 0;
          await ctx.db.patch('aestheticAssets', args.relatedAestheticAssetId, {
            usageCount: currentCount + 1,
          });
        }
      } catch (error) {
        // Non-fatal: log but don't fail asset creation if usage tracking fails
        console.warn('Failed to increment aesthetic asset usage count', {
          relatedAestheticAssetId: args.relatedAestheticAssetId,
          error,
        });
      }
    }

    // Bump version activity
    try {
      await ctx.db.patch('versions', versionId, { updatedAt: now });
    } catch {}
    return assetId;
  },
});

// Finalize an asset after generation
export const finalizeAsset = internalMutation({
  args: {
    assetId: v.id('assets'),
    imageUrl: v.string(),
    width: v.number(),
    height: v.number(),
    fileSize: v.number(),
    mimeType: v.optional(v.string()),
    storageKey: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    alternateStorageKeys: v.optional(v.array(v.string())),
    alternateStorageIds: v.optional(v.array(v.id('_storage'))),
    editType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Fetch current asset to check for existing storageId
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const completedAt = Date.now();

    // Prepare patch updates
    const patchUpdates: Record<string, unknown> = {
      url: args.imageUrl,
      status: 'completed',
      statusMessage: 'Completed',
      metadata: {
        ...(asset.metadata || {}),
        width: args.width,
        height: args.height,
        fileSize: args.fileSize,
        ...(args.mimeType ? { mimeType: args.mimeType } : {}),
      },
      ...(args.storageKey ? { storageKey: args.storageKey } : {}),
      ...(args.storageId ? { storageId: args.storageId } : {}),
      ...(args.alternateStorageKeys
        ? { alternateStorageKeys: args.alternateStorageKeys }
        : {}),
      ...(args.alternateStorageIds
        ? { alternateStorageIds: args.alternateStorageIds }
        : {}),
      completedAt,
    };

    const updatedHistory = computeUpdatedVersionHistory(
      asset,
      args.storageId ?? null,
      args.storageKey ?? null,
      args.editType
    );
    if (updatedHistory) {
      patchUpdates.versionHistory = updatedHistory;
    }

    await ctx.db.patch('assets', args.assetId, patchUpdates);

    await recordAssetCompletionEvent(ctx, {
      assetId: args.assetId,
      versionId: asset.versionId,
      productId: asset.productId,
      ...(asset.organizationId ? { organizationId: asset.organizationId } : {}),
      completedAt,
    });

    // Auto-select newly created assets (from edits like remove background, inpainting)
    // Only auto-select if this is a new asset (didn't have storageId before) and it's completed
    const wasNewAsset = !asset.storageId;
    if (wasNewAsset && args.storageId) {
      try {
        const updatedAsset = await ctx.db.get('assets', args.assetId);
        if (updatedAsset) {
          // Auto-select this asset in its version
          await ctx.runMutation(
            internal.versions.mutations.setSelectedAssetInternal,
            {
              versionId: updatedAsset.versionId as Id<'versions'>,
              assetId: args.assetId,
            }
          );
        }
      } catch (error) {
        // Non-fatal: log but don't fail the finalization
        console.warn(`Failed to auto-select asset ${args.assetId}:`, error);
      }
    }

    // Bump version activity
    try {
      const updatedAsset = await ctx.db.get('assets', args.assetId);
      if (updatedAsset) {
        await ctx.db.patch('versions', updatedAsset.versionId, {
          updatedAt: Date.now(),
        });
      }
    } catch {}

    // Schedule live usage notification (non-blocking, errors are swallowed)
    try {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.actions.sendLiveUsageNotification,
        {
          kind: 'product_asset',
          assetId: args.assetId,
        }
      );
    } catch (error) {
      // Never throw - notification failures should not disrupt asset finalization
      console.error('Failed to schedule live usage notification:', error);
    }
  },
});

// Update asset costs (both ctc and cost after multiplier)
export const updateAssetCosts = internalMutation({
  args: {
    assetId: v.id('assets'),
    cost: v.number(), // Cost after multiplier (charged to credits)
    ctc: v.number(), // Cost to Company - base cost before multiplier
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      cost: args.cost,
      ctc: args.ctc,
    });
    // No version bump for cost-only changes
  },
});

// Update asset billing state (separate from asset generation status)
export const setAssetBillingState = internalMutation({
  args: {
    assetId: v.id('assets'),
    billingStatus: v.optional(
      v.union(v.literal('pending'), v.literal('charged'), v.literal('failed'))
    ),
    billingError: v.optional(v.union(v.string(), v.null())), // null to clear
    billingFailedAt: v.optional(v.union(v.number(), v.null())), // null to clear
    billingChargedAt: v.optional(v.union(v.number(), v.null())), // null to clear
  },
  handler: async (ctx, args) => {
    const patchUpdates: Record<string, unknown> = {};

    if (args.billingStatus !== undefined) {
      patchUpdates.billingStatus = args.billingStatus;
    }

    if (args.billingError !== undefined) {
      patchUpdates.billingError = args.billingError ?? undefined;
    }

    if (args.billingFailedAt !== undefined) {
      patchUpdates.billingFailedAt = args.billingFailedAt ?? undefined;
    }

    if (args.billingChargedAt !== undefined) {
      patchUpdates.billingChargedAt = args.billingChargedAt ?? undefined;
    }

    if (Object.keys(patchUpdates).length === 0) {
      return;
    }

    await ctx.db.patch('assets', args.assetId, patchUpdates);
    // No version bump for billing-only changes (same philosophy as updateAssetCosts)
  },
});

// Update the temporary image URL for an asset (for intermediate generation previews)
export const updateAssetTempUrl = internalMutation({
  args: {
    assetId: v.id('assets'),
    tempImageUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      tempImageUrl: args.tempImageUrl,
    });
    // Bump version activity
    try {
      const asset = await ctx.db.get('assets', args.assetId);
      if (asset) {
        await ctx.db.patch('versions', asset.versionId, {
          updatedAt: Date.now(),
        });
      }
    } catch {}
    return null;
  },
});

// Internal: update asset prompt
export const updateAssetPrompt = internalMutation({
  args: {
    assetId: v.id('assets'),
    prompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      prompt: args.prompt,
    });
    return null;
  },
});

// Internal: update asset aesthetic ID (deprecated - use updateAssetAestheticIds)
export const updateAssetAestheticId = internalMutation({
  args: {
    assetId: v.id('assets'),
    relatedAestheticId: v.union(v.id('aesthetics'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      relatedAestheticId: args.relatedAestheticId ?? undefined,
    });
    return null;
  },
});

// Internal: update asset aesthetic IDs (array)
export const updateAssetAestheticIds = internalMutation({
  args: {
    assetId: v.id('assets'),
    relatedAestheticIds: v.array(v.id('aesthetics')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      relatedAestheticIds:
        args.relatedAestheticIds.length > 0
          ? args.relatedAestheticIds
          : undefined,
      // Clear the old single ID field when using the new array field
      relatedAestheticId: undefined,
    });
    return null;
  },
});

// Internal: set workflow id on an asset
export const setAssetThreadId = internalMutation({
  args: {
    assetId: v.id('assets'),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      threadId: args.threadId,
    });
    return null;
  },
});

export const setAssetWorkflowId = internalMutation({
  args: {
    assetId: v.id('assets'),
    workflowId: vWorkflowId,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, { workflowId: args.workflowId });
    return null;
  },
});

/**
 * Update asset status and/or statusMessage without requiring a URL.
 * Used by workflows to provide real-time progress updates to the Jobs panel.
 */
export const updateAssetStatus = internalMutation({
  args: {
    assetId: v.id('assets'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('processing'),
        v.literal('completed'),
        v.literal('failed')
      )
    ),
    statusMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) {
      console.warn(`[updateAssetStatus] Asset not found: ${args.assetId}`);
      return null;
    }

    const updates: Record<string, unknown> = {};
    if (args.status !== undefined) {
      updates.status = args.status;
    }
    if (args.statusMessage !== undefined) {
      updates.statusMessage = args.statusMessage;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch('assets', args.assetId, updates);
    }

    return null;
  },
});

// Handle workflow completion for image generation workflows
export const handleImageWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ assetId: v.id('assets') }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(
      'handleImageWorkflowComplete - result:',
      JSON.stringify(args, null, 2)
    );
    const assetId = args.context.assetId;
    const asset = await ctx.db.get('assets', assetId);

    const hasCompletedMetadata =
      asset?.status === 'completed' &&
      typeof asset.metadata?.width === 'number' &&
      asset.metadata.width > 0 &&
      typeof asset.metadata?.height === 'number' &&
      asset.metadata.height > 0 &&
      typeof asset.metadata?.fileSize === 'number' &&
      asset.metadata.fileSize > 0;

    if (args.result.kind === 'success') {
      const returnValue = args.result.returnValue;
      if (
        returnValue &&
        typeof returnValue === 'object' &&
        !Array.isArray(returnValue)
      ) {
        // New R2 storage fields (preferred)
        const storageKey =
          'storageKey' in returnValue &&
          typeof returnValue.storageKey === 'string'
            ? returnValue.storageKey
            : undefined;
        const url =
          'url' in returnValue && typeof returnValue.url === 'string'
            ? returnValue.url
            : undefined;
        // Legacy Convex storage fields (fallback for backwards compatibility)
        const storageId =
          'storageId' in returnValue &&
          typeof returnValue.storageId === 'string'
            ? (returnValue.storageId as Id<'_storage'>)
            : undefined;
        const storageUrl =
          'storageUrl' in returnValue &&
          typeof returnValue.storageUrl === 'string'
            ? returnValue.storageUrl
            : undefined;
        const pipelineUrl =
          'imageUrl' in returnValue && typeof returnValue.imageUrl === 'string'
            ? returnValue.imageUrl
            : undefined;

        console.log('[handleImageWorkflowComplete] Return value structure:', {
          hasStorageKey: !!storageKey,
          hasUrl: !!url,
          hasStorageId: !!storageId,
          hasStorageUrl: !!storageUrl,
        });

        // Prefer new R2 fields
        if (storageKey && url) {
          // Check for duplicate finalization
          if (hasCompletedMetadata && asset?.storageKey === storageKey) {
            console.log(
              `✅ Asset ${assetId} already finalized with R2 storageKey; skipping duplicate finalize call`
            );
            return null;
          }

          console.log(
            '[handleImageWorkflowComplete] ✅ Using R2 storage fields'
          );
          await ctx.runMutation(
            internal.assets.mutations.updateAssetWithResult,
            {
              assetId,
              storageKey,
              url,
              status: 'completed',
              completedAt: Date.now(),
            }
          );
          return null;
        }

        // Fallback to legacy Convex storage fields
        if (storageId && storageUrl) {
          if (
            hasCompletedMetadata &&
            asset?.storageId &&
            String(asset.storageId) === String(storageId)
          ) {
            console.log(
              `✅ Asset ${assetId} already finalized with metadata; skipping duplicate finalize call`
            );
            return null;
          }

          console.log(
            '[handleImageWorkflowComplete] ⚠️ Falling back to legacy storage fields'
          );
          await ctx.scheduler.runAfter(
            0,
            internal.assets.actions.finalize_asset_from_storage
              .finalizeAssetFromStorage,
            {
              assetId,
              storageId,
              storageUrl,
              ...(pipelineUrl ? { pipelineUrl } : {}),
            }
          );
          console.log(
            `✅ Scheduled finalizeAssetFromStorage for asset ${assetId} (storageId=${storageId})`
          );
          return null;
        }
      }

      // Asset already finalized by another path (e.g., generateProductImage finalize)
      if (hasCompletedMetadata) {
        console.log(
          `✅ Asset ${assetId} already finalized via another path; skipping`
        );
        return null;
      }

      // Fallback: mark as failed if return value doesn't have required fields
      console.error(
        '[handleImageWorkflowComplete] ❌ Missing storage fields:',
        {
          returnValue: JSON.stringify(returnValue).substring(0, 500),
        }
      );
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage:
          'Workflow completed but missing required fields (storageKey/url or storageId/storageUrl)',
      });
    } else if (args.result.kind === 'failed') {
      // Mark asset as failed
      const errorMsg = args.result.error
        ? String(args.result.error)
        : 'Workflow failed';
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const distinctId = asset?.ownerId ? String(asset.ownerId) : null;
        if (distinctId) {
          await ctx.scheduler.runAfter(0, internal.posthog.captureException, {
            distinctId,
            errorMessage: errorMsg,
            errorName: 'WorkflowFailed',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'image_workflow_failed',
              assetId: String(assetId),
              workflowId: String(args.workflowId),
            },
          });
        }
      } catch (posthogError) {
        console.warn(
          '[handleImageWorkflowComplete] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: errorMsg,
      });
      console.error(`❌ Asset ${assetId} workflow failed:`, args.result.error);
    } else if (args.result.kind === 'canceled') {
      // Mark asset as failed with canceled message
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const distinctId = asset?.ownerId ? String(asset.ownerId) : null;
        if (distinctId) {
          await ctx.scheduler.runAfter(0, internal.posthog.captureException, {
            distinctId,
            errorMessage: 'Workflow was canceled',
            errorName: 'WorkflowCanceled',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'image_workflow_canceled',
              assetId: String(assetId),
              workflowId: String(args.workflowId),
            },
          });
        }
      } catch (posthogError) {
        console.warn(
          '[handleImageWorkflowComplete] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: 'Workflow was canceled',
      });
      console.log(`⚠️ Asset ${assetId} workflow was canceled`);
    }

    return null;
  },
});

// Handle workflow completion for video generation workflows
export const handleVideoWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ assetId: v.id('assets') }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assetId = args.context.assetId;
    const asset = await ctx.db.get('assets', assetId);
    const versionId = asset?.versionId as Id<'versions'> | undefined;
    const runIdString = args.workflowId.toString();

    const updateVideoJobStatus = async (
      status: 'completed' | 'failed',
      errorMessage?: string
    ) => {
      if (!versionId) return;
      const req = await ctx.db
        .query('versionAutoGenRequests')
        .withIndex('by_runId', (q) => q.eq('runId', runIdString))
        .first();
      if (!req?._id) return;
      await ctx.db.patch('versionAutoGenRequests', req._id, {
        status,
        completedAt: Date.now(),
        ...(errorMessage ? { errorMessage } : {}),
      });
    };

    console.log('[handleVideoWorkflowComplete] Processing workflow result:', {
      assetId,
      workflowId: args.workflowId,
      resultKind: args.result.kind,
    });

    if (args.result.kind === 'success') {
      const returnValue = args.result.returnValue;
      if (returnValue && typeof returnValue === 'object') {
        // New R2 storage fields (preferred)
        const storageKey = (returnValue as { storageKey?: string }).storageKey;
        const url = (returnValue as { url?: string }).url;
        // Legacy Convex storage fields (fallback for backwards compatibility)
        const storageId = (returnValue as { storageId?: Id<'_storage'> })
          .storageId;
        const storageUrl = (returnValue as { storageUrl?: string }).storageUrl;
        const metadata = (
          returnValue as {
            metadata?: { mimeType?: string; fileSize?: number };
          }
        ).metadata;

        console.log('[handleVideoWorkflowComplete] Return value structure:', {
          hasStorageKey: !!storageKey,
          hasUrl: !!url,
          hasStorageId: !!storageId,
          hasStorageUrl: !!storageUrl,
          hasMetadata: !!metadata,
        });

        // Prefer new R2 fields, fallback to legacy fields
        if (storageKey && url) {
          console.log(
            '[handleVideoWorkflowComplete] ✅ Using R2 storage fields'
          );
          await ctx.runMutation(
            internal.assets.mutations.updateAssetWithResult,
            {
              assetId,
              storageKey,
              url,
              status: 'completed',
              completedAt: Date.now(),
              metadata: {
                ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
                ...(typeof metadata?.fileSize === 'number'
                  ? { fileSize: metadata.fileSize }
                  : {}),
              },
            }
          );
          await updateVideoJobStatus('completed');
          return null;
        } else if (storageId && storageUrl) {
          console.log(
            '[handleVideoWorkflowComplete] ⚠️ Falling back to legacy storage fields'
          );
          await ctx.runMutation(
            internal.assets.mutations.updateAssetWithResult,
            {
              assetId,
              storageId,
              url: storageUrl,
              status: 'completed',
              completedAt: Date.now(),
              metadata: {
                ...(metadata?.mimeType ? { mimeType: metadata.mimeType } : {}),
                ...(typeof metadata?.fileSize === 'number'
                  ? { fileSize: metadata.fileSize }
                  : {}),
              },
            }
          );
          await updateVideoJobStatus('completed');
          return null;
        }
      }

      console.error(
        '[handleVideoWorkflowComplete] ❌ Missing storage fields:',
        {
          returnValue: JSON.stringify(returnValue).substring(0, 500),
        }
      );
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage:
          'Workflow completed but missing required fields for video (storageKey/url or storageId/storageUrl)',
      });
      await updateVideoJobStatus(
        'failed',
        'Workflow missing storage fields for video'
      );
      return null;
    }

    if (args.result.kind === 'failed') {
      const msg = args.result.error
        ? String(args.result.error)
        : 'Workflow failed';
      console.error('[handleVideoWorkflowComplete] ❌ Workflow failed:', {
        error: msg,
      });
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const distinctId = asset?.ownerId ? String(asset.ownerId) : null;
        if (distinctId) {
          await ctx.scheduler.runAfter(0, internal.posthog.captureException, {
            distinctId,
            errorMessage: msg,
            errorName: 'WorkflowFailed',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'video_workflow_failed',
              assetId: String(assetId),
              workflowId: String(args.workflowId),
            },
          });
        }
      } catch (posthogError) {
        console.warn(
          '[handleVideoWorkflowComplete] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: msg,
      });
      await updateVideoJobStatus('failed', msg);
      return null;
    }

    if (args.result.kind === 'canceled') {
      console.warn('[handleVideoWorkflowComplete] ⚠️ Workflow canceled');
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const distinctId = asset?.ownerId ? String(asset.ownerId) : null;
        if (distinctId) {
          await ctx.scheduler.runAfter(0, internal.posthog.captureException, {
            distinctId,
            errorMessage: 'Workflow was canceled',
            errorName: 'WorkflowCanceled',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'video_workflow_canceled',
              assetId: String(assetId),
              workflowId: String(args.workflowId),
            },
          });
        }
      } catch (posthogError) {
        console.warn(
          '[handleVideoWorkflowComplete] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: 'Workflow was canceled',
      });
      await updateVideoJobStatus('failed', 'Workflow was canceled');
      return null;
    }

    return null;
  },
});

// Handle workflow completion for 3D generation workflows
export const handle3DWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ assetId: v.id('assets') }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assetId = args.context.assetId;
    const asset = await ctx.db.get('assets', assetId);

    if (args.result.kind === 'success') {
      const returnValue = args.result.returnValue;
      if (returnValue && typeof returnValue === 'object') {
        const files = (
          returnValue as {
            files?: Array<{
              storageKey?: string;
              url?: string;
              storageId?: Id<'_storage'>;
              storageUrl?: string;
              filename?: string;
              mimeType?: string;
              fileSize?: number;
            }>;
          }
        ).files;

        const filesArr = Array.isArray(files) ? files : [];
        if (filesArr.length > 0) {
          const primary =
            filesArr.find((f) =>
              (f.filename || '').toLowerCase().endsWith('.glb')
            ) || filesArr[0]!;

          const url = primary.url || primary.storageUrl;
          if (!url) {
            console.error(
              '[handle3DWorkflowComplete] ❌ Missing URL in primary file:',
              primary
            );
            await ctx.runMutation(internal.assets.mutations.failAsset, {
              assetId,
              errorMessage: 'Workflow completed but returned file with no URL',
            });
            return null;
          }

          await ctx.runMutation(
            internal.assets.mutations.updateAssetWithResult,
            {
              assetId,
              storageKey: primary.storageKey,
              storageId: primary.storageId,
              url,
              status: 'completed',
              completedAt: Date.now(),
              metadata: {
                ...(primary.mimeType ? { mimeType: primary.mimeType } : {}),
                ...(typeof primary.fileSize === 'number'
                  ? { fileSize: primary.fileSize }
                  : {}),
              },
            }
          );
          return null;
        }
      }

      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: 'Workflow completed but returned no 3D files',
      });
      return null;
    }

    if (args.result.kind === 'failed') {
      const msg = args.result.error
        ? String(args.result.error)
        : 'Workflow failed';
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const distinctId = asset?.ownerId ? String(asset.ownerId) : null;
        if (distinctId) {
          await ctx.scheduler.runAfter(0, internal.posthog.captureException, {
            distinctId,
            errorMessage: msg,
            errorName: 'WorkflowFailed',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'three_d_workflow_failed',
              assetId: String(assetId),
              workflowId: String(args.workflowId),
            },
          });
        }
      } catch (posthogError) {
        console.warn(
          '[handle3DWorkflowComplete] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: msg,
      });
      return null;
    }

    if (args.result.kind === 'canceled') {
      // Best-effort PostHog exception capture (non-fatal)
      try {
        const distinctId = asset?.ownerId ? String(asset.ownerId) : null;
        if (distinctId) {
          await ctx.scheduler.runAfter(0, internal.posthog.captureException, {
            distinctId,
            errorMessage: 'Workflow was canceled',
            errorName: 'WorkflowCanceled',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'three_d_workflow_canceled',
              assetId: String(assetId),
              workflowId: String(args.workflowId),
            },
          });
        }
      } catch (posthogError) {
        console.warn(
          '[handle3DWorkflowComplete] Failed to capture PostHog exception (non-fatal):',
          posthogError
        );
      }
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: 'Workflow was canceled',
      });
      return null;
    }

    return null;
  },
});

/**
 * @deprecated Use `internal.assets.workflows.start_image_asset_workflow.startImageAssetWorkflow` instead.
 * This function has too many intermediate steps and is being phased out.
 */
export const internalGenerateAssetForProduct = internalAction({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetGroup: v.string(),
    prompt: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())),
    referenceIds: v.optional(v.array(v.id('_storage'))), // Storage IDs of files used to create this asset
    imageModel: v.optional(v.string()),
    targetAssetId: v.optional(v.id('assets')),
    width: v.number(),
    height: v.number(),
    output_aspect_ratio: v.string(),
    mainImageUrl: v.optional(v.string()),
    isUpdating: v.optional(v.boolean()),
    ownerId: v.optional(v.id('users')),
    aestheticId: v.optional(v.union(v.id('aesthetics'), v.null())), // deprecated - use aestheticIds
    aestheticIds: v.optional(v.array(v.id('aesthetics'))),
    brandingId: v.optional(v.id('brandings')),
  },
  returns: v.object({
    assetId: v.string(),
    workflowId: vWorkflowId,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    workflowId: WorkflowId;
  }> => {
    // Determine the version and product

    // Use provided versionId
    const version = await ctx.runQuery(
      internal.versions.queries.getVersionInternal,
      {
        versionId: args.versionId,
      }
    );
    if (!version) {
      throw new ConvexError('Version not found');
    }
    const versionId: Id<'versions'> = args.versionId as Id<'versions'>;
    const productId: Id<'products'> = version.productId as Id<'products'>;
    const product = await ctx.runQuery(
      internal.products.queries.getProductById,
      { id: productId }
    );
    if (!product) {
      throw new ConvexError('Product not found');
    }

    // Resolve org without auth (internal)
    const org = await ctx.runQuery(
      internal.organizations.queries.internalGetBySlug,
      {
        slug: args.orgSlug,
      }
    );
    if (!org) throw new ConvexError('Organization not found');

    // Determine target asset. If updating, mark the existing asset as pending.
    let assetId: Id<'assets'>;
    if (args.targetAssetId) {
      assetId = args.targetAssetId as Id<'assets'>;
      // Ensure UI shows spinner on the same asset while regeneration runs
      await ctx.runMutation(internal.assets.mutations.markAssetPending, {
        assetId,
      });
      // Update aestheticIds if provided (prefer array, fall back to single)
      if (args.aestheticIds && args.aestheticIds.length > 0) {
        await ctx.runMutation(
          internal.assets.mutations.updateAssetAestheticIds,
          {
            assetId,
            relatedAestheticIds: args.aestheticIds,
          }
        );
      } else if (args.aestheticId !== undefined) {
        await ctx.runMutation(
          internal.assets.mutations.updateAssetAestheticId,
          {
            assetId,
            relatedAestheticId: args.aestheticId,
          }
        );
      }
    } else {
      // Create placeholder asset bound to organization and version
      assetId = await ctx.runMutation(
        internal.assets.mutations.createPlaceholderAsset,
        {
          versionId,
          productId,
          ownerId: (args.ownerId ??
            (product.ownerId as Id<'users'>)) as Id<'users'>,
          organizationId: org._id as Id<'organizations'>,
          assetGroup: args.assetGroup,
          ...(args.prompt ? { prompt: args.prompt } : {}),
          ...(args.imageModel ? { imageModel: args.imageModel } : {}),
          ...(args.referenceIds ? { referenceIds: args.referenceIds } : {}),
          ...(args.aestheticIds && args.aestheticIds.length > 0
            ? { relatedAestheticIds: args.aestheticIds }
            : args.aestheticId !== undefined && args.aestheticId !== null
              ? { relatedAestheticId: args.aestheticId }
              : {}),
          // Seed target dimensions so pending placeholders render with the correct aspect ratio.
          targetWidth: args.width,
          targetHeight: args.height,
        }
      );
    }

    try {
      // If updating an existing asset, use the minimal edit flow.
      if (args.isUpdating && args.targetAssetId) {
        const target = await ctx.runQuery(
          internal.assets.queries.internalGetAsset,
          {
            id: args.targetAssetId as Id<'assets'>,
          }
        );
        if (!target) throw new ConvexError('Target asset not found');
        const baseImageUrl = await resolveUrl(
          {
            url: target.url,
            storageKey: target.storageKey,
            storageId: target.storageId,
          },
          ctx
        );
        if (!baseImageUrl) {
          throw new ConvexError('Base image URL unavailable for edit');
        }

        const started = await ctx.runMutation(
          internal.products.ai.actions.start_generate_product_image
            .startGenerateProductImage,
          {
            prompt: args.prompt ?? '',
            filename: `${args.assetGroup}-asset.png`,
            width: args.width,
            height: args.height,
            output_aspect_ratio: args.output_aspect_ratio,
            orgSlug: args.orgSlug,
            relatedAssetId: assetId,
            productImageUrl: baseImageUrl,
            isUpdating: true,
          }
        );
        return {
          assetId: assetId,
          workflowId: started.workflowId as WorkflowId,
        };
      }

      // Otherwise, use the general generation flow
      const generateImageArgs: {
        prompt?: string;
        referenceImageUrls?: Array<string>;
        filename?: string;
        width: number;
        height: number;
        output_aspect_ratio: string;
        mainImageUrl?: string | undefined;
      } = {
        filename: `${args.assetGroup}-asset.png`,
        width: args.width,
        height: args.height,
        output_aspect_ratio: args.output_aspect_ratio,
        mainImageUrl: args.mainImageUrl,
      };

      // Collect product "references" group storage IDs for the current version (internal).
      // Only completed image-type assets should be used as references for image generation.
      // We collect this BEFORE prompt generation so we can pass productStorageId to enable Describer agent.
      const byVersion: {
        assets: Record<
          string,
          Array<{
            type: 'image' | 'video' | '3d';
            status?: 'pending' | 'processing' | 'completed' | 'failed';
            storageId?: Id<'_storage'>;
            storageKey?: string;
          }>
        >;
      } = await ctx.runQuery(
        internal.assets.queries.getAssetsByVersionInternal,
        { versionId }
      );
      const versionGroupedAssets = byVersion.assets || {};

      // First, try to get assets from 'references' group (explicit reference images)
      const referenceAssets = (versionGroupedAssets['references'] || []).filter(
        (asset) =>
          asset.type === 'image' &&
          asset.status === 'completed' &&
          (Boolean(asset.storageKey) || Boolean(asset.storageId))
      );

      // If no reference assets, fallback to 'main' group (canonical product image)
      const mainAssets =
        referenceAssets.length === 0
          ? (versionGroupedAssets['main'] || []).filter(
              (asset) =>
                asset.type === 'image' &&
                asset.status === 'completed' &&
                (Boolean(asset.storageKey) || Boolean(asset.storageId))
            )
          : [];

      // Combine both sources, prioritizing references
      // Deduplicate storage IDs in case the same asset appears in both groups
      const allProductAssets = [...referenceAssets, ...mainAssets];
      const productReferenceStorageKeys: Array<string> = Array.from(
        new Set(
          allProductAssets
            .map((a) => a.storageKey)
            .filter((sk): sk is string => Boolean(sk))
        )
      );

      const productReferenceStorageIds: Array<Id<'_storage'>> = Array.from(
        new Set(
          allProductAssets
            .map((a) => a.storageId as Id<'_storage'> | undefined)
            .filter((sid): sid is Id<'_storage'> => Boolean(sid))
        )
      );

      // Use all available product storage IDs for multi-image analysis
      // This prioritizes 'references' group, then falls back to 'main' group
      // Pass all available images to enable comprehensive product analysis
      const productStorageIds =
        productReferenceStorageIds.length > 0
          ? productReferenceStorageIds
          : undefined;

      // Backward compatibility: also provide single productStorageId (first one)
      const productStorageId =
        productReferenceStorageIds.length > 0
          ? productReferenceStorageIds[0]
          : undefined;

      console.log(
        '[internalGenerateAssetForProduct] Product storage ID resolution',
        {
          hasReferenceAssets: referenceAssets.length > 0,
          referenceAssetCount: referenceAssets.length,
          hasMainAssets: mainAssets.length > 0,
          mainAssetCount: mainAssets.length,
          totalProductAssets: allProductAssets.length,
          productStorageKeyCount: productReferenceStorageKeys.length,
          productStorageIdCount: productStorageIds?.length ?? 0,
          productStorageId: productStorageId ?? null,
          assetGroupsAvailable: Object.keys(versionGroupedAssets),
        }
      );

      // Auto-generate prompt if not provided
      if (args.prompt !== undefined && args.prompt.trim()) {
        generateImageArgs.prompt = args.prompt;
      } else {
        // Call separate Node action to generate prompt using productAgent
        // Pass actual image URLs so the vision model can see the product
        const generatedPrompt = await ctx.runAction(
          internal.assets.prompt_generation.generateImagePrompt,
          {
            orgId: org._id as string,
            versionId: args.versionId,
            userId: (args.ownerId ?? product.ownerId) as Id<'users'>,
            productName: product.name,
            productDescription: product.description,
            assetGroup: args.assetGroup,
            width: args.width,
            height: args.height,
            aspectRatio: args.output_aspect_ratio,
            mainImageUrl: args.mainImageUrl,
            referenceImageUrls: args.referenceImageUrls,
            // Pass multiple product storage IDs for comprehensive analysis (preferred)
            // Also maintain backward compatibility with single productStorageId
            ...(productStorageIds && productStorageIds.length > 0
              ? { productStorageIds }
              : productStorageId
                ? { productStorageId }
                : {}),
            // When multiple aesthetics are selected, pass the full array through
            // so prompt generation can combine ideas across boards.
            ...(args.aestheticIds && args.aestheticIds.length > 0
              ? { aestheticIds: args.aestheticIds }
              : args.aestheticId
                ? { aestheticId: args.aestheticId }
                : {}),
            // Pass branding ID if provided
            ...(args.brandingId ? { brandingId: args.brandingId } : {}),
          }
        );
        generateImageArgs.prompt = generatedPrompt;
      }

      if (args.referenceImageUrls !== undefined)
        generateImageArgs.referenceImageUrls = args.referenceImageUrls;

      // Resolve effective aesthetic IDs (prefer array, fall back to single)
      const _effectiveAestheticIds =
        args.aestheticIds && args.aestheticIds.length > 0
          ? args.aestheticIds
          : args.aestheticId
            ? [args.aestheticId]
            : [];

      const started = await ctx.runMutation(
        internal.products.ai.actions.start_generate_product_image
          .startGenerateProductImage,
        {
          ...generateImageArgs,
          orgSlug: args.orgSlug,
          relatedAssetId: assetId,
          mainImageUrl: args.mainImageUrl as string,
          isUpdating: false,
          ...(productReferenceStorageKeys.length > 0
            ? { productReferenceStorageKeys }
            : {}),
          ...(productReferenceStorageIds.length > 0
            ? { productReferenceStorageIds }
            : {}),
        }
      );

      return {
        assetId: assetId,
        workflowId: started.workflowId as WorkflowId,
      };
    } catch (error) {
      // If image generation fails, revert status appropriately
      const errorMessage =
        error instanceof Error ? error.message : 'Image generation failed';
      if (args.targetAssetId) {
        // For updates on the same asset, set it back to completed so the old image shows
        await ctx.runMutation(
          internal.assets.mutations.revertAssetToCompleted,
          {
            assetId: assetId as Id<'assets'>,
            statusMessage: errorMessage,
          }
        );
      } else {
        // For newly created placeholder assets, mark as failed
        await ctx.runMutation(internal.assets.mutations.failAsset, {
          assetId: assetId as Id<'assets'>,
          errorMessage,
        });
      }
      // Re-throw the error to ensure the client knows about the failure
      throw error;
    }
  },
});

// Public wrapper that enforces auth and membership, then calls the internal action
export const generateAssetForProduct = action({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetGroup: v.string(),
    prompt: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())),
    referenceIds: v.optional(v.array(v.id('_storage'))),
    imageModel: v.optional(v.string()),
    targetAssetId: v.optional(v.id('assets')),
    width: v.number(),
    height: v.number(),
    output_aspect_ratio: v.string(),
    mainImageUrl: v.optional(v.string()),
    isUpdating: v.optional(v.boolean()),
    aestheticId: v.optional(v.union(v.id('aesthetics'), v.null())), // deprecated - use aestheticIds
    aestheticIds: v.optional(v.array(v.id('aesthetics'))),
  },
  returns: v.object({
    assetId: v.string(),
    workflowId: vWorkflowId,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    workflowId: WorkflowId;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    // Verify org and membership via public query (enforces access)
    const org = await ctx.runQuery(api.organizations.queries.getBySlug, {
      slug: args.orgSlug,
    });
    if (!org) throw new ConvexError('Organization not found or access denied');

    // Delegate to internal action with ownerId = current user
    const result = await ctx.runAction(
      internal.assets.mutations.internalGenerateAssetForProduct,
      {
        ...args,
        ownerId: userId,
      }
    );
    return {
      assetId: result.assetId,
      workflowId: result.workflowId as WorkflowId,
    };
  },
});

// Create a new asset
export const createAsset = mutation({
  args: {
    productId: v.optional(v.id('products')), // Keep for backward compatibility
    versionId: v.optional(v.id('versions')), // New field
    type: v.union(v.literal('image'), v.literal('video'), v.literal('3d')),
    assetGroup: v.string(), // Dynamic description like "main", "side-shot", "broll", etc.
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('completed'),
      v.literal('failed')
    ),
    url: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    prompt: v.optional(v.string()),
    settings: v.optional(
      v.object({
        model: v.optional(v.string()),
        parameters: v.optional(
          v.object({
            prompt: v.optional(v.string()),
            negativePrompt: v.optional(v.string()),
            steps: v.optional(v.number()),
            guidance: v.optional(v.number()),
            seed: v.optional(v.number()),
            width: v.optional(v.number()),
            height: v.optional(v.number()),
            strength: v.optional(v.number()),
            additionalParams: v.optional(v.object({})),
          })
        ),
      })
    ),
    metadata: v.optional(
      v.object({
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        duration: v.optional(v.number()),
        fileSize: v.optional(v.number()),
      })
    ),
    referenceIds: v.optional(v.array(v.id('_storage'))), // Storage IDs of files used to create this asset
    processingTimeMs: v.optional(v.number()),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    // Determine the version and product
    let versionId: Id<'versions'>;
    let productId: Id<'products'>;
    let product: Doc<'products'>;

    if (args.versionId) {
      // If versionId is provided, use it
      const version = await ctx.db.get('versions', args.versionId);
      if (!version) {
        throw new Error('Version not found');
      }
      versionId = args.versionId;
      productId = version.productId;
      const productDoc = await ctx.db.get('products', version.productId);
      if (!productDoc) {
        throw new Error('Product not found');
      }
      product = productDoc;
    } else if (args.productId) {
      // If only productId is provided, use the latest version by creation time
      const productDoc = await ctx.db.get('products', args.productId);
      if (!productDoc) {
        throw new Error('Product not found');
      }
      product = productDoc;

      const latestVersion = await ctx.db
        .query('versions')
        .withIndex('by_product', (q) => q.eq('productId', args.productId!))
        .order('desc')
        .first();

      if (!latestVersion) {
        throw new Error('No version found for this product');
      }
      versionId = latestVersion._id;
      productId = args.productId;
    } else {
      throw new Error('Either productId or versionId must be provided');
    }

    // Verify user is a member of its organization
    if (product.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', product.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) {
        throw new Error('Access denied');
      }
    } else if (product.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // If referenceIds are specified, verify they exist and user has access
    if (args.referenceIds && args.referenceIds.length > 0) {
      // Note: Storage IDs are validated by Convex automatically
      // Additional access control can be added here if needed
    }

    const now = Date.now();
    const assetId = await ctx.db.insert('assets', {
      versionId,
      productId,
      ownerId: userId,
      ...(product.organizationId && { organizationId: product.organizationId }),
      type: args.type,
      assetGroup: args.assetGroup,
      status: args.status,
      ...(args.url && { url: args.url }),
      ...(args.thumbnailUrl && { thumbnailUrl: args.thumbnailUrl }),
      ...(args.prompt && { prompt: args.prompt }),
      // settings field does not exist on assets schema
      metadata: args.metadata || {},
      ...(args.referenceIds && { referenceIds: args.referenceIds }),

      ...(args.processingTimeMs && { processingTimeMs: args.processingTimeMs }),
      ...(args.cost && { cost: args.cost }),
      createdAt: now,
      ...(args.status === 'completed' && { completedAt: now }),
    });

    return assetId;
  },
});

// Update asset (e.g., when processing completes)
export const updateAsset = mutation({
  args: {
    id: v.id('assets'),
    assetGroup: v.optional(v.string()),
    prompt: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('processing'),
        v.literal('completed'),
        v.literal('failed')
      )
    ),
    url: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    storageKey: v.optional(v.string()),
    alternateStorageIds: v.optional(v.array(v.id('_storage'))),
    alternateStorageKeys: v.optional(v.array(v.string())),
    metadata: v.optional(
      v.object({
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        duration: v.optional(v.number()),
        fileSize: v.optional(v.number()),
        mimeType: v.optional(v.string()),
        model_url: v.optional(v.string()),
        patternTileWidth: v.optional(v.number()),
        patternTileHeight: v.optional(v.number()),
        patternOverallWidth: v.optional(v.number()),
        patternOverallHeight: v.optional(v.number()),
        patternTileUnit: v.optional(v.string()),
        patternOverallUnit: v.optional(v.string()),
        patternTitle: v.optional(v.string()),
        printTitle: v.optional(v.string()),
        schematicType: v.optional(v.string()),
        schematicTechnicalSpec: v.optional(v.string()),
        schematicBOM: v.optional(v.string()),
        schematicManufacturingNotes: v.optional(v.string()),
        schematicLegendData: v.optional(v.string()),
        schematicNumberingSystem: v.optional(v.string()),
        schematicNumberingSystemRef: v.optional(v.string()),
        schematicNarrativesPlan: v.optional(v.string()),
        schematicInfographicId: v.optional(v.string()),
        schematicTabId: v.optional(v.string()),
        schematicInfographicTitle: v.optional(v.string()),
        schematicInfographicCaption: v.optional(v.string()),
        schematicInfographicAspectRatio: v.optional(v.string()),
        schematicInfographicPriority: v.optional(v.number()),
        requestId: v.optional(v.string()),
        isPrint: v.optional(v.boolean()),
      })
    ),
    processingTimeMs: v.optional(v.number()),
    cost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    const asset = await ctx.db.get('assets', args.id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    if (asset.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', asset.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) {
        throw new Error('Access denied');
      }
    } else if (asset.ownerId !== userId) {
      throw new Error('Access denied');
    }

    const { id, ...updates } = args;
    const filteredUpdatesEntries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    );
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of filteredUpdatesEntries) {
      filteredUpdates[key] = value;
    }

    // If a new storageKey is provided, compute and set the URL server-side (R2-first)
    if (updates.storageKey) {
      const url = await resolveUrl({ storageKey: updates.storageKey }, ctx);
      if (!url) {
        throw new Error('File URL could not be resolved');
      }
      filteredUpdates.url = url;
      filteredUpdates.storageKey = updates.storageKey;
      // Replacing a file implies the asset is now completed
      filteredUpdates.status = 'completed';
      filteredUpdates.completedAt = Date.now();
    }

    // Legacy: If a new storageId is provided, compute and set the URL server-side
    if (updates.storageId) {
      const url = await resolveUrl({ storageId: updates.storageId }, ctx);
      if (!url) {
        throw new Error('File not found in storage');
      }
      filteredUpdates.url = url;
      filteredUpdates.storageId = updates.storageId;
      // Replacing a file implies the asset is now completed
      filteredUpdates.status = 'completed';
      filteredUpdates.completedAt = Date.now();

      const updatedHistory = computeUpdatedVersionHistory(
        asset,
        updates.storageId,
        updates.storageKey ?? null
      );
      if (updatedHistory) {
        filteredUpdates.versionHistory = updatedHistory;
      }
    }

    // Set completedAt if status is being set to completed (and wasn't already set via storageId branch)
    if (
      !updates.storageId &&
      updates.status === 'completed' &&
      asset.status !== 'completed'
    ) {
      filteredUpdates.completedAt = Date.now();
    }

    // Prevent moving the only main asset out of the "main" group
    if (
      updates.assetGroup !== undefined &&
      updates.assetGroup !== asset.assetGroup &&
      asset.assetGroup === 'main' &&
      updates.assetGroup !== 'main'
    ) {
      const mainAssets = await ctx.db
        .query('assets')
        .withIndex('by_version_group_status', (q) =>
          q
            .eq('versionId', asset.versionId)
            .eq('assetGroup', 'main')
            .eq('status', 'completed')
        )
        .order('desc')
        .collect();

      if (mainAssets.length <= 1) {
        throw new Error(
          "Cannot move the only main asset out of the 'main' group"
        );
      }
    }

    await ctx.db.patch('assets', id, filteredUpdates);

    return await ctx.db.get('assets', id);
  },
});

// Update pattern dimensions for a repeatable pattern (stored at version level for global sharing)
export const updatePatternDimensions = mutation({
  args: {
    versionId: v.id('versions'),
    tileWidth: v.number(),
    tileHeight: v.number(),
    overallWidth: v.number(),
    overallHeight: v.number(),
    tileUnit: v.optional(v.string()),
    overallUnit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    // Get version and check access
    const version = await ctx.db.get('versions', args.versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    const product = await ctx.db.get('products', version.productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Check access via membership
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', product.organizationId).eq('userId', userId)
      )
      .first();
    if (!membership) {
      throw new Error('Access denied');
    }

    // Store pattern dimensions in version metadata (global for all patterns)
    const currentMetadata = version.metadata || {};
    await ctx.db.patch('versions', args.versionId, {
      metadata: {
        ...currentMetadata,
        patternDimensions: {
          tileWidth: args.tileWidth,
          tileHeight: args.tileHeight,
          overallWidth: args.overallWidth,
          overallHeight: args.overallHeight,
          tileUnit: args.tileUnit ?? 'px',
          overallUnit: args.overallUnit ?? 'px',
        },
      },
      updatedAt: Date.now(),
    });

    // Also update all pattern assets in this version for backwards compatibility
    const patternAssetsRepeatable = await ctx.db
      .query('assets')
      .withIndex('by_version_group', (q) =>
        q.eq('versionId', args.versionId).eq('assetGroup', 'repeatable-pattern')
      )
      .collect();
    const patternAssetsExperiment = await ctx.db
      .query('assets')
      .withIndex('by_version_group', (q) =>
        q
          .eq('versionId', args.versionId)
          .eq('assetGroup', 'repeatable-pattern-experiment')
      )
      .collect();
    const patternAssets = [
      ...patternAssetsRepeatable,
      ...patternAssetsExperiment,
    ];

    for (const asset of patternAssets) {
      const assetMetadata = asset.metadata || {};
      await ctx.db.patch('assets', asset._id, {
        metadata: {
          ...assetMetadata,
          patternTileWidth: args.tileWidth,
          patternTileHeight: args.tileHeight,
          patternOverallWidth: args.overallWidth,
          patternOverallHeight: args.overallHeight,
          patternTileUnit: args.tileUnit ?? 'px',
          patternOverallUnit: args.overallUnit ?? 'px',
        },
      });
    }

    return await ctx.db.get('versions', args.versionId);
  },
});

// Promote an alternate storage ID to be the main asset storageId, demoting the old main into alternates
export const promoteAlternateAsMain = mutation({
  args: {
    assetId: v.id('assets'),
    alternateStorageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) throw new Error('Asset not found');

    if (asset.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', asset.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) throw new Error('Access denied');
    } else if (asset.ownerId !== userId) {
      throw new Error('Access denied');
    }

    const currentMain = asset.storageId ?? null;
    const alternates = Array.isArray(asset.alternateStorageIds)
      ? [...asset.alternateStorageIds]
      : [];

    // Ensure the provided alternate exists in the alternates list or allow promotion even if not present
    // Remove the new main from alternates if it exists there
    const cleanedAlternates = alternates.filter(
      (sid) => sid !== args.alternateStorageId
    );
    // If there was a main, add it to alternates
    if (currentMain) cleanedAlternates.unshift(currentMain);

    // Compute new URL for the main storage id (legacy Convex storage IDs only)
    const newUrl = await resolveUrl(
      { storageId: args.alternateStorageId },
      ctx
    );
    if (!newUrl) throw new Error('File not found in storage');

    // Prepare patch updates
    const patchUpdates: Record<string, unknown> = {
      storageId: args.alternateStorageId,
      url: newUrl,
      alternateStorageIds: cleanedAlternates,
      status: 'completed',
      completedAt: Date.now(),
    };

    const updatedHistory = computeUpdatedVersionHistory(
      asset,
      args.alternateStorageId,
      null // promoteAlternateAsMain is legacy, no storageKey
    );
    if (updatedHistory) {
      patchUpdates.versionHistory = updatedHistory;
    }

    await ctx.db.patch('assets', args.assetId, patchUpdates);

    return await ctx.db.get('assets', args.assetId);
  },
});

// Add alternate storage IDs to an existing asset (for background variations, etc.)
export const addAlternateStorageIds = internalMutation({
  args: {
    assetId: v.id('assets'),
    alternateStorageIds: v.array(v.id('_storage')),
  },
  returns: v.any(), // Returns the full asset document
  handler: async (ctx, args) => {
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) throw new Error('Asset not found');

    const existingAlternates = Array.isArray(asset.alternateStorageIds)
      ? [...asset.alternateStorageIds]
      : [];

    // Add new alternates, avoiding duplicates
    const newAlternates = [...existingAlternates];
    for (const sid of args.alternateStorageIds) {
      if (!newAlternates.includes(sid)) {
        newAlternates.push(sid);
      }
    }

    await ctx.db.patch('assets', args.assetId, {
      alternateStorageIds: newAlternates,
    });

    return await ctx.db.get('assets', args.assetId);
  },
});

// Restore a version from versionHistory to be the current version
export const restoreVersionFromHistory = mutation({
  args: {
    assetId: v.id('assets'),
    versionStorageId: v.optional(v.id('_storage')),
    versionStorageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) throw new Error('Asset not found');

    if (asset.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', asset.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) throw new Error('Access denied');
    } else if (asset.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Must provide either storageId or storageKey
    if (!args.versionStorageId && !args.versionStorageKey) {
      throw new Error(
        'Either versionStorageId or versionStorageKey must be provided'
      );
    }

    // Find the version in history by storageId or storageKey
    const versionHistory = Array.isArray(asset.versionHistory)
      ? asset.versionHistory
      : [];
    const versionEntry = versionHistory.find((entry) => {
      if (args.versionStorageId && entry.storageId) {
        return String(entry.storageId) === String(args.versionStorageId);
      }
      if (args.versionStorageKey && entry.storageKey) {
        return entry.storageKey === args.versionStorageKey;
      }
      return false;
    });

    if (!versionEntry) {
      throw new Error('Version not found in history');
    }

    // Get current storage identifiers
    const currentStorageId = asset.storageId ?? null;
    const currentStorageKey = asset.storageKey ?? null;

    // Must have at least one current identifier to restore
    if (!currentStorageId && !currentStorageKey) {
      throw new Error('Current asset has no storage identifier');
    }

    // Get URL for the version to restore (supports both storageId and storageKey)
    const newUrl = await resolveUrl(
      {
        storageId: args.versionStorageId ?? undefined,
        storageKey: args.versionStorageKey ?? undefined,
      },
      ctx
    );
    if (!newUrl) throw new Error('File not found in storage');

    // Remove the version from history (since it's becoming current)
    const updatedHistory = versionHistory.filter((entry) => {
      if (args.versionStorageId && entry.storageId) {
        return String(entry.storageId) !== String(args.versionStorageId);
      }
      if (args.versionStorageKey && entry.storageKey) {
        return entry.storageKey !== args.versionStorageKey;
      }
      return true; // Keep entries that don't match
    });

    // Add current storage identifiers to history
    const historyEntry: VersionHistoryEntry = {
      ...(currentStorageId ? { storageId: currentStorageId } : {}),
      ...(currentStorageKey ? { storageKey: currentStorageKey } : {}),
      metadata: asset.metadata ?? {},
      replacedAt: Date.now(),
    };
    updatedHistory.push(historyEntry);

    // Prepare patch updates - restore the version's storage identifiers
    const patchUpdates: Record<string, unknown> = {
      url: newUrl,
      versionHistory: updatedHistory,
      // Update metadata from the restored version
      metadata: {
        ...asset.metadata,
        ...versionEntry.metadata,
      },
      status: 'completed',
      completedAt: Date.now(),
    };

    // Restore storageId if provided
    if (args.versionStorageId) {
      patchUpdates.storageId = args.versionStorageId;
    }
    // Restore storageKey if provided
    if (args.versionStorageKey) {
      patchUpdates.storageKey = args.versionStorageKey;
    }
    // If version entry has both, restore both
    if (versionEntry.storageId) {
      patchUpdates.storageId = versionEntry.storageId;
    }
    if (versionEntry.storageKey) {
      patchUpdates.storageKey = versionEntry.storageKey;
    }

    await ctx.db.patch('assets', args.assetId, patchUpdates);

    return await ctx.db.get('assets', args.assetId);
  },
});

// Delete a version from versionHistory
export const deleteVersionFromHistory = mutation({
  args: {
    assetId: v.id('assets'),
    versionStorageId: v.id('_storage'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) throw new Error('Asset not found');

    if (asset.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', asset.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) throw new Error('Access denied');
    } else if (asset.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Find and remove the version from history
    const versionHistory = Array.isArray(asset.versionHistory)
      ? asset.versionHistory
      : [];
    const updatedHistory = versionHistory.filter(
      (entry) => String(entry.storageId) !== String(args.versionStorageId)
    );

    if (updatedHistory.length === versionHistory.length) {
      throw new Error('Version not found in history');
    }

    // Optionally delete the storage file (be careful - it might be used by other assets)
    // For now, we'll just remove it from history but keep the file
    // In the future, we could add a check to see if the file is used elsewhere

    // Prepare patch updates
    const patchUpdates: Record<string, unknown> = {
      versionHistory: updatedHistory,
    };

    await ctx.db.patch('assets', args.assetId, patchUpdates);

    return { success: true };
  },
});

// Delete asset
export const deleteAsset = mutation({
  args: { id: v.id('assets') },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    const asset = await ctx.db.get('assets', args.id);
    if (!asset) {
      throw new Error('Asset not found');
    }

    if (asset.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', asset.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) {
        throw new Error('Access denied');
      }
    } else if (asset.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Prevent deleting the only main asset
    if (asset.assetGroup === 'main') {
      const mainAssets = await ctx.db
        .query('assets')
        .withIndex('by_version_group_status', (q) =>
          q
            .eq('versionId', asset.versionId)
            .eq('assetGroup', 'main')
            .eq('status', 'completed')
        )
        .order('desc')
        .collect();

      if (mainAssets.length <= 1) {
        throw new Error('Cannot delete the only main asset');
      }
    }

    // Additional checks can be added here if needed

    // Note: With referenceIds approach, we don't need to delete child assets
    // as there's no parent-child relationship anymore

    // Delete related credit transactions for the main asset
    // Use the by_related_asset index to query directly by asset ID
    const creditTransactions = await ctx.db
      .query('creditTransactions')
      .withIndex('by_related_asset', (q) => q.eq('relatedAssetId', asset._id))
      .collect();

    for (const transaction of creditTransactions) {
      await ctx.db.delete('creditTransactions', transaction._id);
    }

    // Delete storage file for the main asset if present (R2-first; legacy fallback)
    if (asset.storageKey) {
      try {
        await r2.deleteObject(ctx, asset.storageKey);
      } catch {
        /* ignore */
      }
    } else if (asset.storageId) {
      try {
        await ctx.storage.delete(asset.storageId);
      } catch {
        /* ignore */
      }
    }

    await ctx.db.delete('assets', args.id);
    return { success: true };
  },
});

// Internal mutation to delete asset (no auth checks, for use in actions)
export const deleteAssetInternal = internalMutation({
  args: { assetId: v.id('assets') },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) {
      return { success: false, error: 'Asset not found' };
    }

    // Delete related credit transactions
    const creditTransactions = await ctx.db
      .query('creditTransactions')
      .withIndex('by_related_asset', (q) => q.eq('relatedAssetId', asset._id))
      .collect();

    for (const transaction of creditTransactions) {
      await ctx.db.delete('creditTransactions', transaction._id);
    }

    // Delete storage file (R2-first; legacy fallback)
    if (asset.storageKey) {
      try {
        await r2.deleteObject(ctx, asset.storageKey);
      } catch {
        /* ignore */
      }
    } else if (asset.storageId) {
      try {
        await ctx.storage.delete(asset.storageId);
      } catch {
        /* ignore */
      }
    }

    await ctx.db.delete('assets', args.assetId);
    return { success: true };
  },
});

// Archive an asset (mark as deleted but keep in database)
export const archiveAsset = mutation({
  args: {
    assetId: v.id('assets'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error('Authentication required');
    }

    // Verify user owns the asset
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', asset.organizationId).eq('userId', userId)
      )
      .first();
    if (!membership) {
      throw new Error('Access denied');
    }

    // Archive the asset by marking it as deleted
    await ctx.db.patch('assets', args.assetId, {
      status: 'failed', // Use failed status to indicate archived
      statusMessage: 'Asset archived',
    });

    return { success: true };
  },
});

// Generate video asset using fal-ai
export const generateVideoAsset = action({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetGroup: v.string(),
    prompt: v.optional(v.string()),
    negativePrompt: v.optional(v.string()), // Negative prompt to prevent unwanted elements
    referenceImageUrl: v.optional(v.string()),
    tailImageUrl: v.optional(v.string()), // For first-frame/last-frame feature (Kling 2.5 only)
    referenceIds: v.optional(v.array(v.id('_storage'))), // Storage IDs of files used to create this asset
    modelName: v.string(), // Model name for video generation
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    generateAudio: v.optional(v.boolean()), // Whether to generate audio for the video
  },
  returns: v.object({
    assetId: v.string(),
    workflowId: vWorkflowId,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    workflowId: WorkflowId;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    const version = await ctx.runQuery(api.versions.queries.getVersion, {
      versionId: args.versionId,
    });
    if (!version) {
      throw new ConvexError('Version not found');
    }
    const versionId: Id<'versions'> = args.versionId as Id<'versions'>;
    const productId: Id<'products'> = version.productId as Id<'products'>;

    // Validate orgSlug is not empty
    if (!args.orgSlug || args.orgSlug.trim() === '') {
      throw new ConvexError('Organization slug is required');
    }

    const org = await ctx.runQuery(api.organizations.queries.getBySlug, {
      slug: args.orgSlug.trim(),
    });
    if (!org || !org._id) {
      throw new ConvexError('Organization not found or access denied');
    }

    // Pre-generation credit and rate checks (server-side guard)
    const defaults = await ctx.runQuery(
      api.organizations.queries.getDefaultOrgCostsLatest
    );
    const videoCost = defaults?.video ?? 0.75;

    const preCheck = await ctx.runQuery(
      api.organizations.edge_case_handlers.preGenerationCheck,
      {
        orgSlug: args.orgSlug,
        estimatedCost: videoCost,
      }
    );
    if (!preCheck.canProceed) {
      const primary = preCheck.blockers.find(
        (b: { severity?: string }) => b.severity === 'error'
      );
      const message = primary?.message || 'Pre-check failed';
      throw new ConvexError(`Generation blocked: ${message}`);
    }

    let effectivePrompt: string | undefined = args.prompt ?? undefined;

    // If prompt not provided, try to generate from referenceImageUrl
    if (!effectivePrompt && args.referenceImageUrl) {
      try {
        // Get product context for better prompt generation
        const product = await ctx.runQuery(
          internal.products.queries.getProductByVersionId,
          {
            versionId: args.versionId,
          }
        );

        // Add timeout wrapper to prevent action timeout (30 seconds max for prompt generation)
        const promptPromise = ctx.runAction(
          internal.products.ai.actions.generation_actions
            .generateVideoPromptFromImage,
          {
            imageUrl: args.referenceImageUrl,
            tailImageUrl: args.tailImageUrl, // Pass tail image for first-frame/last-frame analysis
            orgSlug: args.orgSlug,
            userId,
            productName: version.name,
            productDescription: version.description || product?.description,
            productCategory: product?.category,
            assetGroup: args.assetGroup,
            durationSeconds: args.durationSeconds, // Pass duration for pacing adaptation
            generateAudio: args.generateAudio, // Pass audio setting for prompt adaptation
          }
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Prompt generation timeout')),
            30000
          ); // 30 seconds
        });

        const p = await Promise.race([promptPromise, timeoutPromise]);
        effectivePrompt = p.prompt;
      } catch (e) {
        console.info('Prompt generation failed or timed out, using default', e);
        effectivePrompt =
          'Smooth parallax and subtle camera dolly around the subject, gentle lighting flicker, 3–4s loop, cinematic, natural motion.';
      }
    }

    // If prompt was provided by the user, enhance it instead of generating
    if (args.prompt && !effectivePrompt?.includes('Target duration')) {
      try {
        // Add timeout wrapper to prevent action timeout (20 seconds max for prompt enhancement)
        const enhancePromise = ctx.runAction(
          internal.products.ai.actions.generation_actions
            .enhanceVideoPromptFromText,
          { prompt: args.prompt, orgSlug: args.orgSlug, userId }
        );

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Prompt enhancement timeout')),
            20000
          ); // 20 seconds
        });

        const enhanced = await Promise.race([enhancePromise, timeoutPromise]);
        effectivePrompt = enhanced.prompt;
        if (!args.negativePrompt && enhanced.negativePrompt) {
          // If server returned a negative prompt and none was provided, use it
          args.negativePrompt = enhanced.negativePrompt;
        }
      } catch (e) {
        console.info(
          'Prompt enhancement failed or timed out, using original',
          e
        );
        effectivePrompt = args.prompt;
      }
    }

    // Clamp and normalize requested duration to provider-supported bounds
    const normalizedSeconds =
      typeof args.durationSeconds === 'number' && args.durationSeconds > 0
        ? Math.max(5, Math.min(10, Math.round(args.durationSeconds)))
        : 5;

    // Store duration in prompt for badge display
    const promptWithDuration = effectivePrompt
      ? `${effectivePrompt} Target duration: ~${normalizedSeconds} seconds.`
      : `Target duration: ~${normalizedSeconds} seconds.`;

    const assetId = await ctx.runMutation(
      internal.assets.mutations.createPlaceholderAsset,
      {
        versionId,
        productId,
        ownerId: userId,
        organizationId: org._id as Id<'organizations'>,
        assetGroup: args.assetGroup,
        type: 'video',
        ...(promptWithDuration ? { prompt: promptWithDuration } : {}),
        ...(args.referenceIds ? { referenceIds: args.referenceIds } : {}),
      }
    );

    // Defer credit charge; credits and storing handled in workflow steps

    try {
      if (!args.referenceImageUrl) {
        throw new ConvexError(
          'referenceImageUrl is required for image-to-video'
        );
      }
      // Ensure negative prompt always includes text prevention and smooth ending requirements
      const baseNegativePrompt =
        'no text, no words, no letters, no captions, no subtitles, no watermarks, no logos, no writing, no typography, no abrupt ending, no sudden cuts, no jarring transitions';
      const finalNegativePrompt = args.negativePrompt
        ? `${args.negativePrompt}, ${baseNegativePrompt}`
        : baseNegativePrompt;

      const workflowId: WorkflowId = await workflow.start(
        ctx,
        internal.products.ai.workflows.generate_video.generateVideo,
        {
          ...(effectivePrompt ? { prompt: effectivePrompt } : {}),
          negativePrompt: finalNegativePrompt,
          referenceImageUrl: args.referenceImageUrl,
          ...(args.tailImageUrl ? { tailImageUrl: args.tailImageUrl } : {}), // For first-frame/last-frame feature (Kling 2.5 only)
          filename: `${args.assetGroup}-video.mp4`,
          ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
          orgSlug: args.orgSlug,
          userId,
          relatedAssetId: assetId,
          desiredModelName: args.modelName,
          ...(typeof args.durationSeconds === 'number'
            ? { durationSeconds: args.durationSeconds }
            : {}),
        },
        {
          onComplete: internal.assets.mutations.handleVideoWorkflowComplete,
          context: { assetId },
        }
      );

      // Track the workflow on the asset
      try {
        await ctx.runMutation(internal.assets.mutations.setAssetWorkflowId, {
          assetId,
          workflowId,
        });
      } catch {}

      // Return immediately; UI doesn't need to wait for completion
      return { assetId, workflowId };
    } catch (error) {
      // Mark placeholder asset as failed on any downstream error
      const message =
        error instanceof Error ? error.message : 'Video generation failed';
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: message,
      });
      throw error;
    }
  },
});

// Generate video asset using mutation (faster, no prompt generation timeout)
export const generateVideoAssetMutation = mutation({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetGroup: v.string(),
    prompt: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    referenceImageUrl: v.string(),
    tailImageUrl: v.optional(v.string()), // For first-frame/last-frame feature (Kling 2.5 only)
    referenceIds: v.optional(v.array(v.id('_storage'))),
    modelName: v.string(),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    generateAudio: v.optional(v.boolean()), // Whether to generate audio for the video
    audioPrompt: v.optional(v.string()), // Audio description/preset (e.g., "upbeat", "cinematic", "ambient")
    shouldGeneratePrompt: v.optional(v.boolean()), // Whether to generate prompt via AI in the workflow
    shouldEnhancePrompt: v.optional(v.boolean()), // Whether to enhance provided prompt via AI in the workflow
  },
  returns: v.object({
    assetId: v.string(),
    workflowId: vWorkflowId,
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    workflowId: WorkflowId;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    const version = await ctx.db.get('versions', args.versionId);
    if (!version) {
      throw new ConvexError('Version not found');
    }
    const productId: Id<'products'> = version.productId as Id<'products'>;
    const product = await ctx.db.get('products', productId);
    if (!product) {
      throw new ConvexError('Product not found');
    }

    // Validate orgSlug is not empty
    if (!args.orgSlug || args.orgSlug.trim() === '') {
      throw new ConvexError('Organization slug is required');
    }

    const org = await ctx.db
      .query('organizations')
      .withIndex('by_slug', (q) => q.eq('slug', args.orgSlug.trim()))
      .first();
    if (!org || !org._id) {
      throw new ConvexError('Organization not found or access denied');
    }

    // Verify user is a member of the organization
    const membership = await ctx.db
      .query('members')
      .withIndex('by_org_user', (q) =>
        q.eq('organizationId', org._id).eq('userId', userId)
      )
      .first();
    if (!membership) {
      throw new ConvexError('Organization not found or access denied');
    }

    // Check if member generation is allowed
    if (membership.role === 'member' && !org.settings.allowMemberGeneration) {
      throw new ConvexError('Member generation not allowed');
    }

    // Use provided prompt or default, unless we're going to generate it in the workflow
    let effectivePrompt: string | undefined = args.prompt;
    if (!effectivePrompt && !args.shouldGeneratePrompt) {
      console.log(
        '[generateVideoAssetMutation] Prompt is falsy and shouldGeneratePrompt is false, using generic fallback'
      );
      effectivePrompt =
        'Smooth parallax and subtle camera dolly around the subject, gentle lighting flicker, 3–4s loop, cinematic, natural motion.';
    } else if (effectivePrompt) {
      console.log('[generateVideoAssetMutation] Using provided prompt:', {
        length: effectivePrompt.length,
        preview: effectivePrompt.substring(0, 150),
      });
    } else {
      console.log(
        '[generateVideoAssetMutation] Prompt is missing but shouldGeneratePrompt is true, will generate in workflow'
      );
    }

    // Clamp and normalize requested duration
    const normalizedSeconds =
      typeof args.durationSeconds === 'number' && args.durationSeconds > 0
        ? Math.max(5, Math.min(10, Math.round(args.durationSeconds)))
        : 5;

    // Store duration in prompt for badge display
    const promptWithDuration = effectivePrompt
      ? `${effectivePrompt} Target duration: ~${normalizedSeconds} seconds.`
      : `Target duration: ~${normalizedSeconds} seconds.`;

    const startedAt = Date.now();
    const videoJobTitle = 'Video generation';
    const videoJobSubtitle = `Video generation (${normalizedSeconds}s)`;

    // Create placeholder asset
    // Note: We'll set autoGenRunId after workflowId is created, but we need to create the asset first
    const assetId = await ctx.runMutation(
      internal.assets.mutations.createPlaceholderAsset,
      {
        versionId: args.versionId,
        productId,
        ownerId: userId,
        organizationId: org._id as Id<'organizations'>,
        assetGroup: args.assetGroup,
        type: 'video',
        ...(promptWithDuration ? { prompt: promptWithDuration } : {}),
        ...(args.referenceIds ? { referenceIds: args.referenceIds } : {}),
      }
    );

    // Ensure negative prompt always includes text prevention and smooth ending requirements
    const baseNegativePrompt =
      'no text, no words, no letters, no captions, no subtitles, no watermarks, no logos, no writing, no typography, no abrupt ending, no sudden cuts, no jarring transitions';
    const finalNegativePrompt = args.negativePrompt
      ? `${args.negativePrompt}, ${baseNegativePrompt}`
      : baseNegativePrompt;

    let workflowId: WorkflowId | null = null;
    try {
      // Start workflow immediately
      workflowId = await workflow.start(
        ctx,
        internal.products.ai.workflows.generate_video.generateVideo,
        {
          ...(effectivePrompt ? { prompt: effectivePrompt } : {}),
          negativePrompt: finalNegativePrompt,
          referenceImageUrl: args.referenceImageUrl,
          ...(args.tailImageUrl ? { tailImageUrl: args.tailImageUrl } : {}), // For first-frame/last-frame feature (Kling 2.5 only)
          filename: `${args.assetGroup}-video.mp4`,
          ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
          orgSlug: args.orgSlug,
          userId,
          relatedAssetId: assetId,
          // Force Kling 2.5 when tailImageUrl is provided (first-frame/last-frame feature)
          desiredModelName: args.tailImageUrl
            ? 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
            : args.modelName,
          ...(typeof args.durationSeconds === 'number'
            ? { durationSeconds: args.durationSeconds }
            : {}),
          ...(args.generateAudio !== undefined
            ? { generateAudio: args.generateAudio }
            : {}),
          ...(args.audioPrompt ? { audioPrompt: args.audioPrompt } : {}),
          // New parameters for "whole system" workflow
          shouldGeneratePrompt: args.shouldGeneratePrompt,
          shouldEnhancePrompt: args.shouldEnhancePrompt,
          productName: product.name,
          productCategory: product.category,
          productDescription: product.description,
          assetGroup: args.assetGroup,
        },
        {
          onComplete: internal.assets.mutations.handleVideoWorkflowComplete,
          context: { assetId },
        }
      );

      // Track the workflow on the asset and link it to the job
      try {
        await ctx.runMutation(internal.assets.mutations.setAssetWorkflowId, {
          assetId,
          workflowId,
        });
        // Link asset to the job by setting autoGenRunId (must happen before job creation)
        await ctx.db.patch('assets', assetId, {
          autoGenRunId: workflowId.toString(),
        });
      } catch (patchError) {
        console.error(
          '[generateVideoAssetMutation] Failed to link asset to job',
          {
            assetId,
            workflowId: workflowId.toString(),
            error: patchError,
          }
        );
        // Continue even if patch fails - job will still be created
      }

      // Create a job entry for the jobs panel (after asset is linked)
      try {
        await ctx.db.insert('versionAutoGenRequests', {
          versionId: args.versionId,
          organizationId: org._id as Id<'organizations'>,
          orgSlug: args.orgSlug,
          createdBy: userId,
          source: 'manual',
          status: 'running',
          title: videoJobTitle,
          subtitle: videoJobSubtitle,
          prompt: effectivePrompt ?? 'Video generation',
          numImages: 1,
          kind: 'other',
          createdAt: startedAt,
          startedAt,
          runId: workflowId.toString(),
        });
      } catch (jobError) {
        console.error(
          '[generateVideoAssetMutation] Failed to create job entry',
          {
            error: jobError,
          }
        );
      }

      return { assetId, workflowId };
    } catch (error) {
      // Mark placeholder asset as failed on any downstream error
      const message =
        error instanceof Error ? error.message : 'Video generation failed';
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId,
        errorMessage: message,
      });

      // If a workflow/job was started, mark the job as failed
      if (workflowId) {
        try {
          const req = await ctx.db
            .query('versionAutoGenRequests')
            .withIndex('by_runId', (q) => q.eq('runId', workflowId!.toString()))
            .first();
          if (req?._id) {
            await ctx.db.patch('versionAutoGenRequests', req._id, {
              status: 'failed',
              completedAt: Date.now(),
              errorMessage: message,
            });
          }
        } catch (jobError) {
          console.warn(
            '[generateVideoAssetMutation] Failed to update job on error',
            {
              error: jobError,
            }
          );
        }
      }

      throw error;
    }
  },
});

// Generate 3D model asset using Hunyuan 3D 2.1
export const generate3DAsset = action({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetGroup: v.string(),
    referenceImageUrl: v.string(),
    referenceIds: v.optional(v.array(v.id('_storage'))), // Storage IDs of files used to create this asset
    numInferenceSteps: v.optional(v.number()),
    guidanceScale: v.optional(v.number()),
    octreeResolution: v.optional(v.number()),
    texturedMesh: v.optional(v.boolean()),
    modelName: v.string(), // Model name for 3D generation
  },
  returns: v.object({
    assetId: v.string(),
    assetUrl: v.string(),
    storageKey: v.string(),
    storageId: v.optional(v.id('_storage')),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    assetUrl: string;
    storageKey: string;
    storageId?: Id<'_storage'>;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    const version = await ctx.runQuery(api.versions.queries.getVersion, {
      versionId: args.versionId,
    });
    if (!version) {
      throw new ConvexError('Version not found');
    }
    const versionId: Id<'versions'> = args.versionId as Id<'versions'>;
    const productId: Id<'products'> = version.productId as Id<'products'>;

    const org = await ctx.runQuery(api.organizations.queries.getBySlug, {
      slug: args.orgSlug,
    });
    if (!org) throw new ConvexError('Organization not found or access denied');

    const assetId = await ctx.runMutation(
      internal.assets.mutations.createPlaceholderAsset,
      {
        versionId,
        productId,
        ownerId: userId,
        organizationId: org._id as Id<'organizations'>,
        assetGroup: args.assetGroup,
        type: '3d', // 3D models are now properly typed
        prompt: `3D model generated from image using Hunyuan 3D 2.1`,
        ...(args.referenceIds ? { referenceIds: args.referenceIds } : {}),
      }
    );

    // Defer credit charge; credits are handled in core generate3D

    // Prepare arguments for the 3D generation action, filtering out undefined values
    const generate3DArgs: {
      referenceImageUrl: string;
      filename: string;
      desiredModelName: string;
      numInferenceSteps?: number;
      guidanceScale?: number;
      octreeResolution?: number;
      texturedMesh?: boolean;
    } = {
      referenceImageUrl: args.referenceImageUrl,
      filename: `${args.assetGroup}-3d-model.glb`,
      desiredModelName: args.modelName,
    };

    if (args.numInferenceSteps !== undefined) {
      generate3DArgs.numInferenceSteps = args.numInferenceSteps;
    }
    if (args.guidanceScale !== undefined) {
      generate3DArgs.guidanceScale = args.guidanceScale;
    }
    if (args.octreeResolution !== undefined) {
      generate3DArgs.octreeResolution = args.octreeResolution;
    }
    if (args.texturedMesh !== undefined) {
      generate3DArgs.texturedMesh = args.texturedMesh;
    }

    const result = await ctx.runAction(
      internal.products.ai.actions.generation_actions.generate3D,
      {
        ...generate3DArgs,
        orgSlug: args.orgSlug,
        userId,
        relatedAssetId: assetId,
      }
    );

    // Process all generated files and create assets for each
    const assets: Array<{ assetId: Id<'assets'>; assetUrl: string }> = [];

    for (const file of result.files) {
      const fileUrl = file.url ?? file.storageUrl;
      if (!fileUrl) {
        throw new ConvexError('Generated file URL unavailable');
      }

      // Create a new asset for each file type with descriptive asset groups
      let assetGroupName = args.assetGroup;

      // Map file types to descriptive asset group names
      if (file.filename.includes('.glb')) {
        if (file.filename.includes('pbr')) {
          assetGroupName = `${args.assetGroup}-pbr-materials`;
        } else {
          assetGroupName = `${args.assetGroup}-glb-model`;
        }
      } else if (file.filename.includes('.zip')) {
        assetGroupName = `${args.assetGroup}-assets-archive`;
      } else {
        assetGroupName = `${args.assetGroup}-${file.filename.split('.')[0]}`;
      }

      const newAssetId = await ctx.runMutation(
        internal.assets.mutations.createPlaceholderAsset,
        {
          versionId,
          productId,
          ownerId: userId,
          organizationId: org._id as Id<'organizations'>,
          assetGroup: assetGroupName,
          type: '3d',
          prompt: `3D model file generated from image using Hunyuan 3D 2.1`,
          ...(args.referenceIds ? { referenceIds: args.referenceIds } : {}),
        }
      );

      // Update the asset with the generated 3D model file
      await ctx.runMutation(internal.assets.mutations.updateAssetWithResult, {
        assetId: newAssetId,
        ...(file.storageKey ? { storageKey: file.storageKey } : {}),
        ...(file.storageId ? { storageId: file.storageId } : {}),
        url: fileUrl,
        status: 'completed',
        completedAt: Date.now(),
        metadata: {
          mimeType: file.mimeType,
          fileSize: file.fileSize,
        },
      });

      assets.push({
        assetId: newAssetId,
        assetUrl: fileUrl,
      });
    }

    // Return the primary asset (first one, typically GLB)
    if (assets.length === 0) {
      throw new ConvexError('No 3D model assets were created');
    }

    // Fetch primary asset to return references
    const primary = await ctx.runQuery(api.assets.queries.getAsset, {
      id: assets[0]!.assetId,
    });

    // Credit charging handled inside generate3D action
    const storageKey = primary?.storageKey;
    if (!storageKey) {
      throw new ConvexError('Primary storageKey missing after 3D generation');
    }
    return {
      assetId: assets[0]!.assetId,
      assetUrl: assets[0]!.assetUrl,
      storageKey,
      ...(primary?.storageId ? { storageId: primary.storageId } : {}),
    };
  },
});

// Upscale an existing image asset, creating a NEW asset
export const upscaleImageAsset = action({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetId: v.id('assets'),
    assetGroup: v.optional(v.string()),
    upscaleFactor: v.optional(
      v.union(v.literal(2), v.literal(4), v.literal(6))
    ),
  },
  returns: v.object({
    assetId: v.string(),
    assetUrl: v.string(),
    storageKey: v.string(),
    storageId: v.optional(v.id('_storage')),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    assetUrl: string;
    storageKey: string;
    storageId?: Id<'_storage'>;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    const version = await ctx.runQuery(api.versions.queries.getVersion, {
      versionId: args.versionId,
    });
    if (!version) throw new ConvexError('Version not found');
    const versionId: Id<'versions'> = args.versionId as Id<'versions'>;
    const productId: Id<'products'> = version.productId as Id<'products'>;

    const org = await ctx.runQuery(api.organizations.queries.getBySlug, {
      slug: args.orgSlug,
    });
    if (!org) throw new ConvexError('Organization not found or access denied');

    const sourceAsset = await ctx.runQuery(api.assets.queries.getAsset, {
      id: args.assetId as Id<'assets'>,
    });
    if (!sourceAsset) throw new ConvexError('Source asset not found');
    if (sourceAsset.type !== 'image')
      throw new ConvexError('Only image assets can be upscaled');

    // Resolve base URL
    const baseImageUrl = await resolveUrl(
      {
        url: sourceAsset.url,
        storageKey: sourceAsset.storageKey,
        storageId: sourceAsset.storageId,
      },
      ctx
    );
    if (!baseImageUrl)
      throw new ConvexError('Base image URL unavailable for upscale');

    // Resolve dimensions for compute + refinement context
    let width = sourceAsset.metadata?.width ?? 0;
    let height = sourceAsset.metadata?.height ?? 0;
    if (!width || !height) {
      const meta = await ctx.runAction(
        internal.node.image_utils.extractImageMetadata,
        {
          url: baseImageUrl,
        }
      );
      width = meta.width;
      height = meta.height;
    }
    if (!width || !height)
      throw new ConvexError('Unable to determine image dimensions');

    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const g = Math.max(1, gcd(width, height));
    const aspectRatio = `${Math.round(width / g)}:${Math.round(height / g)}`;

    // Perform upscaling: respect explicit factor when provided; otherwise auto
    let refinedUrl: string = baseImageUrl;
    let usedScale: number = 1;
    if (args.upscaleFactor) {
      usedScale = args.upscaleFactor;
      // Clamp factor by model limits to avoid exceeding max output MP
      usedScale = clamp_upscale_factor(
        TOPAZ_MODEL_IDENTIFIER,
        width,
        height,
        usedScale
      );
      const upResult = await upscaleImageWithProvider({
        model: TOPAZ_MODEL_IDENTIFIER,
        imageUrl: baseImageUrl,
        upscaleFactor: usedScale,
      });
      if (!upResult.ok) {
        throw new ConvexError(upResult.message);
      }
      refinedUrl = upResult.url;
    } else {
      const autoScale = computeUpscaleFactor(
        TOPAZ_MODEL_IDENTIFIER,
        width,
        height,
        4096
      );
      // Clamp factor by model caps
      usedScale = clamp_upscale_factor(
        TOPAZ_MODEL_IDENTIFIER,
        width,
        height,
        autoScale
      );
      if (autoScale <= 1) {
        // No meaningful upscale possible; skip the upscaler entirely
        refinedUrl = baseImageUrl;
      } else {
        refinedUrl = await refineImage(baseImageUrl, {
          width,
          height,
          aspectRatio,
        });
      }
    }

    // Compute refiner cost consistent with pipeline helpers
    const didRefine = refinedUrl !== baseImageUrl;
    const outputWidth = Math.round(width * usedScale);
    const outputHeight = Math.round(height * usedScale);
    const refinerCost = didRefine
      ? calculateUpscaleCostUsd(
          TOPAZ_MODEL_IDENTIFIER,
          outputWidth,
          outputHeight
        )
      : 0;

    // Minimal pipeline describing the upscaled image
    const finalPipeline = {
      imageUrl: refinedUrl,
      totalCost: refinerCost,
      baseCost: 0,
      refinerCost,
      refinerUsed: didRefine,
      finalModelName: 'image-upscale',
    } as const;

    // Resolve a billing resolution (reuse nano-banana costs context)
    const billingResolutionRaw = resolveImageModelFromCode(
      'google/nano-banana',
      ['replicate', 'fal']
    );
    const billingResolution: ModelResolution = {
      name: billingResolutionRaw.name,
      provider:
        billingResolutionRaw.provider === 'replicate' ||
        billingResolutionRaw.provider === 'fal'
          ? billingResolutionRaw.provider
          : 'replicate',
      providerModel: billingResolutionRaw.providerModel,
      costs: billingResolutionRaw.costs,
    };

    // Create placeholder new asset
    const newAssetId = await ctx.runMutation(
      internal.assets.mutations.createPlaceholderAsset,
      {
        versionId,
        productId,
        ownerId: userId,
        organizationId: org._id as Id<'organizations'>,
        assetGroup:
          (args.assetGroup ?? (sourceAsset.assetGroup as string)) || 'main',
        type: 'image',
        prompt: args.upscaleFactor
          ? `Upscaled image ${args.upscaleFactor}x`
          : 'Upscaled image',
        upscaledFromAssetId: sourceAsset._id as Id<'assets'>,
        ...(sourceAsset.storageId
          ? { referenceIds: [sourceAsset.storageId as Id<'_storage'>] }
          : {}),
      }
    );

    try {
      const { storage } = await ctx.runAction(
        internal.products.ai.lib.persist_and_bill.persistAndBill,
        {
          finalPipeline,
          alternatePipelines: [],
          filename: `${sourceAsset.assetGroup || 'asset'}-upscaled.png`,
          billingResolution,
          userId,
          orgSlug: args.orgSlug,
          relatedAssetId: newAssetId,
          usageContext: 'upscale',
          outputWidth,
          outputHeight,
        }
      );

      // Extract metadata and finalize
      const meta = await ctx.runAction(
        internal.node.image_utils.extractImageMetadata,
        {
          url: storage.url,
        }
      );

      await ctx.runMutation(internal.assets.mutations.updateAssetWithResult, {
        assetId: newAssetId,
        storageKey: storage.storageKey,
        ...(storage.storageId ? { storageId: storage.storageId } : {}),
        url: storage.url,
        status: 'completed',
        completedAt: Date.now(),
        metadata: {
          mimeType: meta.mimeType,
          fileSize: meta.fileSize,
          width: meta.width,
          height: meta.height,
        },
      });

      return {
        assetId: newAssetId,
        assetUrl: storage.url,
        storageKey: storage.storageKey,
        ...(storage.storageId ? { storageId: storage.storageId } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upscale failed';
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId: newAssetId,
        errorMessage: message,
      });
      throw error;
    }
  },
});

// Change aspect ratio of an existing image asset (via nano-banana edit pipeline with refine=true), creating a NEW asset
export const changeAspectRatioAsset = action({
  args: {
    versionId: v.id('versions'),
    orgSlug: v.string(),
    assetId: v.id('assets'),
    assetGroup: v.string(),
    aspectRatio: v.string(),
    prompt: v.optional(v.string()),
  },
  returns: v.object({
    assetId: v.string(),
    assetUrl: v.string(),
    storageKey: v.string(),
    storageId: v.optional(v.id('_storage')),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    assetId: string;
    assetUrl: string;
    storageKey: string;
    storageId?: Id<'_storage'>;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    const version = await ctx.runQuery(api.versions.queries.getVersion, {
      versionId: args.versionId,
    });
    if (!version) throw new ConvexError('Version not found');
    const versionId: Id<'versions'> = args.versionId as Id<'versions'>;
    const productId: Id<'products'> = version.productId as Id<'products'>;

    const org = await ctx.runQuery(api.organizations.queries.getBySlug, {
      slug: args.orgSlug,
    });
    if (!org) throw new ConvexError('Organization not found or access denied');

    const sourceAsset = await ctx.runQuery(api.assets.queries.getAsset, {
      id: args.assetId as Id<'assets'>,
    });
    if (!sourceAsset) throw new ConvexError('Source asset not found');
    if (sourceAsset.type !== 'image')
      throw new ConvexError('Only image assets can be edited');

    // Resolve base URL
    const baseImageUrl = await resolveUrl(
      {
        url: sourceAsset.url,
        storageKey: sourceAsset.storageKey,
        storageId: sourceAsset.storageId,
      },
      ctx
    );
    if (!baseImageUrl)
      throw new ConvexError('Base image URL unavailable for edit');

    // Resolve image model (nano-banana) and run pipeline with refine=true
    const editResolutionRaw = resolveImageModelFromCode('google/nano-banana', [
      'replicate',
      'fal',
    ]);
    const editResolution: ModelResolution = {
      name: editResolutionRaw.name,
      provider:
        editResolutionRaw.provider === 'replicate' ||
        editResolutionRaw.provider === 'fal'
          ? editResolutionRaw.provider
          : 'replicate',
      providerModel: editResolutionRaw.providerModel,
      costs: editResolutionRaw.costs,
    };

    // Use a preservation prompt to avoid changing image contents; only adjust canvas/ratio
    const preservePrompt = ((): string => {
      const trimmed = (args.prompt ?? '').trim();
      if (trimmed.length > 0) return trimmed;
      return `Tastefully update the aspect ratio of the image to ${args.aspectRatio}.`;
    })();

    const pipeline = await runImageGenerationPipeline({
      provider: editResolution.provider,
      model: editResolution.providerModel,
      prompt: preservePrompt,
      references: [baseImageUrl],
      // Force 4K canvas while matching requested aspect ratio
      size: { aspectRatio: args.aspectRatio },
      refine: true,
      costs: editResolution.costs,
    });

    // Create placeholder new asset
    const newAssetId = await ctx.runMutation(
      internal.assets.mutations.createPlaceholderAsset,
      {
        versionId,
        productId,
        ownerId: userId,
        organizationId: org._id as Id<'organizations'>,
        assetGroup:
          (args.assetGroup ?? (sourceAsset.assetGroup as string)) || 'main',
        type: 'image',
        prompt: args.prompt ?? 'Aspect ratio change',
        ...(sourceAsset.storageId
          ? { referenceIds: [sourceAsset.storageId as Id<'_storage'>] }
          : {}),
      }
    );

    try {
      const { storage } = await ctx.runAction(
        internal.products.ai.lib.persist_and_bill.persistAndBill,
        {
          finalPipeline: pipeline,
          alternatePipelines: [],
          filename: `${sourceAsset.assetGroup || 'asset'}-${args.aspectRatio.replace(':', 'x')}.png`,
          billingResolution: editResolution,
          userId,
          orgSlug: args.orgSlug,
          relatedAssetId: newAssetId,
          usageContext: 'product_asset',
        }
      );

      // Extract metadata and finalize
      const meta = await ctx.runAction(
        internal.node.image_utils.extractImageMetadata,
        {
          url: storage.url,
        }
      );

      await ctx.runMutation(internal.assets.mutations.updateAssetWithResult, {
        assetId: newAssetId,
        storageKey: storage.storageKey,
        ...(storage.storageId ? { storageId: storage.storageId } : {}),
        url: storage.url,
        status: 'completed',
        completedAt: Date.now(),
        metadata: {
          mimeType: meta.mimeType,
          fileSize: meta.fileSize,
          width: meta.width,
          height: meta.height,
        },
      });

      return {
        assetId: newAssetId,
        assetUrl: storage.url,
        storageKey: storage.storageKey,
        ...(storage.storageId ? { storageId: storage.storageId } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Edit failed';
      await ctx.runMutation(internal.assets.mutations.failAsset, {
        assetId: newAssetId,
        errorMessage: message,
      });
      throw error;
    }
  },
});

// Update asset with generation result
export const updateAssetWithResult = internalMutation({
  args: {
    assetId: v.id('assets'),
    storageKey: v.optional(v.string()),
    /**
     * @deprecated Legacy Convex `_storage` id. New writes should not create this.
     */
    storageId: v.optional(v.id('_storage')),
    url: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('completed'),
      v.literal('failed')
    ),
    completedAt: v.optional(v.number()),
    metadata: v.optional(
      v.object({
        mimeType: v.optional(v.string()),
        fileSize: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        duration: v.optional(v.number()),
        model_url: v.optional(v.string()),
        patternTileWidth: v.optional(v.number()),
        patternTileHeight: v.optional(v.number()),
        patternOverallWidth: v.optional(v.number()),
        patternOverallHeight: v.optional(v.number()),
        patternTileUnit: v.optional(v.string()),
        patternOverallUnit: v.optional(v.string()),
        patternTitle: v.optional(v.string()),
        printTitle: v.optional(v.string()),
        schematicType: v.optional(v.string()),
        schematicTechnicalSpec: v.optional(v.string()),
        schematicBOM: v.optional(v.string()),
        schematicManufacturingNotes: v.optional(v.string()),
        schematicLegendData: v.optional(v.string()),
        schematicNumberingSystem: v.optional(v.string()),
        schematicNumberingSystemRef: v.optional(v.string()),
        schematicNarrativesPlan: v.optional(v.string()),
        schematicInfographicId: v.optional(v.string()),
        schematicTabId: v.optional(v.string()),
        schematicInfographicTitle: v.optional(v.string()),
        schematicInfographicCaption: v.optional(v.string()),
        schematicInfographicAspectRatio: v.optional(v.string()),
        schematicInfographicPriority: v.optional(v.number()),
        requestId: v.optional(v.string()),
        isPrint: v.optional(v.boolean()),
      })
    ),
    editType: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Fetch current asset to check for existing storageId/metadata
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    // Prepare patch updates
    const patchUpdates: Record<string, unknown> = {
      ...(args.storageKey ? { storageKey: args.storageKey } : {}),
      ...(args.storageId ? { storageId: args.storageId } : {}),
      url: args.url,
      status: args.status,
      ...(args.completedAt && { completedAt: args.completedAt }),
      ...(args.metadata && { metadata: args.metadata }),
    };

    const updatedHistory = computeUpdatedVersionHistory(
      asset,
      args.storageId ?? null,
      args.storageKey ?? null,
      args.editType
    );
    if (updatedHistory) {
      patchUpdates.versionHistory = updatedHistory;
    }

    await ctx.db.patch('assets', args.assetId, patchUpdates);

    if (args.status === 'completed') {
      const completedAt =
        typeof args.completedAt === 'number' ? args.completedAt : Date.now();
      await recordAssetCompletionEvent(ctx, {
        assetId: args.assetId,
        versionId: asset.versionId,
        productId: asset.productId,
        ...(asset.organizationId
          ? { organizationId: asset.organizationId }
          : {}),
        completedAt,
      });
    }

    // Phase 1: Update progress when asset completes during auto-gen
    // Check if this asset was part of an auto-gen run
    const autoGenRunId = asset.autoGenRunId;
    if (args.status === 'completed' && autoGenRunId) {
      try {
        // Get version to check if this run is still active
        const version = await ctx.db.get('versions', asset.versionId);
        if (version && version.activeAutoGenRunId === autoGenRunId) {
          await ctx.runMutation(
            internal.products.internal.updateAutoGenProgress,
            {
              versionId: asset.versionId,
              runId: autoGenRunId,
              incrementCompleted: 1,
              currentStage: `Generated ${asset.assetGroup}`,
            }
          );
        }
      } catch (progressError) {
        // Best-effort progress update - don't fail the asset update
        console.warn(
          '[updateAssetWithResult] Failed to update progress:',
          progressError
        );
      }
    }

    // Bump version activity
    try {
      const updatedAsset = await ctx.db.get('assets', args.assetId);
      if (updatedAsset) {
        await ctx.db.patch('versions', updatedAsset.versionId, {
          updatedAt: Date.now(),
        });
      }
    } catch {}

    return null;
  },
});

export const failAsset = internalMutation({
  args: {
    assetId: v.id('assets'),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      status: 'failed',
      statusMessage: args.errorMessage,
    });
    // Bump version activity
    try {
      const asset = await ctx.db.get('assets', args.assetId);
      if (asset) {
        await ctx.db.patch('versions', asset.versionId, {
          updatedAt: Date.now(),
        });
      }
    } catch {}
  },
});

// Mark an existing asset as pending (used when updating/regenerating the same asset)
export const markAssetPending = internalMutation({
  args: {
    assetId: v.id('assets'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch('assets', args.assetId, {
      status: 'pending',
      createdAt: now, // Reset createdAt to prevent immediate timeout from cleanup job
    });
    // Bump version activity
    try {
      const asset = await ctx.db.get('assets', args.assetId);
      if (asset) {
        await ctx.db.patch('versions', asset.versionId, { updatedAt: now });
      }
    } catch {}
  },
});

// Revert an existing asset back to completed on failure during update/regeneration
export const revertAssetToCompleted = internalMutation({
  args: {
    assetId: v.id('assets'),
    statusMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch('assets', args.assetId, {
      status: 'completed',
      ...(args.statusMessage ? { statusMessage: args.statusMessage } : {}),
    });
    // Bump version activity
    try {
      const asset = await ctx.db.get('assets', args.assetId);
      if (asset) {
        await ctx.db.patch('versions', asset.versionId, {
          updatedAt: Date.now(),
        });
      }
    } catch {}
  },
});

// Duplicate a single asset within the same version
export const duplicateAsset = mutation({
  args: {
    assetId: v.id('assets'),
  },
  returns: v.object({
    duplicatedAssetId: v.id('assets'),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Authentication required');
    }

    // Get the source asset
    const sourceAsset = await ctx.db.get('assets', args.assetId);
    if (!sourceAsset) {
      throw new Error('Asset not found');
    }

    // Verify user has access
    if (sourceAsset.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q
            .eq('organizationId', sourceAsset.organizationId!)
            .eq('userId', userId)
        )
        .first();
      if (!membership) {
        throw new Error('Access denied');
      }
    } else if (sourceAsset.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Create a duplicate asset in the same version
    const now = Date.now();
    const duplicatedAssetId = await ctx.db.insert('assets', {
      versionId: sourceAsset.versionId,
      productId: sourceAsset.productId,
      ownerId: sourceAsset.ownerId,
      ...(sourceAsset.organizationId
        ? { organizationId: sourceAsset.organizationId }
        : {}),
      type: sourceAsset.type,
      assetGroup: sourceAsset.assetGroup,
      status: sourceAsset.status,
      ...(sourceAsset.statusMessage
        ? { statusMessage: sourceAsset.statusMessage }
        : {}),
      ...(sourceAsset.url ? { url: sourceAsset.url } : {}),
      ...(sourceAsset.tempImageUrl
        ? { tempImageUrl: sourceAsset.tempImageUrl }
        : {}),
      ...(sourceAsset.thumbnailUrl
        ? { thumbnailUrl: sourceAsset.thumbnailUrl }
        : {}),
      ...(sourceAsset.prompt ? { prompt: sourceAsset.prompt } : {}),
      ...(sourceAsset.storageId ? { storageId: sourceAsset.storageId } : {}),
      ...(sourceAsset.alternateStorageIds
        ? { alternateStorageIds: sourceAsset.alternateStorageIds }
        : {}),
      ...(sourceAsset.referenceIds
        ? { referenceIds: sourceAsset.referenceIds }
        : {}),
      metadata: sourceAsset.metadata || {},
      ...(sourceAsset.processingTimeMs
        ? { processingTimeMs: sourceAsset.processingTimeMs }
        : {}),
      ...(sourceAsset.cost ? { cost: sourceAsset.cost } : {}),
      createdAt: now,
      ...(sourceAsset.completedAt
        ? { completedAt: sourceAsset.completedAt }
        : {}),
      // Note: versionHistory is not copied as it's specific to the original asset's edit history
    });

    // Bump version activity
    try {
      await ctx.db.patch('versions', sourceAsset.versionId, { updatedAt: now });
    } catch {}

    return { duplicatedAssetId };
  },
});

// Duplicate assets from one version to another
export const duplicateVersionAssets = mutation({
  args: {
    sourceVersionId: v.id('versions'),
    targetVersionId: v.id('versions'),
    assetGroup: v.optional(v.string()), // Optional: only duplicate assets from a specific group
    statusFilter: v.optional(
      v.union(
        v.literal('completed'),
        v.literal('pending'),
        v.literal('processing'),
        v.literal('failed')
      )
    ), // Optional: only duplicate assets with a specific status
  },
  returns: v.object({
    duplicatedCount: v.number(),
    assetIds: v.array(v.id('assets')),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error('Authentication required');
    }

    // Verify both versions exist and belong to the same product
    const sourceVersion = await ctx.db.get('versions', args.sourceVersionId);
    if (!sourceVersion) {
      throw new Error('Source version not found');
    }

    const targetVersion = await ctx.db.get('versions', args.targetVersionId);
    if (!targetVersion) {
      throw new Error('Target version not found');
    }

    if (sourceVersion.productId !== targetVersion.productId) {
      throw new Error('Versions must belong to the same product');
    }

    // Verify user has access to the product
    const product = await ctx.db.get('products', sourceVersion.productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.organizationId) {
      const membership = await ctx.db
        .query('members')
        .withIndex('by_org_user', (q) =>
          q.eq('organizationId', product.organizationId!).eq('userId', userId)
        )
        .first();
      if (!membership) {
        throw new Error('Access denied');
      }
    } else if (product.ownerId !== userId) {
      throw new Error('Access denied');
    }

    // Get assets from source version
    const sourceAssetsQuery = ctx.db
      .query('assets')
      .withIndex('by_version', (q) => q.eq('versionId', args.sourceVersionId));

    // Apply filters if provided
    const sourceAssets: Doc<'assets'>[] = [];
    for await (const asset of sourceAssetsQuery) {
      // Filter by assetGroup if provided
      if (args.assetGroup && asset.assetGroup !== args.assetGroup) {
        continue;
      }
      // Filter by status if provided
      if (args.statusFilter && asset.status !== args.statusFilter) {
        continue;
      }
      sourceAssets.push(asset);
    }

    if (sourceAssets.length === 0) {
      return { duplicatedCount: 0, assetIds: [] };
    }

    // Duplicate each asset to the target version
    const now = Date.now();
    const duplicatedAssetIds: Id<'assets'>[] = [];

    for (const sourceAsset of sourceAssets) {
      // Create new asset record pointing to the same storage files
      const newAssetId = await ctx.db.insert('assets', {
        versionId: args.targetVersionId,
        productId: targetVersion.productId,
        ownerId: sourceAsset.ownerId,
        ...(sourceAsset.organizationId
          ? { organizationId: sourceAsset.organizationId }
          : {}),
        type: sourceAsset.type,
        assetGroup: sourceAsset.assetGroup,
        status: sourceAsset.status,
        ...(sourceAsset.statusMessage
          ? { statusMessage: sourceAsset.statusMessage }
          : {}),
        ...(sourceAsset.url ? { url: sourceAsset.url } : {}),
        ...(sourceAsset.tempImageUrl
          ? { tempImageUrl: sourceAsset.tempImageUrl }
          : {}),
        ...(sourceAsset.thumbnailUrl
          ? { thumbnailUrl: sourceAsset.thumbnailUrl }
          : {}),
        ...(sourceAsset.prompt ? { prompt: sourceAsset.prompt } : {}),
        ...(sourceAsset.storageId ? { storageId: sourceAsset.storageId } : {}),
        ...(sourceAsset.alternateStorageIds
          ? { alternateStorageIds: sourceAsset.alternateStorageIds }
          : {}),
        ...(sourceAsset.referenceIds
          ? { referenceIds: sourceAsset.referenceIds }
          : {}),
        metadata: sourceAsset.metadata || {},
        ...(sourceAsset.processingTimeMs
          ? { processingTimeMs: sourceAsset.processingTimeMs }
          : {}),
        ...(sourceAsset.cost ? { cost: sourceAsset.cost } : {}),
        createdAt: now,
        ...(sourceAsset.completedAt
          ? { completedAt: sourceAsset.completedAt }
          : {}),
        // Note: versionHistory is not copied as it's specific to the original asset's edit history
      });

      duplicatedAssetIds.push(newAssetId);
    }

    // Bump target version activity
    try {
      await ctx.db.patch('versions', args.targetVersionId, { updatedAt: now });
    } catch {}

    return {
      duplicatedCount: duplicatedAssetIds.length,
      assetIds: duplicatedAssetIds,
    };
  },
});

// Kill all pending assets older than 600 seconds
// Excludes assets with workflowIds since workflows can legitimately take longer
// Also excludes assets that might be part of workflows but workflowId isn't set yet
// (we use a longer timeout for these to account for workflow startup time)
export const killAllOldPendingAssets = internalMutation({
  args: {},
  returns: v.object({ killedCount: v.number() }),
  handler: async (ctx) => {
    const cutoffMs = 600 * 1000; // 600s for assets without workflows
    const workflowCutoffMs = 1800 * 1000; // 1800s (30 minutes) for assets that might have workflows
    const cutoffTime = Date.now() - cutoffMs;
    const workflowCutoffTime = Date.now() - workflowCutoffMs;

    let killedCount = 0;
    const pendingQuery = ctx.db
      .query('assets')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .order('asc');

    for await (const asset of pendingQuery) {
      // Skip assets with active workflows - they can take longer than 10 minutes
      if (asset.workflowId) {
        continue;
      }

      const createdTime =
        typeof asset.createdAt === 'number'
          ? asset.createdAt
          : asset._creationTime;

      // Skip assets created very recently (within last 2 minutes) - they might be starting a workflow
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      if (createdTime > twoMinutesAgo) {
        continue;
      }

      // Check if asset might be part of a workflow (has prompt or tempImageUrl suggests it's being processed)
      // Use longer timeout for these to account for workflow startup delays
      const mightHaveWorkflow = Boolean(asset.prompt || asset.tempImageUrl);
      const applicableCutoffTime = mightHaveWorkflow
        ? workflowCutoffTime
        : cutoffTime;

      if (createdTime <= applicableCutoffTime) {
        await ctx.db.patch('assets', asset._id, {
          status: 'failed',
          statusMessage: mightHaveWorkflow
            ? 'Auto-failed after exceeding 1800s pending timeout (workflow may have failed to start)'
            : 'Auto-failed after exceeding 600s pending timeout',
        });
        killedCount += 1;
      }
    }

    return { killedCount };
  },
});

// Save motifs for an asset
export const saveAssetMotifs = internalMutation({
  args: {
    assetId: v.string(),
    motifs: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.string(),
        coordinates: v.object({
          x: v.number(),
          y: v.number(),
          width: v.number(),
          height: v.number(),
        }),
        seamlessnessPotential: v.string(),
        wallpaperGroup: v.string(),
        generationPrompt: v.string(),
        generatedAssetId: v.optional(v.id('assets')),
      })
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('assetMotifs')
      .withIndex('by_assetId', (q) => q.eq('assetId', args.assetId))
      .first();

    if (existing) {
      await ctx.db.patch('assetMotifs', existing._id, { motifs: args.motifs });
    } else {
      await ctx.db.insert('assetMotifs', {
        assetId: args.assetId,
        motifs: args.motifs,
      });
    }
  },
});

// Link a generated pattern asset to its source motif
export const linkGeneratedAssetToMotif = internalMutation({
  args: {
    assetId: v.string(), // Original asset ID
    motifId: v.string(),
    generatedAssetId: v.id('assets'),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('assetMotifs')
      .withIndex('by_assetId', (q) => q.eq('assetId', args.assetId))
      .first();

    if (!existing) return;

    const updatedMotifs = existing.motifs.map((m) => {
      if (m.id === args.motifId) {
        return { ...m, generatedAssetId: args.generatedAssetId };
      }
      return m;
    });

    await ctx.db.patch('assetMotifs', existing._id, { motifs: updatedMotifs });
  },
});
