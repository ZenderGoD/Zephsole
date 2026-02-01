import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getCanvasItems = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("canvasItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const addCanvasItem = mutation({
  args: { 
    projectId: v.id("projects"), 
    type: v.string(),
    data: v.any(),
    x: v.number(),
    y: v.number(),
    scale: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("canvasItems", {
      projectId: args.projectId,
      type: args.type,
      data: args.data,
      x: args.x,
      y: args.y,
      scale: args.scale || 1,
      version: 1,
    });
  },
});

export const updateCanvasItemPosition = mutation({
  args: { id: v.id("canvasItems"), x: v.number(), y: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { x: args.x, y: args.y });
  },
});

export const deleteCanvasItem = mutation({
  args: { id: v.id("canvasItems") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const saveVersion = mutation({
  args: { 
    projectId: v.id("projects"), 
    name: v.string(),
    description: v.optional(v.string()),
    snapshot: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("versions", {
      projectId: args.projectId,
      name: args.name,
      description: args.description,
      snapshot: args.snapshot,
      createdAt: Date.now(),
    });
  },
});

export const getVersions = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("versions")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

export const updateDesignContext = mutation({
  args: {
    projectId: v.id("projects"),
    footwearType: v.optional(v.string()),
    gender: v.optional(v.string()),
    aestheticVibe: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    colorPalette: v.optional(v.array(v.object({
      name: v.string(),
      hex: v.string(),
      usage: v.optional(v.string()),
    }))),
    keyMaterials: v.optional(v.array(v.string())),
    performanceSpecs: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("designContext")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();

    const { projectId, ...updates } = args;
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...updates,
        lastUpdated: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("designContext", {
        projectId,
        ...updates,
        lastUpdated: Date.now(),
      });
    }
  },
});

export const getDesignContext = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("designContext")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

export const updateBOM = mutation({
  args: {
    projectId: v.id("projects"),
    items: v.array(v.object({
      partName: v.string(),
      partCategory: v.string(),
      materialName: v.string(),
      materialGrade: v.optional(v.string()),
      color: v.optional(v.string()),
      quantity: v.number(),
      unit: v.string(),
      supplier: v.optional(v.string()),
      estimatedCost: v.optional(v.number()),
    })),
    totalEstimatedCost: v.optional(v.number()),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("boms")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();

    const { projectId, ...updates } = args;

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...updates,
        lastUpdated: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("boms", {
        projectId,
        ...updates,
        lastUpdated: Date.now(),
      });
    }
  },
});

export const getBOM = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("boms")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

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
