// @vitest-environment node
import { Buffer } from 'node:buffer';
import { afterEach, expect, test, vi } from 'vitest';
import { encodeRGB } from '../refine-authored-png.mjs';
import {
  contrastFailedDefaultBuffer,
  inspectWorldPresentation,
  installColdRenderAttribution,
  observeCompletedWorldFrame,
} from './world-presentation.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function coldRenderFixture() {
  let clock = 0;
  let active = null;
  let disjoint = false;
  let available = false;
  const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const gl = {
    CURRENT_QUERY: 3,
    QUERY_RESULT_AVAILABLE: 4,
    QUERY_RESULT: 5,
    getExtension: () => extension,
    getParameter: () => disjoint,
    getQuery: () => active,
    getQueryParameter: (_query, property) => (property === 4 ? available : 2_500_000),
    createQuery: () => ({}),
    beginQuery: vi.fn((_target, query) => {
      active = query;
    }),
    endQuery: vi.fn(() => {
      active = null;
    }),
    deleteQuery: vi.fn(),
  };
  const canvas = {};
  const devtools = new EventTarget();
  const window = { __THREE_DEVTOOLS__: devtools };
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', { querySelector: () => canvas });
  vi.stubGlobal('performance', { timeOrigin: 1700, now: () => clock });
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    getContext: () => gl,
    getRenderTarget: () => null,
    info: { render: { calls: 1 }, programs: [] },
    render: vi.fn(function () {
      clock += 20;
      return this;
    }),
  };
  const original = renderer.render;
  installColdRenderAttribution();
  const event = new Event('observe');
  event.detail = renderer;
  devtools.dispatchEvent(event);
  return {
    renderer,
    original,
    gl,
    window,
    setDisjoint: () => {
      disjoint = true;
    },
    setAvailable: () => {
      available = true;
    },
  };
}

test('cold attribution forwards original arguments/receiver and restores only its own render hook', () => {
  const { renderer, original, window, gl } = coldRenderFixture();
  const scene = { uuid: 'world', type: 'Scene', children: [] };
  const camera = { uuid: 'camera' };
  expect(renderer.render(scene, camera, 'extra')).toBe(renderer);
  expect(original).toHaveBeenCalledExactlyOnceWith(scene, camera, 'extra');
  const receipt = window.jevColdRenderAttribution.finish();
  expect(renderer.render).toBe(original);
  expect(receipt.rows[0]).toMatchObject({
    cpuMs: 20,
    gpuStatus: 'unresolved',
    scene: { uuid: 'world' },
  });
  expect(receipt.rows[0]).not.toHaveProperty('gpuMs');
  expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
});

test('cold attribution accepts available GPU results but leaves disjoint queries unassigned', () => {
  const valid = coldRenderFixture();
  valid.renderer.render({ uuid: 'first' }, {});
  valid.setAvailable();
  expect(valid.window.jevColdRenderAttribution.finish().rows[0]).toMatchObject({
    gpuStatus: 'valid',
    gpuMs: 2.5,
  });
  const invalid = coldRenderFixture();
  invalid.renderer.render({ uuid: 'second' }, {});
  invalid.setDisjoint();
  const row = invalid.window.jevColdRenderAttribution.finish().rows[0];
  expect(row.gpuStatus).toBe('disjoint');
  expect(row).not.toHaveProperty('gpuMs');
});

test('the same camera in a new cold pose is retained after the initial record limit', () => {
  const { renderer, window } = coldRenderFixture();
  let x = 0;
  const scene = { uuid: 'world' };
  const camera = { uuid: 'camera', position: { toArray: () => [x, 0, 0] } };
  for (let index = 0; index < 520; index++) renderer.render(scene, camera);
  x = 100;
  renderer.render(scene, camera);
  const receipt = window.jevColdRenderAttribution.finish();
  expect(receipt.rows).toHaveLength(512);
  expect(receipt.droppedRows).toBeGreaterThan(0);
  expect(receipt.rows.find((row) => row.camera.position[0] === 100)).toMatchObject({ first: true });
});

