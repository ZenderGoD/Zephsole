import { action } from "./_generated/server";
import { v } from "convex/values";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const analyzeProduct = action({
  args: { 
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { object } = await generateObject({
        model: openrouter("google/gemini-2.0-flash-exp:free"), // Fast and free for extraction
        schema: z.object({
          name: z.string(),
          description: z.string(),
        }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this footwear image and provide a creative name and a detailed description for it."
              },
              {
                type: "image",
                image: args.imageUrl
              }
            ]
          }
        ],
      });

      return {
        name: object.name || "New Footwear Design",
        description: object.description || "A custom footwear design analyzed by Zephsole AI."
      };
    } catch (error) {
      console.error("Product analysis failed:", error);
      return {
        name: "New Footwear Design",
        description: "A custom footwear design."
      };
    }
  },
});
