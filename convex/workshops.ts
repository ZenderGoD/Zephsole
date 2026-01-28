import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const FREE_CREDITS = 5.00;

export const getWorkshops = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("workshopMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const workshopIds = memberships.map((m) => m.workshopId);
    const workshops = [];
    for (const workshopId of workshopIds) {
      const workshop = await ctx.db.get(workshopId);
      if (workshop) {
        workshops.push(workshop);
      }
    }
    return workshops;
  },
});

export const createWorkshop = mutation({
  args: { name: v.string(), ownerId: v.string() },
  handler: async (ctx, args) => {
    // Check if user already owns any workshops
    const existingOwnedWorkshop = await ctx.db
      .query("workshops")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .first();

    const credits = existingOwnedWorkshop ? 0 : FREE_CREDITS;

    const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || "workshop";
    
    // Ensure uniqueness
    let finalSlug = slug;
    let counter = 1;
    while (await ctx.db.query("workshops").withIndex("by_slug", q => q.eq("slug", finalSlug)).first()) {
      finalSlug = `${slug}-${counter++}`;
    }

    const workshopId = await ctx.db.insert("workshops", {
      name: args.name,
      slug: finalSlug,
      ownerId: args.ownerId,
      credits: credits,
      createdAt: Date.now(),
    });

    await ctx.db.insert("workshopMembers", {
      workshopId,
      userId: args.ownerId,
      role: "owner",
      joinedAt: Date.now(),
    });

    return workshopId;
  },
});

export const ensurePersonalWorkshop = mutation({
  args: { userId: v.string(), userName: v.string() },
  handler: async (ctx, args) => {
    const existingMembership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existingMembership) {
      return existingMembership.workshopId;
    }

    // Since this is the first membership being created via ensurePersonalWorkshop,
    // and we checked existingMembership, they don't have any workshops yet.
    // So give them the free credits.
    const credits = FREE_CREDITS;

    const baseSlug = args.userName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || "user";
    let slug = baseSlug;
    let counter = 1;
    while (await ctx.db.query("workshops").withIndex("by_slug", q => q.eq("slug", slug)).first()) {
      slug = `${baseSlug}-${counter++}`;
    }

    const workshopId = await ctx.db.insert("workshops", {
      name: `${args.userName}'s Workshop`,
      slug: slug,
      ownerId: args.userId,
      credits: credits,
      createdAt: Date.now(),
    });

    await ctx.db.insert("workshopMembers", {
      workshopId,
      userId: args.userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Also ensure the user has a referral code
    const user = await ctx.db
      .query("user")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .first();

    if (user && !user.referralCode) {
      const base = args.userName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
      let code = base;
      let counter = 1;
      while (await ctx.db.query("user").withIndex("referralCode", q => q.eq("referralCode", code)).first()) {
        code = `${base}${counter++}`;
      }
      await ctx.db.patch(user._id, { referralCode: code });
    }

    return workshopId;
  },
});

export const getWorkshopBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workshops")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const inviteMember = mutation({
  args: { 
    workshopId: v.id("workshops"), 
    email: v.string(), 
    role: v.union(v.literal("admin"), v.literal("member")) 
  },
  handler: async (ctx, args) => {
    // Find user by email
    const user = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if already a member
    const existing = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) => 
        q.eq("workshopId", args.workshopId).eq("userId", user._id)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("workshopMembers", {
      workshopId: args.workshopId,
      userId: user._id,
      role: args.role,
      joinedAt: Date.now(),
    });
  },
});

export const getMembers = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop", (q) => q.eq("workshopId", args.workshopId))
      .collect();

    const members = [];
    for (const membership of memberships) {
      const user = await ctx.db.get(membership.userId as any);
      if (user) {
        members.push({
          ...user,
          role: membership.role,
          joinedAt: membership.joinedAt,
        });
      }
    }
    return members;
  },
});

export const backfillCredits = mutation({
  args: {},
  handler: async (ctx) => {
    const workshops = await ctx.db.query("workshops").collect();
    for (const workshop of workshops) {
      if (workshop.credits === undefined) {
        await ctx.db.patch(workshop._id, { credits: 0 });
      }
    }
  },
});
