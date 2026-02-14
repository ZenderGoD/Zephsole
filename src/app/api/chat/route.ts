import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages, tool, UIMessage } from 'ai';
import { z } from 'zod';
import { AGENT_PERSONAS, AgentId } from '@/lib/agents/personas';

interface ToolInvocationPart {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  state?: string;
  result?: unknown;
  output?: unknown;
}

interface ChatMessagePart {
  type: string;
  text?: string;
  content?: string;
  image?: string;
  url?: string;
  mediaType?: string;
  data?: string;
  toolInvocation?: ToolInvocationPart;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  state?: string;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  parts?: ChatMessagePart[];
  content?: string | Array<unknown>;
}

interface FileUIPart {
  type: 'file';
  data: string;
  mediaType: string;
  url: string;
  filename?: string;
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
        const parts: ChatMessagePart[] = Array.isArray(msg.parts) 
          ? msg.parts 
          : Array.isArray(msg.content) 
            ? (msg.content as ChatMessagePart[])
            : typeof msg.content === 'string' 
              ? [{ type: 'text', text: msg.content }] 
              : [];

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
                const invocation: ToolInvocationPart = p.toolInvocation || {
                  toolCallId: p.toolCallId || '',
                  toolName: p.toolName || '',
                  args: p.args,
                  state: p.state,
                  result: p.result,
                  output: p.output,
                };
                const toolName = invocation.toolName || p.toolName || '';
                const toolCallId = invocation.toolCallId || p.toolCallId || '';
                
                // Check multiple places for the result
                const toolResult = invocation.state === 'result' 
                  ? invocation.result 
                  : invocation.result 
                  || p.result
                  || invocation.output
                  || p.output;
                
                // If we have a result, return it as tool-result
                if (invocation.state === 'result' || toolResult) {
                  return {
                    type: 'tool-result' as const,
                    toolCallId,
                    toolName: toolName || 'generateImage',
                    result: toolResult,
                  };
                }
                
                // CRITICAL: For consultSpecialist, ALWAYS provide a result to prevent AI_MissingToolResultsError
                // This ensures the tool call never appears without a result in the message history
                if (toolName === 'consultSpecialist' || toolCallId.includes('consultSpecialist')) {
                  const args = (invocation.args || p.args || {}) as { specialist?: string; question?: string; context?: string };
                  // Normalize specialist name
                  let specialist = args.specialist || 'analyst';
                  if (typeof specialist === 'string') {
                    const lower = specialist.toLowerCase();
                    if (lower.includes('analyst')) specialist = 'analyst';
                    else if (lower.includes('maker')) specialist = 'maker';
                    else if (lower.includes('artist')) specialist = 'artist';
                  }
                  if (!['analyst', 'maker', 'artist'].includes(specialist)) {
                    specialist = 'analyst';
                  }
                  
                  return {
                    type: 'tool-result' as const,
                    toolCallId,
                    toolName: 'consultSpecialist',
                    result: {
                      specialist,
                      question: args.question || 'General consultation',
                      response: `[${specialist === 'analyst' ? 'The Analyst' : specialist === 'maker' ? 'The Maker' : 'The Artist'}] Consultation completed. ${args.question ? `Question: ${args.question}. ` : ''}${args.context ? `Context: ${args.context}. ` : ''}Specialist input provided.`,
                      status: 'consulted',
                    },
                  };
                }
                
