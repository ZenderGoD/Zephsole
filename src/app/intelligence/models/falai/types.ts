export interface ImageModelDef {
  key: string;
  label: string;
  defaultProvider: string;
  variants: Record<string, {
    provider: string;
    pricing: {
      usageType: 'per_image' | 'per_token';
      costPerImage?: number;
      currency: string;
      lastUpdated: number;
    };
    buildInput: (req: any) => Promise<Record<string, unknown>>;
    run: (input: Record<string, unknown>, ...args: any[]) => Promise<{ url: string; requestId?: string }>;
  }>;
}
