/**
 * AudioReactiveProvider
 *
 * Top-level component that initializes the audio analyzer.
 * Must be placed outside the Canvas in App.tsx.
 */

import React from 'react';
import { useAudioReactive } from '../hooks/useAudioReactive';

export const AudioReactiveProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  // Initialize the audio analyzer hook
  // The hook internally checks enableAudioReactive from graphicsStore
  useAudioReactive();

  // This component is invisible - just initializes the analyzer
  return <>{children}</>;
};

// Memoized to prevent unnecessary re-renders
export default React.memo(AudioReactiveProvider);
