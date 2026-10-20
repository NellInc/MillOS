/**
 * Performance Testing Script for MillOS
 * Tests React Three Fiber app for render bottlenecks and FPS issues
 */

const puppeteer = require('puppeteer');

const APP_URL = 'http://localhost:3000';
const WARMUP_TIME = 15000; // 15 seconds to let app stabilize
const SAMPLE_TIME = 10000; // 10 seconds per measurement

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting MillOS Performance Analysis\n');
  console.log('='.repeat(60));

  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
      // Enable WebGL
      '--enable-webgl',
      '--use-gl=desktop',
      '--enable-accelerated-2d-canvas',
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  });

  const page = await browser.newPage();

  // Track console messages
  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();

    if (type === 'error') {
      consoleErrors.push(text);
      if (consoleErrors.length <= 3) {
        console.log(`❌ Console Error: ${text}`);
      }
    } else if (type === 'warning') {
      consoleWarnings.push(text);
    }
  });

  // Navigate to app
  console.log(`📱 Opening ${APP_URL}...`);
  try {
    await page.goto(APP_URL, {
      waitUntil: 'domcontentloaded', // Changed from networkidle2 for faster load
      timeout: 60000, // Increased timeout to 60s
    });
    console.log('✅ Page loaded (DOM ready)');
  } catch (error) {
    console.error('❌ Failed to load app:', error.message);
    await browser.close();
    return;
  }

  // Wait for app to load and stabilize
  console.log(`⏳ Waiting ${WARMUP_TIME / 1000}s for app to stabilize...`);
  await sleep(WARMUP_TIME);

  console.log('\n' + '='.repeat(60));
  console.log('📊 PERFORMANCE MEASUREMENT');
  console.log('='.repeat(60));

  // Sample FPS data over 10 seconds
  console.log(`\n⏱️  Sampling performance for ${SAMPLE_TIME / 1000} seconds...`);

  const performanceData = await page.evaluate((sampleTime) => {
    return new Promise((resolve) => {
      const samples = [];
      const startTime = Date.now();
      let frameCount = 0;
      let lastFrameTime = performance.now();

      // Use requestAnimationFrame for accurate FPS measurement
      function measureFrame() {
        const now = performance.now();
        const delta = now - lastFrameTime;

        if (delta > 0) {
          const currentFPS = Math.min(Math.round(1000 / delta), 120); // Cap at 120
          samples.push({
            time: Date.now() - startTime,
            fps: currentFPS,
            memory: (performance.memory?.usedJSHeapSize || 0) / (1024 * 1024), // MB
          });
        }

        lastFrameTime = now;
        frameCount++;

        if (Date.now() - startTime < sampleTime) {
          requestAnimationFrame(measureFrame);
        } else {
          // Calculate statistics
          const fpsSamples = samples.map((s) => s.fps).filter((f) => f > 0 && f <= 120);
          const avgFPS = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
          const minFPS = Math.min(...fpsSamples);
          const maxFPS = Math.max(...fpsSamples);
          const memSamples = samples.map((s) => s.memory).filter((m) => m > 0);
          const avgMemory =
            memSamples.length > 0 ? memSamples.reduce((a, b) => a + b, 0) / memSamples.length : 0;

          resolve({
            avgFPS: Math.round(avgFPS),
            minFPS,
            maxFPS,
            avgMemory: Math.round(avgMemory),
            sampleCount: fpsSamples.length,
            totalFrames: frameCount,
          });
        }
      }

      requestAnimationFrame(measureFrame);
    });
  }, SAMPLE_TIME);

  console.log('\n✅ Performance Metrics:');
  console.log('─'.repeat(60));
  console.log(`   Average FPS:  ${performanceData.avgFPS}`);
  console.log(`   Min FPS:      ${performanceData.minFPS}`);
  console.log(`   Max FPS:      ${performanceData.maxFPS}`);
  console.log(`   FPS Variance: ${performanceData.maxFPS - performanceData.minFPS}`);
  console.log(`   Avg Memory:   ${performanceData.avgMemory} MB`);
  console.log(`   Total Frames: ${performanceData.totalFrames}`);
  console.log(`   Samples:      ${performanceData.sampleCount}`);

  // Get renderer info
  const rendererInfo = await page.evaluate(() => {
    // Try to find three.js renderer info in the scene
    const canvases = document.querySelectorAll('canvas');
    if (canvases.length > 0) {
      const gl = canvases[0].getContext('webgl2') || canvases[0].getContext('webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown',
          renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown',
          version: gl.getParameter(gl.VERSION),
          canvasCount: canvases.length,
        };
      }
    }
    return { vendor: 'Unknown', renderer: 'Unknown', version: 'Unknown', canvasCount: 0 };
  });

  console.log('\n🎮 Renderer Info:');
  console.log('─'.repeat(60));
  console.log(`   Vendor:    ${rendererInfo.vendor}`);
  console.log(`   Renderer:  ${rendererInfo.renderer}`);
  console.log(`   Version:   ${rendererInfo.version}`);
  console.log(`   Canvases:  ${rendererInfo.canvasCount}`);

  // Console error summary
  console.log('\n📋 Console Log Summary:');
  console.log('─'.repeat(60));
  console.log(`   Errors:    ${consoleErrors.length}`);
  console.log(`   Warnings:  ${consoleWarnings.length}`);

  if (consoleErrors.length > 3) {
    console.log(
      `\n   First 3 errors shown above. ${consoleErrors.length - 3} more errors in console.`
    );
  }

  // Performance analysis
  console.log('\n' + '='.repeat(60));
  console.log('🎯 PERFORMANCE ANALYSIS');
  console.log('='.repeat(60));

  let performanceGrade = 'EXCELLENT';
  let performanceColor = '🟢';
  let recommendations = [];

  if (performanceData.avgFPS < 30) {
    performanceGrade = 'CRITICAL';
    performanceColor = '🔴';
    recommendations.push('URGENT: FPS below 30 - major performance issues detected');
    recommendations.push('- Check for render storms (components re-rendering >60 times/sec)');
    recommendations.push('- Verify useFrame hooks are optimized and using React.memo()');
    recommendations.push(
      '- Consider disabling heavy effects (particles, shadows, post-processing)'
    );
    recommendations.push('- Review console errors - ' + consoleErrors.length + ' errors detected');
  } else if (performanceData.avgFPS < 45) {
    performanceGrade = 'POOR';
    performanceColor = '🟡';
    recommendations.push('WARNING: FPS below 45 - optimization recommended');
    recommendations.push('- Profile individual systems (workers, machines, conveyors)');
    recommendations.push('- Check for unnecessary re-renders in React components');
    recommendations.push('- Consider implementing LOD (Level of Detail) systems');
  } else if (performanceData.avgFPS < 60) {
    performanceGrade = 'FAIR';
    performanceColor = '🟡';
    recommendations.push('FPS between 45-60 - acceptable but has room for improvement');
    recommendations.push('- Minor optimizations could help reach 60 FPS target');
    recommendations.push('- Check for any components without React.memo()');
  }

  const fpsVariance = performanceData.maxFPS - performanceData.minFPS;
  if (fpsVariance > 20) {
    recommendations.push(
      `⚠️  High FPS variance (${fpsVariance}) - indicates inconsistent performance`
    );
    recommendations.push(
      '- Look for periodic heavy operations (garbage collection, large updates)'
    );
    recommendations.push('- Check for components that re-render on every frame');
  }

  if (consoleErrors.length > 0) {
    recommendations.push(
      `❌ ${consoleErrors.length} console errors detected - fix errors first before optimizing`
    );
  }

  console.log(`\n${performanceColor} Performance Grade: ${performanceGrade}`);
  console.log(`   Target: 60 FPS | Actual: ${performanceData.avgFPS} FPS`);
  console.log(`   Gap: ${Math.max(0, 60 - performanceData.avgFPS)} FPS improvement needed`);

  if (performanceData.avgFPS >= 60) {
    console.log('\n🎉 EXCELLENT: App running at target 60 FPS!');
    console.log('   No immediate optimizations needed.');
    console.log('   Continue monitoring for regressions.');
  }

  if (recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:\n');
    recommendations.forEach((rec) => {
      console.log(`   ${rec}`);
    });
  }

  // Bottleneck identification
  console.log('\n' + '='.repeat(60));
  console.log('🔍 BOTTLENECK IDENTIFICATION');
  console.log('='.repeat(60));

  console.log(`
The app is currently running at ${performanceData.avgFPS} FPS average.

To identify the specific bottleneck, you need to use the browser DevTools:

1. React DevTools Profiler (CRITICAL - Do this first):
   - Open React DevTools in the Puppeteer browser window
   - Go to "Profiler" tab
   - Click "Record" and let it run for 5 seconds
   - Stop recording
   - Look at "Ranked" view to see which components render most
   - ANY component rendering >10 times in 5 seconds is suspicious
   - Components with >50ms render time are bottlenecks

2. Browser Performance Tab:
   - Open Chrome DevTools (F12)
   - Go to "Performance" tab
   - Start recording
   - Wait 5 seconds
   - Stop recording
   - Look for:
     * Long tasks (yellow blocks >50ms)
     * Repeated function calls in flame chart
     * Memory sawtooth pattern (indicates GC pressure)

3. Three.js Stats:
   - Open console and run:
     const canvas = document.querySelector('canvas');
     const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
     console.log('Draw calls per frame: ~' + (ctx.getParameter(ctx.RENDER_CALLS) || 'N/A'));

4. Known Suspects (based on codebase):
   - TruckBay: 28+ useFrame hooks (very heavy)
   - WorkerSystem: 3+ useFrame hooks per worker
   - Machines: 9 useFrame hooks
   - ConveyorSystem: Multiple animated belts
   - ForkliftSystem: Pathfinding + animations

5. Test by disabling systems:
   - You can test by manually opening Graphics Settings in the UI
   - The graphicsStore has perfDebug toggles for each system
   - Disable one at a time and note FPS change
  `);

  console.log('='.repeat(60));
  console.log('✅ Performance analysis complete!');
  console.log('='.repeat(60));

  console.log('\n🔍 Browser left open for manual inspection.');
  console.log('   Use React DevTools Profiler (MOST IMPORTANT) to find render storms.');
  console.log('   Press Ctrl+C to close and exit.\n');

  // Don't close automatically - let user inspect
  // await browser.close();
}

main().catch((err) => {
  console.error('❌ Error running performance test:', err);
  process.exit(1);
});
