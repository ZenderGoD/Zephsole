import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { isAdminUser, requireAuthUserId } from "./authUtils";

export const saveAsset = mutation({
  args: {
    type: v.union(v.literal("landing"), v.literal("studio"), v.literal("showcase")),
    objectKey: v.string(),
    url: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const admin = await isAdminUser(ctx);
    if (!admin) throw new ConvexError("ADMIN_ONLY");
    return await ctx.db.insert("siteAssets", {
      type: args.type,
      key: args.objectKey,
      url: args.url,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      createdAt: Date.now(),
    });
  },
});

export const listAssets = query({
  args: {
    type: v.union(v.literal("landing"), v.literal("studio"), v.literal("showcase")),
  },
  handler: async (ctx, args) => {
    // Query siteAssets by type index
    const assets = await ctx.db
      .query("siteAssets")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();
    
    // Sort by createdAt descending (most recent first)
    // Handle potential undefined createdAt values
    return assets.sort((a, b) => {
      const aTime = a.createdAt ?? 0;
      const bTime = b.createdAt ?? 0;
      return bTime - aTime;
    });
  },
});

export const deleteAsset = mutation({
  args: { id: v.id("siteAssets") },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const admin = await isAdminUser(ctx);
    if (!admin) throw new ConvexError("ADMIN_ONLY");
    const asset = await ctx.db.get(args.id);
    if (!asset) return;
    await ctx.db.delete(args.id);
  },
});
