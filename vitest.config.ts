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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
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
      exclude: [
        'src/scada/**/*.test.ts',
        'src/scada/**/*.bench.ts',
        'src/scada/index.ts'
      ]
    },
    benchmark: {
      include: ['src/**/*.bench.ts'],
      reporters: ['default'],
      outputJson: 'benchmark-results.json'
    },
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
