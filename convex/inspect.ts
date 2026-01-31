import { mutation } from "./_generated/server";

export const inspectWorkshops = mutation({
  args: {},
  handler: async (ctx) => {
    const workshops = await ctx.db.query("workshops").collect();
    const workshopData = workshops.map(w => ({
      name: w.name,
      credits: w.credits,
      id: w._id
    }));
    
    console.log("Workshops:", workshopData);
    return workshopData;
  },
});
