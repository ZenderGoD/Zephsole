import { betterAuth } from "better-auth";
import { createClient, convexAdapter, GenericCtx } from "@convex-dev/better-auth";
import { admin } from "better-auth/plugins";
import { components, api, internal } from "./_generated/api";
import { defineSchema, GenericDataModel } from "convex/server";
import { authTables } from "./authSchema";
import { getAuthOptions } from "./authOptions";

import { DataModel } from "./_generated/dataModel";

const schema = defineSchema(authTables);
type Schema = typeof schema;

export const authComponent = createClient<DataModel, Schema>(components.betterAuth, {
  local: {
    schema,
  },
});

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    ...getAuthOptions(),
    database: authComponent.adapter(ctx),
  });
};
