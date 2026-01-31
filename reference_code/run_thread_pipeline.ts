'use node';

import { internalAction } from '../../../_generated/server';
import { v } from 'convex/values';
import { runImageGenerationPipeline } from '../providers/image_providers';
import type { ImageGeneration } from '../actions/image_generation_types';
import { internal } from '../../../_generated/api';
import { ConvexError } from 'convex/values';
import { createFalLoadTrackingFunctions } from '../providers/fal_load_tracking_helpers';

/**
 * Node action wrapper to run the image generation pipeline for thread assets.
 * This allows the pipeline to execute in Node.js runtime within a workflow step.
 */
export const runThreadPipeline = internalAction({
  args: {
    provider: v.union(v.literal('replicate'), v.literal('fal')),
    model: v.string(),
    prompt: v.string(),
    references: v.array(v.string()),
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(),
    refine: v.boolean(),
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
    options: v.optional(v.record(v.string(), v.any())),
  },
  returns: v.object({
    imageUrl: v.string(),
    finalModelName: v.string(),
    totalCost: v.number(),
    baseCost: v.optional(v.number()),
    refinerCost: v.optional(v.number()),
    refinerUsed: v.boolean(),
  }),
  handler: async (ctx, args): Promise<ImageGeneration> => {
    console.log('[runThreadPipeline] 🚀 Starting simple generation flow');
    console.log(
      '[runThreadPipeline] 📸 Reference image URLs:',
      args.references
    );

    // Some environments use a public proxy domain (e.g. local-assets.imai.studio)
    // as their R2 public base URL. In that case, those URLs are explicitly intended
    // to be fetchable by external providers (FAL/Replicate) and should not be blocked.
    const allowedPublicHostnames = (() => {
      const hosts = new Set<string>();
      const base = process.env.R2_PUBLIC_BASE_URL;
      if (typeof base === 'string' && base.trim().length > 0) {
        try {
          hosts.add(new URL(base).hostname);
        } catch {
          // ignore malformed env values; we fall back to conservative blocking below
        }
      }
      return hosts;
    })();

    const nonPublic: Array<string> = [];
    for (const ref of args.references) {
      try {
        const parsed = new URL(ref);
        // Historically we blocked local preview/proxy URLs. Keep that protection
        // unless the hostname is explicitly configured as the public R2 base host.
        if (
          (parsed.hostname === 'local-assets.imai.studio' ||
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1') &&
          !allowedPublicHostnames.has(parsed.hostname)
        ) {
          nonPublic.push(ref);
        }
      } catch {
        nonPublic.push(ref);
      }
    }
    if (nonPublic.length > 0) {
      console.error('[runThreadPipeline] Non-public reference URLs detected', {
        nonPublic,
        provider: args.provider,
        model: args.model,
      });
      throw new ConvexError(
        'One or more reference image URLs are not publicly fetchable. ' +
          'Please pass R2-backed storageKey URLs (publicUrl) rather than local preview URLs.'
      );
    }

    // Create a metadata extraction function that can be called from the pipeline
    const extractMetadata = async (
      url: string
    ): Promise<{ width: number; height: number }> => {
      const meta = await ctx.runAction(
        internal.node.image_utils.extractImageMetadata,
        { url }
      );
      return { width: meta.width, height: meta.height };
    };

    const { getDbIndex, getKeyLoads, incrementKeyLoad, decrementKeyLoad } =
      createFalLoadTrackingFunctions(ctx);
    const pipeline = await runImageGenerationPipeline(
      {
        provider: args.provider,
        model: args.model,
        prompt: args.prompt,
        references: args.references,
        size: {
          width: args.width,
          height: args.height,
          aspectRatio: args.aspectRatio,
        },
        refine: args.refine,
        costs: args.costs,
        extractMetadata: args.refine ? extractMetadata : undefined, // Only extract if refining
        desiredMax: 4096, // Target 4K resolution for thread images
        options: args.options,
      },
      getDbIndex,
      getKeyLoads,
      incrementKeyLoad,
      decrementKeyLoad
    );

    console.log('[runThreadPipeline] ✓ Generation and upscaling completed');

    return {
      imageUrl: pipeline.imageUrl,
      finalModelName: pipeline.finalModelName,
      totalCost: pipeline.totalCost,
      baseCost: pipeline.baseCost,
      refinerCost: pipeline.refinerCost,
      refinerUsed: pipeline.refinerUsed,
    };
  },
});
