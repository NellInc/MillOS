// External, unapplied regression proposal for the hash-pinned v4 panel candidate.
// Intended location after adoption: src/components/SCADAPanel.credentials.test.tsx.
// Reuses SCADAPanel.test.tsx fixtures and service/chart mocks. No live transport.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionConfig, TagDefinition, TagHistoryPoint, TagValue } from '../scada/types';
import { setLocale } from '../i18n';
import { useGraphicsStore } from '../stores/graphicsStore';
import { SCADAPanel } from './SCADAPanel';

const testState = vi.hoisted(() => {
  const tags: TagDefinition[] = Array.from({ length: 7 }, (_, index) => ({
    id: `RM101.TT00${index + 1}.PV`,
    name: `Mill temperature ${index + 1}`,
    description: 'Test process temperature',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId: index < 4 ? 'rm-101' : 'silo-0',
    group: 'TEMPERATURE',
  }));
  const values = new Map<string, TagValue>(
    tags.map((tag, index) => [
      tag.id,
      {
        tagId: tag.id,
        value: 40 + index,
        quality: 'GOOD',
        timestamp: Date.now(),
      },
    ])
  );
  return {
    currentConfig: { type: 'simulation' } as ConnectionConfig,
    tags,
    values,
    focus: vi.fn(),
    acknowledge: vi.fn(),
    acknowledgeAll: vi.fn(),
    injectFault: vi.fn(),
    clearAllFaults: vi.fn(),
    exportToCSV: vi.fn(),
    exportToJSON: vi.fn(),
    getHistory: vi.fn(async (): Promise<TagHistoryPoint[]> => []),
    getAlarmHistory: vi.fn(async () => []),
    setConnectionConfig: vi.fn(async (_config: ConnectionConfig) => undefined),
    writeSetpoint: vi.fn(async () => true),
  };
});

vi.mock('../scada', () => ({
  useSCADA: () => ({
    isConnected: true,
    linkUp: true,
    mode: 'simulation',
    tagCount: testState.tags.length,
    values: testState.values,
    tags: testState.tags,
    injectFault: testState.injectFault,
    clearAllFaults: testState.clearAllFaults,
    activeFaults: [],
    exportToCSV: testState.exportToCSV,
    exportToJSON: testState.exportToJSON,
    getHistory: testState.getHistory,
    writeSetpoint: testState.writeSetpoint,
  }),
  useSCADAAlarms: () => ({
    alarms: [],
    summary: { total: 0, unacknowledged: 0, critical: 0, high: 0 },
    acknowledge: testState.acknowledge,
    acknowledgeAll: testState.acknowledgeAll,
    shelve: vi.fn(),
    suppress: vi.fn(),
    takeOutOfService: vi.fn(),
    suppressed: [],
    unsuppress: vi.fn(),
    hasCritical: false,
  }),
  refreshSharedSCADAStatus: vi.fn(),
  getSCADAService: () => ({
    getConnectionConfig: () => testState.currentConfig,
    getAlarmHistory: testState.getAlarmHistory,
    setConnectionConfig: testState.setConnectionConfig,
  }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="trend-chart">{children}</div>
  ),
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Brush: () => null,
}));

const TEST_URL = 'https://scada.example.invalid/api';
const TEST_KEY = 'synthetic-scada-key-A';
const NEXT_KEY = 'synthetic-scada-key-B';

const keyInput = () => screen.getByLabelText('API key', { exact: true });
const enterKey = (value = TEST_KEY) => fireEvent.change(keyInput(), { target: { value } });
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply Settings' }));
const connections = () => fireEvent.click(screen.getByRole('tab', { name: 'Connections' }));

function openConnections(config: ConnectionConfig = { type: 'rest', baseUrl: TEST_URL }) {
  testState.currentConfig = config;
  const view = render(<SCADAPanel isOpen onClose={vi.fn()} />);
  connections();
  return view;
}

async function settledApply() {
  apply();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Apply Settings' })).toBeEnabled());
}

