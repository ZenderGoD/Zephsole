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
    <div className="bg-neutral-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl p-1.5 shadow-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="pl-4 text-neutral-500">
            <Sparkles size={18} />
          </div>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Search trends, generate concepts, or analyze materials..."
            className="flex-1 bg-transparent border-none outline-none py-3 text-sm placeholder:text-neutral-600 focus:ring-0"
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
                "h-10 px-3 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all border border-white/10",
                isUploading || isGenerating
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-neutral-900 text-neutral-200 hover:bg-white/5"
              )}
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              <Image size={14} />
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "h-10 px-6 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-all",
                canSubmit
                  ? "bg-white text-black hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              )}
            >
              {isGenerating ? 'Generating' : 'Generate'}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-1 border-t border-white/5">
            {attachments.map((attachment) => (
              <div
                key={attachment.objectKey}
                className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 bg-neutral-800 shadow-lg group animate-in fade-in zoom-in duration-200"
              >
                <img
                  src={attachment.base64 ? `data:${attachment.contentType};base64,${attachment.base64}` : attachment.url}
                  alt={attachment.fileName}
                  className="w-full h-full object-cover transition-transform group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((prev) =>
                      prev.filter((item) => item.objectKey !== attachment.objectKey)
                    )
                  }
                  className="absolute top-1 right-1 bg-black/60 backdrop-blur-md rounded-full p-1 hover:bg-red-500 transition-colors z-10"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[8px] truncate text-neutral-300 pointer-events-none">
                  {attachment.fileName}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="px-4 pb-2 text-xs text-red-400">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
