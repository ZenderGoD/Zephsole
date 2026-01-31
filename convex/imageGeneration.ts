"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { api } from "./_generated/api";
import { MODEL_CONFIGS, mapAspectRatio } from "./models";

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
    
    const falKey = requiredEnv("FAL_KEY");
    
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
    const hasReferenceImages = imageUrls.length > 0;
    const selectedModelId = hasReferenceImages ? 'nano-banana-pro-edit' : 'nano-banana-pro';
    const modelConfig = MODEL_CONFIGS[selectedModelId];
    
    console.log('[generateImageWithFal] 📋 Model selection:', {
      hasReferenceImages,
      referenceImageCount: imageUrls.length,
      selectedModelId,
      modelName: modelConfig.name,
      category: modelConfig.category,
      requiresReferenceImage: modelConfig.requiresReferenceImage,
      endpoint: modelConfig.endpoint,
      modelId: modelConfig.modelId,
      defaultAspectRatio: modelConfig.defaultAspectRatio,
      defaultResolution: modelConfig.defaultResolution,
      hasFalKey: !!falKey,
      falKeyLength: falKey?.length || 0,
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

    const falUrl = modelConfig.endpoint;
    
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
    
    // Add optional parameters
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
    
    let response: Response;
    try {
      response = await fetch(falUrl, {
        method: "POST",
        headers: {
          "Authorization": `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      
      // Log headers (convert Headers object to plain object)
      const headersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      
      console.log('[generateImageWithFal] 📥 Received API response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: headersObj,
      });
    } catch (fetchError) {
      console.error('[generateImageWithFal] ❌ Fetch error:', {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        stack: fetchError instanceof Error ? fetchError.stack : undefined,
        url: falUrl,
        fullError: JSON.stringify(fetchError, Object.getOwnPropertyNames(fetchError), 2),
      });
      throw new Error(`Failed to call Fal.ai API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generateImageWithFal] ❌ API error response:', {
        status: response.status,
        statusText: response.statusText,
        url: falUrl,
        requestBodyPreview: JSON.stringify(requestBody, null, 2).substring(0, 500),
        errorBody: errorText,
        errorBodyLength: errorText.length,
      });
      throw new Error(`Fal.ai API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    let result: any;
    let responseText: string = '';
    try {
      responseText = await response.text();
      console.log('[generateImageWithFal] 📄 Raw response text:', {
        length: responseText.length,
        preview: responseText.substring(0, 500),
        fullText: responseText,
      });
      
      result = JSON.parse(responseText);
      console.log('[generateImageWithFal] ✅ Parsed API response:', {
        hasImages: !!result.images,
        imagesCount: result.images?.length || 0,
        hasData: !!result.data,
        requestId: result.request_id || result.requestId,
        status: result.status,
        allKeys: Object.keys(result),
        fullResponse: JSON.stringify(result, null, 2),
      });
    } catch (parseError) {
      console.error('[generateImageWithFal] ❌ JSON parse error:', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        errorType: parseError instanceof Error ? parseError.constructor.name : typeof parseError,
        stack: parseError instanceof Error ? parseError.stack : undefined,
        responseText: responseText ? responseText.substring(0, 1000) : 'Failed to read response text',
        responseTextLength: responseText.length,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Failed to parse Fal.ai response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }
    
    // Handle async queue response - if we get a request_id, poll for results
    const requestId = result.request_id || result.requestId;
    if (requestId && (!result.images || (Array.isArray(result.images) && result.images.length === 0))) {
      console.log('[generateImageWithFal] Received queue request_id, polling for results:', requestId);
      const statusUrl = `https://queue.fal.run/${requestId}`;
      const maxPollAttempts = 120; // 120 attempts = ~2 minutes max
      const pollInterval = 1000; // 1 second
      
      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusResponse = await fetch(statusUrl, {
            headers: {
              "Authorization": `Key ${falKey}`,
            },
          });
          
          if (!statusResponse.ok) {
            if (statusResponse.status === 404) {
              // Still processing, continue polling
              continue;
            }
            const errorText = await statusResponse.text();
            throw new Error(`Failed to check status: ${statusResponse.status} - ${errorText}`);
          }
          
          const statusResult = await statusResponse.json();
          console.log('[generateImageWithFal] Poll attempt', attempt + 1, 'status:', statusResult.status);
          
          if (statusResult.status === "COMPLETED") {
            // Check if we have the image data now
            if (statusResult.images && Array.isArray(statusResult.images) && statusResult.images.length > 0) {
              result = statusResult;
              break;
            }
            // Check data field (some responses use data.images)
            if (statusResult.data && statusResult.data.images) {
              result = statusResult.data;
              break;
            }
          } else if (statusResult.status === "IN_PROGRESS") {
            // Still processing, continue
            continue;
          } else if (statusResult.status === "FAILED") {
            throw new Error(`Fal.ai generation failed: ${statusResult.error || JSON.stringify(statusResult)}`);
          }
        } catch (pollError) {
          // If it's a 404, continue polling; otherwise throw
          if (pollError instanceof Error && pollError.message.includes('404')) {
            continue;
          }
          throw pollError;
        }
      }
      
      // Final check - if we still don't have an image, it timed out
      if (!result.images || (Array.isArray(result.images) && result.images.length === 0)) {
        throw new Error(`Fal.ai generation timed out after ${maxPollAttempts} seconds. Last status: ${JSON.stringify(result)}`);
      }
    }
    
    // Nano Banana Pro returns { images: [{ url, file_name, content_type }], description: string }
    let imageUrl: string | undefined;
    if (result.images && Array.isArray(result.images) && result.images.length > 0) {
      const firstImage = result.images[0];
      imageUrl = firstImage.url || (typeof firstImage === 'string' ? firstImage : undefined);
    } else if (result.data && result.data.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
      const firstImage = result.data.images[0];
      imageUrl = firstImage.url || (typeof firstImage === 'string' ? firstImage : undefined);
    }
    
    if (!imageUrl) {
      console.error("[generateImageWithFal] ❌ No image URL found in response:", {
        resultKeys: Object.keys(result),
        resultPreview: JSON.stringify(result, null, 2).substring(0, 1000),
        fullResult: JSON.stringify(result, null, 2),
      });
      throw new Error(`No image URL in Fal.ai response. Response keys: ${Object.keys(result).join(', ')}. Full response: ${JSON.stringify(result).substring(0, 500)}`);
    }
    
    console.log('[generateImageWithFal] ✅ Image URL extracted:', {
      urlPreview: imageUrl.substring(0, 100),
      urlLength: imageUrl.length,
      fullUrl: imageUrl,
    });

    // Download the image and upload to R2
    console.log('[generateImageWithFal] 📥 Downloading image from Fal.ai:', {
      imageUrl: imageUrl,
    });
    
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error('[generateImageWithFal] ❌ Failed to download image:', {
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        imageUrl: imageUrl,
      });
      throw new Error(`Failed to download generated image: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    console.log('[generateImageWithFal] ✅ Image downloaded:', {
      bufferSize: imageBuffer.byteLength,
      sizeInMB: (imageBuffer.byteLength / 1024 / 1024).toFixed(2),
    });
    
    const bucket = requiredEnv("R2_BUCKET_NAME");
    const { client, accountId } = createR2Client();
    
    const objectKey = `generated/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    
    console.log('[generateImageWithFal] ☁️ Uploading to R2:', {
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
    
    console.log('[generateImageWithFal] ✅ Upload complete:', {
      publicUrl,
      objectKey,
    });

    // Optionally save to media table if projectId is provided
    if (args.projectId) {
      try {
        await ctx.runMutation(api.media.saveMediaRecord, {
          projectId: args.projectId,
          objectKey: objectKey,
          fileName: `generated-${Date.now()}.png`,
          contentType: "image/png",
          kind: "generated",
          uploadedBy: args.userId,
        });
      } catch (error) {
        console.error("Failed to save media record:", error);
        // Non-fatal, continue
      }
    }

    const returnValue = {
      url: publicUrl,
      storageKey: objectKey,
      model: modelConfig.id,
      prompt: args.prompt,
      width: args.width || 1024,
      height: args.height || 1024,
    };
    
    console.log('[generateImageWithFal] 🎉 Action completed successfully:', {
      returnValue: JSON.stringify(returnValue, null, 2),
    });
    
    return returnValue;
  },
});
