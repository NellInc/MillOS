import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { DoubleSide } from 'three';
import {
  beginStartupTask,
  drawStartupFrame,
  getStartupDrawSerial,
  getStartupSnapshot,
  markStartupPrepared,
  markStartupReady,
  registerStartupDrawOwner,
  StartupFrameWindow,
  subscribeStartup,
} from '../utils/startupReadiness';
import { isPostProcessingActive, useGraphicsStore } from '../stores/graphicsStore';

/** CPU ticks remain live while the actual callers withhold unfinished world draws. */
export function StartupReadiness(): null {
  const windowRef = useRef(new StartupFrameWindow());
  const lastDrawRef = useRef(getStartupDrawSerial());
  const preparationGuardRef = useRef<() => boolean>(() => false);
  const retireObserversRef = useRef<() => void>(() => {});
  const ready = useSyncExternalStore(subscribeStartup, () => getStartupSnapshot().ready);
  const { gl: renderer, scene, camera: mainCamera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let truckDeadline: number | undefined;
    let release: ReturnType<typeof beginStartupTask> | undefined;
    let ownedRevisions = 0;
    const resourceRevision = () => getStartupSnapshot().revision - ownedRevisions;
    const beginTask = () => {
      if (!release) {
        release = beginStartupTask();
        ownedRevisions++;
      }
    };
    const previousTelemetry = scene.userData.startupPreparation;
    const telemetry = {
      worldMaterials: 0,
      worldPrograms: 0,
      worldSubmittedAt: 0,
      worldCompletedAt: 0,
      worldMetadataMilliseconds: 0,
      truckMetadataMilliseconds: 0,
    };
    scene.userData.startupPreparation = telemetry;
    let target: THREE.WebGLRenderTarget | null = null;
    type PreparedProgram = {
      program?: WebGLProgram;
      diagnostics?: { runnable: boolean };
      isReady: () => boolean;
      getUniforms: () => unknown;
      getAttributes: () => unknown;
    };
    type Configuration = {
      resourceRevision: number;
      environment: THREE.Scene['environment'];
      quality: string;
      target: THREE.WebGLRenderTarget | null;
      targetColourSpace: string;
      toneMapping: THREE.ToneMapping;
      materials: Map<THREE.Material, { version: number; key: string }>;
      programs: Set<PreparedProgram>;
      ready: boolean;
    };
    let world: Configuration | undefined;
    let trucks: Configuration | undefined;
    const finishTask = (error = false) => {
      if (release) {
        release(error);
        ownedRevisions++;
        release = undefined;
      }
    };
    const fail = (error: unknown) => {
      if (cancelled || failed) return;
      failed = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      beginTask();
      finishTask(true);
      console.error('Startup shader preparation failed', error);
    };
    const checkTruckDeadline = () => {
      if (truckDeadline !== undefined && performance.now() >= truckDeadline)
        throw new Error('Truck shader preparation timed out');
    };
    const colourSpace = () => target?.texture.colorSpace ?? renderer.outputColorSpace;
    const current = (configuration: Configuration): boolean => {
      if (renderer.getContext().isContextLost())
        throw new Error('Shader context was lost during preparation');
      for (const program of configuration.programs)
        if (!program.program) throw new Error('Shader was disposed during preparation');
      return (
        resourceRevision() === configuration.resourceRevision &&
        scene.environment === configuration.environment &&
        useGraphicsStore.getState().graphics.quality === configuration.quality &&
        target === configuration.target &&
        colourSpace() === configuration.targetColourSpace &&
        renderer.toneMapping === configuration.toneMapping &&
        [...configuration.materials].every(
          ([material, config]) =>
            material.version === config.version && material.customProgramCacheKey() === config.key
        )
      );
    };
    const invalidate = () => {
      clearTimeout(timer);
      world = undefined;
      trucks = undefined;
      beginTask();
      checkTruckDeadline();
    };
    const valid = (): boolean => {
      if (cancelled || failed) return false;
      try {
        if ((world && !current(world)) || (trucks && !current(trucks))) {
          invalidate();
          return false;
        }
        return !!world?.ready && !!trucks?.ready;
      } catch (error) {
        fail(error);
        return false;
      }
    };
    preparationGuardRef.current = valid;
    const compile = (objects: THREE.Object3D[], truck = false): Configuration => {
      const previousTarget = renderer.getRenderTarget();
      const cubeFace = renderer.getActiveCubeFace();
      const mipLevel = renderer.getActiveMipmapLevel();
      const materials = new Map<THREE.Material, { version: number; key: string }>();
      const programs = new Set<PreparedProgram>();
      try {
        renderer.setRenderTarget(target);
        scene.updateMatrixWorld();
        mainCamera.updateMatrixWorld();
        for (const object of objects) {
          const submitted = truck
            ? renderer.compile(object, mainCamera, scene)
            : renderer.compile(object, mainCamera);
          for (const material of submitted) {
            const { programs: variants } = renderer.properties.get(material) as {
              programs?: Map<string, PreparedProgram>;
            };
            if (!(variants instanceof Map) || variants.size === 0)
              throw new Error('Compiled material has no shader variants');
            for (const program of variants.values()) programs.add(program);
            // Double-sided preparation can increment version. Capture AFTER submission.
            materials.set(material, {
              version: material.version,
              key: material.customProgramCacheKey(),
            });
          }
        }
      } finally {
        renderer.setRenderTarget(previousTarget, cubeFace, mipLevel);
      }
      return {
        resourceRevision: resourceRevision(),
        environment: scene.environment,
        quality: useGraphicsStore.getState().graphics.quality,
        target,
        targetColourSpace: colourSpace(),
        toneMapping: renderer.toneMapping,
        materials,
        programs,
        ready: false,
      };
    };
    // Three's two-sided transparent draw increments version twice. Observe the
    // actual object pass; accept exactly those two increments, never a blind
    // post-draw restamp that could conceal a genuine material change.
    // Working if DoubleSide draws settle while authored needsUpdate still invalidates.
    const observers = new Map<THREE.Object3D, () => void>();
    let observedWorld: Configuration | undefined;
    const retireObservers = () => {
      for (const restore of observers.values()) restore();
      observers.clear();
      observedWorld = undefined;
    };
    retireObserversRef.current = retireObservers;
    const observeDoubleSideDraws = () => {
      if (world === observedWorld) return;
      observedWorld = world;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (
          !mesh.isMesh ||
          observers.has(object) ||
          !materials.some((m) => m?.transparent && m.side === DoubleSide && !m.forceSinglePass)
        )
          return;
        const oldBefore = object.onBeforeRender,
          oldAfter = object.onAfterRender;
        let observed: THREE.Material | undefined;
        let expected: { version: number; key: string } | undefined;
        let version = -1;
        const before: THREE.Object3D['onBeforeRender'] = function (this: THREE.Object3D, ...args) {
          oldBefore.apply(this, args);
          const material = args[4];
          expected = world?.materials.get(material);
          observed =
            material.transparent &&
            material.side === DoubleSide &&
            !material.forceSinglePass &&
            material.version === expected?.version
              ? material
              : undefined;
          version = material.version;
        };
        const after: THREE.Object3D['onAfterRender'] = function (this: THREE.Object3D, ...args) {
          oldAfter.apply(this, args);
          const material = args[4];
          if (
            !cancelled &&
            material === observed &&
            expected &&
            world?.materials.get(material) === expected &&
            material.transparent &&
            material.side === DoubleSide &&
            !material.forceSinglePass &&
            material.version === version + 2 &&
            material.customProgramCacheKey() === expected.key
          )
            expected.version = material.version;
          observed = undefined;
        };
        object.onBeforeRender = before;
        object.onAfterRender = after;
        observers.set(object, () => {
          if (object.onBeforeRender === before) object.onBeforeRender = oldBefore;
          if (object.onAfterRender === after) object.onAfterRender = oldAfter;
        });
      });
    };
    const poll = (configuration: Configuration, truck: boolean) => {
      const remaining = new Set(configuration.programs);
      const check = () => {
        if (cancelled || failed || (truck ? trucks : world) !== configuration) return;
        try {
          if (truck) checkTruckDeadline();
          if (!current(configuration)) {
            invalidate();
            return;
          }
          for (const program of remaining) {
            if (!program.isReady()) continue;
            // Completion polling never replaces Three's real link/error/metadata checks.
            const metadataAt = performance.now();
            try {
              program.getUniforms();
              program.getAttributes();
            } finally {
              if (truck) telemetry.truckMetadataMilliseconds += performance.now() - metadataAt;
              else telemetry.worldMetadataMilliseconds += performance.now() - metadataAt;
            }
            if (program.diagnostics?.runnable === false)
              throw new Error('Startup shader program is not runnable');
            remaining.delete(program);
            if (truck) checkTruckDeadline();
          }
          if (!remaining.size) {
            configuration.ready = true;
            // Working if a hung first truck compile stays bounded, while a succeeded
            // one retires its deadline so later re-preparation gets a fresh 15 s window.
            if (truck) {
              truckDeadline = undefined;
              clearTimeout(deadlineTimer);
              finishTask();
            } else telemetry.worldCompletedAt = performance.now();
          } else timer = setTimeout(check, 10);
        } catch (error) {
          fail(error);
        }
      };
      if (truck && configuration.programs.size > 0) timer = setTimeout(check, 10);
      else check();
    };
    const prepare = (beautyTarget: THREE.WebGLRenderTarget | null): boolean => {
      if (cancelled || failed) return false;
      if (getStartupSnapshot().ready) return true;
      target = beautyTarget;
      const data = document.documentElement.dataset;
      const startup = getStartupSnapshot();
      if (
        data.millosWorldReady !== 'true' ||
        data.millosStaticBatchesPending !== '0' ||
        startup.pendingAssets !== 0 ||
        startup.pendingTasks !== (release ? 1 : 0) ||
        startup.errors !== 0 ||
        document.visibilityState === 'hidden'
      ) {
        if (world || trucks) {
          try {
            invalidate();
          } catch (error) {
            fail(error);
          }
        }
        return false;
      }
      if (valid()) {
        observeDoubleSideDraws();
        return true;
      }
      if (failed) return false;
      try {
        if (renderer.getContext().isContextLost()) throw new Error('Startup shader context lost');
        beginTask();
        if (!world) {
          // Prepare the finished, unfiltered beauty assembly, never N8AO's subset.
          telemetry.worldSubmittedAt = performance.now();
          world = compile([scene]);
          telemetry.worldMaterials = world.materials.size;
          telemetry.worldPrograms = world.programs.size;
          poll(world, false);
        }
        // Opened sessions draw before admission; observe as soon as a world exists.
        // Working if those DoubleSide draws never invalidate the compiled world.
        observeDoubleSideDraws();
        if (!world?.ready || failed) return false;
        if (!trucks) {
          const fullTrucks = ['shipping-truck', 'receiving-truck'].flatMap((name) => {
            const full = scene.getObjectByName(name)?.getObjectByName('truck-full-detail');
            return full ? [full] : [];
          });
          if (fullTrucks.length && truckDeadline === undefined) {
            truckDeadline = performance.now() + 15000;
            deadlineTimer = setTimeout(() => {
              if (!trucks?.ready) fail(new Error('Truck shader preparation timed out'));
            }, 15000);
          }
          checkTruckDeadline();
          trucks = compile(fullTrucks, true);
          // Only compiler-owned shared materials advance during these submissions.
          // Their actual variants are checked by the truck poll too.
          for (const [material, config] of trucks.materials)
            if (world.materials.has(material)) world.materials.set(material, config);
          poll(trucks, true);
        }
        const admitted = valid();
        if (admitted) observeDoubleSideDraws();
        return admitted;
      } catch (error) {
        fail(error);
        return false;
      }
    };
    const unregister = registerStartupDrawOwner({ prepare, fail });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      unregister();
      retireObservers();
      if (scene.userData.startupPreparation === telemetry) {
        if (previousTelemetry === undefined) delete scene.userData.startupPreparation;
        else scene.userData.startupPreparation = previousTelemetry;
      }
      finishTask();
      preparationGuardRef.current = () => false;
    };
  }, [renderer, scene, mainCamera]);
  useFrame(
    ({ gl }) => {
      const startup = getStartupSnapshot();
      if (startup.ready) return;
      const data = document.documentElement.dataset;
      const serial = getStartupDrawSerial();
      const completedDraw = serial > lastDrawRef.current;
      lastDrawRef.current = serial;
      const prerequisitesReady = (): boolean =>
        data.millosWorldReady === 'true' &&
        data.millosStaticBatchesPending === '0' &&
        getStartupSnapshot().pendingAssets === 0 &&
        getStartupSnapshot().pendingTasks === 0 &&
        getStartupSnapshot().errors === 0 &&
        preparationGuardRef.current() &&
        document.visibilityState !== 'hidden' &&
        !gl.getContext().isContextLost();
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
          prerequisitesReady: completedDraw && prerequisitesReady(),
          revision: frameRevision,
        })
      ) {
        markStartupReady();
        retireObserversRef.current();
      } else {
        markStartupPrepared(
          windowRef.current.prepared,
          () =>
            prerequisitesReady() &&
            revision() === frameRevision &&
            useGraphicsStore.getState().graphics === graphics
        );
      }
      if (!isPostProcessingActive(graphics)) {
        drawStartupFrame(null, () => {
          renderer.render(scene, mainCamera);
          if (renderer.getContext().isContextLost())
            throw new Error('Context lost during startup draw');
        });
      }
    },
    ready ? -999 : 1
  );
  return null;
}
