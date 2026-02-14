import type { GenericCtx } from "@convex-dev/better-auth";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { DataModel } from "./_generated/dataModel";
import { authComponent } from "./auth/index";

export async function getAuthUserId(ctx: GenericCtx<DataModel>): Promise<string | null> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) return null;
  return authUser.userId ?? authUser._id;
}

export async function requireAuthUserId(ctx: GenericCtx<DataModel>): Promise<string> {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError("AUTH_REQUIRED");
  return id;
}

export async function getAuthUserRole(ctx: GenericCtx<DataModel>): Promise<string | null> {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (authUser?.role) return authUser.role;

  const identity = authUser?.userId ?? authUser?._id;
  if (!identity) return null;
  if (!("db" in ctx)) return null;
  const db = ctx.db;

  // Fallback: resolve role directly from user table when auth payload omits role.
  const byUserId = await db
    .query("user")
    .withIndex("userId", (q) => q.eq("userId", identity))
    .first();
  if (byUserId?.role) return byUserId.role;

  const byId = await db.get(identity as Id<"user">);
  if (byId?.role) return byId.role;

  if (authUser?.email) {
    const byEmail = await db
      .query("user")
      .withIndex("email", (q) => q.eq("email", authUser.email as string))
      .first();
    if (byEmail?.role) return byEmail.role;
  }

  return null;
}

export async function isAdminUser(ctx: GenericCtx<DataModel>): Promise<boolean> {
  const role = await getAuthUserRole(ctx);
  return role === "admin";
}

type WorkshopCtx =
  | (GenericQueryCtx<DataModel> & GenericCtx<DataModel>)
  | (GenericMutationCtx<DataModel> & GenericCtx<DataModel>);

export async function requireWorkshopMember(
  ctx: WorkshopCtx,
  workshopId: Id<"workshops">,
) {
  const userId = await requireAuthUserId(ctx);
  const membership = await ctx.db
    .query("workshopMembers")
    .withIndex("by_workshop_user", (q) =>
      q.eq("workshopId", workshopId).eq("userId", userId),
    )
    .first();

  if (!membership) throw new ConvexError("WORKSHOP_ACCESS_DENIED");
  return membership;
}

export async function requireWorkshopRole(
  ctx: WorkshopCtx,
  workshopId: Id<"workshops">,
  roles: Array<"owner" | "admin" | "member">,
) {
  const membership = await requireWorkshopMember(ctx, workshopId);
  if (!roles.includes(membership.role)) {
    throw new ConvexError("WORKSHOP_ROLE_FORBIDDEN");
  }
  return membership;
}
