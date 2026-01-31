import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const MILESTONE_SIZE = 5;
const MILESTONE_REWARD = 5.00; // $5.00 for every 5 referrals

export const getReferralStats = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("referralStats")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    
    const user = await ctx.db
      .query("user")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .first();

    return {
      totalUses: stats?.totalUses || 0,
      referralCode: user?.referralCode || "",
    };
  },
});

export const ensureReferralCode = mutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .first();

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
  args: { 
    referralCode: v.string(), 
    newUserId: v.string() 
  },
  handler: async (ctx, args) => {
    // 1. Find the referrer
    const referrer = await ctx.db
      .query("user")
      .withIndex("referralCode", (q) => q.eq("referralCode", args.referralCode))
      .first();

    if (!referrer) return { success: false, error: "Invalid referral code" };
    if (referrer.userId === args.newUserId) return { success: false, error: "Cannot refer yourself" };

    // 2. Check if this user was already referred
    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredId", args.newUserId))
      .first();
    if (existing) return { success: false, error: "User already referred" };

    // 3. Create the referral record
    await ctx.db.insert("referrals", {
      referrerId: referrer.userId as string,
      referredId: args.newUserId,
      status: "joined",
      createdAt: Date.now(),
    });

    // 4. Update referral stats and check for milestone
    let stats = await ctx.db
      .query("referralStats")
      .withIndex("by_user", (q) => q.eq("userId", referrer.userId as string))
      .first();

    if (!stats) {
      const statsId = await ctx.db.insert("referralStats", {
        userId: referrer.userId as string,
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
      // Find the referrer's primary workshop to add credits
      const primaryWorkshop = await ctx.db
        .query("workshops")
        .withIndex("by_owner", (q) => q.eq("ownerId", referrer.userId as string))
        .first();

      if (primaryWorkshop) {
        await ctx.db.patch(primaryWorkshop._id, {
          credits: (primaryWorkshop.credits || 0) + MILESTONE_REWARD,
        });

        await ctx.db.insert("creditGrants", {
          workshopId: primaryWorkshop._id,
          amount: MILESTONE_REWARD,
          remaining: MILESTONE_REWARD,
          startsAt: Date.now(),
          expiresAt: Date.now() + 30 * 86_400_000,
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
    
    const referrerWorkshop = await ctx.db
      .query("workshops")
      .withIndex("by_owner", (q) => q.eq("ownerId", referral.referrerId))
      .first();

    if (referrerWorkshop) {
      await ctx.db.patch(referrerWorkshop._id, {
        credits: (referrerWorkshop.credits || 0) + rewardAmount,
      });

      await ctx.db.insert("creditGrants", {
        workshopId: referrerWorkshop._id,
        amount: rewardAmount,
        remaining: rewardAmount,
        startsAt: Date.now(),
        expiresAt: Date.now() + 30 * 86_400_000,
        source: "referral_purchase",
      });
    }
  },
});
