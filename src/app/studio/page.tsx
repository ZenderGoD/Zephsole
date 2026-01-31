'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useWorkshop } from '@/hooks/use-workshop';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function StudioPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { activeWorkshopId, activeWorkshopSlug } = useWorkshop();
  
  const createProject = useMutation(api.projects.createProject);
  const projects = useQuery(api.projects.getProjects, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
      return;
    }

    if (session && activeWorkshopId && activeWorkshopSlug && projects !== undefined) {
      router.push(`/${activeWorkshopSlug}/genshoes`);
    }
  }, [session, isPending, activeWorkshopSlug, activeWorkshopId, projects, router, createProject]);

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
        Preparing your studio...
      </div>
    </div>
  );
}
