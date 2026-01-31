import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id } from "./_generated/dataModel";

export const getAvailableCredits = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const grants = await ctx.db
      .query("creditGrants")
      .withIndex("by_workshop_expires", (q) =>
        q.eq("workshopId", args.workshopId).gt("expiresAt", now)
      )
      .collect();

    // Filter to only active grants: remaining > 0 AND startsAt <= now
    const active = grants.filter((g) => g.startsAt <= now && g.remaining > 0);
    
    const balance = active.reduce((sum, g) => sum + g.remaining, 0);
    const totalCredits = active.reduce((sum, g) => sum + g.amount, 0);
    
    active.sort((a, b) => a.expiresAt - b.expiresAt);
    const next = active[0]
      ? {
          amount: active[0].remaining,
          expiresAt: active[0].expiresAt,
          daysUntilExpiry: Math.ceil((active[0].expiresAt - now) / 86_400_000),
        }
      : undefined;

    return { balance, totalCredits, grantsCount: active.length, nextExpiry: next };
  },
});

export const listRedemptions = query({
  args: {
    workshopId: v.id("workshops"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const records = await ctx.db
      .query("creditRedemptions")
      .withIndex("by_workshop_usage", (q) =>
        q.eq("workshopId", args.workshopId)
      )
      .order("desc")
      .take(limit);

    const projectCache = new Map<string, string | undefined>();

    const enrichProjectName = async (projectId: Id<"projects"> | undefined) => {
      if (!projectId) return undefined;
      const cached = projectCache.get(projectId);
      if (cached !== undefined) return cached;
      const project = await ctx.db.get(projectId);
      const name = project?.name;
      projectCache.set(projectId, name);
      return name;
    };

    const result = [];
    for (const rec of records) {
      const projectName = await enrichProjectName(rec.projectId as Id<"projects"> | undefined);
      result.push({
        _id: rec._id,
        amount: rec.amount,
        usageAt: rec.usageAt,
        assetType: rec.assetType,
        description: rec.description,
        projectId: rec.projectId,
        projectName,
      });
    }

    return result;
  },
});

export const grantCredits = internalMutation({
  args: {
    workshopId: v.id("workshops"),
    amount: v.number(),
    source: v.string(),
    refId: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) throw new ConvexError("Amount must be greater than 0");

    if (args.refId) {
      const existing = await ctx.db
        .query("creditGrants")
        .withIndex("by_source_ref", (q) =>
          q.eq("source", args.source).eq("refId", args.refId)
        )
        .first();
      if (existing) return existing._id;
    }

    const workshop = await ctx.db.get(args.workshopId);
    if (!workshop) throw new ConvexError("Workshop not found");

    const now = Date.now();
    const startsAt = args.startsAt ?? now;
    // Default 30 days expiry if not provided
    const expiresAt = args.expiresAt ?? (startsAt + 30 * 86_400_000);

    const grantId = await ctx.db.insert("creditGrants", {
      workshopId: args.workshopId,
      amount: args.amount,
      remaining: args.amount,
      startsAt,
      expiresAt,
      source: args.source,
      refId: args.refId,
      metadata: args.metadata,
    });

    const oldBalance = workshop.credits ?? 0;
    await ctx.db.patch(args.workshopId, {
      credits: oldBalance + args.amount,
    });

    return grantId;
  },
});

export const redeemCredits = mutation({
  args: {
    workshopId: v.id("workshops"),
    amount: v.number(),
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    assetType: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("3d"), v.literal("research"))),
    description: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) throw new ConvexError("Amount must be greater than 0");

    const now = Date.now();

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("creditRedemptions")
        .withIndex("by_workshop_idem", (q) =>
          q.eq("workshopId", args.workshopId).eq("idempotencyKey", args.idempotencyKey)
        )
        .first();
      if (existing) return existing._id;
    }

    const candidateGrants = await ctx.db
      .query("creditGrants")
      .withIndex("by_workshop_expires", (q) =>
        q.eq("workshopId", args.workshopId).gt("expiresAt", now)
      )
      .collect();

    const activeGrants = candidateGrants
      .filter((g) => g.startsAt <= now && g.remaining > 0)
      .sort((a, b) => a.expiresAt - b.expiresAt);

    let toAllocate = args.amount;
    const allocations: Array<{ grantId: Id<"creditGrants">; amount: number }> = [];

    for (const grant of activeGrants) {
      if (toAllocate <= 0) break;
      const take = Math.min(grant.remaining, toAllocate);
      if (take > 0) {
        allocations.push({ grantId: grant._id, amount: take });
        toAllocate -= take;
      }
    }

    if (toAllocate > 0) throw new ConvexError("INSUFFICIENT_CREDITS");

    const redemptionId = await ctx.db.insert("creditRedemptions", {
      workshopId: args.workshopId,
      amount: args.amount,
      usageAt: now,
      createdAt: now,
      projectId: args.projectId,
      userId: args.userId,
      assetType: args.assetType,
      description: args.description,
      idempotencyKey: args.idempotencyKey,
    });

    for (const allocation of allocations) {
      await ctx.db.insert("creditAllocations", {
        redemptionId,
        grantId: allocation.grantId,
        amount: allocation.amount,
      });

      const g = await ctx.db.get(allocation.grantId);
      if (!g) throw new ConvexError("Grant missing during allocation");
      await ctx.db.patch(allocation.grantId, { remaining: g.remaining - allocation.amount });
    }

    const workshop = await ctx.db.get(args.workshopId);
    if (workshop) {
      await ctx.db.patch(args.workshopId, {
        credits: (workshop.credits ?? 0) - args.amount,
      });
    }

    return redemptionId;
  },
});
