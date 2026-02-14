'use client';

import { useState, use } from 'react';
import { authClient } from '@/lib/auth-client';
import { SidebarInset } from '@/components/ui/sidebar';
import { useWorkshop } from '@/hooks/use-workshop';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { TechnicalBlueprint } from '@/components/studio/technical-blueprint';
import { PencilRuler } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Id } from '../../../../convex/_generated/dataModel';

export default function SchematicsPage({ params }: { params: Promise<{ workshopSlug: string }> }) {
  use(params);
  const { data: session, isPending } = authClient.useSession();
  const { activeWorkshopId } = useWorkshop();
  
  const projects = useQuery(api.projects.getProjects, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const canvasItems = useQuery(
    api.studio.getCanvasItems,
    selectedProjectId ? { projectId: selectedProjectId as Id<"projects"> } : "skip",
  );
  const project = useQuery(
    api.projects.getProject,
    selectedProjectId ? { id: selectedProjectId as Id<"projects"> } : "skip",
  );

  const blueprintItem = canvasItems?.find(item => item.type === 'technical-blueprint');

  if (isPending || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
          Initializing...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans w-full">
        <SidebarInset className="flex-1 relative flex flex-col bg-background border-none!">
          <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Engineering</span>
              <span className="text-xs font-medium">Technical Schematics</span>
              {project && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="text-xs font-medium text-primary">{project.name}</span>
                </>
              )}
            </div>
          </header>

          <div className="flex-1 relative bg-neutral-950 overflow-hidden flex flex-col items-center justify-center p-8">
            {!selectedProjectId ? (
              <div className="p-8 max-w-4xl mx-auto w-full bg-background rounded-3xl border border-border">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold mb-2 text-white">Select a Product for Schematics</h1>
                  <p className="text-muted-foreground text-sm">Review technical blueprints and manufacturing data</p>
                </div>
                
                {projects === undefined ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-2xl">
                    <PencilRuler className="size-12 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">No products available. Create one first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projects.map(p => (
                      <div 
                        key={p._id}
                        onClick={() => setSelectedProjectId(p._id)}
                        className="p-6 bg-muted/50 border border-border rounded-2xl hover:border-primary/50 cursor-pointer transition-all group"
                      >
                        <h3 className="font-semibold text-white group-hover:text-primary transition-colors">{p.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{p.status || 'draft'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : blueprintItem ? (
              <TechnicalBlueprint data={blueprintItem.data} />
            ) : (
              <div className="flex flex-col items-center justify-center text-center max-w-md">
                <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 border border-white/10">
                  <PencilRuler className="text-neutral-500" size={32} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">No Schematics Generated</h2>
                <p className="text-neutral-500 text-sm mb-8">
                  This product doesn&apos;t have technical schematics yet. Use the Research tool to generate a blueprint first.
                </p>
                <button 
                  onClick={() => setSelectedProjectId(null)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-white border border-white/10 rounded-xl transition-all"
                >
                  Select Different Product
                </button>
              </div>
            )}
          </div>
        </SidebarInset>
    </div>
  );
}
