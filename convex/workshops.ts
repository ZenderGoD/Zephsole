import { mutation, query, type MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAuthUserId, requireWorkshopMember, requireWorkshopRole } from "./authUtils";

const FREE_CREDITS = 5.0;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workshop";
}

function createInviteToken() {
  return `wsi_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

async function getUniqueSlug(ctx: MutationCtx, base: string) {
  let slug = base;
  let counter = 1;
  while (await ctx.db.query("workshops").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

export const getWorkshops = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const memberships = await ctx.db
      .query("workshopMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const workshops = [];
    for (const membership of memberships) {
      const workshop = await ctx.db.get(membership.workshopId);
      if (!workshop) continue;
      workshops.push({
        ...workshop,
        membershipRole: membership.role,
      });
    }
    return workshops;
  },
});

export const createWorkshop = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await requireAuthUserId(ctx);
    const existingOwnedWorkshop = await ctx.db
      .query("workshops")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();

    const credits = existingOwnedWorkshop ? 0 : FREE_CREDITS;
    const slug = await getUniqueSlug(ctx, slugify(args.name));
    const now = Date.now();

    const workshopId = await ctx.db.insert("workshops", {
      name: args.name,
      slug,
      ownerId,
      // Deprecated cached summary. Source of truth is creditGrants.
      credits,
      createdAt: now,
    });

    if (credits > 0) {
      await ctx.runMutation(internal.credits.grantCredits, {
        workshopId,
        amount: credits,
        source: "signup",
      });
    }

    await ctx.db.insert("workshopMembers", {
      workshopId,
      userId: ownerId,
      role: "owner",
      joinedAt: now,
    });

    return workshopId;
  },
});

export const ensurePersonalWorkshop = mutation({
  args: { userName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userIdentity = (await requireAuthUserId(ctx)) as Id<"user">;
    const existingMembership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_user", (q) => q.eq("userId", userIdentity))
      .first();
    if (existingMembership) return existingMembership.workshopId;

    const displayName = args.userName || "User";
    const slug = await getUniqueSlug(ctx, slugify(displayName));
    const now = Date.now();
    const credits = FREE_CREDITS;

    const workshopId = await ctx.db.insert("workshops", {
      name: `${displayName}'s Workshop`,
      slug,
      ownerId: userIdentity,
      credits,
      createdAt: now,
    });

    await ctx.db.insert("workshopMembers", {
      workshopId,
      userId: userIdentity,
      role: "owner",
      joinedAt: now,
    });

    await ctx.runMutation(internal.credits.grantCredits, {
      workshopId,
      amount: credits,
      source: "signup",
    });

    let user = await ctx.db
      .query("user")
      .withIndex("userId", (q) => q.eq("userId", userIdentity))
      .first();
    if (!user) user = await ctx.db.get(userIdentity);
    if (user && !user.referralCode) {
      const base = displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "zeph";
      let code = base;
      let counter = 1;
      while (await ctx.db.query("user").withIndex("referralCode", (q) => q.eq("referralCode", code)).first()) {
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
    const userId = await requireAuthUserId(ctx);
    const workshop = await ctx.db
      .query("workshops")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!workshop) return null;
    const membership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) => q.eq("workshopId", workshop._id).eq("userId", userId))
      .first();
    return membership ? workshop : null;
  },
});

