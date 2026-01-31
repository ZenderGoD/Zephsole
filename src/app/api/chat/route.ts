import { createOpenRouter } from '@openrouter/ai-sdk-provider';
// Updated to use convertToModelMessages for AI SDK 6.0+
import { streamText, convertToModelMessages } from 'ai';
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
  projectContext?: Record<string, unknown>;
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
    // Also extract image URLs from tool results for context
    const normalized = messages
      .filter((msg: ChatMessage) => msg && msg.role && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'))
      .map((msg: ChatMessage) => {
        const parts = Array.isArray(msg.parts) ? msg.parts : 
                     Array.isArray(msg.content) ? msg.content : 
                     typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : [];

        return {
          id: msg.id || Math.random().toString(),
          role: msg.role,
          parts: parts
            .map((p) => {
              if (p.type === 'text') return { type: 'text', text: p.text || p.content };
              if (p.type === 'image') return { type: 'image', image: p.image || p.url };
              if (p.type === 'file') {
                const isImage = p.mediaType?.startsWith('image/') || 
                               p.url?.startsWith('data:image/') || 
                               p.url?.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ||
                               (p.mediaType && ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(p.mediaType.toLowerCase()));
                if (isImage) {
                  // Use base64 data if available, otherwise use URL
                  // The model can fetch public URLs, so we pass them directly
                  const imageData = p.data ? `data:${p.mediaType || 'image/jpeg'};base64,${p.data}` : p.url;
                  console.log('[Chat API] Including image in message:', {
                    hasBase64: !!p.data,
                    url: p.url?.substring(0, 50),
                    mediaType: p.mediaType,
                  });
                  return {
                    type: 'image',
                    image: imageData,
                  };
                }
                return {
                  type: 'file',
                  data: p.url,
                  mediaType: p.mediaType || 'application/octet-stream'
                };
              }
              if (p.type === 'tool-invocation' || p.type === 'tool-generateImage' || p.type?.startsWith('tool-')) {
                // Handle both tool-invocation and tool-generateImage formats
                const invocation = p.toolInvocation || (p as any);
                const toolResult = invocation.state === 'result' ? invocation.result : 
                                 (p as any).result || (p as any).output;
                
                // If this is a generateImage tool with a result containing a URL, include it as an image for context
                if ((invocation.toolName === 'generateImage' || (p as any).toolName === 'generateImage' || p.type === 'tool-generateImage') && 
                    toolResult && typeof toolResult === 'object' && 'url' in toolResult) {
                  const imageUrl = (toolResult as { url?: string }).url;
                  if (imageUrl) {
                    // Add the generated image to the message parts so the AI can see it
                    return {
                      type: 'image',
                      image: imageUrl,
                    };
                  }
                }
                
                if (invocation.state === 'result' || toolResult) {
                  return {
                    type: 'tool-result',
                    toolCallId: invocation.toolCallId || (p as any).toolCallId,
                    toolName: invocation.toolName || (p as any).toolName || 'generateImage',
                    result: toolResult,
                  };
                } else {
                  return {
                    type: 'tool-call',
                    toolCallId: invocation.toolCallId || (p as any).toolCallId,
                    toolName: invocation.toolName || (p as any).toolName || 'generateImage',
                    args: invocation.args || (p as any).args,
                  };
                }
              }
              return null;
            })
            .filter(Boolean)
        };
      })
      .filter((m) => m.parts.length > 0);

    if (normalized.length === 0) {
      return new Response('No valid messages found', { status: 400 });
    }

    const coreMessages = await convertToModelMessages(normalized);

    const hasImages = normalized.some(msg => 
      msg.parts.some((p) => p.type === 'image')
    );
    
    // Log image detection for debugging
    const imageCount = normalized.reduce((count, msg) => 
      count + msg.parts.filter(p => p.type === 'image').length, 0
    );
    console.log('[Chat API] Image detection:', {
      hasImages,
      imageCount,
      messageCount: normalized.length,
      imagesByMessage: normalized.map(msg => ({
        role: msg.role,
        imageCount: msg.parts.filter(p => p.type === 'image').length,
      })),
    });

    const systemPrompt = `
    ${AGENT_PERSONAS.zeph.systemPrompt}
    
    IMPORTANT CONTEXT OVERRIDE FOR THIS CHAT:
    - You ARE in the Research/Design phase where image generation for design concepts IS allowed
    - Use 'generateImage' tool when users ask to generate, create, or visualize footwear designs
    - Only delegate marketing/media (photoshoots, lifestyle, ads, social media) to Product Agent
    - Design concept visualization and technical visualizations are YOUR responsibility here
    
    ${hasImages ? `VISION CAPABILITIES ENABLED: You can see and analyze ${imageCount} image(s) provided by the user in this conversation. Use these visuals to inform your research, design suggestions, and technical specifications. Pay close attention to silhouettes, materials, branding, and construction details visible in footwear images. When the user refers to "this shoe", "this image", or "the uploaded image", they are referring to the image(s) visible in the conversation history.` : ''}

    PROJECT NAMING PROTOCOL:
    1. ONLY use the 'renameProject' tool when you have a clear, specific name ready (2-6 words) based on the conversation context.
    2. DO NOT call renameProject if:
       - The user just said "hi", "hello", or other greetings
       - You don't have enough context yet to create a meaningful name
       - The current name is already descriptive and fits the topic
    3. ONLY rename when:
       - The user has provided specific details about the footwear (type, style, features, colors, etc.)
       - You can create a better, more descriptive name than the current one
       - You have analyzed images or received enough context to suggest a meaningful title
    4. When you DO rename, analyze both the USER TEXT and any UPLOADED IMAGES to create a specific title:
       - If there's a shoe image, mention the style or key features (e.g., "Neon Cyberpunk Runner").
       - If it's a technical query, use technical terminology (e.g., "Carbon-Plate Sole Research").
    5. The title should be 2-6 words long and professional.
    6. CRITICAL: Never call renameProject without providing the "name" parameter. If you don't have a name ready, don't call the tool.

    TECHNICAL INTAKE & RESEARCH PROTOCOL:
    1. YOUR PRIMARY GOAL in the Research Phase is to gather exhaustive technical data for the product before any generation begins.
    2. REQUIRED DATA POINTS:
       - Measurement Units (Metric vs Imperial)
       - Size Chart/Run (e.g., US Men 7-13, EU 36-45)
       - Critical Measurements (Heel Height, Toe Spring, Last Shape)
       - Detailed Materials for Upper, Lining, and Sole
    3. Be proactive: If the user uploads an image, analyze it and ask clarifying questions about these technical specs.
    4. Use 'updateProductBaselines' whenever the user provides or confirms measurement/sizing data.
    5. ONLY suggest 'requestTechnicalBlueprint' once you have a solid understanding of the product's technical baseline.

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
    Use 'updateBOM' when specific materials and parts are identified for construction.
    Use 'updateProductBaselines' for sizing, measurements, and physical geometry.
    
    IMAGE GENERATION PROTOCOL:
    - Use the 'generateImage' tool ONLY when the user wants to generate, create, or visualize a creative footwear design concept.
    - NEVER use 'generateImage' for "schematics", "blueprints", or "technical drawings". Those require data analysis, not just image generation.
    - For schematics/blueprints/technical drawings, you MUST follow the technical intake process (analyze -> confirm -> blueprint).
    
    Understand the user's intent:
    - If they ask for "schematics" of an image they uploaded, they want you to ANALYZE the image technical details, NOT generate a new image.
    - If they explicitly request a visual design visualization (e.g., "show me what this would look like in red"), use 'generateImage'.
    
    When calling 'generateImage':
    1. A "prompt" parameter (required, minimum 50 characters) - a detailed description of the footwear design
    2. An "aspectRatio" parameter (optional, defaults to "1:1")
    3. A "referenceImage" parameter (optional) - include this if the user uploaded an image or wants to edit an existing one
    
    The prompt should be comprehensive (2-4 sentences) and include:
    - Specific footwear type (sneaker, boot, sandal, etc.)
    - Materials and textures (leather, mesh, rubber, etc.)
    - Color palette (be specific about colors mentioned)
    - Lighting and composition (studio lighting, product photography style)
    - Design details (stitching, logos, laces, sole design)
    - Aesthetic vibe (minimalist, technical, fashion-forward, etc.)
    
    If the user has uploaded an image (check message.parts for image attachments), extract that image URL and use it as the referenceImage parameter for image-to-image editing.
    
    CRITICAL - SCHEMATICS/BLUEPRINTS PROTOCOL:
    When a user asks for "schematics", "blueprints", "technical drawings", "technical specs", or "technical blueprint":
    
    STEP 1: ANALYZE & GATHER INFORMATION (RESEARCH PHASE)
    - DO NOT generate an image. Your task is to extract or gather technical data.
    - Check the conversation history for images. If the user says "this shoe", "this image", or refers to an uploaded image, look for images in:
      1. The current user message (message.parts with type='image' or type='file' with image mediaType)
      2. Previous user messages in the conversation
      3. Tool results from 'generateImage'
    - If you find image(s) in the conversation:
      1. Extract the image URL(s).
      2. Call 'analyzeFootwearImage' to signal you are starting the technical analysis.
      3. Using your vision, identify and present:
         - Sizing/Units (Ask user if not obvious)
         - Materials (Upper, Lining, Sole)
         - Physical Geometry (Heel height, Toe spring)
    - If no images exist, ask the user to upload one or describe the technical baselines.
    
    STEP 2: PRESENT FINDINGS & ASK QUESTIONS
    - Present the data clearly. 
    - You MUST ask the user about:
      1. Preferred unit system (Metric/Imperial)
      2. Intended use (Performance, Lifestyle, etc.)
      3. Specific construction needs (Midsole plates, foams).
    - Wait for user confirmation/answers.
    
    STEP 3: GENERATE BLUEPRINT (TRANSITION TO STUDIO)
    - ONLY after the user confirms technical baselines, call 'requestTechnicalBlueprint'.
    - This will move the project to the technical drafting phase in the Studio.
    
    IMPORTANT:
    - THE RESEARCH PHASE IS FOR INFORMATION GATHERING.
    - NO IMAGES SHOULD BE GENERATED FOR SCHEMATICS.
    - THE GOAL IS TO BUILD A TECHNICAL PROFILE FOR THE PRODUCT.
    - IF A USER ASKS FOR SCHEMATICS, DO NOT CALL 'generateImage'. INSTEAD, START ANALYZING THE EXISTING CONTEXT.
    
    Example workflow:
    User: "generate schematics of this shoe" (with image attached)
    1. Call analyzeFootwearImage({ imageUrls: ["image_url"], productName: "..." })
    2. Analyze the image and extract measurements
    3. Present: "I've analyzed the shoe and found: Heel height: 25mm, Toe spring: 12mm, ... Please confirm these measurements."
    4. User: "Yes, those look correct"
    5. Call requestTechnicalBlueprint({ imageUrls: ["image_url"], productName: "...", confirmedMeasurements: {...} })
    `;

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
        renameProject: {
          description: 'Rename the current project to a more descriptive and unique name based on conversation context and visual analysis of images. CRITICAL: You MUST provide the "name" parameter (required string, 2-6 words).',
          parameters: z.object({
            name: z.string().min(1, 'Name must not be empty').describe('REQUIRED: The new unique and descriptive name for the project (2-6 words). Analyze images if available. Example: "Neon Cyberpunk Runner" or "Carbon-Plate Sole Research".'),
          }),
          execute: async (params) => {
            console.log('[renameProject execute] Received params:', {
              hasName: !!params.name,
              nameLength: params.name?.length || 0,
              keys: Object.keys(params),
            });
            
            const { name } = params;
            
            // Validate name is provided
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
              const nameDesc = name ? 'string "' + name + '"' : 'undefined';
              const errorMsg = 'renameProject tool requires a "name" parameter (non-empty string). Received: ' + nameDesc;
              console.error('[renameProject execute] Validation failed:', errorMsg);
              throw new Error(errorMsg);
            }
            
            console.log('[renameProject execute] Validation passed, returning args');
            return { name: name.trim() };
          }
        },
        consultSpecialist: {
          description: 'Consult one of the specialized agents for deeper insight.',
          parameters: z.object({
            agentId: z.enum(['analyst', 'maker', 'artist']).describe('The specialist to consult'),
            query: z.string().describe('The specific question or task for the specialist'),
          }),
          execute: async ({ agentId, query }) => {
            const persona = AGENT_PERSONAS[agentId as AgentId];
            const statusMsg = persona.name + ' is processing: ' + query;
            return {
              persona: persona.name,
              response: '[' + statusMsg + ']',
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
        updateProductBaselines: {
          description: 'Update physical measurements, sizing, and geometric constraints for the footwear product.',
          parameters: z.object({
            unitSystem: z.enum(['mm', 'us', 'eu', 'cm']).optional(),
            sizeRun: z.object({
              system: z.string(),
              sizes: z.array(z.number()),
              widths: z.array(z.string()).optional(),
            }).optional(),
            lastShape: z.string().optional(),
            heelHeight: z.number().optional(),
            toeSpring: z.number().optional(),
            measurements: z.record(z.string(), z.string()).optional().describe('Map of specific measurement points (e.g. "Vamp Length": "85mm")'),
          }),
        },
        analyzeFootwearImage: {
          description: 'Analyze footwear image(s) to extract measurements, materials, construction details, and technical specifications. Use this FIRST when a user asks for schematics/blueprints and provides image(s). The model can see images in the conversation - analyze them to extract technical data, then present findings to the user for confirmation before generating schematics.',
          parameters: z.object({
            imageUrls: z.array(z.string()).describe('Array of image URLs to analyze. Extract from user message attachments or previously generated images. Can be one or multiple images showing different angles of the footwear.'),
            productName: z.string().describe('A descriptive name for the product based on visual analysis (e.g., "Red and White Running Sneaker", "High-Performance Athletic Shoe")'),
            analysisNotes: z.string().optional().describe('Any specific aspects to focus on during analysis (e.g., "focus on sole construction", "measure heel height")'),
          }),
          execute: async (params) => {
            // This tool's execute function is informational - the actual analysis happens via vision in the model
            // The model will analyze the images and return structured data
            return {
              status: 'analyzing',
              message: 'Technical analysis initiated. Extracting geometry and materials. Please confirm: Preferred units (mm/us/eu), Use case (Performance/Lifestyle), and specific construction needs (Plates/Foams).',
              imageUrls: params.imageUrls,
              productName: params.productName,
            };
          }
        },
        requestTechnicalBlueprint: {
          description: 'Request confirmation from the user to generate a full Technical Blueprint (Schematics, BOM, Specs) based on analyzed footwear data. Use this AFTER analyzing images with analyzeFootwearImage and getting user confirmation on the extracted measurements. Include the confirmed measurements and technical data.',
          parameters: z.object({
            imageUrls: z.array(z.string()).describe('Array of image URLs that were analyzed. Can be one or multiple images.'),
            productName: z.string().describe('A descriptive name for the product (e.g., "Red and White Running Sneaker", "High-Performance Athletic Shoe")'),
            confirmedMeasurements: z.object({
              unitSystem: z.enum(['mm', 'us', 'eu', 'cm']).optional(),
              sizeRun: z.object({
                system: z.string(),
                sizes: z.array(z.number()),
                widths: z.array(z.string()).optional(),
              }).optional(),
              lastShape: z.string().optional(),
              heelHeight: z.number().optional(),
              toeSpring: z.number().optional(),
              measurements: z.record(z.string(), z.string()).optional().describe('Map of specific measurement points extracted from images (e.g. "Vamp Length": "85mm", "Heel Height": "25mm")'),
            }).optional().describe('Confirmed measurements and technical data extracted from image analysis'),
            materials: z.array(z.string()).optional().describe('Materials identified from image analysis (e.g., ["Premium Leather", "Rubber Outsole", "Mesh Lining"])'),
            constructionDetails: z.string().optional().describe('Construction details observed from images (e.g., "Stitched upper construction", "Molded midsole", "TPU heel counter")'),
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
          description: 'Generate or edit a high-fidelity image of a creative footwear design concept. DO NOT use this for technical schematics, blueprints, or technical drawings. CRITICAL: You MUST provide the "prompt" parameter (required, minimum 50 characters).',
          parameters: z.object({
            prompt: z.string().min(50, 'Prompt must be at least 50 characters').describe('REQUIRED PARAMETER: A detailed prompt (2-4 sentences, minimum 50 characters) describing the footwear to generate or edit. For text-to-image: describe the full design. For image-to-image: describe the changes/edits to make. Include: specific footwear type (sneaker/boot/sandal), materials/textures (leather/mesh/rubber), color palette (be specific about colors mentioned), lighting style (studio/product photography), design details (stitching/logos/sole), and aesthetic vibe. Example for "blue and red shoe": "A modern athletic sneaker featuring a vibrant blue upper with red accents on the swoosh and heel tab. The shoe has a white midsole and red outsole, with premium mesh and synthetic leather materials. Studio product photography lighting, clean white background, showcasing the bold color combination and contemporary design aesthetic."'),
            aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1').describe('Image aspect ratio'),
            referenceImage: z.string().optional().describe('OPTIONAL: URL of a reference image uploaded by the user. Extract the image URL from the user\'s message attachments if available. If provided, the system will use Nano Banana Pro (Image-to-Image) to edit/modify the image. If omitted, the system will use Nano Banana Pro (Text-to-Image) to generate a new image from scratch.'),
          }),
          execute: async (params) => {
            console.log('[generateImage execute] 📥 Received params:', {
              hasPrompt: !!params.prompt,
              promptLength: params.prompt?.length || 0,
              promptPreview: params.prompt?.substring(0, 100),
              hasAspectRatio: !!params.aspectRatio,
              aspectRatio: params.aspectRatio,
              hasReferenceImage: !!params.referenceImage,
              referenceImagePreview: params.referenceImage?.substring(0, 50),
              allKeys: Object.keys(params),
              fullParams: JSON.stringify(params, null, 2),
            });
            
            const { prompt, aspectRatio, referenceImage } = params;
            
            // Validate prompt is provided
            if (!prompt || typeof prompt !== 'string' || prompt.length < 50) {
              const promptDesc = prompt ? 'string of length ' + prompt.length : 'undefined';
              const errorMsg = 'generateImage tool requires a "prompt" parameter (string, minimum 50 characters). Received: ' + promptDesc;
              console.error('[generateImage execute] ❌ Validation failed:', errorMsg);
              throw new Error(errorMsg);
            }
            
            console.log('[generateImage execute] ✅ Validation passed, returning result:', {
              promptLength: prompt.length,
              aspectRatio: aspectRatio || '1:1',
              hasReferenceImage: !!referenceImage,
            });
            
            // Return a result that includes the args
            // The actual workflow execution happens on the client side via onToolCall
            // This result will be available in the message stream for the AI to reference
            return {
              prompt,
              aspectRatio: aspectRatio || '1:1',
              referenceImage: referenceImage || undefined,
              status: 'initiated',
              source: 'research',
              message: 'Creative design generation initiated. The result will be available here and synced to the Studio Stage for technical review.',
            };
          }
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process chat';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
