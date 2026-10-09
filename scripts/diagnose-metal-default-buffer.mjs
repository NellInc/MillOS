// Reduced backend diagnostic, never an alternative MillOS acceptance image.
// Working if ordinary WebGL2 clear/draw/readback survives resize and a target
// round trip on the same sandboxed Metal backend, or retains the failing phase.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { acquireCaptureLock } from './lib/capture-lock.mjs';
import {
  assertHostedMetalCompositor,
  assertMetalBrowserAdmission,
} from './lib/metal-browser-admission.mjs';

const argument = (key) =>
  process.argv
    .find((value) => value.startsWith(`--${key}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const softwareCompositor = process.argv.includes('--software-compositor');
const executablePath = argument('executable-path');
const output = path.resolve(argument('output') ?? 'test-results/jev-browser/default-buffer');
if (softwareCompositor)
  assertHostedMetalCompositor({
    metalRenderer: true,
    softwareRenderer: false,
    localMetalDist: executablePath,
    platform: process.platform,
    githubActions: process.env.GITHUB_ACTIONS,
  });
assert.equal(process.platform, 'darwin', 'Reduced Metal diagnostic requires macOS');
const lock = await acquireCaptureLock('metal-default-buffer-diagnostic');
const report = {
  diagnosticOnly: true,
  scope: 'Bare WebGL2, no MillOS world or acceptance substitute',
  source: process.env.GITHUB_SHA ?? null,
  scriptSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  softwareCompositor,
  startedAt: new Date().toISOString(),
  pageErrors: [],
  consoleErrors: [],
};
let browser;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    headless: true,
    chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
    args: [
      '--mute-audio',
      '--enable-gpu',
      '--use-gl=angle',
      '--use-angle=metal',
      ...(softwareCompositor ? ['--disable-gpu-compositing'] : []),
    ],
  });
  const cdp = await browser.newBrowserCDPSession();
  report.browserVersion = browser.version();
  report.arguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments;
  report.gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
  await cdp.detach();
  assert.ok(
    !report.arguments.some((value) =>
      [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-seccomp-filter-sandbox',
        '--enable-unsafe-swiftshader',
      ].includes(value)
    )
  );
  assertMetalBrowserAdmission(report.gpu, report.arguments, softwareCompositor);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  await page.setContent(
    '<!doctype html><style>html,body{margin:0}canvas{width:320px;height:240px;display:block}</style><canvas width="160" height="120"></canvas>'
  );
  report.frames = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw Error('Bare WebGL2 context unavailable');
    const shader = (type, source) => {
      const value = gl.createShader(type);
      gl.shaderSource(value, source);
      gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(value));
      return value;
    };
    const vertex = shader(
      gl.VERTEX_SHADER,
      '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}'
    );
    const fragment = shader(
      gl.FRAGMENT_SHADER,
      '#version 300 es\nprecision highp float;out vec4 colour;void main(){colour=vec4(0.2,0.7,0.4,1.0);}'
    );
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program));
    const read = () => {
      const samples = [];
      for (const [x, y] of [
        [0.15, 0.15],
        [0.5, 0.5],
        [0.85, 0.85],
      ]) {
        const bytes = new Uint8Array([251, 7, 239, 113]);
        gl.readPixels(
          Math.floor(x * gl.drawingBufferWidth),
          Math.floor(y * gl.drawingBufferHeight),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bytes
        );
        samples.push({ rgba: [...bytes], error: gl.getError() });
      }
      return samples;
    };
    const frames = [],
      framebuffer = gl.createFramebuffer(),
      texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error('Bare target incomplete');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (const phase of ['initial', 'resized', 'target-round-trip']) {
      if (phase === 'resized') {
        canvas.width = 720;
        canvas.height = 500;
        canvas.style.width = '1440px';
        canvas.style.height = '1000px';
      }
      await new Promise((resolve) =>
        requestAnimationFrame(() => {
          if (phase === 'target-round-trip') {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.viewport(0, 0, 64, 64);
            gl.clearColor(0, 0, 1, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          }
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.clearColor(0.44, 0.68, 0.85, 1);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          const clearSamples = read();
          gl.useProgram(program);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          frames.push({
            phase,
            attributes: gl.getContextAttributes(),
            drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            defaultRead: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) === null,
            defaultDraw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === null,
            readBuffer: gl.getParameter(gl.READ_BUFFER),
            framebufferStatus: gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER),
            contextLost: gl.isContextLost(),
            clearSamples,
            triangleSamples: read(),
          });
          resolve();
        })
      );
    }
    // Keep the ordinary animation running for the independently retained image.
    const render = () => {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    return frames;
  });
  await page.screenshot({ path: path.join(output, 'triangle.png') });
  for (const frame of report.frames) {
    assert.equal(frame.contextLost, false);
    assert.equal(frame.defaultRead, true);
    assert.equal(frame.defaultDraw, true);
    assert.equal(frame.readBuffer, 1029);
    assert.equal(frame.framebufferStatus, 36053);
    for (const [kind, expected] of [
      ['clearSamples', [112, 173, 217, 255]],
      ['triangleSamples', [51, 179, 102, 255]],
    ]) {
      for (const sample of frame[kind]) {
        assert.equal(sample.error, 0);
        assert.ok(
          sample.rgba.every((value, index) => Math.abs(value - expected[index]) <= 1),
          `${frame.phase}/${kind}: ${sample.rgba}`
        );
      }
    }
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = String(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  await lock.release();
  console.log(
    JSON.stringify({
      diagnosticOnly: true,
      passed: report.passed,
      error: report.error ?? null,
      output,
    })
  );
}
