import { workflow } from "./workflow";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { action, internalMutation } from "./_generated/server";
import { vWorkflowId, type WorkflowId } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";

const IMAGE_GENERATION_CREDIT_COST_BASIC = 0.2;
const IMAGE_GENERATION_CREDIT_COST_PRO = 0.6;

export const generateImage = workflow.define({
  args: {
    prompt: v.string(),
    aspectRatio: v.optional(v.string()),
    referenceImageUrl: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())), // Support multiple images for Nano Banana Pro
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    workshopId: v.optional(v.id("workshops")),
    toolCallId: v.optional(v.string()), // Optional toolCallId for tracking
    source: v.optional(v.union(v.literal("research"), v.literal("studio"))),
    numImages: v.optional(v.number()), // Number of images to generate (default: 4 for research, 1 for studio)
  },
  returns: v.object({
    url: v.string(),
    storageKey: v.string(),
    model: v.string(),
    prompt: v.string(),
    images: v.optional(v.array(v.object({
      url: v.string(),
      storageKey: v.string(),
    }))),
  }),
  handler: async (
    step,
    args
  ): Promise<{
    url: string;
    storageKey: string;
    model: string;
    prompt: string;
    images?: Array<{ url: string; storageKey: string }>;
  }> => {
    console.log(`[generateImage workflow] 🚀🚀🚀 WORKFLOW HANDLER CALLED`, {
      timestamp: new Date().toISOString(),
      prompt: args.prompt.substring(0, 50) + "...",
      promptLength: args.prompt.length,
      aspectRatio: args.aspectRatio || 'NOT_PROVIDED',
      hasReferenceImageUrl: !!args.referenceImageUrl,
      referenceImageUrlPreview: args.referenceImageUrl?.substring(0, 50),
      hasReferenceImageUrls: !!args.referenceImageUrls,
      referenceImageUrlsCount: args.referenceImageUrls?.length || 0,
      projectId: args.projectId || 'MISSING',
      hasProjectId: !!args.projectId,
      userId: args.userId || 'MISSING',
      hasUserId: !!args.userId,
      workshopId: args.workshopId || 'MISSING',
      hasWorkshopId: !!args.workshopId,
      fullArgs: JSON.stringify({
        ...args,
        prompt: args.prompt.substring(0, 100) + '...',
      }, null, 2),
      stepType: typeof step,
      hasRunAction: typeof step.runAction === 'function',
    });

    // Step 1: Validate inputs and prepare parameters
    const aspectRatio = args.aspectRatio || "1:1";
    let finalWidth = 1024;
    let finalHeight = 1024;
    
    if (aspectRatio && aspectRatio !== "1:1") {
      const [w, h] = aspectRatio.split(':').map(Number);
      const ratio = w / h;
      if (ratio > 1) {
        finalWidth = 1024;
        finalHeight = Math.round(1024 / ratio);
      } else {
        finalHeight = 1024;
        finalWidth = Math.round(1024 * ratio);
      }
    }

    console.log(`[generateImage] 📐 Calculated dimensions: ${finalWidth}x${finalHeight}`);

    // Step 2: Generate images using Fal.ai (parallel calls for diversity)
    console.log(`[generateImage workflow] 🔄 Step 2: Preparing to call generateImageWithFal action...`);
    let result;
    try {
      // Combine single and multiple reference images
      const referenceImageUrls = args.referenceImageUrls || (args.referenceImageUrl ? [args.referenceImageUrl] : []);
      
      const numImages = args.numImages ?? (args.source === "research" ? 4 : 1);
      
      // Make parallel calls for diversity (each call generates 1 image)
      if (numImages > 1) {
        console.log(`[generateImage workflow] 🚀 Making ${numImages} parallel API calls for diverse outputs...`);
        
        const actionArgsBase = {
          prompt: args.prompt,
          aspectRatio: aspectRatio,
          referenceImageUrl: args.referenceImageUrl,
          referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
          width: finalWidth,
          height: finalHeight,
          projectId: args.projectId,
          userId: args.userId,
          numImages: 1, // Each call generates 1 image
        };
        
        // Start all calls in parallel
        const promises = Array.from({ length: numImages }, (_, i) => 
          step.runAction(
            api.imageGeneration.generateImageWithFal,
            actionArgsBase,
            {
              name: `generateImageWithFal_${i + 1}`,
              retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
            }
          ) as Promise<{
            url: string;
            storageKey: string;
            model: string;
            prompt: string;
            width: number;
            height: number;
            images?: Array<{ url: string; storageKey: string }>;
          }>
        );
        
        // Wait for all calls to complete
        const results = await Promise.all(promises);
        
        console.log(`[generateImage workflow] ✅✅✅ All ${numImages} images generated successfully`);
        
        // Combine all images into a single result
        const allImages: Array<{ url: string; storageKey: string }> = [];
        results.forEach((res, idx) => {
          if (res.images && res.images.length > 0) {
            allImages.push(...res.images);
          } else if (res.url) {
            allImages.push({ url: res.url, storageKey: res.storageKey });
          }
          console.log(`[generateImage workflow] Call ${idx + 1}/${numImages} result:`, {
            hasUrl: !!res.url,
            imageCount: res.images?.length ?? 1,
          });
        });
        
        // Use first result as base, but replace images array with all combined images
        result = {
          ...results[0],
          images: allImages,
          url: allImages[0]?.url || results[0].url,
          storageKey: allImages[0]?.storageKey || results[0].storageKey,
        };
        
        console.log(`[generateImage workflow] Combined result:`, {
          totalImages: allImages.length,
          model: result.model,
          hasUrl: !!result.url,
        });
      } else {
        // Single image generation (original logic)
        const actionArgs = {
          prompt: args.prompt,
          aspectRatio: aspectRatio,
          referenceImageUrl: args.referenceImageUrl,
          referenceImageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
          width: finalWidth,
          height: finalHeight,
          projectId: args.projectId,
          userId: args.userId,
          numImages: 1,
        };
        
        console.log(`[generateImage workflow] 📤 Calling generateImageWithFal action:`, {
          promptLength: actionArgs.prompt.length,
          promptPreview: actionArgs.prompt.substring(0, 100),
          aspectRatio: actionArgs.aspectRatio,
          hasReferenceImageUrl: !!actionArgs.referenceImageUrl,
          hasReferenceImageUrls: !!actionArgs.referenceImageUrls,
          referenceImageUrlsCount: actionArgs.referenceImageUrls?.length || 0,
          width: actionArgs.width,
          height: actionArgs.height,
          hasProjectId: !!actionArgs.projectId,
          projectIdValue: actionArgs.projectId,
          hasUserId: !!actionArgs.userId,
          userIdValue: actionArgs.userId,
        });
        
        console.log(`[generateImage workflow] 📞 Calling step.runAction NOW...`);
        result = await step.runAction(
          api.imageGeneration.generateImageWithFal,
          actionArgs,
          {
            name: "generateImageWithFal",
            retry: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
          }
        ) as {
          url: string;
          storageKey: string;
          model: string;
          prompt: string;
          width: number;
          height: number;
          images?: Array<{ url: string; storageKey: string }>;
        };
        
        console.log(`[generateImage workflow] ✅✅✅ Image generated successfully:`, {
          hasResult: !!result,
          resultType: typeof result,
          resultKeys: result ? Object.keys(result) : [],
          hasUrl: !!result?.url,
          urlPreview: result?.url?.substring(0, 50),
          model: result?.model,
          storageKey: result?.storageKey,
          prompt: result?.prompt?.substring(0, 50),
        });
      }
    } catch (error) {
      console.error(`[generateImage workflow] ❌❌❌ Image generation failed:`, {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorName: error instanceof Error ? error.name : 'N/A',
        stack: error instanceof Error ? error.stack : undefined,
        prompt: args.prompt.substring(0, 50),
        promptLength: args.prompt.length,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        errorString: String(error),
      });
      throw error;
    }

    // Step 3: Save all images to media table if projectId is provided (non-fatal)
    if (args.projectId && result.images) {
      for (let i = 0; i < result.images.length; i++) {
        const img = result.images[i];
        try {
          await step.runMutation(api.media.saveMediaRecord, {
            projectId: args.projectId,
            objectKey: img.storageKey,
            fileName: `generated-${Date.now()}-${i}.png`,
            contentType: "image/png",
            kind: "generated",
            uploadedBy: args.userId,
          });
          console.log(`[generateImage] 💾 Saved media record ${i + 1}/${result.images.length}`, {
            projectId: args.projectId,
            storageKey: img.storageKey,
          });
        } catch (error) {
          console.warn(`[generateImage] ⚠️ Failed to save media record ${i + 1} (non-fatal):`, {
            error: error instanceof Error ? error.message : String(error),
          });
          // Non-fatal, continue
        }
      }
    }

    // Step 4: Update generation state in Convex (for reactive UI updates)
    // The onComplete handler will update the state, but we can also update here if toolCallId is available
    if (args.toolCallId) {
      try {
        await step.runMutation(api.imageGenerations.upsertGeneration, {
          toolCallId: args.toolCallId,
          projectId: args.projectId,
          userId: args.userId,
          workflowId: String(step.workflowId),
          status: "completed",
          prompt: args.prompt,
          aspectRatio: args.aspectRatio,
          url: result.url,
          storageKey: result.storageKey,
          images: result.images,
          model: result.model,
          source: args.source,
        });
        console.log(`[generateImage] ✅ Updated generation state to completed`, {
          toolCallId: args.toolCallId,
          imageCount: result.images?.length ?? 1,
        });
      } catch (error) {
        console.warn(`[generateImage] ⚠️ Failed to update generation state (non-fatal):`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Non-fatal, continue
      }
    }

    console.log(`[generateImage] ✨ Workflow complete`, {
      url: result.url,
      storageKey: result.storageKey,
    });

    return {
      url: result.url,
      storageKey: result.storageKey,
      model: result.model,
      prompt: args.prompt,
      images: result.images,
    };
  },
});

