import { Crons } from "@convex-dev/crons";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { isAdminUser, requireAuthUserId } from "./authUtils";

const crons = new Crons(components.crons);

type AdminCtx =
  | (GenericMutationCtx<DataModel> & GenericCtx<DataModel>)
  | (GenericQueryCtx<DataModel> & GenericCtx<DataModel>);

async function requirePlatformAdmin(ctx: AdminCtx) {
  await requireAuthUserId(ctx);
  const admin = await isAdminUser(ctx);
  if (!admin) throw new ConvexError("ADMIN_ONLY");
}

export const ensureFalCrons = mutation({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);

    const jobs = [
      {
        name: "fal-maintenance-15m",
        schedule: { kind: "interval" as const, ms: 15 * 60 * 1000 },
        args: { note: "cron_15m_maintenance", staleAfterMs: 60 * 60 * 1000 },
      },
      {
        name: "fal-health-hourly",
        schedule: { kind: "interval" as const, ms: 60 * 60 * 1000 },
        args: { note: "cron_hourly_health_snapshot", staleAfterMs: 60 * 60 * 1000 },
      },
    ];

    for (const job of jobs) {
      const existing = await crons.get(ctx, { name: job.name });
      if (existing) {
        await crons.delete(ctx, { name: job.name });
      }
      await crons.register(
        ctx,
        job.schedule,
        internal.falHealth.runFalMaintenance,
        job.args,
        job.name,
      );
    }

    return { success: true, jobs: jobs.map((j) => j.name) };
  },
});

export const listFalCrons = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const list = await crons.list(ctx);
    return list.filter((cron) => cron.name?.startsWith("fal-"));
  },
});

export const removeFalCron = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    if (!args.name.startsWith("fal-")) throw new ConvexError("INVALID_CRON_NAME");
    await crons.delete(ctx, { name: args.name });
    return { success: true };
  },
});
