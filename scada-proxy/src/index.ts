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
 * - RATE_LIMIT_MAX: Authenticated HTTP requests allowed per 15 minutes (default 2000)
 * - WRITE_RATE_LIMIT_MAX: HTTP writes allowed per 15 minutes (default 120)
 * - WS_MESSAGE_RATE_MAX: Client messages allowed per minute (default 120)
 * - WS_MAX_CLIENTS: Concurrent WebSocket clients (default 100)
 * - SCADA_ENABLE_WRITES: Explicit industrial write enable (default false)
 * - SCADA_WRITE_API_KEY: Separate credential required for production writes
 */

import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type IncomingMessage } from 'http';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { OPCUAAdapter } from './adapters/OPCUAAdapter';
import { ModbusAdapter, type ModbusTagConfig } from './adapters/ModbusAdapter';
import { TagRegistry } from './TagRegistry';
import {
  decodeWebSocketKeyProtocol,
  isOriginAllowed,
  parseAllowedOrigins,
  parseBooleanFlag,
  parseBoundedInteger,
  safeKeyEqual,
} from './security';
import { validateWrite } from './validation';
import {
  applySubscriptionChange,
  isTagSubscribed,
  validateSubscriptionTagIds,
} from './subscriptions';

dotenv.config();

const PORT = parseBoundedInteger(process.env.PORT, 3001, 1, 65535);
const POLL_INTERVAL = parseBoundedInteger(process.env.POLL_INTERVAL, 1000, 100, 60000);
const TRUST_PROXY_HOPS = parseBoundedInteger(process.env.TRUST_PROXY_HOPS, 0, 0, 10);
const RATE_LIMIT_MAX = parseBoundedInteger(process.env.RATE_LIMIT_MAX, 2000, 1, 100000);
const WRITE_RATE_LIMIT_MAX = parseBoundedInteger(process.env.WRITE_RATE_LIMIT_MAX, 120, 1, 10000);
const WS_MESSAGE_RATE_MAX = parseBoundedInteger(process.env.WS_MESSAGE_RATE_MAX, 120, 1, 10000);
const WS_MAX_CLIENTS = parseBoundedInteger(process.env.WS_MAX_CLIENTS, 100, 1, 10000);
const READ_API_KEY = process.env.SCADA_API_KEY;
const WRITES_ENABLED = parseBooleanFlag(process.env.SCADA_ENABLE_WRITES, false);
const WRITE_API_KEY = process.env.SCADA_WRITE_API_KEY;

// Security: Fail fast if API key is not configured in production
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !READ_API_KEY) {
  console.error('FATAL: SCADA_API_KEY environment variable is required in production');
  process.exit(1);
}
if (isProduction && WRITES_ENABLED && !WRITE_API_KEY) {
  console.error('FATAL: SCADA_WRITE_API_KEY is required when production writes are enabled');
  process.exit(1);
}
if (isProduction && WRITES_ENABLED && safeKeyEqual(READ_API_KEY, WRITE_API_KEY)) {
  console.error('FATAL: Production read and write API keys must be different');
  process.exit(1);
}

const effectiveWriteKey = WRITES_ENABLED
  ? (WRITE_API_KEY ?? (isProduction ? undefined : READ_API_KEY))
  : undefined;

type SafeWebSocket = WebSocket & {
  isAlive?: boolean;
  messageWindowStartedAt?: number;
  messageCount?: number;
  canWrite?: boolean;
  subscriptions?: Set<string>;
};
type AuthenticatedUpgradeRequest = IncomingMessage & { scadaCanWrite?: boolean };

function auditLog(event: string, detail: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...detail,
    })
  );
}

// ============================================================================
// Express App Setup
// ============================================================================

const tagRegistry = new TagRegistry();
let opcuaAdapter: OPCUAAdapter | null = null;
let modbusAdapter: ModbusAdapter | null = null;
const wsClients = new Set<SafeWebSocket>();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY_HOPS === 0 ? false : TRUST_PROXY_HOPS);

app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