// Internal mutation to handle workflow completion
export const handleWorkflowComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      toolCallId: v.string(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { toolCallId } = args.context;
    
    // Find generation by toolCallId (more reliable than workflowId)
    const generation = await ctx.db
      .query("imageGenerations")
      .withIndex("by_toolCallId", (q) => q.eq("toolCallId", toolCallId))
      .first();
    
    if (!generation) {
      console.warn('[handleWorkflowComplete] No generation found for toolCallId:', toolCallId);
      return null;
    }
    
    if (args.result.kind === "success") {
      // Update to completed state
      const returnValue = args.result.returnValue as {
        url?: string;
        storageKey?: string;
        model?: string;
        prompt?: string;
        images?: Array<{ url: string; storageKey: string }>;
      };
      
      await ctx.db.patch(generation._id, {
        status: "completed",
        url: returnValue.url,
        storageKey: returnValue.storageKey,
        images: returnValue.images,
        model: returnValue.model,
        completedAt: Date.now(),
      });
      console.log('[handleWorkflowComplete] Updated to completed state:', {
        toolCallId,
        url: returnValue.url,
        imageCount: returnValue.images?.length ?? 0,
        images: returnValue.images,
      });
    } else if (args.result.kind === "failed") {
      // Update to error state
      await ctx.db.patch(generation._id, {
        status: "error",
        error: args.result.error,
      });
      console.log('[handleWorkflowComplete] Updated to error state:', {
        toolCallId,
        error: args.result.error,
      });
    } else if (args.result.kind === "canceled") {
      // Update to error state with canceled message
      await ctx.db.patch(generation._id, {
        status: "error",
        error: "Workflow was canceled",
      });
      console.log('[handleWorkflowComplete] Workflow canceled:', {
        toolCallId,
      });
    }
    
    return null;
  },
});

