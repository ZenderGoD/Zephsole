import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages, tool, UIMessage } from 'ai';
import { z } from 'zod';
import { AGENT_PERSONAS, AgentId } from '@/lib/agents/personas';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  parts?: Array<{
    type: string;
    text?: string;
    content?: string;
    image?: string;
    url?: string;
    mediaType?: string;
    data?: string;
    toolInvocation?: {
      toolCallId: string;
      toolName: string;
      args?: Record<string, unknown>;
      state?: string;
      result?: unknown;
    };
  }>;
  content?: string | Array<unknown>;
}

interface ChatRequest {
  messages: ChatMessage[];
  projectId?: string;
  projectContext?: {
    projectName?: string;
    workshopName?: string;
    status?: string;
    designContext?: {
      footwearType?: string;
      gender?: string;
      aestheticVibe?: string;
      targetAudience?: string;
      colorPalette?: Array<{ name: string; hex: string; usage?: string }>;
      keyMaterials?: string[];
      summary?: string;
    };
  };
}

export const runtime = 'edge';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, projectContext }: ChatRequest = await req.json();

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response('OpenRouter API key not configured', { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    // Normalize messages for the model, preserving file parts for vision
    const normalized: UIMessage[] = messages
      .filter((msg: ChatMessage) => msg && msg.role && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'))
      .map((msg: ChatMessage) => {
        const parts = Array.isArray(msg.parts) ? msg.parts : 
                     Array.isArray(msg.content) ? (msg.content as Array<NonNullable<ChatMessage['parts']>[number]>) : 
                     typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : [];

        return {
          id: msg.id || Math.random().toString(),
          role: msg.role as 'user' | 'assistant' | 'system',
          parts: parts
            .map((p) => {
              if (p.type === 'text') {
                const text = p.text || p.content;
                if (!text) return null;
                return { type: 'text' as const, text };
              }
              if (p.type === 'image') {
                const image = p.image || p.url;
                if (!image) return null;
                return { type: 'file' as const, data: image, mediaType: 'image/jpeg' };
              }
              if (p.type === 'file') {
                const isImage = p.mediaType?.startsWith('image/') || p.url?.startsWith('data:image/');
                if (isImage) {
                  const imageData = p.data ? `data:${p.mediaType || 'image/jpeg'};base64,${p.data}` : p.url;
                  if (!imageData) return null;
                  return { type: 'file' as const, data: imageData, mediaType: p.mediaType || 'image/jpeg' };
                }
                return null;
              }
              if (p.type === 'tool-invocation' || p.type?.startsWith('tool-')) {
                const invocation = p.toolInvocation || (p as any);
                const toolResult = invocation.state === 'result' ? invocation.result : (p as any).result;
                
                if (invocation.state === 'result' || toolResult) {
                  return {
                    type: 'tool-result' as const,
                    toolCallId: invocation.toolCallId || '',
                    toolName: invocation.toolName || 'generateImage',
                    result: toolResult,
                  };
                }
                return {
                  type: 'tool-call' as const,
                  toolCallId: invocation.toolCallId || '',
                  toolName: invocation.toolName || 'generateImage',
                  args: invocation.args || {},
                };
              }
              return null;
            })
            .filter((p): p is Exclude<typeof p, null> => p !== null)
        } as UIMessage;
      })
      .filter((m) => m.parts.length > 0);

    const coreMessages = await convertToModelMessages(normalized);

    const hasImages = normalized.some(msg => 
      msg.parts.some((p) => p.type === 'file' && (p as any).mediaType?.startsWith('image/'))
    );
    const imageCount = normalized.reduce((count, msg) => 
      count + msg.parts.filter(p => p.type === 'file' && (p as any).mediaType?.startsWith('image/')).length, 0
    );

    const systemPrompt = `
    ${AGENT_PERSONAS.zeph.systemPrompt}
    ${hasImages ? `VISION CAPABILITIES ENABLED: You can see ${imageCount} image(s).` : ''}
    ${projectContext?.designContext ? `FOOTWEAR SPECIFICATIONS: ${JSON.stringify(projectContext.designContext)}` : ''}
    `;

    const result = await streamText({
      model: openrouter('google/gemini-3-flash-preview'),
      messages: coreMessages,
      system: systemPrompt,
      tools: {
        sendToCanvas: tool({
          description: 'Sends research data to the design canvas.',
          parameters: z.object({
            title: z.string(),
            content: z.string(),
            type: z.enum(['research', 'material', 'concept']),
            agent: z.enum(['zeph', 'analyst', 'maker', 'artist']).optional(),
          }),
        }),
        renameProject: tool({
          description: 'Rename the project.',
          parameters: z.object({ name: z.string().min(1) }),
          execute: async ({ name }) => ({ name: name.trim() }),
        }),
        updateDesignContext: tool({
          description: 'Update design context.',
          parameters: z.object({
            footwearType: z.string().optional(),
            gender: z.string().optional(),
            aestheticVibe: z.string().optional(),
            targetAudience: z.string().optional(),
            summary: z.string().optional(),
          }),
        }),
        generateImage: tool({
          description: 'Generate footwear image.',
          parameters: z.object({
            prompt: z.string().min(50),
            aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
            referenceImage: z.string().optional(),
          }),
          execute: async (params) => ({ ...params, status: 'initiated' }),
        })
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), { status: 500 });
  }
}
