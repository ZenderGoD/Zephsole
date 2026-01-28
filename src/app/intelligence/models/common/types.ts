export interface StandardImageRequest {
  prompt: string;
  references?: string[];
  aspectRatio?: string;
  options?: {
    resolution?: string;
    num_images?: number;
    aspect_ratio?: string;
    output_format?: string;
    tiling?: boolean;
  };
}
