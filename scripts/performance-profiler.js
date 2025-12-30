/**
 * MillOS Performance Profiler
 * Paste this into Chrome DevTools Console to diagnose stuttering
 *
 * Usage: Copy entire file, paste in Console, watch for reports
 */

(function() {
  console.clear();
  console.log('%c🔍 MillOS Performance Profiler Started', 'color: #22c55e; font-size: 16px; font-weight: bold');
  console.log('Monitoring for 10 seconds...\n');

  // === Frame Time Monitor ===
  const frameTimes = [];
  const stutterThreshold = 50; // ms - anything above this is a stutter
  let lastFrameTime = performance.now();
  let stutterCount = 0;
  let worstFrame = 0;

  function measureFrame() {
    const now = performance.now();
    const delta = now - lastFrameTime;
    lastFrameTime = now;

    frameTimes.push(delta);
    if (frameTimes.length > 600) frameTimes.shift(); // Keep last 10s at 60fps

    if (delta > stutterThreshold) {
      stutterCount++;
      if (delta > worstFrame) worstFrame = delta;
      console.warn(`⚠️ STUTTER: ${delta.toFixed(1)}ms frame`);
    }

    requestAnimationFrame(measureFrame);
  }
  requestAnimationFrame(measureFrame);

  // === Three.js Renderer Stats ===
  function getRendererStats() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;

    // Access Three.js internals via React fiber
    const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;

    let fiber = canvas[fiberKey];
    let gl = null;

    // Traverse fiber tree to find gl context
    while (fiber) {
      if (fiber.memoizedProps?.gl) {
        gl = fiber.memoizedProps.gl;
        break;
      }
      if (fiber.stateNode?.gl) {
        gl = fiber.stateNode.gl;
        break;
      }
      fiber = fiber.return;
    }

    // Try window.__THREE_DEVTOOLS__ or global
    if (!gl && window.__THREE_DEVTOOLS__) {
      const scenes = window.__THREE_DEVTOOLS__.scenes;
      if (scenes && scenes.length > 0) {
        gl = scenes[0].renderer;
      }
    }

    // Direct WebGL context for program count
    const glCtx = canvas.getContext('webgl2') || canvas.getContext('webgl');

    return { gl, glCtx };
  }

  // === Memory Monitor ===
  function getMemoryStats() {
    if (performance.memory) {
      return {
        usedHeap: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1),
        totalHeap: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1),
        limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(1)
      };
    }
    return null;
  }

  // === Report Generator ===
  function generateReport() {
    console.log('\n%c📊 PERFORMANCE REPORT', 'color: #3b82f6; font-size: 14px; font-weight: bold');
    console.log('─'.repeat(50));

    // Frame time analysis
    if (frameTimes.length > 0) {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      const fps = 1000 / avg;

      console.log('%cFrame Timing:', 'font-weight: bold');
      console.log(`  Average FPS: ${fps.toFixed(1)}`);
      console.log(`  Average frame: ${avg.toFixed(2)}ms`);
      console.log(`  P50 (median): ${p50.toFixed(2)}ms`);
      console.log(`  P95: ${p95.toFixed(2)}ms`);
      console.log(`  P99: ${p99.toFixed(2)}ms`);
      console.log(`  Worst frame: ${worstFrame.toFixed(2)}ms`);
      console.log(`  Stutters (>${stutterThreshold}ms): ${stutterCount}`);

      // Diagnosis
      if (p99 > 100) {
        console.log('%c  ⚠️ SEVERE: P99 > 100ms - major stuttering detected', 'color: #ef4444');
      } else if (p95 > 50) {
        console.log('%c  ⚠️ WARNING: P95 > 50ms - noticeable stuttering', 'color: #f59e0b');
      } else if (avg > 20) {
        console.log('%c  ℹ️ INFO: Running below 50fps', 'color: #3b82f6');
      } else {
        console.log('%c  ✅ Frame timing looks healthy', 'color: #22c55e');
      }
    }

    console.log('');

    // Memory analysis
    const mem = getMemoryStats();
    if (mem) {
      console.log('%cMemory:', 'font-weight: bold');
      console.log(`  Used Heap: ${mem.usedHeap} MB`);
      console.log(`  Total Heap: ${mem.totalHeap} MB`);
      console.log(`  Heap Limit: ${mem.limit} MB`);

      const usedPct = (parseFloat(mem.usedHeap) / parseFloat(mem.limit) * 100).toFixed(1);
      if (parseFloat(usedPct) > 80) {
        console.log(`%c  ⚠️ High memory usage: ${usedPct}%`, 'color: #ef4444');
      }
    }

    console.log('');

    // Renderer stats
    const stats = getRendererStats();
    if (stats?.gl?.info) {
      const info = stats.gl.info;
      console.log('%cThree.js Renderer:', 'font-weight: bold');
      console.log(`  Draw Calls: ${info.render?.calls || 'N/A'}`);
      console.log(`  Triangles: ${info.render?.triangles || 'N/A'}`);
      console.log(`  Points: ${info.render?.points || 'N/A'}`);
      console.log(`  Lines: ${info.render?.lines || 'N/A'}`);
      console.log(`  Geometries: ${info.memory?.geometries || 'N/A'}`);
      console.log(`  Textures: ${info.memory?.textures || 'N/A'}`);
      console.log(`  Programs (shaders): ${info.programs?.length || 'N/A'}`);

      if (info.render?.calls > 500) {
        console.log('%c  ⚠️ High draw call count - consider instancing', 'color: #f59e0b');
      }
      if (info.programs?.length > 50) {
        console.log('%c  ⚠️ Many shader programs - check for cache key issues', 'color: #f59e0b');
      }
    }

    console.log('');

    // Store access for manual inspection
    console.log('%cStores (for manual inspection):', 'font-weight: bold');
    console.log('  window.useGraphicsStore?.getState()');
    console.log('  window.useFPSStore?.getState()');

    console.log('\n' + '─'.repeat(50));
    console.log('%c💡 Next Steps:', 'font-weight: bold');
    console.log('1. Press F12 → Performance tab → Record for 5 seconds');
    console.log('2. Look for long yellow (JS) or purple (Render) blocks');
    console.log('3. Check "Bottom-Up" for heaviest functions');
    console.log('');
  }

  // Run report after 10 seconds
  setTimeout(generateReport, 10000);

  // Also make it available manually
  window.millOSProfiler = {
    report: generateReport,
    frameTimes,
    getMemory: getMemoryStats,
    getRenderer: getRendererStats
  };

  console.log('Profiler will auto-report in 10 seconds.');
  console.log('Or run: millOSProfiler.report()');
})();
