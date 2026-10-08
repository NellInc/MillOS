import { describe, expect, it } from 'vitest';
import {
  assertHostedMetalCompositor,
  assertMetalBrowserAdmission,
} from './metal-browser-admission.mjs';

function admission(softwareCompositor = false) {
  return {
    gpu: {
      auxAttributes: {
        glRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max)',
        sandboxed: true,
        inProcessGpu: false,
      },
      featureStatus: {
        webgl: softwareCompositor ? 'enabled_readback' : 'enabled',
        gpu_compositing: softwareCompositor ? 'disabled_software' : 'enabled',
      },
    },
    args: softwareCompositor ? ['--disable-gpu-compositing'] : [],
    softwareCompositor,
  };
}

function check({ gpu, args, softwareCompositor }) {
  assertMetalBrowserAdmission(gpu, args, softwareCompositor);
}

describe('sandboxed Metal browser admission', () => {
  it('admits browser-only software presentation on the explicit hosted Metal target', () => {
    expect(() =>
      assertHostedMetalCompositor({
        metalRenderer: true,
        softwareRenderer: false,
        localMetalDist: undefined,
        platform: 'darwin',
        githubActions: 'true',
      })
    ).not.toThrow();
  });

  it.each([
    { metalRenderer: false },
    { softwareRenderer: true },
    { localMetalDist: '/tmp/local-assembly' },
    { platform: 'linux' },
    { platform: 'win32' },
    { githubActions: undefined },
    { githubActions: 'false' },
  ])('rejects unsupported compositor execution: %j', (override) => {
    expect(() =>
      assertHostedMetalCompositor({
        metalRenderer: true,
        softwareRenderer: false,
        localMetalDist: undefined,
        platform: 'darwin',
        githubActions: 'true',
        ...override,
      })
    ).toThrow();
  });

  it.each([false, true])('admits only the declared compositor mode: %s', (mode) => {
    expect(() => check(admission(mode))).not.toThrow();
  });

  it.each(['unavailable_software', 'unavailable_off', 'disabled_off', undefined])(
    'rejects non-enabled or missing WebGL status: %s',
    (status) => {
      for (const mode of [false, true]) {
        const value = admission(mode);
        value.gpu.featureStatus.webgl = status;
        expect(() => check(value)).toThrow();
      }
    }
  );

  it('rejects readback in normal mode and normal enabled in the diagnostic', () => {
    for (const mode of [false, true]) {
      const value = admission(mode);
      value.gpu.featureStatus.webgl = mode ? 'enabled' : 'enabled_readback';
      expect(() => check(value)).toThrow();
    }
  });

  it('rejects compositor status and argument mismatches', () => {
    const value = admission(true);
    value.gpu.featureStatus.gpu_compositing = 'enabled';
    expect(() => check(value)).toThrow();
    for (const mode of [false, true]) {
      const mismatch = admission(mode);
      mismatch.args = mode ? [] : ['--disable-gpu-compositing'];
      expect(() => check(mismatch)).toThrow();
    }
  });

  it('rejects software, missing, unsandboxed and in-process renderer identities', () => {
    for (const mode of [false, true]) {
      for (const attributes of [
        { glRenderer: 'SwiftShader' },
        { glRenderer: 'ANGLE Metal Renderer (software)' },
        { glRenderer: undefined },
        { sandboxed: false },
        { sandboxed: undefined },
        { inProcessGpu: true },
        { inProcessGpu: undefined },
      ]) {
        const value = admission(mode);
        Object.assign(value.gpu.auxAttributes, attributes);
        expect(() => check(value)).toThrow();
      }
    }
  });
});
