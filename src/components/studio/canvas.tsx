'use client';

import { useState, useRef } from 'react';
import { GenMode, CanvasItem, Id } from '@/lib/types';
import { cn } from '@/lib/utils';
import { motion, useMotionValue } from 'framer-motion';
import { Maximize2, MousePointer2, Hand, ZoomIn, ZoomOut, Beaker, MessageSquare, ArrowRight } from 'lucide-react';
import { TechnicalBlueprint } from './technical-blueprint';

interface GenerationCanvasProps {
  mode: GenMode;
  isGenerating: boolean;
  items?: CanvasItem[];
  onItemMove?: (id: Id<"canvasItems"> | string, x: number, y: number) => void;
}

export function GenerationCanvas({ mode, isGenerating, items = [], onItemMove }: GenerationCanvasProps) {
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(prev => Math.min(Math.max(prev + delta, 0.2), 3));
    }
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "w-full h-full relative overflow-hidden bg-background touch-none",
        isPanning ? "cursor-grabbing" : "cursor-crosshair"
      )}
      onWheel={handleWheel}
      onKeyDown={(e) => {
        if (e.key === ' ') setIsPanning(true);
      }}
      onKeyUp={(e) => {
        if (e.key === ' ') setIsPanning(false);
      }}
    >
      {/* Background Grid */}
      <motion.div 
        style={{ 
          x, y,
          scale,
          backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
          backgroundSize: '40px 40px',
          width: '500%',
          height: '500%',
          left: '-200%',
          top: '-200%',
        }}
        className="absolute opacity-5 text-muted-foreground pointer-events-none" 
      />

      {/* Canvas Content */}
      <motion.div
        drag={isPanning}
        dragConstraints={containerRef}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, y, scale }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="relative pointer-events-auto">
          {/* Main Visual Placeholder */}
          <div className={cn(
            "relative w-[800px] aspect-video border border-border bg-muted/30 rounded-2xl flex items-center justify-center transition-all duration-1000",
            isGenerating ? "scale-[1.02] border-primary/20" : "scale-100 shadow-2xl"
          )}>
            <div className="flex flex-col items-center gap-6">
              <div className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground font-mono text-center">
                {mode} Intelligence Stage
              </div>
              <div className="text-2xl font-light tracking-tighter text-foreground text-center">
                {isGenerating ? (
                  <span className="flex items-center gap-3">
                    Synthesizing Data Streams
                    <span className="flex gap-1">
                      <span className="w-1 h-1 bg-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1 h-1 bg-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1 h-1 bg-foreground rounded-full animate-bounce"></span>
                    </span>
                  </span>
                ) : (
                  `Awaiting Input for ${mode}`
                )}
              </div>
            </div>

            {/* Technical Deco */}
            <div className="absolute top-6 left-6 font-mono text-[8px] text-muted-foreground/50">
              COORD_X: {x.get().toFixed(0)}<br/>
              COORD_Y: {y.get().toFixed(0)}<br/>
              ZOOM: {(scale * 100).toFixed(0)}%
            </div>
            <div className="absolute top-6 right-6 font-mono text-[8px] text-muted-foreground/50">
              FPS: 60<br/>LAT: 12ms
            </div>
            <div className="absolute bottom-6 left-6 w-32 h-px bg-border" />
            <div className="absolute bottom-6 right-6 w-32 h-px bg-border" />
          </div>

          {/* Render Additional Canvas Items */}
          {items.map((item) => (
            <motion.div
              key={item._id || item.id}
              drag
              dragMomentum={false}
              onDragEnd={(e, info) => {
                const itemId = item._id || item.id;
                if (onItemMove && itemId) {
                  onItemMove(itemId, item.x + info.offset.x, item.y + info.offset.y);
                }
              }}
              initial={{ x: item.x, y: item.y, opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "absolute cursor-grab active:cursor-grabbing pointer-events-auto",
                item.type === 'technical-blueprint' ? "" : "p-6 bg-card/90 backdrop-blur-xl border border-border rounded-2xl w-72 shadow-2xl"
              )}
            >
              {item.type === 'technical-blueprint' ? (
                <TechnicalBlueprint data={item.data as any} />
              ) : (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-mono flex items-center justify-between">
                    <span>{item.type.replace('-', ' ')}</span>
                    {((item.data as any)?.source === 'research' || ((item.data as any)?.data as any)?.source === 'research') && (
                      <span className="bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded text-[8px] border border-emerald-500/20">
                        RESEARCH
                      </span>
                    )}
                  </div>
                  {item.type === 'image' && (item.data as any)?.imageUrl ? (
                    <div className="space-y-2">
                      <img 
                        src={(item.data as any).imageUrl} 
                        alt={(item.data as any)?.title || 'Canvas upload'} 
                        className="w-full h-40 object-cover rounded-lg border border-border"
                      />
                      <div className="text-xs text-foreground leading-relaxed">
                        {(item.data as any)?.title || (item.data as any)?.content || 'Image upload'}
                      </div>
                    </div>
                  ) : item.type === 'sole-spec' ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Beaker size={14} className="text-emerald-500" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-tight">Technical Sole Unit</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="space-y-0.5">
                          <div className="text-[8px] uppercase text-neutral-500 font-mono">Midsole</div>
                          <div className="text-[10px] text-foreground font-medium truncate">{(item.data as any)?.data?.midsoleMaterial}</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[8px] uppercase text-neutral-500 font-mono">Outsole</div>
                          <div className="text-[10px] text-foreground font-medium truncate">{(item.data as any)?.data?.outsoleMaterial}</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[8px] uppercase text-neutral-500 font-mono">Stack/Drop</div>
                          <div className="text-[10px] text-foreground font-medium">{(item.data as any)?.data?.stackHeightHeel}/{(item.data as any)?.data?.stackHeightForefoot} | {(item.data as any)?.data?.drop}mm</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[8px] uppercase text-neutral-500 font-mono">Plate</div>
                          <div className="text-[10px] text-foreground font-medium">{(item.data as any)?.data?.plateType}</div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-border flex justify-between items-center">
                        <span className="text-[9px] font-bold text-emerald-500">${(item.data as any)?.data?.costEst}</span>
                        <span className="text-[9px] text-muted-foreground">{(item.data as any)?.data?.weightEst}g</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-foreground leading-relaxed">
                      {(item.data as any)?.content || 'No intelligence data provided.'}
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex gap-1">
                      {((item.data as any)?.source === 'research' || ((item.data as any)?.data as any)?.source === 'research') ? (
                        <button 
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('switch-workspace-mode', { detail: 'research' }));
                          }}
                          className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors group"
                        >
                          <MessageSquare size={10} />
                          View in Research
                          <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ) : (
                        <>
                          <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                          <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                          <div className="w-1 h-1 bg-muted-foreground rounded-full" />
                        </>
                      )}
                    </div>
                    <div className="text-[8px] text-muted-foreground/50 font-mono">
                      VER: 1.0.2
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Floating Canvas Controls */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-40">
        <div className="bg-background/80 backdrop-blur-md border border-border rounded-lg p-1 flex flex-col gap-1">
          <button 
            onClick={() => setScale(prev => Math.min(prev + 0.1, 3))}
            className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <ZoomIn size={16} />
          </button>
          <button 
            onClick={() => setScale(prev => Math.max(prev - 0.1, 0.2))}
            className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <div className="h-px bg-border mx-1" />
          <button 
            onClick={() => {
              x.set(0);
              y.set(0);
              setScale(1);
            }}
            className="p-2 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        <div className="bg-background/80 backdrop-blur-md border border-border rounded-lg p-1 flex flex-col gap-1">
          <button 
            onClick={() => setIsPanning(false)}
            className={cn(
              "p-2 rounded-md transition-colors",
              !isPanning ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MousePointer2 size={16} />
          </button>
          <button 
            onClick={() => setIsPanning(true)}
            className={cn(
              "p-2 rounded-md transition-colors",
              isPanning ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Hand size={16} />
          </button>
        </div>
      </div>

      {/* Mode-specific Deco */}
      <div className="absolute inset-0 pointer-events-none border-40 border-transparent transition-all duration-500" 
           style={{ borderColor: isGenerating ? 'rgba(255,255,255,0.02)' : 'transparent' }} />
    </div>
  );
}
