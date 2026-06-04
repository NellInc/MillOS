import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

export const ZoneCustomizationPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', x: 0, z: 0, radius: 4 });
  // Track which zone (if any) is awaiting delete confirmation. Per-zone so a
  // single click only "arms" that row instead of destroying the zone outright.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedZones = useSafetyStore((state) => state.speedZones);
  const addSpeedZone = useSafetyStore((state) => state.addSpeedZone);
  const removeSpeedZone = useSafetyStore((state) => state.removeSpeedZone);
  const theme = useUIStore((state) => state.theme);

  // Clear any pending confirm-revert timer on unmount to avoid setState-after-unmount.
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleRemoveClick = (id: string) => {
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    if (confirmingId === id) {
      // Second click: confirmed — delete and reset.
      removeSpeedZone(id);
      setConfirmingId(null);
      return;
    }
    // First click: arm confirmation, auto-revert after ~3s.
    setConfirmingId(id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingId(null);
      confirmTimerRef.current = null;
    }, 3000);
  };

  const handleAddZone = () => {
    if (newZone.name.trim()) {
      const safeRadius = Number.isFinite(newZone.radius) ? Math.max(0.5, newZone.radius) : 4;
      addSpeedZone({ ...newZone, radius: safeRadius });
      setNewZone({ name: '', x: 0, z: 0, radius: 4 });
      setShowAddForm(false);
    }
  };

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="zone-customization-content"
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-amber-500" />
          Speed Zones ({speedZones.length})
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="zone-customization-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 pt-2 overflow-hidden"
          >
            {/* Zone List */}
            <div className="max-h-32 overflow-y-auto space-y-1">
              {speedZones.map((zone) => (
                <div
                  key={zone.id}
                  className={`flex items-center justify-between rounded px-2 py-1 text-xs group focus-within:ring-1 focus-within:ring-amber-500 ${
                    theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className={`truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}
                    >
                      {zone.name}
                    </div>
                    <div
                      className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      ({zone.x}, {zone.z}) r={zone.radius}m
                    </div>
                  </div>
                  {confirmingId === zone.id ? (
                    <button
                      onClick={() => handleRemoveClick(zone.id)}
                      className="opacity-100 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-600 hover:bg-red-500 text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 transition-all whitespace-nowrap"
                      title={`Confirm removing zone ${zone.name}`}
                      aria-label={`Confirm removing zone ${zone.name}`}
                    >
                      Confirm?
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRemoveClick(zone.id)}
                      className={`opacity-100 md:opacity-0 md:group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none p-1 transition-all ${
                        theme === 'light'
                          ? 'text-red-500 hover:text-red-600'
                          : 'text-red-400 hover:text-red-300'
                      }`}
                      title="Remove zone"
                      aria-label={`Remove zone ${zone.name}`}
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Zone Form */}
            {showAddForm ? (
              <div
                className={`rounded p-2 space-y-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
              >
                <input
                  type="text"
                  aria-label="Zone name"
                  placeholder="Zone name"
                  value={newZone.name}
                  onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
                  className={`w-full rounded px-2 py-1 text-xs border outline-none ${
                    theme === 'light'
                      ? 'bg-white text-slate-700 placeholder-slate-400 border-slate-300 focus:border-amber-500'
                      : 'bg-slate-900 text-white placeholder-slate-500 border-slate-700 focus:border-amber-500'
                  }`}
                />
                <div className="grid grid-cols-3 gap-1">
                  <div>
                    <label
                      htmlFor="zone-x"
                      className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      X
                    </label>
                    <input
                      id="zone-x"
                      type="number"
                      value={newZone.x}
                      onChange={(e) =>
                        setNewZone({ ...newZone, x: parseFloat(e.target.value) || 0 })
                      }
                      className={`w-full rounded px-1.5 py-0.5 text-xs border outline-none ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300 focus:border-amber-500'
                          : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="zone-z"
                      className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      Z
                    </label>
                    <input
                      id="zone-z"
                      type="number"
                      value={newZone.z}
                      onChange={(e) =>
                        setNewZone({ ...newZone, z: parseFloat(e.target.value) || 0 })
                      }
                      className={`w-full rounded px-1.5 py-0.5 text-xs border outline-none ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300 focus:border-amber-500'
                          : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="zone-radius"
                      className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      Radius
                    </label>
                    <input
                      id="zone-radius"
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={newZone.radius}
                      onChange={(e) =>
                        setNewZone({
                          ...newZone,
                          radius: Math.max(0.5, parseFloat(e.target.value)) || 4,
                        })
                      }
                      className={`w-full rounded px-1.5 py-0.5 text-xs border outline-none ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300 focus:border-amber-500'
                          : 'bg-slate-900 text-white border-slate-700 focus:border-amber-500'
                      }`}
                    />
                  </div>
                </div>
                {!newZone.name.trim() && (
                  <p
                    className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Enter a zone name to add.
                  </p>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={handleAddZone}
                    disabled={!newZone.name.trim()}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/40 disabled:cursor-not-allowed disabled:hover:bg-amber-600/40 text-white py-1 rounded text-xs font-medium transition-colors"
                  >
                    Add Zone
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      theme === 'light'
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className={`w-full flex items-center justify-center gap-1 py-1.5 rounded text-xs transition-colors ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Plus className="w-3 h-3" />
                Add Speed Zone
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
