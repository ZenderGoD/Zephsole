import { v } from "convex/values";
import { mutation } from "../_generated/server";

export const setUserId = mutation({
  args: {
    authId: v.id("user"),
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("user", args.authId, { userId: args.userId });
    return null;
  },
});

export const setUserRole = mutation({
  args: {
    authId: v.id("user"),
    role: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("user", args.authId, { role: args.role });
    return null;
  },
});