test('cold cleanup preserves later render owners and diagnostics cannot mask an original exception', () => {
  const { renderer, window, gl } = coldRenderFixture();
  const retainedHook = renderer.render;
  renderer.render = vi.fn((...args) => retainedHook.apply(renderer, args));
  const later = renderer.render;
  gl.getParameter = () => {
    throw new Error('diagnostic query failed');
  };
  renderer.render({}, {});
  const receipt = window.jevColdRenderAttribution.finish();
  expect(renderer.render).toBe(later);
  expect(receipt.errors).toContain('diagnostic query failed');
  // The renderer's original implementation is captured at observation time.
  const devtools = window.__THREE_DEVTOOLS__;
  const throwing = {
    ...renderer,
    render: () => {
      throw new Error('original render failed');
    },
  };
  installColdRenderAttribution();
  const event = new Event('observe');
  event.detail = throwing;
  devtools.dispatchEvent(event);
  expect(() => throwing.render({}, {})).toThrow('original render failed');
  window.jevColdRenderAttribution.finish();
});

function frame(world = false) {
  const raw = Buffer.alloc(1440 * 1000 * 3);
  for (let y = 0; y < 1000; y++) {
    for (let x = 0; x < 1440; x++) {
      const index = (y * 1440 + x) * 3;
      const hud = y < 120 || y > 780 || x > 1056;
      const value = hud || world ? (x * 13 + y * 7) % 256 : 8;
      raw.fill(value, index, index + 3);
    }
  }
  return raw;
}

test('a blank world fails even when the header, dock and panel contain detail', () => {
  const result = inspectWorldPresentation(encodeRGB(frame(), 1440, 1000));
  expect(result.variedPixels).toBe(0);
  expect(result.passed).toBe(false);
});

test('visible scene detail passes the blank-frame guard', () => {
  expect(inspectWorldPresentation(encodeRGB(frame(true), 1440, 1000)).passed).toBe(true);
});

test('one stray scene pixel cannot admit an otherwise blank frame', () => {
  const raw = frame();
  raw.fill(255, (200 * 1440 + 200) * 3, (200 * 1440 + 200) * 3 + 3);
  const result = inspectWorldPresentation(encodeRGB(raw, 1440, 1000));
  expect(result.variedPixels).toBe(1);
  expect(result.passed).toBe(false);
});

test('a different viewport cannot move the HUD into the scene crop', () => {
  expect(() => inspectWorldPresentation(encodeRGB(Buffer.alloc(390 * 844 * 3), 390, 844))).toThrow(
    'World presentation requires its authored viewport'
  );
});

