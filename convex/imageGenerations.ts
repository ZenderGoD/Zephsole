import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/**
 * Create or update image generation state
 */
export const upsertGeneration = mutation({
  args: {
    toolCallId: v.string(),
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    status: v.union(
      v.literal("generating"),
      v.literal("completed"),
      v.literal("error")
    ),
    prompt: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    url: v.optional(v.string()),
    storageKey: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    source: v.optional(v.union(v.literal("research"), v.literal("studio"))),
  },
  handler: async (ctx, args) => {
    // Check if generation already exists
    const existing = await ctx.db
      .query("imageGenerations")
      .withIndex("by_toolCallId", (q) => q.eq("toolCallId", args.toolCallId))
      .first();

    const now = Date.now();
    const updateData: any = {
      status: args.status,
      ...(args.prompt !== undefined && { prompt: args.prompt }),
      ...(args.aspectRatio !== undefined && { aspectRatio: args.aspectRatio }),
      ...(args.url !== undefined && { url: args.url }),
      ...(args.storageKey !== undefined && { storageKey: args.storageKey }),
      ...(args.model !== undefined && { model: args.model }),
      ...(args.error !== undefined && { error: args.error }),
      ...(args.workflowId !== undefined && { workflowId: args.workflowId }),
      ...(args.source !== undefined && { source: args.source }),
      ...(args.status === "completed" && { completedAt: now }),
    };

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, updateData);
      return existing._id;
    } else {
      // Create new
      return await ctx.db.insert("imageGenerations", {
        toolCallId: args.toolCallId,
        projectId: args.projectId,
        userId: args.userId,
        workflowId: args.workflowId,
        status: args.status,
        prompt: args.prompt,
        aspectRatio: args.aspectRatio,
        url: args.url,
        storageKey: args.storageKey,
        model: args.model,
        error: args.error,
        source: args.source,
        createdAt: now,
        ...(args.status === "completed" && { completedAt: now }),
      });
    }
  },
});

/**
 * Get generation state by toolCallId
 */
export const getGenerationByToolCallId = query({
  args: { toolCallId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imageGenerations")
      .withIndex("by_toolCallId", (q) => q.eq("toolCallId", args.toolCallId))
      .first();
  },
});

/**
 * Get all generations for a project
 */
export const getGenerationsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imageGenerations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

/**
 * Get generation by workflowId
 */
export const getGenerationByWorkflowId = query({
  args: { workflowId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("imageGenerations")
      .withIndex("by_workflowId", (q) => q.eq("workflowId", args.workflowId))
      .first();
  },
});
