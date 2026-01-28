'use client';

import { CREDIT_COSTS } from "@/lib/constants";
import { Progress } from "@/components/ui/progress";
import { Zap, Search, Image as ImageIcon, Ruler } from 'lucide-react';
import { useWorkshop } from "@/hooks/use-workshop";

export default function UsagePage() {
  const { activeWorkshop } = useWorkshop();
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-light tracking-tighter">Usage & Credits</h1>
        <p className="text-sm text-neutral-500 mt-1">Monitor your studio's consumption and intelligence credits.</p>
      </div>

      <div className="p-8 bg-neutral-900 border border-white/10 rounded-3xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 text-neutral-500 text-[10px] uppercase tracking-widest font-bold mb-2">
              <Zap size={12} className="text-orange-500 fill-orange-500" />
              Available Credits
            </div>
            <div className="text-5xl font-light tracking-tighter">
              {activeWorkshop?.credits !== undefined ? activeWorkshop.credits.toLocaleString() : "..."}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Current Workshop</p>
            <div className="text-sm font-medium">{activeWorkshop?.name || "Loading..."}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-bold px-2">Credit Costing Matrix</h2>
        <div className="grid gap-2">
          {[
            { icon: Search, label: 'Research Query', cost: CREDIT_COSTS.RESEARCH_QUERY },
            { icon: ImageIcon, label: 'Nano Banana (Basic)', cost: CREDIT_COSTS.IMAGE_GENERATION_BASIC },
            { icon: ImageIcon, label: 'Nano Banana Pro (Fidelity)', cost: CREDIT_COSTS.IMAGE_GENERATION_PRO },
            { icon: Ruler, label: 'Technical Draft Gen', cost: CREDIT_COSTS.TECHNICAL_DRAFT_GEN },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-neutral-900/30 border border-white/5 rounded-xl">
              <div className="flex items-center gap-3">
                <item.icon size={14} className="text-neutral-500" />
                <span className="text-sm">{item.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold font-mono">{item.cost}</span>
                <span className="text-[8px] uppercase text-neutral-600 font-bold tracking-widest">Credits</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