function completedFrameFixture() {
  const canvas = {
    width: 720,
    height: 500,
    tagName: 'CANVAS',
    id: '',
    isConnected: true,
    parentElement: null,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 1440, height: 1000 }),
  };
  const gl = {
    FRAMEBUFFER_BINDING: 1,
    VIEWPORT: 2,
    RGBA: 3,
    UNSIGNED_BYTE: 4,
    DRAW_FRAMEBUFFER_BINDING: 5,
    READ_FRAMEBUFFER_BINDING: 6,
    READ_BUFFER: 7,
    READ_FRAMEBUFFER: 8,
    FRAMEBUFFER_COMPLETE: 9,
    PIXEL_PACK_BUFFER_BINDING: 10,
    PACK_ALIGNMENT: 11,
    PACK_ROW_LENGTH: 12,
    PACK_SKIP_PIXELS: 13,
    PACK_SKIP_ROWS: 14,
    COLOR_WRITEMASK: 15,
    COLOR_CLEAR_VALUE: 16,
    SCISSOR_TEST: 17,
    SCISSOR_BOX: 18,
    DRAW_BUFFER0: 19,
    RASTERIZER_DISCARD: 20,
    BACK: 1029,
    NO_ERROR: 0,
    drawingBufferWidth: 720,
    drawingBufferHeight: 500,
    getParameter: vi.fn(
      (key) =>
        ({
          1: null,
          2: [0, 0, 720, 500],
          5: null,
          6: null,
          7: 1029,
          10: null,
          11: 4,
          12: 0,
          13: 0,
          14: 0,
          15: [true, true, true, true],
          16: [0.3, 0.4, 0.5, 1],
          18: [0, 0, 720, 500],
          19: 1029,
        })[key]
    ),
    isEnabled: vi.fn(() => false),
    getError: vi.fn(() => 0),
    checkFramebufferStatus: vi.fn(() => 9),
    isContextLost: () => false,
    readPixels: vi.fn((x, y, _width, _height, _format, _type, bytes) =>
      bytes.set([x % 256, y % 256, 40, 255])
    ),
  };
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    getContext: () => gl,
    getRenderTarget: () => null,
    render: vi.fn(),
    clear: vi.fn(function () {
      return this;
    }),
    renderLists: { get: vi.fn(() => ({ opaque: [], transmissive: [], transparent: [] })) },
    getClearColor: (target) => target.copy({ r: 0.3, g: 0.4, b: 0.5 }),
    getClearAlpha: () => 1,
    autoClear: true,
    autoClearColor: true,
  };
  const previous = vi.fn();
  const scene = {
    isScene: true,
    uuid: 'actual-scene',
    onAfterRender: previous,
    onBeforeRender: vi.fn(),
    background: { isColor: true, toArray: () => [0.3, 0.4, 0.5] },
  };
  const camera = {
    position: { toArray: () => [1, 2, 3] },
    quaternion: { toArray: () => [0, 0, 0, 1] },
    projectionMatrix: { toArray: () => [1, 0, 0, 1] },
    matrixWorldInverse: { toArray: () => [1, 0, 0, 1] },
    near: 0.5,
    far: 300,
    layers: { mask: 1 },
  };
  vi.stubGlobal('window', { jevObservedThree: [renderer, scene] });
  vi.stubGlobal('document', {
    querySelector: () => canvas,
    querySelectorAll: (selector) => (selector === '*' ? [] : [canvas]),
  });
  vi.stubGlobal('getComputedStyle', () => ({
    display: 'block',
    visibility: 'visible',
    opacity: '1',
  }));
  return { canvas, gl, renderer, scene, previous, camera };
}

test('samples only the ordinary completed frame and restores the previous callback', async () => {
  const f = completedFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(f.gl.readPixels).not.toHaveBeenCalled();
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(f.previous).toHaveBeenCalledWith(f.renderer, f.scene, f.camera);
  expect(result.identity.rendererMatchesCanvas).toBe(true);
  expect(result.observed).toBe(true);
  expect(result.samples).toHaveLength(9);
  expect(result.samples.every((sample) => sample.rgba[3] === 255)).toBe(true);
  expect(f.scene.onAfterRender).toBe(f.previous);
});

test('ignores other renderers and offscreen passes before the canvas completes', async () => {
  const f = completedFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender({}, f.scene, f.camera);
  f.renderer.getRenderTarget = () => ({});
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  expect(f.gl.readPixels).not.toHaveBeenCalled();
  f.renderer.getRenderTarget = () => null;
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  expect((await observation).observed).toBe(true);
});

test('a missing completed frame times out and restores its callback without rendering', async () => {
  vi.useFakeTimers();
  const f = completedFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await observation).observed).toBe(false);
  expect(f.scene.onAfterRender).toBe(f.previous);
  expect(f.renderer.render).not.toHaveBeenCalled();
  expect(f.gl.readPixels).not.toHaveBeenCalled();
});

test('diagnostic cleanup leaves a subsequently installed callback untouched', async () => {
  vi.useFakeTimers();
  const f = completedFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  const newer = vi.fn();
  f.scene.onAfterRender = newer;
  await vi.advanceTimersByTimeAsync(1000);
  await observation;
  expect(f.scene.onAfterRender).toBe(newer);
});

test('missing renderer observations stay an explicit diagnostic failure', () => {
  completedFrameFixture();
  window.jevObservedThree = [];
  expect(observeCompletedWorldFrame(1000)).toMatchObject({
    observed: false,
    reason: 'Actual renderer/scene observation unavailable',
    identity: { rendererMatchesCanvas: false },
  });
});

