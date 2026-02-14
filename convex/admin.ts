import type { GenericCtx } from "@convex-dev/better-auth";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getAuthUserRole, isAdminUser, requireAuthUserId } from "./authUtils";

type AdminCtx =
  | (GenericMutationCtx<DataModel> & GenericCtx<DataModel>)
  | (GenericQueryCtx<DataModel> & GenericCtx<DataModel>);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "workspace"
  );
}

function authIdentityForUser(user: Doc<"user">): string {
  return user.userId ?? user._id;
}

async function requirePlatformAdmin(ctx: AdminCtx): Promise<string> {
  const userId = await requireAuthUserId(ctx);
  const admin = await isAdminUser(ctx);
  if (!admin) throw new ConvexError("ADMIN_ONLY");
  return userId;
}

async function getWorkshopCreditBalance(
  ctx: AdminCtx,
  workshopId: Id<"workshops">,
): Promise<number> {
  const now = Date.now();
  const grants = await ctx.db
    .query("creditGrants")
    .withIndex("by_workshop_expires", (q) =>
      q.eq("workshopId", workshopId).gt("expiresAt", now),
    )
    .collect();
  return grants
    .filter((grant) => grant.startsAt <= now && grant.remaining > 0)
    .reduce((sum, grant) => sum + grant.remaining, 0);
}

async function getUniqueWorkshopSlug(ctx: AdminCtx, base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (
    await ctx.db
      .query("workshops")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()
  ) {
    slug = `${base}-${counter++}`;
  }
  return slug;
}

export const currentAdminStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const role = await getAuthUserRole(ctx);
    return { userId, role, isAdmin: role === "admin" };
  },
});

export const listWorkshopsForCredits = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const all = await ctx.db.query("workshops").collect();
    const term = args.search?.trim().toLowerCase();
    const filtered = term
      ? all.filter(
          (w) =>
            w.name.toLowerCase().includes(term) ||
            w.slug.toLowerCase().includes(term) ||
            w.ownerId.toLowerCase().includes(term),
        )
      : all;

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const slice = filtered
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    const rows = [];
    for (const workshop of slice) {
      const balance = await getWorkshopCreditBalance(ctx, workshop._id);
      rows.push({
        workshopId: workshop._id,
        name: workshop.name,
        slug: workshop.slug,
        ownerId: workshop.ownerId,
        createdAt: workshop.createdAt,
        balance,
      });
    }
    return rows;
  },
});

export const grantCreditsToWorkshop = mutation({
  args: {
    workshopId: v.id("workshops"),
    amount: v.number(),
    source: v.optional(v.string()),
    description: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const adminUserId = await requirePlatformAdmin(ctx);
    if (args.amount <= 0) throw new ConvexError("Amount must be greater than 0");

    const workshop = await ctx.db.get(args.workshopId);
    if (!workshop) throw new ConvexError("WORKSHOP_NOT_FOUND");

    const startsAt = Date.now();
    const expiresAt =
      typeof args.expiresInDays === "number"
        ? startsAt + Math.max(args.expiresInDays, 1) * 86_400_000
        : undefined;

    const grantId = await ctx.db.insert("creditGrants", {
      workshopId: args.workshopId,
      amount: args.amount,
      remaining: args.amount,
      source: args.source ?? "platform_admin",
      startsAt,
      expiresAt: expiresAt ?? (startsAt + 90 * 86_400_000),
      metadata: {
        description: args.description,
        grantedBy: adminUserId,
        grantedAt: startsAt,
      },
    });

    const newBalance = await getWorkshopCreditBalance(ctx, args.workshopId);

    return {
      success: true,
      grantId,
      workshopId: args.workshopId,
      workshopName: workshop.name,
      newBalance,
    };
  },
});

