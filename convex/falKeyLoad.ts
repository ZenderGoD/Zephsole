import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getAllKeyLoads = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("falKeyLoad").withIndex("by_key_name").collect();
    const byName: Record<string, { activeOperations: number; capacity: number; lastUpdated: number }> = {};
    for (const row of rows) {
      byName[row.keyName] = {
        activeOperations: row.activeOperations,
        capacity: row.capacity,
        lastUpdated: row.lastUpdated,
      };
    }
    return byName;
  },
});

export const incrementKeyLoad = internalMutation({
  args: { keyName: v.string(), capacity: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("falKeyLoad")
      .withIndex("by_key_name", (q) => q.eq("keyName", args.keyName))
      .first();
    const now = Date.now();
    if (!row) {
      await ctx.db.insert("falKeyLoad", {
        keyName: args.keyName,
        activeOperations: 1,
        capacity: args.capacity,
        lastUpdated: now,
      });
      return { ok: true, activeOperations: 1 };
    }
    if (row.activeOperations >= args.capacity) {
      return { ok: false, activeOperations: row.activeOperations };
    }
    await ctx.db.patch(row._id, {
      activeOperations: row.activeOperations + 1,
      capacity: args.capacity,
      lastUpdated: now,
    });
    return { ok: true, activeOperations: row.activeOperations + 1 };
  },
});

export const decrementKeyLoad = internalMutation({
  args: { keyName: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("falKeyLoad")
      .withIndex("by_key_name", (q) => q.eq("keyName", args.keyName))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      activeOperations: Math.max(row.activeOperations - 1, 0),
      lastUpdated: Date.now(),
    });
  },
});

export const cleanupStaleLoadCounters = internalMutation({
  args: { staleAfterMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const staleAfterMs = Math.max(args.staleAfterMs ?? 60 * 60 * 1000, 60_000);
    const cutoff = Date.now() - staleAfterMs;
    const rows = await ctx.db.query("falKeyLoad").withIndex("by_key_name").collect();
    let resetCount = 0;
    for (const row of rows) {
      if (row.lastUpdated < cutoff && row.activeOperations > 0) {
        await ctx.db.patch(row._id, {
          activeOperations: 0,
          lastUpdated: Date.now(),
        });
        resetCount += 1;
      }
    }
    return { resetCount, scanned: rows.length, staleAfterMs };
  },
});

export const getLoadStatistics = internalQuery({
  args: { staleAfterMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const staleAfterMs = Math.max(args.staleAfterMs ?? 60 * 60 * 1000, 60_000);
    const cutoff = Date.now() - staleAfterMs;
    const rows = await ctx.db.query("falKeyLoad").withIndex("by_key_name").collect();
    let totalActiveOperations = 0;
    let staleEntries = 0;
    let overloadedEntries = 0;

    for (const row of rows) {
      totalActiveOperations += row.activeOperations;
      if (row.lastUpdated < cutoff) staleEntries += 1;
      if (row.activeOperations >= row.capacity) overloadedEntries += 1;
    }

    return {
      totalEntries: rows.length,
      totalActiveOperations,
      staleEntries,
      overloadedEntries,
      staleAfterMs,
    };
  },
});