test('records a painted pointer-events-none cover instead of relying on hit testing', async () => {
  const f = completedFrameFixture();
  const cover = {
    ...f.canvas,
    tagName: 'DIV',
    id: 'cover',
    contains: () => false,
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      width: 1440,
      height: 1000,
      left: 0,
      right: 1440,
      top: 0,
      bottom: 1000,
    }),
  };
  document.querySelectorAll = (selector) => (selector === '*' ? [cover] : [f.canvas]);
  vi.stubGlobal('getComputedStyle', () => ({
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    backgroundColor: 'rgb(2, 6, 24)',
    pointerEvents: 'none',
  }));
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  expect((await observation).identity.covers).toMatchObject([
    { id: 'cover', paint: { pointerEvents: 'none' } },
  ]);
});

test('readback errors restore callbacks and remain diagnostic failures', async () => {
  const f = completedFrameFixture();
  f.gl.readPixels.mockImplementation(() => {
    throw new Error('Readback unavailable');
  });
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  expect(await observation).toMatchObject({ observed: false, reason: 'Readback unavailable' });
  expect(f.scene.onAfterRender).toBe(f.previous);
});

test('untouched sentinel bytes stay distinct from genuine transparent-zero reads', async () => {
  const f = completedFrameFixture();
  f.gl.readPixels.mockImplementation(() => {});
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.samples.every((sample) => !sample.sentinelOverwritten)).toBe(true);
  expect(result.samples[0].rgba).toEqual([251, 7, 239, 113]);
  expect(result.readState.defaultReadFramebuffer).toBe(true);
  expect(result.preExistingErrors.codes).toEqual([]);
});

test('valid transparent-zero samples overwrite the sentinel without GL errors', async () => {
  const f = completedFrameFixture();
  f.gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, bytes) => bytes.fill(0));
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.samples.every((sample) => sample.sentinelOverwritten)).toBe(true);
  expect(result.samples[0]).toMatchObject({ rgba: [0, 0, 0, 0], readErrors: { codes: [] } });
});

test('invalid reads retain the sentinel and their GL error codes', async () => {
  const f = completedFrameFixture();
  f.gl.readPixels.mockImplementation(() => {
    f.gl.getError.mockReturnValueOnce(1282).mockReturnValueOnce(0);
  });
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.samples.every((sample) => !sample.sentinelOverwritten)).toBe(true);
  expect(result.samples.every((sample) => sample.readErrors.codes[0] === 1282)).toBe(true);
});

test('read framebuffer and pre-existing GL errors are recorded without resetting state', async () => {
  const f = completedFrameFixture();
  const getParameter = f.gl.getParameter.getMockImplementation();
  f.gl.getParameter.mockImplementation((key) => (key === 6 ? {} : getParameter(key)));
  f.gl.getError.mockReturnValueOnce(1282).mockReturnValueOnce(0);
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.defaultFramebuffer).toBe(false);
  expect(result.readState.defaultDrawFramebuffer).toBe(true);
  expect(result.readState.defaultReadFramebuffer).toBe(false);
  expect(result.preExistingErrors.codes).toEqual([1282]);
  expect(f.scene.onAfterRender).toBe(f.previous);
});

function opaqueFrameFixture() {
  const f = completedFrameFixture();
  const previous = vi.fn();
  const object = {
    isMesh: true,
    uuid: 'submitted-mesh',
    name: 'mill-wall',
    type: 'Mesh',
    onAfterRender: previous,
  };
  const material = {
    uuid: 'wall-material',
    type: 'MeshStandardMaterial',
    transparent: false,
    colorWrite: true,
    depthTest: true,
    depthWrite: true,
  };
  f.renderer.renderLists.get.mockReturnValue({
    opaque: [{ object, material }],
    transmissive: [],
    transparent: [],
  });
  return { ...f, object, material, objectPrevious: previous };
}

