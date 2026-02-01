'use client';

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Loader2, Maximize2, Play, Box } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function ShowcasePage() {
  const publicMedia = useQuery(api.studio.getAllPublicMedia);
  const siteAssets = useQuery(api.siteAssets.listAssets, { type: 'showcase' });
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const combinedMedia = [
    ...(siteAssets || []).map(asset => ({
      id: asset._id,
      url: asset.url,
      type: 'image',
      title: asset.fileName,
      createdAt: asset.createdAt,
    })),
    ...(publicMedia || [])
  ];

  if (publicMedia === undefined || siteAssets === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] animate-pulse">Scanning Neural Archives...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-32 pb-20 px-6">
      <div className="max-w-7xl mx-auto mb-16 text-center">
        <h1 className="text-5xl font-bold tracking-tighter mb-4 uppercase">Neural Showcase</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto font-mono text-xs uppercase tracking-widest">
          A collective feed of synthesized footwear intelligence, 3D prototypes, and material studies.
        </p>
      </div>

      {combinedMedia.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-40 border border-dashed border-border rounded-[3rem] bg-muted/20">
          <Box size={48} className="text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-mono text-xs">NO ASSETS DETECTED IN ARCHIVE</p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6 mx-auto">
          {combinedMedia.map((item: any, idx: number) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative break-inside-avoid group cursor-pointer"
              onClick={() => setSelectedItem(item)}
            >
              <div className="relative rounded-3xl overflow-hidden border border-border bg-muted/30 transition-all duration-500 group-hover:border-primary/50 group-hover:shadow-[0_0_40px_rgba(var(--primary),0.1)]">
                {item.type === 'video' ? (
                  <div className="relative aspect-square bg-black flex items-center justify-center">
                    <video 
                      src={item.url} 
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      muted
                      loop
                      onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                      onMouseOut={(e) => (e.target as HTMLVideoElement).pause()}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Play size={20} className="text-white fill-white ml-1" />
                      </div>
                    </div>
                  </div>
                ) : item.type === '3d' ? (
                  <div className="aspect-square bg-neutral-900 flex flex-col items-center justify-center gap-4 group-hover:bg-neutral-800 transition-colors">
                    <Box size={48} className="text-primary animate-pulse" />
                    <span className="text-[10px] font-mono text-muted-foreground tracking-widest">3D ASSET</span>
                  </div>
                ) : (
                  <img 
                    src={item.url} 
                    alt={item.title} 
                    className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">{item.type}</p>
                      <p className="text-xs text-white font-medium line-clamp-2 leading-tight">{item.title}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                      <Maximize2 size={14} className="text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-4xl p-0 bg-transparent border-none shadow-none flex items-center justify-center">
          {selectedItem && (
            <div className="relative w-full h-full flex items-center justify-center">
              {selectedItem.type === 'video' ? (
                <video src={selectedItem.url} controls autoPlay className="max-h-[85vh] rounded-3xl" />
              ) : selectedItem.type === '3d' ? (
                <div className="w-full aspect-video bg-neutral-900 rounded-3xl flex flex-col items-center justify-center gap-4">
                  <Box size={64} className="text-primary" />
                  <p className="font-mono text-sm text-white">3D Viewer Initializing...</p>
                </div>
              ) : (
                <img src={selectedItem.url} alt={selectedItem.title} className="max-h-[85vh] w-auto object-contain rounded-3xl" />
              )}
              <div className="absolute bottom-[-60px] left-0 right-0 text-center">
                <p className="text-white font-medium">{selectedItem.title}</p>
                <p className="text-white/50 text-[10px] uppercase tracking-widest mt-1">
                  {new Date(selectedItem.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
