'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AppSidebar } from '@/components/app-sidebar';
import { GenerationCanvas } from '@/components/studio/canvas';
import { ResearchChat } from '@/components/studio/research-chat';
import { PromptInterface } from '@/components/studio/prompt';
import { ParameterPanel } from '@/components/studio/parameters';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useWorkshop } from '@/hooks/use-workshop';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { GenMode, WorkspaceMode, PromptPayload } from '@/lib/types';

export default function ProjectPage({ params }: { params: Promise<{ workshopSlug: string, projectSlug: string }> }) {
  const resolvedParams = use(params);
  console.log('Resolved Params:', resolvedParams);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('research');
  const [mode, setMode] = useState<GenMode>('research');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<PromptPayload | null>(null);

  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { setActiveWorkshopId, workshops } = useWorkshop();

  const project = useQuery(api.projects.getProjectBySlug, 
    resolvedParams.workshopSlug && resolvedParams.projectSlug 
      ? {
          workshopSlug: resolvedParams.workshopSlug,
          projectSlug: resolvedParams.projectSlug
        } 
      : "skip"
  );

  const projectId = project?._id;

  const canvasItems = useQuery(api.studio.getCanvasItems, projectId ? { projectId } : "skip");
  const addCanvasItem = useMutation(api.studio.addCanvasItem);
  const updateCanvasItemPosition = useMutation(api.studio.updateCanvasItemPosition);

  const handleSendToCanvas = async (data: any) => {
    if (!projectId) return;

    await addCanvasItem({
      projectId,
      type: data?.type || 'research-card',
      data,
      x: Math.random() * 400 - 200,
      y: Math.random() * 400 - 200
    });
    
    setWorkspaceMode('studio');
  };

  const handleItemMove = async (id: any, x: number, y: number) => {
    await updateCanvasItemPosition({ id, x, y });
  };

  const activeWorkshop = workshops?.find(w => w.slug === resolvedParams.workshopSlug);

  useEffect(() => {
    if (activeWorkshop && activeWorkshop._id) {
      setActiveWorkshopId(activeWorkshop._id);
    }
  }, [activeWorkshop, setActiveWorkshopId]);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  if (isPending || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
          Initializing Studio...
        </div>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
          Loading Project...
        </div>
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <div className="font-mono text-xs tracking-[0.3em] uppercase text-neutral-500">
          Project Not Found
        </div>
        <button 
          onClick={() => router.push('/studio')}
          className="text-[10px] uppercase tracking-[0.2em] px-4 py-2 border border-white/10 rounded-full hover:bg-white hover:text-black transition-all"
        >
          Return to Studio
        </button>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans w-full">
        {/* Studio Sidebar */}
        <AppSidebar />

        {/* Main Studio Area */}
        <SidebarInset className="flex-1 relative flex flex-col bg-neutral-950 border-none!">
          {/* Top bar info */}
          <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-neutral-950/50 backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Workshop</span>
              <span className="text-xs font-medium">{activeWorkshop?.name || 'Loading...'}</span>
              <span className="text-neutral-700">/</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Project</span>
              <span className="text-xs font-medium">{project.name}</span>
            </div>

            {/* Workspace Mode Toggle */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-neutral-900 border border-white/5 rounded-full p-1 shadow-inner">
              <button
                onClick={() => setWorkspaceMode('research')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-[0.2em] transition-all",
                  workspaceMode === 'research' 
                    ? "bg-white text-black shadow-lg" 
                    : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                Research
              </button>
              <button
                onClick={() => setWorkspaceMode('studio')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] uppercase font-bold tracking-[0.2em] transition-all",
                  workspaceMode === 'studio' 
                    ? "bg-white text-black shadow-lg" 
                    : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                Studio
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isGenerating ? "bg-orange-500 animate-pulse" : "bg-emerald-500"
              )} />
              <span className="text-[10px] uppercase tracking-widest text-neutral-400 font-mono">
                {isGenerating ? 'AI Generating...' : 'System Ready'}
              </span>
            </div>
          </header>

          {/* 3D/2D Viewport or Research Chat */}
          <div className="flex-1 relative bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-neutral-900 to-black overflow-hidden">
            {workspaceMode === 'studio' ? (
              <GenerationCanvas 
                mode={mode} 
                isGenerating={isGenerating} 
                items={canvasItems}
                onItemMove={handleItemMove}
              />
            ) : (
              <ResearchChat 
                onSendToCanvas={handleSendToCanvas}
                pendingMessage={currentPrompt || undefined}
                isGenerating={isGenerating}
                onGenerationComplete={() => {
                  setIsGenerating(false);
                  setCurrentPrompt(null);
                }}
                projectId={project?._id}
                projectContext={{
                  projectName: project?.name,
                  workshopName: activeWorkshop?.name,
                  status: project?.status,
                }}
              />
            )}
            
            {/* Prompt Overlay - Fixed at bottom */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-30 pointer-events-none">
              <div className="pointer-events-auto">
                <PromptInterface 
                  projectId={project?._id}
                  userId={session?.user?.id}
                  onGenerate={(payload) => {
                    setCurrentPrompt(payload);
                    setIsGenerating(true);
                  }} 
                  isGenerating={isGenerating} 
                />
              </div>
            </div>
          </div>
        </SidebarInset>

        {/* Parameter Panel */}
        <ParameterPanel mode={mode} projectId={project?._id} />
      </div>
    </SidebarProvider>
  );
}
