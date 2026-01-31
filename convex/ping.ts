import { query } from "./_generated/server";

export const ping = query(async () => {
  return "ok";
});
