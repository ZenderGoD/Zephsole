import { mutation, query, internalMutation, internalQuery, MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { Id, Doc } from "./_generated/dataModel";
import { requireAuthUserId, requireWorkshopMember, requireWorkshopRole } from "./authUtils";

const DEFAULT_EXPIRY_DAYS = 90;
const LOW_CREDITS_WARNING = 7;
const CRITICAL_CREDITS = 5;

type CreditGrant = Doc<"creditGrants">;

async function getActiveGrants(ctx: QueryCtx | MutationCtx, workshopId: Id<"workshops">) {
  const now = Date.now();
  const grants = await ctx.db
    .query("creditGrants")
    .withIndex("by_workshop_expires", (q) =>
      q.eq("workshopId", workshopId).gt("expiresAt", now)
    )
    .collect();
  const active = grants.filter((g: CreditGrant) => g.startsAt <= now && g.remaining > 0);
  active.sort((a: CreditGrant, b: CreditGrant) => a.expiresAt - b.expiresAt);
  return { now, active };
}

function summarizeCredits(active: Array<CreditGrant>, now: number) {
  const balance = active.reduce((sum, g) => sum + g.remaining, 0);
  const totalCredits = active.reduce((sum, g) => sum + g.amount, 0);
  const usedCredits = totalCredits - balance;
  const next = active[0]
    ? {
        amount: active[0].remaining,
        expiresAt: active[0].expiresAt,
        daysUntilExpiry: Math.ceil((active[0].expiresAt - now) / 86_400_000),
      }
    : undefined;
  return {
    balance,
    totalCredits,
    usedCredits,
    grantsCount: active.length,
    nextExpiry: next,
  };
}

type RedeemArgs = {
  workshopId: Id<"workshops">;
  amount: number;
  projectId?: Id<"projects">;
  userId?: string;
  assetType?: "image" | "video" | "3d" | "research";
  usageContext?:
    | "thread_asset"
    | "project_asset"
    | "upscale"
    | "aspect_ratio_change"
    | "technical_draft"
    | "research"
    | "misc";
  description?: string;
  refId?: string;
  ctcUsd?: number;
  idempotencyKey?: string;
  usageAt?: number;
};

async function redeemCreditsCore(ctx: MutationCtx, args: RedeemArgs) {
  const userId = args.userId;
  if (args.amount <= 0) throw new ConvexError("Amount must be greater than 0");
  if (userId) {
    const membership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) =>
        q.eq("workshopId", args.workshopId).eq("userId", userId),
      )
      .first();
    if (!membership || !["owner", "admin", "member"].includes(membership.role)) {
      throw new ConvexError("WORKSHOP_ROLE_FORBIDDEN");
    }
  }

  const now = args.usageAt ?? Date.now();
  if (args.idempotencyKey) {
    const existing = await ctx.db
      .query("creditRedemptions")
      .withIndex("by_workshop_idem", (q) =>
        q.eq("workshopId", args.workshopId).eq("idempotencyKey", args.idempotencyKey),
      )
      .first();
    if (existing) return existing._id;
  }

  const candidateGrants = await ctx.db
    .query("creditGrants")
    .withIndex("by_workshop_expires", (q) =>
      q.eq("workshopId", args.workshopId).gt("expiresAt", now),
    )
    .collect();

  const activeGrants = candidateGrants
    .filter((g: CreditGrant) => g.startsAt <= now && g.remaining > 0)
    .sort((a: CreditGrant, b: CreditGrant) => a.expiresAt - b.expiresAt);

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
    usageContext: args.usageContext,
    description: args.description,
    refId: args.refId,
    ctcUsd: args.ctcUsd,
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
  return redemptionId;
}

export const getAvailableCredits = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    await requireWorkshopMember(ctx, args.workshopId);
    const { now, active } = await getActiveGrants(ctx, args.workshopId);
    return summarizeCredits(active, now);
  },
});

