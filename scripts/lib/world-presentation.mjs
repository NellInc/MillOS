import assert from 'node:assert/strict';
import { decodeRGB } from '../refine-authored-png.mjs';

// Serialized before renderer construction, only in the hosted diagnostic.
// Reuse the existing timer-query pattern, without its BRDF treatment. Never
// render, flush, finish, read pixels, or change camera/material/quality state.
// Working if cold CPU spans and valid GPU queries identify actual passes,
// unresolved/disjoint timings stay unassigned, and cleanup retains later owners.
export function installColdRenderAttribution() {
  const devtools = (window.__THREE_DEVTOOLS__ ??= new EventTarget());
  const rows = [];
  const hooks = [];
  const errors = [];
  const limits = { renderers: 4, rows: 512, pendingPerRenderer: 12, queriesPerRenderer: 64 };
  let stopped = false;
  let droppedRows = 0;
  const safely = (operation) => {
    try {
      return operation();
    } catch (error) {
      if (errors.length < 16) errors.push(String(error?.message ?? error));
      return undefined;
    }
  };
  const observe = (event) => {
    const renderer = event.detail;
    if (
      stopped ||
      !renderer?.isWebGLRenderer ||
      hooks.some((hook) => hook.renderer === renderer) ||
      hooks.length >= limits.renderers
    )
      return;
    safely(() => {
      const gl = renderer.getContext();
      const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const original = renderer.render;
      const pending = [];
      const seen = new Set();
      const identity = { index: hooks.length, timerAvailable: !!extension };
      let passes = 0;
      let queries = 0;
      let disjoint = 0;
      let depth = 0;
      const poll = () => {
        if (!pending.length) return;
        const invalid = gl.getParameter(extension.GPU_DISJOINT_EXT);
        if (invalid) disjoint++;
        for (let index = pending.length - 1; index >= 0; index--) {
          const { query, row } = pending[index];
          if (!invalid && !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
          if (invalid) row.gpuStatus = 'disjoint';
          else {
            const nanos = gl.getQueryParameter(query, gl.QUERY_RESULT);
            row.gpuStatus = Number.isFinite(nanos) && nanos >= 0 ? 'valid' : 'invalid-result';
            if (row.gpuStatus === 'valid') row.gpuMs = nanos / 1e6;
          }
          gl.deleteQuery(query);
          pending.splice(index, 1);
        }
      };
      function wrapped(scene, camera) {
        if (stopped) return original.apply(this, arguments);
        const diagnosticStart = performance.now();
        let row;
        let query;
        safely(() => {
          poll();
          passes++;
          const target = this.getRenderTarget();
          const key = `${scene?.uuid}:${camera?.uuid}:${target?.uuid ?? 'canvas'}`;
          const first = !seen.has(key);
          seen.add(key);
          row = {
            renderer: identity.index,
            pass: passes,
            depth,
            first,
            scene: { uuid: scene?.uuid, name: scene?.name, type: scene?.type },
            children: scene?.children
              ?.slice(0, 12)
              .map((child) => ({ name: child.name, type: child.type })),
            camera: {
              uuid: camera?.uuid,
              type: camera?.type,
              position: camera?.position?.toArray(),
            },
            target: target
              ? { uuid: target.uuid, width: target.width, height: target.height }
              : null,
            gpuStatus: extension ? 'not-sampled' : 'unavailable',
          };
          if (
            extension &&
            (first || passes % 31 === 0) &&
            queries < limits.queriesPerRenderer &&
            pending.length < limits.pendingPerRenderer &&
            !gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
          ) {
            query = gl.createQuery();
            if (query) {
              queries++;
              gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
              row.gpuStatus =
                gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) === query
                  ? 'pending'
                  : 'not-started';
            }
          }
        });
        const startedAt = performance.now();
        depth++;
        try {
          return original.apply(this, arguments);
        } finally {
          depth--;
          const endedAt = performance.now();
          safely(() => {
            if (!row) return;
            row.startedAt = startedAt;
            row.endedAt = endedAt;
            row.cpuMs = endedAt - startedAt;
            row.instrumentationBeforeMs = startedAt - diagnosticStart;
            row.drawCounters = { ...this.info?.render };
            row.programs = this.info?.programs?.length ?? null;
            if (query) {
              if (
                row.gpuStatus === 'pending' &&
                gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) === query
              ) {
                gl.endQuery(extension.TIME_ELAPSED_EXT);
                pending.push({ query, row });
              } else {
                row.gpuStatus = 'ownership-lost';
                gl.deleteQuery(query);
              }
            }
            if (row.first || query || row.cpuMs >= 16) {
              if (rows.length < limits.rows) rows.push(row);
              else droppedRows++;
            }
          });
        }
      }
      renderer.render = wrapped;
      hooks.push({
        renderer,
        original,
        wrapped,
        pending,
        gl,
        poll,
        identity,
        counts: () => ({ passes, queries, disjoint }),
      });
    });
  };
  devtools.addEventListener('observe', observe);
  window.jevColdRenderAttribution = {
    finish() {
      stopped = true;
      devtools.removeEventListener('observe', observe);
      for (const hook of hooks) {
        if (hook.renderer.render === hook.wrapped) hook.renderer.render = hook.original;
        safely(hook.poll);
        for (const { query, row } of hook.pending) {
          row.gpuStatus = 'unresolved';
          safely(() => hook.gl.deleteQuery(query));
        }
        hook.pending.length = 0;
      }
      return {
        diagnosticOnly: true,
        timingScope:
          'renderer.render inclusive; nested passes and deferred GPU work prevent command-buffer causation claims',
        timeOrigin: performance.timeOrigin,
        finishedAt: performance.now(),
        limits,
        renderers: hooks.map((hook) => ({
          ...hook.identity,
          ...hook.counts(),
          matchesWorldCanvas:
            hook.renderer.domElement === document.querySelector('canvas[data-engine^="three.js"]'),
        })),
        rows,
        droppedRows,
        errors,
      };
    },
  };
}

