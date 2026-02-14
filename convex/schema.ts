import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { tables as authTables } from "./betterAuth/schema";

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
    imageUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    classificationId: v.optional(v.id("classifications")),
    mode: v.optional(v.union(v.literal("research"), v.literal("studio"))),
    unitSystem: v.optional(v.union(v.literal("mm"), v.literal("us"), v.literal("eu"), v.literal("cm"))),
    messageQueue: v.optional(v.array(v.object({
      id: v.string(),
      createdAt: v.number(),
      createdBy: v.string(),
      prompt: v.string(),
      attachments: v.optional(v.array(v.any())),
    }))),
    threadStatus: v.optional(v.union(v.literal("idle"), v.literal("pending"), v.literal("generating"), v.literal("error"))),
    errorMessage: v.optional(v.string()),
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
    // Deprecated summary field. Credit balance should be derived from creditGrants.
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

  workshopInvites: defineTable({
    workshopId: v.id("workshops"),
    inviterUserId: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    token: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("expired")),
    expiresAt: v.number(),
    acceptedByUserId: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token", ["token"])
    .index("by_workshop_status", ["workshopId", "status"])
    .index("by_email_status", ["email", "status"]),
  
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
    messageId: v.optional(v.string()), // Store useChat message ID for matching
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
    preferredWorkshopId: v.optional(v.id("workshops")),
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

  imageGenerations: defineTable({
    toolCallId: v.string(), // Unique ID from tool invocation
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    workflowId: v.optional(v.string()), // Workflow ID for tracking
    status: v.union(
      v.literal("generating"),
      v.literal("completed"),
      v.literal("error")
    ),
    prompt: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    url: v.optional(v.string()), // Generated image URL (first image for backward compatibility)
    storageKey: v.optional(v.string()), // First image storage key
    images: v.optional(v.array(v.object({
      url: v.string(),
      storageKey: v.string(),
    }))), // All generated images
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    source: v.optional(v.union(v.literal("research"), v.literal("studio"))),
  }).index("by_toolCallId", ["toolCallId"])
    .index("by_project", ["projectId"])
    .index("by_workflowId", ["workflowId"]),

  creditGrants: defineTable({
    workshopId: v.id("workshops"),
    amount: v.number(),
    remaining: v.number(),
    startsAt: v.number(),
    expiresAt: v.number(),
    source: v.string(), // "purchase", "referral", "bonus"
    refId: v.optional(v.string()), // External ID (e.g. Stripe session ID)
    metadata: v.optional(v.any()),
  }).index("by_workshop_expires", ["workshopId", "expiresAt"])
    .index("by_source_ref", ["source", "refId"]),

  creditRedemptions: defineTable({
    workshopId: v.id("workshops"),
    amount: v.number(),
    usageAt: v.number(),
    createdAt: v.number(),
    projectId: v.optional(v.id("projects")),
    userId: v.optional(v.string()),
    assetType: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("3d"), v.literal("research"))),
    usageContext: v.optional(
      v.union(
        v.literal("thread_asset"),
        v.literal("project_asset"),
        v.literal("upscale"),
        v.literal("aspect_ratio_change"),
        v.literal("technical_draft"),
        v.literal("research"),
        v.literal("misc"),
      ),
    ),
    description: v.optional(v.string()),
    refId: v.optional(v.string()),
    ctcUsd: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  }).index("by_workshop_usage", ["workshopId", "usageAt"])
    .index("by_workshop_idem", ["workshopId", "idempotencyKey"]),

  creditAllocations: defineTable({
    redemptionId: v.id("creditRedemptions"),
    grantId: v.id("creditGrants"),
    amount: v.number(),
  }).index("by_redemption", ["redemptionId"])
    .index("by_grant", ["grantId"]),

  siteAssets: defineTable({
    type: v.union(v.literal("landing"), v.literal("studio"), v.literal("showcase")),
    url: v.string(),
    key: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.optional(v.number()),
    order: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_type", ["type"]),

  falKeys: defineTable({
    name: v.string(),
    key: v.string(),
    enabled: v.boolean(),
    capacity: v.number(),
    weight: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_enabled", ["enabled"]),

  falKeyLoad: defineTable({
    keyName: v.string(),
    activeOperations: v.number(),
    capacity: v.number(),
    lastUpdated: v.number(),
  }).index("by_key_name", ["keyName"]),

  falHealthChecks: defineTable({
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("critical")),
    enabledKeys: v.number(),
    overloadedKeys: v.number(),
    staleLoadEntries: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),
});
