'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useWorkshop } from '@/hooks/use-workshop';

export default function StudioPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { activeWorkshopSlug } = useWorkshop();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth?mode=signin');
      return;
    }

    // Debug logging
    if (session) {
      console.log('Studio page state:', {
        session: !!session,
        activeWorkshopSlug,
      });
    }

    if (session && activeWorkshopSlug) {
      router.push(`/${activeWorkshopSlug}/research`);
    }

    // Timeout fallback - if stuck for more than 10 seconds, show error
    const timeout = setTimeout(() => {
      if (session && !activeWorkshopSlug) {
        setError('Failed to load workshop. Please refresh the page.');
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [session, isPending, activeWorkshopSlug, router]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="text-center space-y-4">
          <div className="font-mono text-sm text-red-400">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white text-black rounded hover:bg-gray-200"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
        Preparing your studio...
      </div>
    </div>
  );
}
