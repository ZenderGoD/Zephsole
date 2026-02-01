import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export const { 
    handler, 
    fetchAuthQuery, 
    fetchAuthMutation, 
    fetchAuthAction,
    isAuthenticated,
    getToken
} = convexBetterAuthNextJs({
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
    convexSiteUrl: process.env.CONVEX_SITE_URL!,
});
