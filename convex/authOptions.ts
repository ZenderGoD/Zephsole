import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { BetterAuthOptions } from "better-auth";

export const getAuthOptions = (): BetterAuthOptions => {
  return {
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
  };
};