const allowedOrigins = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS,
  isProduction ? [] : ['http://localhost:3000', 'http://localhost:5173']
);

// Probes must remain independent of browser CORS and application credentials.
// They expose only service and configured-adapter availability.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/ready', (_req: Request, res: Response) => {
  const opcuaReady = !process.env.OPCUA_ENDPOINT || Boolean(opcuaAdapter?.isConnected());
  const modbusReady = !process.env.MODBUS_HOST || Boolean(modbusAdapter?.isConnected());
  const ready = opcuaReady && modbusReady;
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    connections: { opcua: opcuaReady, modbus: modbusReady },
  });
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser API clients omit Origin and authenticate with a key. Browser
      // requests must match an exact allowlisted origin.
      if (isOriginAllowed(origin, allowedOrigins, false)) callback(null, true);
      else callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  })
);

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Forbidden origin' });
    return;
  }
  next(err);
});

// A one-second SCADA poll produces 900 requests per 15 minutes. The former
// limit of 100 locked out a single healthy client after less than two minutes.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMIT_MAX,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.method === 'OPTIONS',
});

app.use(limiter);
app.use(express.json({ limit: '32kb' }));

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: WRITE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many write requests from this IP, please try again later.',
});

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestApiKey(req: Request): string | undefined {
  const direct = headerValue(req.headers['x-api-key']);
  const authorization = headerValue(req.headers.authorization);
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return direct ?? bearer;
}

function isApplicationKey(key: string | undefined | null): boolean {
  if (!READ_API_KEY && !effectiveWriteKey) return true;
  return safeKeyEqual(key, READ_API_KEY) || safeKeyEqual(key, effectiveWriteKey);
}

// Protect every application route. Health and readiness were registered above.
app.use((req, res, next) => {
  if ((!READ_API_KEY && !effectiveWriteKey) || req.method === 'OPTIONS') return next();
  if (isApplicationKey(requestApiKey(req))) return next();
  auditLog('http_auth_rejected', {
    method: req.method,
    path: req.path,
    origin: req.headers.origin ?? null,
  });
  return res.status(401).json({ error: 'Unauthorized' });
});

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 32 * 1024,
  handleProtocols: (protocols) => (protocols.has('millos-scada') ? 'millos-scada' : false),
  verifyClient: (info, callback) => {
    if (wsClients.size >= WS_MAX_CLIENTS) {
      auditLog('websocket_rejected', { reason: 'capacity' });
      callback(false, 503, 'WebSocket capacity reached');
      return;
    }
    if (!isOriginAllowed(info.origin, allowedOrigins, isProduction)) {
      auditLog('websocket_rejected', { reason: 'origin', origin: info.origin ?? null });
      callback(false, 403, 'Forbidden origin');
      return;
    }

    const headerKey = headerValue(info.req.headers['x-api-key']);
    const bearer = headerValue(info.req.headers.authorization)?.match(/^Bearer\s+(.+)$/i)?.[1];
    const protocolKey = decodeWebSocketKeyProtocol(
      headerValue(info.req.headers['sec-websocket-protocol'])
    );
    const providedKey = headerKey ?? bearer ?? protocolKey;

    if (!isApplicationKey(providedKey)) {
      auditLog('websocket_auth_rejected', { origin: info.origin ?? null });
      callback(false, 401, 'Unauthorized');
      return;
    }
    (info.req as AuthenticatedUpgradeRequest).scadaCanWrite =
      WRITES_ENABLED &&
      (effectiveWriteKey ? safeKeyEqual(providedKey, effectiveWriteKey) : !isProduction);
    callback(true);
  },
});
const HEARTBEAT_MS = 30000;

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

