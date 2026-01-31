import { defineApp, type ComponentDefinition } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import agent from "@convex-dev/agent/convex.config";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config";
import neutralCost from "neutral-cost/convex.config";
import durableAgents from "convex-durable-agents/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import crons from "@convex-dev/crons/convex.config";
import local from "./local/convex.config";

// The Convex CLI expects each component definition object to carry a
// componentDefinitionPath matching the relative path Convex discovers during
// bundling (relative to the root component directory). pnpm-installed packages
// don't ship this metadata, so we add it here.
const componentPaths = {
  betterAuth:
    "../node_modules/.pnpm/@convex-dev+better-auth@0.10.10_@better-auth+core@1.4.17_@better-auth+utils@0.3.0_@bett_6b77727a02581ec28dc91b30f8b4c2dd/node_modules/@convex-dev/better-auth/dist/component",
  agent:
    "../node_modules/.pnpm/@convex-dev+agent@0.3.2_@ai-sdk+provider-utils@4.0.10_zod@3.25.76__ai@6.0.50_zod@3.25.7_17697adaa774d9d169625ccdfc46198e/node_modules/@convex-dev/agent/dist/component",
  pts: "../node_modules/.pnpm/@convex-dev+persistent-text-streaming@0.3.0_convex@1.31.7_react@19.2.0__react-dom@19.2.0_react@19.2.0__react@19.2.0/node_modules/@convex-dev/persistent-text-streaming/dist/component",
  neutralCost:
    "../node_modules/.pnpm/neutral-cost@0.2.2_convex@1.31.7_react@19.2.0__react@19.2.0/node_modules/neutral-cost/dist/component",
  durableAgents:
    "../node_modules/.pnpm/convex-durable-agents@0.1.7_ai@6.0.50_zod@3.25.76__convex@1.31.7_react@19.2.0__react@19.2.0_zod@3.25.76/node_modules/convex-durable-agents/dist/component",
  workpool:
    "../node_modules/.pnpm/@convex-dev+workpool@0.3.1_convex-helpers@0.1.111_@standard-schema+spec@1.1.0_convex@1._760a5a28600feace50c5576967425a90/node_modules/@convex-dev/workpool/dist/component",
  workflow:
    "../node_modules/.pnpm/@convex-dev+workflow@0.3.4_@convex-dev+workpool@0.3.1_convex-helpers@0.1.111_@standard-_8e47f138a981606867b506815eaf3abb/node_modules/@convex-dev/workflow/dist/component",
  actionRetrier:
    "../node_modules/.pnpm/@convex-dev+action-retrier@0.3.0_convex@1.31.7_react@19.2.0_/node_modules/@convex-dev/action-retrier/dist/component",
  crons:
    "../node_modules/.pnpm/@convex-dev+crons@0.2.0_convex@1.31.7_react@19.2.0_/node_modules/@convex-dev/crons/dist/component",
  // Local component lives under convex/local/convex.config.ts
  // Use explicit path without leading "./" to satisfy Convex deploy validation
  local: "local/convex.config.ts",
} as const;

type ComponentWithPath = ComponentDefinition<Record<string, never>> & {
  componentDefinitionPath?: string;
};

const withPath = <T extends ComponentWithPath>(component: T, path: string): T => {
  if (typeof component.componentDefinitionPath !== "string") {
    component.componentDefinitionPath = path;
  }
  return component;
};

const app = defineApp();
app.use(withPath(betterAuth, componentPaths.betterAuth));
app.use(withPath(agent, componentPaths.agent));
app.use(withPath(persistentTextStreaming, componentPaths.pts));
app.use(withPath(neutralCost, componentPaths.neutralCost));
app.use(withPath(durableAgents, componentPaths.durableAgents));
app.use(withPath(workpool, componentPaths.workpool), { name: "workpool" });
app.use(withPath(workflow, componentPaths.workflow));
app.use(withPath(actionRetrier, componentPaths.actionRetrier));
app.use(withPath(crons, componentPaths.crons));
app.use(withPath(local, componentPaths.local));

export default app;
