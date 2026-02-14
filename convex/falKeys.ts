import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminUser, requireAuthUserId } from "./authUtils";

type RuntimeFalKey = {
  name: string;
  key: string;
  capacity: number;
  weight: number;
};

const sanitizeName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");

function parseEnvFalKeys(): RuntimeFalKey[] {
  const keys: RuntimeFalKey[] = [];
  const rawArray = process.env.FAL_KEY_ID;
  const legacyA = process.env.FAL_KEY_ALPHA;
  const legacy = process.env.FAL_KEY;

  if (rawArray) {
    try {
      const parsed = JSON.parse(rawArray);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i += 1) {
          const item = parsed[i];
          if (typeof item === "string" && item.trim()) {
            keys.push({
              name: `env_${i + 1}`,
              key: item.trim(),
              capacity: 8,
              weight: 1,
            });
          }
        }
      } else if (typeof parsed === "string" && parsed.trim()) {
        keys.push({ name: "env_1", key: parsed.trim(), capacity: 8, weight: 1 });
      }
    } catch {
      if (rawArray.trim()) {
        keys.push({ name: "env_1", key: rawArray.trim(), capacity: 8, weight: 1 });
      }
    }
  }

  if (legacyA?.trim()) {
    keys.push({ name: "alpha", key: legacyA.trim(), capacity: 8, weight: 1 });
  }
  if (legacy?.trim()) {
    keys.push({ name: "legacy", key: legacy.trim(), capacity: 8, weight: 1 });
  }

  const dedup = new Map<string, RuntimeFalKey>();
  for (const key of keys) {
    if (!dedup.has(key.key)) dedup.set(key.key, key);
  }
  return Array.from(dedup.values());
}

async function requirePlatformAdmin(ctx: MutationCtx | QueryCtx) {
  await requireAuthUserId(ctx);
  const admin = await isAdminUser(ctx);
  if (!admin) throw new ConvexError("ADMIN_ONLY");
}

export const seedFalKeysFromEnvIfEmpty = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("falKeys").collect();
    if (existing.length > 0) return { seeded: false, count: existing.length };

    const envKeys = parseEnvFalKeys();
    const now = Date.now();
    for (const keyCfg of envKeys) {
      await ctx.db.insert("falKeys", {
        name: sanitizeName(keyCfg.name),
        key: keyCfg.key,
        enabled: true,
        capacity: keyCfg.capacity,
        weight: keyCfg.weight,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, count: envKeys.length };
  },
});

export const getActiveFalKeyConfigs = internalQuery({
  args: {},
  handler: async (ctx): Promise<RuntimeFalKey[]> => {
    const dbKeys = await ctx.db
      .query("falKeys")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    if (dbKeys.length > 0) {
      return dbKeys.map((k) => ({
        name: k.name,
        key: k.key.trim(), // Ensure key is trimmed
        capacity: Math.max(k.capacity, 1),
        weight: Math.max(k.weight, 1),
      }));
    }
    return parseEnvFalKeys();
  },
});

export const listFalKeysForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformAdmin(ctx);
    const keys = await ctx.db.query("falKeys").withIndex("by_name").collect();
    const loads = await ctx.db.query("falKeyLoad").withIndex("by_key_name").collect();
    const loadByName = new Map(loads.map((l) => [l.keyName, l]));
    return keys.map((k) => ({
      _id: k._id,
      name: k.name,
      enabled: k.enabled,
      capacity: k.capacity,
      weight: k.weight,
      activeOperations: loadByName.get(k.name)?.activeOperations ?? 0,
      updatedAt: k.updatedAt,
    }));
  },
});

export const addFalKey = mutation({
  args: {
    name: v.string(),
    key: v.string(),
    capacity: v.optional(v.number()),
    weight: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const now = Date.now();
    const name = sanitizeName(args.name);
    const exists = await ctx.db.query("falKeys").withIndex("by_name", (q) => q.eq("name", name)).first();
    if (exists) throw new ConvexError("FAL_KEY_NAME_EXISTS");
    return await ctx.db.insert("falKeys", {
      name,
      key: args.key.trim(),
      enabled: args.enabled ?? true,
      capacity: Math.max(args.capacity ?? 8, 1),
      weight: Math.max(args.weight ?? 1, 1),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateFalKey = mutation({
  args: {
    id: v.id("falKeys"),
    name: v.optional(v.string()),
    key: v.optional(v.string()),
    capacity: v.optional(v.number()),
    weight: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new ConvexError("FAL_KEY_NOT_FOUND");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = sanitizeName(args.name);
    if (args.key !== undefined) patch.key = args.key.trim();
    if (args.capacity !== undefined) patch.capacity = Math.max(args.capacity, 1);
    if (args.weight !== undefined) patch.weight = Math.max(args.weight, 1);
    if (args.enabled !== undefined) patch.enabled = args.enabled;
    await ctx.db.patch(args.id, patch);
    return args.id;
  },
});

export const removeFalKey = mutation({
  args: { id: v.id("falKeys") },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) return;
    await ctx.db.delete(args.id);
  },
});

export const setFalKeyEnabled = mutation({
  args: { id: v.id("falKeys"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    await ctx.db.patch(args.id, { enabled: args.enabled, updatedAt: Date.now() });
  },
});

export const testFalKey = query({
  args: { id: v.optional(v.id("falKeys")) },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
    let keyToTest: string | undefined;
    let keyName = "unknown";
    
    if (args.id) {
      const key = await ctx.db.get(args.id);
      if (!key) throw new ConvexError("FAL_KEY_NOT_FOUND");
      keyToTest = key.key.trim();
      keyName = key.name;
    } else {
      // Test first active key
      const keys = await ctx.db
        .query("falKeys")
        .withIndex("by_enabled", (q) => q.eq("enabled", true))
        .first();
      if (!keys) throw new ConvexError("NO_ACTIVE_KEYS");
      keyToTest = keys.key.trim();
      keyName = keys.name;
    }
    
    if (!keyToTest) throw new ConvexError("INVALID_KEY");
    
    const startTime = Date.now();
    try {
      const response = await fetch("https://fal.run/models", {
        method: "GET",
        headers: {
          Authorization: `Key ${keyToTest}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      
      const responseTime = Date.now() - startTime;
      const responseText = await response.text();
      
      if (response.ok) {
        return {
          success: true,
          keyName,
          status: response.status,
          responseTime,
          message: "Key is valid and working",
        };
      } else {
        return {
          success: false,
          keyName,
          status: response.status,
          responseTime,
          error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        keyName,
        responseTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
