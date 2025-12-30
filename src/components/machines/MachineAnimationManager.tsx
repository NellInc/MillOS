import React from 'react';
import { useFrame } from '@react-three/fiber';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { useBassLevel } from '../../stores/audioAnalyzerStore';
import { rollerRegistry, panelRegistry, shaderRegistry, LED_COLORS } from './shared';

// Manager component to handle all animations in a single consolidated loop
export const MachineAnimationManager: React.FC = () => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const enableAudioReactive = useGraphicsStore((state) => state.graphics.enableAudioReactive);
  const bassLevel = useBassLevel();

  useFrame((state, delta) => {
    // Skip if tab not visible or low quality (animations disabled on low)
    if (!isTabVisible || quality === 'low') return;

    // 1. Update Rollers (Throttle: Ultra=1, High=2, Medium=2)
    const rollerThrottle = quality === 'ultra' ? 1 : 2;
    if (rollerRegistry.size > 0 && shouldRunThisFrame(rollerThrottle)) {
      const adjustedDelta = delta * rollerThrottle;
      rollerRegistry.forEach((data) => {
        if (data.rpm > 0) {
          data.mesh.rotation.x += (data.rpm / 60) * Math.PI * 2 * adjustedDelta;
        }
      });
    }

    // 2. Update Panels (Throttle: 4 frames ~15fps is plenty for blinking)
    if (panelRegistry.size > 0 && shouldRunThisFrame(4)) {
      const time = state.clock.elapsedTime;

      // Calculate blink states once per frame
      const runningState = Math.floor(time * 2) % 4;
      const warningState = Math.sin(time * 6) > 0 ? 1 : 0;
      const criticalState = Math.sin(time * 10) > 0 ? 2 : 3;

      panelRegistry.forEach((data) => {
        const status = data.status;
        const colors = LED_COLORS[status];
        let idx = 0;

        // Update blink state index
        if (status === 'running') idx = runningState;
        else if (status === 'warning') idx = warningState;
        else if (status === 'critical') idx = criticalState;
        else idx = 0;

        // Update LEDs directly without React re-render
        data.ledMaterials.forEach((mat, i) => {
          const color = colors[(idx + i) % 4];
          const isOff = color === '#1e293b' || (status === 'idle' && color === '#64748b');
          mat.color.set(color);
          mat.emissive.set(color);
          // Base intensity with audio-reactive bass modulation when enabled
          const baseIntensity = isOff ? 0 : 0.8;
          const bassBoost = enableAudioReactive ? bassLevel * 0.7 : 0;
          mat.emissiveIntensity = baseIntensity + (isOff ? 0 : bassBoost);
        });
      });
    }

    // 3. Update Shaders (Heat shimmer etc)
    const shaderThrottle = quality === 'ultra' ? 1 : 2;
    if (shaderRegistry.size > 0 && shouldRunThisFrame(shaderThrottle)) {
      const time = state.clock.elapsedTime;
      shaderRegistry.forEach((data) => {
        if (data.uniforms.time) {
          data.uniforms.time.value = time;
        }
      });
    }
  });

  return null;
};
