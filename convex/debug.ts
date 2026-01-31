import { query } from "./_generated/server";

export const debugWorkshops = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workshops").collect();
  },
});
