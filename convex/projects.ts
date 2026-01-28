import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getProjects = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_workshop", (q) => q.eq("workshopId", args.workshopId))
      .order("desc")
      .collect();
    
    // Sort: Pinned first, then by lastUpdated
    return projects.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.lastUpdated || 0) - (a.lastUpdated || 0);
    });
  },
});

export const createProject = mutation({
  args: { name: v.string(), workshopId: v.id("workshops"), userId: v.string() },
  handler: async (ctx, args) => {
    // Generate a random-looking slug for projects as requested
    const slug = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const workshopId = await ctx.db.insert("projects", {
      name: args.name,
      slug: slug,
      workshopId: args.workshopId,
      userId: args.userId,
      status: "draft",
      lastUpdated: Date.now(),
      mode: "research",
      unitSystem: "mm",
    });

    return slug;
  },
});

export const deleteProject = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const renameProject = mutation({
  args: { id: v.id("projects"), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { name: args.name, lastUpdated: Date.now() });
  },
});

export const togglePinProject = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return;
    await ctx.db.patch(args.id, { isPinned: !project.isPinned });
  },
});

export const updateProjectClassification = mutation({
  args: { id: v.id("projects"), classificationId: v.optional(v.id("classifications")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { classificationId: args.classificationId });
  },
});

export const updateProjectMode = mutation({
  args: { id: v.id("projects"), mode: v.union(v.literal("research"), v.literal("studio")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { mode: args.mode, lastUpdated: Date.now() });
  },
});

export const updateProjectUnitSystem = mutation({
  args: { id: v.id("projects"), unitSystem: v.union(v.literal("mm"), v.literal("us"), v.literal("eu"), v.literal("cm")) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { unitSystem: args.unitSystem, lastUpdated: Date.now() });
  },
});

export const getProjectBySlug = query({
  args: { workshopSlug: v.string(), projectSlug: v.string() },
  handler: async (ctx, args) => {
    const workshop = await ctx.db
      .query("workshops")
      .withIndex("by_slug", (q) => q.eq("slug", args.workshopSlug))
      .first();

    if (!workshop) return null;

    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", args.projectSlug))
      .first();

    if (!project || project.workshopId.toString() !== workshop._id.toString()) {
      return null;
    }

    return project;
  },
});

export const getClassifications = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("classifications")
      .withIndex("by_workshop", (q) => q.eq("workshopId", args.workshopId))
      .collect();
  },
});

export const createClassification = mutation({
  args: { workshopId: v.id("workshops"), name: v.string(), color: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("classifications", {
      workshopId: args.workshopId,
      name: args.name,
      color: args.color,
    });
  },
});

export const renameClassification = mutation({
  args: { id: v.id("classifications"), name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { name: args.name });
  },
});

export const deleteClassification = mutation({
  args: { id: v.id("classifications") },
  handler: async (ctx, args) => {
    // Optional: Unset this classification from all projects
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("classificationId"), args.id))
      .collect();
    
    for (const project of projects) {
      await ctx.db.patch(project._id, { classificationId: undefined });
    }

    await ctx.db.delete(args.id);
  },
});