export const listUsersForAdmin = query({
  args: {
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      userDocId: v.id("user"),
      authIdentity: v.string(),
      email: v.string(),
      name: v.string(),
      role: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    
    // Query BetterAuth users via adapter since ctx.db.query("user") may not access component tables directly
    const allUsersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: {
        numItems: 1000,
        cursor: null,
      },
      sortBy: {
        field: "createdAt",
        direction: "desc",
      },
    }) as { page: Array<unknown>; isDone: boolean; continueCursor: string | null };
    
    const allUsers = (allUsersResult.page || []) as Array<{
      _id: string;
      email?: string;
      name?: string;
      role?: string;
      createdAt?: number;
      userId?: string;
    }>;
    
    console.log(`[listUsersForAdmin] Found ${allUsers.length} total users via adapter`);
    if (allUsers.length > 0) {
      console.log(`[listUsersForAdmin] Sample emails: ${allUsers.slice(0, 5).map((u) => u.email).join(", ")}`);
    }
    
    const term = args.search?.trim().toLowerCase();
    console.log(`[listUsersForAdmin] Search term: "${term || "(empty)"}"`);
    const filtered = term
      ? allUsers.filter(
          (user) => {
            const emailMatch = (user.email ?? "").toLowerCase().includes(term);
            const nameMatch = (user.name ?? "").toLowerCase().includes(term);
            const userIdMatch = (user.userId ?? "").toLowerCase().includes(term);
            const matches = emailMatch || nameMatch || userIdMatch;
            if (matches) {
              console.log(`[listUsersForAdmin] Match: ${user.email} (email: ${emailMatch}, name: ${nameMatch}, userId: ${userIdMatch})`);
            }
            return matches;
          },
        )
      : allUsers;
    console.log(`[listUsersForAdmin] Filtered to ${filtered.length} users`);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    const result = filtered.slice(0, limit).map((user) => ({
      userDocId: user._id as Id<"user">,
      authIdentity: user.userId ?? user._id,
      email: user.email ?? "",
      name: user.name ?? "",
      role: user.role ?? "user",
      createdAt: user.createdAt ?? Date.now(),
    }));
    console.log(`[listUsersForAdmin] Returning ${result.length} users`);
    return result;
  },
});

export const createUser = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    markEmailVerified: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    email: v.string(),
  }),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const email = normalizeEmail(args.email);
    if (!EMAIL_REGEX.test(email)) throw new ConvexError("INVALID_EMAIL_FORMAT");

    const existing = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (existing) throw new ConvexError("USER_ALREADY_EXISTS");

    const existingAuthUser = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "email", value: email }],
    });
    if (existingAuthUser) throw new ConvexError("USER_ALREADY_EXISTS");

    const now = Date.now();
    const emailVerified = args.markEmailVerified ?? false;
    const name = args.name?.trim() || email.split("@")[0] || "User";

    const createResult = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name,
          email,
          emailVerified,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    // Verify user was created by querying immediately after
    const verifyUser = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", email))
      .first();

    if (!verifyUser) {
      throw new ConvexError("USER_CREATE_FAILED_VERIFICATION");
    }

    return {
      success: true,
      email,
    };
  },
});

export const createWorkshopForUser = mutation({
  args: {
    ownerEmail: v.string(),
    workspaceName: v.string(),
    initialCredits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const ownerEmail = normalizeEmail(args.ownerEmail);
    const owner = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", ownerEmail))
      .first();
    if (!owner) throw new ConvexError("USER_NOT_FOUND");

    const ownerIdentity = authIdentityForUser(owner);
    const now = Date.now();
    const slug = await getUniqueWorkshopSlug(ctx, slugify(args.workspaceName));
    const workshopId = await ctx.db.insert("workshops", {
      name: args.workspaceName.trim(),
      slug,
      ownerId: ownerIdentity,
      createdAt: now,
      credits: 0,
    });

    await ctx.db.insert("workshopMembers", {
      workshopId,
      userId: ownerIdentity,
      role: "owner",
      joinedAt: now,
    });

    const initialCredits = Math.max(args.initialCredits ?? 0, 0);
    if (initialCredits > 0) {
      await ctx.db.insert("creditGrants", {
        workshopId,
        amount: initialCredits,
        remaining: initialCredits,
        startsAt: now,
        expiresAt: now + 90 * 86_400_000,
        source: "admin_workspace_bootstrap",
        metadata: {
          ownerEmail,
        },
      });
    }

    return { success: true, workshopId, slug };
  },
});