export const getAvailableCreditsBySlug = query({
  args: { workshopSlug: v.string() },
  handler: async (ctx, args) => {
    const workshop = await ctx.db
      .query("workshops")
      .withIndex("by_slug", (q) => q.eq("slug", args.workshopSlug))
      .first();
    if (!workshop) throw new ConvexError("WORKSHOP_NOT_FOUND");
    await requireWorkshopMember(ctx, workshop._id);
    const { now, active } = await getActiveGrants(ctx, workshop._id);
    return summarizeCredits(active, now);
  },
});

export const getAvailableCreditsInternal = internalQuery({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    const { now, active } = await getActiveGrants(ctx, args.workshopId);
    return summarizeCredits(active, now);
  },
});

export const getCreditStatus = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    await requireWorkshopMember(ctx, args.workshopId);
    const { now, active } = await getActiveGrants(ctx, args.workshopId);
    const credits = summarizeCredits(active, now);
    const status =
      credits.balance <= 0
        ? "insufficient"
        : credits.balance <= CRITICAL_CREDITS
          ? "critical"
          : credits.balance <= LOW_CREDITS_WARNING
            ? "low"
            : "healthy";
    return { ...credits, status };
  },
});

export const listRedemptions = query({
  args: {
    workshopId: v.id("workshops"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkshopMember(ctx, args.workshopId);
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
      const projectName = await enrichProjectName(rec.projectId);
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
    if (!workshop) throw new ConvexError("WORKSHOP_NOT_FOUND");

    const now = Date.now();
    const startsAt = args.startsAt ?? now;
    const expiresAt = args.expiresAt ?? (startsAt + DEFAULT_EXPIRY_DAYS * 86_400_000);

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

    return grantId;
  },
});

export const grantCreditsByAdmin = mutation({
  args: {
    workshopId: v.id("workshops"),
    amount: v.number(),
    source: v.string(),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireWorkshopRole(ctx, args.workshopId, ["owner", "admin"]);
    if (args.amount <= 0) throw new ConvexError("Amount must be greater than 0");
    const now = Date.now();
    return await ctx.db.insert("creditGrants", {
      workshopId: args.workshopId,
      amount: args.amount,
      remaining: args.amount,
      startsAt: now,
      source: args.source,
      expiresAt: args.expiresAt ?? (now + DEFAULT_EXPIRY_DAYS * 86_400_000),
      metadata: args.metadata,
    });
  },
});

export const redeemCreditsInternal = internalMutation({
  args: {
    workshopId: v.id("workshops"),
    amount: v.number(),
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    assetType: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("3d"), v.literal("research"))),
    usageContext: v.optional(v.union(v.literal("thread_asset"), v.literal("project_asset"), v.literal("upscale"), v.literal("aspect_ratio_change"), v.literal("technical_draft"), v.literal("research"), v.literal("misc"))),
    description: v.optional(v.string()),
    refId: v.optional(v.string()),
    ctcUsd: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    usageAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return redeemCreditsCore(ctx, args);
  },
});

export const redeemCredits = mutation({
  args: {
    workshopId: v.id("workshops"),
    amount: v.number(),
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    assetType: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("3d"), v.literal("research"))),
    usageContext: v.optional(v.union(v.literal("thread_asset"), v.literal("project_asset"), v.literal("upscale"), v.literal("aspect_ratio_change"), v.literal("technical_draft"), v.literal("research"), v.literal("misc"))),
    description: v.optional(v.string()),
    refId: v.optional(v.string()),
    ctcUsd: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authUserId = await requireAuthUserId(ctx);
    const membership = await requireWorkshopMember(ctx, args.workshopId);
    if (!["owner", "admin", "member"].includes(membership.role)) {
      throw new ConvexError("WORKSHOP_ROLE_FORBIDDEN");
    }
    return await redeemCreditsCore(ctx, {
      workshopId: args.workshopId,
      amount: args.amount,
      projectId: args.projectId,
      userId: args.userId ?? authUserId,
      assetType: args.assetType,
      usageContext: args.usageContext,
      description: args.description,
      refId: args.refId,
      ctcUsd: args.ctcUsd,
      idempotencyKey: args.idempotencyKey,
      usageAt: Date.now(),
    });
  },
});
