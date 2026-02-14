"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { isAdminUser, requireAuthUserId } from "./authUtils";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const createR2Client = () => {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return { client, accountId };
};

const publicBaseUrl = (bucket: string, accountId: string) =>
  (process.env.R2_PUBLIC_URL || `https://${bucket}.${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");

export const getUploadUrl = action({
  args: {
    type: v.union(v.literal("landing"), v.literal("studio"), v.literal("showcase")),
    fileName: v.string(),
    contentType: v.string(),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const admin = await isAdminUser(ctx);
    if (!admin) throw new Error("ADMIN_ONLY");

    const bucket = requiredEnv("R2_BUCKET_NAME");
    const { client, accountId } = createR2Client();

    if (!args.contentType.startsWith("image/")) {
      throw new Error("Only image uploads are allowed");
    }

    if (args.size && args.size > MAX_UPLOAD_BYTES) {
      throw new Error("Image too large (max 20MB)");
    }

    const safeName = args.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
    const objectKey = `site-assets/${args.type}/${Date.now()}-${randomUUID()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: args.contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });

    return {
      uploadUrl,
      objectKey,
      publicUrl: `${publicBaseUrl(bucket, accountId)}/${objectKey}`,
    };
  },
});
