import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react() as any],
  test: {
    globals: true,
    environment: 'jsdom',
    // The suite imports Three.js + large app modules; running many workers in
    // parallel can exceed Node's heap limit on some machines.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    // Node 25+ installs its own global `localStorage`, which shadows jsdom's:
    // under Node 26 the storage tests read stale values and storage spies see
    // no writes, while Node 24 passes. The flag is accepted by both (Node 24
    // rejects the newer `--no-webstorage`). Working if the storage tests pass
    // identically under either version.
    execArgv: ['--no-experimental-webstorage'],
    // The capture/benchmark harness under scripts/ enforces gates of its own
    // (see scripts/lib/diagnostics.mjs). A gate that has never been observed to
    // fail is not known to be a gate, so its logic is unit-tested alongside the
    // app rather than trusted because it reads correctly.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.mjs'],
    exclude: [
      'node_modules',
      'dist',
      'scada-proxy',
      'src/0.10 Archive/**',
      'src/**/node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/scada/**/*.ts'],
      exclude: ['src/scada/**/*.test.ts', 'src/scada/**/*.bench.ts', 'src/scada/index.ts'],
    },
    benchmark: {
      include: ['src/**/*.bench.ts'],
      reporters: ['default'],
      outputJson: 'benchmark-results.json',
    },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
