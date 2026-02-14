import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminUser, requireAuthUserId } from "./authUtils";

async function requirePlatformAdmin(ctx: MutationCtx | QueryCtx) {
  await requireAuthUserId(ctx);
  const admin = await isAdminUser(ctx);
  if (!admin) throw new ConvexError("ADMIN_ONLY");
}

function evaluateStatus(enabledKeys: number, overloadedKeys: number, staleEntries: number) {
  if (enabledKeys <= 0) return "critical" as const;
  if (overloadedKeys > 0 || staleEntries > 2) return "degraded" as const;
  return "healthy" as const;
}

type MaintenanceResult = {
  status: "healthy" | "degraded" | "critical";
  cleanup: { resetCount: number; scanned: number; staleAfterMs: number };
  loads: {
    totalEntries: number;
    totalActiveOperations: number;
    staleEntries: number;
    overloadedEntries: number;
    staleAfterMs: number;
  };
  enabledKeys: number;
  createdAt: number;
};

async function runMaintenanceCore(
  ctx: MutationCtx,
  args: { staleAfterMs?: number; note?: string },
): Promise<MaintenanceResult> {
  const cleanup: { resetCount: number; scanned: number; staleAfterMs: number } = await ctx.runMutation(
    internal.falKeyLoad.cleanupStaleLoadCounters,
    {
    staleAfterMs: args.staleAfterMs,
    },
  );
  const loads: {
    totalEntries: number;
    totalActiveOperations: number;
    staleEntries: number;
    overloadedEntries: number;
    staleAfterMs: number;
  } = await ctx.runQuery(internal.falKeyLoad.getLoadStatistics, {
    staleAfterMs: args.staleAfterMs,
  });
  const keys: Array<{ name: string; key: string; capacity: number; weight: number }> =
    await ctx.runQuery(internal.falKeys.getActiveFalKeyConfigs, {});
  const status = evaluateStatus(keys.length, loads.overloadedEntries, loads.staleEntries);
  const now = Date.now();
  await ctx.db.insert("falHealthChecks", {
    status,
    enabledKeys: keys.length,
    overloadedKeys: loads.overloadedEntries,
    staleLoadEntries: loads.staleEntries,
    notes: args.note,
    createdAt: now,
  });

  const snapshots = await ctx.db
    .query("falHealthChecks")
    .withIndex("by_createdAt")
    .order("desc")
    .collect();
  for (const snapshot of snapshots.slice(500)) {
    await ctx.db.delete(snapshot._id);
  }

  return {
    status,
    cleanup,
    loads,
    enabledKeys: keys.length,
    createdAt: now,
  };
}

export const runFalMaintenance = internalMutation({
  args: {
    staleAfterMs: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => runMaintenanceCore(ctx, args),
});

export const getFalHealthOverview = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const keys = await ctx.db.query("falKeys").withIndex("by_enabled", (q) => q.eq("enabled", true)).collect();
    const loads = await ctx.db.query("falKeyLoad").withIndex("by_key_name").collect();
    const staleCutoff = Date.now() - 60 * 60 * 1000;
    let overloadedKeys = 0;
    let staleLoadEntries = 0;
    for (const row of loads) {
      if (row.activeOperations >= row.capacity) overloadedKeys += 1;
      if (row.lastUpdated < staleCutoff) staleLoadEntries += 1;
    }
    const status = evaluateStatus(keys.length, overloadedKeys, staleLoadEntries);
    const latest = await ctx.db
      .query("falHealthChecks")
      .withIndex("by_createdAt")
      .order("desc")
      .first();
    return {
      status,
      enabledKeys: keys.length,
      overloadedKeys,
      staleLoadEntries,
      latestSnapshotAt: latest?.createdAt,
    };
  },
});

export const runFalMaintenanceNow = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    return await runMaintenanceCore(ctx, {
      note: "manual_admin_trigger",
    });
  },
});
