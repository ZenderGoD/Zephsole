import { Id, Doc } from "../../convex/_generated/dataModel";
export type { Id, Doc };

export type WorkspaceMode = 'research' | 'studio';
export type GenMode = 'research' | 'ideation' | 'technical' | 'material';

export type MediaAttachment = {
  id?: Id<"media">;
  objectKey: string;
  url: string;
  fileName: string;
  contentType: string;
  size?: number;
  base64?: string;
};

export type PromptPayload = {
  text: string;
  attachments?: MediaAttachment[];
};

// Tool call argument types
export interface SendToCanvasArgs {
  title: string;
  content: string;
  type: 'research' | 'material' | 'concept' | 'image' | 'sole-spec';
  agent?: 'zeph' | 'analyst' | 'maker' | 'artist';
  imageUrl?: string;
  data?: Record<string, unknown>;
}

export interface RenameProjectArgs {
  name: string;
}

export interface UpdateDesignContextArgs {
  footwearType?: string;
  gender?: string;
  aestheticVibe?: string;
  targetAudience?: string;
  colorPalette?: Array<{ name: string; hex: string; usage?: string }>;
  keyMaterials?: string[];
  performanceSpecs?: string[];
  summary?: string;
}

export interface UpdateBOMArgs {
  items: Array<{
    partName: string;
    partCategory: 'upper' | 'sole' | 'component' | 'packaging';
    materialName: string;
    materialGrade?: string;
    color?: string;
    quantity: number;
    unit: string;
    supplier?: string;
    estimatedCost?: number;
  }>;
  totalEstimatedCost?: number;
  currency?: string;
}

export interface UpdateProductBaselinesArgs {
  unitSystem?: 'mm' | 'us' | 'eu' | 'cm';
  sizeRun?: {
    system: string;
    sizes: number[];
    widths?: string[];
  };
  lastShape?: string;
  heelHeight?: number;
  toeSpring?: number;
  measurements?: Record<string, string>;
}

export interface AnalyzeFootwearImageArgs {
  imageUrls: string[];
  productName: string;
  analysisNotes?: string;
}

export interface RequestTechnicalBlueprintArgs {
  imageUrls: string[];
  productName: string;
  confirmedMeasurements?: UpdateProductBaselinesArgs;
  materials?: string[];
  constructionDetails?: string;
}

export interface GenerateSoleSpecArgs {
  midsoleMaterial: string;
  outsoleMaterial: string;
  stackHeightHeel: number;
  stackHeightForefoot: number;
  drop: number;
  treadPattern: string;
  plateType: 'None' | 'Carbon' | 'TPU' | 'Nylon';
  cushioningLevel: 'Firm' | 'Balanced' | 'Plush' | 'Max';
  weightEst: number;
  costEst: number;
}

export interface GenerateImageArgs {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  referenceImage?: string;
  referenceImageUrl?: string;
}

export interface GenerateImageResult {
  prompt: string;
  aspectRatio: string;
  referenceImage?: string;
}

/** Result from image workflow (Convex) may include url/model */
export type GenerateImageWorkflowResult = GenerateImageResult & { url?: string; model?: string };

// Message attachment types
export interface MessageAttachment {
  url: string;
  contentType: string;
  fileName: string;
  mediaId?: Id<"media">;
  size?: number;
}

export interface PersistedMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  messageId?: string; // useChat message ID for matching
  attachments?: MessageAttachment[];
  timestamp?: number;
}

// Canvas item types
export interface CanvasItemData {
  title?: string;
  content?: string;
  type?: string;
  imageUrl?: string;
  data?: Record<string, unknown>;
}

export interface CanvasItem {
  _id: Id<"canvasItems">;
  id?: string;
  type: string;
  data: CanvasItemData;
  x: number;
  y: number;
  scale?: number;
}

// Workshop types
export type Workshop = Doc<"workshops">;
export type Project = Doc<"projects">;

// Queue item types
export interface MessageQueueItem {
  id: string;
  createdAt: number;
  createdBy: string;
  prompt: string;
  attachments?: Array<{
    id?: string;
    objectKey?: string;
    url?: string;
    fileName?: string;
    contentType?: string;
    size?: number;
    base64?: string;
  }>;
}

// Error types
export interface ErrorWithMessage {
  message: string;
  [key: string]: unknown;
}