// Only the validator's fixed 1440x1000 overview uses this crop. It excludes
// the header, soundtrack, dock, target control and right-hand Overview panel.
// Working if a blank canvas with a fully rendered HUD still fails presentation.
export function inspectWorldPresentation(png) {
  const { raw, width, height } = decodeRGB(png);
  assert.equal(width, 1440, 'World presentation requires its authored viewport');
  assert.equal(height, 1000, 'World presentation requires its authored viewport');
  const crop = { x: 48, y: 140, width: 902, height: 600 };
  const firstIndex = (crop.y * width + crop.x) * 3;
  const reference = [...raw.subarray(firstIndex, firstIndex + 3)];
  let variedPixels = 0;
  for (let y = crop.y; y < crop.y + crop.height; y++) {
    for (let x = crop.x; x < crop.x + crop.width; x++) {
      const index = (y * width + x) * 3;
      if (reference.some((value, channel) => Math.abs(raw[index + channel] - value) > 6)) {
        variedPixels++;
      }
    }
  }
  const pixels = crop.width * crop.height;
  const variedFraction = variedPixels / pixels;
  // Require scene-sized detail rather than one readback artefact. This is a
  // blank-frame guard, not an aesthetic score or substitute for world integrity.
  return { crop, reference, pixels, variedPixels, variedFraction, passed: variedFraction > 0.05 };
}

