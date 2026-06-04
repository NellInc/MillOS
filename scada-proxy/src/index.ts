/**
 * MillOS SCADA Proxy Server
 *
 * Backend service that bridges industrial protocols to REST/WebSocket:
 * - OPC-UA: Connects to OPC-UA servers for PLC data
 * - Modbus TCP: Connects to Modbus devices
 * - REST API: Exposes tag values for browser clients
 * - WebSocket: Real-time push updates to clients
 *
 * Environment Variables:
 * - PORT: Server port (default 3001)
 * - OPCUA_ENDPOINT: OPC-UA server endpoint URL
 * - MODBUS_HOST: Modbus TCP host
 * - MODBUS_PORT: Modbus TCP port (default 502)
 * - POLL_INTERVAL: Polling interval in ms (default 1000)
 * - ALLOWED_ORIGINS: Comma-separated list of allowed CORS origins (in addition to localhost)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { timingSafeEqual } from 'node:crypto';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { OPCUAAdapter } from './adapters/OPCUAAdapter';
import { ModbusAdapter } from './adapters/ModbusAdapter';
import { TagRegistry, TagDefinition } from './TagRegistry';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL ?? '1000', 10);
// Accept either SCADA_API_KEY (preferred) or API_KEY: k8s/docker manifests inject
// API_KEY, while the code historically read SCADA_API_KEY — the mismatch caused a
// prod crash-loop (fail-fast below) and silent auth-disable. Read both.
const API_KEY = process.env.SCADA_API_KEY ?? process.env.API_KEY;

// Security: Fail fast if API key is not configured in production
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !API_KEY) {
  console.error('FATAL: SCADA_API_KEY environment variable is required in production');
  process.exit(1);
}

// Constant-time API-key comparison to avoid a timing side-channel that a plain
// === would leak. Returns false on any length mismatch or missing value.
function safeKeyEqual(provided: string | undefined | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type SafeWebSocket = WebSocket & { isAlive?: boolean };

function auditLog(event: string, detail: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...detail,
    })
  );
}

function validateWrite(tag: TagDefinition, value: unknown): { ok: boolean; value?: unknown; error?: string } {
  if (tag.accessMode === 'READ') {
    return { ok: false, error: 'Tag is read-only' };
  }

  switch (tag.dataType) {
    case 'BOOL': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 1 || value === '1' || value === 'true') return { ok: true, value: true };
      if (value === 0 || value === '0' || value === 'false') return { ok: true, value: false };
      return { ok: false, error: 'Boolean value required' };
    }
    case 'STRING': {
      if (typeof value === 'string') return { ok: true, value };
      return { ok: false, error: 'String value required' };
    }
    case 'INT16':
    case 'INT32':
    case 'FLOAT32': {
      const num =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value)
            : Number.NaN;
      if (!Number.isFinite(num)) {
        return { ok: false, error: 'Numeric value required' };
      }
      const coerced = tag.dataType === 'FLOAT32' ? num : Math.round(num);
      const bounded =
        tag.engLow !== undefined && tag.engHigh !== undefined
          ? Math.min(tag.engHigh, Math.max(tag.engLow, coerced))
          : coerced;
      return { ok: true, value: bounded };
    }
    default:
      return { ok: false, error: 'Unsupported data type' };
  }
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Configure CORS with restricted origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) ?? [])
];

app.use(cors({
  origin: (origin, callback) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // In production, require origin header to prevent CSRF
    if (!origin) {
      if (isProduction) {
        return callback(new Error('Origin header required in production'), false);
      }
      return callback(null, true); // Allow in dev for testing tools
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true
}));

app.use(express.json());

// Simple API key auth (optional)
app.use((req, res, next) => {
  if (!API_KEY || req.method === 'OPTIONS') return next();
  const headerKey = req.headers['x-api-key'];
  const provided = Array.isArray(headerKey) ? headerKey[0] : headerKey;
  if (safeKeyEqual(provided, API_KEY)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

// Rate limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const HEARTBEAT_MS = 30000;

// ============================================================================
// Tag Registry and Adapters
// ============================================================================

const tagRegistry = new TagRegistry();
let opcuaAdapter: OPCUAAdapter | null = null;
let modbusAdapter: ModbusAdapter | null = null;

// ============================================================================
// WebSocket Clients
// ============================================================================

const wsClients = new Set<WebSocket>();

const heartbeat = setInterval(() => {
  wss.clients.forEach((client) => {
    const hbClient = client as SafeWebSocket;
    if (hbClient.isAlive === false) {
      wsClients.delete(client);
      return client.terminate();
    }
    hbClient.isAlive = false;
    client.ping();
  });
}, HEARTBEAT_MS);

wss.on('connection', (ws, req) => {
  const queryKey = (() => {
    try {
      return new URL(req.url ?? '', 'http://localhost').searchParams.get('apiKey');
    } catch {
      return null;
    }
  })();
  const headerKey = req.headers['x-api-key'];
  const providedKey = Array.isArray(headerKey) ? headerKey[0] : headerKey;

  if (API_KEY && !safeKeyEqual(queryKey, API_KEY) && !safeKeyEqual(providedKey, API_KEY)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  console.log('[WS] Client connected');
  const client = ws as SafeWebSocket;
  client.isAlive = true;
  wsClients.add(client);

  client.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleWSMessage(ws, data);
    } catch (err) {
      console.error('[WS] Invalid message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
  });

  // Send current tag values on connect
  const currentValues = tagRegistry.getAllValues();
  ws.send(JSON.stringify({
    type: 'snapshot',
    tags: currentValues
  }));
});

// Valid WebSocket message types
const VALID_WS_MESSAGE_TYPES = ['subscribe', 'write'] as const;
type ValidWSMessageType = typeof VALID_WS_MESSAGE_TYPES[number];

function handleWSMessage(ws: WebSocket, data: { type: string; tagId?: string; value?: unknown }) {
  // Input validation: Ensure message type is valid
  if (!VALID_WS_MESSAGE_TYPES.includes(data.type as ValidWSMessageType)) {
    console.warn('[WS] Invalid message type:', data.type);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Invalid message type: ${data.type}`
    }));
    return;
  }

  switch (data.type) {
    case 'subscribe':
      // Client subscriptions are handled implicitly - all clients get all updates
      break;

    case 'write':
      // Input validation: Ensure tagId is a non-empty string
      if (!data.tagId || typeof data.tagId !== 'string' || data.tagId.trim() === '') {
        console.warn('[WS] Invalid tagId for write operation');
        ws.send(JSON.stringify({
          type: 'error',
          message: 'tagId must be a non-empty string'
        }));
        return;
      }

      if (data.value === undefined) {
        console.warn('[WS] Write operation missing value');
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Write operation requires a value'
        }));
        return;
      }

      const tag = tagRegistry.getTagDefinition(data.tagId);
      if (!tag) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown tag ${data.tagId}`
        }));
        return;
      }

      const validation = validateWrite(tag, data.value);
      if (!validation.ok) {
        ws.send(JSON.stringify({
          type: 'error',
          message: validation.error ?? 'Invalid value'
        }));
        return;
      }

      void handleTagWrite(tag.id, validation.value);
      break;

    default:
      console.warn('[WS] Unknown message type:', data.type);
  }
}

function broadcastTagUpdate(tagId: string, value: unknown, quality: string) {
  const message = JSON.stringify({
    type: 'update',
    tagId,
    value,
    quality,
    timestamp: Date.now()
  });

  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ============================================================================
// REST API Routes
// ============================================================================

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: {
      opcua: opcuaAdapter?.isConnected() ?? false,
      modbus: modbusAdapter?.isConnected() ?? false,
      websocket: wsClients.size
    }
  });
});

// Get single tag value
app.get('/tags/:tagId', (req: Request, res: Response) => {
  const { tagId } = req.params;
  const value = tagRegistry.getValue(tagId);

  if (!value) {
    res.status(404).json({ error: 'Tag not found' });
    return;
  }

  res.json(value);
});

// Get multiple tag values
app.post('/tags/batch', (req: Request, res: Response) => {
  const { tagIds } = req.body as { tagIds: string[] };

  if (!Array.isArray(tagIds)) {
    res.status(400).json({ error: 'tagIds must be an array' });
    return;
  }

  const tags = tagIds
    .map((id) => tagRegistry.getValue(id))
    .filter((v): v is NonNullable<typeof v> => v !== null);

  res.json({
    tags,
    serverTime: Date.now()
  });
});

// Get all tag values
app.get('/tags', (_req: Request, res: Response) => {
  const tags = tagRegistry.getAllValues();
  res.json({
    tags,
    serverTime: Date.now()
  });
});

// Write to tag
app.put('/tags/:tagId', async (req: Request, res: Response) => {
  const { tagId } = req.params;
  const { value } = req.body as { value: unknown };

  const success = await handleTagWrite(tagId, value);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Write failed' });
  }
});

// Get connection status
app.get('/status', (_req: Request, res: Response) => {
  res.json({
    opcua: opcuaAdapter?.getStatus() ?? { connected: false },
    modbus: modbusAdapter?.getStatus() ?? { connected: false },
    tagCount: tagRegistry.getTagCount(),
    wsClients: wsClients.size
  });
});

// ============================================================================
// Tag Write Handler
// ============================================================================

async function handleTagWrite(tagId: string, value: unknown): Promise<boolean> {
  const tag = tagRegistry.getTagDefinition(tagId);
  if (!tag) {
    console.warn(`[Write] Unknown tag: ${tagId}`);
    auditLog('write_rejected', { tagId, reason: 'unknown_tag' });
    return false;
  }

  const validation = validateWrite(tag, value);
  if (!validation.ok) {
    console.warn(`[Write] Validation failed for ${tagId}: ${validation.error}`);
    auditLog('write_rejected', { tagId, reason: validation.error ?? 'invalid' });
    return false;
  }

  const sanitizedValue = validation.value;

  try {
    if (tag.protocol === 'opcua' && opcuaAdapter) {
      const success = await opcuaAdapter.writeValue(tagId, sanitizedValue);
      auditLog('write', { tagId, success, protocol: 'opcua' });
      return success;
    } else if (tag.protocol === 'modbus' && modbusAdapter) {
      const success = await modbusAdapter.writeValue(tagId, sanitizedValue);
      auditLog('write', { tagId, success, protocol: 'modbus' });
      return success;
    }
    auditLog('write_rejected', { tagId, reason: 'no_adapter' });
    return false;
  } catch (err) {
    console.error(`[Write] Failed for ${tagId}:`, err);
    auditLog('write_error', { tagId, error: (err as Error)?.message ?? 'unknown' });
    return false;
  }
}

// ============================================================================
// Polling Loop
// ============================================================================

let pollTimeout: NodeJS.Timeout | null = null;

async function pollTags() {
  const startTime = Date.now();

  try {
    // Poll OPC-UA
    if (opcuaAdapter?.isConnected()) {
      const opcuaTags = tagRegistry.getTagsByProtocol('opcua');
      const values = await opcuaAdapter.readValues(opcuaTags.map((t) => t.id));

      values.forEach((v) => {
        tagRegistry.updateValue(v.tagId, v.value, v.quality);
        broadcastTagUpdate(v.tagId, v.value, v.quality);
      });
    }

    // Poll Modbus
    if (modbusAdapter?.isConnected()) {
      const modbusTags = tagRegistry.getTagsByProtocol('modbus');
      const values = await modbusAdapter.readValues(modbusTags.map((t) => t.id));

      values.forEach((v) => {
        tagRegistry.updateValue(v.tagId, v.value, v.quality);
        broadcastTagUpdate(v.tagId, v.value, v.quality);
      });
    }
  } catch (err) {
    console.error('[Poll] Error:', err);
  }

  // Schedule next poll
  const elapsed = Date.now() - startTime;
  const delay = Math.max(0, POLL_INTERVAL - elapsed);
  pollTimeout = setTimeout(pollTags, delay);
}

// ============================================================================
// Startup
// ============================================================================

async function start() {
  console.log('='.repeat(60));
  console.log('MillOS SCADA Proxy Server');
  console.log('='.repeat(60));

  // Initialize OPC-UA adapter if configured
  const opcuaEndpoint = process.env.OPCUA_ENDPOINT;
  if (opcuaEndpoint) {
    console.log(`[OPC-UA] Connecting to ${opcuaEndpoint}...`);
    opcuaAdapter = new OPCUAAdapter(opcuaEndpoint);
    try {
      await opcuaAdapter.connect();
      console.log('[OPC-UA] Connected');
    } catch (err) {
      console.error('[OPC-UA] Connection failed:', err);
    }
  }

  // Initialize Modbus adapter if configured
  const modbusHost = process.env.MODBUS_HOST;
  if (modbusHost) {
    const modbusPort = parseInt(process.env.MODBUS_PORT ?? '502', 10);
    console.log(`[Modbus] Connecting to ${modbusHost}:${modbusPort}...`);
    modbusAdapter = new ModbusAdapter(modbusHost, modbusPort);
    try {
      await modbusAdapter.connect();
      console.log('[Modbus] Connected');
    } catch (err) {
      console.error('[Modbus] Connection failed:', err);
    }
  }

  // Load tag definitions
  await tagRegistry.loadTags();

  // Start polling
  pollTags();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[WebSocket] Available at ws://localhost:${PORT}/ws`);
    console.log('='.repeat(60));
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Stopping...');

  if (pollTimeout) {
    clearTimeout(pollTimeout);
  }

  clearInterval(heartbeat);

  wsClients.forEach((client) => client.close());

  if (opcuaAdapter) {
    await opcuaAdapter.disconnect();
  }

  if (modbusAdapter) {
    await modbusAdapter.disconnect();
  }

  server.close(() => {
    console.log('[Shutdown] Complete');
    process.exit(0);
  });
});

start().catch((err) => {
  console.error('[Fatal] Startup failed:', err);
  process.exit(1);
});
