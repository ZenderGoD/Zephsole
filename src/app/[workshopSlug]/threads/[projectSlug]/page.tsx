'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { GenerationCanvas } from '@/components/studio/canvas';
import { ResearchChat } from '@/components/studio/research-chat';
import { PromptInterface } from '@/components/studio/prompt';
import { cn } from '@/lib/utils';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useWorkshop } from '@/hooks/use-workshop';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { GenMode, PromptPayload, SendToCanvasArgs, RequestTechnicalBlueprintArgs } from '@/lib/types';
import { Id } from '../../../../../convex/_generated/dataModel';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProjectPage({ params }: { params: Promise<{ workshopSlug: string, projectSlug: string }> }) {
  const resolvedParams = use(params);
  console.log('Resolved Params:', resolvedParams);

  const [mode] = useState<GenMode>('research');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<PromptPayload | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);

  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { setActiveWorkshopId, workshops } = useWorkshop();

  useEffect(() => {
    const handleSwitchMode = (e: Event) => {
      const detail = (e as CustomEvent<'research' | 'studio'>).detail;
      if (detail === 'studio') {
        setShowCanvas(true);
      }
    };
    window.addEventListener('switch-workspace-mode', handleSwitchMode);
    return () => window.removeEventListener('switch-workspace-mode', handleSwitchMode);
  }, []);

  const project = useQuery(api.projects.getProjectBySlug, 
    !isPending && session && resolvedParams.workshopSlug && resolvedParams.projectSlug 
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
  const renameProject = useMutation(api.projects.renameProject).withOptimisticUpdate(
    (localStore, args) => {
      const currentProject = localStore.getQuery(api.projects.getProjectBySlug, {
        workshopSlug: resolvedParams.workshopSlug,
        projectSlug: resolvedParams.projectSlug,
      });
      if (currentProject !== undefined && currentProject !== null) {
        localStore.setQuery(
          api.projects.getProjectBySlug,
          {
            workshopSlug: resolvedParams.workshopSlug,
            projectSlug: resolvedParams.projectSlug,
          },
          {
            ...currentProject,
            name: args.name,
            lastUpdated: Date.now(),
            messageQueue: currentProject.messageQueue || [],
            threadStatus: currentProject.threadStatus || "idle",
          }
        );
      }
    }
  );
  const dequeueMessage = useMutation(api.projects.dequeueMessage);

  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState("");

  const handleStartRename = () => {
    if (!project) return;
    setEditName(project.name);
    setIsRenaming(true);
  };

  const handleHeaderRename = async () => {
    if (!projectId || !editName.trim()) return;
    await renameProject({ id: projectId, name: editName.trim() });
    setIsRenaming(false);
  };

  const handleGenerationComplete = async () => {
    setIsGenerating(false);
    setCurrentPrompt(null);

    // Process next item in queue if available
    if (projectId) {
      const nextItem = await dequeueMessage({ projectId });
      if (nextItem) {
        setCurrentPrompt({
          text: nextItem.prompt,
          attachments: nextItem.attachments || []
        });
        setIsGenerating(true);
      }
    }
  };

  const handleSendToCanvas = async (data: SendToCanvasArgs) => {
    if (!projectId) return;

    await addCanvasItem({
      projectId,
      type: data?.type || 'research-card',
      data,
      x: Math.random() * 400 - 200,
      y: Math.random() * 400 - 200
    });
    
    setShowCanvas(true);
  };

  const handleGenerateBlueprint = async (data: RequestTechnicalBlueprintArgs) => {
    const legacyImageUrl = (data as { imageUrl?: string }).imageUrl;
    const imageUrl =
      data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls[0] : legacyImageUrl || '';
    if (!projectId) return;

    setIsGenerating(true);
    
    // Simulate generation delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    await addCanvasItem({
      projectId,
      type: 'technical-blueprint',
      data: {
        imageUrl,
        productName: data.productName,
        timestamp: Date.now(),
        schematics: [
          { type: 'Orthographic View', url: imageUrl, description: 'Main product view showing proportions and primary surfaces.' },
          { type: 'Exploded View', url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=800', description: 'Internal assembly and layering of materials.' },
          { type: 'Material Map', url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&q=80&w=800', description: 'Zonal material distribution and finish specs.' },
          { type: 'Tread Pattern', url: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&fit=crop&q=80&w=800', description: 'Grip geometry and compound density map.' },
        ],
        bom: [
          { part: 'Vamp Panel', material: 'Premium Leather', qty: 2, cost: 4.50 },
          { part: 'Midsole', material: 'Proprietary EVA', qty: 2, cost: 3.20 },
          { part: 'Outsole', material: 'High-Abrasion Rubber', qty: 2, cost: 2.80 },
          { part: 'Eyelet Stay', material: 'TPU Reinforcement', qty: 4, cost: 0.90 },
        ],
        specs: {
          tolerances: '±0.5mm',
          stitching: '12 SPI Double Needle',
          finish: 'Matte / Low Lustre',
          weight: '340g (Size 9)',
        }
      },
      x: 0,
      y: 0,
      scale: 1.5
    });

    setIsGenerating(false);
    setShowCanvas(true);
  };

  const handleItemMove = async (id: Id<"canvasItems"> | string, x: number, y: number) => {
    // Type guard: only call mutation if id is a valid Id type
    if (typeof id === 'string' && !id.includes('__tableName')) {
      // Skip if it's a plain string (not a Convex Id)
      return;
    }
    await updateCanvasItemPosition({ id: id as Id<"canvasItems">, x, y });
  };

  const activeWorkshop = workshops?.find(w => w.slug === resolvedParams.workshopSlug);

  useEffect(() => {
    if (activeWorkshop && activeWorkshop._id) {
      setActiveWorkshopId(activeWorkshop._id);
    }
  }, [activeWorkshop, setActiveWorkshopId]);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/auth?mode=signin');
    }
  }, [session, isPending, router]);

  // Auto-send prompt from research page if available
  useEffect(() => {
    if (projectId && !currentPrompt && !isGenerating) {
      const storedPrompt = sessionStorage.getItem('pendingPrompt');
      if (storedPrompt) {
        try {
          const promptData = JSON.parse(storedPrompt) as { text?: string; attachments?: Array<{ id?: string; objectKey?: string; url?: string; fileName?: string; contentType?: string; size?: number; base64?: string }> };
          const payload: PromptPayload = {
            text: promptData.text || '',
            attachments: promptData.attachments?.map((a) => ({
              // id is optional in MediaAttachment, omit if not a valid Convex Id
              ...(a.id && typeof a.id === 'object' && '__tableName' in a.id ? { id: a.id as Id<"media"> } : {}),
              objectKey: a.objectKey || '',
              url: a.url || '',
              fileName: a.fileName || '',
              contentType: a.contentType || '',
              size: a.size || 0,
              base64: a.base64,
            })) || [],
          };
          
          // Defer state updates to avoid cascading renders
          setTimeout(() => {
            setCurrentPrompt(payload);
            setIsGenerating(true);
          }, 0);
          sessionStorage.removeItem('pendingPrompt');
        } catch (err) {
          console.error('Failed to parse stored prompt:', err);
          sessionStorage.removeItem('pendingPrompt');
        }
      }
    }
  }, [projectId, currentPrompt, isGenerating]);

  if (isPending || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
          Initializing Studio...
        </div>
      </div>
    );
  }

  if (project === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-pulse font-mono text-xs tracking-[0.3em] uppercase">
          Loading Project...
        </div>
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground gap-4">
        <div className="font-mono text-xs tracking-[0.3em] uppercase text-muted-foreground">
          Project Not Found
        </div>
        <button 
          onClick={() => router.push('/studio')}
          className="text-[10px] uppercase tracking-[0.2em] px-4 py-2 border border-border rounded-full hover:bg-foreground hover:text-background transition-all"
        >
          Return to Studio
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans w-full">
        <SidebarInset className="flex-1 relative flex flex-col bg-background border-none!">
          {/* Top bar info */}
          <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="mr-1" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Workshop</span>
              <span className="text-xs font-medium">{activeWorkshop?.name || 'Loading...'}</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Project</span>
              {isRenaming ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleHeaderRename();
                    if (e.key === 'Escape') setIsRenaming(false);
                  }}
                  onBlur={handleHeaderRename}
                  className="bg-transparent border-b border-primary text-xs font-medium focus:outline-none px-1 py-0.5"
                />
              ) : (
                <span 
                  className="text-xs font-medium cursor-pointer hover:text-primary transition-colors"
                  onClick={handleStartRename}
                >
                  {project.name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCanvas((prev) => !prev)}
                className={cn(
                  "h-8 w-8 transition-colors",
                  showCanvas ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {showCanvas ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </Button>
              <div className={cn(
                "w-2 h-2 rounded-full",
                isGenerating ? "bg-orange-500 animate-pulse" : "bg-emerald-500"
              )} />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mr-2">
                {isGenerating ? 'AI Generating...' : 'System Ready'}
              </span>
            </div>
          </header>

          {/* Research + toggleable canvas */}
          <div className="flex-1 relative bg-background overflow-hidden">
            {showCanvas ? (
              <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                <ResizablePanel defaultSize={54} minSize={35}>
                  <div className="relative h-full overflow-hidden">
                    <ResearchChat 
                      key={project?._id} // Force remount when project changes
                      onSendToCanvas={handleSendToCanvas}
                      onGenerateBlueprint={handleGenerateBlueprint}
                      pendingMessage={currentPrompt || undefined}
                      isGenerating={isGenerating}
                      onGenerationComplete={handleGenerationComplete}
                      onProcessingStart={() => setIsGenerating(true)}
                      onMessageConsumed={() => setCurrentPrompt(null)}
                      projectId={project?._id}
                      projectContext={{
                        projectName: resolvedParams.projectSlug,
                        workshopName: resolvedParams.workshopSlug,
                        status: project?.status,
                      }}
                    />
                    {/* Prompt Overlay - fixed in chat area */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-30 pointer-events-none">
                      <div className="pointer-events-auto">
                        <PromptInterface 
                          projectId={project?._id}
                          userId={session?.user?.id}
                          onGenerate={(payload) => {
                            setCurrentPrompt(payload);
                          }} 
                          isGenerating={false} 
                        />
                      </div>
                    </div>
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={46} minSize={30}>
                  <div className="relative h-full overflow-hidden">
                    <GenerationCanvas 
                      mode={mode} 
                      isGenerating={isGenerating} 
                      items={canvasItems}
                      onItemMove={handleItemMove}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="relative h-full overflow-hidden">
                <ResearchChat 
                  key={project?._id}
                  onSendToCanvas={handleSendToCanvas}
                  onGenerateBlueprint={handleGenerateBlueprint}
                  pendingMessage={currentPrompt || undefined}
                  isGenerating={isGenerating}
                  onGenerationComplete={handleGenerationComplete}
                  onProcessingStart={() => setIsGenerating(true)}
                  onMessageConsumed={() => setCurrentPrompt(null)}
                  projectId={project?._id}
                  projectContext={{
                    projectName: resolvedParams.projectSlug,
                    workshopName: resolvedParams.workshopSlug,
                    status: project?.status,
                  }}
                />
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-30 pointer-events-none">
                  <div className="pointer-events-auto">
                    <PromptInterface 
                      projectId={project?._id}
                      userId={session?.user?.id}
                      onGenerate={(payload) => {
                        setCurrentPrompt(payload);
                      }} 
                      isGenerating={false} 
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </SidebarInset>
    </div>
  );
}
