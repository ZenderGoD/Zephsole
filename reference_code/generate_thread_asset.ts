import { internal, components } from '../../../_generated/api';
import { workflow } from '../../../workflow';
import type { Id } from '../../../_generated/dataModel';
import { createTool, listMessages } from '@convex-dev/agent';
import type {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from '../../../_generated/server';
import { ConvexError } from 'convex/values';
import { z } from 'zod';
import { createToolEnvelope, type ToolEnvelope } from './tool_envelope';
import {
  nextStepSuggestionsArgsSchema,
  type NextStepSuggestionsData,
} from './next_step_suggestions';
import {
  resolveUrl,
  isValidPublicUrl,
  rebaseR2Url,
} from '../../../media/resolve';
import { isValidStorageKey } from '../../../media/keys';
import { FEATURE_POOLS } from '../../../avatars/actions/persona_randomization';
import { formatPersonaDescription } from '../../../avatars/lib/persona_utils';
import { AVATAR_STUDIO_SETUP_PORTRAIT } from '../../../avatars/studio_constants';
import type { BrandProfile } from '../../../branding/types';

type ToolCtx = (ActionCtx | MutationCtx | QueryCtx) & {
  threadId?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSvgUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith('.svg');
  } catch {
    return url.toLowerCase().includes('.svg');
  }
}

function extractAllTextFromUnknown(
  obj: unknown,
  visited = new Set<object>()
): Array<string> {
  const texts: Array<string> = [];

  if (typeof obj === 'string') {
    texts.push(obj);
    return texts;
  }

  if (!obj || typeof obj !== 'object') return texts;

  if (visited.has(obj)) return texts;
  visited.add(obj);

  if (isRecord(obj) && typeof obj.text === 'string') {
    texts.push(obj.text);
  }

  if (isRecord(obj) && Array.isArray(obj.parts)) {
    for (const part of obj.parts) {
      texts.push(...extractAllTextFromUnknown(part, visited));
    }
  }

  if (isRecord(obj) && Array.isArray(obj.content)) {
    for (const item of obj.content) {
      texts.push(...extractAllTextFromUnknown(item, visited));
    }
  }

  if (isRecord(obj) && isRecord(obj.message)) {
    texts.push(...extractAllTextFromUnknown(obj.message, visited));
  }

  return texts;
}

function extractMetadataJsonBlocksFromText(
  text: string
): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  if (typeof text !== 'string' || text.length === 0) return results;

  let searchIndex = 0;
  while (true) {
    const metaIdx = text.indexOf('metadata:', searchIndex);
    if (metaIdx === -1) break;

    let i = metaIdx + 'metadata:'.length;
    while (i < text.length && /\s/.test(text[i] ?? '')) i += 1;
    if (text[i] !== '{') {
      searchIndex = metaIdx + 9;
      continue;
    }

    let braceCount = 0;
    let end = i;
    for (; end < text.length; end += 1) {
      const ch = text[end] ?? '';
      if (ch === '{') braceCount += 1;
      if (ch === '}') {
        braceCount -= 1;
        if (braceCount === 0) {
          end += 1;
          break;
        }
      }
    }

    const jsonStr = text.slice(i, end);
    try {
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      results.push(obj);
    } catch {
      // ignore malformed JSON blocks
    }
    searchIndex = end;
  }

  return results;
}

async function inferActiveBrandingIdFromThread(
  ctx: ToolCtx
): Promise<string | null> {
  if (!ctx.threadId || typeof ctx.threadId !== 'string') return null;

  // Prefer the thread-level sticky selection when available. This is more
  // reliable than scraping message metadata and ensures branding persists
  // across follow-up messages/suggestion clicks.
  try {
    const orgThread: unknown = await ctx.runQuery(
      internal.organizations.threads.queries.getByThreadIdSystem,
      { threadId: ctx.threadId }
    );
    if (isRecord(orgThread) && typeof orgThread.activeBrandingId === 'string') {
      const trimmed = orgThread.activeBrandingId.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  } catch (error) {
    console.warn(
      '[generateThreadAsset] Failed to read activeBrandingId from orgThread',
      {
        error,
      }
    );
  }

  // Read a small window of recent messages and pick the newest brandingId metadata.
  // This makes branding resilient even if the agent forgets to pass brandingId to the tool.
  try {
    const result: unknown = await listMessages(ctx, components.agent, {
      threadId: ctx.threadId,
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 30 },
    });

    const page: Array<unknown> =
      isRecord(result) && Array.isArray(result.page) ? result.page : [];

    for (const message of page) {
      const combinedText = extractAllTextFromUnknown(message).join('\n');
      const blocks = extractMetadataJsonBlocksFromText(combinedText);
      for (const b of blocks) {
        const brandingId = b.brandingId;
        if (typeof brandingId === 'string') {
          const trimmed = brandingId.trim();
          if (trimmed.length > 0) {
            return trimmed;
          }
        }
      }
    }
  } catch (error) {
    console.warn(
      '[generateThreadAsset] Failed to infer brandingId from thread',
      {
        error,
      }
    );
  }

  return null;
}

type BrandingImageRef = {
  src: string;
  storageKey?: string;
  metadataStatus?: 'pending' | 'processing' | 'completed' | 'failed';
};

function isBrandingImageRef(value: unknown): value is BrandingImageRef {
  if (!isRecord(value)) return false;
  if (typeof value.src !== 'string') return false;
  if (value.storageKey !== undefined && typeof value.storageKey !== 'string')
    return false;
  if (
    value.metadataStatus !== undefined &&
    value.metadataStatus !== 'pending' &&
    value.metadataStatus !== 'processing' &&
    value.metadataStatus !== 'completed' &&
    value.metadataStatus !== 'failed'
  ) {
    return false;
  }
  return true;
}

