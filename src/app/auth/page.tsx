'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { authClient } from "@/lib/auth-client";

export default function AuthRoutePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session) {
      router.replace("/studio");
    }
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Loading...
      </div>
    );
  }

  return <AuthPage />;
}
