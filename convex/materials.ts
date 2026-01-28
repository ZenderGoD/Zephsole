import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMaterials = query({
  handler: async (ctx) => {
    return await ctx.db.query("materials").collect();
  },
});

export const addMaterial = mutation({
  args: {
    name: v.string(),
    supplier: v.optional(v.string()),
    unit: v.string(),
    pricePerUnit: v.number(),
    currency: v.string(),
    co2PerUnit: v.optional(v.number()),
    properties: v.optional(v.any()),
    availability: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("materials", {
      name: args.name,
      supplier: args.supplier,
      unit: args.unit,
      pricePerUnit: args.pricePerUnit,
      currency: args.currency,
      co2PerUnit: args.co2PerUnit,
      properties: args.properties,
      availability: args.availability,
    });
  },
});
