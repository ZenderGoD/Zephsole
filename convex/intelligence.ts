import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { GenericQueryCtx, GenericDataModel } from "convex/server";

export const getMessages = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project) return [];

    // Check if user is a member of the workshop this project belongs to
    const membership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) => 
        q.eq("workshopId", project.workshopId).eq("userId", user._id)
      )
      .first();

    if (!membership) return [];

    return await ctx.db
      .query("intelligenceThreads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("asc")
      .collect();
  },
});

export const sendMessage = mutation({
  args: { 
    projectId: v.id("projects"), 
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    type: v.optional(v.string()),
    cardData: v.optional(v.any()),
    messageId: v.optional(v.string()), // Store useChat message ID for matching
    attachments: v.optional(v.array(v.object({
      mediaId: v.optional(v.id("media")),
      url: v.string(),
      fileName: v.string(),
      contentType: v.string(),
      size: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    const insertedId = await ctx.db.insert("intelligenceThreads", {
      projectId: args.projectId,
      role: args.role,
      content: args.content,
      type: args.type || "text",
      cardData: args.cardData,
      attachments: args.attachments,
      messageId: args.messageId, // Will be updated below if not provided
      timestamp: Date.now(),
    });
    
    // Update messageId if it wasn't provided (use the inserted _id)
    if (!args.messageId) {
      await ctx.db.patch(insertedId, { messageId: insertedId.toString() });
    }
    
    await ctx.db.patch(args.projectId, { lastUpdated: Date.now() });
    return insertedId;
  },
});

export const clearHistory = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("intelligenceThreads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
  },
});
