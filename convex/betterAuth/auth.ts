import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "../_generated/dataModel";
import { createAuth } from "../auth/index";

export const auth = createAuth({} as GenericCtx<DataModel>);