test('retains opaque draw pixels separately from a subsequently cleared completed frame', async () => {
  const f = opaqueFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  f.object.onAfterRender(f.renderer, f.scene, f.camera, {}, f.material);
  f.gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, bytes) => bytes.fill(0));
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.submittedOpaque.samples.every((sample) => sample.rgba[3] === 255)).toBe(true);
  expect(result.samples.every((sample) => sample.rgba[3] === 0)).toBe(true);
  expect(result.submittedOpaque.object.uuid).toBe('submitted-mesh');
  expect(result.sceneState.renderListCounts.opaque).toBe(1);
  expect(f.object.onAfterRender).toBe(f.objectPrevious);
  expect(f.objectPrevious).toHaveBeenCalledWith(f.renderer, f.scene, f.camera, {}, f.material);
  expect(f.renderer.render).not.toHaveBeenCalled();
});

test('preserves draw-time masks and scissor separately from scene-end reset state', async () => {
  const f = opaqueFrameFixture();
  const original = f.gl.getParameter.getMockImplementation();
  f.gl.getParameter.mockImplementation((key) =>
    key === f.gl.COLOR_WRITEMASK ? [false, false, false, false] : original(key)
  );
  f.gl.isEnabled.mockReturnValue(true);
  const observation = observeCompletedWorldFrame(1000);
  f.object.onAfterRender(f.renderer, f.scene, f.camera, {}, f.material);
  f.gl.getParameter.mockImplementation(original);
  f.gl.isEnabled.mockReturnValue(false);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.submittedOpaque.drawState).toMatchObject({
    colorMask: [false, false, false, false],
    scissorTest: true,
  });
  expect(result.drawState).toMatchObject({
    colorMask: [true, true, true, true],
    scissorTest: false,
    drawBuffer: 1029,
  });
  expect(result.rendererState).toMatchObject({
    clearColor: [0.3, 0.4, 0.5],
    clearAlpha: 1,
    autoClear: true,
  });
  expect(result.camera).toMatchObject({
    projection: [1, 0, 0, 1],
    worldInverse: [1, 0, 0, 1],
    layers: 1,
  });
});

test('empty submission stays explicit instead of treating scene-end counters as opaque proof', async () => {
  const f = completedFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.submittedOpaque).toBeNull();
  expect(result.sceneState.renderListCounts).toEqual({
    opaque: 0,
    transmissive: 0,
    transparent: 0,
  });
});

test('an offscreen object cannot provide default-buffer proof and timeout restores both hooks', async () => {
  vi.useFakeTimers();
  const f = opaqueFrameFixture();
  const observation = observeCompletedWorldFrame(1000);
  f.renderer.getRenderTarget = () => ({});
  f.object.onAfterRender(f.renderer, f.scene, f.camera, {}, f.material);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await observation).submittedOpaque).toBeNull();
  expect(f.gl.readPixels).not.toHaveBeenCalled();
  expect(f.object.onAfterRender).toBe(f.objectPrevious);
  expect(f.scene.onAfterRender).toBe(f.previous);
});

test('one mesh shared by two observed scenes restores its original callback', async () => {
  const f = opaqueFrameFixture();
  const otherScene = { ...f.scene, uuid: 'other-scene', onAfterRender: vi.fn() };
  window.jevObservedThree.push(otherScene);
  const observation = observeCompletedWorldFrame(1000);
  f.object.onAfterRender(f.renderer, f.scene, f.camera, {}, f.material);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  await observation;
  expect(f.object.onAfterRender).toBe(f.objectPrevious);
  expect(f.objectPrevious).toHaveBeenCalledOnce();
});