export const inviteMember = mutation({
  args: {
    workshopId: v.id("workshops"),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const inviterId = await requireAuthUserId(ctx);
    await requireWorkshopRole(ctx, args.workshopId, ["owner", "admin"]);

    const email = args.email.trim().toLowerCase();
    if (!email) throw new ConvexError("EMAIL_REQUIRED");

    const existingPending = await ctx.db
      .query("workshopInvites")
      .withIndex("by_workshop_status", (q) => q.eq("workshopId", args.workshopId).eq("status", "pending"))
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (existingPending && existingPending.expiresAt > Date.now()) {
      return { inviteId: existingPending._id, token: existingPending.token };
    }

    const now = Date.now();
    const token = createInviteToken();
    const inviteId = await ctx.db.insert("workshopInvites", {
      workshopId: args.workshopId,
      inviterUserId: inviterId,
      email,
      role: args.role,
      token,
      status: "pending",
      expiresAt: now + INVITE_TTL_MS,
      createdAt: now,
    });

    const user = await ctx.db.query("user").withIndex("email", (q) => q.eq("email", email)).first();
    if (!user) return { inviteId, token };

    const inviteeId = (user.userId || user._id) as string;
    const existingMembership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) => q.eq("workshopId", args.workshopId).eq("userId", inviteeId))
      .first();
    if (!existingMembership) {
      await ctx.db.insert("workshopMembers", {
        workshopId: args.workshopId,
        userId: inviteeId,
        role: args.role,
        joinedAt: now,
      });
    }

    await ctx.db.patch(inviteId, {
      status: "accepted",
      acceptedByUserId: inviteeId,
      acceptedAt: now,
    });
    return { inviteId, token, autoAccepted: true };
  },
});

export const listInvites = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    await requireWorkshopRole(ctx, args.workshopId, ["owner", "admin"]);
    return await ctx.db
      .query("workshopInvites")
      .withIndex("by_workshop_status", (q) => q.eq("workshopId", args.workshopId).eq("status", "pending"))
      .order("desc")
      .collect();
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("workshopInvites") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new ConvexError("INVITE_NOT_FOUND");
    await requireWorkshopRole(ctx, invite.workshopId, ["owner", "admin"]);
    if (invite.status === "pending") {
      await ctx.db.patch(invite._id, { status: "revoked" });
    }
  },
});

export const getMyPendingInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.query("user").withIndex("userId", (q) => q.eq("userId", userId)).first();
    const email = user?.email?.toLowerCase();
    if (!email) return [];
    return await ctx.db
      .query("workshopInvites")
      .withIndex("by_email_status", (q) => q.eq("email", email).eq("status", "pending"))
      .collect();
  },
});

export const acceptInvite = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const invite = await ctx.db.query("workshopInvites").withIndex("by_token", (q) => q.eq("token", args.token)).first();
    if (!invite) throw new ConvexError("INVITE_NOT_FOUND");
    if (invite.status !== "pending") throw new ConvexError("INVITE_NOT_PENDING");

    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch(invite._id, { status: "expired" });
      throw new ConvexError("INVITE_EXPIRED");
    }

    const user = await ctx.db.query("user").withIndex("userId", (q) => q.eq("userId", userId)).first();
    const email = user?.email?.toLowerCase();
    if (!email || email !== invite.email.toLowerCase()) throw new ConvexError("INVITE_EMAIL_MISMATCH");

    const existingMembership = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) => q.eq("workshopId", invite.workshopId).eq("userId", userId))
      .first();
    if (!existingMembership) {
      await ctx.db.insert("workshopMembers", {
        workshopId: invite.workshopId,
        userId,
        role: invite.role,
        joinedAt: Date.now(),
      });
    }

    await ctx.db.patch(invite._id, {
      status: "accepted",
      acceptedByUserId: userId,
      acceptedAt: Date.now(),
    });
    return { workshopId: invite.workshopId };
  },
});

export const getMembers = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    await requireWorkshopMember(ctx, args.workshopId);
    const memberships = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop", (q) => q.eq("workshopId", args.workshopId))
      .collect();

    const members = [];
    for (const membership of memberships) {
      let userDoc = await ctx.db.query("user").withIndex("userId", (q) => q.eq("userId", membership.userId)).first();
      if (!userDoc) userDoc = await ctx.db.get(membership.userId as Id<"user">);
      if (!userDoc) continue;
      members.push({
        ...userDoc,
        role: membership.role,
        joinedAt: membership.joinedAt,
      });
    }
    return members;
  },
});

export const backfillCredits = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuthUserId(ctx);
    const workshops = await ctx.db.query("workshops").collect();
    for (const workshop of workshops) {
      if (workshop.credits === undefined) {
        await ctx.db.patch(workshop._id, { credits: 0 });
      }
    }
  },
});
