'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage, ChatStatus, TextUIPart, FileUIPart } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { cn } from '@/lib/utils';
import { CREDIT_COSTS } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { User, Bot, Sparkles, Image, Activity, Ruler, Layers, CreditCard, History, Maximize2, Check } from 'lucide-react';
import { PromptPayload, SendToCanvasArgs, RenameProjectArgs, UpdateDesignContextArgs, UpdateBOMArgs, UpdateProductBaselinesArgs, RequestTechnicalBlueprintArgs, AnalyzeFootwearImageArgs, GenerateSoleSpecArgs, GenerateImageArgs, GenerateImageResult, GenerateImageWorkflowResult, MessageAttachment, PersistedMessage, MessageQueueItem } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { authClient } from '@/lib/auth-client';
import { ImageGenerationState } from './image-generation-state';
import { FullscreenImageViewer } from '@/components/ui/fullscreen-image-viewer';

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Use browser's timezone (set via IP or system settings)
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`;
  }
}

interface ResearchChatProps {
  onSendToCanvas: (data: SendToCanvasArgs) => void;
  onGenerateBlueprint?: (data: RequestTechnicalBlueprintArgs) => void;
  pendingMessage?: PromptPayload;
  isGenerating?: boolean;
  onGenerationComplete?: () => void;
  onProcessingStart?: () => void;
  onMessageConsumed?: () => void;
  projectId?: Id<'projects'>;
  projectContext?: {
    projectName?: string;
    workshopName?: string;
    status?: string;
  };
}

interface ImageGenerationResultProps {
  toolCallId: string;
  prompt: string;
  onSendToCanvas: (data: SendToCanvasArgs) => void;
}

function ImageGenerationResult({ toolCallId, prompt, onSendToCanvas }: ImageGenerationResultProps) {
  const autoSendRef = useRef<string | null>(null);
  const [fullscreenImages, setFullscreenImages] = useState<Array<{ url: string; alt?: string }>>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  return (
    <>
      <ImageGenerationState 
        toolCallId={toolCallId}
        onComplete={(url) => {
          if (autoSendRef.current === url) return;
          autoSendRef.current = url;
          
          onSendToCanvas({
            type: 'image',
            imageUrl: url,
            title: 'Research Design Concept',
            content: prompt || 'Generated footwear concept from research session.',
            data: { source: 'research' }
          });
        }}
      >
        {(imageState) => {
        const isCompleted = imageState?.status === 'completed' && (!!imageState?.url || (imageState?.images && imageState.images.length > 0));
        const isError = imageState?.status === 'error';
        const isGenerating = !isCompleted && !isError;
        
        return (
          <div className="mt-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-muted px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-500" />
                <span className="text-[10px] uppercase tracking-widest font-bold">Image Generation</span>
              </div>
              <div className="flex items-center gap-2">
                {isGenerating && (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                    <div className="text-xs font-medium text-orange-500">Generating...</div>
                  </>
                )}
                {isCompleted && (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <div className="text-xs font-medium text-emerald-500">Complete</div>
                  </>
                )}
                {isError && (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <div className="text-xs font-medium text-red-500">Error</div>
                  </>
                )}
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              {isCompleted && (imageState?.url || (imageState?.images && imageState.images.length > 0)) ? (
                <div className="space-y-3">
                  {imageState.images && imageState.images.length > 0 ? (
                    <div className={imageState.images.length > 1 ? "grid grid-cols-2 gap-3" : "space-y-3"}>
                      {imageState.images.map((img, idx) => (
                        <div 
                          key={idx} 
                          className="relative group overflow-hidden rounded-xl border-2 border-border cursor-pointer"
                          onClick={() => {
                            setFullscreenImages(imageState.images!.map(i => ({ url: i.url, alt: prompt || 'Generated image' })));
                            setFullscreenIndex(idx);
                            setIsFullscreenOpen(true);
                          }}
                        >
                          <img
                            src={img.url}
                            alt={`${prompt || 'Generated image'} ${idx + 1}`}
                            className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                          />
                          {imageState.images && imageState.images.length > 1 && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[8px] uppercase tracking-widest font-bold text-white shadow-xl">
                              {idx + 1}/{imageState.images.length}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div 
                      className="relative group overflow-hidden rounded-xl border-2 border-border cursor-pointer"
                      onClick={() => {
                        const imageUrl = imageState.url || (imageState.images && imageState.images.length > 0 ? imageState.images[0].url : '');
                        if (imageUrl) {
                          setFullscreenImages([{ url: imageUrl, alt: prompt || 'Generated image' }]);
                          setFullscreenIndex(0);
                          setIsFullscreenOpen(true);
                        }
                      }}
                    >
                      <img
                        src={imageState.url || (imageState.images && imageState.images.length > 0 ? imageState.images[0].url : '')}
                        alt={prompt || 'Generated image'}
                        className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[8px] uppercase tracking-widest font-bold text-white shadow-xl">
                        Research Design
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const imagesToSend = imageState.images && imageState.images.length > 0
                          ? imageState.images 
                          : [{ url: imageState.url || (imageState.images && imageState.images.length > 0 ? imageState.images[0].url : ''), storageKey: '' }];
                        imagesToSend.forEach((img, idx) => {
                          if (img.url) {
                            onSendToCanvas({
                              type: 'image',
                              imageUrl: img.url,
                              title: `Research Design Concept ${imagesToSend.length > 1 ? idx + 1 : ''}`,
                              content: prompt || 'Generated footwear concept from research session.',
                              data: { source: 'research' }
                            });
                          }
                        });
                      }}
                      className="flex-1 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary-foreground hover:bg-primary/90 transition-colors bg-primary px-4 py-2 rounded-xl border border-border"
                    >
                      <Sparkles size={12} />
                      Send {imageState.images && imageState.images.length > 1 ? `All (${imageState.images.length})` : ''} to Canvas
                    </button>
                    <button
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('switch-workspace-mode', { detail: 'studio' }));
                      }}
                      className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-foreground hover:bg-muted transition-colors bg-background px-4 py-2 rounded-xl border border-border group"
                    >
                      <Maximize2 size={12} className="group-hover:text-emerald-500 transition-colors" />
                      View in Studio
                    </button>
                  </div>
                </div>
              ) : isGenerating ? (
                <div className="aspect-square bg-muted rounded-xl flex items-center justify-center border border-dashed border-border animate-pulse">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <Activity size={32} className="text-primary animate-spin" />
                      <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ping" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-foreground uppercase tracking-widest font-medium">Synthesizing Image</span>
                      <span className="text-[9px] text-muted-foreground">This may take 20-60 seconds</span>
                    </div>
                  </div>
                </div>
              ) : isError ? (
                <div className="aspect-square bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                  <div className="flex flex-col items-center gap-2 px-4 text-center">
                    <span className="text-[10px] text-red-500 uppercase tracking-widest">Generation Failed</span>
                    <span className="text-[9px] text-muted-foreground">Please try again</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      }}
      </ImageGenerationState>
      <FullscreenImageViewer
        images={fullscreenImages}
        initialIndex={fullscreenIndex}
        open={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
      />
    </>
  );
}

export function ResearchChat({ 
  onSendToCanvas, 
  onGenerateBlueprint,
  pendingMessage, 
  isGenerating, 
  onGenerationComplete, 
  onProcessingStart,
  onMessageConsumed,
  projectId, 
  projectContext 
}: ResearchChatProps) {
  const router = useRouter();
  const convertToProduct = useMutation(api.projects.convertToProduct);
  // Load persisted messages from Convex
  const persistedMessages = useQuery(
    api.intelligence.getMessages,
    projectId ? { projectId } : 'skip'
  );

  const saveMessage = useMutation(api.intelligence.sendMessage);
  const updateMessageAttachments = useMutation(api.intelligence.updateMessageAttachments);
  const designContext = useQuery(api.studio.getDesignContext, projectId ? { projectId } : 'skip');
  // const productBaseline = useQuery(api.products.getBaseline, projectId ? { projectId } : 'skip');
  const runUpdateDesignContext = useMutation(api.studio.updateDesignContext);
  const runUpdateBOM = useMutation(api.studio.updateBOM);
  const runUpdateBaseline = useMutation(api.products.updateBaseline);
  const runRenameProject = useMutation(api.projects.renameProject).withOptimisticUpdate(
    (localStore, args) => {
      // Optimistically update the project query by ID
      if (projectId) {
        const currentProject = localStore.getQuery(api.projects.getProject, { id: projectId });
        if (currentProject !== undefined && currentProject !== null) {
          localStore.setQuery(
            api.projects.getProject,
            { id: projectId },
            {
              ...currentProject,
              name: args.name,
              lastUpdated: Date.now(),
            }
          );
        }
      }
      // Also optimistically update the project query by slug (used by page component)
      if (projectContext?.workshopName && projectContext?.projectName) {
        const currentProjectBySlug = localStore.getQuery(api.projects.getProjectBySlug, {
          workshopSlug: projectContext.workshopName,
          projectSlug: projectContext.projectName,
        });
        if (currentProjectBySlug !== undefined && currentProjectBySlug !== null) {
          localStore.setQuery(
            api.projects.getProjectBySlug,
            {
              workshopSlug: projectContext.workshopName,
              projectSlug: projectContext.projectName,
            },
            {
              ...currentProjectBySlug,
              name: args.name,
              lastUpdated: Date.now(),
              messageQueue: currentProjectBySlug.messageQueue || [],
              threadStatus: currentProjectBySlug.threadStatus || "idle",
            }
          );
        }
      }
    }
  );
  const enqueueMessage = useMutation(api.projects.enqueueMessage);
  const redeemCredits = useMutation(api.credits.redeemCredits);
  // Use action wrapper to start workflow (non-blocking - returns workflowId immediately)
  const startGenerateImage = useAction(api.imageWorkflow.startGenerateImage);
  const upsertGeneration = useMutation(api.imageGenerations.upsertGeneration);
  
  // Fullscreen image viewer state
  const [fullscreenImages, setFullscreenImages] = useState<Array<{ url: string; alt?: string }>>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  // Get project data for workshopId
  const projectData = useQuery(api.projects.getProject, projectId ? { id: projectId } : 'skip');
  const workshopId = projectData?.workshopId;
  const credits = useQuery(api.credits.getAvailableCredits, workshopId ? { workshopId } : 'skip');
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  
  // Log session/user state
  useEffect(() => {
    console.log('[ResearchChat] 🔐 Session state:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: userId || 'MISSING',
      sessionKeys: session ? Object.keys(session) : [],
    });
  }, [session, userId]);
  
  // Log project/workshop state
  useEffect(() => {
    console.log('[ResearchChat] 📁 Project state:', {
      projectId: projectId || 'MISSING',
      workshopId: workshopId || 'MISSING',
      hasProjectData: !!projectData,
      projectDataKeys: projectData ? Object.keys(projectData) : [],
    });
  }, [projectId, workshopId, projectData]);
  
  // Track message timestamps separately (useChat doesn't support custom fields)
  const [messageTimestamps, setMessageTimestamps] = useState<Map<string, number>>(new Map());

  // Convert persisted messages to UIMessage format
  const convertedMessages = useMemo(() => {
    const buildFileParts = (attachments?: MessageAttachment[]) => {
      if (!attachments) return [];
      return attachments.map((attachment) => ({
        type: 'file' as const,
        url: attachment.url,
        mediaType: attachment.contentType,
        filename: attachment.fileName,
      }));
    };

    if (!persistedMessages || persistedMessages.length === 0) {
      return [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Welcome to Research Intelligence. I can help you analyze market trends, materials, and competitive landscapes. What would you like to explore today?' }],
        }
      ];
    }

    const uniqueMessages: UIMessage[] = [];
    const seenIds = new Set<string>();
    
    persistedMessages.forEach((msg: PersistedMessage) => {
      const id = msg.messageId || msg._id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        uniqueMessages.push({
          id,
          role: msg.role as 'user' | 'assistant',
          parts: [
            ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
            ...(msg.attachments || []).map((attachment: MessageAttachment) => ({
              type: 'file' as const,
              url: attachment.url,
              mediaType: attachment.contentType,
              filename: attachment.fileName,
            })),
          ],
        });
      }
    });
    
    return uniqueMessages;
  }, [persistedMessages]);

  // Handle timestamps in a separate effect to avoid side effects in useMemo
  useEffect(() => {
    if (!persistedMessages) return;
    
    const timestamps = new Map<string, number>();
    persistedMessages.forEach((msg: PersistedMessage) => {
      if (msg.timestamp) {
        timestamps.set(msg.messageId || msg._id, msg.timestamp);
      }
    });
    
    setMessageTimestamps(prev => {
      const merged = new Map(prev);
      let changed = false;
      timestamps.forEach((ts, id) => {
        if (merged.get(id) !== ts) {
          merged.set(id, ts);
          changed = true;
        }
      });
      return changed ? merged : prev;
    });
  }, [persistedMessages]);

  const { messages, sendMessage, status, setMessages } = useChat({
    api: '/api/chat',
    initialMessages: convertedMessages,
    body: { 
      projectId, 
      projectContext: {
        ...projectContext,
        designContext,
        workshopSlug: projectContext?.workshopName || '',
        projectSlug: projectContext?.projectName || '',
      } 
    },
    onToolCall: async (options) => {
      const toolCall = options.toolCall as { toolName: string; toolCallId: string; args?: unknown; result?: unknown };
      if (toolCall.toolName === 'sendToCanvas') {
        const args = (toolCall.args ?? {}) as unknown as SendToCanvasArgs;
        onSendToCanvas?.({
          title: args.title,
          content: args.content,
          type: args.type,
          agent: args.agent,
        });
        return void 0;
      }
      if (toolCall.toolName === 'analyzeFootwearImage') {
        // The actual analysis happens via vision - this tool just signals the intent
        // The model will analyze images in the conversation and return findings
        const args = (toolCall.args ?? {}) as unknown as AnalyzeFootwearImageArgs;
        return toolCall.result || { 
          status: 'analyzing', 
          message: 'Analyzing footwear images to extract measurements and technical specifications.',
          imageUrls: args.imageUrls,
          productName: args.productName,
        };
      }
      if (toolCall.toolName === 'requestTechnicalBlueprint') {
        const args = (toolCall.args ?? {}) as unknown as RequestTechnicalBlueprintArgs & { imageUrl?: string };
        const primaryImageUrl = args.imageUrls?.[0] ?? args.imageUrl;
        onGenerateBlueprint?.({
          imageUrls: primaryImageUrl ? [primaryImageUrl] : [],
          productName: args.productName ?? '',
        });
        return void 0;
      }
      if (toolCall.toolName === 'renameProject' && projectId) {
        const args = (toolCall.args ?? {}) as unknown as RenameProjectArgs;
        
        console.log('[renameProject] onToolCall received:', {
          toolCallId: toolCall.toolCallId,
          hasArgs: !!args,
          argsKeys: Object.keys(args || {}),
          hasName: !!args.name,
        });
        
        // If name is missing, wait for tool invocation render (execute function or result state)
        if (!args.name) {
          console.log('[renameProject] No name in onToolCall, will wait for tool invocation render');
          return void 0;
        }
        
        console.log('[renameProject] Executing rename with name:', args.name);
        try {
          await runRenameProject({
            id: projectId,
            name: args.name
          });
          console.log('[renameProject] Successfully renamed project to:', args.name);
        } catch (error) {
          console.error('[renameProject] Failed to rename project:', error);
        }
        return void 0;
      }
      if (toolCall.toolName === 'updateDesignContext' && projectId) {
        const args = (toolCall.args ?? {}) as unknown as UpdateDesignContextArgs;
        await runUpdateDesignContext({
          projectId,
          ...args
        });
        return void 0;
      }
      if (toolCall.toolName === 'updateBOM' && projectId) {
        const args = (toolCall.args ?? {}) as unknown as UpdateBOMArgs;
        await runUpdateBOM({
          projectId,
          currency: 'USD',
          ...args
        });
        return void 0;
      }
      if (toolCall.toolName === 'updateProductBaselines' && projectId) {
        const args = (toolCall.args ?? {}) as unknown as UpdateProductBaselinesArgs;
        await runUpdateBaseline({
          projectId,
          ...args
        });
        return void 0;
      }
      if (toolCall.toolName === 'consultSpecialist') {
        console.log('[consultSpecialist] onToolCall received:', {
          toolCallId: toolCall.toolCallId,
          hasArgs: !!toolCall.args,
          args: toolCall.args,
          hasResult: !!toolCall.result,
          result: toolCall.result,
          toolCallKeys: Object.keys(toolCall),
        });
        
        // The execute function's return value becomes toolCall.result
        // We MUST return it to satisfy AI SDK's requirement
        // If result exists from execute function, use it; otherwise provide fallback
        const args = toolCall.args as { specialist?: string; question?: string; context?: string } | undefined;
        const result = toolCall.result || {
          specialist: args?.specialist || 'analyst',
          question: args?.question || '',
          response: `[${args?.specialist || 'analyst'}] Consultation response for: ${args?.question || 'general inquiry'}. ${args?.context ? `Context: ${args.context}. ` : ''}Specialist consultation completed.`,
          status: 'consulted',
        };
        
        console.log('[consultSpecialist] onToolCall returning result:', result);
        return result;
      }
      if (toolCall.toolName === 'generateImage') {
        const toolCallId = toolCall.toolCallId;
        
        console.log('[generateImage] onToolCall received:', {
          toolCallId,
          hasArgs: !!toolCall.args,
          args: toolCall.args,
          hasResult: !!toolCall.result,
          result: toolCall.result,
          toolCallKeys: Object.keys(toolCall),
        });
        
        // Store the toolCallId to match with parts later
        pendingToolCallsRef.current.set(toolCallId, { toolCallId, timestamp: Date.now() });
        
        // The execute function's return value becomes toolCall.result
        // We MUST return it to satisfy AI SDK's requirement
        // Always return a result - use execute result if available, otherwise construct from args
        const args = toolCall.args as { prompt?: string; aspectRatio?: string; referenceImage?: string } | undefined;
        const result = (toolCall.result as { prompt?: string; aspectRatio?: string; referenceImage?: string } | undefined) || {
          prompt: args?.prompt ?? '',
          aspectRatio: args?.aspectRatio ?? '1:1',
          referenceImage: args?.referenceImage,
          status: 'initiated',
          message: 'Image generation workflow started. The image will appear when generation completes.',
        };
        
        console.log('[generateImage] onToolCall returning result:', result);
        return result;
      }
      return void 0;
     },
     onFinish: (options: { message: UIMessage }) => {
       const message = options.message;
       // Save assistant message to Convex
      if (projectId && message && Array.isArray(message.parts)) {
        // Skip if already saved
        if (savedMessageIdsRef.current.has(message.id)) {
          console.log('[ResearchChat] ⏭️ Assistant message already saved, skipping:', message.id);
          return;
        }
        
        console.log('[ResearchChat] 🎯 onFinish called for assistant message:', {
          messageId: message.id,
          projectId,
          hasParts: Array.isArray(message.parts),
          partsCount: message.parts?.length || 0,
        });

        const textPart = message.parts.find((p): p is TextUIPart => p.type === 'text');
        const textContent = textPart?.text ?? '';
        const fileParts = message.parts.filter((p): p is FileUIPart => p.type === 'file');

        if (textContent || fileParts.length > 0) {
          const assistantTimestamp = Date.now();
          console.log('[ResearchChat] 💾 Saving assistant message:', {
            projectId,
            messageId: message.id,
            contentLength: textContent.length,
            hasAttachments: fileParts.length > 0,
          });
          
          // Mark as saved immediately to prevent duplicate saves from multiple onFinish calls or syncs
          savedMessageIdsRef.current.add(message.id);
          
          // Update last save time to prevent premature sync
          lastSaveTimeRef.current = Date.now();
          
          // Clear any pending sync timeout
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          
          saveMessage({
            projectId,
            role: 'assistant',
            content: textContent,
            messageId: message.id, // Store useChat message ID for matching
            attachments: fileParts.map((file) => ({
              url: file.url,
              fileName: file.filename || 'Image',
              contentType: file.mediaType || 'application/octet-stream',
            })),
          }).then(() => {
            console.log('[ResearchChat] ✅ Assistant message saved to Convex:', {
              messageId: message.id,
              timestamp: Date.now(),
            });
            // After save completes, update timestamp and wait for Convex query to update
            // This gives Convex time to propagate the change to the query
            // Increased delay to ensure query has updated
            saveTimeoutRef.current = setTimeout(() => {
              lastSaveTimeRef.current = Date.now();
              console.log('[ResearchChat] ✅ Save delay complete, sync will be allowed');
            }, 2000);
          }).catch((error) => {
            console.error('[ResearchChat] ❌ Failed to save assistant message:', error);
            // Remove from saved set on error so it can be retried
            savedMessageIdsRef.current.delete(message.id);
            // Reset save time on error so sync can proceed
            lastSaveTimeRef.current = 0;
          });
          
          // Store timestamp for assistant message
          setMessageTimestamps(prev => new Map(prev).set(message.id, assistantTimestamp));
        }
      }
    },
     onError: (error: Error) => {
       console.error('Chat error:', error);
     },
  } as Parameters<typeof useChat>[0]);

  // Track last synced projectId and message IDs to avoid duplicate syncs
  const lastSyncedRef = useRef<{ projectId?: Id<'projects'>; messageIds: Set<string> }>({ messageIds: new Set() });
  
  // Track when we finish saving a message to prevent premature sync
  const lastSaveTimeRef = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Reset sync tracking when projectId changes
  useEffect(() => {
    if (lastSyncedRef.current.projectId !== projectId) {
      lastSyncedRef.current = { projectId, messageIds: new Set() };
      lastSaveTimeRef.current = 0;
    }
  }, [projectId]);

  // Track if we have an in-progress assistant message that hasn't been saved yet
  const hasUnsavedAssistantMessage = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'assistant') return false;
    
    // Check if this assistant message is still streaming
    const hasStreamingParts = lastMessage.parts?.some(p => {
      if (p.type === 'text') {
        return (p as TextUIPart).state === 'streaming';
      }
      if (p.type === 'reasoning') {
        return (p as { type: 'reasoning'; state?: string }).state === 'streaming';
      }
      return false;
    });
    
    // Also check if status is streaming and we have an assistant message
    // This catches cases where the message is being generated but parts don't have state yet
    return hasStreamingParts || (status === 'streaming' && lastMessage.role === 'assistant');
  }, [messages, status]);

  // Sync persisted messages when they load or projectId changes
  useEffect(() => {
    // Skip if persistedMessages is still loading (undefined) or no projectId
    if (persistedMessages === undefined || !projectId) return;
    
    // Don't sync if currently loading/streaming to avoid overwriting in-progress messages
    if ((status as ChatStatus) === 'submitted' || (status as ChatStatus) === 'streaming' || hasUnsavedAssistantMessage) {
      return;
    }
    
    // Check if we need to sync based on message count or IDs
    const persistedIds = new Set(persistedMessages.map((msg: PersistedMessage) => msg.messageId || msg._id));
    const currentIds = new Set(messages.map(m => m.id));
    
    // CRITICAL: Never sync if we have assistant messages that aren't in persistedMessages
    const currentAssistantMessages = messages.filter(m => m.role === 'assistant');
    const persistedAssistantIds = new Set(
      persistedMessages
        .filter(m => m.role === 'assistant')
        .map(m => m.messageId || m._id)
    );
    
    const unsavedAssistantMessages = currentAssistantMessages.filter(
      m => !persistedAssistantIds.has(m.id)
    );
    
    if (unsavedAssistantMessages.length > 0) {
      console.log('[ResearchChat] ⏸️ CRITICAL: Skipping sync - unsaved assistant messages detected:', {
        unsavedCount: unsavedAssistantMessages.length,
        unsavedIds: unsavedAssistantMessages.map(m => m.id),
      });
      return;
    }
    
    // Don't sync if currently loading/streaming
    if (status === 'submitted' || status === 'streaming' || hasUnsavedAssistantMessage) {
      console.log('[ResearchChat] ⏸️ Skipping sync - message in progress:', {
        status,
        hasUnsavedAssistantMessage,
      });
      return;
    }
    
    // Don't sync immediately after saving
    const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
    if (timeSinceLastSave < 3000) {
      console.log('[ResearchChat] ⏸️ Skipping sync - recently saved:', {
        timeSinceLastSave,
      });
      return;
    }
    
    // CRITICAL CHECK: If we have more assistant messages than persisted, wait for them to be saved
    const currentAssistantCount = messages.filter(m => m.role === 'assistant').length;
    const persistedAssistantCount = persistedMessages.filter(m => m.role === 'assistant').length;
    if (currentAssistantCount > persistedAssistantCount) {
      console.log('[ResearchChat] ⏸️ CRITICAL: Skipping sync - more assistant messages than persisted:', {
        currentAssistantCount,
        persistedAssistantCount,
        difference: currentAssistantCount - persistedAssistantCount,
      });
      return;
    }

    // CRITICAL: If messages.length === 0 after remount, but we recently saved a message,
    // wait a bit longer to ensure it's persisted before syncing
    if (messages.length === 0 && persistedMessages.length > 0 && timeSinceLastSave < 5000) {
      console.log('[ResearchChat] ⏸️ CRITICAL: Skipping sync - recently saved, waiting for persistence:', {
        timeSinceLastSave,
        persistedCount: persistedMessages.length,
      });
      return;
    }

    const needsSync = 
      lastSyncedRef.current.projectId !== projectId ||
      (persistedMessages.length > 0 && messages.length === 0) ||
      Array.from(persistedIds).some(id => !currentIds.has(id));

    if (needsSync && convertedMessages.length > 0) {
      console.log('[ResearchChat] 🔄 Syncing history from Convex:', {
        projectId,
        persisted: persistedMessages.length,
        current: messages.length,
        currentAssistantCount,
        persistedAssistantCount,
        timeSinceLastSave,
      });
      
      setMessages(convertedMessages);
      lastSyncedRef.current = { projectId, messageIds: persistedIds };
    }
  }, [persistedMessages, convertedMessages, setMessages, projectId, status, hasUnsavedAssistantMessage, messages]);

  // Track which messages we've already saved to avoid duplicates
  const savedMessageIdsRef = useRef<Set<string>>(new Set());
  // Track auto-sent image URLs per toolCallId (avoids duplicate send from onComplete)
  const autoSendByToolCallIdRef = useRef<Map<string, string | null>>(new Map());
  // Track which toolCallIds have had their images saved as attachments
  const savedImageAttachmentsRef = useRef<Set<string>>(new Set());

  // Save generated images as attachments when they complete
  // This effect watches for completed image generations and saves them to the message
  const imageGenerations = useQuery(
    api.imageGenerations.getGenerationsByToolCallIds,
    projectId && messages.length > 0
      ? {
          toolCallIds: messages
            .flatMap(m => m.parts || [])
            .filter((p): p is Extract<typeof p, { toolCallId: string }> => 
              isToolUIPart(p) && getToolName(p) === 'generateImage' && 'toolCallId' in p && typeof p.toolCallId === 'string'
            )
            .map(p => p.toolCallId),
        }
      : 'skip'
  );

  useEffect(() => {
    if (!projectId || !imageGenerations) return;

    imageGenerations.forEach((gen) => {
      if (gen.status !== 'completed') return;
      if (savedImageAttachmentsRef.current.has(gen.toolCallId)) return;

      const imagesToSave = gen.images && gen.images.length > 0
        ? gen.images
        : gen.url
          ? [{ url: gen.url, storageKey: gen.storageKey || '' }]
          : [];

      if (imagesToSave.length === 0) return;

      // Find the assistant message containing this tool invocation
      const assistantMessage = messages.find(m => 
        m.role === 'assistant' &&
        m.parts?.some(p => 
          isToolUIPart(p) && 
          p.toolCallId === gen.toolCallId
        )
      );

      if (!assistantMessage) {
        console.warn('[generateImage] Assistant message not found for toolCallId:', gen.toolCallId);
        return;
      }

      savedImageAttachmentsRef.current.add(gen.toolCallId);
      
      console.log('[generateImage] 💾 Saving images as attachments:', {
        toolCallId: gen.toolCallId,
        messageId: assistantMessage.id,
        imageCount: imagesToSave.length,
      });

      updateMessageAttachments({
        messageId: assistantMessage.id,
        projectId,
        attachments: imagesToSave.map((img, idx) => ({
          url: img.url,
          fileName: `generated-${gen.toolCallId}-${idx + 1}.png`,
          contentType: 'image/png',
        })),
      }).catch((error) => {
        console.error('[generateImage] ❌ Failed to save image attachments:', error);
        savedImageAttachmentsRef.current.delete(gen.toolCallId);
      });
    });
  }, [imageGenerations, messages, projectId, updateMessageAttachments]);

  // Reset saved message tracking when projectId changes
  useEffect(() => {
    savedMessageIdsRef.current.clear();
    savedImageAttachmentsRef.current.clear();
    // Mark all persisted messages as already saved
    if (persistedMessages) {
      persistedMessages.forEach((msg: PersistedMessage) => {
        const messageId = msg.messageId || msg._id;
        savedMessageIdsRef.current.add(messageId);
      });
    }
  }, [projectId, persistedMessages]);

  // Save messages when they appear in the messages array (backup to onFinish)
  useEffect(() => {
    if (!projectId) return;
    
    messages.forEach((message) => {
      // Skip if already saved
      if (savedMessageIdsRef.current.has(message.id)) return;
      
      // Save user messages
      if (message.role === 'user') {
        const textPart = message.parts?.find((p): p is TextUIPart => p.type === 'text');
        const textContent = textPart?.text ?? '';
        const fileParts = message.parts?.filter((p): p is FileUIPart => p.type === 'file') ?? [];

        if (textContent || fileParts.length > 0) {
          savedMessageIdsRef.current.add(message.id);
          console.log('[ResearchChat] 💾 Saving user message:', {
            projectId,
            messageId: message.id,
            contentLength: textContent.length,
            hasAttachments: fileParts.length > 0,
          });
          
          // Update last save time
          lastSaveTimeRef.current = Date.now();
          
          saveMessage({
            projectId,
            role: 'user',
            content: textContent,
            messageId: message.id, // Store useChat message ID
            attachments: fileParts.map((file) => ({
              url: file.url,
              fileName: file.filename || 'Image',
              contentType: file.mediaType || 'application/octet-stream',
            })),
          }).then(() => {
            // After save completes, wait a bit for Convex to update
            saveTimeoutRef.current = setTimeout(() => {
              lastSaveTimeRef.current = Date.now();
            }, 500);
          }).catch((error) => {
            console.error('[ResearchChat] ❌ Failed to save user message:', error);
          });
        }
      }
      
      // Save assistant messages that are complete (not streaming)
      if (message.role === 'assistant') {
        // Check if message is complete (not streaming)
        const isComplete = !message.parts?.some(p => {
          if (p.type === 'text') {
            return (p as TextUIPart).state === 'streaming';
          }
          if (p.type === 'reasoning') {
            return (p as { type: 'reasoning'; state?: string }).state === 'streaming';
          }
          return false;
        }) && status !== 'streaming';
        
        if (isComplete) {
          const textPart = message.parts?.find((p): p is TextUIPart => p.type === 'text');
          const textContent = textPart?.text ?? '';
          const fileParts = message.parts?.filter((p): p is FileUIPart => p.type === 'file') ?? [];

          if (textContent || fileParts.length > 0) {
            savedMessageIdsRef.current.add(message.id);
            console.log('[ResearchChat] 💾 Saving assistant message (backup):', {
              projectId,
              messageId: message.id,
              contentLength: textContent.length,
              hasAttachments: fileParts.length > 0,
            });
            
            // Update last save time
            lastSaveTimeRef.current = Date.now();
            
            saveMessage({
              projectId,
              role: 'assistant',
              content: textContent,
              messageId: message.id,
              attachments: fileParts.map((file) => ({
                url: file.url,
                fileName: file.filename || 'Image',
                contentType: file.mediaType || 'application/octet-stream',
              })),
            }).then(() => {
              saveTimeoutRef.current = setTimeout(() => {
                lastSaveTimeRef.current = Date.now();
              }, 2000);
            }).catch((error) => {
              console.error('[ResearchChat] ❌ Failed to save assistant message (backup):', error);
              savedMessageIdsRef.current.delete(message.id);
            });
          }
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, projectId, status]); // saveMessage is stable from useMutation, excluded to prevent dependency array size changes

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageKeyRef = useRef<string>('');
  const isLoading = status === 'submitted' || status === 'streaming';
  
  // Track if we're actually generating images (not just chatting)
  const hasActiveImageGeneration = messages.some(msg => 
    msg.parts?.some(part => {
      if (!isToolUIPart(part)) return false;
      const toolName = getToolName(part);
      const state = part.state;
      return toolName === 'generateImage' && 
        state !== 'output-available' && 
        state !== 'output-error';
    })
  );

  useEffect(() => {
    if (!pendingMessage || isLoading || !projectId) return;

    const handleSubmission = async () => {
      // 1. Check Busy State -> Enqueue if already loading
      if (isLoading) {
        await enqueueMessage({
          projectId,
          prompt: pendingMessage.text,
          attachments: pendingMessage.attachments,
          userId: userId || 'user' // Fallback
        });
        onMessageConsumed?.();
        return;
      }

      // 2. Mark as processing
      onProcessingStart?.();

      // 3. Credit Check
      const cost = CREDIT_COSTS.RESEARCH_QUERY;
      if (cost > 0 && credits && credits.balance < cost) {
        // We'll let the user know through the UI later
        console.warn('Insufficient credits');
        onMessageConsumed?.();
        return;
      }

      const attachmentParts =
        pendingMessage.attachments?.map((attachment) => ({
          type: 'file' as const,
          url: attachment.base64
            ? `data:${attachment.contentType};base64,${attachment.base64}`
            : attachment.url,
          mediaType: attachment.contentType,
          filename: attachment.fileName,
          data: attachment.base64,
        })) || [];

      const messageKey = `${pendingMessage.text}-${attachmentParts
        .map((p) => p.filename)
        .join('|')}`;

      if (messageKey === lastMessageKeyRef.current) {
        onMessageConsumed?.();
        return;
      }
      lastMessageKeyRef.current = messageKey;

      // 4. Redeem credits (skip if cost is 0)
      if (workshopId && cost > 0) {
        try {
          await redeemCredits({
            workshopId,
            amount: cost,
            projectId,
            assetType: 'research',
            description: `AI Research Query: ${pendingMessage.text.slice(0, 30)}...`
          });
        } catch (e) {
          console.error("Failed to redeem credits:", e);
          onMessageConsumed?.();
          return;
        }
      }

      // 5. Send Message
      sendMessage({
        parts: [
          { type: 'text', text: pendingMessage.text },
          ...attachmentParts,
        ],
      });
      
      // Note: User message will be saved when it appears in the messages array
      // See useEffect below that watches for new user messages

      // 6. Consume message
      onMessageConsumed?.();
    };

    handleSubmission();
  }, [pendingMessage, sendMessage, isLoading, projectId, saveMessage, isGenerating, credits, workshopId, enqueueMessage, projectContext, redeemCredits]);

  useEffect(() => {
    if (!pendingMessage && !isLoading) {
      lastMessageKeyRef.current = '';
    }
  }, [pendingMessage, isLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track which tool invocations we've already processed
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  const checkTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Store toolCallIds from onToolCall to match with parts later
  const pendingToolCallsRef = useRef<Map<string, { toolCallId: string; timestamp: number }>>(new Map());

  // Watch for generateImage tool invocations and trigger workflow
  useEffect(() => {
    // Clear any pending timeouts
    checkTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
    checkTimeoutRef.current.clear();
    
    console.log('[generateImage useEffect] 🔍 Checking messages:', {
      messagesCount: messages.length,
      lastMessageRole: messages[messages.length - 1]?.role,
      lastMessageParts: messages[messages.length - 1]?.parts?.map(p => ({
        type: p.type,
        toolName: isToolUIPart(p) ? getToolName(p) : undefined,
        state: isToolUIPart(p) ? p.state : undefined,
      })),
    });
    
    messages.forEach((message) => {
      if (message.role === 'assistant' && message.parts) {
        message.parts.forEach((part) => {
          if (!isToolUIPart(part)) return;
          const toolName = getToolName(part);
          if (toolName !== 'generateImage') return;

          const toolCallId = part.toolCallId;
          const state = part.state;
          const args = part.state !== 'input-streaming' ? (part.input as GenerateImageArgs | undefined) : undefined;
          const result = part.state === 'output-available' ? (part.output as GenerateImageWorkflowResult | undefined) : undefined;

          console.log('[generateImage useEffect] 🔍 Checking part:', {
            type: part.type,
            toolCallId,
            state,
            hasArgs: !!args,
            hasResult: !!result,
          });
          
          // Remove from pending once we've matched it
          pendingToolCallsRef.current.delete(toolCallId);
          
          // Extract prompt from args/result (execute function returns args; output-available has result)
          const executeResult = result ?? (state === 'output-available' ? (part.output as GenerateImageWorkflowResult | null) : null);
              
              // Extract prompt from result or args
              const prompt = executeResult?.prompt || result?.prompt || args?.prompt;
              const aspectRatio = executeResult?.aspectRatio || result?.aspectRatio || args?.aspectRatio || '1:1';
              let referenceImage = executeResult?.referenceImage || result?.referenceImage || args?.referenceImage;
              
              console.log('[generateImage useEffect] 🔍 Result extraction:', {
                toolCallId,
                state,
                hasExecuteResult: !!executeResult,
                executeResultKeys: executeResult ? Object.keys(executeResult) : [],
                executeResult: executeResult,
                hasResult: !!result,
                resultKeys: result ? Object.keys(result) : [],
                result: result,
                hasArgs: !!args,
                argsKeys: args ? Object.keys(args) : [],
                args: args,
                extractedPrompt: prompt,
              });
            
            console.log('[generateImage useEffect] 📋 Extracted values:', {
              toolCallId,
              state,
              hasPrompt: !!prompt,
              promptLength: prompt?.length || 0,
              promptPreview: prompt?.substring(0, 50),
              hasArgs: !!args,
              argsKeys: args ? Object.keys(args) : [],
              hasResult: !!result,
              resultKeys: result ? Object.keys(result) : [],
              aspectRatio,
              hasReferenceImage: !!referenceImage,
            });
            
            // If no reference image in args/result, try to find one in message attachments
            if (!referenceImage) {
              const currentMessage = messages.find(m => 
                m.parts?.some(p => isToolUIPart(p) && p.toolCallId === toolCallId)
              );
              
              if (currentMessage) {
                const imageParts = currentMessage.parts?.filter((p): p is FileUIPart => p.type === 'file' && p.mediaType?.startsWith('image/'));
                if (imageParts && imageParts.length > 0) {
                  referenceImage = imageParts[0].url;
                } else {
                  // Check previous user messages for images
                  const messageIndex = messages.findIndex(m => m.id === currentMessage.id);
                  for (let i = messageIndex - 1; i >= 0; i--) {
                    const prevMessage = messages[i];
                    if (prevMessage.role === 'user') {
                      const prevImageParts = prevMessage.parts?.filter((p): p is FileUIPart => p.type === 'file' && p.mediaType?.startsWith('image/'));
                      if (prevImageParts && prevImageParts.length > 0) {
                        referenceImage = prevImageParts[0].url;
                        break;
                      }
                    }
                  }
                }
              }
            }
            
            // If executeResult already has a URL (workflow completed), mark as processed; Convex/ImageGenerationState drives UI
            const resultUrl = (executeResult as GenerateImageWorkflowResult | null)?.url ?? (result as GenerateImageWorkflowResult | undefined)?.url;
            if (resultUrl && typeof resultUrl === 'string' && resultUrl.startsWith('http')) {
              console.log('[generateImage useEffect] ✅ Found URL in result, marking processed:', { toolCallId, url: resultUrl });
              processedToolCallsRef.current.add(toolCallId);
              return;
            }
            
            // Check if we already processed this tool call
            if (processedToolCallsRef.current.has(toolCallId)) {
              console.log('[generateImage useEffect] ⏭️ Already processed:', toolCallId);
              return; // Already processed
            }
            
            // Start workflow if we have a prompt and haven't started yet
            // Trigger when we have a prompt (execute has completed and returned the args)
            // State can be 'output-available', 'result', or any state as long as we have the prompt
            if (prompt && prompt.length >= 50 && userId && projectId) {
              // Mark as processed immediately to prevent duplicate triggers
              processedToolCallsRef.current.add(toolCallId);
              console.log('[generateImage useEffect] ✅ Triggering workflow:', {
                toolCallId,
                state,
                promptLength: prompt.length,
                promptPreview: prompt.substring(0, 50),
                hasReferenceImage: !!referenceImage,
                userId,
                projectId,
                workshopId,
              });
              
              // Prepare workflow arguments
              const workflowArgs = {
                toolCallId, // Pass toolCallId to track in Convex
                prompt: prompt,
                aspectRatio: aspectRatio,
                referenceImageUrl: referenceImage,
                referenceImageUrls: referenceImage ? [referenceImage] : undefined,
                projectId,
                userId: userId,
                workshopId,
                source: 'research' as const,
                numImages: 4, // Generate 4 images for research/threads chat
              };
              
              // Start workflow (non-blocking - returns workflowId immediately)
              // The action will create the generation record in Convex
              startGenerateImage(workflowArgs)
                .then((response) => {
                  const workflowId = response?.workflowId;
                  console.log('[generateImage useEffect] ✅ Workflow started:', {
                    toolCallId,
                    workflowId,
                  });
                  
                  if (!workflowId) {
                    console.error('[generateImage useEffect] ❌ No workflowId in response:', response);
                    // Update Convex state to error
                    upsertGeneration({
                      toolCallId,
                      projectId,
                      userId,
                      status: 'error',
                      error: 'No workflowId returned',
                    }).catch(console.error);
                    return;
                  }
                  
                  // State is now managed by Convex - UI will update reactively
                  console.log('[generateImage useEffect] 💾 Generation state managed by Convex');
                })
                .catch((error) => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  console.error('[generateImage useEffect] ❌ Failed to start workflow:', {
                    toolCallId,
                    error: errorMessage,
                  });
                  
                  // Update Convex state to error
                  upsertGeneration({
                    toolCallId,
                    projectId,
                    userId,
                    status: 'error',
                    error: errorMessage,
                  }).catch(console.error);
                });
              }
        });
      }
    });
  }, [messages, userId, projectId, workshopId, startGenerateImage, upsertGeneration]);

  // No polling needed - Convex queries are reactive and update automatically

  const prevIsLoadingRef = useRef(false);

  useEffect(() => {
    // Reset isGenerating when chat finishes (not just image generation)
    if (prevIsLoadingRef.current && !isLoading && isGenerating) {
      // Check if there are any active image generations
      const hasActiveGenerations = messages.some(msg => 
        msg.parts?.some(part => {
          if (!isToolUIPart(part)) return false;
          const toolName = getToolName(part);
          const state = part.state;
          return toolName === 'generateImage' && 
            state !== 'output-available' && 
            state !== 'output-error';
        })
      );
      
      // Only reset isGenerating if there are no active image generations
      if (!hasActiveGenerations && onGenerationComplete) {
        onGenerationComplete();
      }
    }
    prevIsLoadingRef.current = isLoading;
  }, [isLoading, isGenerating, messages, onGenerationComplete]);

  // Also reset isGenerating when messages finish streaming and there's no pending generation
  useEffect(() => {
    if (!isLoading && isGenerating && !pendingMessage) {
      // Check if there are any active image generations
      const hasActiveGenerations = messages.some(msg => 
        msg.parts?.some(part => {
          if (!isToolUIPart(part)) return false;
          const toolName = getToolName(part);
          const state = part.state;
          return toolName === 'generateImage' && 
            state !== 'output-available' && 
            state !== 'output-error';
        })
      );
      
      // If no active generations, reset isGenerating
      if (!hasActiveGenerations && onGenerationComplete) {
        onGenerationComplete();
      }
    }
  }, [isLoading, isGenerating, pendingMessage, messages, onGenerationComplete]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full pt-8 px-6 pb-28">
      <ScrollArea className="flex-1 min-h-0 pr-2" data-lenis-prevent>
        <div className="flex flex-col gap-8">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-mono mb-4 sticky top-0 bg-background/80 backdrop-blur-md py-2 z-10 flex items-center justify-between">
          <span>Research Intelligence Feed</span>
          {credits && (
            <div className="flex items-center gap-2 text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
              <CreditCard size={10} />
              <span>{credits.balance} CREDITS</span>
            </div>
          )}
        </div>

        {projectData?.messageQueue && projectData.messageQueue.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground/60 flex items-center gap-2">
              <History size={10} />
              Pending Queue ({projectData.messageQueue.length})
            </div>
            {projectData.messageQueue.map((item: MessageQueueItem) => (
              <div key={item.id} className="bg-muted/30 border border-border/50 rounded-xl p-3 opacity-60 flex items-center justify-between">
                <div className="text-xs truncate max-w-[80%] italic">&quot;{item.prompt}&quot;</div>
                <div className="text-[8px] uppercase tracking-widest font-bold text-muted-foreground">Queued</div>
              </div>
            ))}
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className={cn(
                "flex flex-col gap-3 group",
                message.role === 'user' ? "items-end" : "items-start"
              )}
            >
              <div className={cn(
                "flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted-foreground",
                message.role === 'user' && "flex-row-reverse"
              )}>
                {message.role === 'user' ? (
                  <>
                    <span>Designer</span>
                    <User size={12} />
                  </>
                ) : (
                  <>
                    <Bot size={12} />
                    <span>{message.parts?.some(p => p.type === 'text' && p.text.includes('**The Analyst**')) ? 'The Analyst' : 
                            message.parts?.some(p => p.type === 'text' && p.text.includes('**The Maker**')) ? 'The Maker' :
                            message.parts?.some(p => p.type === 'text' && p.text.includes('**The Artist**')) ? 'The Artist' : 'Zeph'}</span>
                  </>
                )}
                {messageTimestamps.get(message.id) && (
                  <span className="text-[9px] normal-case tracking-normal opacity-60">
                    {formatMessageTime(messageTimestamps.get(message.id)!)}
                  </span>
                )}
              </div>
              
              <div className={cn(
                "max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed transition-all shadow-sm",
                message.role === 'user' 
                  ? "bg-primary text-primary-foreground font-medium rounded-tr-none" 
                  : "bg-card border border-border text-foreground rounded-tl-none shadow-md"
              )}>
                {message.parts?.map((part, idx) => {
                  if (part.type === 'text') {
                    return (
                      <div key={idx} className={cn(
                        "markdown-content",
                        message.role === 'user' ? "text-primary-foreground/90" : "text-foreground/90"
                      )}>
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                            em: ({ children }) => <em className="italic opacity-90">{children}</em>,
                            ul: ({ children }) => <ul className="list-disc ml-4 space-y-1.5 my-3">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal ml-4 space-y-1.5 my-3">{children}</ol>,
                            li: ({ children }) => <li className="my-1">{children}</li>,
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className={cn("px-1.5 py-0.5 rounded text-xs font-mono", message.role === 'user' ? "bg-white/20 text-white" : "bg-muted text-foreground")}>{children}</code>
                              ) : (
                                <code className={cn(className, "rounded-lg block p-4 my-3 overflow-x-auto text-xs", message.role === 'user' ? "bg-black/20 text-white" : "bg-muted text-foreground")}>{children}</code>
                              );
                            },
                            pre: ({ children }) => (
                              <pre className="contents">
                                {children}
                              </pre>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className={cn("border-l-4 pl-4 italic my-3", message.role === 'user' ? "border-white/30" : "border-primary/30")}>
                                {children}
                              </blockquote>
                            ),
                            a: ({ href, children }) => (
                              <a href={href} className={cn("underline underline-offset-4 decoration-2", message.role === 'user' ? "text-white hover:text-white/80" : "text-primary hover:text-primary/80")} target="_blank" rel="noopener noreferrer">
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {part.text}
                        </ReactMarkdown>
                      </div>
                    );
                  }

                  if (part.type === 'file') {
                    return (
                      <div key={idx} className="mt-4 space-y-2 first:mt-0">
                        <div className={cn(
                          "relative overflow-hidden rounded-xl border-2 transition-all duration-300 group shadow-inner",
                          message.role === 'user' ? "border-white/10 bg-black/10" : "border-border bg-background/50"
                        )}>
                          <img
                            src={part.url}
                            alt={part.filename || 'Attachment'}
                            className="max-h-[400px] w-full object-contain p-1"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                            <button
                              onClick={() => onSendToCanvas({ 
                                type: 'image', 
                                imageUrl: part.url, 
                                title: part.filename || 'Image',
                                content: part.filename || 'Image upload',
                                data: { source: 'research' }
                              })}
                              className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100 flex items-center gap-2 bg-white text-black px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-2xl hover:bg-emerald-500 hover:text-white"
                            >
                              <Sparkles size={14} />
                              Send to Canvas
                            </button>
                          </div>
                        </div>
                        <div className={cn(
                          "flex items-center gap-2 px-1",
                          message.role === 'user' ? "text-white/40" : "text-muted-foreground/60"
                        )}>
                          <div className="flex items-center gap-1.5 py-1 px-2 rounded-md bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                            <Image size={10} className="shrink-0" />
                            <span className="text-[9px] uppercase tracking-widest font-mono truncate max-w-[200px]">{part.filename || 'Image Attachment'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Handle tool parts (AI SDK: type is tool-${toolName}, props on part)
                  if (isToolUIPart(part)) {
                    const toolName = getToolName(part);
                    const toolCallId = part.toolCallId;
                    const state = part.state;
                    const toolInvocationArgs = part.state !== 'input-streaming' ? (part.input as Record<string, unknown> | undefined) : undefined;
                    const toolInvocationResult = part.state === 'output-available' ? (part.output as unknown) : undefined;
                    
                    console.log('[tool-invocation] 🔍 Processing tool invocation:', {
                      toolName,
                      toolCallId,
                      state,
                      messageId: message.id,
                      messageRole: message.role,
                      partType: part.type,
                      hasArgs: !!toolInvocationArgs,
                      hasResult: !!toolInvocationResult,
                    });
                    
                    if (!toolCallId) {
                      console.warn('[tool-invocation] No toolCallId found, skipping render');
                      return null;
                    }
                    
                    if (toolName === 'renameProject') {
                      const args = (toolInvocationArgs ?? {}) as unknown as RenameProjectArgs;
                      const result = state === 'output-available' ? (toolInvocationResult as { name?: string } | null) : null;
                      
                      // Extract name from args or result
                      const name = args?.name || result?.name;
                      
                      console.log('[renameProject] Tool invocation render:', {
                        toolCallId,
                        state,
                        hasName: !!name,
                        name,
                        args: Object.keys(args || {}),
                        argsContent: args,
                        result: result ? Object.keys(result) : null,
                      });
                      
                      // If we have a name and we're in result state, execute the rename
                      if (name && state === 'output-available' && projectId) {
                        // Execute rename and await it to ensure it completes
                        runRenameProject({
                          id: projectId,
                          name: name
                        }).then(() => {
                          console.log('[renameProject] Successfully renamed project to:', name);
                        }).catch((error) => {
                          console.error('[renameProject] Failed to rename:', error);
                        });
                      }
                      
                      if (!name) {
                        console.warn('[renameProject] No name available:', {
                          toolCallId,
                          state,
                          args: Object.keys(args || {}),
                          result: result ? Object.keys(result) : null,
                        });
                      }
                      
                      return (
                        <div key={toolCallId} className="mt-4 flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-xl px-4 py-2 animate-in fade-in slide-in-from-left-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Bot size={14} className="text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Project Renamed</span>
                            <span className="text-xs font-bold text-foreground">{name || 'Unknown'}</span>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'generateSoleSpec') {
                      const args = (toolInvocationArgs ?? {}) as unknown as GenerateSoleSpecArgs;
                      
                      return (
                        <div key={toolCallId} className="mt-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-muted px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers size={14} className="text-emerald-500" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Sole Builder Spec</span>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">SOLE_UNIT_V1</div>
                          </div>
                          
                          <div className="p-5 grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Midsole Material</span>
                                <div className="text-xs font-medium text-foreground">{args.midsoleMaterial || 'N/A'}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Outsole Material</span>
                                <div className="text-xs font-medium text-foreground">{args.outsoleMaterial || 'N/A'}</div>
                              </div>
                              <div className="flex gap-4">
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Stack (H/F)</span>
                                  <div className="text-xs font-medium text-foreground">{args.stackHeightHeel || 0}/{args.stackHeightForefoot || 0}mm</div>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Drop</span>
                                  <div className="text-xs font-medium text-foreground">{args.drop || 0}mm</div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Plate Tech</span>
                                <div className="flex items-center gap-1.5">
                                  <div className={cn("w-1.5 h-1.5 rounded-full", args.plateType === 'None' ? "bg-muted-foreground" : "bg-blue-500")} />
                                  <div className="text-xs font-medium text-foreground">{args.plateType || 'N/A'}</div>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Cushioning</span>
                                <div className="text-xs font-medium text-foreground">{args.cushioningLevel || 'N/A'}</div>
                              </div>
                              <div className="flex gap-4">
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Weight</span>
                                  <div className="text-xs font-medium text-foreground">{args.weightEst || 0}g</div>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Cost Est</span>
                                  <div className="text-xs text-emerald-500 font-bold">${args.costEst || 0}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="px-5 pb-4 space-y-2">
                            <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Tread Analysis</span>
                            <p className="text-[10px] text-muted-foreground leading-relaxed italic border-l border-border pl-3">
                              &quot;{args.treadPattern || 'No pattern specified'}&quot;
                            </p>
                          </div>
                          
                          <div className="px-4 py-3 bg-muted border-t border-border flex justify-end">
                            <button 
                              onClick={() => onSendToCanvas({ 
                                type: 'sole-spec', 
                                title: `Sole: ${args.midsoleMaterial || 'Unknown'}`,
                                content: `Technical Sole Unit: ${args.midsoleMaterial || 'Unknown'} Midsole, ${args.outsoleMaterial || 'Unknown'} Outsole. ${args.stackHeightHeel || 0}/${args.stackHeightForefoot || 0}mm Stack, ${args.drop || 0}mm Drop.`,
                                data: { ...args, source: 'research' }
                              })}
                              className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary-foreground hover:text-emerald-400 transition-colors bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl border border-border"
                            >
                              <Sparkles size={12} />
                              Add to Design Canvas
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'analyzeFootwearImage') {
                      const args = (toolInvocationArgs ?? {}) as unknown as AnalyzeFootwearImageArgs;
                      const result = state === 'output-available' ? (toolInvocationResult as { status?: string; message?: string } | null) : null;
                      const isAnalyzing = !result || result.status === 'analyzing';
                      
                      return (
                        <div key={toolCallId} className="mt-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                          <div className="bg-blue-500/10 px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Activity size={14} className="text-blue-500" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Image Analysis</span>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {isAnalyzing ? 'ANALYZING...' : 'ANALYSIS_COMPLETE'}
                            </div>
                          </div>
                          
                          <div className="p-5 space-y-4">
                            <div className="flex gap-4">
                              {args.imageUrls && args.imageUrls.length > 0 && (
                                <div className="flex gap-2 shrink-0">
                                  {args.imageUrls.slice(0, 3).map((url, idx) => (
                                    <div key={idx} className="w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted">
                                      <img src={url} alt={`${args.productName || 'Product'} - View ${idx + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                  ))}
                                  {args.imageUrls.length > 3 && (
                                    <div className="w-20 h-20 rounded-lg border border-border bg-muted flex items-center justify-center">
                                      <span className="text-[8px] text-muted-foreground">+{args.imageUrls.length - 3}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="flex-1 space-y-2">
                                <div className="text-xs font-bold text-foreground uppercase tracking-tight">{args.productName || 'Unknown Product'}</div>
                                {isAnalyzing ? (
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                      Analyzing footwear images to extract measurements, materials, and construction details...
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                                    Analysis complete. Review the extracted measurements and technical data below, then confirm to proceed with blueprint generation.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'requestTechnicalBlueprint') {
                      const args = (toolInvocationArgs ?? {}) as unknown as RequestTechnicalBlueprintArgs;
                      // Support both new format (imageUrls array) and old format (imageUrl string)
                      const imageUrls = args.imageUrls ?? ((args as RequestTechnicalBlueprintArgs & { imageUrl?: string }).imageUrl ? [(args as RequestTechnicalBlueprintArgs & { imageUrl?: string }).imageUrl!] : []);
                      const primaryImageUrl = imageUrls[0] || '';
                      
                      return (
                        <div key={toolCallId} className="mt-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                          <div className="bg-primary/10 px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Activity size={14} className="text-primary" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Blueprint Engine</span>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">READY_FOR_EXTRACTION</div>
                          </div>
                          
                          <div className="p-5 flex gap-4">
                            {primaryImageUrl && (
                              <div className="w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted shrink-0">
                                <img src={primaryImageUrl} alt={args.productName || 'Product'} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="flex-1 space-y-2">
                              <div className="text-xs font-bold text-foreground uppercase tracking-tight">{args.productName || 'Unknown Product'}</div>
                              <p className="text-[10px] text-muted-foreground leading-relaxed">
                                I&apos;m ready to generate the full Technical Blueprint. This includes 10+ factory-ready schematics, detailed BOM, and manufacturing specifications.
                              </p>
                              {args.confirmedMeasurements && (
                                <div className="mt-3 pt-3 border-t border-border space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Confirmed Measurements</span>
                                  {args.confirmedMeasurements.heelHeight && (
                                    <div className="text-[9px] text-foreground">Heel Height: {args.confirmedMeasurements.heelHeight}mm</div>
                                  )}
                                  {args.confirmedMeasurements.toeSpring && (
                                    <div className="text-[9px] text-foreground">Toe Spring: {args.confirmedMeasurements.toeSpring}mm</div>
                                  )}
                                  {args.confirmedMeasurements.measurements && Object.entries(args.confirmedMeasurements.measurements).slice(0, 3).map(([key, val]) => (
                                    <div key={key} className="text-[9px] text-foreground">{key}: {val}</div>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2 pt-1">
                                <span className="px-2 py-0.5 rounded-full bg-muted text-[8px] uppercase tracking-widest text-muted-foreground border border-border">10+ Schematics</span>
                                <span className="px-2 py-0.5 rounded-full bg-muted text-[8px] uppercase tracking-widest text-muted-foreground border border-border">Material BOM</span>
                                <span className="px-2 py-0.5 rounded-full bg-muted text-[8px] uppercase tracking-widest text-muted-foreground border border-border">Factory PDF</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="px-4 py-3 bg-muted border-t border-border flex justify-end gap-2">
                            <button 
                              onClick={() => onGenerateBlueprint?.({
                                imageUrls: primaryImageUrl ? [primaryImageUrl] : [],
                                productName: args.productName ?? '',
                              })}
                              className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary-foreground hover:bg-primary/90 transition-all bg-primary px-6 py-2 rounded-xl shadow-lg hover:shadow-primary/20"
                            >
                              <Sparkles size={12} />
                              Generate Technical Blueprint
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'updateProductBaselines') {
                      const args = (toolInvocationArgs ?? {}) as unknown as UpdateProductBaselinesArgs;
                      
                      return (
                        <div key={toolCallId} className="mt-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-emerald-500/10 px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Ruler size={14} className="text-emerald-500" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Technical Intake Profile</span>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">BASELINE_SYNCED</div>
                          </div>
                          
                          <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Units</span>
                              <div className="text-xs font-medium text-foreground">{args.unitSystem?.toUpperCase() || 'NOT SET'}</div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Size Run</span>
                              <div className="text-xs font-medium text-foreground">
                                {args.sizeRun ? `${args.sizeRun.system} ${args.sizeRun.sizes[0]}-${args.sizeRun.sizes[args.sizeRun.sizes.length-1]}` : 'NOT SET'}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Last Shape</span>
                              <div className="text-xs font-medium text-foreground">{args.lastShape || 'NOT SET'}</div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Heel / Spring</span>
                              <div className="text-xs font-medium text-foreground">
                                {args.heelHeight || 0}mm / {args.toeSpring || 0}mm
                              </div>
                            </div>
                            {args.measurements && Object.entries(args.measurements).map(([key, val]) => (
                              <div key={key} className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">{key}</span>
                                <div className="text-xs font-medium text-foreground">{val as string}</div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="px-4 py-3 bg-muted border-t border-border flex items-center justify-between">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <div className="w-1.5 h-1.5 rounded-full bg-neutral-700" />
                            </div>
                            <div className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Profile Updated</div>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'generateImage' && toolCallId) {
                      console.log('[generateImage RENDER] 🎨 RENDERING TOOL INVOCATION:', {
                        toolCallId,
                        state,
                        partType: part.type,
                        hasArgs: !!toolInvocationArgs,
                        hasResult: !!toolInvocationResult,
                      });
                      
                      const args = (toolInvocationArgs ?? {}) as unknown as GenerateImageArgs;
                      const result = state === 'output-available' ? (toolInvocationResult as GenerateImageResult | null) : null;
                      
                      // Extract prompt from args or result (execute function returns the args)
                      const prompt = args?.prompt || result?.prompt;
                      const aspectRatio = args?.aspectRatio || result?.aspectRatio || '1:1';
                      let referenceImage = args?.referenceImage || result?.referenceImage;
                      
                      console.log('[generateImage] 📋 Extracted values:', {
                        prompt: prompt ? `${prompt.substring(0, 50)}...` : 'MISSING',
                        promptLength: prompt?.length || 0,
                        aspectRatio,
                        hasReferenceImage: !!referenceImage,
                        referenceImagePreview: referenceImage?.substring(0, 50),
                      });
                      
                      // If no reference image in args, try to find one in the current message's attachments
                      if (!referenceImage) {
                        // Find the message containing this tool invocation
                        const currentMessage = messages.find(m => 
                          m.parts?.some(p => isToolUIPart(p) && p.toolCallId === toolCallId)
                        );
                        
                        if (currentMessage) {
                          const imageParts = currentMessage.parts?.filter((p): p is FileUIPart => p.type === 'file' && p.mediaType?.startsWith('image/'));
                          if (imageParts && imageParts.length > 0) {
                            referenceImage = imageParts[0].url;
                            console.log('[generateImage] Found reference image in message attachments:', referenceImage.substring(0, 50));
                          } else {
                            const messageIndex = messages.findIndex(m => m.id === currentMessage.id);
                            for (let i = messageIndex - 1; i >= 0; i--) {
                              const prevMessage = messages[i];
                              if (prevMessage.role === 'user') {
                                const prevImageParts = prevMessage.parts?.filter((p): p is FileUIPart => p.type === 'file' && p.mediaType?.startsWith('image/'));
                                if (prevImageParts && prevImageParts.length > 0) {
                                  referenceImage = prevImageParts[0].url;
                                  console.log('[generateImage] Found reference image in previous message:', referenceImage?.substring(0, 50) ?? '');
                                  break;
                                }
                              }
                            }
                          }
                        }
                      }
                      
                      console.log('[generateImage RENDER] About to render ImageGenerationState with toolCallId:', toolCallId);

                      return (
                        <ImageGenerationState 
                          key={`img-gen-${toolCallId}`} 
                          toolCallId={toolCallId}
                          onComplete={(url) => {
                            const sent = autoSendByToolCallIdRef.current.get(toolCallId);
                            if (sent === url) return;
                            autoSendByToolCallIdRef.current.set(toolCallId, url);
                            
                            console.log('[generateImage] Auto-sending to canvas:', url);
                            onSendToCanvas({
                              type: 'image',
                              imageUrl: url,
                              title: 'Research Design Concept',
                              content: prompt || 'Generated footwear concept from research session.',
                              data: { source: 'research' }
                            });
                          }}
                        >
                          {(imageState) => {
                            // Debug logging
                            console.log('[generateImage render] State from Convex:', {
                              toolCallId,
                              hasImageState: !!imageState,
                              status: imageState?.status,
                              hasUrl: !!imageState?.url,
                              url: imageState?.url?.substring(0, 50),
                              hasImages: !!imageState?.images,
                              imageCount: imageState?.images?.length ?? 0,
                              images: imageState?.images,
                              fullState: imageState,
                            });
                            
                            // Determine state from Convex query result
                            const isCompleted = imageState?.status === 'completed' && (!!imageState?.url || (imageState?.images && imageState.images.length > 0));
                            const isError = imageState?.status === 'error' || (state === 'output-available' && !prompt && !imageState);
                            const isGenerating = 
                              !isCompleted && !isError && (
                                imageState?.status === 'generating' || 
                                (!imageState && prompt && prompt.length >= 50)
                              );
                            
                            console.log('[generateImage render] State flags:', {
                              toolCallId,
                              isCompleted,
                              isError,
                              isGenerating,
                              status: imageState?.status,
                              hasUrl: !!imageState?.url,
                            });
                            
                            return (
                        <div key={toolCallId} className="mt-4 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-muted px-4 py-3 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-purple-500" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Image Generation</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isGenerating && (
                                <>
                                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                  <div className="text-xs font-medium text-orange-500">Generating...</div>
                                </>
                              )}
                              {isCompleted && (
                                <>
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <div className="text-xs font-medium text-emerald-500">Complete</div>
                                </>
                              )}
                              {isError && (
                                <>
                                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  <div className="text-xs font-medium text-red-500">Error</div>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="p-5 space-y-4">

                            {/* Generated image or loading state */}
                            {isCompleted && (imageState?.url || (imageState?.images && imageState.images.length > 0)) ? (
                              <div className="space-y-3">
                                {imageState.images && imageState.images.length > 0 ? (
                                  <div className="grid grid-cols-2 gap-3">
                                    {imageState.images.map((img, idx) => (
                                      <div 
                                        key={idx} 
                                        className="relative group overflow-hidden rounded-xl border-2 border-border cursor-pointer"
                                        onClick={() => {
                                          setFullscreenImages(imageState.images!.map(i => ({ url: i.url, alt: `${args?.prompt || prompt || 'Generated image'}` })));
                                          setFullscreenIndex(idx);
                                          setIsFullscreenOpen(true);
                                        }}
                                      >
                                        <img
                                          src={img.url}
                                          alt={`${args?.prompt || prompt || 'Generated image'} ${idx + 1}`}
                                          className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                                          onLoad={() => console.log('[generateImage] ✅ Image loaded:', img.url)}
                                          onError={(e) => console.error('[generateImage] ❌ Image failed to load:', img.url, e)}
                                        />
                                        {imageState.images && (
                                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[8px] uppercase tracking-widest font-bold text-white shadow-xl">
                                            {idx + 1}/{imageState.images.length}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div 
                                    className="relative group overflow-hidden rounded-xl border-2 border-border cursor-pointer"
                                    onClick={() => {
                                      const imageUrl = imageState.url || (imageState.images && imageState.images.length > 0 ? imageState.images[0].url : '');
                                      if (imageUrl) {
                                        setFullscreenImages([{ url: imageUrl, alt: args?.prompt || prompt || 'Generated image' }]);
                                        setFullscreenIndex(0);
                                        setIsFullscreenOpen(true);
                                      }
                                    }}
                                  >
                                    <img
                                      src={imageState.url || (imageState.images && imageState.images.length > 0 ? imageState.images[0].url : '')}
                                      alt={args?.prompt || prompt || 'Generated image'}
                                      className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
                                      onLoad={() => console.log('[generateImage] ✅ Image loaded:', imageState.url || imageState.images?.[0]?.url)}
                                      onError={(e) => console.error('[generateImage] ❌ Image failed to load:', imageState.url || imageState.images?.[0]?.url, e)}
                                    />
                                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[8px] uppercase tracking-widest font-bold text-white shadow-xl">
                                      Research Design
                                    </div>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      const imagesToSend = imageState.images && imageState.images.length > 0
                                        ? imageState.images 
                                        : [{ url: imageState.url || (imageState.images && imageState.images.length > 0 ? imageState.images[0].url : ''), storageKey: '' }];
                                      imagesToSend.forEach((img, idx) => {
                                        if (img.url) {
                                          onSendToCanvas({
                                            type: 'image',
                                            imageUrl: img.url,
                                            title: `Research Design Concept ${imagesToSend.length > 1 ? idx + 1 : ''}`,
                                            content: args?.prompt || prompt || 'Generated footwear concept from research session.',
                                            data: { source: 'research' }
                                          });
                                        }
                                      });
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary-foreground hover:bg-primary/90 transition-colors bg-primary px-4 py-2 rounded-xl border border-border"
                                  >
                                    <Sparkles size={12} />
                                    Send {imageState.images && imageState.images.length > 1 ? `All (${imageState.images.length})` : ''} to Canvas
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Logic to switch to studio mode could go here
                                      // For now, we'll just inform the user
                                      window.dispatchEvent(new CustomEvent('switch-workspace-mode', { detail: 'studio' }));
                                    }}
                                    className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-foreground hover:bg-muted transition-colors bg-background px-4 py-2 rounded-xl border border-border group"
                                  >
                                    <Maximize2 size={12} className="group-hover:text-emerald-500 transition-colors" />
                                    View in Studio
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!projectId) return;
                                      await convertToProduct({
                                        id: projectId,
                                        name: args?.prompt?.slice(0, 30) || prompt?.slice(0, 30) || 'New Shoe Product',
                                        imageUrl: imageState.url!,
                                        description: args?.prompt || prompt || 'Generated footwear concept.'
                                      });
                                      router.push(`/${projectContext?.workshopName || 'default'}/products`);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest font-bold text-emerald-500 hover:bg-emerald-500/10 transition-colors bg-emerald-500/5 px-4 py-2 rounded-xl border border-emerald-500/20"
                                  >
                                    <Check size={12} />
                                    Set as Product
                                  </button>
                                </div>
                              </div>
                            ) : isGenerating ? (
                              <div className="aspect-square bg-muted rounded-xl flex items-center justify-center border border-dashed border-border animate-pulse">
                                <div className="flex flex-col items-center gap-3">
                                  <div className="relative">
                                    <Activity size={32} className="text-primary animate-spin" />
                                    <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-ping" />
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-[10px] text-foreground uppercase tracking-widest font-medium">Synthesizing Image</span>
                                    <span className="text-[9px] text-muted-foreground">This may take 20-60 seconds</span>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            
                            {isError && (
                              <div className="aspect-square bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                                <div className="flex flex-col items-center gap-2 px-4 text-center">
                                  <span className="text-[10px] text-red-500 uppercase tracking-widest">Generation Failed</span>
                                  {!prompt ? (
                                    <span className="text-[9px] text-muted-foreground">Missing prompt parameter. Please ask again with more details.</span>
                                  ) : (
                                    <>
                                      <span className="text-[9px] text-muted-foreground">Please try again</span>
                                      {imageState && 'error' in imageState && imageState.error && (
                                        <span className="text-[8px] text-red-400/80 font-mono mt-1 break-all">
                                          {typeof imageState.error === 'string' ? imageState.error.substring(0, 100) : 'Unknown error'}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {!prompt && state === 'output-available' && !isError && (
                              <div className="aspect-square bg-yellow-500/10 rounded-xl flex items-center justify-center border border-yellow-500/20">
                                <div className="flex flex-col items-center gap-2 px-4 text-center">
                                  <span className="text-[10px] text-yellow-500 uppercase tracking-widest">Waiting for Prompt</span>
                                  <span className="text-[9px] text-muted-foreground">The image generation tool was called but no prompt was provided.</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                            );
                          }}
                        </ImageGenerationState>
                      );
                    }

                    if (toolName === 'sendToCanvas' && state === 'output-available') {
                      const args = (toolInvocationArgs ?? {}) as unknown as SendToCanvasArgs;
                      const { title, content } = args;
                      return (
                        <div key={toolCallId} className="mt-4 pt-4 flex justify-between items-center bg-emerald-500/5 -mx-4 px-4 py-3 border-y border-emerald-500/10">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Intelligence Card</span>
                            <span className="text-xs text-muted-foreground font-medium">{title || 'Untitled'}</span>
                          </div>
                          <button 
                            onClick={() => onSendToCanvas({ title: title ?? 'Untitled', content: content ?? '', type: args.type })}
                            className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-primary-foreground hover:text-emerald-400 transition-colors bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg border border-border"
                          >
                            <Sparkles size={12} />
                            Send to Canvas
                          </button>
                        </div>
                      );
                    }
                  }
                  
                  return null;
                })}
                
                {/* Fallback for old messages without tool calls but with long content */}
                {message.role === 'assistant' && !message.parts.some(p => isToolUIPart(p)) && message.parts.some((p): p is TextUIPart => p.type === 'text' && (p as TextUIPart).text.length > 200) && (
                  <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Intelligence Card</span>
                    <button 
                      onClick={() => {
                        const textPart = message.parts.find((p): p is TextUIPart => p.type === 'text');
                        const textContent = textPart?.text ?? '';
                        onSendToCanvas({ title: 'Research Note', content: textContent, type: 'research', data: { source: 'research' } });
                      }}
                      className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-foreground hover:text-emerald-400 transition-colors"
                    >
                      <Sparkles size={12} />
                      Send to Canvas
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3 items-start"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
              <Bot size={12} />
              <span>Zeph is thinking...</span>
            </div>
            <div className="bg-muted border border-border rounded-2xl rounded-tl-none p-4 w-[70%] space-y-3">
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-2 w-[80%] rounded-full" />
              <Skeleton className="h-2 w-[90%] rounded-full" />
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {/* Fullscreen Image Viewer */}
      <FullscreenImageViewer
        images={fullscreenImages}
        initialIndex={fullscreenIndex}
        open={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
      />
    </div>
  );
}

