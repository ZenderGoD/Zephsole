"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { api } from "./_generated/api";
import { MODEL_CONFIGS, mapAspectRatio } from "./models";
import { withFalFailover } from "./falManager";
import { routeGenerationRequest } from "./generationRouter";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const createR2Client = () => {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, accountId };
};

const publicBaseUrl = (bucket: string, accountId: string) =>
  (process.env.R2_PUBLIC_URL || `https://${bucket}.${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");

export const generateImageWithFal = action({
  args: {
    prompt: v.string(),
    aspectRatio: v.optional(v.string()),
    referenceImageUrl: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())), // Support multiple images
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    numImages: v.optional(v.number()), // Number of images to generate (default: 1)
  },
  handler: async (ctx, args) => {
    console.log('[generateImageWithFal] 🎬 Action handler started:', {
      timestamp: new Date().toISOString(),
      promptLength: args.prompt?.length || 0,
      promptPreview: args.prompt?.substring(0, 100),
      hasAspectRatio: !!args.aspectRatio,
      aspectRatio: args.aspectRatio,
      hasReferenceImageUrl: !!args.referenceImageUrl,
      referenceImageUrlPreview: args.referenceImageUrl?.substring(0, 50),
      hasReferenceImageUrls: !!args.referenceImageUrls,
      referenceImageUrlsCount: args.referenceImageUrls?.length || 0,
      hasProjectId: !!args.projectId,
      hasUserId: !!args.userId,
      fullArgs: JSON.stringify({
        ...args,
        prompt: args.prompt?.substring(0, 100) + '...',
      }, null, 2),
    });
    
    // Combine single and multiple reference images
    const imageUrls: string[] = [];
    if (args.referenceImageUrls && args.referenceImageUrls.length > 0) {
      imageUrls.push(...args.referenceImageUrls);
    } else if (args.referenceImageUrl) {
      imageUrls.push(args.referenceImageUrl);
    }
    
    // Automatically select model based on whether reference images are provided
    // If reference images exist → use image-to-image model
    // If no reference images → use text-to-image model
    const selectedRoute = routeGenerationRequest({
      kind: "image",
      referenceImageCount: imageUrls.length,
    });
    const selectedModelId = selectedRoute.modelId;
    const modelConfig = MODEL_CONFIGS[selectedModelId];
    
    console.log('[generateImageWithFal] 📋 Model selection:', {
      hasReferenceImages: imageUrls.length > 0,
      referenceImageCount: imageUrls.length,
      selectedModelId,
      modelName: modelConfig.name,
      category: modelConfig.category,
      requiresReferenceImage: modelConfig.requiresReferenceImage,
      endpoint: modelConfig.endpoint,
      modelId: modelConfig.modelId,
      defaultAspectRatio: modelConfig.defaultAspectRatio,
      defaultResolution: modelConfig.defaultResolution,
    });
    
    // Validate reference image requirement
    if (modelConfig.requiresReferenceImage && imageUrls.length === 0) {
      const errorMsg = `${modelConfig.name} requires at least one reference image URL. Please provide a reference image.`;
      console.error('[generateImageWithFal] ❌ Validation failed:', {
        modelName: modelConfig.name,
        requiresReferenceImage: modelConfig.requiresReferenceImage,
        imageUrlsCount: imageUrls.length,
        error: errorMsg,
      });
      throw new Error(errorMsg);
    }

    const falUrl = selectedRoute.endpoint;
    
    console.log('[generateImageWithFal] 🌐 Preparing API request:', {
      model: modelConfig.modelId,
      url: falUrl,
      promptLength: args.prompt.length,
      promptPreview: args.prompt.substring(0, 100),
      aspectRatio: args.aspectRatio,
      imageUrlsCount: imageUrls.length,
      imageUrlsPreview: imageUrls.map(url => url.substring(0, 50)),
    });
    
    // Map aspect ratio using model config
    const aspectRatio = mapAspectRatio(args.aspectRatio, modelConfig);
    
    // Build request body based on model type
    const requestBody: Record<string, any> = {
      prompt: args.prompt,
    };
    
    // Add optional parameters - always generate 1 image per call for diversity
    requestBody.num_images = 1;
    requestBody.aspect_ratio = aspectRatio;
    requestBody.resolution = modelConfig.defaultResolution;
    requestBody.output_format = modelConfig.defaultOutputFormat;
    
    // Add image_urls based on model requirements
    if (modelConfig.requiresReferenceImage) {
      // Image-to-image models require image_urls
      if (imageUrls.length === 0) {
        throw new Error(`${modelConfig.name} requires at least one reference image.`);
      }
      requestBody.image_urls = imageUrls;
    } else if (imageUrls.length > 0) {
      // Text-to-image models can optionally accept image_urls for guidance
      requestBody.image_urls = imageUrls;
    }
    // For pure text-to-image without reference, no image_urls needed

    console.log('[generateImageWithFal] Request body:', {
      prompt: args.prompt.substring(0, 50) + '...',
      imageUrlsCount: requestBody.image_urls?.length || 0,
      aspect_ratio: requestBody.aspect_ratio,
      resolution: requestBody.resolution,
      hasImageUrls: !!requestBody.image_urls,
    });

    // Call Fal.ai API - Nano Banana Pro uses queue/subscribe pattern
    console.log('[generateImageWithFal] 📡 Making API request to Fal.ai:', {
      url: falUrl,
      method: 'POST',
      hasAuthHeader: true,
      requestBodySize: JSON.stringify(requestBody).length,
      requestBodyPreview: JSON.stringify(requestBody, null, 2).substring(0, 500),
    });
    
    const result = await withFalFailover(
      ctx,
      async (falKey) => {
        let response: Response;
        try {
          console.log(`[generateImageWithFal] Calling FAL API with key (masked):`, {
            url: falUrl,
            keyPrefix: falKey.substring(0, 8) + '...',
            requestBodySize: JSON.stringify(requestBody).length,
          });
          response = await fetch(falUrl, {
            method: "POST",
            headers: {
              Authorization: `Key ${falKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });
        } catch (fetchError) {
          const errorMsg = `Failed to call Fal.ai API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`;
          console.error('[generateImageWithFal] Fetch error:', errorMsg);
          throw new Error(errorMsg);
        }

        if (!response.ok) {
          const errorText = await response.text();
          const errorMsg = `Fal.ai API error: ${response.status} ${response.statusText} - ${errorText}`;
          console.error('[generateImageWithFal] API error:', {
            status: response.status,
            statusText: response.statusText,
            errorText: errorText.substring(0, 500),
          });
          throw new Error(errorMsg);
        }

        const responseText = await response.text();
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(responseText) as Record<string, unknown>;
        } catch (parseError) {
          throw new Error(
            `Failed to parse Fal.ai response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          );
        }

        const requestId = parsed.request_id || parsed.requestId;
        if (requestId && (!parsed.images || (Array.isArray(parsed.images) && parsed.images.length === 0))) {
          const statusUrl = `https://queue.fal.run/${requestId}`;
          const maxPollAttempts = 120;
          for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const statusResponse = await fetch(statusUrl, {
              headers: { Authorization: `Key ${falKey}` },
            });
            if (!statusResponse.ok) {
              if (statusResponse.status === 404) continue;
              const errorText = await statusResponse.text();
              throw new Error(`Failed to check status: ${statusResponse.status} - ${errorText}`);
            }
            const statusResult = await statusResponse.json();
            if (statusResult.status === "COMPLETED") {
              if (statusResult.images?.length) return statusResult;
              if (statusResult.data?.images?.length) return statusResult.data;
            }
            if (statusResult.status === "FAILED") {
              throw new Error(`Fal.ai generation failed: ${statusResult.error || JSON.stringify(statusResult)}`);
            }
          }
          throw new Error("Fal.ai generation timed out while waiting for queued result");
        }

        return parsed;
      },
      { maxAttempts: 6, retryDelayMs: 250 },
    );
    
    // Extract all images from response
    let generatedImageUrls: string[] = [];
    if (result.images && Array.isArray(result.images) && result.images.length > 0) {
      generatedImageUrls = result.images.map((img: { url?: string } | string) => 
        typeof img === 'string' ? img : (img.url || '')
      ).filter(Boolean);
    } else if (result.data && result.data.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
      generatedImageUrls = result.data.images.map((img: { url?: string } | string) => 
        typeof img === 'string' ? img : (img.url || '')
      ).filter(Boolean);
    }
    
    if (generatedImageUrls.length === 0) {
      console.error("[generateImageWithFal] ❌ No image URLs found in response:", {
        resultKeys: Object.keys(result),
        resultPreview: JSON.stringify(result, null, 2).substring(0, 1000),
        fullResult: JSON.stringify(result, null, 2),
      });
      throw new Error(`No image URLs in Fal.ai response. Response keys: ${Object.keys(result).join(', ')}. Full response: ${JSON.stringify(result).substring(0, 500)}`);
    }
    
    console.log('[generateImageWithFal] ✅ Image URLs extracted:', {
      count: generatedImageUrls.length,
      urlsPreview: generatedImageUrls.map(url => url.substring(0, 50)),
    });

    const bucket = requiredEnv("R2_BUCKET_NAME");
    const { client, accountId } = createR2Client();
    
    // Process all images
    const uploadedImages: Array<{ url: string; storageKey: string }> = [];
    
    for (let i = 0; i < generatedImageUrls.length; i++) {
      const imageUrl = generatedImageUrls[i];
      console.log(`[generateImageWithFal] 📥 Downloading image ${i + 1}/${generatedImageUrls.length} from Fal.ai:`, {
        imageUrl: imageUrl,
      });
      
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error(`[generateImageWithFal] ❌ Failed to download image ${i + 1}:`, {
          status: imageResponse.status,
          statusText: imageResponse.statusText,
          imageUrl: imageUrl,
        });
        throw new Error(`Failed to download generated image ${i + 1}: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      console.log(`[generateImageWithFal] ✅ Image ${i + 1} downloaded:`, {
        bufferSize: imageBuffer.byteLength,
        sizeInMB: (imageBuffer.byteLength / 1024 / 1024).toFixed(2),
      });
      
      const objectKey = `generated/${Date.now()}-${i}-${Math.random().toString(36).substring(7)}.png`;
      
      console.log(`[generateImageWithFal] ☁️ Uploading image ${i + 1} to R2:`, {
        bucket,
        objectKey,
        accountId,
      });
      
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: Buffer.from(imageBuffer),
        ContentType: "image/png",
      }));

      const publicUrl = `${publicBaseUrl(bucket, accountId)}/${objectKey}`;
      uploadedImages.push({ url: publicUrl, storageKey: objectKey });
      
      console.log(`[generateImageWithFal] ✅ Image ${i + 1} upload complete:`, {
        publicUrl,
        objectKey,
      });

      // Optionally save to media table if projectId is provided
      if (args.projectId) {
        try {
          await ctx.runMutation(api.media.saveMediaRecord, {
            projectId: args.projectId,
            objectKey: objectKey,
            fileName: `generated-${Date.now()}-${i}.png`,
            contentType: "image/png",
            kind: "generated",
            uploadedBy: args.userId,
          });
        } catch (error) {
          console.error(`Failed to save media record for image ${i + 1}:`, error);
          // Non-fatal, continue
        }
      }
    }

    // Return first image for backward compatibility, plus array of all images
    const firstImage = uploadedImages[0];
    const returnValue = {
      url: firstImage.url,
      storageKey: firstImage.storageKey,
      model: modelConfig.id,
      prompt: args.prompt,
      width: args.width || 1024,
      height: args.height || 1024,
      images: uploadedImages,
    };
    
    console.log('[generateImageWithFal] 🎉 Action completed successfully:', {
      returnValue: JSON.stringify(returnValue, null, 2),
    });
    
    return returnValue;
  },
});