test('observes a natural colour clear before a zero opaque draw, forwarding it exactly once', async () => {
  const f = opaqueFrameFixture();
  const clear = f.renderer.clear;
  const before = f.scene.onBeforeRender;
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onBeforeRender(f.renderer, f.scene, f.camera);
  expect(f.renderer.clear(true, false, undefined)).toBe(f.renderer);
  expect(clear).toHaveBeenCalledExactlyOnceWith(true, false, undefined);
  expect(f.gl.readPixels).toHaveBeenCalledTimes(9);
  f.gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, bytes) => bytes.fill(0));
  f.object.onAfterRender(f.renderer, f.scene, f.camera, {}, f.material);
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  const result = await observation;
  expect(result.naturalClear.arguments).toEqual([true, false, 'undefined']);
  expect(result.naturalClear.before.samples).toEqual([]);
  expect(result.naturalClear.after.samples.every((sample) => sample.rgba[3] === 255)).toBe(true);
  expect(result.submittedOpaque.samples.every((sample) => sample.rgba[3] === 0)).toBe(true);
  expect(result.naturalClear.after.drawState.rasterizerDiscard).toBe(false);
  expect(result.naturalClear.receiverMatchesRenderer).toBe(true);
  expect(f.renderer.clear).toBe(clear);
  expect(f.scene.onBeforeRender).toBe(before);
  expect(before).toHaveBeenCalledExactlyOnceWith(f.renderer, f.scene, f.camera);
  expect(f.renderer.render).not.toHaveBeenCalled();
});

test('ignores offscreen and depth-only clears while preserving each call and return value', async () => {
  const f = completedFrameFixture();
  const clear = f.renderer.clear;
  const observation = observeCompletedWorldFrame(1000);
  f.scene.onBeforeRender(f.renderer, f.scene, f.camera);
  f.renderer.getRenderTarget = () => ({});
  expect(f.renderer.clear()).toBe(f.renderer);
  f.renderer.getRenderTarget = () => null;
  expect(f.renderer.clear(false, true, false)).toBe(f.renderer);
  expect(f.gl.readPixels).not.toHaveBeenCalled();
  f.scene.onAfterRender(f.renderer, f.scene, f.camera);
  expect((await observation).naturalClear).toBeNull();
  expect(clear.mock.calls).toEqual([[], [false, true, false]]);
});

test('timeout restores the clear and before-frame hooks without replacing later owners', async () => {
  vi.useFakeTimers();
  const f = completedFrameFixture();
  const before = f.scene.onBeforeRender;
  const newerClear = vi.fn();
  const observation = observeCompletedWorldFrame(1000);
  f.renderer.clear = newerClear;
  await vi.advanceTimersByTimeAsync(1000);
  expect((await observation).naturalClear).toBeNull();
  expect(f.renderer.clear).toBe(newerClear);
  expect(f.scene.onBeforeRender).toBe(before);
  expect(f.gl.readPixels).not.toHaveBeenCalled();
});

// Exercise the new failure-only GL boundary using the established actual-renderer
// fixture. These tests protect restoration and read validity, not driver behaviour.
function bufferContrastFixture() {
  const f = completedFrameFixture();
  const gl = f.gl;
  const original = gl.getParameter.getMockImplementation();
  const savedRenderbuffer = { name: 'existing-renderbuffer' };
  const framebuffer = { name: 'private-framebuffer' };
  const renderbuffer = { name: 'private-renderbuffer' };
  const state = { draw: null, read: null, renderbuffer: savedRenderbuffer };
  Object.assign(gl, {
    DRAW_FRAMEBUFFER: 0x8ca9,
    FRAMEBUFFER: 0x8d40,
    RENDERBUFFER: 0x8d41,
    RENDERBUFFER_BINDING: 0x8ca7,
    COLOR_ATTACHMENT0: 0x8ce0,
    RGBA8: 0x8058,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    STENCIL_BUFFER_BIT: 0x0400,
    createFramebuffer: vi.fn(() => framebuffer),
    createRenderbuffer: vi.fn(() => renderbuffer),
    deleteFramebuffer: vi.fn(),
    deleteRenderbuffer: vi.fn(),
    renderbufferStorage: vi.fn(),
    framebufferRenderbuffer: vi.fn(),
    clear: vi.fn(),
    clearColor: vi.fn(),
    colorMask: vi.fn(),
    viewport: vi.fn(),
    scissor: vi.fn(),
    finish: vi.fn(),
    bindFramebuffer: vi.fn((target, buffer) => {
      if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) state.draw = buffer;
      if (target === gl.FRAMEBUFFER || target === gl.READ_FRAMEBUFFER) state.read = buffer;
    }),
    bindRenderbuffer: vi.fn((_target, buffer) => {
      state.renderbuffer = buffer;
    }),
  });
  gl.getParameter.mockImplementation((key) => {
    if (key === gl.DRAW_FRAMEBUFFER_BINDING) return state.draw;
    if (key === gl.READ_FRAMEBUFFER_BINDING) return state.read;
    if (key === gl.RENDERBUFFER_BINDING) return state.renderbuffer;
    if (key === gl.READ_BUFFER) return state.read ? gl.COLOR_ATTACHMENT0 : gl.BACK;
    if (key === gl.DRAW_BUFFER0) return state.draw ? gl.COLOR_ATTACHMENT0 : gl.BACK;
    return original(key);
  });
  gl.readPixels.mockImplementation((_x, _y, _w, _h, _format, _type, bytes) => {
    bytes.set(state.read ? [112, 174, 216, 255] : [0, 0, 0, 0]);
  });
  return { ...f, state, framebuffer, renderbuffer, savedRenderbuffer };
}

