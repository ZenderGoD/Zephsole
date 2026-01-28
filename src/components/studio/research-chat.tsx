'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { cn } from '@/lib/utils';
import { User, Bot, Sparkles, Image, Activity, Ruler, Layers, Beaker } from 'lucide-react';
import { MediaAttachment, PromptPayload } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

interface ResearchChatProps {
  onSendToCanvas: (data: any) => void;
  pendingMessage?: PromptPayload;
  isGenerating?: boolean;
  onGenerationComplete?: () => void;
  projectId?: Id<'projects'>;
  projectContext?: {
    projectName?: string;
    workshopName?: string;
    status?: string;
  };
}

export function ResearchChat({ onSendToCanvas, pendingMessage, isGenerating, onGenerationComplete, projectId, projectContext }: ResearchChatProps) {
  // Load persisted messages from Convex
  const persistedMessages = useQuery(
    api.intelligence.getMessages,
    projectId ? { projectId } : 'skip'
  );

  const saveMessage = useMutation(api.intelligence.sendMessage);
  const designContext = useQuery(api.studio.getDesignContext, projectId ? { projectId } : 'skip');
  const runUpdateDesignContext = useMutation(api.studio.updateDesignContext);
  const runUpdateBOM = useMutation(api.studio.updateBOM);

  // Convert persisted messages to UIMessage format
  const initialMessages = useMemo(() => {
    const buildFileParts = (attachments?: {
      url: string;
      contentType: string;
      fileName: string;
    }[]) => {
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

    return persistedMessages.map((msg) => ({
      id: msg._id,
      role: msg.role as 'user' | 'assistant',
      parts: [
        ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
        ...buildFileParts((msg as any).attachments),
      ],
    }));
  }, [persistedMessages]);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    api: '/api/chat',
    body: { 
      projectId, 
      projectContext: {
        ...projectContext,
        designContext
      } 
    },
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === 'updateDesignContext' && projectId) {
        const args = toolCall.args as any;
        await runUpdateDesignContext({
          projectId,
          ...args
        });
        return { success: true, updated: 'designContext' };
      }
      if (toolCall.toolName === 'updateBOM' && projectId) {
        const args = toolCall.args as any;
        await runUpdateBOM({
          projectId,
          ...args
        });
        return { success: true, updated: 'BOM' };
      }
    },
    initialMessages: initialMessages.length > 0 ? initialMessages : [
      {
        id: '1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'Welcome to Research Intelligence. I can help you analyze market trends, materials, and competitive landscapes. What would you like to explore today?' }],
      }
    ],
    onFinish: (message) => {
      // Save assistant message to Convex
      if (projectId && message && Array.isArray(message.parts)) {
        const textContent = message.parts.find(p => p.type === 'text')?.text || '';
        const fileParts = message.parts.filter((p) => p.type === 'file') as {
          type: 'file';
          url: string;
          mediaType: string;
          filename?: string;
        }[];

        if (textContent || fileParts.length > 0) {
          saveMessage({
            projectId,
            role: 'assistant',
            content: textContent,
            attachments: fileParts.map((file) => ({
              url: file.url,
              fileName: file.filename || 'Image',
              contentType: file.mediaType || 'application/octet-stream',
            })),
          });
        }
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  // Track saved message IDs to avoid duplicates
  const hasLoadedPersistedMessages = useRef(false);

  // Sync persisted messages when they load (only once)
  useEffect(() => {
    if (persistedMessages && persistedMessages.length > 0 && !hasLoadedPersistedMessages.current) {
      const convertedMessages = persistedMessages.map((msg) => ({
        id: msg._id,
        role: msg.role as 'user' | 'assistant',
        parts: [
          ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
          ...((msg as any).attachments || []).map((attachment: any) => ({
            type: 'file' as const,
            url: attachment.url,
            mediaType: attachment.contentType,
            filename: attachment.fileName,
          })),
        ],
      }));
      
      setMessages(convertedMessages);
      hasLoadedPersistedMessages.current = true;
    } else if (persistedMessages && persistedMessages.length === 0) {
      hasLoadedPersistedMessages.current = true;
    }
  }, [persistedMessages, setMessages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageKeyRef = useRef<string>('');
  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!pendingMessage || isLoading) return;

    const attachmentParts =
      pendingMessage.attachments?.map((attachment) => ({
        type: 'file' as const,
        url: attachment.base64
          ? `data:${attachment.contentType};base64,${attachment.base64}`
          : attachment.url,
        mediaType: attachment.contentType,
        filename: attachment.fileName,
        // Custom field to pass base64 to our own API route for vision
        data: attachment.base64,
      })) || [];

    const messageKey = `${pendingMessage.text}-${attachmentParts
      .map((p) => p.filename)
      .join('|')}`;

    if (messageKey === lastMessageKeyRef.current) return;
    lastMessageKeyRef.current = messageKey;

    sendMessage({
      parts: [
        { type: 'text', text: pendingMessage.text },
        ...attachmentParts,
      ],
    });
    
    // Save user message to Convex
    if (projectId) {
      saveMessage({
        projectId,
        role: 'user',
        content: pendingMessage.text,
        attachments: pendingMessage.attachments?.map((attachment) => ({
          mediaId: attachment.id,
          url: attachment.url,
          fileName: attachment.fileName,
          contentType: attachment.contentType,
          size: attachment.size,
        })),
      });
    }
  }, [pendingMessage, sendMessage, isLoading, projectId, saveMessage]);

  useEffect(() => {
    if (!pendingMessage && !isLoading) {
      lastMessageKeyRef.current = '';
    }
  }, [pendingMessage, isLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoading && isGenerating && onGenerationComplete) {
      onGenerationComplete();
    }
  }, [isLoading, isGenerating, onGenerationComplete]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto w-full pt-8 px-6 pb-28">
      <div className="flex-1 flex flex-col gap-8 overflow-y-auto pr-2 min-h-0 scrollbar-hide" data-lenis-prevent>
        <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 font-mono mb-4 sticky top-0 bg-neutral-950/80 backdrop-blur-md py-2 z-10">
          Research Intelligence Feed
        </div>
        
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
                "flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-neutral-600",
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
              </div>
              
              <div className={cn(
                "max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed transition-all",
                message.role === 'user' 
                  ? "bg-white text-black font-medium rounded-tr-none shadow-lg" 
                  : "bg-neutral-900/50 border border-white/5 text-neutral-300 rounded-tl-none backdrop-blur-sm shadow-xl"
              )}>
                {message.parts?.map((part, idx) => {
                  if (part.type === 'text') {
                    return (
                      <div key={idx} className={cn(
                        "markdown-content",
                        message.role === 'user' ? "text-black" : "text-neutral-300"
                      )}>
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className={cn("font-semibold", message.role === 'user' ? "text-black" : "text-white")}>{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                            ul: ({ children }) => <ul className="list-disc ml-4 space-y-1 my-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal ml-4 space-y-1 my-2">{children}</ol>,
                            li: ({ children }) => <li className="my-1">{children}</li>,
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className={cn("px-1.5 py-0.5 rounded text-xs font-mono", message.role === 'user' ? "bg-neutral-200 text-black" : "bg-neutral-800 text-neutral-300")}>{children}</code>
                              ) : (
                                <code className={cn(className, "rounded-lg block p-3 my-2 overflow-x-auto", message.role === 'user' ? "bg-neutral-100 text-black" : "bg-neutral-800 text-neutral-300")}>{children}</code>
                              );
                            },
                            pre: ({ children }) => (
                              <pre className={cn("p-3 rounded-lg overflow-x-auto my-2", message.role === 'user' ? "bg-neutral-100" : "bg-neutral-800")}>
                                {children}
                              </pre>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className={cn("border-l-2 pl-4 italic my-2", message.role === 'user' ? "border-neutral-300" : "border-white/20")}>
                                {children}
                              </blockquote>
                            ),
                            a: ({ href, children }) => (
                              <a href={href} className="text-emerald-500 hover:underline" target="_blank" rel="noopener noreferrer">
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
                      <div key={idx} className="mt-3 space-y-2 first:mt-0">
                        <div className={cn(
                          "relative overflow-hidden rounded-xl border group",
                          message.role === 'user' ? "border-black/5 bg-black/5" : "border-white/10 bg-neutral-900/60"
                        )}>
                          <img
                            src={part.url}
                            alt={part.filename || 'Attachment'}
                            className="max-h-80 w-full object-contain bg-neutral-950/20"
                          />
                          <button
                            onClick={() => onSendToCanvas({ 
                              type: 'image', 
                              imageUrl: part.url, 
                              title: part.filename || 'Image',
                              content: part.filename || 'Image upload',
                            })}
                            className="absolute bottom-3 right-3 text-[10px] uppercase tracking-widest font-bold text-white bg-black/60 backdrop-blur-md hover:bg-emerald-500 px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 shadow-lg"
                          >
                            <Sparkles size={12} />
                            Send to Canvas
                          </button>
                        </div>
                        <div className={cn(
                          "flex items-center gap-2 text-[10px] uppercase tracking-widest font-mono",
                          message.role === 'user' ? "text-neutral-500" : "text-neutral-500"
                        )}>
                          <Image size={12} />
                          <span>{part.filename || 'Image Attachment'}</span>
                        </div>
                      </div>
                    );
                  }
                  
                  if (part.type === 'tool-invocation') {
                    const { toolName, toolCallId, state } = part.toolInvocation;
                    
                    if (toolName === 'generateSoleSpec') {
                      const args = part.toolInvocation.args as any;
                      const result = state === 'result' ? (part.toolInvocation.result as any) : null;
                      
                      return (
                        <div key={toolCallId} className="mt-4 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-white/5 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers size={14} className="text-emerald-500" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Sole Builder Spec</span>
                            </div>
                            <div className="text-[10px] font-mono text-neutral-500">SOLE_UNIT_V1</div>
                          </div>
                          
                          <div className="p-5 grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Midsole Material</span>
                                <div className="text-xs font-medium text-white">{args.midsoleMaterial}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Outsole Material</span>
                                <div className="text-xs font-medium text-white">{args.outsoleMaterial}</div>
                              </div>
                              <div className="flex gap-4">
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Stack (H/F)</span>
                                  <div className="text-xs font-medium text-white">{args.stackHeightHeel}/{args.stackHeightForefoot}mm</div>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Drop</span>
                                  <div className="text-xs font-medium text-white">{args.drop}mm</div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Plate Tech</span>
                                <div className="flex items-center gap-1.5">
                                  <div className={cn("w-1.5 h-1.5 rounded-full", args.plateType === 'None' ? "bg-neutral-600" : "bg-blue-500")} />
                                  <div className="text-xs font-medium text-white">{args.plateType}</div>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Cushioning</span>
                                <div className="text-xs font-medium text-white">{args.cushioningLevel}</div>
                              </div>
                              <div className="flex gap-4">
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Weight</span>
                                  <div className="text-xs font-medium text-white">{args.weightEst}g</div>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Cost Est</span>
                                  <div className="text-xs font-medium text-emerald-400 font-bold">${args.costEst}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="px-5 pb-4 space-y-2">
                            <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Tread Analysis</span>
                            <p className="text-[10px] text-neutral-400 leading-relaxed italic border-l border-white/10 pl-3">
                              "{args.treadPattern}"
                            </p>
                          </div>
                          
                          <div className="px-4 py-3 bg-white/5 border-t border-white/5 flex justify-end">
                            <button 
                              onClick={() => onSendToCanvas({ 
                                type: 'sole-spec', 
                                title: `Sole: ${args.midsoleMaterial}`,
                                content: `Technical Sole Unit: ${args.midsoleMaterial} Midsole, ${args.outsoleMaterial} Outsole. ${args.stackHeightHeel}/${args.stackHeightForefoot}mm Stack, ${args.drop}mm Drop.`,
                                data: args
                              })}
                              className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white hover:text-emerald-400 transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/5"
                            >
                              <Sparkles size={12} />
                              Add to Design Canvas
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'generateImage') {
                      const args = part.toolInvocation.args as any;
                      const result = state === 'result' ? (part.toolInvocation.result as any) : null;
                      
                      return (
                        <div key={toolCallId} className="mt-4 bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                          <div className="bg-white/5 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-purple-500" />
                              <span className="text-[10px] uppercase tracking-widest font-bold">Image Generation</span>
                            </div>
                            <div className="text-[10px] font-mono text-neutral-500">NANO_BANANA_PRO</div>
                          </div>
                          
                          <div className="p-5 space-y-4">
                            <div className="space-y-1">
                              <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Prompt</span>
                              <div className="text-[10px] text-neutral-300 leading-relaxed italic border-l border-white/10 pl-3">
                                "{args.prompt}"
                              </div>
                            </div>
                            
                            <div className="flex gap-4">
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Aspect Ratio</span>
                                <div className="text-xs font-medium text-white">{args.aspectRatio}</div>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Status</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                                  <div className="text-xs font-medium text-orange-500">Queued</div>
                                </div>
                              </div>
                            </div>

                            {/* This is where the actual generation result would appear */}
                            <div className="aspect-square bg-white/5 rounded-xl flex items-center justify-center border border-dashed border-white/10">
                              <div className="flex flex-col items-center gap-2">
                                <Activity size={24} className="text-neutral-700 animate-pulse" />
                                <span className="text-[10px] text-neutral-600 uppercase tracking-widest">Synthesizing...</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (toolName === 'sendToCanvas' && state === 'result') {
                      const { title, content } = part.toolInvocation.args;
                      return (
                        <div key={toolCallId} className="mt-4 pt-4 flex justify-between items-center bg-emerald-500/5 -mx-4 px-4 py-3 border-y border-emerald-500/10">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Intelligence Card</span>
                            <span className="text-xs text-neutral-400 font-medium">{title}</span>
                          </div>
                          <button 
                            onClick={() => onSendToCanvas({ content, title, type: part.toolInvocation.args.type })}
                            className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white hover:text-emerald-400 transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5"
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
                {message.role === 'assistant' && !message.parts.some(p => p.type === 'tool-invocation') && message.parts.some(p => p.type === 'text' && p.text.length > 200) && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest text-neutral-500">Intelligence Card</span>
                    <button 
                      onClick={() => {
                        const textContent = message.parts.find(p => p.type === 'text')?.text || '';
                        onSendToCanvas({ content: textContent, type: 'research' });
                      }}
                      className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white hover:text-emerald-400 transition-colors"
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
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
