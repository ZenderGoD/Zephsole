import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

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
    
    const id = await ctx.db.insert("projects", {
      name: args.name,
      slug: slug,
      workshopId: args.workshopId,
      userId: args.userId,
      status: "draft",
      lastUpdated: Date.now(),
      mode: "research",
      unitSystem: "mm",
    });

    return { id, slug };
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

export const setProjectStatus = mutation({
  args: { 
    id: v.id("projects"), 
    status: v.union(v.literal("idle"), v.literal("pending"), v.literal("generating"), v.literal("error")),
    errorMessage: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { 
      threadStatus: args.status, 
      errorMessage: args.errorMessage,
      lastUpdated: Date.now() 
    });
  },
});

export const enqueueMessage = mutation({
  args: {
    projectId: v.id("projects"),
    prompt: v.string(),
    attachments: v.optional(v.array(v.any())),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new ConvexError("Project not found");

    const currentQueue = project.messageQueue || [];
    if (currentQueue.length >= 10) {
      throw new ConvexError("Message queue is full (max 10 items).");
    }

    const queueItem = {
      id: Math.random().toString(36).substring(2, 10),
      createdAt: Date.now(),
      createdBy: args.userId,
      prompt: args.prompt,
      attachments: args.attachments,
    };

    await ctx.db.patch(args.projectId, {
      messageQueue: [...currentQueue, queueItem],
    });
  },
});

export const dequeueMessage = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || !project.messageQueue || project.messageQueue.length === 0) return null;

    const [nextItem, ...remaining] = project.messageQueue;

    await ctx.db.patch(args.projectId, {
      messageQueue: remaining,
      threadStatus: "pending",
    });

    return nextItem;
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

export const convertToProduct = mutation({
  args: { 
    id: v.id("projects"), 
    name: v.string(), 
    description: v.optional(v.string()), 
    imageUrl: v.string() 
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      imageUrl: args.imageUrl,
      status: "complete", // Mark it as complete/product
      lastUpdated: Date.now(),
    });
  },
});

export const getProject = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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

    return {
      ...project,
      messageQueue: project.messageQueue || [],
      threadStatus: project.threadStatus || "idle",
    };
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
