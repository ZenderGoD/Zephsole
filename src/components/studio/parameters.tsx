"use client";

import { GenMode } from '@/lib/types';
import { Ruler, Activity, Layers, Coins, Box, Palette } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';

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
    <aside className="w-72 border-l border-white/5 bg-black flex flex-col z-30 h-screen overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Analytics</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8" data-lenis-prevent>
        {/* Design Summary Section */}
        {designContext && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2 text-neutral-400">
              <Box size={14} />
              <h4 className="text-[10px] uppercase font-bold tracking-widest">Design Blueprint</h4>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-3">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Footwear Type</span>
                <span className="text-xs font-medium text-white">{designContext.footwearType || 'Unassigned'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Aesthetic Vibe</span>
                <span className="text-xs font-medium text-white">{designContext.aestheticVibe || 'Establishing...'}</span>
              </div>
              
              {designContext.colorPalette && designContext.colorPalette.length > 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-[8px] uppercase tracking-widest text-neutral-500 font-mono">Color Palette</span>
                  <div className="flex gap-1.5">
                    {designContext.colorPalette.map((c, i) => (
                      <div 
                        key={i} 
                        className="w-4 h-4 rounded-full border border-white/10 ring-1 ring-black shadow-inner" 
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-2 mb-4 text-neutral-400">
            <Coins size={14} />
            <h4 className="text-[10px] uppercase font-bold tracking-widest">Costing Matrix</h4>
          </div>
          <div className="space-y-3 bg-neutral-900/30 p-4 rounded-xl border border-white/5">
            <div className="flex justify-between items-center h-4">
              <span className="text-[10px] text-neutral-500">Material Cost</span>
              <span className="text-xs font-mono text-neutral-300">
                {bom?.totalEstimatedCost ? `${bom.currency || 'USD'} ${bom.totalEstimatedCost.toFixed(2)}` : "--"}
              </span>
            </div>
            <div className="flex justify-between items-center h-4">
              <span className="text-[10px] text-neutral-500">BOM Items</span>
              <span className="text-xs font-mono text-neutral-300">{bom?.items?.length || 0}</span>
            </div>
            <div className="pt-2 border-t border-white/5 flex justify-between items-center mt-2 h-6">
              <span className="text-[10px] text-white font-medium">Total MFG Cost</span>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                {bom?.totalEstimatedCost ? `${bom.currency || 'USD'} ${bom.totalEstimatedCost.toFixed(2)}` : "--"}
              </span>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4 text-neutral-400">
            <Activity size={14} />
            <h4 className="text-[10px] uppercase font-bold tracking-widest">Specifications</h4>
          </div>
          <div className="space-y-4">
            {params.map((param, i) => {
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-tighter h-4">
                    <span className="text-neutral-500">{param.label}</span>
                    <span className="text-neutral-300 font-mono">{param.value || ""}</span>
                  </div>
                  <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-neutral-600 rounded-full transition-all duration-1000" style={{ width: `0%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="p-6 border-t border-white/5">
        <button className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] uppercase font-bold tracking-[0.2em] transition-all text-neutral-500 hover:text-white">
          Export Build Data
        </button>
      </div>
    </aside>
  );
}
