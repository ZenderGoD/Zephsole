export async function runFalModel(model: string, input: Record<string, unknown>): Promise<{ url: string; requestId?: string }> {
  // Placeholder for real fal.ai run logic
  console.log(`Running Fal model: ${model}`, input);
  return { url: 'https://placeholder.com/image.png' };
}

export async function runReplicateModel(model: string, input: Record<string, unknown>): Promise<{ url: string; requestId?: string }> {
  // Placeholder for real replicate run logic
  console.log(`Running Replicate model: ${model}`, input);
  return { url: 'https://placeholder.com/image.png' };
}
