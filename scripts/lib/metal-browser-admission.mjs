import assert from 'node:assert/strict';

export function assertHostedMetalCompositor({
  metalRenderer,
  softwareRenderer,
  localMetalDist,
  platform,
  githubActions,
}) {
  assert.ok(
    metalRenderer &&
      !softwareRenderer &&
      !localMetalDist &&
      platform === 'darwin' &&
      githubActions === 'true',
    'Software browser compositing requires explicit hosted Metal acceptance'
  );
}

// Chromium appends _readback to enabled hardware WebGL when only browser
// compositing is disabled (compositor_util.cc, Chrome 152, lines 258-277).
// Working if the diagnostic admits that exact combination and rejects software
// WebGL, while normal acceptance continues to require the original enabled status.
export function assertMetalBrowserAdmission(gpu, browserArguments, softwareCompositor = false) {
  assert.match(gpu.auxAttributes?.glRenderer ?? '', /ANGLE Metal Renderer/i);
  assert.doesNotMatch(
    gpu.auxAttributes?.glRenderer ?? '',
    /swiftshader|llvmpipe|softpipe|\bwarp\b|software/i
  );
  assert.equal(gpu.auxAttributes?.sandboxed, true, 'Metal GPU process must be sandboxed');
  assert.equal(gpu.auxAttributes?.inProcessGpu, false, 'Metal GPU process must remain separate');
  assert.equal(
    browserArguments.includes('--disable-gpu-compositing'),
    softwareCompositor,
    'Compositor launch mode must match its declared admission'
  );
  assert.equal(
    gpu.featureStatus?.webgl,
    softwareCompositor ? 'enabled_readback' : 'enabled',
    'Metal WebGL must retain its exact hardware admission status'
  );
  if (softwareCompositor) {
    assert.equal(gpu.featureStatus?.gpu_compositing, 'disabled_software');
  }
}
