import { betterAuth } from "better-auth";
import { createClient, convexAdapter } from "@convex-dev/better-auth";
import { admin } from "better-auth/plugins";
import { components, api } from "./_generated/api";
import { QueryCtx } from "./_generated/server";
import { authTables } from "./authSchema";

export const authComponent = createClient(components.betterAuth, {
  local: {
    schema: authTables as any,
  },
});

export const createAuth = (ctx: QueryCtx) => {
  return betterAuth({
    database: convexAdapter(ctx as any, { adapter: (api as any).authInternal } as any),
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    plugins: [
      admin({
        defaultRole: "user",
      }),
    ],
  });
};
