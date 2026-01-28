'use client';

import { useState, useRef, useEffect } from 'react';
import { GenMode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Maximize2, Minimize2, MousePointer2, Hand, ZoomIn, ZoomOut, Beaker } from 'lucide-react';

interface GenerationCanvasProps {
  mode: GenMode;
  isGenerating: boolean;
  items?: any[];
  onItemMove?: (id: any, x: number, y: number) => void;
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
        "w-full h-full relative overflow-hidden bg-neutral-950 touch-none",
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
          backgroundImage: `radial-gradient(circle at 2px 2px, #333 1px, transparent 0)`,
          backgroundSize: '40px 40px',
          width: '500%',
          height: '500%',
          left: '-200%',
          top: '-200%',
        }}
        className="absolute opacity-20 pointer-events-none" 
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
            "relative w-[800px] aspect-video border border-white/5 bg-neutral-900/50 rounded-2xl flex items-center justify-center transition-all duration-1000",
            isGenerating ? "scale-[1.02] border-white/20" : "scale-100 shadow-2xl shadow-black/50"
          )}>
            {/* ... existing content ... */}
            <div className="flex flex-col items-center gap-6">
              <div className="text-[10px] uppercase tracking-[0.5em] text-neutral-500 font-mono text-center">
                {mode} Intelligence Stage
              </div>
              <div className="text-2xl font-light tracking-tighter text-neutral-300 text-center">
                {isGenerating ? (
                  <span className="flex items-center gap-3">
                    Synthesizing Data Streams
                    <span className="flex gap-1">
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1 h-1 bg-white rounded-full animate-bounce"></span>
                    </span>
                  </span>
                ) : (
                  `Awaiting Input for ${mode}`
                )}
              </div>
            </div>

            {/* Technical Deco */}
            <div className="absolute top-6 left-6 font-mono text-[8px] text-neutral-600">
              COORD_X: {x.get().toFixed(0)}<br/>
              COORD_Y: {y.get().toFixed(0)}<br/>
              ZOOM: {(scale * 100).toFixed(0)}%
            </div>
            <div className="absolute top-6 right-6 font-mono text-[8px] text-neutral-600">
              FPS: 60<br/>LAT: 12ms
            </div>
            <div className="absolute bottom-6 left-6 w-32 h-px bg-white/10" />
            <div className="absolute bottom-6 right-6 w-32 h-px bg-white/10" />
          </div>

          {/* Render Additional Canvas Items */}
          {items.map((item) => (
            <motion.div
              key={item._id || item.id}
              drag
              dragMomentum={false}
              onDragEnd={(e, info) => {
                if (onItemMove) {
                  // The info.point is relative to the viewport, we need relative to the container
                  // For simplicity, we can just track the delta if we had the initial position
                  // But motion drag handled the visual movement. 
                  // Let's just pass the current x/y which motion tracks.
                  onItemMove(item._id || item.id, item.x + info.offset.x, item.y + info.offset.y);
                }
              }}
              initial={{ x: item.x, y: item.y, opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute p-6 bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-2xl w-72 shadow-2xl cursor-grab active:cursor-grabbing pointer-events-auto"
            >
              <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3 font-mono">
                {item.type.replace('-', ' ')}
              </div>
              {item.type === 'image' && item.data?.imageUrl ? (
                <div className="space-y-2">
                  <img 
                    src={item.data.imageUrl} 
                    alt={item.data?.title || 'Canvas upload'} 
                    className="w-full h-40 object-cover rounded-lg border border-white/10"
                  />
                  <div className="text-xs text-neutral-300 leading-relaxed">
                    {item.data?.title || item.data?.content || 'Image upload'}
                  </div>
                </div>
              ) : item.type === 'sole-spec' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Beaker size={14} className="text-emerald-500" />
                    <span className="text-xs font-bold text-white uppercase tracking-tight">Technical Sole Unit</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div className="space-y-0.5">
                      <div className="text-[8px] uppercase text-neutral-500">Midsole</div>
                      <div className="text-[10px] text-white font-medium truncate">{item.data?.data?.midsoleMaterial}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[8px] uppercase text-neutral-500">Outsole</div>
                      <div className="text-[10px] text-white font-medium truncate">{item.data?.data?.outsoleMaterial}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[8px] uppercase text-neutral-500">Stack/Drop</div>
                      <div className="text-[10px] text-white font-medium">{item.data?.data?.stackHeightHeel}/{item.data?.data?.stackHeightForefoot} | {item.data?.data?.drop}mm</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[8px] uppercase text-neutral-500">Plate</div>
                      <div className="text-[10px] text-white font-medium">{item.data?.data?.plateType}</div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                    <span className="text-[9px] font-bold text-emerald-400">${item.data?.data?.costEst}</span>
                    <span className="text-[9px] text-neutral-500">{item.data?.data?.weightEst}g</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-300 leading-relaxed">
                  {item.data?.content || 'No intelligence data provided.'}
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  <div className="w-1 h-1 bg-neutral-700 rounded-full" />
                  <div className="w-1 h-1 bg-neutral-700 rounded-full" />
                </div>
                <div className="text-[8px] text-neutral-600 font-mono">
                  VER: 1.0.2
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Floating Canvas Controls */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-40">
        <div className="bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-lg p-1 flex flex-col gap-1">
          <button 
            onClick={() => setScale(prev => Math.min(prev + 0.1, 3))}
            className="p-2 hover:bg-white/5 rounded-md text-neutral-400 hover:text-white transition-colors"
          >
            <ZoomIn size={16} />
          </button>
          <button 
            onClick={() => setScale(prev => Math.max(prev - 0.1, 0.2))}
            className="p-2 hover:bg-white/5 rounded-md text-neutral-400 hover:text-white transition-colors"
          >
            <ZoomOut size={16} />
          </button>
          <div className="h-px bg-white/5 mx-1" />
          <button 
            onClick={() => {
              x.set(0);
              y.set(0);
              setScale(1);
            }}
            className="p-2 hover:bg-white/5 rounded-md text-neutral-400 hover:text-white transition-colors"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        <div className="bg-neutral-900/80 backdrop-blur-md border border-white/10 rounded-lg p-1 flex flex-col gap-1">
          <button 
            onClick={() => setIsPanning(false)}
            className={cn(
              "p-2 rounded-md transition-colors",
              !isPanning ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"
            )}
          >
            <MousePointer2 size={16} />
          </button>
          <button 
            onClick={() => setIsPanning(true)}
            className={cn(
              "p-2 rounded-md transition-colors",
              isPanning ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"
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
