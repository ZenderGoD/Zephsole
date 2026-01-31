'use node';

// Ensure no deprecated fields like `multiplier` are ever returned in costs
export function sanitizeCosts<T>(
  costs: T
): T extends { multiplier?: unknown } ? Omit<T, 'multiplier'> : T {
  if (costs && typeof costs === 'object' && 'multiplier' in (costs as Record<string, unknown>)) {
    const { multiplier: _omit, ...rest } = costs as Record<string, unknown> & {
      multiplier?: unknown;
    };
    return rest as T extends { multiplier?: unknown } ? Omit<T, 'multiplier'> : T;
  }
  return costs as T extends { multiplier?: unknown } ? Omit<T, 'multiplier'> : T;
}


