import { Id } from "../../convex/_generated/dataModel";

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
