# Zephsole: AI-Powered Footwear Intelligence & Design

## Overview
Zephsole is an advanced AI intelligence and design platform for the footwear industry. It leverages deep research, semantic analysis, and high-fidelity visual generation to accelerate the design-to-production pipeline.

### Objectives
- **Deep Research & Web Search**: Real-time market trend analysis and material intelligence using AI agents.
- **Visual Ideation**: Generating high-fidelity footwear concepts and aesthetics.
- **Automated Schematics**: 2D technical drawings and pattern engineering from research data.
- **Costing & Analytics**: Data-driven material costing and manufacturing estimations.
- **Semantic Intelligence**: Understanding footwear construction through deep semantic search.

---

## 7-Day Completion Roadmap

### Day 1: Brand Identity & Landing Page Refinement (Current)
- [x] Establish core messaging and value proposition.
- [x] Refine the two landing page modes (Gallery & Signal) with Zephsole content.
- [x] Ensure "one-swipe" comprehension of the platform's power.

### Day 2: Core Intelligence Interface (The Studio) [COMPLETED]
- [x] Build the "Studio" layout for Research, Visuals, and Technicals.
- [x] Implement the AI prompt interface for multi-modal intelligence.

### Day 3: Backend & Storage Integration (Convex + R2) [IN PROGRESS]
- [ ] Initialize Convex backend and define schemas for Intelligence Reports and Designs.
- [ ] Configure R2 Storage for design concepts and high-res visuals.
    - [x] Implement user authentication (Better Auth + Convex).
- [ ] Create Intelligence Stage for displaying research and visuals.

### Day 4: Intelligence Agent Implementation
- Integrate `@convex-dev/agent` with OpenRouter.
- Implement Web Search capabilities for deep market research.
- Build "Deep Research" mode in the Studio.

### Day 5: Visual Ideation & Material Science
- High-fidelity image generation for footwear concepts.
- Material database integration with semantic search.

### Day 6: Costing & Technical Drafting
- Dashboard for per-material costing.
- 2D technical drawing generation based on design concepts.

### Day 7: Final Polish & Deployment Prep
- Cross-browser testing and mobile optimization.
- Final copy review and performance tuning.

---

## Technical Stack
- **Frontend**: Next.js 16, Shadcn UI, Tailwind CSS v4, Framer Motion, GSAP.
- **Intelligence**: AI SDK, OpenRouter (Claude 3.5 Sonnet / GPT-4o).
- **Backend**: Convex (Agent Component, Workflow, Workpool).
- **Storage**: Cloudflare R2.
- **Auth**: Better Auth (with Google provider).

## Engineering Rules
- **UI Components**: Always use Shadcn UI.
- **Theming**: Strict adherence to Shadcn colors and CSS variables.
- **Backend**: All real-time data and state managed via Convex.
- **Storage**: R2 for all heavy assets (DXF, STL, large previews).

---

## Next Steps (Right Now)
1. **Content Overhaul**: Update `GalleryLanding` and `SignalLanding` with footwear-specific copy and imagery.
2. **Visual Narrative**: Ensure the "Gallery" showcases the *beauty* of the design, while "Signal" showcases the *technical precision* of the engineering.
3. **Studio Foundation**: Start planning the `/studio` route for the actual generation tools.
