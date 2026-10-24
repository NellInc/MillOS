/**
 * Performance Test with GPU Enabled
 * Uses Chrome DevTools Protocol for accurate FPS measurement
 */

const puppeteer = require('puppeteer');

async function runPerformanceTest() {
  console.log('🚀 Starting MillOS Performance Test (GPU Enabled)\n');

  // Launch Chrome with GPU enabled (not headless)
  const browser = await puppeteer.launch({
    headless: false, // Need visible browser for GPU
    args: [
      '--enable-gpu',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-accelerated-2d-canvas',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // Enable CDP for performance metrics
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');

  console.log('📱 Opening http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('✅ Page loaded\n');

  console.log('⏳ Waiting 10s for app to stabilize...');
  await new Promise((r) => setTimeout(r, 10000));

  // Get render report from the app
  console.log('\n============================================================');
  console.log('📊 RENDER REPORT (from app)');
  console.log('============================================================\n');

  try {
    const renderReport = await page.evaluate(() => {
      if (typeof window.renderReport === 'function') {
        return window.renderReport();
      }
      return null;
    });

    if (renderReport) {
      console.log('Components with most renders:');
      Object.entries(renderReport)
        .slice(0, 10)
        .forEach(([name, count], i) => {
          console.log(`  ${i + 1}. ${name}: ${count} renders`);
        });
    } else {
      console.log('renderReport() not available');
    }
  } catch (e) {
    console.log('Could not get render report:', e.message);
  }

  // Collect FPS metrics using requestAnimationFrame
  console.log('\n============================================================');
  console.log('📊 FPS MEASUREMENT (10 seconds)');
  console.log('============================================================\n');

  const fpsData = await page.evaluate(() => {
    return new Promise((resolve) => {
      const frames = [];
      let lastTime = performance.now();
      let frameCount = 0;
      const startTime = performance.now();
      const duration = 10000; // 10 seconds

      function measure() {
        const now = performance.now();
        frameCount++;

        // Calculate instantaneous FPS every 500ms
        if (now - lastTime >= 500) {
          const fps = Math.round((frameCount * 1000) / (now - lastTime));
          frames.push(fps);
          frameCount = 0;
          lastTime = now;
        }

        if (now - startTime < duration) {
          requestAnimationFrame(measure);
        } else {
          const avgFps = Math.round(frames.reduce((a, b) => a + b, 0) / frames.length);
          const minFps = Math.min(...frames);
          const maxFps = Math.max(...frames);
          resolve({ avgFps, minFps, maxFps, samples: frames.length, frames });
        }
      }

      requestAnimationFrame(measure);
    });
  });

  console.log(`   Average FPS:  ${fpsData.avgFps}`);
  console.log(`   Min FPS:      ${fpsData.minFps}`);
  console.log(`   Max FPS:      ${fpsData.maxFps}`);
  console.log(`   Samples:      ${fpsData.samples}`);
  console.log(`   FPS Timeline: ${fpsData.frames.join(', ')}`);

  // Get Three.js renderer info and draw call metrics
  console.log('\n============================================================');
  console.log('🎮 THREE.JS RENDERER INFO & DRAW CALLS');
  console.log('============================================================\n');

  const rendererInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { error: 'No WebGL context' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

    // Try to get FPS store data
    let fpsStoreData = null;
    if (typeof window.useFPSStore !== 'undefined') {
      const state = window.useFPSStore.getState();
      fpsStoreData = {
        drawCalls: state.drawCalls,
        triangles: state.triangles,
        geometries: state.geometries,
        textures: state.textures,
      };
    }

    return {
      vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown',
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
      version: gl.getParameter(gl.VERSION),
      fpsStore: fpsStoreData,
    };
  });

  if (rendererInfo.error) {
    console.log(`   Error: ${rendererInfo.error}`);
  } else {
    console.log(`   Vendor:     ${rendererInfo.vendor}`);
    console.log(`   Renderer:   ${rendererInfo.renderer}`);
    console.log(`   Version:    ${rendererInfo.version}`);
    if (rendererInfo.fpsStore) {
      console.log(`\n   📊 Scene Stats:`);
      console.log(`   Draw Calls: ${rendererInfo.fpsStore.drawCalls}`);
      console.log(`   Triangles:  ${rendererInfo.fpsStore.triangles}`);
      console.log(`   Geometries: ${rendererInfo.fpsStore.geometries}`);
      console.log(`   Textures:   ${rendererInfo.fpsStore.textures}`);
    }
  }

  // Test with different quality levels
  console.log('\n============================================================');
  console.log('🔬 QUALITY LEVEL COMPARISON');
  console.log('============================================================\n');

  for (const quality of ['low', 'medium', 'high']) {
    console.log(`\nTesting ${quality.toUpperCase()} quality...`);

    await page.evaluate((q) => {
      if (typeof window.useGraphicsStore !== 'undefined') {
        window.useGraphicsStore.getState().setGraphicsQuality(q);
      }
    }, quality);

    await new Promise((r) => setTimeout(r, 3000)); // Wait for quality change

    const qualityFps = await page.evaluate(() => {
      return new Promise((resolve) => {
        const frames = [];
        let lastTime = performance.now();
        let frameCount = 0;
        const startTime = performance.now();

        function measure() {
          const now = performance.now();
          frameCount++;

          if (now - lastTime >= 500) {
            frames.push(Math.round((frameCount * 1000) / (now - lastTime)));
            frameCount = 0;
            lastTime = now;
          }

          if (now - startTime < 5000) {
            requestAnimationFrame(measure);
          } else {
            resolve(Math.round(frames.reduce((a, b) => a + b, 0) / frames.length));
          }
        }
        requestAnimationFrame(measure);
      });
    });

    console.log(`   ${quality.toUpperCase()}: ${qualityFps} FPS`);
  }

  // Performance grade
  console.log('\n============================================================');
  console.log('🎯 PERFORMANCE SUMMARY');
  console.log('============================================================\n');

  const grade =
    fpsData.avgFps >= 55
      ? '🟢 GOOD'
      : fpsData.avgFps >= 45
        ? '🟡 ACCEPTABLE'
        : fpsData.avgFps >= 30
          ? '🟠 POOR'
          : '🔴 CRITICAL';

  console.log(`   Grade: ${grade}`);
  console.log(`   Average FPS: ${fpsData.avgFps}`);
  console.log(`   Target: 60 FPS`);
  console.log(`   Gap: ${60 - fpsData.avgFps} FPS`);

  console.log('\n✅ Test complete! Browser left open for manual inspection.');
  console.log('   Press Ctrl+C to close.\n');

  // Keep browser open for manual inspection
  await new Promise(() => {});
}

runPerformanceTest().catch(console.error);
