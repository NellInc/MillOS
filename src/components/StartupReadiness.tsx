import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import {
  beginStartupTask,
  getStartupSnapshot,
  markStartupPrepared,
  markStartupReady,
  StartupFrameWindow,
} from '../utils/startupReadiness';
import { useGraphicsStore } from '../stores/graphicsStore';

/** Observe the previous rendered frame without taking over R3F/composer rendering. */
export function StartupReadiness(): null {
  const windowRef = useRef(new StartupFrameWindow());
  const preparationRef = useRef<'idle' | 'pending' | 'ready' | 'failed'>('idle');
  const { gl: renderer, scene, camera: mainCamera } = useThree();
  useEffect(() => {
    preparationRef.current = 'idle';
    const previous = scene.onBeforeRender;
    let started = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: ReturnType<typeof beginStartupTask> | undefined;
    const prepare: THREE.Scene['onBeforeRender'] = function (this: THREE.Scene, ...args) {
      previous.apply(this, args);
      const [gl, targetScene, camera] = args;
      const data = document.documentElement.dataset;
      const startup = getStartupSnapshot();
      if (
        started ||
        startup.ready ||
        gl !== renderer ||
        targetScene !== scene ||
        camera !== mainCamera ||
        data.millosWorldReady !== 'true' ||
        data.millosStaticBatchesPending !== '0' ||
        startup.pendingAssets !== 0 ||
        startup.pendingTasks !== 0 ||
        document.visibilityState === 'hidden' ||
        gl.getContext().isContextLost()
      )
        return;
      const trucks = ['shipping-truck', 'receiving-truck'].flatMap((name) => {
        const full = scene.getObjectByName(name)?.getObjectByName('truck-full-detail');
        return full ? [full] : [];
      });
      if (!trucks.length) return;
      started = true;
      preparationRef.current = 'pending';
      release = beginStartupTask();
      // This callback sees the actual composer's target, lights and camera.
      // Hidden, retained truck LODs otherwise compile on their first approach.
      // Snapshot every variant: compileAsync polls only mutable currentProgram.
      // Working if approaches do not link new finishes and loading stays up
      // until preparation completes and the existing stable-frame gate passes.
      try {
        type PreparedProgram = {
          program?: WebGLProgram;
          isReady: () => boolean;
          getUniforms: () => unknown;
          getAttributes: () => unknown;
        };
        const programs = new Set<PreparedProgram>();
        const configurations = new Map<THREE.Material, { version: number; key: string }>();
        for (const truck of trucks) {
          const materials = gl.compile(truck, camera, scene);
          for (const material of materials) {
            const { programs: variants } = gl.properties.get(material) as {
              programs?: Map<string, PreparedProgram>;
            };
            if (!(variants instanceof Map) || variants.size === 0)
              throw new Error('Compiled truck material has no shader variants');
            for (const program of variants.values()) programs.add(program);
            configurations.set(material, {
              version: material.version,
              key: material.customProgramCacheKey(),
            });
          }
        }
        const environment = scene.environment;
        const quality = useGraphicsStore.getState().graphics.quality;
        const deadline = performance.now() + 15000;
        const poll = () => {
          if (cancelled) return;
          try {
            if (
              gl.getContext().isContextLost() ||
              scene.environment !== environment ||
              useGraphicsStore.getState().graphics.quality !== quality ||
              [...configurations].some(
                ([material, config]) =>
                  material.version !== config.version ||
                  material.customProgramCacheKey() !== config.key
              )
            )
              throw new Error('Truck shader configuration changed during preparation');
            for (const program of programs) {
              if (!program.program) throw new Error('Truck shader was disposed during preparation');
              if (!program.isReady()) continue;
              // Installed Three's first-use metadata retains shader error
              // checks. It is initialized behind the overlay, never disabled.
              program.getUniforms();
              program.getAttributes();
              programs.delete(program);
            }
            if (!programs.size) {
              preparationRef.current = 'ready';
              release?.();
            } else if (performance.now() >= deadline)
              throw new Error('Truck shader preparation timed out');
            else timer = setTimeout(poll, 10);
          } catch (error) {
            preparationRef.current = 'failed';
            release?.(true);
            console.error('Truck shader preparation failed', error);
          }
        };
        timer = setTimeout(poll, 10);
      } catch (error) {
        preparationRef.current = 'failed';
        release(true);
        console.error('Truck shader preparation failed', error);
      }
    };
    scene.onBeforeRender = prepare;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      release?.();
      if (scene.onBeforeRender === prepare) scene.onBeforeRender = previous;
    };
  }, [renderer, scene, mainCamera]);
  useFrame(({ gl }) => {
    const startup = getStartupSnapshot();
    if (startup.ready) return;
    const data = document.documentElement.dataset;
    const prerequisitesReady = (): boolean =>
      data.millosWorldReady === 'true' &&
      data.millosStaticBatchesPending === '0' &&
      getStartupSnapshot().pendingAssets === 0 &&
      getStartupSnapshot().pendingTasks === 0 &&
      preparationRef.current !== 'pending' &&
      preparationRef.current !== 'failed' &&
      (preparationRef.current === 'ready' ||
        !['shipping-truck', 'receiving-truck'].some((name) =>
          scene.getObjectByName(name)?.getObjectByName('truck-full-detail')
        )) &&
      document.visibilityState !== 'hidden' &&
      !gl.getContext().isContextLost();
    // Rendering new materials or uploading geometry/textures restarts sampling.
    const revision = (): string =>
      [
        getStartupSnapshot().revision,
        gl.info.programs?.length ?? 0,
        gl.info.memory.geometries,
        gl.info.memory.textures,
        useGraphicsStore.getState().graphics.quality,
        useGraphicsStore.getState().graphics.resolutionScale,
      ].join(':');
    const frameRevision = revision();
    const graphics = useGraphicsStore.getState().graphics;
    if (
      windowRef.current.sample({
        now: performance.now(),
        prerequisitesReady: prerequisitesReady(),
        revision: frameRevision,
      })
    ) {
      markStartupReady();
    } else {
      markStartupPrepared(
        windowRef.current.prepared,
        () =>
          prerequisitesReady() &&
          revision() === frameRevision &&
          useGraphicsStore.getState().graphics === graphics
      );
    }
  }, -999);
  return null;
}