wss.on('connection', (ws, request) => {
  console.log('[WS] Client connected');
  const client = ws as SafeWebSocket;
  client.isAlive = true;
  client.messageWindowStartedAt = Date.now();
  client.messageCount = 0;
  client.canWrite = (request as AuthenticatedUpgradeRequest).scadaCanWrite ?? false;
  client.subscriptions = new Set();
  wsClients.add(client);

  client.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('message', (message) => {
    const now = Date.now();
    if (
      client.messageWindowStartedAt === undefined ||
      now - client.messageWindowStartedAt >= 60_000
    ) {
      client.messageWindowStartedAt = now;
      client.messageCount = 0;
    }
    client.messageCount = (client.messageCount ?? 0) + 1;
    if (client.messageCount > WS_MESSAGE_RATE_MAX) {
      auditLog('websocket_rate_limited', {});
      client.close(1008, 'Message rate limit exceeded');
      return;
    }

    try {
      const data = JSON.parse(message.toString());
      handleWSMessage(client, data);
    } catch (err) {
      console.error('[WS] Invalid message:', err);
      sendWSError(client, 'Invalid JSON message');
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
  });

  // The maintained browser client subscribes immediately after opening. Wait
  // for that bounded request before sending a snapshot so clients receive only
  // the tags they explicitly requested.
});

// Valid WebSocket message types
const VALID_WS_MESSAGE_TYPES = ['subscribe', 'unsubscribe', 'write'] as const;
type ValidWSMessageType = (typeof VALID_WS_MESSAGE_TYPES)[number];

function sendWSError(ws: SafeWebSocket, error: string): void {
  // `message` mirrors the former proxy shape for one compatibility window.
  // The maintained client reads the canonical `error` field.
  ws.send(JSON.stringify({ type: 'error', error, message: error }));
}

function handleWSMessage(ws: SafeWebSocket, data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    sendWSError(ws, 'Message must be a JSON object');
    return;
  }
  const message = data as {
    type?: unknown;
    tagId?: unknown;
    tagIds?: unknown;
    value?: unknown;
  };

  // Input validation: Ensure message type is valid
  if (
    typeof message.type !== 'string' ||
    !VALID_WS_MESSAGE_TYPES.includes(message.type as ValidWSMessageType)
  ) {
    console.warn('[WS] Invalid message type:', message.type);
    sendWSError(ws, `Invalid message type: ${String(message.type)}`);
    return;
  }

  switch (message.type) {
    case 'subscribe':
    case 'unsubscribe': {
      const validated = validateSubscriptionTagIds(message.tagIds, (tagId) =>
        Boolean(tagRegistry.getTagDefinition(tagId))
      );
      if (!validated.ok) {
        sendWSError(ws, validated.error);
        return;
      }

      if (!applySubscriptionChange(ws.subscriptions!, message.type, validated.tagIds)) {
        sendWSError(ws, 'Subscription limit exceeded');
        return;
      }
      if (message.type === 'unsubscribe') return;

      const tags = validated.tagIds
        .map((tagId) => tagRegistry.getValue(tagId))
        .filter((tag): tag is NonNullable<typeof tag> => tag !== null);
      ws.send(JSON.stringify({ type: 'snapshot', tags }));
      break;
    }

    case 'write':
      if (!ws.canWrite) {
        auditLog('write_rejected', { reason: WRITES_ENABLED ? 'write_auth' : 'writes_disabled' });
        sendWSError(ws, WRITES_ENABLED ? 'Write authorization required' : 'Writes are disabled');
        return;
      }
      // Input validation: Ensure tagId is a non-empty string
      if (!message.tagId || typeof message.tagId !== 'string' || message.tagId.trim() === '') {
        console.warn('[WS] Invalid tagId for write operation');
        sendWSError(ws, 'tagId must be a non-empty string');
        return;
      }

      if (message.value === undefined) {
        console.warn('[WS] Write operation missing value');
        sendWSError(ws, 'Write operation requires a value');
        return;
      }

      const tag = tagRegistry.getTagDefinition(message.tagId);
      if (!tag) {
        sendWSError(ws, `Unknown tag ${message.tagId}`);
        return;
      }

      const validation = validateWrite(tag, message.value);
      if (!validation.ok) {
        sendWSError(ws, validation.error ?? 'Invalid value');
        return;
      }

      void handleTagWrite(tag.id, validation.value);
      break;

    default:
      console.warn('[WS] Unknown message type:', message.type);
  }
}

