import { create } from 'zustand';
import type { DockMode } from '../components/ui-new/dock/types';

export interface DPadDirection {
  x: number; // -1 (left) to 1 (right)
  y: number; // -1 (up/forward) to 1 (down/backward)
}

interface MobileControlStore {
  // D-pad state
  dpadMode: 'move' | 'look';
  setDpadMode: (mode: 'move' | 'look') => void;
  toggleDpadMode: () => void;

  dpadDirection: DPadDirection | null;
  setDpadDirection: (direction: DPadDirection | null) => void;

  // Sprint state (for FPS mode)
  isSprinting: boolean;
  setIsSprinting: (sprinting: boolean) => void;

  // Touch look state
  isTouchLooking: boolean;
  setIsTouchLooking: (looking: boolean) => void;

  // Mobile panel state
  mobilePanelContent: DockMode | null;
  setMobilePanelContent: (content: DockMode | null) => void;

  mobilePanelVisible: boolean;
  setMobilePanelVisible: (visible: boolean) => void;

  // Combined action to open panel with specific content
  openMobilePanel: (content: DockMode) => void;
  closeMobilePanel: () => void;
}

export const useMobileControlStore = create<MobileControlStore>((set) => ({
  // D-pad state
  dpadMode: 'move',
  setDpadMode: (mode) => set({ dpadMode: mode }),
  toggleDpadMode: () =>
    set((state) => ({
      dpadMode: state.dpadMode === 'move' ? 'look' : 'move',
    })),

  dpadDirection: null,
  setDpadDirection: (direction) => set({ dpadDirection: direction }),

  // Sprint state
  isSprinting: false,
  setIsSprinting: (sprinting) => set({ isSprinting: sprinting }),

  // Touch look state
  isTouchLooking: false,
  setIsTouchLooking: (looking) => set({ isTouchLooking: looking }),

  // Mobile panel state
  mobilePanelContent: null,
  setMobilePanelContent: (content) => set({ mobilePanelContent: content }),

  mobilePanelVisible: false,
  setMobilePanelVisible: (visible) => set({ mobilePanelVisible: visible }),

  // Combined actions
  openMobilePanel: (content) => set({ mobilePanelContent: content, mobilePanelVisible: true }),
  closeMobilePanel: () => set({ mobilePanelVisible: false }),
}));