// Serialized into the isolated acceptance page, after its original screenshot.
// Observe only an ordinary completed frame. Never render, preserve the buffer,
// or use these diagnostic samples to admit a blank screenshot.
// Working if identity, paint covers and completed pixels distinguish failure
// boundaries, and every temporary callback is restored on completion/timeout.
export function observeCompletedWorldFrame(timeoutMs) {
  const canvas = document.querySelector('canvas[data-engine^="three.js"]');
  const objects = window.jevObservedThree ?? [];
  const renderer = objects.find((object) => object?.isWebGLRenderer);
  const scenes = [...new Set(objects.filter((object) => object?.isScene))];
  const describe = (element) => {
    const css = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      id: element.id,
      className: element.getAttribute('class'),
      connected: element.isConnected,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      paint: Object.fromEntries(
        [
          'display',
          'visibility',
          'opacity',
          'position',
          'zIndex',
          'backgroundColor',
          'backgroundImage',
          'overflow',
          'clipPath',
          'transform',
          'filter',
          'backdropFilter',
          'pointerEvents',
        ].map((key) => [key, css[key]])
      ),
    };
  };
  const ancestors = [];
  for (let element = canvas; element; element = element.parentElement) {
    ancestors.push(describe(element));
  }
  // Hit testing omits pointer-events:none covers. Record painted overlapping
  // elements too, without changing visibility or claiming an occlusion verdict.
  const covers = [...document.querySelectorAll('*')]
    .filter((element) => {
      if (element === canvas || element.contains(canvas)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.right <= 48 || rect.left >= 950 || rect.bottom <= 140 || rect.top >= 740)
        return false;
      const css = getComputedStyle(element);
      return (
        css.display !== 'none' &&
        css.visibility !== 'hidden' &&
        Number(css.opacity) > 0 &&
        (css.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          css.backgroundImage !== 'none' ||
          css.backdropFilter !== 'none')
      );
    })
    .slice(0, 64)
    .map(describe);
  const identity = {
    canvasCount: document.querySelectorAll('canvas[data-engine^="three.js"]').length,
    rendererMatchesCanvas: !!renderer && renderer.domElement === canvas,
    canvases: [...document.querySelectorAll('canvas')].map(describe),
    ancestors,
    covers,
  };
  if (!renderer || !scenes.length) {
    return { observed: false, reason: 'Actual renderer/scene observation unavailable', identity };
  }
  return new Promise((resolve) => {
    let done = false;
    let timer;
    const hooks = [];
    let submittedOpaque = null;
    let naturalClear = null;
    let activeFrame = null;
    const renderList = (scene) => renderer.renderLists?.get(scene, 0);
    const capture = (scene, camera, samplePixels = true) => {
      const gl = renderer.getContext();
      // WebGL2 has separate read/draw bindings. Retain consumed error flags;
      // never correct state or render to make a diagnostic sample look valid.
      const errors = () => {
        const codes = [];
        for (let index = 0; index < 8; index++) {
          const code = gl.getError();
          if (code === gl.NO_ERROR) break;
          codes.push(code);
        }
        return { codes, saturated: codes.length === 8 };
      };
      const preExistingErrors = errors();
      const viewport = [...gl.getParameter(gl.VIEWPORT)];
      const readState = {
        defaultDrawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === null,
        defaultReadFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === null,
        readBuffer: gl.getParameter(gl.READ_BUFFER),
        expectedDefaultReadBuffer: gl.BACK,
        framebufferStatus: gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER),
        completeStatus: gl.FRAMEBUFFER_COMPLETE,
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        pixelPackBufferBound: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null,
        packAlignment: gl.getParameter(gl.PACK_ALIGNMENT),
        packRowLength: gl.getParameter(gl.PACK_ROW_LENGTH),
        packSkipPixels: gl.getParameter(gl.PACK_SKIP_PIXELS),
        packSkipRows: gl.getParameter(gl.PACK_SKIP_ROWS),
      };
      const drawState = {
        colorMask: [...gl.getParameter(gl.COLOR_WRITEMASK)],
        clearColor: [...gl.getParameter(gl.COLOR_CLEAR_VALUE)],
        scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
        rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
        scissorBox: [...gl.getParameter(gl.SCISSOR_BOX)],
        drawBuffer: gl.getParameter(gl.DRAW_BUFFER0),
        expectedDefaultDrawBuffer: gl.BACK,
      };
      const stateQueryErrors = errors();
      const rect = canvas.getBoundingClientRect();
      const samples = [];
      for (const x of samplePixels ? [0.15, 0.5, 0.85] : []) {
        for (const y of [0.15, 0.5, 0.85]) {
          const px = Math.floor(((48 + 902 * x - rect.x) / rect.width) * canvas.width);
          const py = Math.floor((1 - (140 + 600 * y - rect.y) / rect.height) * canvas.height);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
          const rgba = new Uint8Array([251, 7, 239, 113]);
          gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
          samples.push({
            x: px,
            y: py,
            rgba: [...rgba],
            sentinelOverwritten: rgba.some((value, index) => value !== [251, 7, 239, 113][index]),
            readErrors: errors(),
          });
        }
      }
      const list = renderList(scene);
      return {
        scene: scene.uuid,
        camera: {
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray(),
          projection: camera.projectionMatrix?.toArray() ?? null,
          worldInverse: camera.matrixWorldInverse?.toArray() ?? null,
          near: camera.near,
          far: camera.far,
          fov: camera.fov,
          aspect: camera.aspect,
          layers: camera.layers?.mask,
        },
        sceneState: {
          background: scene.background?.isColor
            ? { type: 'Color', rgb: scene.background.toArray() }
            : { type: scene.background?.type ?? null },
          overrideMaterial: scene.overrideMaterial?.uuid ?? null,
          renderListDepth: 0,
          renderListCounts: list
            ? Object.fromEntries(
                ['opaque', 'transmissive', 'transparent'].map((key) => [key, list[key].length])
              )
            : null,
        },
        rendererState: {
          clearColor: renderer.getClearColor?.({ copy: (color) => [color.r, color.g, color.b] }),
          clearAlpha: renderer.getClearAlpha?.(),
          autoClear: renderer.autoClear,
          autoClearColor: renderer.autoClearColor,
          autoClearDepth: renderer.autoClearDepth,
          autoClearStencil: renderer.autoClearStencil,
          toneMapping: renderer.toneMapping,
          outputColorSpace: renderer.outputColorSpace,
        },
        defaultFramebuffer: readState.defaultDrawFramebuffer && readState.defaultReadFramebuffer,
        preExistingErrors,
        stateQueryErrors,
        readState,
        drawState,
        viewport,
        contextLost: gl.isContextLost(),
        samples,
      };
    };
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const { object, property = 'onAfterRender', previous, callback } of [
        ...hooks,
      ].reverse()) {
        if (object[property] === callback) object[property] = previous;
      }
      resolve({ ...result, identity });
    };
    if (typeof renderer.clear === 'function') {
      const previous = renderer.clear;
      const callback = function (...args) {
        let frame = null;
        let before = null;
        try {
          if (
            !done &&
            !naturalClear &&
            activeFrame &&
            (args[0] === undefined || args[0]) &&
            renderer.getRenderTarget() === null &&
            renderer.getContext().getParameter(renderer.getContext().DRAW_FRAMEBUFFER_BINDING) ===
              null
          ) {
            frame = activeFrame;
            // Query state only before forwarding. The extra post-clear read can
            // synchronise a failing backend; it is diagnostic, never a repair.
            before = capture(frame.scene, frame.camera, false);
          }
        } catch (error) {
          naturalClear = { observed: false, reason: error.message };
        }
        // Exactly the existing receiver/arguments/return value, even if a
        // diagnostic query failed. Never issue an additional clear or draw.
        const value = previous.apply(this, args);
        if (frame) {
          try {
            naturalClear = {
              observed: true,
              arguments: args.map((arg) => (arg === undefined ? 'undefined' : arg)),
              receiverMatchesRenderer: this === renderer,
              before,
              after: capture(frame.scene, frame.camera),
            };
          } catch (error) {
            naturalClear = { observed: false, reason: error.message, before };
          }
        }
        return value;
      };
      hooks.push({ object: renderer, property: 'clear', previous, callback });
      renderer.clear = callback;
    }
    for (const scene of scenes) {
      const beforePrevious = scene.onBeforeRender;
      const beforeCallback = function (...args) {
        beforePrevious?.apply(this, args);
        if (!done && args[0] === renderer) activeFrame = { scene, camera: args[2] };
      };
      hooks.push({
        object: scene,
        property: 'onBeforeRender',
        previous: beforePrevious,
        callback: beforeCallback,
      });
      scene.onBeforeRender = beforeCallback;
      // Select an actually submitted opaque item from the preceding ordinary
      // render list, rather than inferring visibility from Object3D.visible.
      const item = renderList(scene)?.opaque.find(({ object }) => object.isMesh);
      if (item) {
        const object = item.object;
        const previous = object.onAfterRender;
        const callback = function (...args) {
          previous.apply(this, args);
          if (done || submittedOpaque || args[0] !== renderer || args[1] !== scene) return;
          if (renderer.getRenderTarget() !== null) return;
          try {
            submittedOpaque = {
              object: { uuid: object.uuid, name: object.name, type: object.type },
              geometry: {
                uuid: args[3].uuid,
                vertices: args[3].attributes?.position?.count ?? null,
                indices: args[3].index?.count ?? null,
                drawRange: args[3].drawRange ?? null,
              },
              material: {
                uuid: args[4].uuid,
                type: args[4].type,
                transparent: args[4].transparent,
                colorWrite: args[4].colorWrite,
                depthTest: args[4].depthTest,
                depthWrite: args[4].depthWrite,
              },
              ...capture(scene, args[2]),
            };
          } catch (error) {
            submittedOpaque = { observed: false, reason: error.message };
          }
        };
        hooks.push({ object, previous, callback });
        object.onAfterRender = callback;
      }
      const previous = scene.onAfterRender;
      const callback = function (...args) {
        previous.apply(this, args);
        if (done || args[0] !== renderer) return;
        try {
          const gl = renderer.getContext();
          if (renderer.getRenderTarget() !== null || gl.getParameter(gl.FRAMEBUFFER_BINDING))
            return;
          finish({
            observed: true,
            diagnosticVersion: 4,
            ...capture(scene, args[2]),
            submittedOpaque,
            naturalClear,
          });
        } catch (error) {
          finish({ observed: false, reason: error.message, submittedOpaque, naturalClear });
        }
      };
      hooks.push({ object: scene, previous, callback });
      scene.onAfterRender = callback;
    }
    timer = setTimeout(
      () =>
        finish({
          observed: false,
          reason: 'No ordinary completed canvas frame before deadline',
          submittedOpaque,
          naturalClear,
        }),
      timeoutMs
    );
  });
}

