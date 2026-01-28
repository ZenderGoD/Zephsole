# Technical Blueprint System: Deep Dive

The **Technical Blueprint System** in IMAI is an AI-powered manufacturing documentation engine. It transforms a single product image into a comprehensive, factory-ready "Technical Master File" containing 10+ schematic drawings, a detailed Bill of Materials (BOM), and exhaustive manufacturing specifications.

---

## 1. System Overview

The system is designed to automate the creation of industrial design documentation. It provides:
- **10 Standard Schematic Views**: Professional CAD-style drawings with a consistent numbering system.
- **Detailed Technical Specs**: AI-extracted materials, tolerances, and finishes.
- **Bill of Materials (BOM)**: Comprehensive list of parts and manufacturing processes.
- **Advanced Manufacturing Dossier**: An 8-15 tab report with detailed text blocks and technical infographics.
- **Factory-Ready Exports**: PDF (Technical Master File) and ZIP bundles.

---

## 2. Architecture & Workflows

The system follows a multi-stage pipeline orchestrated by **Convex Workflows**.

### A. The Entry Point: `generateSchematicsTabs`
Located in `convex/products/ai/workflows/generate_schematics_tabs.ts`. This workflow manages the entire lifecycle:
1.  **Measurements Phase**: Ensures product dimensions are set (Metric/Imperial).
2.  **Technical Data Phase**: Triggers the `Schematic Agent` to generate structured JSON.
3.  **Infographics Phase (Advanced)**: Generates a multi-tab narrative plan and placeholder assets.
4.  **Images Phase**: Triggers 10 parallel image generation jobs.
5.  **Billing & Notifications**: Finalizes the run and emails the user.

### B. Image Generation: `generateSchematics`
The core image generation logic resides in `convex/products/ai/workflows/generate_schematics.ts`.
- **Parallelism**: It triggers 10 individual `generateSingleSchematic` actions concurrently to minimize latency.
- **Consistency**: It passes a shared "Numbering System" to every image prompt.

---

## 3. AI Agents & Prompt Engineering

The system uses a **Draft-Augment-Merge** pattern to achieve high precision.

### Technical Data Agent (`schematic_agent.ts`)
1.  **Drafting**: Gemini 3 Flash analyzes the image to create a baseline tech spec and BOM.
2.  **Augmentation**: A second pass with the same model acts as a "Quality Auditor," identifying missing details like material grades or QC checkpoints.
3.  **Merging**: A deterministic merge function combines the results, preferring the most detailed descriptions while maintaining consistency.

### Consistent Numbering System
To ensure that "Part 1" in the Front View is the same "Part 1" in the Exploded View, the agent generates a shared reference:
```typescript
export const numberingSystemSchema = z.object({
  partNumbers: z.array(z.object({
    number: z.string(), // e.g., "1", "2", "P1"
    description: z.string()
  })),
  detailCallouts: z.array(z.object({
    label: z.string(), // e.g., "Detail A"
    description: z.string()
  })),
  instructions: z.string()
});
```

### Prompt Strategy
Every image prompt is hyper-detailed (200+ words) and includes:
- **Style**: "Hyper-detailed professional factory blueprints or CAD engineering drawings."
- **Background**: "Pure white background (#FFFFFF). NO colored backgrounds, NO blueprint-blue backgrounds."
- **Annotations**: "Include visible text, numbers, dimensions, leader lines, and measurement lines."

---

## 4. Technical Specifications & Schemas

The system uses strict Zod schemas to ensure data integrity for manufacturing.

### Technical Specification Schema
- **Dimensional Tolerances**: Specific ranges (e.g., ±0.1mm).
- **Material Grades**: Industry standards (e.g., "6061-T6 Aluminum per ASTM B221").
- **Surface Finish**: Precise Ra values (e.g., "Ra 0.8μm").
- **Compliance**: Standards like CE, FCC, RoHS, REACH.

### Bill of Materials (BOM) Item
- Part Name/Number.
- Material/Grade/Finish.
- Quantity & Unit of Measure.
- Manufacturing Process (e.g., "Injection Molding, 200°C melt, 30s cycle").
- Tooling Requirements (e.g., "2-plate mold, side-action sliders").

---

## 5. UI & User Experience

The UI (`src/components/product-page/schematics-view.tsx`) is designed for technical users.

### Phase Stepper
Tracks the multi-minute generation process across 5 phases:
- **Phase 1: Measurements**: User-assisted intake via a chat wizard.
- **Phase 2: Detailed Data**: Extraction of specs and BOM.
- **Phase 3: Infographics (Advanced)**: Generation of the multi-tab dossier.
- **Phase 4: Schematic Images**: Generation of the 10 drawings.
- **Phase 5: Email Sent**: Final notification.

