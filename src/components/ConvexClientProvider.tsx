'use client';

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { WorkshopProvider } from "@/hooks/use-workshop";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  // Type assertion needed due to library type mismatch between better-auth and ConvexBetterAuthProvider
  // The auth client's user type has optional image, but ConvexBetterAuthProvider expects required (but nullable) image
  // Using unknown as intermediate type for safer type coercion
  const typedAuthClient = authClient as unknown as Parameters<typeof ConvexBetterAuthProvider>[0]['authClient'];
  
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={typedAuthClient}
      initialToken={initialToken ?? undefined}
    >
      <WorkshopProvider>
        {children}
      </WorkshopProvider>
    </ConvexBetterAuthProvider>
  );
}
