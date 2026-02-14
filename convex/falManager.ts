"use node";

import { internal } from "./_generated/api";

export type FalRuntimeKey = {
  name: string;
  key: string;
  capacity: number;
  weight: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY_COOLDOWN_MS = 60_000;
const MAX_FAILURE_STREAK = 3;

const keyRuntimeState = new Map<
  string,
  { failures: number; cooldownUntil: number; lastLatencyMs: number }
>();

const isRetryableFalError = (error: unknown) => {
  const message = String(
    error instanceof Error ? error.message : error ?? "",
  ).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("403") ||
    message.includes("rate") ||
    message.includes("timeout") ||
    message.includes("network")
  );
};

const weightedSort = (
  keys: FalRuntimeKey[],
  loads: Record<string, { activeOperations: number; capacity: number }>,
) => {
  return [...keys].sort((a, b) => {
    const now = Date.now();
    const stateA = keyRuntimeState.get(a.name);
    const stateB = keyRuntimeState.get(b.name);

    const inCooldownA = (stateA?.cooldownUntil ?? 0) > now ? 1 : 0;
    const inCooldownB = (stateB?.cooldownUntil ?? 0) > now ? 1 : 0;
    if (inCooldownA !== inCooldownB) return inCooldownA - inCooldownB;

    const loadA = loads[a.name]?.activeOperations ?? 0;
    const loadB = loads[b.name]?.activeOperations ?? 0;
    const capA = loads[a.name]?.capacity ?? a.capacity;
    const capB = loads[b.name]?.capacity ?? b.capacity;
    const utilA = loadA / Math.max(capA, 1);
    const utilB = loadB / Math.max(capB, 1);
    const failurePenaltyA = (stateA?.failures ?? 0) * 0.1;
    const failurePenaltyB = (stateB?.failures ?? 0) * 0.1;
    const latencyPenaltyA = Math.min((stateA?.lastLatencyMs ?? 0) / 30_000, 0.2);
    const latencyPenaltyB = Math.min((stateB?.lastLatencyMs ?? 0) / 30_000, 0.2);
    const scoreA = utilA + failurePenaltyA + latencyPenaltyA;
    const scoreB = utilB + failurePenaltyB + latencyPenaltyB;
    if (scoreA !== scoreB) return scoreA - scoreB;
    if (utilA !== utilB) return utilA - utilB;
    return b.weight - a.weight;
  });
};

import { ActionCtx } from "./_generated/server";

export async function withFalFailover<T>(
  ctx: ActionCtx,
  operation: (falKey: string, keyMeta: FalRuntimeKey) => Promise<T>,
  options?: { maxAttempts?: number; retryDelayMs?: number },
): Promise<T> {
  await ctx.runMutation(internal.falKeys.seedFalKeysFromEnvIfEmpty, {});
  const keys = (await ctx.runQuery(
    internal.falKeys.getActiveFalKeyConfigs,
    {},
  )) as FalRuntimeKey[];

  if (!keys.length) {
    console.error('[withFalFailover] No active FAL keys configured');
    throw new Error("No active FAL keys configured");
  }

  console.log(`[withFalFailover] Starting operation with ${keys.length} active keys:`, {
    keyNames: keys.map(k => k.name),
    maxAttempts: Math.max(options?.maxAttempts ?? keys.length * 2, keys.length),
  });

  const maxAttempts = Math.max(options?.maxAttempts ?? keys.length * 2, keys.length);
  const retryDelayMs = Math.max(options?.retryDelayMs ?? 200, 50);
  let lastError: unknown = new Error("FAL operation failed");

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const loads = (await ctx.runQuery(
      internal.falKeyLoad.getAllKeyLoads,
      {},
    )) as Record<string, { activeOperations: number; capacity: number }>;
    const candidates = weightedSort(keys, loads);

    for (const keyMeta of candidates) {
      const runtime = keyRuntimeState.get(keyMeta.name);
      if ((runtime?.cooldownUntil ?? 0) > Date.now()) continue;

      const lock = await ctx.runMutation(internal.falKeyLoad.incrementKeyLoad, {
        keyName: keyMeta.name,
        capacity: Math.max(keyMeta.capacity, 1),
      });
      if (!lock?.ok) continue;

      try {
        const start = Date.now();
        const result = await operation(keyMeta.key, keyMeta);
        keyRuntimeState.set(keyMeta.name, {
          failures: 0,
          cooldownUntil: 0,
          lastLatencyMs: Date.now() - start,
        });
        return result;
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[withFalFailover] Attempt ${attempt + 1}/${maxAttempts} failed with key ${keyMeta.name}:`, {
          error: errorMessage,
          retryable: isRetryableFalError(error),
          keyName: keyMeta.name,
        });
        const retryable = isRetryableFalError(error);
        const previous = keyRuntimeState.get(keyMeta.name);
        const failures = (previous?.failures ?? 0) + 1;
        keyRuntimeState.set(keyMeta.name, {
          failures,
          cooldownUntil: failures >= MAX_FAILURE_STREAK ? Date.now() + RETRY_COOLDOWN_MS : 0,
          lastLatencyMs: previous?.lastLatencyMs ?? 0,
        });
        if (!retryable) {
          console.error(`[withFalFailover] Non-retryable error, throwing immediately:`, errorMessage);
          throw error;
        }
      } finally {
        await ctx.runMutation(internal.falKeyLoad.decrementKeyLoad, {
          keyName: keyMeta.name,
        });
      }
    }
    await sleep(Math.min(retryDelayMs * (attempt + 1), 2_000));
  }
  
  const finalError = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[withFalFailover] All ${maxAttempts} attempts failed. Final error:`, finalError);
  throw lastError;
}
