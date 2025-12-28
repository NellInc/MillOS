import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Download } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';

export const ScreenshotButton: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const handleScreenshot = async () => {
    setIsExporting(true);

    try {
      // Find the canvas element
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        console.error('No canvas found');
        return;
      }

      // Create a link and download
      const link = document.createElement('a');
      link.download = `millos-screenshot-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Screenshot failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportReport = () => {
    const store = useProductionStore.getState();
    const safetyStore = useSafetyStore.getState();

    const report = {
      timestamp: new Date().toISOString(),
      metrics: store.metrics,
      safetyMetrics: safetyStore.safetyMetrics,
      productionTarget: store.productionTarget,
      totalBagsProduced: store.totalBagsProduced,
      achievements: store.achievements.filter((a) => a.unlockedAt),
      safetyIncidents: safetyStore.safetyIncidents.slice(0, 20),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `millos-report-${new Date().toISOString().split('T')[0]}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  return (
    <div className="flex gap-1">
      <button
        onClick={handleScreenshot}
        disabled={isExporting}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors disabled:opacity-50"
        title="Take Screenshot"
      >
        <Image className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Screenshot</span>
      </button>
      <button
        onClick={handleExportReport}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
        title="Export Report"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Export</span>
      </button>
    </div>
  );
};
