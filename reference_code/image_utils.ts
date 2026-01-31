'use node';

import { v, ConvexError } from 'convex/values';
import imageSize from 'image-size';
import { Buffer } from 'node:buffer';
import { R2 } from '@convex-dev/r2';
import { internalAction } from '../_generated/server';
import { components } from '../_generated/api';
import { resolveUrl } from '../media/resolve';
import { makeStorageKey, toPublicUrl } from '../media/keys';
import { Jimp } from 'jimp';

const r2 = new R2(components.r2);
const RANGE_BYTES = 256 * 1024; // Try to read up to 256KB first
const MAX_BYTES = 1024 * 1024; // Hard cap at 1MB to avoid excessive memory
type ImageSizeResult = ReturnType<typeof imageSize>;

function shouldKeepReading(error: unknown, bytesRead: number): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const recoverable =
    message.includes('exceeded buffer limits') ||
    message.includes('unexpected end of data') ||
    message.includes('corrupt jpg') ||
    message.includes('input buffer is too small');
  return recoverable && bytesRead < MAX_BYTES;
}

/**
 * Crops an image based on normalized coordinates (0-1) and stores it in R2.
 */
export const cropImage = internalAction({
  args: {
    url: v.string(),
    orgSlug: v.string(),
    coordinates: v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    console.log(`[cropImage] ✂️ Cropping image for motif extraction`, {
      url: args.url,
      coordinates: args.coordinates,
    });

    // 1. Fetch original image
    const response = await fetch(args.url);
    if (!response.ok) throw new ConvexError(`Failed to fetch image for cropping: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Read image with Jimp
    const image = await Jimp.read(buffer);
    const fullWidth = image.width;
    const fullHeight = image.height;
    
    if (!fullWidth || !fullHeight) {
      throw new ConvexError('Could not determine image dimensions for cropping');
    }

    // 3. Convert normalized to pixels
    const left = Math.max(0, Math.round(args.coordinates.x * fullWidth));
    const top = Math.max(0, Math.round(args.coordinates.y * fullHeight));
    const width = Math.min(fullWidth - left, Math.round(args.coordinates.width * fullWidth));
    const height = Math.min(fullHeight - top, Math.round(args.coordinates.height * fullHeight));

    console.log(`[cropImage] Pixel coordinates:`, { left, top, width, height, fullWidth, fullHeight });

    // 4. Perform crop
    image.crop({ x: left, y: top, w: width, h: height });
    const croppedBuffer = await image.getBuffer('image/png');

    // 5. Store cropped image in R2
    const storageKey = makeStorageKey({
      orgSlug: args.orgSlug,
      mediaType: 'image',
      ext: 'png'
    });
    
    await r2.store(ctx, Buffer.from(croppedBuffer), { key: storageKey, type: 'image/png' });
    const publicUrl = toPublicUrl(storageKey);

    console.log(`[cropImage] ✓ Cropped image stored:`, { storageKey, url: publicUrl });

    return { storageKey, url: publicUrl };
  },
});

// Internal Node action to fetch an image and return its metadata
export const extractImageMetadata = internalAction({
  args: {
    url: v.optional(v.string()),
    storageKey: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
  },
  returns: v.object({
    width: v.number(),
    height: v.number(),
    fileSize: v.number(),
    mimeType: v.string(),
  }),
  // Node runtime for Buffer & image-size
  handler: async (
    ctx,
    { url, storageKey, storageId }
  ): Promise<{
    width: number;
    height: number;
    fileSize: number;
    mimeType: string;
  }> => {
    const resolvedUrl =
      (await resolveUrl({ url: url ?? undefined, storageKey, storageId }, ctx)) ?? null;

    if (!resolvedUrl) {
      throw new ConvexError('No URL or storage reference provided for metadata extraction');
    }

    const startTime = Date.now();
    console.log(`[extractImageMetadata] Starting metadata extraction`, {
      url: resolvedUrl,
      urlLength: resolvedUrl.length,
      storageKey,
      storageId: storageId ? String(storageId) : undefined,
      timestamp: new Date().toISOString(),
    });

    let r2Metadata:
      | {
          size?: number | null;
          contentType?: string | null;
          sha256?: string | null;
          lastModified?: string | null;
        }
      | null = null;
    if (storageKey) {
      try {
        r2Metadata = await r2.getMetadata(ctx, storageKey);
      } catch (metadataError) {
        console.warn(`[extractImageMetadata] Failed to read R2 metadata`, {
          error: metadataError instanceof Error ? metadataError.message : String(metadataError),
        });
      }
    }

    let response: Response;
    try {
      console.log(`[extractImageMetadata] Initiating fetch request...`);
      const fetchStartTime = Date.now();
      response = await fetch(resolvedUrl, {
        headers: {
          Range: `bytes=0-${RANGE_BYTES - 1}`,
        },
      });
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(`[extractImageMetadata] Fetch completed`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          contentEncoding: response.headers.get('content-encoding'),
          contentRange: response.headers.get('content-range'),
        },
        fetchDurationMs: fetchDuration,
      });
    } catch (fetchError) {
      const fetchDuration = Date.now() - startTime;
      console.error(`[extractImageMetadata] Fetch request failed`, {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        errorStack: fetchError instanceof Error ? fetchError.stack : undefined,
        url: resolvedUrl,
        fetchDurationMs: fetchDuration,
      });
      throw new ConvexError(
        `Failed to fetch image: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
      );
    }

    if (!response.ok) {
      const fetchDuration = Date.now() - startTime;
      const headerEntries: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerEntries[key] = value;
      });

      console.error(`[extractImageMetadata] Fetch returned non-ok status`, {
        status: response.status,
        statusText: response.statusText,
        headers: headerEntries,
        url: resolvedUrl,
        fetchDurationMs: fetchDuration,
      });
      throw new ConvexError(`Failed to fetch image (${response.status} ${response.statusText})`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentRangeHeader = response.headers.get('content-range');
    const rangeMatch = contentRangeHeader?.match(/bytes \d+-\d+\/(\d+)/i);
    const fileSizeFromRange = rangeMatch?.[1] ? parseInt(rangeMatch[1], 10) : null;
    const fileSizeHeader = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;
    const fileSize = fileSizeFromRange ?? fileSizeHeader ?? r2Metadata?.size ?? null;

    // Read chunks until image-size can parse dimensions or we hit a safe byte cap.
    let buffer: Buffer;
    let lastImageSizeError: unknown = null;
    let imageSizeResult: ImageSizeResult | undefined;
    try {
      console.log(`[extractImageMetadata] Reading data from stream...`);
      const chunkStartTime = Date.now();

      if (!response.body) {
        throw new ConvexError('Response body is null');
      }

      const reader = response.body.getReader();
      let done = false;
      buffer = Buffer.alloc(0);

      while (!done) {
        const { value, done: readDone } = await reader.read();
        done = readDone;

        if (value && value.length > 0) {
          buffer = Buffer.concat([buffer, Buffer.from(value)]);
        }

        if (buffer.byteLength > MAX_BYTES) {
          void reader.cancel();
          throw new ConvexError(
            `Exceeded maximum buffered bytes (${MAX_BYTES}) while parsing image metadata`
          );
        }

        if (buffer.byteLength === 0 && done) {
          throw new ConvexError('Could not read image data from stream');
        }

        try {
          imageSizeResult = imageSize(buffer);
          void reader.cancel();
          break;
        } catch (imageError) {
          lastImageSizeError = imageError;
          if (done || !shouldKeepReading(imageError, buffer.byteLength)) {
            void reader.cancel();
            throw imageError;
          }
        }
      }

      const chunkDuration = Date.now() - chunkStartTime;
      console.log(`[extractImageMetadata] Stream reading completed`, {
        bufferLength: buffer.length,
        bufferByteLength: buffer.byteLength,
        contentLengthHeader: contentLengthHeader,
        fileSizeFromHeader: fileSize,
        chunkDurationMs: chunkDuration,
      });
    } catch (chunkError) {
      const chunkDuration = Date.now() - startTime;
      console.error(`[extractImageMetadata] Chunk reading failed`, {
        error: chunkError instanceof Error ? chunkError.message : String(chunkError),
        errorType: chunkError instanceof Error ? chunkError.constructor.name : typeof chunkError,
        errorStack: chunkError instanceof Error ? chunkError.stack : undefined,
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLengthHeader: contentLengthHeader,
        chunkDurationMs: chunkDuration,
      });
      throw new ConvexError(
        `Failed to read image data: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`
      );
    }

    let width = 0;
    let height = 0;
    let type: string | undefined;
    try {
      console.log(`[extractImageMetadata] Parsing image dimensions with image-size...`);
      const imageSizeStartTime = Date.now();
      if (!imageSizeResult) {
        throw lastImageSizeError ??
          new ConvexError('Unable to determine image dimensions from streamed data');
      }
      const imageSizeDuration = Date.now() - imageSizeStartTime;
      width = imageSizeResult.width ?? 0;
      height = imageSizeResult.height ?? 0;
      type = imageSizeResult.type;
      console.log(`[extractImageMetadata] Image size parsing completed`, {
        width,
        height,
        type,
        imageSizeDurationMs: imageSizeDuration,
      });
    } catch (imageSizeError) {
      const imageSizeDuration = Date.now() - startTime;
      console.error(`[extractImageMetadata] Image size parsing failed`, {
        error: imageSizeError instanceof Error ? imageSizeError.message : String(imageSizeError),
        errorType: imageSizeError instanceof Error ? imageSizeError.constructor.name : typeof imageSizeError,
        errorStack: imageSizeError instanceof Error ? imageSizeError.stack : undefined,
        bufferLength: buffer.length,
        bufferByteLength: buffer.byteLength,
        contentType: response.headers.get('content-type'),
        imageSizeDurationMs: imageSizeDuration,
      });
      throw new ConvexError(
        `Failed to parse image dimensions: ${imageSizeError instanceof Error ? imageSizeError.message : String(imageSizeError)}`
      );
    }

    const contentType =
      response.headers.get('content-type') ??
      r2Metadata?.contentType ??
      (type ? `image/${type}` : null);
    
    const finalFileSize = r2Metadata?.size ?? fileSize ?? buffer.byteLength;
    
    if (!finalFileSize || finalFileSize <= 0) {
      throw new ConvexError(
        `Could not determine file size: Content-Length header missing and buffer is empty`
      );
    }
    
    const metadata = {
      width,
      height,
      fileSize: finalFileSize,
      mimeType: contentType ?? `image/${type ?? 'png'}`,
    };

    console.log(`[extractImageMetadata] Extracted metadata`, {
      width: metadata.width,
      height: metadata.height,
      fileSize: metadata.fileSize,
      mimeType: metadata.mimeType,
      detectedType: type,
      contentTypeHeader: contentType,
      fileSizeFromHeader: fileSize,
      bufferSize: buffer.byteLength,
      totalDurationMs: Date.now() - startTime,
    });

    // Validate metadata - throw error if invalid (will trigger retry)
    if (metadata.width <= 0 || metadata.height <= 0 || metadata.fileSize <= 0) {
      const totalDuration = Date.now() - startTime;
      console.error(`[extractImageMetadata] Invalid metadata detected`, {
        width: metadata.width,
        height: metadata.height,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        detectedType: type,
        bufferLength: buffer.length,
        contentTypeHeader: contentType,
        fileSizeFromHeader: fileSize,
        totalDurationMs: totalDuration,
      });
      throw new ConvexError(
        `Invalid image metadata: width=${metadata.width}, height=${metadata.height}, fileSize=${metadata.fileSize}`
      );
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[extractImageMetadata] Successfully extracted valid metadata`, {
      width: metadata.width,
      height: metadata.height,
      fileSize: metadata.fileSize,
      mimeType: metadata.mimeType,
      totalDurationMs: totalDuration,
    });
    return metadata;
  },
});
