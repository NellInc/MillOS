// @vitest-environment node
import { Buffer } from 'node:buffer';
import { afterEach, expect, test, vi } from 'vitest';
import { encodeRGB } from '../refine-authored-png.mjs';
import { inspectWorldPresentation, observeCompletedWorldFrame } from './world-presentation.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
