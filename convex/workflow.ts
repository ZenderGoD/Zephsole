import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

// WorkflowManager needs to be initialized with the workflow component
// This creates a manager that can start workflows defined with workflow.define()
export const workflow = new WorkflowManager(components.workflow);
