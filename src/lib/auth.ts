import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export const { 
    handler, 
    fetchAuthQuery, 
    fetchAuthMutation, 
    fetchAuthAction,
    isAuthenticated,
    getToken
} = convexBetterAuthNextJs({
    convexSiteUrl: process.env.CONVEX_SITE_URL!,
});
