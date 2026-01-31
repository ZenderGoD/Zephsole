"use client";

import { GenMode } from '@/lib/types';
import { Ruler, Activity, Layers, Coins, Box, Palette } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ParameterPanelProps {
  mode: GenMode;
  projectId?: Id<'projects'>;
}

export function ParameterPanel({ mode, projectId }: ParameterPanelProps) {
  const designContext = useQuery(api.studio.getDesignContext, projectId ? { projectId } : 'skip');
  const bom = useQuery(api.studio.getBOM, projectId ? { projectId } : 'skip');

  const params = {
    // ... (params logic remains the same for now)
    research: [
      { label: 'Market Sentiment', value: null, icon: Activity },
      { label: 'Trend Velocity', value: null, icon: Activity },
      { label: 'Competitor Gap', value: null, icon: Layers },
    ],
    ideation: [
      { label: 'Aesthetic Fidelity', value: null, icon: Activity },
      { label: 'Brand Alignment', value: null, icon: Activity },
      { label: 'Visual Coherence', value: null, icon: Layers },
    ],
    technical: [
      { label: 'Drafting Accuracy', value: null, icon: Ruler },
      { label: 'Layer Separation', value: null, icon: Layers },
      { label: 'Pattern Integrity', value: null, icon: Activity },
    ],
    material: [
      { label: 'Tensile Strength', value: null, icon: Activity },
      { label: 'Carbon Footprint', value: null, icon: Layers },
      { label: 'Durability Index', value: null, icon: Ruler },
    ],
  }[mode];

  return (
    <aside className="w-72 border-l border-border bg-background flex flex-col z-30 h-screen overflow-hidden">
      <div className="p-6 border-b border-border">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Analytics</h3>
      </div>

      <ScrollArea className="flex-1" data-lenis-prevent>
        <div className="p-6 space-y-8">
        {/* Design Summary Section */}
        {designContext && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <Box size={14} />
              <h4 className="text-[10px] uppercase font-bold tracking-widest">Design Blueprint</h4>
            </div>
            <div className="bg-muted border border-border rounded-xl p-4 space-y-3">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Footwear Type</span>
                <span className="text-xs font-medium text-foreground">{designContext.footwearType || 'Unassigned'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Aesthetic Vibe</span>
                <span className="text-xs font-medium text-foreground">{designContext.aestheticVibe || 'Establishing...'}</span>
              </div>
              
              {designContext.colorPalette && designContext.colorPalette.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground font-mono">Color Palette</span>
                  <div className="flex gap-1.5">
                    {designContext.colorPalette.map((c, i) => (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div 
                            className="w-4 h-4 rounded-full border border-border ring-1 ring-background shadow-inner cursor-pointer" 
                            style={{ backgroundColor: c.hex }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{c.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Coins size={14} />
            <h4 className="text-[10px] uppercase font-bold tracking-widest">Costing Matrix</h4>
          </div>
          <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
            <div className="flex justify-between items-center h-4">
              <span className="text-[10px] text-muted-foreground">Material Cost</span>
              <span className="text-xs font-mono text-foreground">
                {bom?.totalEstimatedCost ? `${bom.currency || 'USD'} ${bom.totalEstimatedCost.toFixed(2)}` : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center h-4">
              <span className="text-[10px] text-muted-foreground">BOM Items</span>
              <span className="text-xs font-mono text-foreground">{bom?.items?.length || 0}</span>
            </div>
            <div className="pt-2 border-t border-border flex justify-between items-center mt-2 h-6">
              <span className="text-[10px] text-foreground font-medium">Total MFG Cost</span>
              <span className="text-xs font-mono text-emerald-500 font-bold">
                {bom?.totalEstimatedCost ? `${bom.currency || 'USD'} ${bom.totalEstimatedCost.toFixed(2)}` : "--"}
              </span>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Activity size={14} />
            <h4 className="text-[10px] uppercase font-bold tracking-widest">Specifications</h4>
          </div>
          <div className="space-y-4">
            {params.map((param, i) => {
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-tighter h-4">
                    <span className="text-muted-foreground">{param.label}</span>
                    <span className="text-foreground font-mono">{param.value || ""}</span>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-muted-foreground rounded-full transition-all duration-1000" style={{ width: `0%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        </div>
      </ScrollArea>

      <div className="p-6 border-t border-border">
        <button className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 border border-border rounded-xl text-[10px] uppercase font-bold tracking-[0.2em] transition-all">
          Export Build Data
        </button>
      </div>
    </aside>
  );
}
