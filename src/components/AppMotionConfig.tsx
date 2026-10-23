import React from 'react';
import { MotionConfig } from 'framer-motion';
import {
  selectInAppReducedMotion,
  useMotionPreferenceStore,
} from '../stores/motionPreferenceStore';

/**
 * framer-motion's reduced-motion policy for the operational interface.
 * `user` follows the OS media query; the in-app Reduce motion setting
 * escalates it to `always`. Working if every framer animation under it
 * (panels, overlays, toasts) cuts instead of gliding once either asks.
 */
export const AppMotionConfig: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const reduce = useMotionPreferenceStore(selectInAppReducedMotion);
  return <MotionConfig reducedMotion={reduce ? 'always' : 'user'}>{children}</MotionConfig>;
};
