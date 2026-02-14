import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { ConvexError } from "convex/values";

export const isAuthError = (error: unknown) => {
  const message =
    (error instanceof ConvexError && error.data) ||
    (error instanceof Error && error.message) ||
    "";
  return /auth/i.test(String(message));
};

const getConvexSiteUrl = (): string => {
  const siteUrl =
    process.env.CONVEX_SITE_URL ||
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL;
  return siteUrl || "";
};

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: getConvexSiteUrl(),
  jwtCache: {
    enabled: true,
    isAuthError,
  },
});
