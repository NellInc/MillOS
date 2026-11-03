import { useState, useEffect } from 'react';

interface MobileDetectionResult {
  isMobile: boolean;
  isSmallScreen: boolean;
  isCompactLayout: boolean;
  isTouchDevice: boolean;
  isLandscape: boolean;
}

/**
 * A touchscreen laptop has touch but steers with a mouse or trackpad; giving it
 * the touch-only controls (D-pad, touch look, no mouse orbit) left its pointer
 * moving nothing. Only a coarse primary pointer reads as handheld. Without
 * matchMedia, touch support stands in for it.
 * Working if a 1280x600 touch laptop orbits by mouse and a phone keeps the D-pad.
 */
function primaryPointerIsCoarse(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Hook to detect if the user is on a mobile/touch device and orientation.
 * - isTouchDevice: true if device supports touch input
 * - isSmallScreen: true when the viewport width is below 768px
 * - isMobile: true when the primary pointer is touch and either dimension is below 768px
 * - isCompactLayout: true for a narrow viewport or handheld landscape device
 * - isLandscape: true if device is in landscape orientation
 */
export function useMobileDetection(): MobileDetectionResult {
  const [state, setState] = useState<MobileDetectionResult>(() => {
    // SSR-safe initial state
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isSmallScreen: false,
        isCompactLayout: false,
        isTouchDevice: false,
        isLandscape: false,
      };
    }
    const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isLandscape = window.innerWidth > window.innerHeight;
    const isSmallScreen = window.innerWidth < 768;
    const isMobile =
      hasTouchSupport &&
      primaryPointerIsCoarse() &&
      Math.min(window.innerWidth, window.innerHeight) < 768;
    return {
      isTouchDevice: hasTouchSupport,
      isMobile,
      isSmallScreen,
      isCompactLayout: isSmallScreen || isMobile,
      isLandscape: hasTouchSupport && isLandscape,
    };
  });

  useEffect(() => {
    const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const handleResize = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      const isSmallScreen = window.innerWidth < 768;
      const isMobile =
        hasTouchSupport &&
        primaryPointerIsCoarse() &&
        Math.min(window.innerWidth, window.innerHeight) < 768;
      setState({
        isTouchDevice: hasTouchSupport,
        isMobile,
        isSmallScreen,
        isCompactLayout: isSmallScreen || isMobile,
        isLandscape: hasTouchSupport && isLandscape,
      });
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return state;
}

/**
 * Non-hook version for use outside React components.
 * Returns current mobile detection state.
 */
export function getMobileDetection(): MobileDetectionResult {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isSmallScreen: false,
      isCompactLayout: false,
      isTouchDevice: false,
      isLandscape: false,
    };
  }
  const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isLandscape = window.innerWidth > window.innerHeight;
  const isSmallScreen = window.innerWidth < 768;
  const isMobile =
    hasTouchSupport &&
    primaryPointerIsCoarse() &&
    Math.min(window.innerWidth, window.innerHeight) < 768;
  return {
    isTouchDevice: hasTouchSupport,
    isMobile,
    isSmallScreen,
    isCompactLayout: isSmallScreen || isMobile,
    isLandscape: hasTouchSupport && isLandscape,
  };
}
