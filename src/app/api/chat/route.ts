import { createOpenRouter } from '@openrouter/ai-sdk-provider';
// Updated to use convertToModelMessages for AI SDK 6.0+
import { streamText, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { AGENT_PERSONAS, AgentId } from '@/lib/agents/personas';

export const runtime = 'edge';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { messages, projectId, projectContext } = await req.json();

    if (!process.env.OPENROUTER_API_KEY) {
      return new Response('OpenRouter API key not configured', { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    // Normalize messages for the model, preserving file parts for vision
    const normalized = messages
      .filter((msg: any) => msg && msg.role && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'))
      .map((msg: any) => {
        const parts = Array.isArray(msg.parts) ? msg.parts : 
                     Array.isArray(msg.content) ? msg.content : 
                     typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : [];

        return {
          id: msg.id || Math.random().toString(),
          role: msg.role,
          parts: parts
            .map((p: any) => {
              if (p.type === 'text') return { type: 'text', text: p.text || p.content };
              if (p.type === 'image') return { type: 'image', image: p.image || p.url };
              if (p.type === 'file') {
                const isImage = p.mediaType?.startsWith('image/') || p.url?.startsWith('data:image/');
                if (isImage) {
                  return {
                    type: 'image',
                    image: p.url,
                  };
                }
                return {
                  type: 'file',
                  data: p.url,
                  mediaType: p.mediaType || 'application/octet-stream'
                };
              }
              if (p.type === 'tool-invocation') return null; // Filter out tool calls for normalization
              return null;
            })
            .filter(Boolean)
        };
      })
      .filter((m: any) => m.parts.length > 0);

    if (normalized.length === 0) {
      return new Response('No valid messages found', { status: 400 });
    }

    const coreMessages = await convertToModelMessages(normalized);

    const hasImages = normalized.some(msg => 
      msg.parts.some((p: any) => p.type === 'image')
    );

    const systemPrompt = `
    ${AGENT_PERSONAS.zeph.systemPrompt}
    
    ${hasImages ? 'VISION CAPABILITIES ENABLED: You can see and analyze images provided by the user. Use these visuals to inform your research, design suggestions, and technical specifications. Pay close attention to silhouettes, materials, branding, and construction details visible in footwear images.' : ''}

    ${projectContext ? `CURRENT DESIGN CONTEXT:
    - Project: ${projectContext.projectName || 'Untitled'}
    - Workshop: ${projectContext.workshopName || 'General'}
    - Phase: ${projectContext.status || 'Draft'}
    
    ${projectContext.designContext ? `FOOTWEAR SPECIFICATIONS:
    - Type: ${projectContext.designContext.footwearType || 'Not specified'}
    - Gender: ${projectContext.designContext.gender || 'Not specified'}
    - Aesthetic: ${projectContext.designContext.aestheticVibe || 'Not specified'}
    - Target: ${projectContext.designContext.targetAudience || 'Not specified'}
    - Palette: ${JSON.stringify(projectContext.designContext.colorPalette || [])}
    - Materials: ${JSON.stringify(projectContext.designContext.keyMaterials || [])}
    - Summary: ${projectContext.designContext.summary || 'Initial research phase'}
    ` : 'No design context established yet. Start by defining the footwear type and aesthetic.'}
    ` : ''}

    AGENT INTERACTION PROTOCOL:
    1. If the user's request is specific to research/market trends, invoke **The Analyst**.
    2. If it's about manufacturing/materials/BOM, invoke **The Maker**.
    3. If it's about aesthetics/design/visuals, invoke **The Artist**.
    4. You (Zeph) are always the primary speaker unless you are presenting an expert's report.
    5. When agents "talk to each other", format it as a collaboration. e.g., "The Maker has flagged a material concern which The Artist is now addressing with a new silhouette direction."
    
    When you generate significant research data, material specs, or design concepts that would be useful on a design board, use the 'sendToCanvas' tool to package that information for the user.
    
    Use 'updateDesignContext' to lock in high-level design decisions (footwear type, vibe, color palette).
    Use 'updateBOM' when specific materials and parts are identified for construction.`;

    const result = await streamText({
      model: openrouter('google/gemini-3-flash-preview'),
      messages: coreMessages,
      system: systemPrompt,
      tools: {
        sendToCanvas: {
          description: 'Sends research data, material specifications, or design concepts to the design canvas.',
          parameters: z.object({
            title: z.string().describe('Short descriptive title for the card'),
            content: z.string().describe('The research data or specs in markdown format'),
            type: z.enum(['research', 'material', 'concept']).describe('The type of content being sent'),
            agent: z.enum(['zeph', 'analyst', 'maker', 'artist']).optional().describe('The agent providing this data'),
          }),
        },
        consultSpecialist: {
          description: 'Consult one of the specialized agents for deeper insight.',
          parameters: z.object({
            agentId: z.enum(['analyst', 'maker', 'artist']).describe('The specialist to consult'),
            query: z.string().describe('The specific question or task for the specialist'),
          }),
          execute: async ({ agentId, query }) => {
            const persona = AGENT_PERSONAS[agentId as AgentId];
            return {
              persona: persona.name,
              response: `[${persona.name} is processing: ${query}]`,
              systemInstructions: persona.systemPrompt
            };
          }
        },
        updateDesignContext: {
          description: 'Update the high-level footwear design context and aesthetic vision.',
          parameters: z.object({
            footwearType: z.string().optional(),
            gender: z.string().optional(),
            aestheticVibe: z.string().optional(),
            targetAudience: z.string().optional(),
            colorPalette: z.array(z.object({
              name: z.string(),
              hex: z.string(),
              usage: z.string().optional(),
            })).optional(),
            keyMaterials: z.array(z.string()).optional(),
            performanceSpecs: z.array(z.string()).optional(),
            summary: z.string().optional(),
          }),
        },
        updateBOM: {
          description: 'Update the Bill of Materials (BOM) with specific parts and materials.',
          parameters: z.object({
            items: z.array(z.object({
              partName: z.string(),
              partCategory: z.enum(['upper', 'sole', 'component', 'packaging']),
              materialName: z.string(),
              materialGrade: z.string().optional(),
              color: z.string().optional(),
              quantity: z.number(),
              unit: z.string(),
              supplier: z.string().optional(),
              estimatedCost: z.number().optional(),
            })),
            totalEstimatedCost: z.number().optional(),
            currency: z.string().default('USD'),
          }),
        },
        generateSoleSpec: {
          description: 'Generate technical specifications for a footwear sole (midsole + outsole).',
          parameters: z.object({
            midsoleMaterial: z.string().describe('Material used for the midsole (e.g. PEBA, EVA)'),
            outsoleMaterial: z.string().describe('Material used for the outsole (e.g. Rubber, TPU)'),
            stackHeightHeel: z.number().describe('Stack height at the heel in mm'),
            stackHeightForefoot: z.number().describe('Stack height at the forefoot in mm'),
            drop: z.number().describe('Heel-to-toe drop in mm'),
            treadPattern: z.string().describe('Description of the outsole tread pattern'),
            plateType: z.enum(['None', 'Carbon', 'TPU', 'Nylon']).describe('Type of internal plate'),
            cushioningLevel: z.enum(['Firm', 'Balanced', 'Plush', 'Max']).describe('The subjective feel of the cushioning'),
            weightEst: z.number().describe('Estimated weight of the sole unit in grams'),
            costEst: z.number().describe('Estimated manufacturing cost of the sole unit'),
          }),
        },
        generateImage: {
          description: 'Generate a high-fidelity image of a footwear design or concept.',
          parameters: z.object({
            prompt: z.string().describe('Highly detailed prompt for image generation. Focus on materials, lighting, and footwear anatomy.'),
            aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
            referenceImage: z.string().optional().describe('URL of a reference image to maintain consistency.'),
          }),
          execute: async ({ prompt, aspectRatio, referenceImage }) => {
            // For now, we'll return a placeholder that the frontend can handle
            // or we could trigger a real generation if we had the backend fully wired.
            return {
              model: 'google/nano-banana-pro',
              prompt,
              aspectRatio,
              referenceImage,
              status: 'queued',
              message: 'Generating high-fidelity footwear concept...'
            };
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: any) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to process chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