describe('SCADAPanel memory-only connection credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocale('en');
    useGraphicsStore.getState().setSCADAEnabled(true);
    testState.currentConfig = { type: 'simulation' };
    testState.setConnectionConfig.mockReset();
    testState.setConnectionConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    setLocale('en');
  });

  it('never hydrates an earlier service key and submits a fresh replacement without it', async () => {
    openConnections({
      type: 'rest',
      baseUrl: TEST_URL,
      apiKey: TEST_KEY,
      apiKeyAuth: 'x-api-key',
    });
    expect(keyInput()).toHaveValue('');
    expect(screen.getByLabelText('API key header')).toHaveValue('x-api-key');
    expect(keyInput()).toHaveAttribute('type', 'password');
    expect(keyInput()).toHaveAttribute('autocomplete', 'off');
    await settledApply();
    expect(testState.setConnectionConfig).toHaveBeenLastCalledWith({
      type: 'rest',
      baseUrl: TEST_URL,
      pollInterval: 1000,
      apiKeyAuth: 'x-api-key',
    });
  });

  it.each(['bearer', 'x-api-key'] as const)(
    'passes only the explicitly selected REST credential mode %s and retires successful entry',
    async (apiKeyAuth) => {
      openConnections();
      fireEvent.change(screen.getByLabelText('API key header'), { target: { value: apiKeyAuth } });
      enterKey();
      await settledApply();
      expect(testState.setConnectionConfig).toHaveBeenLastCalledWith({
        type: 'rest',
        baseUrl: TEST_URL,
        pollInterval: 1000,
        apiKey: TEST_KEY,
        apiKeyAuth,
      });
      expect(keyInput()).toHaveValue('');
      await settledApply();
      expect(testState.setConnectionConfig.mock.lastCall?.[0]).not.toHaveProperty('apiKey');
    }
  );

  it('clears a draft on a destination or REST header change without reviving it on reversal', () => {
    openConnections();
    enterKey();
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://other.example.invalid/api' },
    });
    expect(keyInput()).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: TEST_URL } });
    expect(keyInput()).toHaveValue('');
    enterKey();
    fireEvent.change(screen.getByLabelText('API key header'), { target: { value: 'x-api-key' } });
    expect(keyInput()).toHaveValue('');
    fireEvent.change(screen.getByLabelText('API key header'), { target: { value: 'bearer' } });
    expect(keyInput()).toHaveValue('');
  });

  it.each(['opcua', 'modbus'] as const)(
    'uses fixed x-api-key for hydrated %s and clears its key when the proxy destination changes',
    async (type) => {
      // The existing selector has no Modbus button; hydration is its real UI entry path.
      openConnections({ type, proxyUrl: TEST_URL, apiKey: NEXT_KEY, apiKeyAuth: 'bearer' });
      expect(keyInput()).toHaveValue('');
      expect(screen.queryByLabelText('API key header')).not.toBeInTheDocument();
      enterKey();
      fireEvent.change(screen.getByLabelText('Proxy URL'), {
        target: { value: 'https://proxy.example.invalid/api' },
      });
      expect(keyInput()).toHaveValue('');
      enterKey();
      await settledApply();
      expect(testState.setConnectionConfig).toHaveBeenLastCalledWith({
        type,
        proxyUrl: 'https://proxy.example.invalid/api',
        apiKey: TEST_KEY,
        apiKeyAuth: 'x-api-key',
      });
      expect(keyInput()).toHaveValue('');
    }
  );

  it.each([
    {
      name: /^MQTT/,
      type: 'mqtt',
      urlLabel: 'Broker URL (WebSocket)',
      url: 'wss://mqtt.example.invalid',
    },
    {
      name: /^WebSocket/,
      type: 'websocket',
      urlLabel: 'WebSocket URL',
      url: 'wss://ws.example.invalid',
    },
  ] as const)(
    'does not carry a REST key into unsupported $type or back',
    async ({ name, type, urlLabel, url }) => {
      openConnections();
      enterKey();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.queryByLabelText('API key', { exact: true })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(urlLabel), { target: { value: url } });
      await settledApply();
      const submitted = testState.setConnectionConfig.mock.lastCall?.[0];
      expect(submitted?.type).toBe(type);
      expect(submitted).not.toHaveProperty('apiKey');
      expect(submitted).not.toHaveProperty('apiKeyAuth');
      fireEvent.click(screen.getByRole('button', { name: /^REST API/ }));
      expect(keyInput()).toHaveValue('');
    }
  );

  it('drops a key on supported protocol changes, reset, close, reopen and remount', () => {
    const view = openConnections();
    enterKey();
    fireEvent.click(screen.getByRole('button', { name: /^OPC-UA/ }));
    expect(keyInput()).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /^REST API/ }));
    expect(keyInput()).toHaveValue('');
    fireEvent.change(screen.getByLabelText('API key header'), { target: { value: 'x-api-key' } });
    enterKey();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    expect(screen.queryByLabelText('API key', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^REST API/ }));
    expect(keyInput()).toHaveValue('');
    expect(screen.getByLabelText('API key header')).toHaveValue('bearer');
    enterKey();
    view.rerender(<SCADAPanel isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('API key', { exact: true })).not.toBeInTheDocument();
    view.rerender(<SCADAPanel isOpen onClose={vi.fn()} />);
    connections();
    expect(keyInput()).toHaveValue('');
    enterKey();
    view.unmount();
    openConnections();
    expect(keyInput()).toHaveValue('');
  });

  it.each([false, true])(
    'preserves a newer draft after stale Apply success (destination changed: %s)',
    async (changeDestination) => {
      let resolveApply!: () => void;
      testState.setConnectionConfig.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveApply = resolve;
          })
      );
      openConnections();
      enterKey();
      apply();
      expect(testState.setConnectionConfig).toHaveBeenCalledTimes(1);
      if (changeDestination) {
        fireEvent.change(screen.getByLabelText('Base URL'), {
          target: { value: 'https://new.example.invalid/api' },
        });
      }
      enterKey(NEXT_KEY);
      await act(async () => {
        resolveApply();
      });
      expect(keyInput()).toHaveValue(NEXT_KEY);
      await settledApply();
      expect(testState.setConnectionConfig).toHaveBeenLastCalledWith({
        type: 'rest',
        baseUrl: changeDestination ? 'https://new.example.invalid/api' : TEST_URL,
        pollInterval: 1000,
        apiKey: NEXT_KEY,
        apiKeyAuth: 'bearer',
      });
      expect(keyInput()).toHaveValue('');
    }
  );

  it('does not write the entry to browser storage during editing, successful Apply or reopen', async () => {
    const view = openConnections();
    // jsdom Storage is a proxy: observe its real prototype for both storage areas.
    const storageWrites = vi.spyOn(Storage.prototype, 'setItem');
    const sentinelKey = 'scada-credential-storage-spy-control';
    const sentinelValue = 'synthetic-harmless-sentinel';
    for (const storage of [localStorage, sessionStorage]) {
      try {
        storage.setItem(sentinelKey, sentinelValue);
        expect(storageWrites).toHaveBeenCalledWith(sentinelKey, sentinelValue);
        expect(storageWrites.mock.contexts.at(-1)).toBe(storage);
      } finally {
        storage.removeItem(sentinelKey);
      }
      storageWrites.mockClear();
    }
    enterKey();
    await settledApply();
    view.rerender(<SCADAPanel isOpen={false} onClose={vi.fn()} />);
    view.rerender(<SCADAPanel isOpen onClose={vi.fn()} />);
    connections();
    expect(keyInput()).toHaveValue('');
    expect(
      storageWrites.mock.calls.some((args) =>
        args.some((value) => String(value).includes(TEST_KEY))
      )
    ).toBe(false);
    // UI/service-boundary proof only: mocked setConnectionConfig cannot establish
    // real SCADAService/adapter persistence or browser password-manager behavior.
  });
});
