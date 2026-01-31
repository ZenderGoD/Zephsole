import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const backfillExistingWorkshopsWithGrants = mutation({
  args: {},
  handler: async (ctx) => {
    const workshops = await ctx.db.query("workshops").collect();
    let count = 0;
    
    for (const workshop of workshops) {
      const existingCredits = workshop.credits || 0;
      
      // Check if they already have grants
      const grants = await ctx.db
        .query("creditGrants")
        .withIndex("by_workshop_expires", (q) => q.eq("workshopId", workshop._id))
        .collect();
      
      const totalGrantAmount = grants.reduce((sum, g) => sum + g.remaining, 0);
      
      // If workshop has no credits and no grants, or less than 5 and no grants
      if (totalGrantAmount === 0) {
        const amountToGrant = Math.max(existingCredits, 5); // Minimum 5 credits
        await ctx.db.insert("creditGrants", {
          workshopId: workshop._id,
          amount: amountToGrant,
          remaining: amountToGrant,
          startsAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
          source: "signup",
        });
        
        await ctx.db.patch(workshop._id, { credits: amountToGrant });
        count++;
      } else if (existingCredits > totalGrantAmount) {
        const diff = existingCredits - totalGrantAmount;
        await ctx.db.insert("creditGrants", {
          workshopId: workshop._id,
          amount: diff,
          remaining: diff,
          startsAt: Date.now(),
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, 
          source: "backfill",
        });
        count++;
      }
    }
    
    return { backfilled: count };
  },
});