function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`"'’“”]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  const tokens = normalizeForSimilarity(text)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
  return new Set(tokens);
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) {
    if (sb.has(t)) intersection += 1;
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function arePromptsTooSimilar(a: string, b: string): boolean {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length === 0 || nb.length === 0) return true;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return jaccardSimilarity(na, nb) >= 0.9;
}

// FEATURE_POOLS is now imported from persona_randomization.ts

/**
 * Randomly select a value from an array.
 * Used in buildContrastingAvatarPortraitPrompt fallback function.
 */
function randomChoice<T>(array: readonly T[]): T {
  return array[Math.floor(Math.random() * array.length)]!;
}

function buildContrastingAvatarPortraitPrompt(basePrompt: string): string {
  // Use the standardized studio setup constants to ensure consistency
  const standardStudioConstraints = AVATAR_STUDIO_SETUP_PORTRAIT;

  // Try to extract studio setup from base prompt (look for common studio setup phrases)
  const baseLower = basePrompt.toLowerCase();
  const hasStudioSetup =
    baseLower.includes('white crew-neck') ||
    baseLower.includes('light gray backdrop') ||
    baseLower.includes('studio background') ||
    baseLower.includes('soft, even studio lighting');

  // If base prompt already has studio setup, reuse it; otherwise use standard
  const studioConstraints = hasStudioSetup
    ? // Extract studio setup section from base prompt (everything except facial features)
      // For now, we'll use standard constraints to ensure consistency
      standardStudioConstraints
    : standardStudioConstraints;

  // Randomize features to ensure distinctness from candidate 1.
  // Select random features from pools to create a unique identity.
  const randomizedFeatures = {
    skinTone: randomChoice(FEATURE_POOLS.skinTone),
    skinDetails: randomChoice(FEATURE_POOLS.skinDetails),
    hairColor: randomChoice(FEATURE_POOLS.hairColor),
    hairTexture: randomChoice(FEATURE_POOLS.hairTexture),
    hairLength: randomChoice(FEATURE_POOLS.hairLength),
    eyeColor: randomChoice(FEATURE_POOLS.eyeColor),
    faceShape: randomChoice(FEATURE_POOLS.faceShape),
    jaw: randomChoice(FEATURE_POOLS.jaw),
    ageRange: randomChoice(FEATURE_POOLS.ageRange),
    distinctiveMarks: randomChoice(FEATURE_POOLS.distinctiveMarks),
  };

  // Build distinct identity description with randomized features
  const distinctIdentityParts: string[] = [];
  distinctIdentityParts.push(`${randomizedFeatures.skinTone} skin`);
  if (
    randomizedFeatures.skinDetails !== 'clean skin' &&
    randomizedFeatures.skinDetails !== 'slight texture'
  ) {
    distinctIdentityParts.push(`with ${randomizedFeatures.skinDetails}`);
  }
  distinctIdentityParts.push(
    `${randomizedFeatures.hairLength} ${randomizedFeatures.hairTexture} ${randomizedFeatures.hairColor} hair`
  );
  distinctIdentityParts.push(`${randomizedFeatures.eyeColor} eyes`);
  distinctIdentityParts.push(`${randomizedFeatures.faceShape} face shape`);
  distinctIdentityParts.push(`${randomizedFeatures.jaw} jawline`);
  distinctIdentityParts.push(`${randomizedFeatures.ageRange} age range`);
  if (randomizedFeatures.distinctiveMarks !== 'none') {
    distinctIdentityParts.push(`${randomizedFeatures.distinctiveMarks}`);
  }

  const distinctIdentity =
    'IMPORTANT: This MUST be a different person than candidate 1. ' +
    `Use these identity features: ${distinctIdentityParts.join('; ')}. ` +
    'Do not reuse candidate 1 feature set. ' +
    'Keep the exact same studio setup (wardrobe, background, lighting, camera, grooming) as candidate 1.';

  // Build the prompt: studio constraints first, then distinct identity
  return `${studioConstraints}\n\n${distinctIdentity}`.trim();
}

// Single image generation request schema
const singleGenerateRequestSchema = z.object({
  prompt: z.string().min(1).describe('Prompt to guide the generation'),
  referenceStorageKeys: z
    .array(z.string())
    .describe(
      'R2 storage keys of reference images to use as basis for generation'
    ),
  output_aspect_ratio: z
    .string()
    .describe(
      'Output aspect ratio for the generated image (e.g., "1:1", "16:9").'
    ),
  show_user_visual: z
    .boolean()
    .nullable()
    .describe(
      'Whether to show the user visual to the user. Defaults to true if null.'
    ),
  brandingId: z
    .string()
    .nullable()
    .describe(
      'Optional branding ID to apply brand context (colors, fonts, logo) to the generated image. When provided, brand guidelines will be automatically included in the prompt. Pass null if not needed.'
    ),
  isAvatarPortrait: z
    .boolean()
    .nullable()
    .describe(
      'Whether this image was generated as a potential avatar portrait. When true, the UI will show "Save as avatar" instead of "Save as product". Pass null or false if not an avatar.'
    ),
});

const generalSuggestionsSchema = nextStepSuggestionsArgsSchema.omit({
  uiMode: true,
});

// Args schema (requests-only). Always supply an explicit array of requests.
export const generateThreadAssetArgsSchema = z.object({
  // Batch mode: provide explicit array of request objects (always required)
  requests: z
    .array(singleGenerateRequestSchema)
    .min(1)
    .describe('Batch of image generation requests to run in parallel'),
  generalSuggestions: generalSuggestionsSchema
    .nullable()
    .describe(
      'Optional general next-step suggestions to display immediately while assets generate. Pass null if not needed.'
    ),
});

export type GenerateThreadAssetArgs = z.infer<
  typeof generateThreadAssetArgsSchema
>;

export type GenerateThreadAssetItem = {
  assetId: string;
};

export type GenerateThreadAssetData = {
  assetIds: Array<GenerateThreadAssetItem>;
  suggestions?: NextStepSuggestionsData;
};

export type GenerateThreadAssetReturn = ToolEnvelope<GenerateThreadAssetData>;

export const generateThreadAsset = createTool({
  description: `
