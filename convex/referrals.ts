import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAuthUserId } from "./authUtils";

const MILESTONE_SIZE = 5;
const MILESTONE_REWARD = 5.00; // $5.00 for every 5 referrals

async function resolveRewardWorkshopId(ctx: Pick<MutationCtx, "db">, userId: string) {
  const stats = await ctx.db
    .query("referralStats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const preferredWorkshopId = stats?.preferredWorkshopId;
  if (preferredWorkshopId) {
    const membership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) =>
        q.eq("workshopId", preferredWorkshopId).eq("userId", userId),
      )
      .first();
    if (membership) return preferredWorkshopId as Id<"workshops">;
  }

  const membership = await ctx.db
    .query("workshopMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return membership?.workshopId as Id<"workshops"> | undefined;
}

export const getReferralStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const stats = await ctx.db
      .query("referralStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    let user = await ctx.db
      .query("user")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!user) {
      user = await ctx.db.get(userId as Id<"user">);
    }

    return {
      totalUses: stats?.totalUses || 0,
      referralCode: user?.referralCode || "",
    };
  },
});

export const ensureReferralCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    let user = await ctx.db
      .query("user")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!user) {
      user = await ctx.db.get(userId as Id<"user">);
    }

    if (!user) return null;
    if (user.referralCode) return user.referralCode;

    // Generate a simple referral code based on name or random
    const base = user.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    let code = base;
    let counter = 1;
    
    while (await ctx.db.query("user").withIndex("referralCode", q => q.eq("referralCode", code)).first()) {
      code = `${base}${counter++}`;
    }

    await ctx.db.patch(user._id, { referralCode: code });
    return code;
  },
});

export const registerReferral = mutation({
  args: { referralCode: v.string() },
  handler: async (ctx, args) => {
    const newUserId = await requireAuthUserId(ctx);
    // 1. Find the referrer
    const referrer = await ctx.db
      .query("user")
      .withIndex("referralCode", (q) => q.eq("referralCode", args.referralCode))
      .first();

    if (!referrer) return { success: false, error: "Invalid referral code" };
    const referrerIdentity = (referrer.userId || referrer._id) as string;
    if (referrerIdentity === newUserId) {
      return { success: false, error: "Cannot refer yourself" };
    }

    // 2. Check if this user was already referred
    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredId", newUserId))
      .first();
    if (existing) return { success: false, error: "User already referred" };

    // 3. Create the referral record
    await ctx.db.insert("referrals", {
      referrerId: referrerIdentity,
      referredId: newUserId,
      status: "joined",
      createdAt: Date.now(),
    });

    // 4. Update referral stats and check for milestone
    let stats = await ctx.db
      .query("referralStats")
      .withIndex("by_user", (q) => q.eq("userId", referrerIdentity))
      .first();

    if (!stats) {
      const statsId = await ctx.db.insert("referralStats", {
        userId: referrerIdentity,
        // Source of truth is auth user identity.
        totalUses: 1,
        lastMilestoneRewardCount: 0,
      });
      stats = await ctx.db.get(statsId);
    } else {
      await ctx.db.patch(stats._id, {
        totalUses: stats.totalUses + 1,
      });
      stats.totalUses += 1;
    }

    // 5. Check milestone reward (every 5 uses)
    if (stats && stats.totalUses >= stats.lastMilestoneRewardCount + MILESTONE_SIZE) {
      const rewardWorkshopId = await resolveRewardWorkshopId(ctx, referrerIdentity);

      if (rewardWorkshopId) {
        await ctx.runMutation(internal.credits.grantCredits, {
          workshopId: rewardWorkshopId,
          amount: MILESTONE_REWARD,
          source: "referral",
        });
        
        await ctx.db.patch(stats._id, {
          lastMilestoneRewardCount: stats.lastMilestoneRewardCount + MILESTONE_SIZE,
        });
      }
    }

    return { success: true };
  },
});

// Internal mutation to be called by a future billing system/webhook
export const processPurchaseReward = internalMutation({
  args: { 
    userId: v.string(), 
    purchaseAmount: v.number() 
  },
  handler: async (ctx, args) => {
    // Find who referred this buyer
    const referral = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredId", args.userId))
      .first();

    if (!referral) return;

    // Update status to purchased if not already
    if (referral.status !== "purchased") {
      await ctx.db.patch(referral._id, { status: "purchased" });
    }

    // Award 10% of purchase amount to referrer
    const rewardAmount = args.purchaseAmount * 0.10;
    
    const rewardWorkshopId = await resolveRewardWorkshopId(ctx, referral.referrerId);

    if (rewardWorkshopId) {
      await ctx.runMutation(internal.credits.grantCredits, {
        workshopId: rewardWorkshopId,
        amount: rewardAmount,
        source: "referral_purchase",
      });
    }
  },
});

export const setPreferredRewardWorkshop = mutation({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const membership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) =>
        q.eq("workshopId", args.workshopId).eq("userId", userId),
      )
      .first();
    if (!membership) throw new ConvexError("WORKSHOP_ACCESS_DENIED");

    const stats = await ctx.db
      .query("referralStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!stats) {
      await ctx.db.insert("referralStats", {
        userId,
        totalUses: 0,
        lastMilestoneRewardCount: 0,
        preferredWorkshopId: args.workshopId,
      });
      return;
    }
    await ctx.db.patch(stats._id, { preferredWorkshopId: args.workshopId });
  },
});
