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
  const preparationGuardRef = useRef<() => boolean>(() => true);
  const { gl: renderer, scene, camera: mainCamera } = useThree();
  useEffect(() => {
    preparationRef.current = 'idle';
    const previous = scene.onBeforeRender;
    let cancelled = false;
    let submittedWorld = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: number | undefined;
    let release: ReturnType<typeof beginStartupTask> | undefined;
    type PreparedProgram = {
      program?: WebGLProgram;
      isReady: () => boolean;
      getUniforms: () => unknown;
      getAttributes: () => unknown;
    };
    type Configuration = {
      environment: THREE.Scene['environment'];
      quality: string;
      materials: Map<THREE.Material, { version: number; key: string }>;
      programs: Set<PreparedProgram>;
    };
    let configuration: Configuration | undefined;
    const finishTask = (failed = false) => {
      release?.(failed);
      release = undefined;
    };
    const fail = (error: unknown) => {
      if (cancelled || preparationRef.current === 'failed') return;
      preparationRef.current = 'failed';
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      release ??= beginStartupTask();
      finishTask(true);
      console.error('Startup shader preparation failed', error);
    };
    const checkDeadline = () => {
      if (deadline !== undefined && performance.now() >= deadline)
        throw new Error('Truck shader preparation timed out');
    };
    const configurationValid = (): boolean => {
      if (!configuration) return false;
      // Loss/disposal is terminal even when a legitimate finish also changed.
      if (renderer.getContext().isContextLost())
        throw new Error('Truck shader context was lost during preparation');
      for (const program of configuration.programs)
        if (!program.program) throw new Error('Truck shader was disposed during preparation');
      if (
        scene.environment !== configuration.environment ||
        useGraphicsStore.getState().graphics.quality !== configuration.quality ||
        [...configuration.materials].some(
          ([material, config]) =>
            material.version !== config.version || material.customProgramCacheKey() !== config.key
        )
      ) {
        clearTimeout(timer);
        configuration = undefined;
        preparationRef.current = 'idle';
        // Retain one barrier across retries, including drift in the frame window.
        release ??= beginStartupTask();
        checkDeadline();
        return false;
      }
      return true;
    };
    preparationGuardRef.current = () => {
      if (cancelled || preparationRef.current === 'failed') return false;
      try {
        if (configuration && !configurationValid()) return false;
        return preparationRef.current === 'ready';
      } catch (error) {
        fail(error);
        return false;
      }
    };
    const prepare: THREE.Scene['onBeforeRender'] = function (this: THREE.Scene, ...args) {
      previous.apply(this, args);
      const [gl, targetScene, camera] = args;
      const data = document.documentElement.dataset;
      const startup = getStartupSnapshot();
      if (startup.ready || gl !== renderer || targetScene !== scene || camera !== mainCamera)
        return;
      try {
        if (
          !submittedWorld &&
          data.millosWorldReady === 'true' &&
          !gl.getContext().isContextLost()
        ) {
          // Submit the real assembly together before first-use queries serialize
          // its programs. Never certify completion here or replace final-variant
          // validation. Working if batching/assets still block access, while
          // ordinary rendering retains every source, shader diagnostic and frame.
          submittedWorld = true;
          gl.compile(scene, camera);
        }
        if (configuration) configurationValid();
        if (
          preparationRef.current !== 'idle' ||
          data.millosWorldReady !== 'true' ||
          data.millosStaticBatchesPending !== '0' ||
          startup.pendingAssets !== 0 ||
          getStartupSnapshot().pendingTasks !== (release ? 1 : 0) ||
          document.visibilityState === 'hidden' ||
          gl.getContext().isContextLost()
        )
          return;
        const trucks = ['shipping-truck', 'receiving-truck'].flatMap((name) => {
          const full = scene.getObjectByName(name)?.getObjectByName('truck-full-detail');
          return full ? [full] : [];
        });
        if (!trucks.length) return;
        if (deadline === undefined) {
          deadline = performance.now() + 15000;
          deadlineTimer = setTimeout(() => {
            if (preparationRef.current !== 'ready')
              fail(new Error('Truck shader preparation timed out'));
          }, 15000);
        }
        checkDeadline();
        preparationRef.current = 'pending';
        release ??= beginStartupTask();
        // Use the actual main-scene callback, target, lights and camera again
        // when streamed finishes invalidate preparation. Never certify old
        // variants or extend the first attempt's deadline. Working if a late
        // finish re-prepares behind the overlay and still needs 45 stable frames.
        const programs = new Set<PreparedProgram>();
        const materials = new Map<THREE.Material, { version: number; key: string }>();
        for (const truck of trucks) {
          for (const material of gl.compile(truck, camera, scene)) {
            const { programs: variants } = gl.properties.get(material) as {
              programs?: Map<string, PreparedProgram>;
            };
            if (!(variants instanceof Map) || variants.size === 0)
              throw new Error('Compiled truck material has no shader variants');
            for (const program of variants.values()) programs.add(program);
            materials.set(material, {
              version: material.version,
              key: material.customProgramCacheKey(),
            });
          }
        }
        const attempt: Configuration = {
          environment: scene.environment,
          quality: useGraphicsStore.getState().graphics.quality,
          materials,
          programs,
        };
        configuration = attempt;
        const remaining = new Set(programs);
        const poll = () => {
          if (cancelled || configuration !== attempt) return;
          try {
            checkDeadline();
            if (!configurationValid()) return;
            for (const program of remaining) {
              if (!program.isReady()) continue;
              // Keep Three's first-use metadata and shader error checks intact.
              program.getUniforms();
              program.getAttributes();
              remaining.delete(program);
            }
            if (!remaining.size) {
              checkDeadline();
              preparationRef.current = 'ready';
              finishTask();
            } else timer = setTimeout(poll, 10);
          } catch (error) {
            fail(error);
          }
        };
        timer = setTimeout(poll, 10);
      } catch (error) {
        fail(error);
      }
    };
    scene.onBeforeRender = prepare;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      finishTask();
      preparationGuardRef.current = () => false;
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
      (preparationGuardRef.current() ||
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
