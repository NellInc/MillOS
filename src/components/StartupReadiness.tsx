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
  setStartupDeferredShaders,
  setStartupSettleFrames,
  setStartupShaderProgress,
  StartupFrameWindow,
  subscribeStartup,
} from '../utils/startupReadiness';
import { isPostProcessingActive, useGraphicsStore } from '../stores/graphicsStore';

/** Visible time one truck prewarm attempt may hold the cover before it is deferred. */
const TRUCK_PREPARATION_WINDOW_MS = 15000;

/** CPU ticks remain live while the actual callers withhold unfinished world draws. */
export function StartupReadiness(): null {
  const windowRef = useRef(new StartupFrameWindow());
  const lastDrawRef = useRef(getStartupDrawSerial());
  const preparationGuardRef = useRef<() => boolean>(() => false);
  // Strict readiness certifies prepared trucks; a deferred prewarm admits only
  // the explicit slow-device open. Working if a deferred truck never marks ready.
  const trucksPreparedRef = useRef<() => boolean>(() => false);
  const retireObserversRef = useRef<() => void>(() => {});
  const ready = useSyncExternalStore(subscribeStartup, () => getStartupSnapshot().ready);
  const { gl: renderer, scene, camera: mainCamera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
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
      /** Outlived its window: released the cover's barrier, still polled. */
      deferred?: boolean;
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
      showDeferred(false);
      beginTask();
      finishTask(true);
      console.error('Startup shader preparation failed', error);
    };
    // The truck window measures the current attempt in visible time: it is
    // re-armed for every attempt, dropped on invalidation and while the tab is
    // hidden, and on expiry the attempt is deferred, never failed. Deferral
    // releases the cover's barrier so the loaded scene can be opened; the
    // compile keeps being polled and a late finish still certifies readiness.
    // Working if a slow compile ends with "Open loaded scene", never Reload.
    let deferredShown = false;
    const showDeferred = (deferred: boolean) => {
      if (deferredShown === deferred) return;
      deferredShown = deferred;
      setStartupDeferredShaders(deferred);
    };
    const disarmTruckWindow = () => {
      clearTimeout(deadlineTimer);
      deadlineTimer = undefined;
    };
    const deferTrucks = () => {
      deadlineTimer = undefined;
      if (cancelled || failed || !trucks || trucks.ready || trucks.deferred) return;
      trucks.deferred = true;
      finishTask();
      showDeferred(true);
      console.warn('Truck shader preparation is slow; the loaded scene can be opened');
    };
    const armTruckWindow = () => {
      disarmTruckWindow();
      if (document.visibilityState === 'hidden') return;
      deadlineTimer = setTimeout(deferTrucks, TRUCK_PREPARATION_WINDOW_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') disarmTruckWindow();
      else if (trucks && !trucks.ready && !trucks.deferred) armTruckWindow();
    };
    document.addEventListener('visibilitychange', onVisibility);
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
      disarmTruckWindow();
      showDeferred(false);
      world = undefined;
      trucks = undefined;
      setStartupShaderProgress(0, 0);
      beginTask();
    };
    const valid = (): boolean => {
      if (cancelled || failed) return false;
      try {
        if ((world && !current(world)) || (trucks && !current(trucks))) {
          invalidate();
          return false;
        }
        return !!world?.ready && (!!trucks?.ready || !!trucks?.deferred);
      } catch (error) {
        fail(error);
        return false;
      }
    };
    preparationGuardRef.current = valid;
    trucksPreparedRef.current = () => !!trucks?.ready;
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
    // Loading-bar counts: programs linked of those submitted, world then trucks.
    const remainingBy = new Map<Configuration, Set<PreparedProgram>>();
    const reportShaders = () => {
      let total = 0;
      let linked = 0;
      for (const configuration of [world, trucks]) {
        if (!configuration) continue;
        total += configuration.programs.size;
        linked +=
          configuration.programs.size -
          (configuration.ready ? 0 : (remainingBy.get(configuration)?.size ?? 0));
      }
      setStartupShaderProgress(linked, total);
    };
    const poll = (configuration: Configuration, truck: boolean) => {
      const remaining = new Set(configuration.programs);
      remainingBy.set(configuration, remaining);
      const check = () => {
        if (cancelled || failed || (truck ? trucks : world) !== configuration) return;
        try {
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
          }
          reportShaders();
          if (!remaining.size) {
            configuration.ready = true;
            // A succeeded attempt retires its window, so a later re-preparation
            // gets a fresh one; a deferred one that finishes late certifies too.
            if (truck) {
              disarmTruckWindow();
              finishTask();
              showDeferred(false);
            } else telemetry.worldCompletedAt = performance.now();
          } else timer = setTimeout(check, configuration.deferred ? 250 : 10);
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
          trucks = compile(fullTrucks, true);
          if (trucks.programs.size > 0) armTruckWindow();
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
      document.removeEventListener('visibilitychange', onVisibility);
      showDeferred(false);
      unregister();
      retireObservers();
      if (scene.userData.startupPreparation === telemetry) {
        if (previousTelemetry === undefined) delete scene.userData.startupPreparation;
        else scene.userData.startupPreparation = previousTelemetry;
      }
      finishTask();
      preparationGuardRef.current = () => false;
      trucksPreparedRef.current = () => false;
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
        }) &&
        trucksPreparedRef.current()
      ) {
        markStartupReady();
        retireObserversRef.current();
      } else {
        setStartupSettleFrames(windowRef.current.onTime);
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
