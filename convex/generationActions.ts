"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { routeGenerationRequest } from "./generationRouter";
import { withFalFailover } from "./falManager";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractPrimaryUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || payload === null) return undefined;
  
  const obj = payload as Record<string, unknown>;
  
  if (typeof obj.url === "string") return obj.url;
  
  if (Array.isArray(obj.images) && obj.images.length > 0) {
    const first = obj.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && first !== null && "url" in first && typeof first.url === "string") {
      return first.url;
    }
  }
  
  if (Array.isArray(obj.outputs) && obj.outputs.length > 0) {
    const first = obj.outputs[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && first !== null && "url" in first && typeof first.url === "string") {
      return first.url;
    }
  }
  
  if (obj.data) return extractPrimaryUrl(obj.data);
  return undefined;
}

async function submitFalQueueJob(
  falKey: string,
  endpoint: string,
  input: Record<string, unknown>,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fal request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  const initial = await response.json();
  const requestId = initial.request_id || initial.requestId;
  if (!requestId) {
    return { requestId: undefined as string | undefined, result: initial };
  }

  const statusUrl = `https://queue.fal.run/${requestId}`;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    await sleep(1000);
    const statusResponse = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!statusResponse.ok) {
      if (statusResponse.status === 404) continue;
      const errorText = await statusResponse.text();
      throw new Error(`Fal status check failed: ${statusResponse.status} - ${errorText}`);
    }
    const statusPayload = await statusResponse.json();
    if (statusPayload.status === "COMPLETED") {
      return { requestId, result: statusPayload.data ?? statusPayload };
    }
    if (statusPayload.status === "FAILED") {
      throw new Error(`Fal generation failed: ${statusPayload.error || JSON.stringify(statusPayload)}`);
    }
  }
  throw new Error("Fal generation timed out while waiting for queue completion");
}

export const generateVideoWithFal = action({
  args: {
    prompt: v.string(),
    referenceImageUrl: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const route = routeGenerationRequest({ kind: "video" });
    const input: Record<string, unknown> = {
      prompt: args.prompt,
      aspect_ratio: args.aspectRatio ?? "16:9",
    };
    if (args.referenceImageUrl) input.image_url = args.referenceImageUrl;

    const output = await withFalFailover(ctx, async (falKey) =>
      submitFalQueueJob(falKey, route.endpoint, input),
    );

    return {
      provider: route.provider,
      kind: "video" as const,
      modelId: route.modelId,
      endpoint: route.endpoint,
      requestId: output.requestId,
      primaryUrl: extractPrimaryUrl(output.result),
      result: output.result,
    };
  },
});

export const generateThreeDWithFal = action({
  args: {
    prompt: v.optional(v.string()),
    referenceImageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const route = routeGenerationRequest({ kind: "three_d" });
    const input: Record<string, unknown> = {
      image_url: args.referenceImageUrl,
    };
    if (args.prompt) input.prompt = args.prompt;

    const output = await withFalFailover(ctx, async (falKey) =>
      submitFalQueueJob(falKey, route.endpoint, input),
    );

    return {
      provider: route.provider,
      kind: "three_d" as const,
      modelId: route.modelId,
      endpoint: route.endpoint,
      requestId: output.requestId,
      primaryUrl: extractPrimaryUrl(output.result),
      result: output.result,
    };
  },
});
