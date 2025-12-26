import { useState, useEffect } from 'react';

/**
 * Hook to detect user's reduced motion preference.
 * Respects the prefers-reduced-motion media query.
 * 
 * @returns true if user prefers reduced motion
 */
export function useReducedMotion(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
        // SSR-safe initial value
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        const handleChange = (event: MediaQueryListEvent) => {
            setPrefersReducedMotion(event.matches);
        };

        // Modern browsers
        mediaQuery.addEventListener('change', handleChange);

        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, []);

    return prefersReducedMotion;
}
