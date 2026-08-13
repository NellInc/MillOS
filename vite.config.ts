import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // SWC is 20x faster than Babel
import musicCredits from './music-credits.json';
import {
  isLegacyAssetRequest,
  isPathWithin,
  resolveLegacyAssetPath,
  validateDeploymentVersion,
} from './src/utils/vitePathSecurity';

const packageMetadata = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as { version?: string };

const CURRENT_AUDIO_FILES = new Set(
  musicCredits.tracks.filter((track) => track.currentRole !== null).map((track) => track.file)
);

const LEGACY_CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function finalizeCurrentBuild({
  buildId,
  cacheVersion,
  rootDeployment,
}: {
  buildId: string;
  cacheVersion: string;
  rootDeployment: boolean;
}): Plugin {
  return {
    name: 'finalize-current-build',
    closeBundle() {
      const outputDirectory = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(outputDirectory)) return;

      const serviceWorkerPath = path.join(outputDirectory, 'sw.js');
      if (fs.existsSync(serviceWorkerPath)) {
        const serviceWorker = fs
          .readFileSync(serviceWorkerPath, 'utf8')
          .replaceAll('__MILLOS_BUILD_ID__', buildId)
          .replaceAll('__MILLOS_CACHE_VERSION__', cacheVersion);
        fs.writeFileSync(serviceWorkerPath, serviceWorker);
      }

      fs.writeFileSync(
        path.join(outputDirectory, 'build-info.json'),
        `${JSON.stringify({ buildId, cacheVersion }, null, 2)}\n`
      );

      const pendingDirectories = [outputDirectory];
      while (pendingDirectories.length > 0) {
        const directory = pendingDirectories.pop();
        if (!directory) continue;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const entryPath = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            pendingDirectories.push(entryPath);
          } else if (entry.name === '.DS_Store' || entry.name === 'blocked_commands.log') {
            fs.rmSync(entryPath, { force: true });
          }
        }
      }

      if (!rootDeployment) return;

      for (const entry of fs.readdirSync(outputDirectory, { withFileTypes: true })) {
        if (entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name)) {
          fs.rmSync(path.join(outputDirectory, entry.name), { recursive: true, force: true });
        }
        if (
          entry.isFile() &&
          entry.name.toLocaleLowerCase().endsWith('.mp3') &&
          !CURRENT_AUDIO_FILES.has(entry.name)
        ) {
          fs.rmSync(path.join(outputDirectory, entry.name), { force: true });
        }
      }
    },
  };
}

// Plugin to serve static v0.10 and v0.20 builds during development
function serveStaticVersions(): Plugin {
  const publicRoot = path.resolve(__dirname, 'public');

  return {
    name: 'serve-static-versions',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!isLegacyAssetRequest(req.url)) {
          next();
          return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.setHeader('Allow', 'GET, HEAD');
          res.end('Method not allowed');
          return;
        }

        const assetPath = resolveLegacyAssetPath(publicRoot, req.url);
        if (!assetPath) {
          res.statusCode = 400;
          res.end('Invalid legacy asset path');
          return;
        }

        fs.realpath(assetPath.rootPath, (rootError, realRootPath) => {
          if (rootError) {
            res.statusCode = 404;
            res.end('Legacy release not found');
            return;
          }

          fs.realpath(assetPath.filePath, (fileError, realFilePath) => {
            if (fileError) {
              res.statusCode = 404;
              res.end('Legacy asset not found');
              return;
            }

            if (!isPathWithin(realRootPath, realFilePath)) {
              res.statusCode = 403;
              res.end('Legacy asset path is outside its release');
              return;
            }

            fs.stat(realFilePath, (statError, fileStat) => {
              if (statError || !fileStat.isFile()) {
                res.statusCode = 404;
                res.end('Legacy asset not found');
                return;
              }

              const extension = path.extname(realFilePath).toLowerCase();
              res.statusCode = 200;
              res.setHeader(
                'Content-Type',
                LEGACY_CONTENT_TYPES[extension] ?? 'application/octet-stream'
              );
              res.setHeader('Content-Length', String(fileStat.size));
              res.setHeader('Cache-Control', 'no-store');
              res.setHeader('X-Content-Type-Options', 'nosniff');

              if (req.method === 'HEAD') {
                res.end();
                return;
              }

              const assetStream = fs.createReadStream(realFilePath);
              assetStream.on('error', (error) => {
                if (!res.headersSent) {
                  next(error);
                  return;
                }
                res.destroy(error);
              });
              assetStream.pipe(res);
            });
          });
        });
      });
    },
  };
}