export const addUserToWorkspace = mutation({
  args: {
    workshopId: v.id("workshops"),
    userEmail: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const userEmail = normalizeEmail(args.userEmail);
    const user = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", userEmail))
      .first();
    if (!user) throw new ConvexError("USER_NOT_FOUND");

    const membershipUserId = authIdentityForUser(user);
    const workshop = await ctx.db.get(args.workshopId);
    if (!workshop) throw new ConvexError("WORKSHOP_NOT_FOUND");

    const existing = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop_user", (q) =>
        q.eq("workshopId", args.workshopId).eq("userId", membershipUserId),
      )
      .first();
    if (existing) throw new ConvexError("ALREADY_MEMBER");

    const membershipId = await ctx.db.insert("workshopMembers", {
      workshopId: args.workshopId,
      userId: membershipUserId,
      role: args.role,
      joinedAt: Date.now(),
    });

    return { success: true, membershipId };
  },
});

export const listWorkshopMembersForAdmin = query({
  args: { workshopId: v.id("workshops") },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const members = await ctx.db
      .query("workshopMembers")
      .withIndex("by_workshop", (q) => q.eq("workshopId", args.workshopId))
      .collect();

    const rows = [];
    for (const member of members) {
      const user = await ctx.db
        .query("user")
        .withIndex("userId", (q) => q.eq("userId", member.userId))
        .first();
      rows.push({
        membershipId: member._id,
        role: member.role,
        userId: member.userId,
        email: user?.email ?? null,
        name: user?.name ?? null,
      });
    }
    return rows;
  },
});

export const setUserRoleForAdmin = mutation({
  args: {
    userEmail: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const email = normalizeEmail(args.userEmail);
    const user = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new ConvexError("USER_NOT_FOUND");
    await ctx.db.patch(user._id, { role: args.role, updatedAt: Date.now() });
    return { success: true, userId: user._id, role: args.role };
  },
});

export const getPlatformStats = query({
  args: {},
  returns: v.object({
    totalUsers: v.number(),
    totalWorkshops: v.number(),
    totalProjects: v.number(),
    totalMemberships: v.number(),
    totalCreditsGranted: v.number(),
    totalCreditsRemaining: v.number(),
    totalCreditsUsed: v.number(),
  }),
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);

    // Get total users from BetterAuth
    const usersResult = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      paginationOpts: {
        numItems: 10000,
        cursor: null,
      },
    });
    const totalUsers = (usersResult.page || []).length;

    // Get total workshops
    const workshops = await ctx.db.query("workshops").collect();
    const totalWorkshops = workshops.length;

    // Get total projects
    const projects = await ctx.db.query("projects").collect();
    const totalProjects = projects.length;

    // Get total memberships
    const memberships = await ctx.db.query("workshopMembers").collect();
    const totalMemberships = memberships.length;

    // Get credit stats
    const now = Date.now();
    const allGrants = await ctx.db.query("creditGrants").collect();
    const totalCreditsGranted = allGrants.reduce((sum, grant) => sum + grant.amount, 0);
    const activeGrants = allGrants.filter(
      (grant) => grant.startsAt <= now && grant.expiresAt > now && grant.remaining > 0,
    );
    const totalCreditsRemaining = activeGrants.reduce((sum, grant) => sum + grant.remaining, 0);
    const totalCreditsUsed = totalCreditsGranted - activeGrants.reduce((sum, grant) => sum + grant.remaining, 0);

    return {
      totalUsers,
      totalWorkshops,
      totalProjects,
      totalMemberships,
      totalCreditsGranted,
      totalCreditsRemaining,
      totalCreditsUsed,
    };
  },
});
