import { defineComponent } from "convex/server";
import * as imageWorkflow from "./imageWorkflow";
import * as imageGeneration from "./imageGeneration";

// Component bundling local image generation functions so they are exposed in generated API.
const localComponent = defineComponent("local");
(localComponent as any).export("imageWorkflow", imageWorkflow);
(localComponent as any).export("imageGeneration", imageGeneration);

export const local = localComponent;
