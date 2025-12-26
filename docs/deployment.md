# Deployment Guide

Building and deploying MillOS to various hosting platforms.

## Table of Contents

1. [Build Process](#build-process)
2. [GitHub Pages Deployment](#github-pages-deployment)
3. [Static Hosting](#static-hosting)
4. [Environment Variables](#environment-variables)
5. [Production Optimization](#production-optimization)
6. [Troubleshooting](#troubleshooting)

---

## Build Process

### Create Production Build

```bash
npm run build
```

### Build Output

```
dist/
├── assets/
│   ├── index-[hash].js      # Main bundle
│   └── index-[hash].css     # Compiled styles
├── index.html               # Entry HTML
└── ...                      # Other static assets
```

### Preview Production Build

```bash
npm run preview
```

Runs local server with production build at `http://localhost:4173`

---

## GitHub Pages Deployment

The project includes a GitHub Actions workflow for automatic deployment.

### Workflow Location

`.github/workflows/deploy.yml` (create if not exists)

### Example Workflow

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Base Path Configuration

For GitHub Pages, update `vite.config.ts`:

```typescript
export default defineConfig({
  base: '/',  // Or '/repo-name/' for project pages
  // ...
});
```

### Repository Settings

1. Go to **Settings** > **Pages**
2. Set **Source** to "GitHub Actions"
3. Add secrets for environment variables

---

## Static Hosting

MillOS can be deployed to any static hosting provider.

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

### Netlify

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy

# Production deployment
netlify deploy --prod
```

#### Netlify Configuration

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### AWS S3 + CloudFront

1. **Build the project**:
```bash
npm run build
```

2. **Upload to S3**:
```bash
aws s3 sync dist/ s3://your-bucket-name --delete
```

3. **Configure CloudFront**:
- Set origin to S3 bucket
- Configure default root object: `index.html`
- Set error page redirect to `index.html` for SPA routing

### Docker

Create `Dockerfile`:

```dockerfile
# Build stage
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Create `nginx.conf`:

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Build and run:

```bash
docker build -t millos .
docker run -p 80:80 millos
```

### SCADA Backend Proxy

For connecting to real PLCs via OPC-UA or Modbus:

```bash
cd scada-proxy

# Development mode
npm install
npm run dev

# Docker deployment
docker-compose up

# With MQTT broker
docker-compose --profile mqtt up

# With protocol simulators
docker-compose --profile opcua-sim --profile modbus-sim up

# Production
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Docker Compose Services:**

| Service | Port | Description |
|---------|------|-------------|
| `scada-proxy` | 3001 | REST API and WebSocket server |
| `mosquitto` | 8883 | MQTT broker (WebSocket) |
| `mosquitto` | 1883 | MQTT broker (TCP) |

**Kubernetes Deployment:**

See `.github/workflows/deploy-k8s.yml` for Kubernetes deployment configuration.

---

## Environment Variables

### Build-Time Variables

> **SECURITY WARNING**: Never embed API keys in client-side bundles using Vite's `define`.
> API keys in client bundles can be extracted by anyone viewing your site.

For sensitive API keys, use a backend proxy or serverless function:

```typescript
// api/proxy.ts (serverless function)
export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY; // Server-side only
  // Forward request to external API
}
```

### Setting Variables

#### Local Development

Create `.env.local` for backend/serverless functions:

```bash
GEMINI_API_KEY=your_key_here
```

**Note**: The `.env.local` file is gitignored and should never be committed.

#### Vercel/Netlify Deployment

Add environment variables in your hosting platform's dashboard (Settings > Environment Variables).
These are only accessible server-side in serverless functions.

#### Vercel

```bash
vercel env add GEMINI_API_KEY
```

#### Netlify

Add in **Site settings** > **Environment variables**

### SCADA Proxy Environment Variables

For the backend SCADA proxy service:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `POLL_INTERVAL` | 1000 | Polling interval (ms) |
| `OPCUA_ENDPOINT` | - | OPC-UA server URL (e.g., `opc.tcp://192.168.1.100:4840`) |
| `MODBUS_HOST` | - | Modbus TCP host |
| `MODBUS_PORT` | 502 | Modbus TCP port |
| `MQTT_BROKER_URL` | - | MQTT broker for pub/sub |

Example `.env` file for scada-proxy:

```bash
PORT=3001
POLL_INTERVAL=1000
OPCUA_ENDPOINT=opc.tcp://192.168.1.100:4840
MODBUS_HOST=192.168.1.101
MODBUS_PORT=502
```

---

## Production Optimization

### Vite Build Optimizations

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          vendor: ['react', 'react-dom', 'zustand', 'framer-motion']
        }
      }
    }
  }
});
```

### Performance Headers

For static hosts, set these headers:

```
Cache-Control: public, max-age=31536000, immutable  # For assets
Content-Encoding: gzip                               # Compression
```

### Bundle Analysis

Install analyzer:

```bash
npm install -D rollup-plugin-visualizer
```

Add to `vite.config.ts`:

```typescript
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'bundle-analysis.html',
      open: true
    })
  ]
});
```

### Asset Optimization

- **Images**: Use WebP format, appropriate sizes
- **Fonts**: Self-host with font-display: swap
- **3D Assets**: Compress GLTF/GLB files

---

## Troubleshooting

### Common Issues

#### Blank Page on Deploy

**Cause**: Incorrect base path

**Solution**: Check `vite.config.ts` base path matches deployment URL

```typescript
base: '/MillOS/'  // For project page
base: '/'         // For root domain
```

#### 404 on Refresh

**Cause**: SPA routing not configured

**Solution**: Configure redirects to index.html

#### Missing Environment Variables

**Cause**: Variables not available at build time

**Solution**:
1. Check variable names match
2. Ensure secrets are set in CI environment
3. Verify `define` block in vite.config.ts

#### WebGL Errors

**Cause**: Browser/device doesn't support WebGL2

**Solution**: Add fallback message:

```html
<noscript>
  <p>This application requires JavaScript and WebGL support.</p>
</noscript>
```

#### Audio Not Working

**Cause**: Browser autoplay policy

**Solution**: Audio is already handled - requires user interaction first

### Debugging Production

1. **Check browser console** for errors
2. **Verify network requests** in DevTools
3. **Test locally** with `npm run preview`
4. **Compare** dev and prod builds

### Performance Issues

If production is slow:

1. **Check bundle size** with analyzer
2. **Verify code splitting** is working
3. **Test on target devices**
4. **Use Lighthouse** for auditing

---

## Monitoring

### Recommended Services

| Service | Purpose |
|---------|---------|
| Google Analytics | Usage tracking |
| Sentry | Error monitoring |
| LogRocket | Session recording |
| Lighthouse CI | Performance monitoring |

### Error Tracking Setup

```typescript
// Add to App.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: import.meta.env.MODE,
});
```

---

## Continuous Integration

### GitHub Actions CI

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

### Pre-commit Hooks

Install husky:

```bash
npm install -D husky lint-staged
npx husky init
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,json,md}": ["prettier --write"]
  }
}
```
