import { createApi } from "@convex-dev/better-auth";
import { authTables } from "./authSchema";
import { defineSchema } from "convex/server";

const schema = defineSchema(authTables);

const internalApi = createApi(schema, () => ({}) as any);

export const create = internalApi.create;
export const findOne = internalApi.findOne;
export const findMany = internalApi.findMany;
export const updateOne = internalApi.updateOne;
export const updateMany = internalApi.updateMany;
export const deleteOne = internalApi.deleteOne;
export const deleteMany = internalApi.deleteMany;