test('failed-context default/private/default reads retain valid zeros and restore bindings', () => {
  const f = bufferContrastFixture();
  const result = contrastFailedDefaultBuffer();
  expect(result).toMatchObject({
    diagnosticOnly: true,
    observed: true,
    validComparison: true,
    bindingsRestored: true,
  });
  expect(result.arms.map((arm) => arm.name)).toEqual([
    'default-before',
    'private-rgba8',
    'default-after',
  ]);
  expect(result.arms.map((arm) => arm.samples[0].rgba)).toEqual([
    [0, 0, 0, 0],
    [112, 174, 216, 255],
    [0, 0, 0, 0],
  ]);
  expect(f.gl.clear.mock.calls).toEqual([[17664], [17664], [17664]]);
  expect(f.state).toEqual({ draw: null, read: null, renderbuffer: f.savedRenderbuffer });
  expect(f.gl.deleteFramebuffer).toHaveBeenCalledExactlyOnceWith(f.framebuffer);
  expect(f.gl.deleteRenderbuffer).toHaveBeenCalledExactlyOnceWith(f.renderbuffer);
  for (const method of ['clearColor', 'colorMask', 'viewport', 'scissor', 'finish'])
    expect(f.gl[method]).not.toHaveBeenCalled();
  expect(f.renderer.clear).not.toHaveBeenCalled();
  expect(f.renderer.render).not.toHaveBeenCalled();
});

test('private buffer allocation failure deletes only allocated resources and keeps old bindings', () => {
  const f = bufferContrastFixture();
  f.gl.createRenderbuffer.mockReturnValue(null);
  const result = contrastFailedDefaultBuffer();
  expect(result).toMatchObject({
    observed: false,
    validComparison: false,
    bindingsRestored: true,
    error: 'Error: Diagnostic buffer allocation failed',
  });
  expect(result.arms).toHaveLength(1);
  expect(f.state).toEqual({ draw: null, read: null, renderbuffer: f.savedRenderbuffer });
  expect(f.gl.deleteFramebuffer).toHaveBeenCalledExactlyOnceWith(f.framebuffer);
  expect(f.gl.deleteRenderbuffer).not.toHaveBeenCalled();
});

test('an untouched read sentinel cannot validate the failed-context contrast', () => {
  const f = bufferContrastFixture();
  f.gl.readPixels.mockImplementation(() => {});
  const result = contrastFailedDefaultBuffer();
  expect(result).toMatchObject({ observed: true, validComparison: false, bindingsRestored: true });
  expect(
    result.arms.every((arm) => arm.samples.every((sample) => !sample.sentinelOverwritten))
  ).toBe(true);
});

test('a context already targeting an offscreen buffer is observed without correcting it', () => {
  const f = bufferContrastFixture();
  f.state.draw = f.framebuffer;
  expect(contrastFailedDefaultBuffer()).toMatchObject({
    observed: false,
    reason: 'Default live context unavailable',
  });
  expect(f.gl.clear).not.toHaveBeenCalled();
  expect(f.gl.createFramebuffer).not.toHaveBeenCalled();
  expect(f.state.draw).toBe(f.framebuffer);
});
