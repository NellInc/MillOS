import assert from 'node:assert/strict';
import { decodeRGB } from '../refine-authored-png.mjs';

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
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const { scene, previous, callback } of hooks) {
        if (scene.onAfterRender === callback) scene.onAfterRender = previous;
      }
      resolve({ ...result, identity });
    };
    for (const scene of scenes) {
      const previous = scene.onAfterRender;
      const callback = function (...args) {
        previous.apply(this, args);
        if (done || args[0] !== renderer) return;
        try {
          const gl = renderer.getContext();
          // WebGL2 has separate read/draw bindings. A zero-filled destination
          // from an invalid read says nothing about the completed scene pixels.
          // Error reads consume flags, so retain every observed code separately.
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
          if (renderer.getRenderTarget() !== null || gl.getParameter(gl.FRAMEBUFFER_BINDING))
            return;
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
          const stateQueryErrors = errors();
          const rect = canvas.getBoundingClientRect();
          const samples = [];
          for (const x of [0.15, 0.5, 0.85]) {
            for (const y of [0.15, 0.5, 0.85]) {
              const px = Math.floor(((48 + 902 * x - rect.x) / rect.width) * canvas.width);
              const py = Math.floor((1 - (140 + 600 * y - rect.y) / rect.height) * canvas.height);
              if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
              const rgba = new Uint8Array([251, 7, 239, 113]);
              gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
              const readErrors = errors();
              samples.push({
                x: px,
                y: py,
                rgba: [...rgba],
                sentinelOverwritten: rgba.some(
                  (value, index) => value !== [251, 7, 239, 113][index]
                ),
                readErrors,
              });
            }
          }
          finish({
            observed: true,
            scene: scene.uuid,
            camera: {
              position: args[2].position.toArray(),
              quaternion: args[2].quaternion.toArray(),
            },
            diagnosticVersion: 2,
            defaultFramebuffer:
              readState.defaultDrawFramebuffer && readState.defaultReadFramebuffer,
            preExistingErrors,
            stateQueryErrors,
            readState,
            viewport,
            contextLost: gl.isContextLost(),
            samples,
          });
        } catch (error) {
          finish({ observed: false, reason: error.message });
        }
      };
      hooks.push({ scene, previous, callback });
      scene.onAfterRender = callback;
    }
    timer = setTimeout(
      () =>
        finish({ observed: false, reason: 'No ordinary completed canvas frame before deadline' }),
      timeoutMs
    );
  });
}