                // For other tools without results, return as tool-call
                return {
                  type: 'tool-call' as const,
                  toolCallId,
                  toolName: toolName || 'generateImage',
                  args: invocation.args || p.args || {},
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
      msg.parts.some((p) => {
        if (p.type === 'file') {
          const filePart = p as { mediaType?: string; url?: string };
          return filePart.mediaType?.startsWith('image/') === true;
        }
        return false;
      })
    );
    const imageCount = normalized.reduce((count, msg) => 
      count + msg.parts.filter((p) => {
        if (p.type === 'file') {
          const filePart = p as { mediaType?: string };
          return filePart.mediaType?.startsWith('image/') === true;
        }
        return false;
      }).length, 0
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
          inputSchema: z.object({
            title: z.string(),
            content: z.string(),
            type: z.enum(['research', 'material', 'concept']),
            agent: z.enum(['zeph', 'analyst', 'maker', 'artist']).optional(),
          }),
        }),
        renameProject: tool({
          description: 'Rename the project.',
          inputSchema: z.object({ name: z.string().min(1) }),
        }),
        updateDesignContext: tool({
          description: 'Update design context.',
          inputSchema: z.object({
            footwearType: z.string().optional(),
            gender: z.string().optional(),
            aestheticVibe: z.string().optional(),
            targetAudience: z.string().optional(),
            summary: z.string().optional(),
          }),
        }),
        consultSpecialist: tool({
          description: 'Consult with a specialist agent (The Analyst for market/competitive intelligence, The Maker for construction/BOM, or The Artist for visual story) to get focused input on a specific topic.',
          inputSchema: z.object({
            specialist: z.enum(['analyst', 'maker', 'artist']),
            question: z.string().describe('The specific question or topic to consult the specialist about'),
            context: z.string().optional().describe('Additional context about the project or design to help the specialist provide relevant input'),
          }),
          execute: async (args) => {
            try {
              // Normalize specialist parameter - ensure it's one of the valid enum values
              let specialist: 'analyst' | 'maker' | 'artist' = args.specialist;
              
              // Ensure specialist is one of the valid values (fallback to analyst if invalid)
              if (!['analyst', 'maker', 'artist'].includes(specialist)) {
                specialist = 'analyst';
              }
              
              // Extract question and context, handle undefined/null
              const question = args.question || '';
              const context = args.context || '';
              
              console.log('[consultSpecialist] execute function called with:', {
                rawArgs: args,
                normalizedSpecialist: specialist,
                question,
                context,
              });
              
              // Return a result that simulates specialist consultation
              // In a real implementation, this could call separate agent instances
              const specialistResponses: Record<'analyst' | 'maker' | 'artist', string> = {
                analyst: `[The Analyst] Market Intelligence: ${question || 'General market analysis'}. ${context ? `Context: ${context}. ` : ''}Based on current market trends and competitive analysis, here are key insights...`,
                maker: `[The Maker] Technical Engineering: ${question || 'General technical consultation'}. ${context ? `Context: ${context}. ` : ''}From a construction and manufacturing perspective, here are the technical considerations...`,
                artist: `[The Artist] Visual Ideation: ${question || 'General aesthetic consultation'}. ${context ? `Context: ${context}. ` : ''}From an aesthetic and visual storytelling perspective, here are creative directions...`,
              };
              
              const result = {
                specialist,
                question: question || 'General consultation',
                response: specialistResponses[specialist],
                status: 'consulted' as const,
              };
              
              console.log('[consultSpecialist] execute function returning:', result);
              return result;
            } catch (error) {
              console.error('[consultSpecialist] execute function error:', error);
              return {
                specialist: 'analyst' as const,
                question: args.question || '',
                response: `Error consulting specialist: ${error instanceof Error ? error.message : 'Unknown error'}`,
                status: 'error' as const,
              };
            }
          },
        }),
        generateImage: tool({
          description: 'Generate footwear image.',
          inputSchema: z.object({
            prompt: z.string().min(50),
            aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
            referenceImage: z.string().optional(),
          }),
          execute: async ({ prompt, aspectRatio, referenceImage }) => {
            // Return a result immediately - actual generation happens async via workflow
            // The client-side onToolCall handler will trigger the workflow
            return {
              prompt,
              aspectRatio: aspectRatio || '1:1',
              referenceImage,
              status: 'initiated',
              message: 'Image generation workflow started. The image will appear when generation completes.',
            };
          },
        })
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), { status: 500 });
  }
}
