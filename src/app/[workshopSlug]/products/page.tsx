"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { SidebarInset } from "@/components/ui/sidebar";
import { LayoutGrid, Plus, Loader2, Upload, Pencil, Trash2, Check, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";

export default function ProductsPage() {
  const params = useParams();
  const workshopSlug = params.workshopSlug as string;
  const router = useRouter();
  
  const workshop = useQuery(api.workshops.getWorkshopBySlug, { slug: workshopSlug });
  const workshopId = workshop?._id;
  
  const allProjects = useQuery(api.projects.getProjects, workshopId ? { workshopId } : "skip");
  const projects = allProjects?.filter(p => p.status === "complete");
  const createProject = useMutation(api.projects.createProject);
  const deleteProject = useMutation(api.projects.deleteProject);
  const convertToProduct = useMutation(api.projects.convertToProduct);
  const renameProject = useMutation(api.projects.renameProject);
  const getUploadUrl = useAction(api.mediaUploads.getUploadUrl);
  const analyzeProduct = useAction(api.productAgent.analyzeProduct);

  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState<Id<"projects"> | null>(null);
  const [editName, setEditName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !workshopId) return;

    setIsUploading(true);
    const toastId = toast.loading("Uploading and analyzing product...");

    try {
      // 1. Create a placeholder project
      const result = await createProject({
        name: "Analyzing Product...",
        workshopId,
      });
      const projectId = typeof result === "string" ? result : result.id;

      // 2. Get upload URL
      const { uploadUrl, publicUrl } = await getUploadUrl({
        projectId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });

      // 3. Upload to R2
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) throw new Error("Upload failed");

      // 4. Analyze with Product Agent
      toast.loading("Product Agent is analyzing...", { id: toastId });
      const analysis = await analyzeProduct({ imageUrl: publicUrl });

      // 5. Finalize as product
      await convertToProduct({
        id: projectId,
        name: analysis.name,
        description: analysis.description,
        imageUrl: publicUrl,
      });

      toast.success("Product added successfully!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload product", { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <SidebarInset className="flex-1 relative flex flex-col bg-neutral-950 border-none!">
          <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-neutral-950/50 backdrop-blur-sm z-20">
            <div className="flex items-center gap-4">
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Workspace</span>
              <span className="text-xs font-medium">{workshop?.name || 'Loading...'}</span>
              <span className="text-neutral-700">/</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-mono">Inventory</span>
              <span className="text-xs font-medium">Stored Products</span>
            </div>

            <div className="flex items-center gap-3">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                accept="image/*"
              />
              <Button 
                onClick={startUpload}
                disabled={isUploading}
                variant="outline"
                size="sm"
                className="bg-white/5 border-white/10 hover:bg-white/10 text-[10px] uppercase tracking-widest font-bold"
              >
                {isUploading ? <Loader2 className="size-3 animate-spin mr-2" /> : <Upload className="size-3 mr-2" />}
                Upload Product
              </Button>
            </div>
          </header>

          <ScrollArea className="flex-1" data-lenis-prevent>
            <div className="p-8 max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-white mb-2">Products</h1>
                  <p className="text-neutral-500 text-sm">Review and manage your generated shoe designs</p>
                </div>
              </div>

              {projects === undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-64 rounded-xl border border-white/10" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
                  <LayoutGrid className="size-12 text-neutral-700 mb-4" />
                  <h3 className="text-lg font-medium text-neutral-400">No products yet</h3>
                  <p className="text-neutral-600 text-sm mb-6 text-center max-w-xs">
                    Start by generating a shoe design in the GenShoes page or upload one here.
                  </p>
                  <Button onClick={startUpload} variant="secondary">Upload First Product</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {projects.map((project) => (
                    <div
                      key={project._id}
                      className="group relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all flex flex-col"
                    >
                      {/* Product Image */}
                      <div className="aspect-square relative bg-neutral-900 overflow-hidden">
                        {project.imageUrl ? (
                          <Image
                            src={project.imageUrl} 
                            alt={project.name} 
                            fill
                            unoptimized
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Plus className="size-8 text-white/10" />
                          </div>
                        )}
                        <div className="absolute top-3 left-3">
                           <div className="px-2 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[8px] uppercase tracking-widest font-bold text-white">
                            {project.status === "complete" ? "Product" : "Draft"}
                          </div>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex items-start justify-between mb-2">
                          {editingId === project._id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input 
                                autoFocus
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-white/10 border-none rounded px-2 py-1 text-sm w-full focus:ring-1 focus:ring-primary outline-none"
                              />
                              <button onClick={() => {
                                renameProject({ id: project._id, name: editName });
                                setEditingId(null);
                              }} className="text-emerald-500 p-1 hover:bg-white/5 rounded">
                                <Check className="size-4" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="text-red-500 p-1 hover:bg-white/5 rounded">
                                <X className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <h3 className="text-white font-semibold text-base truncate pr-2">{project.name}</h3>
                              <button 
                                onClick={() => {
                                  setEditingId(project._id);
                                  setEditName(project.name);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-white/5 rounded"
                              >
                                <Pencil className="size-3 text-neutral-500" />
                              </button>
                            </>
                          )}
                        </div>
                        
                        <p className="text-neutral-500 text-xs line-clamp-2 mb-4 flex-1 italic">
                          {project.description || "No description available."}
                        </p>

                        <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                           <div className="flex items-center gap-2">
                            <button 
                              onClick={() => router.push(`/${workshopSlug}/threads/${project.slug}`)}
                              className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 hover:text-white transition-colors"
                            >
                              Open Design
                            </button>
                          </div>
                          <button 
                            onClick={() => {
                              if (confirm("Delete this product?")) deleteProject({ id: project._id });
                            }}
                            className="text-neutral-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
    </SidebarInset>
  );
}