// Diagnostic only, after an immutable failed world image. Never admit its pixels.
// Working if A/B/A isolates the failed context's default buffer while all touched
// bindings/resources are restored and no game render or corrective state reset runs.
export function contrastFailedDefaultBuffer() {
  const renderer = (window.jevObservedThree ?? []).find((object) => object?.isWebGLRenderer);
  if (!renderer) return { diagnosticOnly: true, observed: false, reason: 'Actual renderer absent' };
  const gl = renderer.getContext();
  const saved = {
    draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
    read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
    renderbuffer: gl.getParameter(gl.RENDERBUFFER_BINDING),
    clearColor: [...gl.getParameter(gl.COLOR_CLEAR_VALUE)],
  };
  if (saved.draw !== null || saved.read !== null || gl.isContextLost()) {
    return { diagnosticOnly: true, observed: false, reason: 'Default live context unavailable' };
  }
  const errors = () => {
    const codes = [];
    for (let index = 0; index < 8; index++) {
      const code = gl.getError();
      if (code === gl.NO_ERROR) break;
      codes.push(code);
    }
    return { codes, saturated: codes.length === 8 };
  };
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const mask = gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT;
  const report = {
    diagnosticOnly: true,
    observed: false,
    dimensions: [width, height],
    clearMask: mask,
    clearColor: saved.clearColor,
    inheritedState: {
      colorMask: [...gl.getParameter(gl.COLOR_WRITEMASK)],
      scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
      rasterizerDiscard: gl.isEnabled(gl.RASTERIZER_DISCARD),
      pixelPackBufferBound: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null,
      packAlignment: gl.getParameter(gl.PACK_ALIGNMENT),
      packRowLength: gl.getParameter(gl.PACK_ROW_LENGTH),
      packSkipPixels: gl.getParameter(gl.PACK_SKIP_PIXELS),
      packSkipRows: gl.getParameter(gl.PACK_SKIP_ROWS),
    },
    preExistingErrors: errors(),
    arms: [],
  };
  let framebuffer;
  let renderbuffer;
  const arm = (name) => {
    gl.clear(mask);
    const clearErrors = errors();
    const samples = [];
    for (const fraction of [0.15, 0.5, 0.85]) {
      const bytes = new Uint8Array([251, 7, 239, 113]);
      gl.readPixels(
        Math.floor(fraction * width),
        Math.floor(fraction * height),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes
      );
      samples.push({
        rgba: [...bytes],
        sentinelOverwritten: bytes.some((value, i) => value !== [251, 7, 239, 113][i]),
        readErrors: errors(),
      });
    }
    return {
      name,
      clearErrors,
      samples,
      framebufferComplete:
        gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
      readBuffer: gl.getParameter(gl.READ_BUFFER),
      drawBuffer: gl.getParameter(gl.DRAW_BUFFER0),
      queryErrors: errors(),
    };
  };
  try {
    report.arms.push(arm('default-before'));
    framebuffer = gl.createFramebuffer();
    renderbuffer = gl.createRenderbuffer();
    if (!framebuffer || !renderbuffer) throw Error('Diagnostic buffer allocation failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw Error('Diagnostic private framebuffer incomplete');
    }
    report.arms.push(arm('private-rgba8'));
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.draw);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.read);
    report.arms.push(arm('default-after'));
    report.observed = true;
  } catch (error) {
    report.error = String(error);
    report.failureErrors = errors();
  } finally {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.draw);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.read);
    gl.bindRenderbuffer(gl.RENDERBUFFER, saved.renderbuffer);
    // No mask/scissor/viewport/program/texture correction. Keep the renderer's
    // state cache valid by leaving actual values exactly as they were.
    if (renderbuffer) gl.deleteRenderbuffer(renderbuffer);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    report.restorationErrors = errors();
    report.bindingsRestored =
      gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === saved.draw &&
      gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === saved.read &&
      gl.getParameter(gl.RENDERBUFFER_BINDING) === saved.renderbuffer;
  }
  const clean = (value) => value?.codes.length === 0 && !value.saturated;
  // Validity concerns the read operations, not whether a clear produced colour.
  // Valid transparent-zero arms are the result this experiment must retain.
  report.validComparison =
    report.observed &&
    report.bindingsRestored &&
    !gl.isContextLost() &&
    width > 0 &&
    height > 0 &&
    clean(report.preExistingErrors) &&
    clean(report.restorationErrors) &&
    report.inheritedState.colorMask.every(Boolean) &&
    !report.inheritedState.scissorTest &&
    !report.inheritedState.rasterizerDiscard &&
    !report.inheritedState.pixelPackBufferBound &&
    report.inheritedState.packRowLength === 0 &&
    report.inheritedState.packSkipPixels === 0 &&
    report.inheritedState.packSkipRows === 0 &&
    report.arms.length === 3 &&
    report.arms.every(
      (value) =>
        value.framebufferComplete &&
        clean(value.clearErrors) &&
        clean(value.queryErrors) &&
        value.readBuffer === (value.name === 'private-rgba8' ? gl.COLOR_ATTACHMENT0 : gl.BACK) &&
        value.drawBuffer === (value.name === 'private-rgba8' ? gl.COLOR_ATTACHMENT0 : gl.BACK) &&
        value.samples.every((sample) => sample.sentinelOverwritten && clean(sample.readErrors))
    );
  return report;
}
