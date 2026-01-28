import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const getAccountId = () => requiredEnv("R2_ACCOUNT_ID");

const publicBaseUrl = (bucket: string, accountId: string) =>
  (process.env.R2_PUBLIC_URL || `https://${bucket}.${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");

export const saveMediaRecord = mutation({
  args: {
    projectId: v.id("projects"),
    objectKey: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.optional(v.number()),
    kind: v.optional(v.string()),
    uploadedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bucket = requiredEnv("R2_BUCKET_NAME");
    const accountId = getAccountId();

    if (!args.objectKey.startsWith(`projects/${args.projectId}/`)) {
      throw new Error("Object key does not belong to project");
    }

    const url = `${publicBaseUrl(bucket, accountId)}/${args.objectKey}`;

    return await ctx.db.insert("media", {
      projectId: args.projectId,
      key: args.objectKey,
      url,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      kind: args.kind || "image",
      uploadedBy: args.uploadedBy,
      createdAt: Date.now(),
    });
  },
});

export const listProjectMedia = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("media")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});