// Action to start workflow and return workflowId immediately (non-blocking)
export const startGenerateImage = action({
  args: {
    toolCallId: v.string(), // Add toolCallId to track generation
    prompt: v.string(),
    aspectRatio: v.optional(v.string()),
    referenceImageUrl: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())), // Support multiple images
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    workshopId: v.optional(v.id("workshops")),
    source: v.optional(v.union(v.literal("research"), v.literal("studio"))),
    numImages: v.optional(v.number()), // Number of images to generate (default: 4 for research, 1 for studio)
  },
  handler: async (ctx, args): Promise<{
    workflowId: string;
  }> => {
    console.log('[startGenerateImage] 🎬🎬🎬 ACTION HANDLER CALLED:', {
      timestamp: new Date().toISOString(),
      prompt: args.prompt.substring(0, 50) + "...",
      promptLength: args.prompt.length,
      promptFull: args.prompt,
      userId: args.userId || 'MISSING',
      hasUserId: !!args.userId,
      projectId: args.projectId || 'MISSING',
      hasProjectId: !!args.projectId,
      workshopId: args.workshopId || 'MISSING',
      hasWorkshopId: !!args.workshopId,
      hasReferenceImageUrl: !!args.referenceImageUrl,
      referenceImageUrlPreview: args.referenceImageUrl?.substring(0, 50),
      hasReferenceImageUrls: !!args.referenceImageUrls,
      referenceImageUrlsCount: args.referenceImageUrls?.length || 0,
      aspectRatio: args.aspectRatio || 'NOT_PROVIDED',
      fullArgs: JSON.stringify(args, null, 2),
      ctxType: typeof ctx,
      hasRunAction: typeof ctx.runAction === 'function',
    });
    
    // Validate prompt
    if (!args.prompt || args.prompt.trim().length < 10) {
      const errorMsg = `Invalid prompt: prompt must be at least 10 characters. Received: "${args.prompt}"`;
      console.error('[startGenerateImage] ❌ Validation failed:', {
        promptLength: args.prompt?.length || 0,
        prompt: args.prompt,
        error: errorMsg,
      });
      throw new Error(errorMsg);
    }

    // Charge credits before workflow launch, idempotent by toolCallId.
    if (args.workshopId && args.toolCallId) {
      const numImages = args.numImages ?? (args.source === "research" ? 4 : 1);
      const baseImageCost =
        (args.referenceImageUrls?.length ?? 0) > 0 || !!args.referenceImageUrl
          ? IMAGE_GENERATION_CREDIT_COST_PRO
          : IMAGE_GENERATION_CREDIT_COST_BASIC;
      const totalCost = baseImageCost * numImages;
      await ctx.runMutation(internal.credits.redeemCreditsInternal, {
        workshopId: args.workshopId,
        amount: totalCost,
        projectId: args.projectId,
        userId: args.userId,
        assetType: "image",
        usageContext: args.source === "research" ? "research" : "project_asset",
        description: `Image generation (${args.source ?? "studio"}) - ${numImages} image${numImages > 1 ? "s" : ""}`,
        refId: args.toolCallId,
        ctcUsd: totalCost,
        idempotencyKey: `image-gen:${args.toolCallId}`,
      });
    }
    
    console.log('[startGenerateImage] ✅ Validation passed, starting workflow...');
    
    // Start the workflow (use internal namespace for workflow definitions)
    console.log('[startGenerateImage] 🔄 About to start workflow...', {
      workflowModule: 'internal.imageWorkflow.generateImage',
      hasWorkflowStart: typeof workflow.start === 'function',
      argsKeys: Object.keys(args),
    });
    
    let workflowId: WorkflowId;
    try {
      console.log('[startGenerateImage] 📞 Starting workflow...');
      workflowId = await workflow.start(
        ctx, 
        internal.imageWorkflow.generateImage, 
        {
          prompt: args.prompt,
          aspectRatio: args.aspectRatio,
          referenceImageUrl: args.referenceImageUrl,
          referenceImageUrls: args.referenceImageUrls,
          projectId: args.projectId,
          userId: args.userId,
          workshopId: args.workshopId,
          toolCallId: args.toolCallId,
          source: args.source,
          numImages: args.numImages,
        },
        {
          onComplete: internal.imageWorkflow.handleWorkflowComplete,
          context: { toolCallId: args.toolCallId },
        }
      );
      console.log('[startGenerateImage] ✅ Workflow started:', {
        workflowId: String(workflowId),
        promptLength: args.prompt.length,
      });
      
      // Create generation record in Convex for reactive UI updates
      try {
        await ctx.runMutation(api.imageGenerations.upsertGeneration, {
          toolCallId: args.toolCallId,
          projectId: args.projectId,
          userId: args.userId,
          workflowId: String(workflowId),
          status: "generating",
          prompt: args.prompt,
          aspectRatio: args.aspectRatio,
          source: args.source,
        });
        console.log('[startGenerateImage] ✅ Created generation record:', {
          toolCallId: args.toolCallId,
        });
      } catch (mutationError) {
        console.warn('[startGenerateImage] ⚠️ Failed to create generation record (non-fatal):', {
          error: mutationError instanceof Error ? mutationError.message : String(mutationError),
        });
        // Non-fatal, continue
      }
    } catch (startError) {
      console.error('[startGenerateImage] ❌ Failed to start workflow:', {
        error: startError instanceof Error ? startError.message : String(startError),
      });
      
      // Update generation state to error
      try {
        await ctx.runMutation(api.imageGenerations.upsertGeneration, {
          toolCallId: args.toolCallId,
          projectId: args.projectId,
          userId: args.userId,
          status: "error",
          error: startError instanceof Error ? startError.message : String(startError),
        });
      } catch (mutationError) {
        // Non-fatal
      }
      
      throw startError;
    }
    
    // Return workflowId immediately - frontend uses reactive queries
    return { workflowId: String(workflowId) };
  },
});

// Query to check workflow status (for frontend polling)
export const getWorkflowStatus = action({
  args: {
    workflowId: v.string(),
  },
  handler: async (ctx, args) => {
    const status = await workflow.status(ctx, args.workflowId as WorkflowId);
    
    if (status.type === "completed") {
      // status.result can be:
      // - Direct return value (success)
      // - { type: "failed", error: string }
      // - { type: "canceled" }
      
      if (status.result && typeof status.result === 'object' && 'type' in status.result) {
        const result = status.result as 
          | { error: string; type: "failed" }
          | { type: "canceled" };
        
        return {
          status: status.type,
          result: null,
          error: result.type === "failed" ? result.error : "Workflow was canceled",
        };
      }
      
      // Direct return value (success case)
      return {
        status: status.type,
        result: status.result,
        error: null,
      };
    }
    
    return {
      status: status.type,
      result: null,
      error: null,
    };
  },
});
