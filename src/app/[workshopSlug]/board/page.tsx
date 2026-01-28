"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useWorkshop } from "@/hooks/use-workshop";
import { useParams } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LayoutGrid } from "lucide-react";

export default function BoardPage() {
  const params = useParams();
  const workshopSlug = params.workshopSlug as string;
  
  const { activeWorkshopId } = useWorkshop();
  const workshop = useQuery(api.workshops.getWorkshopBySlug, { slug: workshopSlug });
  const workshopId = workshop?._id || activeWorkshopId;
  
  const projects = useQuery(api.projects.getProjects, workshopId ? { workshopId } : "skip");

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-neutral-950 text-white overflow-hidden font-sans w-full">
        <AppSidebar />
        
        <SidebarInset className="flex-1 relative flex flex-col bg-neutral-950 border-none!">
          <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-neutral-950/50 backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Workspace</span>
              <span className="text-xs font-medium">{workshop?.name || 'Loading...'}</span>
              <span className="text-neutral-700">/</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">View</span>
              <span className="text-xs font-medium">Collective Board</span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8" data-lenis-prevent>
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-2">Collective Board</h1>
                  <p className="text-neutral-500 text-sm">Visual overview of all your projects</p>
                </div>
              </div>

              {projects === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-48 bg-white/5 animate-pulse rounded-xl border border-white/10" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
                  <LayoutGrid className="size-12 text-neutral-700 mb-4" />
                  <h3 className="text-lg font-medium text-neutral-400">No projects yet</h3>
                  <p className="text-neutral-600 text-sm mb-6 text-center max-w-xs">
                    Create your first project to see it on the collective board.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {projects.map((project) => (
                    <div
                      key={project._id}
                      className="group relative bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all cursor-pointer"
                    >
                      <div className="mb-4">
                        <h3 className="text-white font-semibold text-lg mb-2">{project.name}</h3>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <span className="capitalize">{project.status || 'draft'}</span>
                          {project.isPinned && (
                            <span className="text-orange-500">• Pinned</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="size-8 rounded-full bg-white text-black flex items-center justify-center">
                          <LayoutGrid className="size-4" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
