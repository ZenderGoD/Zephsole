'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useWorkshop } from '@/hooks/use-workshop';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Layers, LayoutGrid, Image as ImageIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function MarketingPage({ params }: { params: Promise<{ workshopSlug: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { activeWorkshopId } = useWorkshop();
  
  const projects = useQuery(api.projects.getProjects, activeWorkshopId ? { workshopId: activeWorkshopId } : "skip");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const canvasItems = useQuery(api.studio.getCanvasItems, selectedProjectId ? { projectId: selectedProjectId as any } : "skip");
  const project = useQuery(api.projects.getProject, selectedProjectId ? { id: selectedProjectId as any } : "skip");

  const renderItems = canvasItems?.filter(item => item.type === 'render' || item.type === 'research-card');

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
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Creative</span>
              <span className="text-xs font-medium">Marketing Content</span>
              {project && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="text-xs font-medium text-primary">{project.name}</span>
                </>
              )}
            </div>
          </header>

          <div className="flex-1 relative bg-background overflow-hidden flex flex-col p-8">
            {!selectedProjectId ? (
              <div className="max-w-4xl mx-auto w-full">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold mb-2">Select a Product for Marketing</h1>
                  <p className="text-muted-foreground text-sm">Generate and manage marketing renders and visual assets</p>
                </div>
                
                {projects === undefined ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-2xl">
                    <Layers className="size-12 text-muted-foreground/20 mb-4" />
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
              <div className="max-w-6xl mx-auto w-full">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold">{project?.name} Assets</h2>
                    <p className="text-muted-foreground text-sm">Visual library and marketing materials</p>
                  </div>
                  <button 
                    onClick={() => setSelectedProjectId(null)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Change Product
                  </button>
                </div>

                {renderItems && renderItems.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {renderItems.map((item, i) => (
                      <div key={i} className="group relative aspect-square bg-muted rounded-2xl overflow-hidden border border-border hover:border-primary/50 transition-all">
                        <img 
                          src={item.data.imageUrl || item.data.url} 
                          alt="Marketing render" 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                          <p className="text-white text-xs font-medium truncate">{item.data.prompt || 'Generated Render'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-3xl bg-muted/30">
                    <ImageIcon className="size-12 text-muted-foreground/20 mb-4" />
                    <h3 className="text-lg font-medium">No marketing assets yet</h3>
                    <p className="text-muted-foreground text-sm mb-6">Generate renders in the GenShoes or Research pages to see them here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
