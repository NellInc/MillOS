import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

const workerExecArgv = process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
  ? ['--no-experimental-webstorage']
  : [];

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // The suite imports Three.js + large app modules; running many workers in
    // parallel can exceed Node's heap limit on some machines.
    pool: 'forks',
    // Node 25+ exposes an experimental process-global localStorage accessor.
    // JSDOM owns browser storage in this suite, so disable the Node accessor to
    // avoid one warning per worker and accidental file-backed state leakage.
    execArgv: workerExecArgv,
    fileParallelism: false,
    maxWorkers: 1,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'scada-proxy', 'src/**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec,bench}.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
      ],
      thresholds: {
        branches: 15,
        functions: 15,
        lines: 15,
        statements: 15,
      },
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
