/**
 * Panel Preloader Utility
 *
 * Preloads lazy-loaded panel components during browser idle time
 * to eliminate jank when switching between panels.
 */

// Panel import functions - these match the lazy() definitions in ContextSidebar
const panelImports = {
  // High priority - commonly used panels, preload first
  ai: () => import('../../AICommandCenter'),
  scada: () => import('../../SCADAPanel'),
  worker: () => import('../../WorkerDetailPanel'),

  // Medium priority - BAS panels
  stability: () => import('../widgets/StabilityMonitor'),
  timeline: () => import('../widgets/BASTimeline'),
  vcp: () => import('../widgets/VCPStatusPanel'),
  flourishing: () => import('../widgets/FlourishingDashboard'),
  engagement: () => import('../widgets/EngagementSignaturePanel'),

  // Lower priority - less frequently accessed
  scenario: () => import('../widgets/ScenarioPlayground'),
  ownership: () => import('../widgets/OwnershipPanel'),
  voting: () => import('../widgets/VotingPanel'),
  federation: () => import('../widgets/FederationPanel'),
  aiWelfare: () => import('../widgets/AIWelfarePanel'),
  socialMission: () => import('../widgets/SocialMissionPanel'),
  education: () => import('../widgets/BASEducation'),
};

type PanelKey = keyof typeof panelImports;

// Track which panels have been preloaded
const preloadedPanels = new Set<PanelKey>();

/**
 * Preload a specific panel
 */
export const preloadPanel = async (panel: PanelKey): Promise<void> => {
  if (preloadedPanels.has(panel)) return;

  try {
    await panelImports[panel]();
    preloadedPanels.add(panel);
  } catch (e) {
    // Silently ignore preload failures - they'll load on demand
    console.debug(`Panel preload skipped: ${panel}`);
  }
};

/**
 * Preload all panels during idle time
 * Uses requestIdleCallback to avoid blocking the main thread
 */
export const preloadAllPanels = (): void => {
  const panels = Object.keys(panelImports) as PanelKey[];
  let currentIndex = 0;

  const preloadNext = (deadline: IdleDeadline) => {
    // Load panels while we have idle time (at least 10ms)
    while (currentIndex < panels.length && deadline.timeRemaining() > 10) {
      const panel = panels[currentIndex];
      if (!preloadedPanels.has(panel)) {
        // Start the import but don't await - let it load in background
        panelImports[panel]()
          .then(() => preloadedPanels.add(panel))
          .catch(() => {
            /* ignore */
          });
      }
      currentIndex++;
    }

    // Schedule more work if we haven't finished
    if (currentIndex < panels.length) {
      requestIdleCallback(preloadNext, { timeout: 2000 });
    }
  };

  // Start preloading during idle time
  if (typeof requestIdleCallback !== 'undefined') {
    // Wait a bit for initial render to complete
    setTimeout(() => {
      requestIdleCallback(preloadNext, { timeout: 3000 });
    }, 1500);
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      panels.forEach((panel) => {
        setTimeout(() => {
          if (!preloadedPanels.has(panel)) {
            panelImports[panel]()
              .then(() => preloadedPanels.add(panel))
              .catch(() => {
                /* ignore */
              });
          }
        }, 100);
      });
    }, 2000);
  }
};

/**
 * Preload panels related to a specific mode
 */
export const preloadPanelsForMode = (mode: string): void => {
  switch (mode) {
    case 'ai':
      preloadPanel('ai');
      break;
    case 'scada':
      preloadPanel('scada');
      break;
    case 'management':
      // BAS mode uses many panels - preload the most important ones
      preloadPanel('stability');
      preloadPanel('timeline');
      preloadPanel('vcp');
      preloadPanel('flourishing');
      break;
    default:
      break;
  }
};