export default defineConfig((): UserConfig => {
  // Support versioned deployments: VERSION=v0.10 -> base=/v0.10/
  const version = validateDeploymentVersion(process.env.VERSION);
  const basePath = version ? `/${version}/` : '/';
  const packageVersion = packageMetadata.version ?? '0.0.0';
  const commit =
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CI_COMMIT_SHA ??
    process.env.COMMIT_SHA;
  const buildId = `${version ?? packageVersion}-${commit?.slice(0, 12) ?? 'local'}`;
  const cacheVersion = buildId.replace(/[^a-zA-Z0-9._-]/g, '_');

  return {
    base: basePath,
    server: {
      port: 3000,
      host: process.env.MILLOS_DEV_HOST?.trim() || '127.0.0.1',
      hmr: {
        overlay: false, // Disable error overlay (reduces rendering overhead)
      },
      watch: {
        usePolling: false,
        interval: 1000, // Check for changes less frequently
        ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      },
    },
    plugins: [
      serveStaticVersions(),
      react(),
      finalizeCurrentBuild({
        buildId,
        cacheVersion,
        rootDeployment: !version,
      }),
    ],
    define: {
      __MILLOS_BUILD_ID__: JSON.stringify(buildId),
      __MILLOS_CACHE_VERSION__: JSON.stringify(cacheVersion),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Build optimization for better bundle splitting and caching
    build: {
      target: 'es2020',
      minify: 'esbuild', // esbuild is faster, terser for smaller bundles
      sourcemap: false, // Disable for production (saves ~30% bundle size)
      manifest: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          // Manual chunks for better caching and parallel loading
          manualChunks: {
            // Three.js ecosystem (largest dependencies)
            'three-core': ['three'],
            // Fiber/Drei depend directly on React and Zustand. Keeping that
            // tightly coupled runtime together prevents circular vendor chunks.
            'three-fiber': [
              'react',
              'react-dom',
              'zustand',
              '@react-three/fiber',
              '@react-three/drei',
            ],
            // UI libraries
            'ui-vendor': ['framer-motion'],
            // Utilities
            icons: ['lucide-react'],
            'math-utils': ['maath'],
          },
        },
      },
      // The lazy local WebGPU brain is isolated in its own ~6MB chunk and only
      // loads when an operator opts into it. Rapier's WASM chunk is ~2.2MB.
      chunkSizeWarningLimit: 6500,
    },
    optimizeDeps: {
      // Pre-bundle heavy dependencies for faster dev startup
      include: ['three', '@react-three/fiber', '@react-three/drei', 'framer-motion'],
      // Exclude troika to prevent ES6 class transpilation issues.
      // Exclude @mlc-ai/web-llm: it is dynamically imported only (loaded on demand
      // when the operator opts into the local WebGPU brain), ships a large WASM
      // runtime, and uses require() inside ESM that breaks esbuild pre-bundling.
      // Rollup auto-splits the dynamic import into its own lazy chunk for prod.
      exclude: ['troika-three-text', '@mlc-ai/web-llm'],
      esbuildOptions: {
        target: 'esnext',
        supported: {
          'top-level-await': true,
        },
      },
    },
    esbuild: {
      // Preserve ES6 classes in all files
      target: 'esnext',
    },
  };
});
