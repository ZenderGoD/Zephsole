import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Run this from the Convex Dashboard to make yourself an admin
 * Provide your email as the argument
 */
export const makeAdmin = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("user")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();

    if (!user) {
      throw new Error(`User with email ${args.email} not found. Make sure you have signed up first.`);
    }

    await ctx.db.patch(user._id, { role: "admin" });
    
    return {
      success: true,
      message: `User ${args.email} is now an admin.`,
    };
  },
});

/**
 * Sets the default "user" role for all existing users who don't have one
 */
export const backfillUserRoles = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("user").collect();
    let count = 0;
    
    for (const user of users) {
      if (!user.role) {
        await ctx.db.patch(user._id, { role: "user" });
        count++;
      }
    }
    
    return {
      success: true,
      message: `Updated ${count} users to the 'user' role.`,
    };
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("user").collect();
  },
});

export const debugWorkshops = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workshops").collect();
  },
});
