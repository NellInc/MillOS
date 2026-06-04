import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

export const CollapsibleLegend: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const legendPosition = useUIStore((state) => state.legendPosition);
  const setLegendPosition = useUIStore((state) => state.setLegendPosition);
  const theme = useUIStore((state) => state.theme);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  // Handle mouse down on grip
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      const rect = dragRef.current?.getBoundingClientRect();
      if (rect) {
        elementStartPos.current = {
          x:
            legendPosition.x === -1
              ? window.innerWidth - rect.right + rect.width
              : legendPosition.x,
          y: legendPosition.y === -1 ? rect.top : legendPosition.y,
        };
      }
    },
    [legendPosition]
  );

  // Handle mouse move while dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      const newX = elementStartPos.current.x - deltaX;
      const newY = elementStartPos.current.y + deltaY;

      // Constrain to viewport
      const maxX = window.innerWidth - 50;
      const maxY = window.innerHeight - 50;
      setLegendPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, setLegendPosition]);

  // Calculate position style
  const positionStyle =
    legendPosition.x === -1
      ? { top: '12rem', right: '1rem' }
      : { top: legendPosition.y, right: legendPosition.x };

  return (
    <motion.div
      ref={dragRef}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      style={positionStyle}
      className={`hidden md:block fixed backdrop-blur-xl rounded-xl pointer-events-auto border shadow-xl overflow-hidden ${isDragging ? 'cursor-grabbing' : ''} ${
        theme === 'light'
          ? 'bg-white/95 border-slate-200 text-slate-800'
          : 'bg-slate-950/90 border-slate-700/50 text-white'
      }`}
    >
      <div className="flex items-center">
        {/* Drag Handle (mouse-only reposition; hidden from assistive tech to avoid a keyboard focus dead-end) */}
        <div
          onMouseDown={handleMouseDown}
          className={`px-1.5 py-2.5 cursor-grab transition-colors flex items-center ${
            theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-800/50'
          }`}
          title="Drag to move (mouse only)"
          aria-hidden="true"
        >
          <GripVertical
            className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="collapsible-legend-content"
          className={`flex-1 flex items-center justify-between p-2.5 pl-1 transition-colors ${
            theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-slate-800/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-cyan-500" />
            <span
              className={`font-medium text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}
            >
              Legend
            </span>
          </div>
          {expanded ? (
            <ChevronUp
              className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
            />
          ) : (
            <ChevronDown
              className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
            />
          )}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="collapsible-legend-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {/* Equipment */}
              <div>
                <h3
                  className={`font-bold uppercase text-[9px] tracking-wider mb-1.5 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  Equipment
                </h3>
                <ul className="space-y-1 text-xs">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-slate-300 to-slate-400" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                      Silos
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-blue-400 to-blue-600" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                      Roller Mills
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-slate-200 to-slate-300 border border-slate-300" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                      Plansifters
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded bg-gradient-to-br from-orange-400 to-orange-600" />
                    <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                      Packers
                    </span>
                  </li>
                </ul>
              </div>

              {/* Controls */}
              <div
                className={`border-t pt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
              >
                <h3
                  className={`font-bold uppercase text-[9px] tracking-wider mb-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  Controls
                </h3>
                <ul
                  className={`space-y-0.5 text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                >
                  <li>Click machines to inspect</li>
                  <li>Click workers for profiles</li>
                  <li>Drag to rotate view</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
