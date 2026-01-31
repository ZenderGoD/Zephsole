'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useWorkshop } from '@/hooks/use-workshop';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Sparkles, ArrowRight, Loader2, X, Plus, Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { MediaAttachment } from '@/lib/types';
import { H1, P } from '@/components/ui/typography';

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(',');
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function GenShoesPage({ params }: { params: Promise<{ workshopSlug: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { activeWorkshopId } = useWorkshop();
  
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createProjectMutation = useMutation(api.projects.createProject);

  const canSubmit = useMemo(
    () => prompt.trim().length > 0 && !isCreating && !isUploading,
    [prompt, isCreating, isUploading],
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (PNG, JPG, etc.).');
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        const base64 = await fileToBase64(file);
        
        setAttachments((prev) => [
          ...prev,
          {
            objectKey: '', // Will be set when uploaded
            url: URL.createObjectURL(file),
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            base64,
          },
        ]);
      } catch (err) {
        console.error('Image upload failed', err);
        setError(`Image upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !activeWorkshopId || !session?.user.id) return;

    setIsCreating(true);
    try {
      if (prompt.trim() || attachments.length > 0) {
        sessionStorage.setItem('pendingPrompt', JSON.stringify({
          text: prompt.trim(),
          attachments: attachments.map(a => ({
            fileName: a.fileName,
            contentType: a.contentType,
            size: a.size,
            base64: a.base64,
            url: a.url,
          })),
        }));
      }

      const result = await createProjectMutation({
        name: prompt.trim().slice(0, 30) || 'New Design',
        workshopId: activeWorkshopId,
        userId: session.user.id
      });
      const slug = typeof result === 'string' ? result : result.slug;

      router.push(`/${resolvedParams.workshopSlug}/threads/${slug}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      setError('Failed to create project. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 relative flex flex-col bg-background border-none!">
          <div className="flex-1 relative bg-background overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="h-full flex items-center justify-center p-6"
            >
              <div className="w-full max-w-2xl">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="text-center mb-12"
                >
                  <div className="flex justify-center mb-6">
                    <div className="size-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.1)]">
                      <Footprints size={32} />
                    </div>
                  </div>
                  <H1 className="text-4xl font-light tracking-tighter mb-4">
                    GenShoes
                  </H1>
                  <P className="text-muted-foreground text-sm">
                    Design your next footwear masterpiece with AI-powered creative intelligence
                  </P>
                </motion.div>

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="bg-background/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-2 shadow-2xl ring-1 ring-white/5 overflow-hidden"
                >
                  <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="pl-4 text-primary animate-pulse">
                        <Sparkles size={20} />
                      </div>
                      <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the shoe you want to create..."
                        className="flex-1 bg-transparent border-none outline-none py-4 text-sm placeholder:text-muted-foreground/40 focus:ring-0 text-foreground font-medium"
                        disabled={isCreating || isUploading}
                        autoFocus
                      />

                      <div className="flex items-center gap-2 pr-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(file);
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading || isCreating}
                          className={cn(
                            "h-11 w-11 rounded-2xl flex items-center justify-center transition-all duration-300 border",
                            isUploading || isCreating
                              ? "bg-muted/50 text-muted-foreground border-border/50 cursor-not-allowed"
                              : "bg-muted/80 text-foreground border-border hover:bg-accent hover:border-primary/30 active:scale-95"
                          )}
                        >
                          {isUploading ? <Loader2 size={18} className="animate-spin text-primary" /> : <Plus size={18} className="text-muted-foreground" />}
                        </button>

                        <button
                          type="submit"
                          disabled={!canSubmit}
                          className={cn(
                            "h-11 px-6 rounded-2xl flex items-center gap-3 text-xs font-bold uppercase tracking-widest transition-all duration-300",
                            canSubmit
                              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_8px_30px_rgb(var(--primary),0.3)] hover:-translate-y-0.5 active:translate-y-0"
                              : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                          )}
                        >
                          <span>Generate</span>
                          {isCreating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        </button>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-2 border-t border-white/5">
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="relative group"
                          >
                            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 bg-muted/50 shadow-xl">
                              <img
                                src={attachment.base64 ? `data:${attachment.contentType};base64,${attachment.base64}` : attachment.url}
                                alt={attachment.fileName}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAttachments((prev) =>
                                      prev.filter((item) => item.id !== attachment.id)
                                    )
                                  }
                                  className="bg-destructive text-destructive-foreground rounded-full p-2"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {error && (
                      <div className="px-4 pb-3 flex items-center gap-2 text-xs text-red-400">
                        {error}
                      </div>
                    )}
                  </form>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