### Dossier View
A tabbed interface where each manufacturing aspect (Tooling, QC, DFM) is presented as a professional report with:
- Structured Markdown text (8-15 blocks per tab).
- Inline technical infographics (tables, charts, diagrams).

---

## 6. Data Persistence & Exports

### Storage (R2 Migration)
To handle large technical datasets and high-resolution images:
- **Large JSON**: Technical specs and BOMs exceeding 100KB are automatically stored in **Cloudflare R2** via `@convex-dev/r2`.
- **Media**: All blueprints and infographics are stored in R2 with UUID-based keys.

### PDF Generation: Technical Master File (TMF)
Located in `src/lib/technical-master.ts`, using **jsPDF**:
- **Engineering Data**: Artistic repeats combined with precise measurements.
- **Technical Callouts**: V-STEP/H-STEP labels for textiles.
- **Certification Seals**: "Ink Stamp" style seals for "Original", "Certified", and "Approved".
- **Density Strip**: A CMYK density control strip for factory calibration.

### ZIP Export
Bundles everything for the factory:
- 10 Schematic Images (PNG).
- Technical Specs (Markdown).
- BOM (CSV and JSON).
- Manufacturing Report (PDF).

---

## 7. Internal Infrastructure

### Reliability & Retries
- **Cron Jobs**: A periodic task (`retryStaleSchematicGenerations`) monitors for stale runs (> 6 mins) and automatically triggers retries.
- **Deterministic Billing**: Credits are redeemed at the end of the workflow, calculating total costs for images and advanced processing.

### Notifications
- **Email Service**: `sendTechnicalBlueprintCompleteEmail` notifies users with a summary of generated assets and a direct link to the technical dossier.

---

## 9. Prompts Repository

### Technical Data Extraction (System Prompt)
```text
You are a world-class industrial designer, manufacturing engineer, and quality control specialist...
Your task is to analyze a product image with EXTREME PRECISION and generate:
1. COMPREHENSIVE, FACTORY-READY technical specifications...
2. DETAILED Bill of Materials (BOM)...
3. EXHAUSTIVE manufacturing notes...
4. A CONSISTENT NUMBERING SYSTEM...
5. HYPER-DETAILED image generation prompts...

CRITICAL REQUIREMENTS:
- EVERY schematic image MUST have a pure white background (#FFFFFF).
- EVERY prompt must explicitly instruct the model to include NUMBERS, DIMENSIONS, LEADER LINES, and TEXT LABELS directly on the drawing.
```

### Standard Schematic Image Prompts
| ID | Base AI Prompt |
| :--- | :--- |
| **orthographic** | Create an orthographic product view showing front, back, and side views... Flat, technical drawing style with no shadows... |
| **dimensioned** | Create a dimensioned layout with key measurements only. Include only critical dimensions in mm... Include dimension lines, extension lines, and clear annotations. |
| **exploded** | Create an exploded or layered view ONLY if the product has multiple parts... Show components separated with clear spatial relationships. |
| **legend** | Create a comprehensive legend and reference guide that explains all symbols, abbreviations, part numbers... Format as a clean, organized reference table. |

---

## 10. Key Code Snippets

### Technical Data Generation (Draft-Augment-Merge)
```typescript
export async function generateSchematicTechnicalDataAdvanced(ctx, args) {
  // 1) Draft with Gemini 3 Flash
  const draft = await generateObject({ ... });

  // 2) Augment with Gemini 3 Flash (Audit mode)
  const augmentation = await generateObject({ ... });

  // 3) Deterministic merge
  return {
    technicalSpec: mergeTechnicalSpec(draft.object.technicalSpec, augmentation.object.technicalSpec),
    bom: mergeBom(draft.object.bom, augmentation.object.bom),
    manufacturingNotes: mergeManufacturingNotes(draft.object.manufacturingNotes, augmentation.object.manufacturingNotes),
    numberingSystem: draft.object.numberingSystem,
    imagePrompts: draft.object.imagePrompts,
  };
}
```

### Parallel Workflow Execution
```typescript
const schematicPromises = SCHEMATIC_TYPES.map(async (schematicType, index) => {
  return await step.runAction(
    internal.products.ai.actions.generate_single_schematic.generateSingleSchematic,
    {
      versionId: args.versionId,
      schematicType,
      aiPrompt: aiPrompts[schematicType.id],
      // ...
    }
  );
});
await Promise.allSettled(schematicPromises);
```

### PDF Export Logic (jsPDF)
```typescript
export async function generateTechnicalMasterFile(data: TMFData): Promise<Blob> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  // Draw industrial dimension arrows
  drawDimensionArrow(pdf, x, y, length, 'horizontal', label, arrowPink);
  // Add Certification Seals
  drawCertificationSeal(pdf, blockX + 10, sealY, 'CERTIFIED', '#0070FF');
  return pdf.output('blob');
}
```

