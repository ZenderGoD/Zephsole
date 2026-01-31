'use node';

import { action } from '../../_generated/server';
import { v } from 'convex/values';
import { api, internal } from '../../_generated/api';
import { ConvexError } from 'convex/values';
import { getAuthUserId } from '../../authUtils';
import { resolveUrl } from '../../media/resolve';
import { workflow } from '../../workflow';
import { vWorkflowId } from '@convex-dev/workflow';
import type { WorkflowId } from '@convex-dev/workflow';
import type { Id, Doc } from '../../_generated/dataModel';

export const generateMotifTile = action({
  args: {
    assetId: v.union(v.id('assets'), v.id('orgThreadLinks')),
    orgSlug: v.string(),
    motifName: v.string(),
    motifDescription: v.optional(v.string()),
    generationPrompt: v.string(),
    coordinates: v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    }),
    motifId: v.optional(v.string()),
    versionId: v.optional(v.id('versions')),
  },
  returns: v.object({
    placeholderAssetId: v.id('assets'),
    workflowId: vWorkflowId,
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Authentication required');

    // 1. Resolve original resource URL for reference
    const resource = await ctx.runQuery(internal.assets.queries.internalGetAnyResourceById, {
      id: args.assetId as string,
    });
    if (!resource) throw new ConvexError('Resource not found');

    const url = await resolveUrl(
      { 
        url: resource.type === 'asset' ? (resource.data as Doc<'assets'>).url : undefined, 
        storageKey: resource.data.storageKey, 
        storageId: resource.data.storageId as Id<'_storage'> | undefined
      }, 
      ctx
    );
    if (!url) throw new ConvexError('Asset URL not found');

    // 2. Fetch or mock version/product context
    let versionId: Id<'versions'> | undefined = args.versionId || (resource.type === 'asset' ? resource.data.versionId : undefined);
    let productId: Id<'products'> | undefined = resource.type === 'asset' ? resource.data.productId : undefined;

    if (!versionId && productId) {
        // If we have a product but no version, get the latest version
        const latestVersion = await ctx.runQuery(internal.versions.queries.getLatestVersionInternal, {
            productId,
        });
        if (latestVersion) {
            versionId = latestVersion._id;
        }
    }

    if (!versionId) {
        // Check if threadId has a version associated with it
        const threadId = resource.type === 'link' ? resource.data.threadId : undefined;
        if (threadId) {
            const version = await ctx.runQuery(internal.versions.queries.getVersionByThreadIdInternal, {
                threadId,
            });
            if (version) {
                versionId = version._id;
                productId = version.productId;
            }
        }
    }

    if (!versionId) {
        // AUTO-SAVE: If this is a floating image, create a product for it automatically
        // so the user can proceed with pattern generation without leaving the studio.
        const storageKey = resource.data.storageKey;
        const storageId = resource.data.storageId as Id<'_storage'> | undefined;

        // Resolve organizationId from slug
        const org = await ctx.runQuery(api.organizations.queries.getBySlug, { slug: args.orgSlug });
        if (!org) throw new ConvexError('Organization not found');

        const { productId: newProductId, versionId: newVersionId } = await ctx.runMutation(internal.products.mutations.createProductInternal, {
            prompt: args.generationPrompt || 'Pattern Design',
            userId,
            organizationId: org._id,
            initialImageStorageKeys: storageKey ? [storageKey] : undefined,
            initialImageStorageIds: storageId ? [storageId] : undefined,
            visibility: 'organization',
        });

        productId = newProductId;
        versionId = newVersionId;

        // Give it a better name
        await ctx.runMutation(internal.products.mutations.updateProductInternal, {
            id: newProductId,
            name: `Pattern: ${args.motifName || 'New Design'}`,
        });

        // Link it back to the thread if possible
        if (resource.type === 'link' && resource.data.threadId) {
            if (storageKey) {
                await ctx.runMutation(api.organizations.threads.mutations.linkProductToThreadByStorageKey, {
                    orgSlug: args.orgSlug,
                    storageKey,
                    productId: newProductId,
                });
            } else if (storageId) {
                await ctx.runMutation(api.organizations.threads.mutations.linkProductToThreadByStorageId, {
                    orgSlug: args.orgSlug,
                    storageId,
                    productId: newProductId,
                });
            }
        }
    }

    // 3. Create a placeholder asset for the new tile
    const newAssetId = await ctx.runMutation(
      internal.assets.mutations.createPlaceholderAsset,
      {
        versionId,
        productId: productId!,
        ownerId: userId,
        organizationId: resource.type === 'asset' ? resource.data.organizationId : resource.data.organizationId,
        assetGroup: 'certified-patterns',
        type: 'image',
        prompt: args.generationPrompt,
        referenceIds: resource.data.storageId ? [resource.data.storageId as Id<'_storage'>] : [],
      }
    );

    // 4. Start the generation workflow
    // We append specific technical keywords for industrial seamlessness and focus on the original image context
    const technicalPrompt = `
[TARGET MOTIF]: ${args.motifName}
[VISUAL DNA]: ${args.motifDescription || args.generationPrompt}
[LOCATION HINT]: Focus on the motif area found at normalized coordinates (x:${args.coordinates.x.toFixed(2)}, y:${args.coordinates.y.toFixed(2)}) within the provided reference image.
[INSTRUCTION]: Reconstruct this pattern into a perfect 1024x1024 mathematically seamless tile. 
[TECHNICAL SPEC]: TOROIDAL SYMMETRY / MATHEMATICALLY SEAMLESS INDUSTRIAL TILE. 
Heal the edges by intelligently completing any cut-off elements. 
The design must remain 100% identical to the pattern elements, colors, and layout found in the reference image. 
IGNORE garment construction details (buttons, seams, folds, shadows). 
The output MUST be a flat, top-down graphic design, not a photo of a garment. 
This is a technical master block for manufacturing.`.trim();

    const workflowId: WorkflowId = await workflow.start(
      ctx,
      internal.products.ai.workflows.generate_thread_image.generateThreadImage,
      {
        prompt: technicalPrompt,
        referenceImageUrls: [url], // Use the original high-quality image URL
        filename: `seamless-tile-${args.motifName.toLowerCase().replace(/\s+/g, '-')}.png`,
        width: 1024,
        height: 1024,
        output_aspect_ratio: '1:1',
        orgSlug: args.orgSlug,
        userId,
        relatedAssetId: newAssetId,
        options: {
          tiling: true,
        },
      }
    );

    // 5. Link workflow to asset
    await ctx.runMutation(internal.assets.mutations.setAssetWorkflowId, {
      assetId: newAssetId,
      workflowId,
    });

    // 6. Persist the link to the motif so it shows up in future sessions
    if (args.motifId) {
      try {
        await ctx.runMutation(internal.assets.mutations.linkGeneratedAssetToMotif, {
          assetId: args.assetId as string,
          motifId: args.motifId,
          generatedAssetId: newAssetId,
        });
      } catch (err) {
        console.warn('⚠️ [generateMotifTile] Failed to link pattern to motif:', err);
      }
    }

    return {
      placeholderAssetId: newAssetId,
      workflowId,
    };
  }
});