Generate one or multiple image assets scoped to the current chat thread (not attached to any product/version).

This tool takes reference image storage keys (R2) and generates new images, then upscales them.

Avatar Support:
- When generating portraits for avatar/character creation, you MUST set \`isAvatarPortrait: true\` in each request. This enables the specialized "Save as avatar" UI flow.
- When any request has \`isAvatarPortrait: true\`, the tool will execute at most **2** avatar portrait requests. Any additional avatar portrait requests will be ignored to prevent accidental 4-up generations.

Arguments:
- Always call with { requests: [ { prompt, referenceStorageKeys, output_aspect_ratio, show_user_visual?, brandingId?, isAvatarPortrait? }, ... ] }
- Each request runs in parallel with the provided reference image storage keys (array, can be empty [] for ideation).

Branding support:
- Optional \`brandingId\`: When provided, automatically includes brand context in the prompt:
  - Brand colors, fonts, and visual style guidelines
  - Brand logo (if available) is automatically added as a reference image using its R2 storage key
  - Brand guidelines are embedded in the prompt to ensure generated images match the brand identity
- Use this when you have a \`brandingId\` from message metadata and want to apply brand guidelines directly.
- The logo storage key (R2) is automatically included in \`referenceStorageKeys\` when available, similar to how presets provide storage keys.
- Example: \`{ requests: [{ prompt: "Create a product image", brandingId: "xyz123", referenceStorageKeys: [], output_aspect_ratio: "1:1" }] }\`

Avatar Example:
- Example: \`{ requests: [{ prompt: "Portrait of a man...", isAvatarPortrait: true, referenceStorageKeys: [], output_aspect_ratio: "1:1" }, ...] }\`

Usage rules:
- Call this tool at most once per user message. Do NOT chain multiple \`generateThreadAsset\` calls in the same assistant turn unless the user sends a new message explicitly asking for more generations.
- Never auto accept suggestions from suggestion tool, as those are just to show the user options that they can click on, do not perform the suggestions that the tool itself maybe returning.

Aspect ratio:
- Use only supported aspect ratios: "match_input_image", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", or "21:9".
- If unsure, prefer "1:1".
    `,
  args: generateThreadAssetArgsSchema,
  handler: async (
    ctx,
    rawArgs: GenerateThreadAssetArgs
  ): Promise<ToolEnvelope<GenerateThreadAssetData>> => {
    console.log('[generateThreadAsset] Tool called with args:', {
      requestCount: rawArgs.requests?.length ?? 0,
      requests: rawArgs.requests?.map((req, idx) => ({
        index: idx,
        hasBrandingId: !!req.brandingId,
        brandingId: req.brandingId,
        promptPreview: req.prompt?.substring(0, 50),
      })),
    });
    try {
      if (!ctx.userId) {
        throw new ConvexError('Authentication required');
      }
      // Requests-only API: the schema guarantees a non-empty array
      const args: GenerateThreadAssetArgs = rawArgs;
      const originalRequests: Array<
        z.infer<typeof singleGenerateRequestSchema>
      > = args.requests;

      const MAX_AVATAR_PORTRAIT_REQUESTS = 2;

      const isAvatarRequest = (
        r: z.infer<typeof singleGenerateRequestSchema>
      ): boolean => r.isAvatarPortrait === true;

      // Enforce "avatar portraits = exactly 2 candidates" at the tool layer.
      // When ANY request has isAvatarPortrait: true, ONLY process the first 2 avatar portrait requests.
      // This prevents regressions even if the agent requests 4 portraits or mixes avatar/non-avatar requests.
      const avatarRequestIndices: Array<number> = [];
      for (const [idx, r] of originalRequests.entries()) {
        if (isAvatarRequest(r)) avatarRequestIndices.push(idx);
      }

      const hasAvatarRequests = avatarRequestIndices.length > 0;
      const allowedAvatarIndices = new Set<number>(
        avatarRequestIndices.slice(0, MAX_AVATAR_PORTRAIT_REQUESTS)
      );

      // When avatar requests are present, ONLY process the first 2 avatar portrait requests.
      // Ignore all other requests (both avatar and non-avatar) to ensure exactly 2 distinct avatars.
      const requests: Array<z.infer<typeof singleGenerateRequestSchema>> =
        hasAvatarRequests
          ? originalRequests.filter(
              (r, idx) => isAvatarRequest(r) && allowedAvatarIndices.has(idx)
            )
          : originalRequests;

      // Distinctness guard: ensure the two avatar prompts represent distinct people.
      // Use persona randomization to guarantee distinct features (25-35 features) for both avatars.
      // This ensures no two avatars are ever the same, even in thread chat.
      if (hasAvatarRequests && requests.length >= 2) {
        const firstReq = requests[0]!;
        const secondReq = requests[1]!;
        const p1 = firstReq.prompt;
        const p2 = secondReq.prompt;

        // Check if we can run actions (tools are typically called from agents which run in action context)
        if ('runAction' in ctx && typeof ctx.runAction === 'function') {
          // Extract and randomize persona for first avatar
          const firstExtractedPersona = await ctx.runAction(
            internal.avatars.actions.persona_generation.generatePersona,
            { userPrompt: p1 }
          );
          const firstRandomizedPersona = await ctx.runAction(
            internal.avatars.actions.persona_randomization.randomizePersona,
            { basePersona: firstExtractedPersona }
          );

          console.log(
            '[generateThreadAsset] Avatar 1 randomized persona:',
            JSON.stringify(firstRandomizedPersona, null, 2)
          );

          // Extract and randomize persona for second avatar
          const secondExtractedPersona = await ctx.runAction(
            internal.avatars.actions.persona_generation.generatePersona,
            { userPrompt: p2 }
          );
          const secondRandomizedPersona = await ctx.runAction(
            internal.avatars.actions.persona_randomization.randomizePersona,
            { basePersona: secondExtractedPersona }
          );

          console.log(
            '[generateThreadAsset] Avatar 2 randomized persona:',
            JSON.stringify(secondRandomizedPersona, null, 2)
          );

          // Standard studio setup (same for both avatars) - using standardized constants
          const studioSetup = AVATAR_STUDIO_SETUP_PORTRAIT;

          // Build prompts with randomized personas using shared formatting function
          const firstPersonaDesc = formatPersonaDescription(
            firstRandomizedPersona
          );
          const secondPersonaDesc = formatPersonaDescription(
            secondRandomizedPersona
          );

          const firstFinalPrompt = `${studioSetup}\n\n${firstPersonaDesc}`;
          const secondFinalPrompt = `${studioSetup}\n\n${secondPersonaDesc}`;

          console.log(
            '[generateThreadAsset] Avatar 1 final prompt:',
            firstFinalPrompt
          );
          console.log(
            '[generateThreadAsset] Avatar 2 final prompt:',
            secondFinalPrompt
          );

          requests[0] = {
            ...firstReq,
            prompt: firstFinalPrompt,
          };

          requests[1] = {
            ...secondReq,
            prompt: secondFinalPrompt,
          };
        } else {
          // Fallback: if runAction is not available, use the similarity check with hardcoded distinctness
          if (arePromptsTooSimilar(p1, p2)) {
            requests[1] = {
              ...secondReq,
              prompt: buildContrastingAvatarPortraitPrompt(p1),
            };
          }
        }
      }
      const generalSuggestions = args.generalSuggestions;
      const immediateSuggestions: NextStepSuggestionsData | undefined =
        generalSuggestions
          ? (() => {
              const entries = generalSuggestions.suggestions
                .map((entry) => {
                  const label = entry.label.trim();
                  const prompt = entry.prompt.trim();
                  if (label.length === 0 || prompt.length === 0) {
                    return null;
                  }
                  const refKeys = Array.isArray(entry.referenceStorageKeys)
                    ? entry.referenceStorageKeys
                        .map((k) => k.trim())
                        .filter((k) => k.length > 0)
                    : [];
                  return {
                    label,
                    prompt,
                    ...(refKeys.length > 0
                      ? { referenceStorageKeys: refKeys }
                      : {}),
                  };
                })
                .filter(
                  (
                    entry
                  ): entry is {
                    label: string;
                    prompt: string;
                    referenceStorageKeys?: Array<string>;
                  } => Boolean(entry)
                );
              if (entries.length === 0) {
                return undefined;
              }
              const explicitTitle = generalSuggestions.title
                ?.trim()
                .replace(/\s+/g, ' ');
              const fallbackTitle =
                entries.length > 1
                  ? 'Recommended directions'
                  : 'Suggested direction';
              return {
                title:
                  explicitTitle && explicitTitle.length > 0
                    ? explicitTitle
                    : fallbackTitle,
                suggestions: entries,
              };
            })()
          : undefined;

      // Resolve orgSlug once per tool call (shared across requests)
      let orgSlug: string | undefined = undefined;
      if (ctx.threadId) {
        const orgThread = await ctx.runQuery(
          internal.organizations.threads.queries.getByThreadIdSystem,
          { threadId: ctx.threadId as string }
        );
        if (orgThread?.organizationId) {
          const org = await ctx.runQuery(
            internal.organizations.queries.getByIdSystem,
            {
              id: orgThread.organizationId as Id<'organizations'>,
            }
          );
          orgSlug = org?.slug;
        }
      }

      // Infer the active brandingId from recent thread metadata once, so that
      // branding still applies even if the agent omitted brandingId in tool args.
      const inferredBrandingId = await inferActiveBrandingIdFromThread(ctx);

      // Execute all generations sequentially; collect successes only
      console.log(
        `[generateThreadAsset] Starting ${requests.length} generation requests`
      );
      const totalRequests = requests.length;

      const parseAspect = (ar: string): { w: number; h: number } => {
        const [wStr, hStr] = ar.split(':');
        const wNum = Math.max(1, parseInt(wStr || '1', 10));
        const hNum = Math.max(1, parseInt(hStr || '1', 10));
        return { w: wNum, h: hNum };
      };

      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

      const scaleToMaxDim = (
        ratioW: number,
        ratioH: number,
        maxDim: number
      ): { width: number; height: number } => {
        const w = Math.max(1, ratioW);
        const h = Math.max(1, ratioH);
        const g = Math.max(1, gcd(w, h));
        const rw = Math.max(1, Math.floor(w / g));
        const rh = Math.max(1, Math.floor(h / g));
        const scale = Math.max(1, Math.floor(maxDim / Math.max(rw, rh)));
        return { width: rw * scale, height: rh * scale };
      };

      const processRequest = async (
        req: z.infer<typeof singleGenerateRequestSchema>,
        index: number
      ): Promise<GenerateThreadAssetItem> => {
        const requestPosition = `${index + 1}/${totalRequests}`;
        console.log(
          `[generateThreadAsset] Request ${requestPosition} starting`,
          {
            prompt: req.prompt,
            referenceStorageKeys: req.referenceStorageKeys,
            output_aspect_ratio: req.output_aspect_ratio,
            brandingId: req.brandingId,
          }
        );

        // Fetch branding context if brandingId is provided (or infer it from thread context)
        const effectiveBrandingId =
          req.brandingId ?? inferredBrandingId ?? undefined;

        let enhancedPrompt = req.prompt;
        let logoReferenceUrl: string | null = null;
        let logoStorageKey: string | null = null;
        const brandReferenceUrls: Array<string> = [];
        const brandReferenceStorageKeys: Array<string> = [];

        if (effectiveBrandingId) {
          try {
            const branding = await ctx.runQuery(
              internal.branding.queries.getByIdSystem,
              { id: effectiveBrandingId as Id<'brandings'> }
            );

            if (branding) {
              console.log(
                `[generateThreadAsset] Request ${requestPosition} found branding`,
                {
                  brandingId: effectiveBrandingId,
                  hasColors: !!branding.colors?.length,
                  hasFonts: !!branding.fonts?.length,
                  hasLogo: !!(
                    branding.logo ||
                    branding.logoStorageKey ||
                    branding.logoStorageId
                  ),
                  logoStorageKey: branding.logoStorageKey,
                  hasBrandImages: !!branding.brandImages?.length,
                }
              );

              // Determine the best available logo mark reference.
              const primaryLogoStorageKey = branding.logoStorageKey ?? null;
              const primaryLogoStorageId = branding.logoStorageId ?? null;
              const primaryLogoUrl = branding.logo ?? null;

              // Track logo storage key (R2 - preferred)
              if (primaryLogoStorageKey) {
                logoStorageKey = primaryLogoStorageKey;
              }

              // Track additional brand reference storage keys (R2 - preferred)
              const pushUniqueStorageKey = (k: string | undefined) => {
                if (!k) return;
                const trimmed = k.trim();
                if (trimmed.length === 0) return;
                if (!isValidStorageKey(trimmed)) return;
                // FAL edit endpoints reject SVG references; avoid passing them.
                if (trimmed.toLowerCase().endsWith('.svg')) return;
                if (!brandReferenceStorageKeys.includes(trimmed)) {
                  brandReferenceStorageKeys.push(trimmed);
                }
              };

              pushUniqueStorageKey(branding.logoStorageKey);

              // SEMANTIC SEARCH: Find the most relevant brand images for this prompt
              let foundRelevantImages = false;
              try {
                if ('runAction' in ctx && typeof ctx.runAction === 'function') {
                  const searchResults = await ctx.runAction(
                    internal.branding.search.searchBrandingImages,
                    {
                      brandingId: effectiveBrandingId as Id<'brandings'>,
                      query: req.prompt,
                      limit: 3,
                    }
                  );

                  console.log(
                    `[generateThreadAsset] Semantic search found ${searchResults.length} relevant images`
                  );

                  if (searchResults.length > 0) {
                    foundRelevantImages = true;
                    for (const res of searchResults) {
                      // We only have the URL (src), not the storage key efficiently available here without another lookup,
                      // but most rows should have storageKey.
                      // Rebase the URL to use the current R2_PUBLIC_BASE_URL in case it was stored with a different base.
                      const rebasedUrl = rebaseR2Url(res.imageSrc);
                      const urlToUse = rebasedUrl ?? res.imageSrc;
                      if (isValidPublicUrl(urlToUse)) {
                        brandReferenceUrls.push(urlToUse);
                      }
                    }
                  }
                }
              } catch (searchError) {
                console.warn(
                  '[generateThreadAsset] Semantic search failed, falling back to static selection',
                  searchError
                );
              }

              // Fallback: If search failed OR returned 0 results, use approved brand images
              if (!foundRelevantImages) {
                console.log(
                  '[generateThreadAsset] Using fallback brand images (search yielded 0 or failed)'
                );
                const rawBrandImages: Array<unknown> = Array.isArray(
                  branding.brandImages
                )
                  ? branding.brandImages
                  : [];
                const brandCandidates: Array<BrandingImageRef> = rawBrandImages
                  .filter(isBrandingImageRef)
                  .filter(
                    (img: BrandingImageRef) =>
                      img.metadataStatus === 'completed'
                  );

                // Cap to keep reference sets small and effective
                const maxBrandRefs = 3;

                for (const img of brandCandidates.slice(0, maxBrandRefs)) {
                  if (img.storageKey) {
                    pushUniqueStorageKey(img.storageKey);
                  } else {
                    // Rebase the URL to use the current R2_PUBLIC_BASE_URL in case it was stored with a different base.
                    const rebasedUrl = rebaseR2Url(img.src);
                    const urlToUse = rebasedUrl ?? img.src;
                    if (isValidPublicUrl(urlToUse)) {
                      brandReferenceUrls.push(urlToUse);
                    }
                  }
                }
              }

              if (
                primaryLogoUrl ||
                primaryLogoStorageKey ||
                primaryLogoStorageId
              ) {
                const resolved = await resolveUrl(
                  {
                    url: primaryLogoUrl,
                    storageKey: primaryLogoStorageKey,
                    storageId: primaryLogoStorageId,
                  },
                  ctx
                );
                if (isValidPublicUrl(resolved)) {
                  logoReferenceUrl = resolved;
                }
              }

              // Log details for debugging/verification as requested
              console.log(
                '[generateThreadAsset] BRANDING CONTEXT APPLIED:',
                JSON.stringify(
                  {
                    brandingId: effectiveBrandingId,
                    logoUrl: logoReferenceUrl || 'Not found',
                    logoStorageKey: logoStorageKey || 'Not found',
                    referenceImages: brandReferenceUrls,
                    referenceStorageKeys: brandReferenceStorageKeys,
                    prompt: req.prompt,
                  },
                  null,
                  2
                )
              );

              // Build brand context
              let brandContext = '';
              if (branding.brandProfile) {
                const bp = branding.brandProfile as BrandProfile;
                brandContext = `
**BRAND IDENTITY & DNA:**
- **Brand URL:** ${branding.url || ''}
- **Visual Style:** ${bp.visualIdentity?.imageryStyle || ''}
- **Vibe/Mood:** ${bp.brandVoice?.tone || bp.vibe?.join(', ') || ''}
- **Key Motifs:** ${bp.visualIdentity?.keyMotifs?.join(', ') || ''}

**CINEMATOGRAPHY & LIGHTING (CLONE THIS LOOK):**
- **Lighting Patterns:** ${bp.cinematography?.lightingPatterns?.join(', ') || 'N/A'}
- **Camera Techniques:** ${bp.cinematography?.commonTechniques?.join(', ') || 'N/A'}
- **Color Grade/LUT:** ${bp.postProduction?.colorGrade || 'N/A'}
- **Key Textures:** ${bp.postProduction?.keyTextures?.join(', ') || 'N/A'}

**THE BRAND WORLD (STRICT RULES):**
- **What Belongs:** ${bp.world?.worldRules?.whatBelongs?.join(', ') || 'N/A'}
- **World Physics (Light & Materials):** ${bp.world?.worldPhysics?.lightBehavior || ''}. Materials should exhibit: ${bp.world?.worldPhysics?.materialProperties?.join(', ') || 'N/A'}.
- **Atmospheric Conditions:** ${bp.world?.worldPhysics?.atmosphericConditions || 'N/A'}
- **Emotional Reality:** ${bp.world?.worldMood?.underlyingEmotionalReality || ''}

**BRAND APPLICATION:**
- **Color Palette:** ${bp.postProduction?.palette?.map((p: { hex: string; usage: string }) => `${p.hex} (${p.usage})`).join(', ') || bp.visualIdentity?.primaryColors?.join(', ') || branding.colors?.join(', ') || 'N/A'}
- **Typography Style:** ${bp.visualIdentity?.typographyStyle || branding.fonts?.join(', ') || 'N/A'}
- **Palette Application:** ${bp.brandApplication?.paletteApplicationGuidelines || 'N/A'}
- **CRITICAL – Distinct hex codes:** When applying colors (e.g. in a colorway), use a **different** hex for each distinct element (e.g. upper, accent, piping, midsole, outsole). Never reuse the same hex for multiple elements; this causes flat, samey results. If the palette has fewer colors than roles, use subtle variations (e.g. lighter/darker shades) so each application has its own hex.
                `.trim();
              } else {
                // Fallback to basic data if profile not ready
                brandContext = `
**BRAND CONTEXT:**
- **Brand URL:** ${branding.url || ''}
- **Colors:** ${branding.colors?.join(', ') || 'N/A'}
- **Fonts:** ${branding.fonts?.join(', ') || 'N/A'}
- **Tagline:** ${branding.tagline || ''}
                `.trim();
              }

              // Build logo instruction
              let logoInstruction = '';
              if (logoReferenceUrl) {
                const lp = branding.brandProfile?.brandApplication;
                logoInstruction = `
**CRITICAL: LOGO INTEGRATION (MANDATORY)**
- **Logo Mark:** Explicitly use the provided logo reference.
- **Placement Rules:** ${lp?.logoPlacementGuidelines || 'Integrate naturally into the composition (embossed/printed/engraved).'}
- **Treatment Rules:** ${lp?.logoTreatmentGuidelines || 'Ensure high contrast and visibility.'}
- **Constraint:** The logo MUST be clearly visible and feel like a physical part of the scene, not a graphic overlay.`;
              }

              // Enhance prompt with branding context and explicit inspiration instructions
              enhancedPrompt = `
**OBJECTIVE:** Generate the following asset such that it feels like an authentic, high-end extension of the provided brand and reference images.

**USER REQUEST:**
${req.prompt}

${brandContext}
${logoInstruction}

**INSTRUCTIONS FOR BRAND CLONING & ALIGNMENT:**
1. **VISUAL CLONING:** Use the provided reference images as the *source of truth* for materials, surface textures, lighting quality, and depth of field. The generated image MUST look like it was shot in the same session, using the same camera settings and lighting rig.
2. **STRICT ADHERENCE:** Follow "THE BRAND WORLD" rules. If an element "does not belong", do NOT include it. Use the "CINEMATOGRAPHY" specs to guide the lens and light behavior.
3. **MATERIAL FIDELITY:** Pay extreme attention to "World Physics". If materials are described as "weathered" or "ultra-smooth", render them with that exact characteristic.
4. **COMPOSITION:** Align the composition with the "imageryStyle" and "vibe". Ensure the "Emotional Reality" of the brand is captured in the mood of the generation.
5. **EXECUTION:** Do not provide a generic interpretation. Provide a *branded* execution that clones the design language of the source material.
6. **DISTINCT HEX CODES (colorway/palette):** When the request specifies a colorway or color palette with hex codes, each distinct element (e.g. upper, heel clip, piping, midsole, outsole, accent) MUST have a **unique** hex. Never reuse the same hex for multiple elements—duplicate hexes produce flat, monotonous output. Use lighter/darker variations of a brand color if needed so every application has its own hex.
`.trim();

              console.log(
                `[generateThreadAsset] Request ${requestPosition} enhanced prompt with branding context`,
                {
                  originalPromptLength: req.prompt.length,
                  enhancedPromptLength: enhancedPrompt.length,
                  hasLogoStorageKey: !!logoStorageKey,
                  hasLogoUrl: !!logoReferenceUrl,
                  brandContextLength: brandContext.length,
                  brandReferenceStorageKeysCount:
                    brandReferenceStorageKeys.length,
                  brandReferenceUrlsCount: brandReferenceUrls.length,
                }
              );
            } else {
              console.warn(
                `[generateThreadAsset] Request ${requestPosition} branding not found:`,
                req.brandingId
              );
            }
          } catch (error) {
            console.error(
              `[generateThreadAsset] Request ${requestPosition} failed to fetch branding:`,
              error
            );
            // Continue without branding context if fetch fails
          }
        } else {
          console.log(
            `[generateThreadAsset] Request ${requestPosition} no brandingId provided`
          );
        }

        const referenceImageUrls: Array<string> = [];
        const referenceStorageKeysWithBrand = [...req.referenceStorageKeys];

        // Add brand storage keys to referenceStorageKeys (R2 - preferred), but keep it bounded.
        const MAX_REFERENCE_STORAGE_KEYS = 8;
        for (const sk of brandReferenceStorageKeys) {
          if (
            referenceStorageKeysWithBrand.length >= MAX_REFERENCE_STORAGE_KEYS
          )
            break;
          if (!referenceStorageKeysWithBrand.includes(sk)) {
            referenceStorageKeysWithBrand.push(sk);
          }
        }

        for (const storageKey of referenceStorageKeysWithBrand) {
          if (!isValidStorageKey(storageKey)) {
            console.error('[generateThreadAsset] Invalid referenceStorageKey', {
              storageKey,
            });
            throw new ConvexError(
              'Invalid referenceStorageKey format. Expected orgSlug/mediaType/uuid[.ext].'
            );
          }
          const url = await resolveUrl({ storageKey }, ctx);
          if (isValidPublicUrl(url) && !isSvgUrl(url!)) {
            referenceImageUrls.push(url!);
          }
        }

        // Add URL-based brand references (brand images and logo fallback)
        for (const url of brandReferenceUrls) {
          if (isSvgUrl(url)) continue;
          if (!referenceImageUrls.includes(url)) {
            referenceImageUrls.push(url);
          }
        }

        const maxDim = 4096;
        const isMatchInput =
          req.output_aspect_ratio === 'match_input_image' ||
          req.output_aspect_ratio === 'auto';

        const { width, height } = isMatchInput
          ? // For match_input_image/auto we let the provider match the reference aspect ratio.
            // Width/height are still required by our workflow schema, so we pass a safe square.
            { width: maxDim, height: maxDim }
          : (() => {
              const { w, h } = parseAspect(req.output_aspect_ratio);
              return scaleToMaxDim(w, h, maxDim);
            })();

        let placeholderLinkId: Id<'orgThreadLinks'> | undefined = undefined;
        if (ctx.threadId) {
          try {
            const orgThread = await ctx.runQuery(
              internal.organizations.threads.queries.getByThreadIdSystem,
              { threadId: ctx.threadId as string }
            );
            if (orgThread?.organizationId) {
              placeholderLinkId = await ctx.runMutation(
                internal.organizations.threads.mutations
                  .createOrgThreadLinkSystem,
                {
                  organizationId:
                    orgThread.organizationId as Id<'organizations'>,
                  threadId: orgThread.threadId as string,
                  linkType: 'asset',
                  status: 'processing',
                  suggestionsStatus: 'pending',
                }
              );
              console.log(
                `[generateThreadAsset] Request ${requestPosition} created placeholderLinkId:`,
                placeholderLinkId
              );
            } else {
              console.error(
                `[generateThreadAsset] Request ${requestPosition} orgThread missing organizationId`
              );
            }
          } catch (e) {
            console.error(
              `[generateThreadAsset] Request ${requestPosition} failed to create placeholder link:`,
              e
            );
          }
        } else {
          console.error(
            `[generateThreadAsset] Request ${requestPosition} missing ctx.threadId`
          );
        }

        if (!placeholderLinkId) {
          console.error(
            `[generateThreadAsset] Request ${requestPosition} failed: Unable to create thread link for asset generation.`
          );
          throw new ConvexError(
            'Unable to create thread link for asset generation.'
          );
        }

        try {
          console.log(
            `[generateThreadAsset] Request ${requestPosition} starting workflow`,
            {
              placeholderLinkId,
              prompt: `${req.prompt.substring(0, 50)}...`,
              referenceImageUrlsCount: referenceImageUrls.length,
              width,
              height,
              output_aspect_ratio: req.output_aspect_ratio,
            }
          );

          // Get auth user ID for PostHog tracking
          let authUserId: string | undefined = undefined;
          if (ctx.userId) {
            try {
              const authUser = await ctx.runQuery(
                components.betterAuth.adapter.findOne,
                {
                  model: 'user',
                  where: [{ field: 'userId', value: ctx.userId }],
                }
              );
              if (authUser?.doc?._id) {
                authUserId = authUser.doc._id as string;
              }
            } catch (error) {
              console.warn(
                `[generateThreadAsset] Failed to get auth user ID for PostHog tracking:`,
                error
              );
            }
          }

          const workflowId = await workflow.start(
            ctx,
            internal.products.ai.workflows.generate_thread_image
              .generateThreadImage,
            {
              prompt: enhancedPrompt,
              referenceImageUrls,
              filename: 'thread-asset.png',
              width,
              height,
              output_aspect_ratio: req.output_aspect_ratio,
              ...(orgSlug ? { orgSlug } : {}),
              userId: ctx.userId,
              ...(authUserId ? { authUserId } : {}),
            },
            {
              onComplete:
                internal.organizations.threads.mutations
                  .handleThreadImageWorkflowComplete,
              context: { linkId: placeholderLinkId, userId: ctx.userId },
            }
          );
          console.log(
            `[generateThreadAsset] Request ${requestPosition} workflow started successfully`,
            { workflowId }
          );

          try {
            await ctx.runMutation(
              internal.organizations.threads.mutations.patchOrgThreadLinkSystem,
              {
                linkId: placeholderLinkId,
                workflowId,
                status: 'pending',
              }
            );
          } catch (e) {
            console.error(
              `[generateThreadAsset] Request ${requestPosition} failed to persist workflow id:`,
              e
            );
          }

          const result: GenerateThreadAssetItem = {
            assetId: `${placeholderLinkId}`,
          };
          console.log(
            `[generateThreadAsset] Request ${requestPosition} completed successfully`,
            result
          );
          return result;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Thread asset workflow failed to start.';
          console.error(
            `[generateThreadAsset] Request ${requestPosition} workflow failed:`,
            {
              error: message,
              errorType:
                error instanceof Error ? error.constructor.name : typeof error,
              placeholderLinkId,
            }
          );
          try {
            await ctx.runMutation(
              internal.organizations.threads.mutations.patchOrgThreadLinkSystem,
              {
                linkId: placeholderLinkId,
                status: 'failed',
                statusMessage: message,
                suggestionsStatus: 'failed',
                suggestionsError: message,
              }
            );
          } catch (e) {
            console.error(
              `[generateThreadAsset] Request ${requestPosition} failed to update link status:`,
              e
            );
          }
          throw error;
        }
      };

      const settled: Array<PromiseSettledResult<GenerateThreadAssetItem>> = [];

      for (const [index, req] of requests.entries()) {
        try {
          const result = await processRequest(req, index);
          settled.push({ status: 'fulfilled', value: result });
        } catch (error) {
          settled.push({ status: 'rejected', reason: error });
          console.error(
            `[generateThreadAsset] Request ${index + 1}/${totalRequests} failed. Continuing to next request.`
          );
        }
      }

      // Log detailed results for each request
      console.log(
        `[generateThreadAsset] All ${requests.length} requests settled. Analyzing results...`
      );
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          console.log(
            `[generateThreadAsset] Request ${index + 1}/${requests.length} RESULT: FULFILLED`,
            {
              value: result.value,
            }
          );
        } else {
          console.error(
            `[generateThreadAsset] Request ${index + 1}/${requests.length} RESULT: REJECTED`,
            {
              reason:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              errorType:
                result.reason instanceof Error
                  ? result.reason.constructor.name
                  : typeof result.reason,
              stack:
                result.reason instanceof Error
                  ? result.reason.stack
                  : undefined,
            }
          );
        }
      });

      const fulfilled = settled
        .filter(
          (r): r is PromiseFulfilledResult<GenerateThreadAssetItem> =>
            r.status === 'fulfilled'
        )
        .map((r) => r.value);

      const failures = settled.filter((r) => r.status === 'rejected');

      console.log(
        `[generateThreadAsset] Summary: ${fulfilled.length} fulfilled, ${failures.length} failed`
      );

      if (fulfilled.length === 0) {
        const failureMessages = failures
          .map((f) =>
            f.status === 'rejected' && f.reason instanceof Error
              ? f.reason.message
              : 'Unknown error'
          )
          .join('; ');
        const errorMessage = `Thread asset generation failed: ${failureMessages || 'Unknown error'}`;
        console.error(
          `[generateThreadAsset] All requests failed. Failure messages:`,
          failureMessages
        );

        const errorData: GenerateThreadAssetData = {
          assetIds: [],
        };

        return createToolEnvelope(errorData, errorMessage, {
          user_message: errorMessage,
          user_visual_mode: 'full',
          stop_chat: true,
        });
      }

      const showVisual = requests.some(
        (r) => r.show_user_visual === undefined || r.show_user_visual !== false
      );

      const modelMessage =
        fulfilled.length === 1
          ? 'Started generating a thread-scoped asset. The UI will display progress automatically. Keep track of the returned asset ID for follow-up.'
          : `Started generating ${fulfilled.length} thread-scoped assets. The UI will display progress automatically. Keep track of the returned asset IDs for any future follow-ups.`;

      const data: GenerateThreadAssetData = {
        assetIds: fulfilled,
        ...(immediateSuggestions ? { suggestions: immediateSuggestions } : {}),
      };

      // Track immediate suggestions for the design page
      if (
        immediateSuggestions &&
        ctx.threadId &&
        typeof ctx.threadId === 'string'
      ) {
        try {
          const orgThread = await ctx.runQuery(
            internal.organizations.threads.queries.getByThreadIdSystem,
            { threadId: ctx.threadId }
          );

          if (orgThread?.organizationId) {
            const suggestionsToTrack = immediateSuggestions.suggestions.map(
              (s) => ({
                label: s.label,
                prompt: s.prompt,
                referenceStorageKeys: s.referenceStorageKeys,
                referenceUrls: s.referenceUrls,
              })
            );

            await ctx.scheduler.runAfter(
              0,
              internal.users.suggestion_tracking.trackSuggestionsFromTool,
              {
                organizationId: orgThread.organizationId as Id<'organizations'>,
                threadId: ctx.threadId,
                source: 'generate_thread_asset',
                suggestions: suggestionsToTrack,
              }
            );
          }
        } catch (error) {
          // Don't fail the tool if tracking fails
          console.warn(
            '[generateThreadAsset] Failed to schedule suggestion tracking:',
            error
          );
        }
      }

      const returnValue = createToolEnvelope(data, modelMessage, {
        user_visual_mode: showVisual ? 'full' : 'hide',
        stop_chat: true,
      });

      console.log(`[generateThreadAsset] RETURN VALUE:`, {
        assetIds: data.assetIds,
        assetIdsCount: data.assetIds.length,
        hasSuggestions: !!data.suggestions,
        modelMessage,
        showVisual,
        fulfilledCount: fulfilled.length,
        totalRequests: requests.length,
        failuresCount: failures.length,
      });

      return returnValue;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorMessage = `Thread asset generation failed: ${message}`;
      console.error('Thread asset generation failed:', message);

      const errorData: GenerateThreadAssetData = {
        assetIds: [],
      };

      return createToolEnvelope(errorData, errorMessage, {
        user_message: errorMessage,
        user_visual_mode: 'full',
        stop_chat: true,
      });
    }
  },
});
