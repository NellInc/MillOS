import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // SWC is 20x faster than Babel

// Plugin to serve static v0.10 and v0.20 builds during development
function serveStaticVersions(): Plugin {
  return {
    name: 'serve-static-versions',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Handle both v0.10 and v0.20 static builds
        const versionMatch = req.url?.match(/^\/(v0\.10|v0\.20)(\/|$)/);
        if (versionMatch && req.url) {
          const version = versionMatch[1];
          const urlPath = req.url.replace(/\?.*$/, ''); // Remove query string
          let filePath = path.join(__dirname, 'public', urlPath);

          // Serve index.html for directory requests
          if (urlPath === `/${version}` || urlPath === `/${version}/`) {
            filePath = path.join(__dirname, 'public', version, 'index.html');
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
  return {
    base: basePath,
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
    plugins: [serveStaticVersions(), react()],
    // SECURITY: API keys should NOT be embedded in client bundles
    // Use a backend proxy (serverless function) instead
    // define: {
    //   'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    //   'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    // },
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
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          // Manual chunks for better caching and parallel loading
          manualChunks: {
            // Core framework chunks
            'react-vendor': ['react', 'react-dom'],
            'state-vendor': ['zustand'],
            // Three.js ecosystem (largest dependencies)
            'three-core': ['three'],
            'three-fiber': ['@react-three/fiber', '@react-three/drei'],
            'three-postprocessing': ['@react-three/postprocessing', 'postprocessing'],
            // Rapier physics - large WASM bundle (~2.2MB), isolated for parallel loading
            // This chunk contains the Rapier WASM physics engine which cannot be reduced
            'three-rapier': ['@react-three/rapier'],
            // UI libraries
            'ui-vendor': ['framer-motion'],
            charts: ['recharts'],
            // Utilities
            icons: ['lucide-react'],
            // Additional splits to reduce main bundle
            'ai-vendor': ['@google/generative-ai'],
            multiplayer: ['peerjs'],
            'math-utils': ['maath'],
          },
        },
      },
      // Rapier physics WASM is ~2.2MB - this is expected and cannot be reduced
      // Increase limit to suppress warning for this known large dependency
      chunkSizeWarningLimit: 2500,
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
