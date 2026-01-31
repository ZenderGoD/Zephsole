import { workflow } from '../../../workflow';
import { v } from 'convex/values';
import { internal } from '../../../_generated/api';
import { ConvexError } from 'convex/values';
import { validateImageGenerationInputs } from '../actions/image_generation_decompose';
import type { ImageGeneration } from '../actions/image_generation_types';
import type { Id } from '../../../_generated/dataModel';
import {
  getUpscalerModelName,
  SEEDVR_MODEL_IDENTIFIER,
} from '../providers/upscalers';
import { resolveWorkflowDistinctId } from './posthog_tracking';
import { parseStorageKey } from '../../../media/keys';
import { POSTHOG_PROP } from '../../../posthog_constants';

// Simple feature flags for controlling workflow steps during development/debugging.
// Flip these to false to skip specific parts of the workflow without changing callers.
const ENABLE_COMPOSE_FLOW = false;
const ENABLE_AROUND_FLOW = true;
const ENABLE_REALISM_PASS = false;
const ENABLE_REFINE_PASS = true;
const ENABLE_FINALIZE_ASSET = true;
const ENABLE_BILLING = true;
const ENABLE_JUDGE_SELECTION = false;
// Gemini-based feedback loop: evaluates candidate and triggers one rerun if needed
const ENABLE_FEEDBACK_LOOP = true;
// Maximum number of feedback-triggered reruns (cap at 1 for now)
const MAX_FEEDBACK_RERUNS = 1;

