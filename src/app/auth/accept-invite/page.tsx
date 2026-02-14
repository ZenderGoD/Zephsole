"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const acceptInvite = useMutation(api.workshops.acceptInvite);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const token = useMemo(() => searchParams.get("token"), [searchParams]);

  useEffect(() => {
    if (isPending) return;
    if (!token) return;

    if (!session) {
      router.replace(`/auth?inviteToken=${encodeURIComponent(token)}`);
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;
    acceptInvite({ token })
      .then(() => {
        router.replace("/studio");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to accept invite.");
      });
  }, [isPending, token, session, router, acceptInvite]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      {error ? (
        <div className="text-sm text-red-400">{error}</div>
      ) : !token ? (
        <div className="text-sm text-red-400">Missing invite token.</div>
      ) : (
        <div className="text-sm text-neutral-300">Processing invite...</div>
      )}
    </div>
  );
}
