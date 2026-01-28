import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "./authSchema";

export default defineSchema({
  ...authTables,
  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    workshopId: v.id("workshops"),
    userId: v.string(), // Keep userId to know who created it within the workshop
    status: v.string(), // "draft", "generating", "complete"
    lastUpdated: v.number(),
    isPinned: v.optional(v.boolean()),
    classificationId: v.optional(v.id("classifications")),
    mode: v.optional(v.union(v.literal("research"), v.literal("studio"))),
    unitSystem: v.optional(v.union(v.literal("mm"), v.literal("us"), v.literal("eu"), v.literal("cm"))),
  }).index("by_workshop", ["workshopId"])
    .index("by_slug", ["slug"])
    .index("by_workshop_pinned", ["workshopId", "isPinned"]),

  classifications: defineTable({
    name: v.string(),
    workshopId: v.id("workshops"),
    color: v.optional(v.string()),
  }).index("by_workshop", ["workshopId"]),

  workshops: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdAt: v.number(),
    credits: v.optional(v.number()),
  }).index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),

  workshopMembers: defineTable({
    workshopId: v.id("workshops"),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  }).index("by_workshop", ["workshopId"])
    .index("by_user", ["userId"])
    .index("by_workshop_user", ["workshopId", "userId"]),
  
  productBaselines: defineTable({
    projectId: v.id("projects"),
    sizeRun: v.object({
      system: v.string(),
      sizes: v.array(v.number()),
      widths: v.array(v.string()),
    }),
    lastShape: v.optional(v.string()),
    heelHeight: v.optional(v.number()),
    toeSpring: v.optional(v.number()),
    measurements: v.optional(v.any()), // Detailed mm measurements
  }).index("by_project", ["projectId"]),

  upperDesigns: defineTable({
    projectId: v.id("projects"),
    panels: v.array(v.object({
      name: v.string(),
      materialId: v.optional(v.id("materials")),
      area: v.optional(v.number()),
    })),
    stitching: v.optional(v.string()),
    closures: v.optional(v.array(v.string())),
    lining: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  soleDesigns: defineTable({
    projectId: v.id("projects"),
    outsoleMaterialId: v.optional(v.id("materials")),
    midsoleMaterialId: v.optional(v.id("materials")),
    treadPattern: v.optional(v.string()),
    midsoleStack: v.optional(v.number()),
    shank: v.optional(v.string()),
    plate: v.optional(v.string()),
  }).index("by_project", ["projectId"]),

  intelligenceThreads: defineTable({
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    type: v.optional(v.string()), // "text", "card"
    cardData: v.optional(v.any()),
    attachments: v.optional(v.array(v.object({
      mediaId: v.optional(v.id("media")),
      url: v.string(),
      fileName: v.string(),
      contentType: v.string(),
      size: v.optional(v.number()),
    }))),
    timestamp: v.number(),
  }).index("by_project", ["projectId"]),

  canvasItems: defineTable({
    projectId: v.id("projects"),
    type: v.string(), // "research-card", "render", "schematic", "cost-block"
    data: v.any(),
    x: v.number(),
    y: v.number(),
    scale: v.optional(v.number()),
    version: v.number(),
  }).index("by_project", ["projectId"]),

  versions: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    description: v.optional(v.string()),
    snapshot: v.any(), // Serialized state of the canvas/product
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  components: defineTable({
    projectId: v.id("projects"),
    type: v.string(), // "upper", "sole", "last", "lace"
    prompt: v.string(),
    data: v.any(), // JSON or R2 file reference
    visualUrl: v.optional(v.string()), // R2 link for preview
    cost: v.optional(v.number()),
    timeToBuild: v.optional(v.number()),
  }).index("by_project", ["projectId"]),

  schematics: defineTable({
    projectId: v.id("projects"),
    fileUrl: v.string(), // R2 link to DXF/STL
    version: v.number(),
    annotations: v.array(v.string()),
  }).index("by_project", ["projectId"]),

  materials: defineTable({
    name: v.string(),
    supplier: v.optional(v.string()),
    unit: v.string(), // "sqft", "meter", "kg", "pair"
    pricePerUnit: v.number(),
    currency: v.string(),
    co2PerUnit: v.optional(v.number()),
    properties: v.optional(v.any()), // Elasticity, weight, etc.
    availability: v.boolean(),
  }),

  referrals: defineTable({
    referrerId: v.string(), // User ID of the person who shared their code
    referredId: v.string(), // User ID of the person who signed up
    status: v.union(v.literal("joined"), v.literal("purchased")),
    rewardedForMilestone: v.optional(v.boolean()), // Track if this specific referral contributed to a "5-use" reward
    createdAt: v.number(),
  }).index("by_referrer", ["referrerId"])
    .index("by_referred", ["referredId"]),

  referralStats: defineTable({
    userId: v.string(),
    totalUses: v.number(),
    lastMilestoneRewardCount: v.number(), // Number of uses when they last got the 5-use bonus
  }).index("by_user", ["userId"]),

  designContext: defineTable({
    projectId: v.id("projects"),
    footwearType: v.optional(v.string()), // e.g., "Sneaker", "Boot", "Heel"
    gender: v.optional(v.string()),
    aestheticVibe: v.optional(v.string()), // e.g., "Minimalist", "Aggressive", "Techwear"
    targetAudience: v.optional(v.string()),
    colorPalette: v.optional(v.array(v.object({
      name: v.string(),
      hex: v.string(),
      usage: v.optional(v.string()), // e.g., "Primary", "Accent", "Sole"
    }))),
    keyMaterials: v.optional(v.array(v.string())),
    performanceSpecs: v.optional(v.array(v.string())),
    summary: v.optional(v.string()),
    lastUpdated: v.number(),
  }).index("by_project", ["projectId"]),

  boms: defineTable({
    projectId: v.id("projects"),
    items: v.array(v.object({
      partName: v.string(),
      partCategory: v.string(), // "upper", "sole", "component", "packaging"
      materialName: v.string(),
      materialGrade: v.optional(v.string()),
      color: v.optional(v.string()),
      quantity: v.number(),
      unit: v.string(), // "pair", "sqft", "m"
      supplier: v.optional(v.string()),
      estimatedCost: v.optional(v.number()),
    })),
    totalEstimatedCost: v.optional(v.number()),
    currency: v.string(),
    lastUpdated: v.number(),
  }).index("by_project", ["projectId"]),

  media: defineTable({
    projectId: v.id("projects"),
    key: v.string(), // Object key in R2
    url: v.string(), // Publicly accessible URL
    fileName: v.string(),
    contentType: v.string(),
    size: v.optional(v.number()),
    kind: v.optional(v.string()), // image, file, etc.
    uploadedBy: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),
});
