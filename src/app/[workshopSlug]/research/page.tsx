'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AppSidebar } from '@/components/app-sidebar';
import { ResearchChat } from '@/components/studio/research-chat';
import { PromptInterface } from '@/components/studio/prompt';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useWorkshop } from '@/hooks/use-workshop';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { PromptPayload, SendToCanvasArgs } from '@/lib/types';
import { LayoutGrid, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ResearchPage({ params }: { params: Promise<{ workshopSlug: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { activeWorkshopId } = useWorkshop();
  
  const projects = useQuery(api.projects.getProjects, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<PromptPayload | null>(null);

  const project = useQuery(api.projects.getProject, selectedProjectId ? { id: selectedProjectId as any } : "skip");
  const dequeueMessage = useMutation(api.projects.dequeueMessage);

  const handleGenerationComplete = async () => {
    setIsGenerating(false);
    setCurrentPrompt(null);

    if (selectedProjectId) {
      const nextItem = await dequeueMessage({ projectId: selectedProjectId as any });
      if (nextItem) {
        setCurrentPrompt({
          text: nextItem.prompt,
          attachments: nextItem.attachments || []
        });
        setIsGenerating(true);
      }
    }
  };

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
    <SidebarProvider>
      <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 relative flex flex-col bg-background border-none!">
          <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Intelligence</span>
              <span className="text-xs font-medium">Research Hub</span>
              {project && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="text-xs font-medium text-primary">{project.name}</span>
                </>
              )}
            </div>
          </header>

          <div className="flex-1 relative bg-background overflow-hidden flex flex-col">
            {!selectedProjectId ? (
              <div className="p-8 max-w-4xl mx-auto w-full">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold mb-2">Select a Product for Research</h1>
                  <p className="text-muted-foreground text-sm">Choose a design to start analyzing and researching</p>
                </div>
                
                {projects === undefined ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-2xl">
                    <Search className="size-12 text-muted-foreground/20 mb-4" />
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
                        <h3 className="font-semibold group-hover:text-primary transition-colors">{p.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 capitalize">{p.status || 'draft'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex-1 relative overflow-hidden">
                  <ResearchChat 
                    projectId={selectedProjectId as any}
                    onSendToCanvas={() => {}} // No canvas here in the new view?
                    onGenerateBlueprint={() => {}}
                    pendingMessage={currentPrompt || undefined}
                    isGenerating={isGenerating}
                    onGenerationComplete={handleGenerationComplete}
                    onProcessingStart={() => setIsGenerating(true)}
                    onMessageConsumed={() => setCurrentPrompt(null)}
                    projectContext={{
                      projectName: project?.slug || '', // Use slug here as ResearchChat expects slug for projectData query
                      workshopName: resolvedParams.workshopSlug,
                      status: project?.status,
                    }}
                  />
                </div>
                <div className="p-6 border-t border-border bg-background">
                  <div className="max-w-2xl mx-auto w-full">
                    <PromptInterface 
                      projectId={selectedProjectId as any}
                      userId={session?.user?.id}
                      onGenerate={(payload) => {
                        setCurrentPrompt(payload);
                      }} 
                      isGenerating={isGenerating} 
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
