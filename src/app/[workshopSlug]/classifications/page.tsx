"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useWorkshop } from "@/hooks/use-workshop";
import { Folder, Plus, MoreHorizontal, Pencil, Trash2, FolderPlus, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useParams, useRouter } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H1, H3, P, Muted } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ClassificationsPage() {
  const params = useParams();
  const workshopSlug = params.workshopSlug as string;
  const router = useRouter();
  
  const { activeWorkshopId } = useWorkshop();
  const workshop = useQuery(api.workshops.getWorkshopBySlug, { slug: workshopSlug });
  const workshopId = workshop?._id || activeWorkshopId;
  
  const classifications = useQuery(api.projects.getClassifications, workshopId ? { workshopId } : "skip");
  const createClassification = useMutation(api.projects.createClassification);
  const renameClassification = useMutation(api.projects.renameClassification);
  const deleteClassification = useMutation(api.projects.deleteClassification);
  const projects = useQuery(api.projects.getProjects, workshopId ? { workshopId } : "skip");

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameFolderId, setRenameFolderId] = useState<Id<"classifications"> | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState<Id<"classifications"> | null>(null);
  const [deleteFolderName, setDeleteFolderName] = useState("");

  useEffect(() => {
    console.log("ClassificationsPage - workshopId:", workshopId, "workshop:", workshop, "activeWorkshopId:", activeWorkshopId);
  }, [workshopId, workshop, activeWorkshopId]);

  const handleCreateClick = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    
    if (!workshopId) {
      console.error("No workshop ID found. Workshop:", workshop, "Active ID:", activeWorkshopId, "Slug:", workshopSlug);
      return;
    }
    
    setCreateFolderName("");
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!workshopId || !createFolderName.trim()) return;
    
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#22d3ee', '#818cf8', '#c084fc'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    try {
      await createClassification({
        workshopId,
        name: createFolderName.trim(),
        color: randomColor
      });
      setCreateDialogOpen(false);
      setCreateFolderName("");
    } catch (error) {
      console.error("Failed to create classification:", error);
    }
  };

  const handleRenameClick = (id: Id<"classifications">, currentName: string) => {
    setRenameFolderId(id);
    setRenameFolderName(currentName);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = () => {
    if (!renameFolderId || !renameFolderName.trim() || renameFolderName.trim() === classifications?.find(c => c._id === renameFolderId)?.name) {
      return;
    }
    renameClassification({ id: renameFolderId, name: renameFolderName.trim() });
    setRenameDialogOpen(false);
    setRenameFolderId(null);
    setRenameFolderName("");
  };

  const handleDeleteClick = (id: Id<"classifications">, name: string) => {
    setDeleteFolderId(id);
    setDeleteFolderName(name);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSubmit = () => {
    if (!deleteFolderId) return;
    deleteClassification({ id: deleteFolderId });
    setDeleteDialogOpen(false);
    setDeleteFolderId(null);
    setDeleteFolderName("");
  };

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
              <span className="text-xs font-medium">Classifications</span>
            </div>
          </header>

          <ScrollArea className="flex-1" data-lenis-prevent>
            <div className="p-8 max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <H1 className="text-white mb-2">Classifications</H1>
                  <P className="text-neutral-500 text-sm">Organize and manage your projects by classification</P>
                </div>
                <button 
                  type="button"
                  onClick={handleCreateClick}
                  disabled={!workshopId}
                  className={cn(
                    "flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-bold hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    !workshopId && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <FolderPlus className="size-4" />
                  New Folder
                </button>
              </div>

              {classifications === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-xl border border-white/10" />
                  ))}
                </div>
              ) : classifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
                  <Folder className="size-12 text-neutral-700 mb-4" />
                  <H3 className="text-lg font-medium text-neutral-400">No folders created yet</H3>
                  <P className="text-neutral-600 text-sm mb-6 text-center max-w-xs">
                    Create your first classification folder to start organizing your creative work.
                  </P>
                  <button 
                    type="button"
                    onClick={handleCreateClick}
                    disabled={!workshopId}
                    className={cn(
                      "text-white hover:text-neutral-300 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
                      !workshopId && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Plus className="size-4" />
                    Create your first folder
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {classifications.map((folder) => {
                    const folderProjects = projects?.filter(p => p.classificationId === folder._id) || [];
                    
                    return (
                      <div 
                        key={folder._id}
                        className="group relative bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all cursor-pointer"
                        onClick={() => {
                          // For now just stay on board, maybe later drill down
                        }}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-3 rounded-lg bg-black/40" style={{ color: folder.color }}>
                            <Folder className="size-6 fill-current opacity-20" />
                            <Folder className="size-6 absolute" />
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger className="p-1 hover:bg-white/10 rounded-md transition-colors text-neutral-500">
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-neutral-900 border-white/10 text-white">
                              <DropdownMenuItem 
                                onSelect={() => handleRenameClick(folder._id, folder.name)}
                                className="flex items-center gap-2 text-xs"
                              >
                                <Pencil className="size-3" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onSelect={() => handleDeleteClick(folder._id, folder.name)}
                                className="flex items-center gap-2 text-xs text-red-500"
                              >
                                <Trash2 className="size-3" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        
                        <div>
                          <H3 className="text-white font-semibold text-lg mb-1">{folder.name}</H3>
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {folderProjects.slice(0, 3).map((p, i) => (
                                <div 
                                  key={p._id} 
                                  className="size-5 rounded-full bg-neutral-800 border-2 border-black flex items-center justify-center text-[8px] font-bold text-neutral-400"
                                >
                                  {p.name.charAt(0)}
                                </div>
                              ))}
                            </div>
                            <span className="text-neutral-500 text-xs">
                              {folderProjects.length} {folderProjects.length === 1 ? 'project' : 'projects'}
                            </span>
                          </div>
                        </div>

                        <div 
                          className="absolute bottom-5 right-5 size-8 rounded-full bg-white text-black items-center justify-center flex opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg"
                        >
                          <Plus className="size-4" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>

      {/* Create Folder Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for your new classification folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={createFolderName}
              onChange={(e) => setCreateFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-black border-white/10 text-white"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCreateDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={!createFolderName.trim()}
              className="bg-white text-black hover:bg-neutral-200"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-black border-white/10 text-white"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRenameSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameSubmit}
              disabled={!renameFolderName.trim() || renameFolderName.trim() === classifications?.find(c => c._id === renameFolderId)?.name}
              className="bg-white text-black hover:bg-neutral-200"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteFolderName}&quot;? Projects inside will be unclassified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteSubmit}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
