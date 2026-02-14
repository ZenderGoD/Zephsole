import { MODEL_CONFIGS } from "./models";

export type GenerationKind = "image" | "video" | "three_d";
export type GenerationProvider = "fal" | "replicate" | "openrouter";

export type ImageRoute = {
  kind: "image";
  provider: "fal";
  modelId: string;
  endpoint: string;
};

export type DeferredRoute = {
  kind: "video" | "three_d";
  provider: "fal";
  modelId: string;
  endpoint: string;
  deferred: true;
};

export type GenerationRoute = ImageRoute | DeferredRoute;

export function routeGenerationRequest(params: {
  kind: GenerationKind;
  referenceImageCount?: number;
}): GenerationRoute {
  if (params.kind === "image") {
    const hasReferenceImages = (params.referenceImageCount ?? 0) > 0;
    const modelId = hasReferenceImages ? "nano-banana-pro-edit" : "nano-banana-pro";
    const cfg = MODEL_CONFIGS[modelId];
    return {
      kind: "image",
      provider: "fal",
      modelId,
      endpoint: cfg.endpoint,
    };
  }

  if (params.kind === "video") {
    return {
      kind: "video",
      provider: "fal",
      modelId: "fal-video-default",
      endpoint: "https://fal.run/fal-ai/kling-video/v2.5/standard/text-to-video",
      deferred: true,
    };
  }

  return {
    kind: "three_d",
    provider: "fal",
    modelId: "fal-3d-default",
    endpoint: "https://fal.run/fal-ai/hunyuan3d/v2",
    deferred: true,
  };
}
