import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // SWC is 20x faster than Babel

const packageMetadata = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
) as { version?: string };
const releaseMatrix = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'release-matrix.json'), 'utf8')
) as { releases: Array<{ version: string; type: string }> };
const STATIC_RELEASE_VERSIONS = new Set(
  releaseMatrix.releases
    .filter((release) => release.type === 'static')
    .map((release) => release.version)
);

const CURRENT_AUDIO_FILES = new Set([
  'The Builder.mp3',
  'Space Jazz.mp3',
  'Upbeat Forever.mp3',
  'Fuzzball Parade.mp3',
  'I Got a Stick Feat James Gavins.mp3',
  'Boogie Party.mp3',
  'Voxel Revolution.mp3',
  'Newer Wave.mp3',
  'Neon Laser Horizon.mp3',
  'Cloud Dancer.mp3',
]);

/**
 * Vite's default public-directory copy duplicates every immutable historical
 * release into `dist`, only for `finalizeCurrentBuild` to delete those copies
 * at closeBundle. Besides wasting build time, that transient duplication can
 * exceed the available release-runner disk. Development still uses Vite's
 * ordinary public directory and `serveStaticVersions`; build mode uses this
 * filtered copy instead.
 */
function copyCurrentPublicFiles(): Plugin {
  return {
    name: 'copy-current-public-files',
    apply: 'build',
    writeBundle() {
      const sourceDirectory = path.resolve(__dirname, 'public');
      const outputDirectory = path.resolve(__dirname, 'dist');
      fs.cpSync(sourceDirectory, outputDirectory, {
        recursive: true,
        filter(source) {
          const relative = path.relative(sourceDirectory, source);
          if (relative === '') return true;
          const segments = relative.split(path.sep);
          if (/^v\d+\.\d+$/.test(segments[0])) return false;
          const basename = path.basename(source);
          if (basename === '.DS_Store' || basename === 'blocked_commands.log') return false;
          if (
            segments.length === 1 &&
            basename.toLocaleLowerCase().endsWith('.mp3') &&
            !CURRENT_AUDIO_FILES.has(basename)
          ) {
            return false;
          }
          return true;
        },
      });
    },
  };
}

function finalizeCurrentBuild({
  buildId,
  cacheVersion,
}: {
  buildId: string;
  cacheVersion: string;
}): Plugin {
  return {
    name: 'finalize-current-build',
    apply: 'build',
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

// Serve the immutable static archives declared by the release matrix in development.
function serveStaticVersions(): Plugin {
  return {
    name: 'serve-static-versions',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const versionMatch = req.url?.match(/^\/(v\d+\.\d+)(\/|$)/);
        if (versionMatch && req.url && STATIC_RELEASE_VERSIONS.has(versionMatch[1])) {
          const version = versionMatch[1];
          const publicRoot = path.join(__dirname, 'public');
          const versionRoot = path.join(publicRoot, version);
          let urlPath: string;
          try {
            urlPath = decodeURIComponent(req.url.replace(/\?.*$/, '')); // Remove query string
          } catch {
            return next();
          }
          let filePath = path.join(publicRoot, urlPath);

          // Serve index.html for directory requests
          if (urlPath === `/${version}` || urlPath === `/${version}/`) {
            filePath = path.join(versionRoot, 'index.html');
          }

          // This middleware runs ahead of Vite's fs.allow/deny checks on a
          // LAN-bound server, so never serve anything outside the archive.
          const relativePath = path.relative(versionRoot, filePath);
          if (
            relativePath === '' ||
            relativePath.startsWith('..') ||
            path.isAbsolute(relativePath)
          ) {
            return next();
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath);
            const contentTypes: Record<string, string> = {
              '.html': 'text/html',
              '.js': 'application/javascript',
              '.css': 'text/css',
              '.json': 'application/json',
              '.mp3': 'audio/mpeg',
              '.hdr': 'application/octet-stream',
              '.glb': 'model/gltf-binary',
              '.gltf': 'model/gltf+json',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.ttf': 'font/ttf',
              '.woff': 'font/woff',
              '.woff2': 'font/woff2',
              '.wasm': 'application/wasm',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
              '.ktx2': 'image/ktx2',
            };
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig((): UserConfig => {
  // Support versioned deployments: VERSION=v0.10 -> base=/v0.10/
  const version = process.env.VERSION;
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
    // Public resolution remains available to both dev and Rollup. The build
    // section disables only Vite's unfiltered copy; our plugin copies the
    // current-release subset after bundles have been written.
    publicDir: 'public',
    server: {
      port: 3000,
      host: '0.0.0.0',
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
      copyCurrentPublicFiles(),
      finalizeCurrentBuild({
        buildId,
        cacheVersion,
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
      copyPublicDir: false,
      target: 'es2020',
      minify: 'esbuild', // esbuild is faster, terser for smaller bundles
      sourcemap: false, // Disable for production (saves ~30% bundle size)
      manifest: true,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          // Manual chunks for better caching and parallel loading. Match package
          // paths rather than package entry points so React's JSX runtimes and
          // React DOM's client entry do not fall back into the application chunk.
          manualChunks(id) {
            if (id.includes('/node_modules/three/build/')) return 'three-core';
            if (id.includes('/node_modules/@react-three/fiber/')) return 'three-fiber';
            if (/\/node_modules\/(?:react|react-dom|scheduler|zustand)(?:\/|$)/.test(id)) {
              return 'react-core';
            }
            if (id.includes('/node_modules/framer-motion/')) return 'ui-vendor';
            if (id.includes('/node_modules/lucide-react/')) return 'icons';
            if (id.includes('/node_modules/maath/')) return 'math-utils';
            return undefined;
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
