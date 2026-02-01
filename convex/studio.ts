import { query } from "./_generated/server";
import { v } from "convex/values";

export const getAllPublicMedia = query({
  args: {},
  handler: async (ctx) => {
    const images = await ctx.db
      .query("imageGenerations")
      .filter((q) => q.eq(q.field("status"), "completed"))
      .order("desc")
      .take(50);

    const uploads = await ctx.db
      .query("media")
      .order("desc")
      .take(50);

    // Combine and normalize
    const normalizedImages = images.map(img => ({
      id: img._id,
      url: img.url,
      type: 'image',
      title: img.prompt || 'Generated AI Design',
      createdAt: img.completedAt || img.createdAt,
    }));

    const normalizedUploads = uploads.map(up => ({
      id: up._id,
      url: up.url,
      type: up.kind || 'image',
      title: up.fileName || 'Uploaded Asset',
      createdAt: up.createdAt,
    }));

    return [...normalizedImages, ...normalizedUploads].sort((a, b) => b.createdAt - a.createdAt);
  },
});
