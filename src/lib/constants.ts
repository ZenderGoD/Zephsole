/**
 * Credit Costing and Pricing Constants
 * 
 * SCALE: 1 Credit = $1.00 USD
 */

export const CREDIT_COSTS = {
  IMAGE_GENERATION_PRO: 0.60, // Google Nano Banana Pro ($0.60)
  IMAGE_GENERATION_BASIC: 0.20, // Google Nano Banana ($0.20)
  RESEARCH_QUERY: 1.00,         // Standard LLM Search/Analysis ($1.00)
  DEEP_RESEARCH_SESSION: 1.00, // Multi-step agentic research ($1.00)
  WEB_SEARCH: 1.00,            // Real-time web search access ($1.00)
  TECHNICAL_DRAFT_GEN: 1.00,   // DXF/STL Generation ($1.00)
};

export const PRICING_PLANS = [
  {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    credits: 5.00, // Allows for initial exploration
    description: "Trial the power of footwear intelligence. Free credits apply to your first workshop only.",
    features: ["Standard Research", "$5.00 One-time Credits", "Single Workshop"],
    isFree: true,
  },
  {
    name: "Plus",
    monthlyPrice: 20,
    annualPrice: 192, // $16/mo
    credits: 20,
    description: "For designers ready to scale their output.",
    features: ["Priority Agents", "20 Monthly Credits", "Infinite Canvas", "Community Access"],
  },
  {
    name: "Max",
    monthlyPrice: 50,
    annualPrice: 480, // $40/mo
    credits: 50,
    description: "Professional grade studio intelligence.",
    features: ["Advanced Renders", "50 Monthly Credits", "Multi-Project Support", "Technical Drafts"],
  },
  {
    name: "Ultra",
    monthlyPrice: 100,
    annualPrice: 960, // $80/mo
    credits: 100,
    description: "Maximum power for production-ready studios.",
    features: ["Bespoke Agent Tuning", "100 Monthly Credits", "Priority Support", "Unlimited Workspaces"],
  },
];

export const CREDIT_PURCHASE_OPTIONS = [
  { amount: 5, price: 5, label: "$5 Credits" },
  { amount: 10, price: 10, label: "$10 Credits" },
  { amount: 25, price: 20, label: "$25 Credits (Bonus!)" }, // Adding a small bonus for the top tier
];
