/**
 * Performance Test using Chrome DevTools Protocol
 * Captures real Performance traces and analyzes bottlenecks
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function runDevToolsTest() {
  console.log('Starting Chrome DevTools Performance Analysis\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--enable-gpu',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--window-size=1920,1080',
      '--mute-audio', // MUTE AUDIO
      '--autoplay-policy=no-user-gesture-required',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('[BROWSER ERROR]', msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.log('[PAGE ERROR]', err.message);
  });

  // Create CDP session for DevTools Protocol
  const client = await page.target().createCDPSession();

  // Enable necessary domains
  await client.send('Performance.enable');
  await client.send('Profiler.enable');

  const port = process.env.PORT || 3000;
  console.log(`Loading http://localhost:${port}...`);
  await page.goto(`http://localhost:${port}`, { waitUntil: 'load', timeout: 30000 });

  console.log('Waiting 5s for scene to stabilize...\n');
  await new Promise((r) => setTimeout(r, 5000));

  // Get initial stats
  const initialStats = await page.evaluate(() => {
    const state = window.useFPSStore?.getState() || {};
    const gfx = window.useGraphicsStore?.getState()?.graphics || {};
    return {
      fps: state.fps || 0,
      drawCalls: state.drawCalls || 0,
      triangles: state.triangles || 0,
      quality: gfx.quality || 'unknown',
    };
  });

  console.log('============================================================');
  console.log('INITIAL STATE');
  console.log('============================================================');
  console.log(`Quality: ${initialStats.quality.toUpperCase()}`);
  console.log(`FPS: ${initialStats.fps}`);
  console.log(`Draw Calls: ${initialStats.drawCalls}`);
  console.log(`Triangles: ${(initialStats.triangles / 1000).toFixed(1)}k\n`);

  // Start Performance tracing
  console.log('============================================================');
  console.log('RECORDING PERFORMANCE TRACE (5 seconds)...');
  console.log('============================================================\n');

  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'v8.execute',
      'blink.user_timing',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
    ].join(','),
    options: 'sampling-frequency=10000',
  });

  await new Promise((r) => setTimeout(r, 5000));

  const traceData = [];
  client.on('Tracing.dataCollected', (data) => {
    traceData.push(...data.value);
  });

  await client.send('Tracing.end');
  await new Promise((r) => setTimeout(r, 1000)); // Wait for data collection

  // Analyze trace data
  const functionCalls = {};
  const categories = { scripting: 0, rendering: 0, painting: 0, other: 0 };
  let totalFrames = 0;
  let longTasks = 0;

  for (const event of traceData) {
    if (event.name === 'FunctionCall' && event.dur) {
      const funcName = event.args?.data?.functionName || 'anonymous';
      functionCalls[funcName] = (functionCalls[funcName] || 0) + event.dur / 1000;
    }

    if (event.name === 'RunTask' && event.dur) {
      const durMs = event.dur / 1000;
      if (durMs > 50) longTasks++;
    }

    if (event.cat?.includes('devtools.timeline')) {
      const durMs = (event.dur || 0) / 1000;
      if (
        event.name?.includes('Script') ||
        event.name?.includes('Function') ||
        event.name?.includes('Evaluate')
      ) {
        categories.scripting += durMs;
      } else if (
        event.name?.includes('Layout') ||
        event.name?.includes('Recalculate') ||
        event.name?.includes('Update')
      ) {
        categories.rendering += durMs;
      } else if (event.name?.includes('Paint') || event.name?.includes('Composite')) {
        categories.painting += durMs;
      }
    }

    if (event.name === 'DrawFrame') {
      totalFrames++;
    }
  }

  console.log('TRACE ANALYSIS:');
  console.log(`  Frames recorded: ${totalFrames}`);
  console.log(`  Long tasks (>50ms): ${longTasks}`);
  console.log(`  Scripting time: ${categories.scripting.toFixed(1)}ms`);
  console.log(`  Rendering time: ${categories.rendering.toFixed(1)}ms`);
  console.log(`  Painting time: ${categories.painting.toFixed(1)}ms\n`);

  // Top functions by time
  const sortedFuncs = Object.entries(functionCalls)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (sortedFuncs.length > 0) {
    console.log('TOP FUNCTIONS BY TIME:');
    sortedFuncs.forEach(([name, time], i) => {
      console.log(`  ${i + 1}. ${name}: ${time.toFixed(2)}ms`);
    });
    console.log('');
  }

  // Now run the perfDebug toggle tests
  console.log('============================================================');
  console.log('PERFDEBUG A/B TESTS (disabling systems one by one)');
  console.log('============================================================\n');

  const toggles = [
    { key: 'disableEnvironment', name: 'Environment (15 useFrame)' },
    { key: 'disableWorkerSystem', name: 'WorkerSystem' },
    { key: 'disableMachines', name: 'Machines (9 useFrame)' },
    { key: 'disableConveyorSystem', name: 'ConveyorSystem' },
    { key: 'disableForkliftSystem', name: 'ForkliftSystem' },
  ];

  // Get baseline
  await new Promise((r) => setTimeout(r, 2000));
  const baselineFps = await measureFps(page);
  console.log(`BASELINE: ${baselineFps} FPS\n`);

  const results = [];

  for (const toggle of toggles) {
    // Enable the disable toggle
    await page.evaluate((key) => {
      window.useGraphicsStore.getState().setPerfDebug(key, true);
    }, toggle.key);

    await new Promise((r) => setTimeout(r, 3000));
    const fps = await measureFps(page);
    const delta = fps - baselineFps;

    results.push({ name: toggle.name, fps, delta });
    console.log(`Without ${toggle.name}: ${fps} FPS (${delta >= 0 ? '+' : ''}${delta})`);

    // Reset
    await page.evaluate((key) => {
      window.useGraphicsStore.getState().setPerfDebug(key, false);
    }, toggle.key);

    await new Promise((r) => setTimeout(r, 1000));
  }

  // Sort by impact
  results.sort((a, b) => b.delta - a.delta);

  console.log('\n============================================================');
  console.log('BOTTLENECK RANKING (biggest FPS gain when disabled)');
  console.log('============================================================\n');

  results.forEach((r, i) => {
    const indicator = r.delta > 5 ? '[BOTTLENECK]' : r.delta > 2 ? '[minor]' : '';
    console.log(`${i + 1}. ${r.name}: +${r.delta} FPS ${indicator}`);
  });

  // Quality level comparison
  console.log('\n============================================================');
  console.log('QUALITY LEVEL COMPARISON');
  console.log('============================================================\n');

  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    await page.evaluate((q) => {
      window.useGraphicsStore.getState().setGraphicsQuality(q);
    }, quality);

    await new Promise((r) => setTimeout(r, 3000));
    const fps = await measureFps(page);
    const stats = await page.evaluate(() => {
      const s = window.useFPSStore?.getState() || {};
      return { drawCalls: s.drawCalls || 0, triangles: s.triangles || 0 };
    });

    console.log(
      `${quality.toUpperCase().padEnd(6)}: ${fps} FPS | ${stats.drawCalls} draws | ${(stats.triangles / 1000).toFixed(1)}k tris`
    );
  }

  console.log('\n============================================================');
  console.log('TEST COMPLETE');
  console.log('============================================================');
  console.log('Browser left open. Press Ctrl+C to close.\n');

  // Keep open for inspection
  await new Promise(() => {});
}

async function measureFps(page) {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      let frames = 0;
      let lastTime = performance.now();
      const samples = [];

      function measure() {
        frames++;
        const now = performance.now();
        if (now - lastTime >= 500) {
          samples.push(Math.round((frames * 1000) / (now - lastTime)));
          frames = 0;
          lastTime = now;
        }
        if (samples.length < 6) {
          requestAnimationFrame(measure);
        } else {
          resolve(Math.round(samples.reduce((a, b) => a + b) / samples.length));
        }
      }
      requestAnimationFrame(measure);
    });
  });
}

runDevToolsTest().catch(console.error);
