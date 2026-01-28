import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getBaseline = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productBaselines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

export const updateBaseline = mutation({
  args: { 
    projectId: v.id("projects"),
    sizeRun: v.object({
      system: v.string(),
      sizes: v.array(v.number()),
      widths: v.array(v.string()),
    }),
    lastShape: v.optional(v.string()),
    heelHeight: v.optional(v.number()),
    toeSpring: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productBaselines")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sizeRun: args.sizeRun,
        lastShape: args.lastShape,
        heelHeight: args.heelHeight,
        toeSpring: args.toeSpring,
      });
    } else {
      await ctx.db.insert("productBaselines", {
        projectId: args.projectId,
        sizeRun: args.sizeRun,
        lastShape: args.lastShape,
        heelHeight: args.heelHeight,
        toeSpring: args.toeSpring,
      });
    }
  },
});

export const getUpperDesign = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("upperDesigns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

export const updateUpperDesign = mutation({
  args: {
    projectId: v.id("projects"),
    panels: v.array(v.object({
      name: v.string(),
      materialId: v.optional(v.id("materials")),
      area: v.optional(v.number()),
    })),
    stitching: v.optional(v.string()),
    closures: v.optional(v.array(v.string())),
    lining: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("upperDesigns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        panels: args.panels,
        stitching: args.stitching,
        closures: args.closures,
        lining: args.lining,
      });
    } else {
      await ctx.db.insert("upperDesigns", {
        projectId: args.projectId,
        panels: args.panels,
        stitching: args.stitching,
        closures: args.closures,
        lining: args.lining,
      });
    }
  },
});

export const getSoleDesign = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("soleDesigns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

export const updateSoleDesign = mutation({
  args: {
    projectId: v.id("projects"),
    outsoleMaterialId: v.optional(v.id("materials")),
    midsoleMaterialId: v.optional(v.id("materials")),
    treadPattern: v.optional(v.string()),
    midsoleStack: v.optional(v.number()),
    shank: v.optional(v.string()),
    plate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("soleDesigns")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        outsoleMaterialId: args.outsoleMaterialId,
        midsoleMaterialId: args.midsoleMaterialId,
        treadPattern: args.treadPattern,
        midsoleStack: args.midsoleStack,
        shank: args.shank,
        plate: args.plate,
      });
    } else {
      await ctx.db.insert("soleDesigns", {
        projectId: args.projectId,
        outsoleMaterialId: args.outsoleMaterialId,
        midsoleMaterialId: args.midsoleMaterialId,
        treadPattern: args.treadPattern,
        midsoleStack: args.midsoleStack,
        shank: args.shank,
        plate: args.plate,
      });
    }
  },
});
