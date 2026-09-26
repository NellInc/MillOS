import { saveScenePng } from '../../utils/sceneCapture';
import React, { useState } from 'react';
import { Image, Download } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useAchievementsStore } from '../../stores/achievementsStore';
import { useUIStore } from '../../stores/uiStore';

export const ScreenshotButton: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const handleScreenshot = async () => {
    setIsExporting(true);

    try {
      // Capture through the renderer, not querySelector('canvas'): the context
      // does not preserve its drawing buffer, so a direct toDataURL is blank.
      const saved = await saveScenePng(
        `millos-screenshot-${new Date().toISOString().split('T')[0]}.png`
      );
      if (!saved) {
        useUIStore.getState().addAlert({
          id: `screenshot-fail-${Date.now()}`,
          type: 'warning',
          title: 'Screenshot Failed',
          message: 'Rendering surface unavailable. Try again in a moment.',
          timestamp: new Date(),
          acknowledged: false,
        });
        return;
      }
    } catch (error) {
      console.warn('Screenshot capture failed:', error);
      useUIStore.getState().addAlert({
        id: `screenshot-fail-${Date.now()}`,
        type: 'warning',
        title: 'Screenshot Failed',
        message: 'Could not capture the scene. Try again in a moment.',
        timestamp: new Date(),
        acknowledged: false,
      });
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
      achievements: useAchievementsStore
        .getState()
        .achievements.filter((a) => a.tracked !== false && a.unlockedAt),
      safetyIncidents: safetyStore.safetyIncidents.slice(0, 20),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `millos-report-${new Date().toISOString().split('T')[0]}.json`;
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