function broadcastTagUpdate(tagId: string, value: unknown, quality: string) {
  const message = JSON.stringify({
    type: 'update',
    tagId,
    value,
    quality,
    timestamp: Date.now(),
  });

  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && isTagSubscribed(client.subscriptions, tagId)) {
      client.send(message);
    }
  });
}

// ============================================================================
// REST API Routes
// ============================================================================

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
  const { tagIds } = req.body as { tagIds?: unknown };

  if (
    !Array.isArray(tagIds) ||
    tagIds.length > 256 ||
    !tagIds.every((tagId) => typeof tagId === 'string' && tagId.length > 0 && tagId.length <= 256)
  ) {
    res.status(400).json({
      error: 'tagIds must be an array of at most 256 non-empty strings up to 256 characters',
    });
    return;
  }

  const tags = tagIds
    .map((id) => tagRegistry.getValue(id))
    .filter((v): v is NonNullable<typeof v> => v !== null);

  res.json({
    tags,
    serverTime: Date.now(),
  });
});

// Get all tag values
app.get('/tags', (_req: Request, res: Response) => {
  const tags = tagRegistry.getAllValues();
  res.json({
    tags,
    serverTime: Date.now(),
  });
});

// Write to tag
app.put('/tags/:tagId', writeLimiter, async (req: Request, res: Response) => {
  if (!WRITES_ENABLED) {
    res.status(403).json({ error: 'Writes are disabled' });
    return;
  }
  if (effectiveWriteKey && !safeKeyEqual(requestApiKey(req), effectiveWriteKey)) {
    res.status(403).json({ error: 'Write authorization required' });
    return;
  }
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
    wsClients: wsClients.size,
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

  // Load and validate tag definitions before opening any industrial connection.
  await tagRegistry.loadTags();

  // Initialize OPC-UA adapter if configured
  const opcuaEndpoint = process.env.OPCUA_ENDPOINT;
  if (opcuaEndpoint) {
    console.log(`[OPC-UA] Connecting to ${opcuaEndpoint}...`);
    opcuaAdapter = new OPCUAAdapter(opcuaEndpoint);
    tagRegistry
      .getTagsByProtocol('opcua')
      .forEach((tag) => opcuaAdapter?.registerTag(tag.id, tag.address, tag.dataType));
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
    const modbusPort = parseBoundedInteger(process.env.MODBUS_PORT, 502, 1, 65535);
    console.log(`[Modbus] Connecting to ${modbusHost}:${modbusPort}...`);
    modbusAdapter = new ModbusAdapter(modbusHost, modbusPort);
    tagRegistry.getTagsByProtocol('modbus').forEach((tag) => {
      const config: ModbusTagConfig = {
        tagId: tag.id,
        slaveId: tag.modbusSlave!,
        registerType: tag.modbusRegister!,
        address: tag.modbusOffset!,
        count: tag.dataType === 'FLOAT32' || tag.dataType === 'INT32' ? 2 : 1,
        dataType: tag.dataType as ModbusTagConfig['dataType'],
        byteSwap: tag.modbusByteSwap,
        wordSwap: tag.modbusWordSwap,
      };
      modbusAdapter?.registerTag(config);
    });
    try {
      await modbusAdapter.connect();
      console.log('[Modbus] Connected');
    } catch (err) {
      console.error('[Modbus] Connection failed:', err);
    }
  }

  // Start polling
  pollTags();

  // Start HTTP server
  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[WebSocket] Available at ws://localhost:${PORT}/ws`);
    console.log('='.repeat(60));
  });
}

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Shutdown] ${signal} received, stopping...`);

  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }

  clearInterval(heartbeat);

  wsClients.forEach((client) => client.close());
  wss.close();

  if (opcuaAdapter) {
    await opcuaAdapter.disconnect();
  }

  if (modbusAdapter) {
    await modbusAdapter.disconnect();
  }

  await new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  console.log('[Shutdown] Complete');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('[Shutdown] Failed:', error);
        process.exit(1);
      });
  });
}

start().catch((err) => {
  console.error('[Fatal] Startup failed:', err);
  process.exit(1);
});
