'use client';

import { Sparkles, Activity, Layers, Ruler, FileText, Download, ChevronRight, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TechnicalBlueprintProps {
  data: {
    productName: string;
    imageUrl: string;
    schematics: { type: string; url: string; description: string }[];
    bom: { part: string; material: string; qty: number; cost: number }[];
    specs: {
      tolerances: string;
      stitching: string;
      finish: string;
      weight: string;
    };
  };
}

export function TechnicalBlueprint({ data }: TechnicalBlueprintProps) {
  return (
    <div className="w-[1000px] bg-neutral-900 border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto">
      {/* Header */}
      <div className="px-8 py-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
            <Activity className="text-primary" size={24} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-neutral-500 font-mono mb-1">Technical Master File</div>
            <h2 className="text-xl font-bold text-white tracking-tight">{data.productName}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end mr-4">
            <div className="text-[10px] text-neutral-500 font-mono">STATUS: CERTIFIED</div>
            <div className="text-[10px] text-neutral-500 font-mono">REV: 1.0.4A</div>
          </div>
          <button className="h-10 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] uppercase tracking-widest font-bold text-white transition-all border border-white/10 flex items-center gap-2">
            <Download size={14} />
            Export Factory ZIP
          </button>
          <button className="h-10 px-5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-[10px] uppercase tracking-widest font-bold transition-all shadow-lg flex items-center gap-2">
            <FileText size={14} />
            View Full Report
          </button>
        </div>
      </div>

      <div className="flex-1 p-8 grid grid-cols-12 gap-8 overflow-y-auto max-h-[800px] scrollbar-hide">
        {/* Left Column - Main Schematics */}
        <div className="col-span-8 space-y-8">
          <div className="grid grid-cols-2 gap-6">
            {data.schematics.map((schematic, i) => (
              <div key={i} className="group relative aspect-video bg-black/40 rounded-2xl border border-white/5 overflow-hidden hover:border-primary/50 transition-all">
                <img src={schematic.url} alt={schematic.type} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">{schematic.type}</div>
                    <div className="text-[11px] text-neutral-400 line-clamp-1">{schematic.description}</div>
                  </div>
                  <div className="text-[10px] font-mono text-neutral-600">FIG_{i+1}</div>
                </div>
                {/* Technical Overlay */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/60 backdrop-blur-md rounded-lg p-2 border border-white/10">
                    <Settings size={14} className="text-white animate-spin-slow" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Large Assembly View */}
          <div className="bg-black/40 rounded-3xl border border-white/5 p-8 relative">
            <div className="absolute top-8 left-8">
              <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 font-mono mb-2">Primary Assembly System</div>
              <div className="text-lg font-light text-white tracking-tight">Orthographic Multi-View Projection</div>
            </div>
            <div className="aspect-21/9 flex items-center justify-center">
              <img src={data.imageUrl} alt="Main assembly" className="max-h-full object-contain" />
              {/* Leader Lines Simulation */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/3 w-24 h-px bg-primary/40 rotate-30" />
                <div className="absolute top-1/2 left-1/3 -translate-x-full -translate-y-full px-2 py-1 bg-primary/20 rounded border border-primary/40 text-[8px] text-primary font-mono">P01_VAMP</div>
                
                <div className="absolute bottom-1/3 right-1/4 w-32 h-px bg-emerald-500/40 -rotate-15" />
                <div className="absolute bottom-1/3 right-1/4 translate-x-full translate-y-full px-2 py-1 bg-emerald-500/20 rounded border border-emerald-500/40 text-[8px] text-emerald-400 font-mono">P04_SOLE</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - BOM & Specs */}
        <div className="col-span-4 space-y-8">
          {/* Technical Specs */}
          <div className="bg-white/5 rounded-2xl border border-white/5 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Ruler size={16} className="text-primary" />
              <span className="text-[10px] uppercase tracking-widest font-bold text-white">Manufacturing Specs</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(data.specs).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <div className="text-[8px] uppercase text-neutral-500 font-mono">{key}</div>
                  <div className="text-xs text-white font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bill of Materials */}
          <div className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-emerald-500" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-white">Bill of Materials</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">4 ITEMS</span>
            </div>
            <div className="p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-6 py-3 text-[8px] uppercase text-neutral-500 font-mono">Part</th>
                    <th className="px-6 py-3 text-[8px] uppercase text-neutral-500 font-mono">Qty</th>
                    <th className="px-6 py-3 text-[8px] uppercase text-neutral-500 font-mono">Cost</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {data.bom.map((item, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-3">
                        <div className="text-white font-medium">{item.part}</div>
                        <div className="text-[9px] text-neutral-500">{item.material}</div>
                      </td>
                      <td className="px-6 py-3 text-neutral-400 font-mono">{item.qty}</td>
                      <td className="px-6 py-3 text-emerald-400 font-bold font-mono">${item.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-mono">Est. Total Cost</span>
              <span className="text-lg font-bold text-white font-mono">${data.bom.reduce((acc, item) => acc + (item.qty * item.cost), 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Quality Control Checklist */}
          <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <Settings size={16} className="text-primary" />
              <span className="text-[10px] uppercase tracking-widest font-bold text-white">Engine Analysis</span>
            </div>
            <div className="space-y-3">
              {[
                'Surface finish meets industrial standards',
                'Material grades validated for manufacturing',
                'Dimensional tolerances within acceptable range',
                'Pattern geometry optimized for high-volume production'
              ].map((text, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-4 h-4 rounded bg-primary/20 shrink-0 flex items-center justify-center text-[10px] text-primary">✓</div>
                  <div className="text-[10px] text-neutral-300 leading-tight">{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer / System Status */}
      <div className="px-8 py-4 bg-black/40 border-t border-white/5 flex items-center justify-between text-[8px] font-mono text-neutral-600">
        <div className="flex gap-6">
          <span>SYSTEM: ZEPH_BLUEPRINT_CORE_V2</span>
          <span>LATENCY: 4200MS</span>
          <span>ENGINE: GEMINI_3_FLASH</span>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
          <span>ALL SYSTEMS NOMINAL</span>
        </div>
      </div>
    </div>
  );
}
