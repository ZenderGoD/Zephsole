import type { GenericCtx } from "@convex-dev/better-auth";
import type { BetterAuthOptions } from "better-auth/minimal";
import type { DataModel } from "./_generated/dataModel";
import { createAuthOptions } from "./auth/index";

export const getAuthOptions = (ctx: GenericCtx<DataModel>): BetterAuthOptions =>
  createAuthOptions(ctx);
