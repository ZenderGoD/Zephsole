# Zephsole Product Flow Documentation

## Overview
Zephsole has transitioned from a unified canvas/chat system to a **product-centric, page-based workflow**. This document outlines the new application flow and design philosophy.

## The Core Flow

### 1. Generation Phase (`/genshoes`)
*   **Entry Point**: Users land here after login.
*   **Action**: A conversational AI interface focused on creative footwear design.
*   **Workflow**:
    *   Upload reference images or describe design ideas.
    *   Generate multiple AI-powered footwear concepts.
    *   **"Set as Product"**: Users select their preferred designs to move them into the official inventory.

### 2. Inventory Management (`/products`)
*   **Purpose**: A centralized hub for all finalized designs.
*   **Features**:
    *   **Stored Products**: Only designs explicitly "Set as Product" or direct uploads appear here.
    *   **Direct Upload**: Users can upload existing designs.
    *   **Product Agent**: Upon upload, an AI agent analyzes the image to automatically generate a creative **Name** and **Detailed Description**.
    *   **Management**: Edit product names and descriptions or delete outdated designs.

### 3. Focused Intelligence Pages
Once a product is saved, it can be explored through specialized lenses:
*   **Research (`/research`)**: Analyze market trends and design context for a specific product.
*   **Schematics (`/schematics`)**: View technical blueprints, BOM (Bill of Materials), and manufacturing specs.
*   **Marketing (`/marketing`)**: Access high-fidelity renders and visual marketing assets.

## Technical Architecture

### Database Schema (Convex)
*   **Projects Table**: Extended to support `imageUrl`, `description`, and a status toggle (`draft` vs `complete`).
*   **Status "complete"**: Used to distinguish permanent Products from temporary generation sessions.

### AI Agents
*   **Creative Agent**: Powers the `/genshoes` design chat.
*   **Product Agent (`convex/productAgent.ts`)**: Uses Gemini 2.0 Flash to extract visual intelligence from images and populate product metadata.

## Future Roadmap
*   Enable cross-page state so selecting a product in `/products` automatically populates the context for `/research`, `/schematics`, and `/marketing`.
*   Implement "Export to Factory" directly from the Schematics page.
