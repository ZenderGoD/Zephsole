'use client';

import { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface FullscreenImageViewerProps {
  images: Array<{ url: string; alt?: string }>;
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

export function FullscreenImageViewer({ images, initialIndex = 0, open, onClose }: FullscreenImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else if (e.key === '+' || e.key === '=') {
        setScale(prev => Math.min(prev + 0.25, 5));
      } else if (e.key === '-') {
        setScale(prev => Math.max(prev - 0.25, 0.5));
      } else if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, images.length, onClose]);

  const zoomAt = (deltaScale: number, clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Calculate offset from container center (where image is centered)
    const offsetX = clientX - rect.left - rect.width / 2 - position.x;
    const offsetY = clientY - rect.top - rect.height / 2 - position.y;

    const newScale = Math.min(Math.max(scale * deltaScale, 0.5), 5);
    const scaleRatio = newScale / scale;

    // Adjust position to zoom at cursor point
    const newX = position.x - offsetX * (scaleRatio - 1);
    const newY = position.y - offsetY * (scaleRatio - 1);

    setScale(newScale);
    setPosition({ x: newX, y: newY });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomIntensity = 0.0025;
    const delta = e.deltaY;
    const factor = Math.exp(-delta * zoomIntensity);
    zoomAt(factor, e.clientX, e.clientY);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const nextScale = scale < 2 ? 2 : 1;
    const factor = nextScale / scale;
    zoomAt(factor, e.clientX, e.clientY);
  };

  const currentImage = images[currentIndex];

  if (!currentImage) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center"
          onClick={onClose}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-50 p-3 bg-black/50 hover:bg-black/70 rounded-full border border-white/10 text-white transition-all hover:scale-110"
          >
            <X size={20} />
          </button>

          {/* Navigation buttons */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentIndex > 0) {
                    setCurrentIndex(currentIndex - 1);
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                disabled={currentIndex === 0}
                className={cn(
                  "absolute left-4 z-50 p-3 bg-black/50 hover:bg-black/70 rounded-full border border-white/10 text-white transition-all hover:scale-110",
                  currentIndex === 0 && "opacity-50 cursor-not-allowed"
                )}
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentIndex < images.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                disabled={currentIndex === images.length - 1}
                className={cn(
                  "absolute right-4 z-50 p-3 bg-black/50 hover:bg-black/70 rounded-full border border-white/10 text-white transition-all hover:scale-110",
                  currentIndex === images.length - 1 && "opacity-50 cursor-not-allowed"
                )}
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          {/* Image counter */}
          {images.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-black/50 rounded-full border border-white/10 text-white text-sm font-mono">
              {currentIndex + 1} / {images.length}
            </div>
          )}

          {/* Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-2 bg-black/50 rounded-full border border-white/10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const container = containerRef.current;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  zoomAt(0.8, centerX, centerY);
                }
              }}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-all"
            >
              <ZoomOut size={18} />
            </button>
            <div className="px-3 py-1 text-white text-xs font-mono min-w-[60px] text-center">
              {Math.round(scale * 100)}%
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const container = containerRef.current;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const centerX = rect.left + rect.width / 2;
                  const centerY = rect.top + rect.height / 2;
                  zoomAt(1.25, centerX, centerY);
                }
              }}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-all"
            >
              <ZoomIn size={18} />
            </button>
            <div className="w-px h-6 bg-white/20 mx-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="p-2 hover:bg-white/10 rounded-full text-white transition-all"
            >
              <Maximize2 size={18} />
            </button>
          </div>

          {/* Image container */}
          <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center overflow-hidden touch-none"
            onWheel={handleWheel}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              ref={imageRef}
              key={currentImage.url}
              src={currentImage.url}
              alt={currentImage.alt || 'Fullscreen image'}
              className={cn(
                "max-w-[90vw] max-h-[90vh] object-contain select-none transition-opacity duration-200",
                isDragging && "cursor-grabbing",
                scale > 1 && "cursor-grab"
              )}
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 60ms ease-out',
                willChange: 'transform',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onDoubleClick={handleDoubleClick}
              draggable={false}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
