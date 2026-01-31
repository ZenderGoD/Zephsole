'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { Sparkles, ArrowRight, Image, Loader2, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaAttachment, PromptPayload } from '@/lib/types';

interface PromptInterfaceProps {
  onGenerate: (payload: PromptPayload) => void;
  isGenerating: boolean;
  projectId?: Id<'projects'>;
  userId?: string;
}

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

export function PromptInterface({ onGenerate, isGenerating, projectId, userId }: PromptInterfaceProps) {
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrl = useAction(api.mediaUploads.getUploadUrl);
  const saveMediaRecord = useMutation(api.media.saveMediaRecord);

  const canSubmit = useMemo(
    () => prompt.trim().length > 0 && !isGenerating && !isUploading,
    [prompt, isGenerating, isUploading],
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!projectId) {
        setError('Select a project before uploading images.');
        return;
      }

      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (PNG, JPG, etc.).');
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        const base64 = await fileToBase64(file);
        const { uploadUrl, objectKey, publicUrl } = await getUploadUrl({
          projectId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        });

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error('Upload failed');
        }

        const mediaId = await saveMediaRecord({
          projectId,
          objectKey,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          uploadedBy: userId,
        });

        setAttachments((prev) => [
          ...prev,
          {
            id: mediaId as Id<'media'>,
            objectKey,
            url: publicUrl,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            base64,
          },
        ]);
      } catch (err) {
        console.error('Image upload failed', err);
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          setError('Network error: Failed to connect to storage. Please ensure CORS is configured on your R2 bucket.');
        } else {
          setError(`Image upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [getUploadUrl, projectId, saveMediaRecord, userId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const payload: PromptPayload = {
      text: prompt.trim(),
      attachments,
    };

    setPrompt('');
    setAttachments([]);
    onGenerate(payload);
  };

  return (
    <div className="bg-background/40 backdrop-blur-3xl border border-white/10 rounded-3xl p-2 shadow-2xl ring-1 ring-white/5 overflow-hidden">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="pl-4 text-primary animate-pulse">
            <Sparkles size={20} />
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Upload a shoe, ask for schematics..."
            className="flex-1 bg-transparent border-none outline-none py-4 text-sm placeholder:text-muted-foreground/40 focus:ring-0 text-foreground font-medium"
            disabled={isGenerating || isUploading}
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
              disabled={isUploading || isGenerating}
              className={cn(
                "h-11 w-11 rounded-2xl flex items-center justify-center transition-all duration-300 border",
                isUploading || isGenerating
                  ? "bg-muted/50 text-muted-foreground border-border/50 cursor-not-allowed"
                  : "bg-muted/80 text-foreground border-border hover:bg-accent hover:border-primary/30 hover:shadow-[0_0_15px_rgba(var(--primary),0.1)] active:scale-95"
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
              <span className="hidden sm:inline">{isGenerating ? 'Generating' : 'Generate'}</span>
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            </button>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-2 border-t border-white/5">
            {attachments.map((attachment) => (
              <div
                key={attachment.objectKey}
                className="relative group animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/10 bg-muted/50 shadow-xl group-hover:border-primary/50 transition-all duration-300">
                  <img
                    src={attachment.base64 ? `data:${attachment.contentType};base64,${attachment.base64}` : attachment.url}
                    alt={attachment.fileName}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter((item) => item.objectKey !== attachment.objectKey)
                        )
                      }
                      className="bg-destructive text-destructive-foreground rounded-full p-2 transform scale-75 group-hover:scale-100 transition-all duration-300 hover:bg-destructive/90 shadow-lg"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-background/80 backdrop-blur-md border border-white/10 rounded-lg px-2 py-0.5 shadow-lg flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Image size={10} className="text-primary" />
                  <span className="text-[8px] font-mono text-muted-foreground truncate max-w-[60px]">
                    {attachment.fileName.split('.').pop()?.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="px-4 pb-3 flex items-center gap-2 text-xs text-red-400 animate-in fade-in slide-in-from-top-1">
            <div className="w-1 h-1 rounded-full bg-red-400" />
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