function parseAvatarRefCountFromPrompt(prompt: string): number | null {
  const match = prompt.match(
    /LAST\s+(\d+)\s+images?\s+are\s+the\s+PERSON\s+identity/i
  );
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export const generateProductImage = workflow.define({
  args: {
    prompt: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())),
    productReferenceStorageKeys: v.optional(v.array(v.string())),
    /**
     * @deprecated Prefer `productReferenceStorageKeys` (R2). This is legacy Convex `_storage`.
     */
    productReferenceStorageIds: v.optional(v.array(v.id('_storage'))),
    filename: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    output_aspect_ratio: v.string(),
    orgSlug: v.string(),
    userId: v.id('users'),
    authUserId: v.optional(v.string()), // Auth user ID for PostHog tracking
    relatedAssetId: v.optional(v.id('assets')),
    mainImageUrl: v.optional(v.string()),
    productImageUrl: v.optional(v.string()),
    useImageRefiner: v.optional(v.boolean()),
    // Base resolution for image generation before upscaling (1K, 2K, or 4K)
    defaultOutputResolution: v.optional(
      v.union(v.literal('1K'), v.literal('2K'), v.literal('4K'))
    ),
    // When true, skip billing and return aggregated costs to caller for later billing
    deferBilling: v.optional(v.boolean()),
    // When true, skip the refine/upscale pass (useful when caller will do their own upscale)
    skipRefine: v.optional(v.boolean()),
    // When true, skip finalizing the asset record (useful for multi-stage workflows, e.g. avatar)
    skipFinalizeAsset: v.optional(v.boolean()),
    // When true, force judge selection off even if ENABLE_JUDGE_SELECTION is enabled
    skipJudgeSelection: v.optional(v.boolean()),
  },
  handler: async (
    step,
    args
  ): Promise<{
    model: string;
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
    totalCost: number;
    /** Base provider cost (CTC) for deferred billing aggregation */
    baseCost?: number;
    /** Refiner cost for deferred billing aggregation */
    refinerCost?: number;
    alternateStorageKeys?: Array<string>;
    /**
     * @deprecated Legacy Convex `_storage` ids. New writes should not create these.
     */
    alternateStorageIds?: Array<Id<'_storage'>>;
  }> => {
    // For providers (FAL/Replicate/etc), we need reference image URLs to be publicly
    // fetchable. The canonical public host should come from `R2_PUBLIC_BASE_URL`.
    //
    // NOTE: This project uses two valid public domains for R2:
    // - local-assets.imai.studio (local/dev)
    // - assets.imai.studio (prod)
    //
    // We should never hardcode or rewrite one into the other. Instead, treat the host
    // configured in `R2_PUBLIC_BASE_URL` as the "public" host for the current env.
    //
    // Workflows run in V8 isolate (no `process.env`), so fetch via an action step.
    if (args.relatedAssetId) {
      await step.runMutation(internal.assets.mutations.updateAssetStatus, {
        assetId: args.relatedAssetId,
        status: 'processing',
        statusMessage: 'Preparing generation...',
      });
    }
    const r2PublicBaseUrl = await step.runAction(
      internal.products.ai.actions.resolve_storage_urls.getR2PublicBaseUrl,
      {}
    );

    const allowedPublicHostnames = (() => {
      const hosts = new Set<string>();
      if (r2PublicBaseUrl) {
        try {
          hosts.add(new URL(r2PublicBaseUrl).hostname);
        } catch {
          // ignore malformed env values; we fall back to conservative checks below
        }
      }
      return hosts;
    })();

    const isLikelyNonPublicProxyUrl = (value: string): boolean => {
      try {
        const parsed = new URL(value);
        // If URL host matches our configured R2 public host, it's intended to be fetchable.
        if (allowedPublicHostnames.has(parsed.hostname)) return false;

        // If this looks like one of our R2 URLs (path matches storageKey format),
        // but the host is *not* the configured public host for this environment,
        // treat it as unusable. This prevents using a prod host in dev (or vice versa),
        // which can yield 404s even though the URL is "public".
        const pathSegments = parsed.pathname
          .split('/')
          .filter((s) => s.length > 0)
          .slice(0, 3)
          .map((s) => decodeURIComponent(s));
        if (pathSegments.length === 3) {
          const candidateKey = pathSegments.join('/');
          if (
            parseStorageKey(candidateKey) &&
            allowedPublicHostnames.size > 0
          ) {
            return true;
          }
        }

        // Keep blocking obviously-local URLs that external providers can't fetch.
        if (
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1' ||
          parsed.hostname === '0.0.0.0' ||
          parsed.hostname === 'local-assets.imai.studio'
        ) {
          return true;
        }

        // Otherwise, assume it's public (e.g. https://replicate.delivery/... or other CDN).
        return false;
      } catch {
        return true; // Not a valid absolute URL
      }
    };

    // We intentionally do not rewrite hosts (e.g. local-assets → assets). The URL should
    // already reflect `R2_PUBLIC_BASE_URL` for the current environment.
    const toExternallyAccessibleUrl = (url: string): string => url;

    const pickUsableProductImageUrl = (input: {
      explicit?: string;
      main?: string;
      refs?: Array<string>;
      productReferenceUrls: Array<string>;
    }): string | null => {
      const candidates: Array<string> = [];
      if (input.explicit) candidates.push(input.explicit);
      if (input.main) candidates.push(input.main);
      for (const ref of input.refs ?? []) candidates.push(ref);

      for (const c of candidates) {
        if (!isLikelyNonPublicProxyUrl(c)) return c;
      }
      for (const c of input.productReferenceUrls) {
        if (!isLikelyNonPublicProxyUrl(c)) return c;
      }
      return null;
    };

    // Sanitize and normalize output_aspect_ratio
    let sanitizedAspectRatio = args.output_aspect_ratio;

    // Handle special cases first
    if (
      sanitizedAspectRatio === 'match_input_image' ||
      sanitizedAspectRatio === 'auto'
    ) {
      sanitizedAspectRatio = '1:1';
    } else {
      // Extract valid aspect ratio pattern from potentially malformed input
      // Look for pattern like "WIDTH:HEIGHT" where WIDTH and HEIGHT are digits
      const aspectRatioMatch = sanitizedAspectRatio.match(/(\d+):(\d+)/);
      if (aspectRatioMatch) {
        const extracted = `${aspectRatioMatch[1]}:${aspectRatioMatch[2]}`;
        // Log warning if we had to sanitize malformed input
        if (extracted !== sanitizedAspectRatio) {
          console.warn(
            `[generateProductImage] Sanitized malformed output_aspect_ratio: ` +
              `"${args.output_aspect_ratio}" -> "${extracted}"`
          );
        }
        sanitizedAspectRatio = extracted;
      } else {
        // If no valid pattern found, track failure and throw a more descriptive error
        // Note: PostHog tracking here is async but we can't await in this context
        // Failure will be tracked in the workflow's outer catch if needed
        const errorMessage =
          `Invalid output_aspect_ratio format: "${args.output_aspect_ratio}". ` +
          `Expected format: "WIDTH:HEIGHT" (e.g., "1:1", "16:9", "3:4") or special values "match_input_image" or "auto". ` +
          `Received malformed value that could not be parsed.`;
        console.error(`[generateProductImage] ❌ Validation failed:`, {
          error: 'invalid_aspect_ratio',
          aspectRatio: args.output_aspect_ratio,
          assetId: args.relatedAssetId,
        });
        throw new ConvexError(errorMessage);
      }
    }

    // Validate inputs with sanitized aspect ratio
    validateImageGenerationInputs(
      args.width,
      args.height,
      sanitizedAspectRatio
    );

    // Resolve product reference URLs from storage keys (preferred) or legacy ids
    if (args.relatedAssetId) {
      await step.runMutation(internal.assets.mutations.updateAssetStatus, {
        assetId: args.relatedAssetId,
        status: 'processing',
        statusMessage: 'Loading references...',
      });
    }
    let productReferenceUrls: Array<string> = [];
    if (
      Array.isArray(args.productReferenceStorageKeys) &&
      args.productReferenceStorageKeys.length > 0
    ) {
      const resolvedUrls = await step.runAction(
        internal.products.ai.actions.resolve_storage_urls.resolveStorageUrls,
        { storageKeys: args.productReferenceStorageKeys }
      );
      // Convert local dev URLs to externally accessible production URLs
      productReferenceUrls = resolvedUrls.map(toExternallyAccessibleUrl);
    } else if (
      Array.isArray(args.productReferenceStorageIds) &&
      args.productReferenceStorageIds.length > 0
    ) {
      const resolvedUrls = await step.runAction(
        internal.products.ai.actions.resolve_storage_urls.resolveStorageUrls,
        { storageIds: args.productReferenceStorageIds }
      );
      // Convert local dev URLs to externally accessible production URLs
      productReferenceUrls = resolvedUrls.map(toExternallyAccessibleUrl);
    }

    const userPrompt = args.prompt || '';
    const avatarRefCount = parseAvatarRefCountFromPrompt(userPrompt);
    const isAvatarGenerationPrompt = avatarRefCount !== null;
    const width = args.width;
    const height = args.height;
    const aspectRatio: string = (() => {
      // Use sanitized aspect ratio - if it was 'match_input_image' or 'auto',
      // sanitizedAspectRatio is already '1:1', so calculate from dimensions
      if (
        args.output_aspect_ratio === 'match_input_image' ||
        args.output_aspect_ratio === 'auto'
      ) {
        const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
        const g = Math.max(1, gcd(width, height));
        return `${Math.round(width / g)}:${Math.round(height / g)}`;
      }
      // Use sanitized aspect ratio (already validated and cleaned)
      return sanitizedAspectRatio;
    })();

    // Convert all URL sources to externally accessible URLs
    const convertedReferenceImageUrls = (args.referenceImageUrls ?? []).map(
      toExternallyAccessibleUrl
    );

    const productImageUrl =
      pickUsableProductImageUrl({
        explicit: args.productImageUrl
          ? toExternallyAccessibleUrl(args.productImageUrl)
          : undefined,
        main: args.mainImageUrl
          ? toExternallyAccessibleUrl(args.mainImageUrl)
          : undefined,
        refs: convertedReferenceImageUrls,
        productReferenceUrls,
      }) ?? undefined;

    if (!productImageUrl) {
      const debug = {
        productImageUrl: args.productImageUrl ?? null,
        mainImageUrl: args.mainImageUrl ?? null,
        referenceImageUrlsCount: args.referenceImageUrls?.length ?? 0,
        productReferenceStorageKeysCount:
          args.productReferenceStorageKeys?.length ?? 0,
        productReferenceStorageIdsCount:
          args.productReferenceStorageIds?.length ?? 0,
        resolvedProductReferenceUrlsCount: productReferenceUrls.length,
      };
      console.error(
        '[generateProductImage] ❌ No usable product image URL available',
        debug
      );

      // Track failure in PostHog
      try {
        const distinctId = await resolveWorkflowDistinctId(step, {
          userId: args.userId ?? null,
          authUserId: args.authUserId ?? null,
          relatedAssetId: args.relatedAssetId ?? null,
          orgSlug: args.orgSlug ?? null,
        });
        if (distinctId) {
          await step.runAction(internal.posthog.captureException, {
            distinctId,
            errorMessage:
              'Product image URL is required and must be a publicly fetchable URL',
            errorName: 'ImageGenerationFailed',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'image_generation_failed',
              type: 'marketing',
              error: 'no_product_image_url',
              orgSlug: args.orgSlug,
              assetId: args.relatedAssetId,
              width: args.width,
              height: args.height,
              aspectRatio: args.output_aspect_ratio,
              baseResolution: args.defaultOutputResolution ?? '1K',
            },
          });
        }
      } catch {
        // PostHog failures should never block the error
      }

      throw new ConvexError(
        'Product image URL is required and must be a publicly fetchable URL. ' +
          'Please retry using a stored asset reference (storageKey) rather than a local preview URL.'
      );
    }

    let finalPipeline: ImageGeneration | null = null;
    let alternatePipelines: Array<ImageGeneration> = [];
    let aggregatedCost = 0;
    let aggregatedBaseCost = 0; // Track base provider cost (CTC) separately
    let aggregatedRefinerCost = 0; // Track refiner cost separately
    const costBreakdown: Array<{
      step: string;
      totalCost: number;
      baseCost: number;
      refinerCost?: number;
    }> = [];

    // Compose and Around flows in parallel (tolerate failures)
    if (args.relatedAssetId) {
      await step.runMutation(internal.assets.mutations.updateAssetStatus, {
        assetId: args.relatedAssetId,
        status: 'processing',
        statusMessage: 'Generating base scene...',
      });
    }
    const [composeSettled, aroundSettled] = await Promise.allSettled([
      ENABLE_COMPOSE_FLOW
        ? step.runAction(
            internal.products.ai.flows.with_product_compose_flow
              .runWithProductComposeFlow,
            {
              userPrompt,
              userId: args.userId,
              productImageUrl,
              productReferenceUrls,
              aspectRatio,
              ...(args.relatedAssetId
                ? { relatedAssetId: args.relatedAssetId }
                : {}),
            }
          )
        : Promise.resolve({
            candidates: [] as Array<ImageGeneration>,
            halfCost: 0,
          }),
      ENABLE_AROUND_FLOW
        ? step.runAction(
            internal.products.ai.flows.with_product_around_flow
              .runWithProductAroundFlow,
            {
              userPrompt,
              productImageUrl,
              productReferenceUrls,
              aspectRatio,
              ...(args.relatedAssetId
                ? { relatedAssetId: args.relatedAssetId }
                : {}),
              // Pass base resolution for model output (1K or 2K before upscaling)
              ...(args.defaultOutputResolution
                ? { defaultOutputResolution: args.defaultOutputResolution }
                : {}),
            }
          )
        : Promise.resolve([] as Array<ImageGeneration>),
    ]);

    const composeRes =
      composeSettled.status === 'fulfilled'
        ? composeSettled.value
        : { candidates: [] as Array<ImageGeneration>, halfCost: 0 };
    const aroundCandidates: Array<ImageGeneration> =
      aroundSettled.status === 'fulfilled' ? aroundSettled.value : [];

    if (args.relatedAssetId) {
      await step.runMutation(internal.assets.mutations.updateAssetStatus, {
        assetId: args.relatedAssetId,
        status: 'processing',
        statusMessage: 'Selecting best result...',
      });
    }

    console.log(`[generateProductImage] 📥 Flows settled:`, {
      assetId: args.relatedAssetId,
      compose: {
        status: composeSettled.status,
        candidatesCount: composeRes.candidates.length,
      },
      around: {
        status: aroundSettled.status,
        candidatesCount: aroundCandidates.length,
      },
    });

    // Log and track flow failures for monitoring
    if (composeSettled.status === 'rejected' && ENABLE_COMPOSE_FLOW) {
      console.warn('[generateProductImage] ⚠️ Compose flow failed:', {
        assetId: args.relatedAssetId,
        error:
          composeSettled.reason instanceof Error
            ? composeSettled.reason.message
            : String(composeSettled.reason),
      });
    }
    if (aroundSettled.status === 'rejected' && ENABLE_AROUND_FLOW) {
      console.warn('[generateProductImage] ⚠️ Around flow failed:', {
        assetId: args.relatedAssetId,
        error:
          aroundSettled.reason instanceof Error
            ? aroundSettled.reason.message
            : String(aroundSettled.reason),
      });
    }

    // Calculate costs for compose flow
    const halfCost = composeRes.halfCost ?? 0;
    // Note: halfCost is totalCost from halfStage, but we need baseCost
    // Since halfStage is an ImageGeneration object, we'd need to track it separately
    // For now, assume halfCost is baseCost (since compose flow doesn't use refiner for halfStage)
    const halfBaseCost = halfCost; // HalfStage doesn't use refiner, so baseCost = totalCost
    const composeCandidatesCost = composeRes.candidates.reduce(
      (sum, c) => sum + c.totalCost,
      0
    );
    const composeCandidatesBaseCost = composeRes.candidates.reduce(
      (sum, c) => sum + (c.baseCost ?? c.totalCost),
      0
    );
    const composeCandidatesRefinerCost = composeRes.candidates.reduce(
      (sum, c) => sum + (c.refinerCost ?? 0),
      0
    );

    // Calculate costs for around flow
    const aroundCandidatesCost = aroundCandidates.reduce(
      (sum, c) => sum + c.totalCost,
      0
    );
    const aroundCandidatesBaseCost = aroundCandidates.reduce(
      (sum, c) => sum + (c.baseCost ?? c.totalCost),
      0
    );
    const aroundCandidatesRefinerCost = aroundCandidates.reduce(
      (sum, c) => sum + (c.refinerCost ?? 0),
      0
    );

    // Aggregate costs
    const composeTotalCost = halfCost + composeCandidatesCost;
    const composeBaseCost = halfBaseCost + composeCandidatesBaseCost;
    aggregatedCost += composeTotalCost;
    aggregatedBaseCost += composeBaseCost;
    aggregatedRefinerCost += composeCandidatesRefinerCost;

    costBreakdown.push({
      step: 'Compose Flow',
      totalCost: composeTotalCost,
      baseCost: composeBaseCost,
      refinerCost: composeCandidatesRefinerCost,
    });

    const aroundTotalCost = aroundCandidatesCost;
    const aroundBaseCost = aroundCandidatesBaseCost;
    aggregatedCost += aroundTotalCost;
    aggregatedBaseCost += aroundBaseCost;
    aggregatedRefinerCost += aroundCandidatesRefinerCost;

    costBreakdown.push({
      step: 'Around Flow',
      totalCost: aroundTotalCost,
      baseCost: aroundBaseCost,
      refinerCost: aroundCandidatesRefinerCost,
    });

    const candidates = [...composeRes.candidates, ...aroundCandidates];
    console.log(
      `[generateProductImage] 👥 Total candidates: ${candidates.length}`,
      {
        assetId: args.relatedAssetId,
        composeCount: composeRes.candidates.length,
        aroundCount: aroundCandidates.length,
      }
    );

    let judgeCandidates = candidates;
    if (judgeCandidates.length === 0 && ENABLE_AROUND_FLOW) {
      // Fallback: try to produce at least one around candidate
      console.log(
        `[generateProductImage] ⚠️ No candidates produced, attempting Fallback Around Flow`,
        {
          assetId: args.relatedAssetId,
        }
      );
      try {
        const fallback = await step.runAction(
          internal.products.ai.flows.with_product_around_flow
            .runWithProductAroundFlow,
          {
            userPrompt,
            productImageUrl,
            productReferenceUrls,
            aspectRatio,
            ...(args.relatedAssetId
              ? { relatedAssetId: args.relatedAssetId }
              : {}),
            // Pass base resolution for model output (1K or 2K before upscaling)
            ...(args.defaultOutputResolution
              ? { defaultOutputResolution: args.defaultOutputResolution }
              : {}),
          }
        );
        judgeCandidates = fallback;
        console.log(
          `[generateProductImage] 📥 Fallback Around Flow complete: ${fallback.length} candidate(s)`,
          {
            assetId: args.relatedAssetId,
          }
        );

        const fallbackTotalCost = fallback.reduce(
          (sum, c) => sum + c.totalCost,
          0
        );
        const fallbackBaseCost = fallback.reduce(
          (sum, c) => sum + (c.baseCost ?? c.totalCost),
          0
        );
        const fallbackRefinerCost = fallback.reduce(
          (sum, c) => sum + (c.refinerCost ?? 0),
          0
        );
        aggregatedCost += fallbackTotalCost;
        aggregatedBaseCost += fallbackBaseCost;
        aggregatedRefinerCost += fallbackRefinerCost;

        costBreakdown.push({
          step: 'Fallback Around Flow',
          totalCost: fallbackTotalCost,
          baseCost: fallbackBaseCost,
          refinerCost: fallbackRefinerCost,
        });
      } catch (fallbackError) {
        console.error(
          `[generateProductImage] ❌ Fallback Around Flow failed:`,
          {
            assetId: args.relatedAssetId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          }
        );
      }
    }

    // Optional realism and framing pass (tolerate failures)
    if (ENABLE_REALISM_PASS && judgeCandidates.length > 0) {
      console.log(
        `[generateProductImage] ✨ Starting Realism Pass for ${judgeCandidates.length} candidate(s)`,
        {
          assetId: args.relatedAssetId,
        }
      );
      try {
        const realism = await step.runAction(
          internal.products.ai.actions.image_generation_helpers
            .runRealismAndFramingPass,
          {
            candidates: judgeCandidates,
            aspectRatio,
            ...(args.relatedAssetId
              ? { relatedAssetId: args.relatedAssetId }
              : {}),
          }
        );
        judgeCandidates = realism.candidates;
        console.log(
          `[generateProductImage] ✅ Realism Pass complete: ${realism.successCount} success, ${realism.failureCount} failure`,
          {
            assetId: args.relatedAssetId,
          }
        );

        // Realism pass adds new costs (running realism model on candidates)
        // Since realism doesn't use refiner, baseCost = totalCost for realism pass
        aggregatedCost += realism.realismCost;
        aggregatedBaseCost += realism.realismCost; // Realism pass baseCost equals totalCost (no refiner)

        costBreakdown.push({
          step: 'Realism & Framing Pass',
          totalCost: realism.realismCost,
          baseCost: realism.realismCost,
        });
      } catch (realismError) {
        console.warn(
          `[generateProductImage] ⚠️ Realism Pass failed (ignoring):`,
          {
            assetId: args.relatedAssetId,
            error:
              realismError instanceof Error
                ? realismError.message
                : String(realismError),
          }
        );
      }
    }

    // Judge selection (tolerate judge failures, can be disabled via feature flag)
    if (judgeCandidates.length > 0) {
      let selectedIndex = 0;
      const judgeDisabledByCaller = args.skipJudgeSelection === true;
      if (ENABLE_JUDGE_SELECTION && !judgeDisabledByCaller) {
        console.log(
          `[generateProductImage] ⚖️ Starting Judge Selection from ${judgeCandidates.length} candidate(s)`,
          {
            assetId: args.relatedAssetId,
          }
        );
        try {
          const sel = await step.runAction(
            internal.products.ai.lib.judge_selection.selectBestCandidate,
            {
              candidates: judgeCandidates,
              prompt: userPrompt,
              productImageUrl: productImageUrl ?? null,
              productReferenceUrls,
              ...(convertedReferenceImageUrls.length > 0
                ? { identityReferenceUrls: convertedReferenceImageUrls }
                : {}),
              userId: args.userId,
              orgSlug: args.orgSlug,
              ...(args.relatedAssetId
                ? { relatedAssetId: args.relatedAssetId }
                : {}),
            }
          );
          selectedIndex = Math.max(
            0,
            Math.min(judgeCandidates.length - 1, sel.selectedIndex)
          );
          console.log(
            `[generateProductImage] ✅ Judge selected candidate index ${selectedIndex}`,
            {
              assetId: args.relatedAssetId,
              scores: sel.scores,
            }
          );
        } catch (judgeError) {
          console.warn(
            `[generateProductImage] ⚠️ Judge selection failed, falling back to first candidate:`,
            {
              assetId: args.relatedAssetId,
              error:
                judgeError instanceof Error
                  ? judgeError.message
                  : String(judgeError),
            }
          );
          selectedIndex = 0; // fallback to the first candidate
        }
      } else {
        console.log(
          `[generateProductImage] ⚖️ Judge Selection disabled, using first candidate`,
          {
            assetId: args.relatedAssetId,
            ...(args.skipJudgeSelection === true
              ? { reason: 'skipJudgeSelection' }
              : {}),
          }
        );
        selectedIndex = 0;
      }

      finalPipeline = judgeCandidates[selectedIndex]!;
      alternatePipelines = judgeCandidates.filter(
        (_, i) => i !== selectedIndex
      );

      // Update temp image URL with selected candidate
      if (args.relatedAssetId && finalPipeline?.imageUrl) {
        try {
          await step.runMutation(internal.assets.mutations.updateAssetTempUrl, {
            assetId: args.relatedAssetId,
            tempImageUrl: finalPipeline.imageUrl,
          });
        } catch {
          // Non-fatal: continue workflow
        }
      }
    }

    // Feedback loop: evaluate candidate and potentially rerun with improved prompt
    if (ENABLE_FEEDBACK_LOOP) {
      if (args.relatedAssetId) {
        await step.runMutation(internal.assets.mutations.updateAssetStatus, {
          assetId: args.relatedAssetId,
          status: 'processing',
          statusMessage: 'Reviewing generation...',
        });
      }
      if (!finalPipeline) {
        console.log(
          `[generateProductImage] ⏭️ Skipping Feedback Loop (Review Stage) because no finalPipeline exists`,
          {
            assetId: args.relatedAssetId,
          }
        );
      } else {
        console.log(
          `[generateProductImage] 🔍 Entering Feedback Loop (Review Stage)`,
          {
            assetId: args.relatedAssetId,
            model: finalPipeline.finalModelName,
          }
        );

        // If this is an avatar generation prompt, we may adjust rerun strategy.

        let currentPrompt = userPrompt;
        let feedbackAttempt = 0;

        while (feedbackAttempt < MAX_FEEDBACK_RERUNS) {
          try {
            console.log(
              `[generateProductImage] 🔍 Feedback evaluation (attempt=${feedbackAttempt})`,
              {
                assetId: args.relatedAssetId,
                promptLength: currentPrompt.length,
                modelName: finalPipeline.finalModelName,
              }
            );

            const feedbackResult = await step.runAction(
              internal.products.ai.lib.image_feedback
                .evaluateProductImageFeedback,
              {
                attempt: feedbackAttempt,
                userPrompt: currentPrompt,
                productImageUrl: productImageUrl!,
                productReferenceUrls,
                ...(convertedReferenceImageUrls.length > 0
                  ? { identityReferenceUrls: convertedReferenceImageUrls }
                  : {}),
                generatedImageUrl: finalPipeline.imageUrl,
                aspectRatio,
                orgSlug: args.orgSlug,
                ...(args.relatedAssetId
                  ? { relatedAssetId: args.relatedAssetId }
                  : {}),
                modelName: finalPipeline.finalModelName,
              }
            );

            if (feedbackResult.kind === 'ok') {
              console.log(
                `[generateProductImage] ✅ Feedback approved candidate`,
                {
                  assetId: args.relatedAssetId,
                  minorIssuesCount: feedbackResult.minorIssues?.length ?? 0,
                }
              );
              break; // Candidate is acceptable, proceed to refine
            }

            // Feedback suggests a rerun
            console.log(`[generateProductImage] 🔄 Feedback triggered rerun`, {
              assetId: args.relatedAssetId,
              reason: feedbackResult.reason,
              majorIssueCount: feedbackResult.majorIssues.length,
              majorIssues: feedbackResult.majorIssues,
              originalPromptLength: currentPrompt.length,
              updatedPromptLength: feedbackResult.updatedUserPrompt.length,
            });

            // Update the prompt for rerun
            currentPrompt = feedbackResult.updatedUserPrompt;

            // Update asset prompt to reflect the regenerated prompt
            if (args.relatedAssetId) {
              try {
                await step.runMutation(
                  internal.assets.mutations.updateAssetPrompt,
                  {
                    assetId: args.relatedAssetId,
                    prompt: currentPrompt,
                  }
                );
                console.debug(
                  `[generateProductImage] 📝 Updated asset prompt for rerun`,
                  { assetId: args.relatedAssetId }
                );
              } catch {
                // Non-fatal: continue with rerun anyway
              }
            }

            // Rerun Around Flow with updated prompt.
            //
            // Default behavior: keep the base resolution the workflow was called with.
            // Avatar behavior: if the initial attempt was 2K (or unset), fall back to 1K on rerun
            // for better identity stability.
            const rerunDefaultOutputResolution: '1K' | '2K' | '4K' | undefined =
              (() => {
                if (!isAvatarGenerationPrompt)
                  return args.defaultOutputResolution;
                if (args.defaultOutputResolution === '4K') return '4K';
                if (args.defaultOutputResolution === '1K') return '1K';
                return '1K';
              })();

            console.log(
              `[generateProductImage] 🚀 Re-running Around Flow with updated prompt`,
              {
                assetId: args.relatedAssetId,
                attempt: feedbackAttempt + 1,
                baseResolution: rerunDefaultOutputResolution ?? '1K',
                willSkipRefine: rerunDefaultOutputResolution === '4K',
              }
            );

            const rerunCandidates = await step.runAction(
              internal.products.ai.flows.with_product_around_flow
                .runWithProductAroundFlow,
              {
                userPrompt: currentPrompt,
                productImageUrl: productImageUrl!,
                productReferenceUrls,
                aspectRatio,
                ...(args.relatedAssetId
                  ? { relatedAssetId: args.relatedAssetId }
                  : {}),
                ...(rerunDefaultOutputResolution
                  ? { defaultOutputResolution: rerunDefaultOutputResolution }
                  : {}),
              }
            );

            // Track rerun costs
            const rerunTotalCost = rerunCandidates.reduce(
              (sum, c) => sum + c.totalCost,
              0
            );
            const rerunBaseCost = rerunCandidates.reduce(
              (sum, c) => sum + (c.baseCost ?? c.totalCost),
              0
            );
            const rerunRefinerCost = rerunCandidates.reduce(
              (sum, c) => sum + (c.refinerCost ?? 0),
              0
            );
            aggregatedCost += rerunTotalCost;
            aggregatedBaseCost += rerunBaseCost;
            aggregatedRefinerCost += rerunRefinerCost;

            costBreakdown.push({
              step: `Feedback Rerun (attempt ${feedbackAttempt + 1})`,
              totalCost: rerunTotalCost,
              baseCost: rerunBaseCost,
              refinerCost: rerunRefinerCost,
            });

            if (rerunCandidates.length > 0) {
              // Replace pipeline with rerun result (select first candidate)
              finalPipeline = rerunCandidates[0]!;
              alternatePipelines = rerunCandidates.slice(1);

              // Update temp URL with rerun candidate
              if (args.relatedAssetId && finalPipeline.imageUrl) {
                try {
                  await step.runMutation(
                    internal.assets.mutations.updateAssetTempUrl,
                    {
                      assetId: args.relatedAssetId,
                      tempImageUrl: finalPipeline.imageUrl,
                    }
                  );
                } catch {
                  // Non-fatal
                }
              }

              console.log(
                `[generateProductImage] ✨ Rerun produced ${rerunCandidates.length} candidate(s)`,
                {
                  assetId: args.relatedAssetId,
                  selectedModel: finalPipeline.finalModelName,
                }
              );
            } else {
              console.warn(
                `[generateProductImage] ⚠️ Rerun produced no candidates, keeping original`,
                { assetId: args.relatedAssetId }
              );
            }

            feedbackAttempt++;
          } catch (feedbackError) {
            // Feedback failed - log and continue with current candidate
            console.error(
              `[generateProductImage] ❌ Feedback loop error, proceeding with current candidate`,
              {
                assetId: args.relatedAssetId,
                error:
                  feedbackError instanceof Error
                    ? feedbackError.message
                    : String(feedbackError),
              }
            );
            break;
          }
        }
      }
    }

    // Post selection refine pass across selected + alternates (tolerate failures)
    // Skip refine pass if:
    // - base resolution is 4K (already high quality, no upscaling needed)
    // - skipRefine flag is set (caller will handle upscale separately, e.g., avatar workflow)
    const skipRefineFor4K = args.defaultOutputResolution === '4K';
    const skipRefineRequested = args.skipRefine === true;
    if (
      ENABLE_REFINE_PASS &&
      finalPipeline &&
      !skipRefineFor4K &&
      !skipRefineRequested
    ) {
      if (args.relatedAssetId) {
        await step.runMutation(internal.assets.mutations.updateAssetStatus, {
          assetId: args.relatedAssetId,
          status: 'processing',
          statusMessage: 'Refining image...',
        });
      }
      // TODO: temporarily use SeedVR for avatar + non-avatar alike.
      // const upscalerModel = isAvatarGenerationPrompt
      //   ? CRYSTAL_MODEL_IDENTIFIER
      //   : SEEDVR_MODEL_IDENTIFIER;
      const upscalerModel = SEEDVR_MODEL_IDENTIFIER;
      console.log(
        `[generateProductImage] 💎 Starting Refine Pass (${upscalerModel})`,
        {
          assetId: args.relatedAssetId,
          candidateCount: 1 + alternatePipelines.length,
        }
      );
      try {
        const refineResult = await step.runAction(
          internal.products.ai.actions.refine_candidates.refineCandidatesAction,
          {
            candidates: [finalPipeline, ...alternatePipelines],
            width,
            height,
            aspectRatio,
            ...(args.relatedAssetId
              ? { relatedAssetId: args.relatedAssetId }
              : {}),
            upscalerModel,
          }
        );
        // Refine cost is refiner cost (selected upscaler), not base cost
        aggregatedCost += refineResult.addedCost;
        aggregatedRefinerCost += refineResult.addedCost;
        // BaseCost doesn't change with refine, only refinerCost increases

        const upscalerLabel = getUpscalerModelName(upscalerModel);
        costBreakdown.push({
          step: `Refine Pass (${upscalerLabel})`,
          totalCost: refineResult.addedCost,
          baseCost: 0, // Refine doesn't add base cost
          refinerCost: refineResult.addedCost,
        });

        finalPipeline = refineResult.updated[0]!;
        alternatePipelines = refineResult.updated.slice(1);
        console.log(`[generateProductImage] ✅ Refine Pass complete`, {
          assetId: args.relatedAssetId,
          addedCost: refineResult.addedCost,
        });
      } catch (refineError) {
        console.warn(
          `[generateProductImage] ⚠️ Refine Pass failed (ignoring):`,
          {
            assetId: args.relatedAssetId,
            error:
              refineError instanceof Error
                ? refineError.message
                : String(refineError),
          }
        );
      }
    } else if (skipRefineFor4K) {
      console.log(
        `[generateProductImage] ⏭️ Skipping refine pass (4K base resolution)`,
        { assetId: args.relatedAssetId }
      );
    } else if (skipRefineRequested) {
      console.log(
        `[generateProductImage] ⏭️ Skipping refine pass (skipRefine requested by caller)`,
        { assetId: args.relatedAssetId }
      );
    }

    if (!finalPipeline) {
      console.error('[generateProductImage] ❌ No final result produced', {
        assetId: args.relatedAssetId,
        orgSlug: args.orgSlug,
        composeFlowEnabled: ENABLE_COMPOSE_FLOW,
        aroundFlowEnabled: ENABLE_AROUND_FLOW,
        candidatesCount: candidates.length,
        judgeCandidatesCount: judgeCandidates.length,
      });

      // Track failure in PostHog
      try {
        const distinctId = await resolveWorkflowDistinctId(step, {
          userId: args.userId ?? null,
          authUserId: args.authUserId ?? null,
          relatedAssetId: args.relatedAssetId ?? null,
          orgSlug: args.orgSlug ?? null,
        });
        if (distinctId) {
          await step.runAction(internal.posthog.captureException, {
            distinctId,
            errorMessage:
              'Image generation plan did not produce a final result',
            errorName: 'ImageGenerationFailed',
            properties: {
              [POSTHOG_PROP.CONTEXT_EVENT]: 'image_generation_failed',
              type: 'marketing',
              error: 'no_final_result',
              orgSlug: args.orgSlug,
              assetId: args.relatedAssetId,
              width: args.width,
              height: args.height,
              aspectRatio: args.output_aspect_ratio,
              baseResolution: args.defaultOutputResolution ?? '1K',
              candidatesCount: candidates.length,
              composeFlowEnabled: ENABLE_COMPOSE_FLOW,
              aroundFlowEnabled: ENABLE_AROUND_FLOW,
            },
          });
        }
      } catch {
        // PostHog failures should never block the error
      }

      throw new ConvexError(
        'Image generation plan did not produce a final result'
      );
    }

    // Log detailed cost breakdown
    console.debug(
      `[generateProductImage] 💰 Cost Breakdown for asset ${args.relatedAssetId ?? 'N/A'}:`,
      {
        steps: costBreakdown,
        totals: {
          totalCost: aggregatedCost,
          baseCost: aggregatedBaseCost,
          refinerCost: aggregatedRefinerCost,
        },
      }
    );

    // Persist first (with retry)
    if (args.relatedAssetId) {
      await step.runMutation(internal.assets.mutations.updateAssetStatus, {
        assetId: args.relatedAssetId,
        status: 'processing',
        statusMessage: 'Saving image...',
      });
    }
    const { storage, alternateStorageKeys } = await step.runAction(
      internal.products.ai.lib.persist_only.persistOnly,
      {
        finalPipeline: { ...finalPipeline, totalCost: aggregatedCost },
        alternatePipelines,
        filename: args.filename,
        orgSlug: args.orgSlug,
      },
      {
        name: 'persistOnly',
        retry: { maxAttempts: 5, initialBackoffMs: 1000, base: 2 },
      }
    );

    // Finalize asset if provided
    const skipFinalizeAsset = args.skipFinalizeAsset === true;
    if (ENABLE_FINALIZE_ASSET && args.relatedAssetId && !skipFinalizeAsset) {
      try {
        console.debug(
          `[generateProductImage] Starting metadata extraction for asset ${args.relatedAssetId}`
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
          console.debug(
            `[generateProductImage] Attempting metadata extraction from storage URL: ${storage.url}`
          );
          meta = await step.runAction(
            internal.node.image_utils.extractImageMetadata,
            { url: storage.url },
            {
              name: 'extractImageMetadata',
              retry: { maxAttempts: 2, initialBackoffMs: 1000, base: 2 },
            }
          );
          console.debug(
            `[generateProductImage] Successfully extracted metadata from storage URL:`,
            {
              width: meta.width,
              height: meta.height,
              fileSize: meta.fileSize,
              mimeType: meta.mimeType,
            }
          );
        } catch (error) {
          console.warn(
            `[generateProductImage] Metadata extraction from storage URL failed, trying fallback:`,
            {
              error: error instanceof Error ? error.message : String(error),
              storageUrl: storage.url,
            }
          );
          // If storage URL fails, try fallback to original pipeline imageUrl
          try {
            console.debug(
              `[generateProductImage] Attempting metadata extraction from fallback URL: ${finalPipeline.imageUrl}`
            );
            meta = await step.runAction(
              internal.node.image_utils.extractImageMetadata,
              { url: finalPipeline.imageUrl },
              {
                name: 'extractImageMetadataFallback',
                retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
              }
            );
            console.debug(
              `[generateProductImage] Successfully extracted metadata from fallback URL:`,
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
              `[generateProductImage] Failed to extract metadata for asset ${args.relatedAssetId}. ` +
                `Storage URL error: ${error instanceof Error ? error.message : String(error)}. ` +
                `Fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
            );
          }
        }

        // Only finalize if we have valid metadata (extractImageMetadata validates this)
        if (meta) {
          console.debug(
            `[generateProductImage] Finalizing asset ${args.relatedAssetId} with metadata:`,
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
          console.debug(
            `[generateProductImage] Successfully finalized asset ${args.relatedAssetId}`
          );
        } else {
          // Log warning but don't throw - asset will remain pending
          console.warn(
            `[generateProductImage] Failed to extract valid metadata for asset ${args.relatedAssetId}. ` +
              `Asset will remain pending.`
          );
        }
      } catch (error) {
        // Non-fatal: asset will remain pending or be handled elsewhere
        console.error(
          `[generateProductImage] Error finalizing asset ${args.relatedAssetId}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    } else if (
      ENABLE_FINALIZE_ASSET &&
      args.relatedAssetId &&
      skipFinalizeAsset
    ) {
      console.log(
        `[generateProductImage] ⏭️ Skipping asset finalization (skipFinalizeAsset requested)`,
        {
          assetId: args.relatedAssetId,
        }
      );
    }

    // Update finalPipeline with aggregated costs and baseCost before billing
    finalPipeline = {
      ...finalPipeline,
      totalCost: aggregatedCost,
      baseCost: aggregatedBaseCost, // Set aggregated baseCost for CTC tracking
      refinerCost: aggregatedRefinerCost,
    };

    console.debug(`[generateProductImage] 💳 Final billing values:`, {
      assetId: args.relatedAssetId,
      totalCost: aggregatedCost,
      baseCost: aggregatedBaseCost,
      refinerCost: aggregatedRefinerCost,
    });

    // Bill after (non-throwing) using aggregated pipeline costs only.
    // Always invoke billing so we consistently record CTC and emit standardized PostHog events.
    // When billing is disabled or deferred, we still record CTC and emit `image_generated` with
    // `billingStatus: 'skipped'` (no credit redemption).
    const shouldDeferBilling = args.deferBilling === true;
    if (!shouldDeferBilling) {
      try {
        await step.runAction(internal.products.ai.lib.bill_only.billOnly, {
          finalPipeline,
          userId: args.userId,
          orgSlug: args.orgSlug,
          relatedAssetId: args.relatedAssetId,
          skipCreditRedemption: !ENABLE_BILLING,
          usageContext: 'product_asset',
        });
      } catch {
        // Non-fatal billing failure
      }
    } else {
      console.log(
        `[generateProductImage] Billing deferred for asset ${args.relatedAssetId ?? 'N/A'}`,
        {
          totalCost: aggregatedCost,
          baseCost: aggregatedBaseCost,
          refinerCost: aggregatedRefinerCost,
        }
      );
    }

    return {
      model: finalPipeline.finalModelName,
      storageKey: storage.storageKey,
      url: storage.url,
      totalCost: aggregatedCost,
      // Include baseCost for deferred billing aggregation
      baseCost: aggregatedBaseCost,
      refinerCost: aggregatedRefinerCost,
      ...(alternateStorageKeys.length > 0 ? { alternateStorageKeys } : {}),
    };
  },
});
