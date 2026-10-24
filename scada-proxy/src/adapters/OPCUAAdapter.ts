/**
 * OPC-UA Adapter for SCADA Proxy
 *
 * Connects to OPC-UA servers to read/write PLC data.
 * Uses node-opcua-client for OPC-UA communication.
 */

import {
  OPCUAClient,
  ClientSession,
  ClientSubscription,
  DataValue,
  AttributeIds,
  StatusCodes,
  StatusCode,
  Variant,
  DataType
} from 'node-opcua-client';

interface TagValue {
  tagId: string;
  value: unknown;
  quality: string;
  timestamp: number;
}

interface ConnectionStatus {
  connected: boolean;
  endpoint?: string;
  lastError?: string;
  reconnectAttempts: number;
}

export class OPCUAAdapter {
  private endpoint: string;
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private subscription: ClientSubscription | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private lastError?: string;

  // Map tagId to OPC-UA NodeId
  private tagNodeMap = new Map<string, string>();

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  /**
   * Connect to OPC-UA server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // SECURITY: Determine environment-aware security configuration
    // In production, we MUST use encryption and signing to prevent:
    // - Man-in-the-middle attacks intercepting PLC data
    // - Unauthorized command injection to industrial equipment
    // - Data tampering during transmission
    const isDev = process.env.NODE_ENV === 'development';

    // Security modes: 1=None, 2=Sign, 3=SignAndEncrypt
    // Security policies: None, Basic128Rsa15, Basic256, Basic256Sha256
    const securityMode = isDev ? 1 : 3;
    const securityPolicy = isDev ? 'None' : 'Basic256Sha256';

    if (isDev) {
      console.warn('[OPCUAAdapter] WARNING: Running with NO security (development mode)');
      console.warn('[OPCUAAdapter] Production deployments MUST set NODE_ENV=production');
    }

    this.client = OPCUAClient.create({
      applicationName: 'MillOS-SCADA-Proxy',
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 5,
        maxDelay: 10000
      },
      securityMode, // 1=None (dev only), 3=SignAndEncrypt (production)
      securityPolicy // 'None' (dev only), 'Basic256Sha256' (production)
    });

    // Keep the native PKI store; only explicit development may auto-trust certificates.
    this.client.clientCertificateManager.automaticallyAcceptUnknownCertificate = isDev;

    try {
      await this.client.connect(this.endpoint);
      this.session = await this.client.createSession();
      this.connected = true;
      this.reconnectAttempts = 0;
      this.lastError = undefined;

      console.log(`[OPCUAAdapter] Connected to ${this.endpoint}`);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.reconnectAttempts++;
      throw err;
    }
  }

  /**
   * Disconnect from OPC-UA server
   */
  async disconnect(): Promise<void> {
    if (this.subscription) {
      await this.subscription.terminate();
      this.subscription = null;
    }

    if (this.session) {
      await this.session.close();
      this.session = null;
    }

    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }

    this.connected = false;
    console.log('[OPCUAAdapter] Disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.session !== null;
  }

  /**
   * Get connection status
   */
  getStatus(): ConnectionStatus {
    return {
      connected: this.connected,
      endpoint: this.endpoint,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Register tag to NodeId mapping
   */
  registerTag(tagId: string, nodeId: string): void {
    this.tagNodeMap.set(tagId, nodeId);
  }

  /**
   * Read values for multiple tags
   */
  async readValues(tagIds: string[]): Promise<TagValue[]> {
    if (!this.session) {
      throw new Error('Not connected');
    }

    const nodeIds = tagIds.map((id) => {
      const nodeId = this.tagNodeMap.get(id);
      if (!nodeId) {
        // Try to parse as OPC-UA address directly
        return id;
      }
      return nodeId;
    });

    try {
      const dataValues = await this.session.read(
        nodeIds.map((nodeId) => ({
          nodeId,
          attributeId: AttributeIds.Value
        }))
      );

      return dataValues.map((dv: DataValue, i: number) => ({
        tagId: tagIds[i],
        value: this.extractValue(dv),
        quality: this.mapStatusCode(dv.statusCode),
        timestamp: dv.sourceTimestamp?.getTime() ?? Date.now()
      }));
    } catch (err) {
      console.error('[OPCUAAdapter] Read error:', err);
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Write value to a tag
   */
  async writeValue(tagId: string, value: unknown): Promise<boolean> {
    if (!this.session) {
      throw new Error('Not connected');
    }

    const nodeId = this.tagNodeMap.get(tagId) ?? tagId;

    try {
      const statusCode = await this.session.write({
        nodeId,
        attributeId: AttributeIds.Value,
        value: {
          value: new Variant({
            dataType: this.inferDataType(value),
            value
          })
        }
      });

      return statusCode.isGood();
    } catch (err) {
      console.error(`[OPCUAAdapter] Write error for ${tagId}:`, err);
      this.lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * Create subscription for real-time updates
   */
  async createSubscription(
    tagIds: string[],
    callback: (tagId: string, value: unknown, quality: string) => void
  ): Promise<void> {
    if (!this.session) {
      throw new Error('Not connected');
    }

    this.subscription = ClientSubscription.create(this.session, {
      requestedPublishingInterval: 500,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10
    });

    // Log subscription lifecycle events
    this.subscription.on('started', () => {
      console.log(`[OPCUAAdapter] Subscription started - ID: ${this.subscription?.subscriptionId}`);
    });

    for (const tagId of tagIds) {
      const nodeId = this.tagNodeMap.get(tagId) ?? tagId;

      const monitoredItem = await this.subscription.monitor(
        { nodeId, attributeId: AttributeIds.Value },
        { samplingInterval: 500, discardOldest: true, queueSize: 10 },
        2 // TimestampsToReturn.Both
      );

      monitoredItem.on('changed', (dataValue: DataValue) => {
        callback(
          tagId,
          this.extractValue(dataValue),
          this.mapStatusCode(dataValue.statusCode)
        );
      });
    }

    console.log(`[OPCUAAdapter] Subscription created for ${tagIds.length} tags`);
  }

  /**
   * Extract value from DataValue
   */
  private extractValue(dv: DataValue): unknown {
    if (!dv.value || dv.value.value === undefined) {
      return null;
    }
    return dv.value.value;
  }

  /**
   * Map OPC-UA StatusCode to quality string
   */
  private mapStatusCode(statusCode: StatusCode): string {
    if (!statusCode) return 'BAD';

    if (statusCode.equals(StatusCodes.Good)) {
      return 'GOOD';
    } else if (statusCode.equals(StatusCodes.Uncertain)) {
      return 'UNCERTAIN';
    } else {
      return 'BAD';
    }
  }

  /**
   * Infer OPC-UA DataType from JS value
   */
  private inferDataType(value: unknown): DataType {
    if (typeof value === 'boolean') {
      return DataType.Boolean;
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return DataType.Int32;
      }
      return DataType.Float;
    } else if (typeof value === 'string') {
      return DataType.String;
    }
    return DataType.Variant;
  }
}
