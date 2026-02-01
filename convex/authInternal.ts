import { createApi } from "@convex-dev/better-auth";
import { authTables } from "./authSchema";
import { defineSchema } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { getAuthOptions } from "./authOptions";

const schema = defineSchema(authTables);

const internalApi = createApi(schema, () => getAuthOptions());

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = internalApi;
