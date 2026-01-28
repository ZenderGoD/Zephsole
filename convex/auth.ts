import { betterAuth } from "better-auth";
import { createClient } from "@convex-dev/better-auth";
import { components } from "./_generated/api";

export const authComponent = createClient(components.betterAuth);

export const createAuth = (ctx: any) => {
  return betterAuth({
    database: authComponent.adapter(ctx),
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
  });
};
