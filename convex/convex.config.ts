import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import agent from "@convex-dev/agent/convex.config";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config";
import neutralCost from "neutral-cost/convex.config";
import durableAgents from "convex-durable-agents/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import crons from "@convex-dev/crons/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(agent);
app.use(persistentTextStreaming);
app.use(neutralCost);
app.use(durableAgents);
app.use(workpool, { name: "workpool" });
app.use(workflow);
app.use(actionRetrier);
app.use(crons);

export default app;
