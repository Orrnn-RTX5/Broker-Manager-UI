import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverBrokerById,
  fetchBrokerList,
  buildBrokerDiscoveryUrl,
  getBrokerDisplayServerName,
  getBrokerSelectionId,
  loginManager,
  resolveBrokerSelection,
  resolveDefaultBrokerSelectionId,
  resolveInteractiveBrokerSelection,
  MOCK_BROKER_LIST,
} from './brokerAuth.js';
import { normalizeBrokerInfo } from '../config/backendTarget.js';

const DISCOVERY_BASE_URL = 'https://discovery.example.test';
const withDiscovery = (config = {}) => ({ DISCOVERY_BASE_URL, ...config });
const TEST_BROKER_ENV = {
  TEST_BROKER_PUBLIC_BACKEND_URL: 'https://test-broker.example.test',
  TEST_BROKER_DIRECT_HOST: '198.51.100.30',
  TEST_BROKER_DIRECT_PORT: '8443',
  TEST_BROKER_WS_URL: 'wss://test-broker.example.test/ws/feed',
  TEST_BROKER_FEED_STATUS_URL: 'https://test-broker.example.test/ws/feed/status',
  TEST_BROKER_DEFAULT_MT5_SERVER: '198.51.100.30',
};

test('local fxtrust discovery preserves its real identity and loopback endpoints', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery({
    LOCAL_BACKEND: 'true', BROKER_ID: 'fxtrust', BACKEND_TARGET: 'desktop',
    API_HOST: 'http://127.0.0.1:8091', API_HOST_EXT: 'http://127.0.0.1:8091',
    FEED_WS_URL: 'ws://127.0.0.1:8094/ws/feed',
    DEFAULT_MT5_SERVER: '127.0.0.1:8091',
  });
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify([
    { broker_id: 'fxtrust', broker_name: 'FX Trust Local', server: 'broker-server-3' },
  ]) });
  const brokers = await fetchBrokerList();
  assert.equal(brokers.length, 1);
  assert.equal(brokers[0].broker_id, 'fxtrust');
  assert.equal(brokers[0].name, 'FX Trust Local');
  assert.equal(brokers[0].backend_url, 'http://127.0.0.1:8091');
  assert.equal(brokers[0].feed_ws_url, 'ws://127.0.0.1:8094/ws/feed');
  assert.equal(getBrokerSelectionId(brokers[0]), 'broker-server-3');
});

const createStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => store.set(String(key), String(value)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
  };
};

let fetchCalls;

beforeEach(() => {
  fetchCalls = [];
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery();
  globalThis.sessionStorage = createStorage();
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ brokers: [] }),
    };
  };
});

afterEach(() => {
  delete globalThis.__RTX_RUNTIME_CONFIG__;
  delete globalThis.fetch;
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
  delete globalThis.__RTX_RUNTIME_CONFIG__;
});

test('fetchBrokerList uses the v2 public broker discovery contract and preserves opaque server handles', async () => {
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        servers: [
          {
            broker_id: 'testorrnn',
            name: 'Test ORRNN',
            status: 'active',
            server: 'broker-server-42',
            backend_url: 'https://testbrokerbackend.orrnn.com',
          },
          {
            broker_id: 'disabled',
            name: 'Disabled',
            status: 'disabled',
            server: 'broker-server-disabled',
          },
        ],
      }),
    };
  };

  const brokers = await fetchBrokerList();

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, `${DISCOVERY_BASE_URL}/api/v2/broker/servers`);
  assert.equal(fetchCalls[0].options.credentials, 'same-origin');
  assert.equal(brokers.length, 1);
  assert.equal(brokers[0].broker_id, 'testorrnn');
  assert.equal(brokers[0].server, 'broker-server-42');
  assert.equal(getBrokerSelectionId(brokers[0]), 'broker-server-42');
});

test('an empty discovery response does not silently select a different broker', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery({ BROKER_ID: 'orrnn' });
  const brokers = await fetchBrokerList();
  assert.deepEqual(brokers, []);
  const selection = resolveBrokerSelection(brokers, { runtimeBrokerId: 'orrnn' });
  assert.equal(selection.brokerId, '');
  assert.equal(selection.source, 'runtime-broker-missing');
});

test('Orrnn discovery keeps its server handle while the env supplies public endpoints', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery({
    BROKER_ID: 'orrnn',
    API_HOST: 'https://service.orrnn.com',
    WS_HOST: 'wss://service.orrnn.com',
  });
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([{
      broker_id: 'Orrnn',
      broker_name: 'ORRNN',
      server: '51.195.188.172:443',
      server_url: 'https://51.195.188.172:443',
      feed_ws_url: 'ws://51.195.188.172/ws/feed',
    }]),
  });

  const brokers = await fetchBrokerList();
  const selection = resolveBrokerSelection(brokers, { runtimeBrokerId: 'orrnn' });
  assert.equal(selection.brokerId, '51.195.188.172:443');
  assert.equal(selection.broker.backend_url, 'https://service.orrnn.com');
});

test("broker discovery uses Vite's same-origin proxy when enabled", () => {
  assert.equal(buildBrokerDiscoveryUrl(true), '/discovery-api/api/v2/broker/servers');
  assert.equal(
    buildBrokerDiscoveryUrl(false),
    `${DISCOVERY_BASE_URL}/api/v2/broker/servers`
  );
  delete globalThis.__RTX_RUNTIME_CONFIG__;
  assert.equal(buildBrokerDiscoveryUrl(false), '');
});

test('discoverBrokerById can resolve by the opaque server handle', () => {
  const broker = discoverBrokerById(
    [
      {
        broker_id: 'testorrnn',
        status: 'active',
        server: 'broker-server-42',
      },
    ],
    'broker-server-42'
  );

  assert.equal(broker.broker_id, 'testorrnn');
});

test('server display prefers an explicit broker server over the opaque server handle', () => {
  const broker = {
    broker_id: 'broker-a',
    broker_name: 'Broker A',
    server: 'broker-server-2',
    default_mt5_server: '198.51.100.20',
  };

  assert.equal(getBrokerDisplayServerName(broker), '198.51.100.20');
  assert.equal(getBrokerSelectionId(broker), 'broker-server-2');
});

test('server display hides opaque handles without changing the login selection', () => {
  const broker = {
    broker_id: 'trivanta-markets',
    broker_name: 'Trivanta Markets',
    server: 'broker-server-3',
    default_mt5_server: 'broker-server-3',
    backend_url: 'https://trivanta.orrnn.com',
  };
  assert.equal(getBrokerDisplayServerName(broker), 'trivanta.orrnn.com');
  assert.equal(getBrokerSelectionId(broker), 'broker-server-3');
});

test('resolveDefaultBrokerSelectionId prefers broker matching the current manager hostname', () => {
  const brokers = [
    {
      broker_id: 'alphafx',
      name: 'Alpha FX Markets',
      server: 'broker-alpha',
      domain: 'manager.alphafx.example',
    },
    {
      broker_id: 'myprop_trade',
      name: 'MyProp Trade',
      server: 'broker-myprop',
      domain: 'myprop.trade',
    },
    {
      broker_id: 'gta_broker',
      name: 'Grow Trading Academy',
      server: 'broker-gta',
      manager_url: 'https://manager.growtradingacademy.com/manager-login',
    },
  ];

  assert.equal(
    resolveDefaultBrokerSelectionId(brokers, {
      currentHostname: 'manager.myprop.trade',
      storedBrokerId: 'broker-alpha',
    }),
    'broker-myprop'
  );
  assert.equal(
    resolveDefaultBrokerSelectionId(brokers, {
      currentHostname: 'manager.growtradingacademy.com',
      storedBrokerId: 'broker-alpha',
    }),
    'broker-gta'
  );
});

test('resolveBrokerSelection locks hostname and runtime broker matches only', () => {
  const brokers = [
    {
      broker_id: 'alphafx',
      name: 'Alpha FX Markets',
      server: 'broker-alpha',
      domain: 'manager.alphafx.example',
    },
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      server: 'broker-myprop',
      manager_domain: 'manager.myprop.trade',
    },
  ];

  const hostnameSelection = resolveBrokerSelection(brokers, {
    currentHostname: 'manager.myprop.trade',
    storedBrokerId: 'broker-alpha',
  });
  assert.equal(hostnameSelection.brokerId, 'broker-myprop');
  assert.equal(hostnameSelection.source, 'hostname');
  assert.equal(hostnameSelection.locked, true);

  const runtimeSelection = resolveBrokerSelection(brokers, {
    runtimeBrokerId: 'alphafx',
    storedBrokerId: 'broker-myprop',
  });
  assert.equal(runtimeSelection.brokerId, 'broker-alpha');
  assert.equal(runtimeSelection.source, 'runtime-broker-id');
  assert.equal(runtimeSelection.locked, true);

  const storedSelection = resolveBrokerSelection(brokers, {
    currentHostname: 'localhost',
    runtimeBrokerId: '',
    runtimeHostnames: [],
    storedBrokerId: 'broker-myprop',
  });
  assert.equal(storedSelection.brokerId, 'broker-myprop');
  assert.equal(storedSelection.source, 'stored-broker');
  assert.equal(storedSelection.locked, false);
});

test('resolveDefaultBrokerSelectionId prefers runtime broker id before stored broker', () => {
  const brokers = [
    {
      broker_id: 'alphafx',
      name: 'Alpha FX Markets',
      server: 'broker-alpha',
    },
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      server: 'services.myprop.trade:443',
      domain_name: 'services.myprop.trade',
      manager_domain: '',
    },
  ];

  assert.equal(
    resolveDefaultBrokerSelectionId(brokers, {
      currentHostname: 'manager.myprop.trade',
      runtimeBrokerId: 'myprop-trade',
      storedBrokerId: 'broker-alpha',
    }),
    'services.myprop.trade:443'
  );
});

test('resolveDefaultBrokerSelectionId can match runtime service host when manager domain is missing', () => {
  const brokers = [
    {
      broker_id: 'alphafx',
      name: 'Alpha FX Markets',
      server: 'broker-alpha',
      domains: {
        manager: '',
        services: '',
      },
    },
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      server: 'services.myprop.trade:443',
      domain_name: 'services.myprop.trade',
      domains: {
        manager: '',
        services: 'services.myprop.trade',
      },
    },
  ];

  assert.equal(
    resolveDefaultBrokerSelectionId(brokers, {
      currentHostname: 'manager.myprop.trade',
      runtimeBrokerId: '',
      runtimeHostnames: ['https://services.myprop.trade'],
      storedBrokerId: 'broker-alpha',
    }),
    'services.myprop.trade:443'
  );
});

test('fetchBrokerList normalizes known MyProp typo service domain', async () => {
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        servers: [
          {
            broker_id: 'myprop-trade',
            name: 'MyProp',
            status: 'active',
            server: 'services.myprop.trade:443',
            backend_url: 'https://services.myprop.trad.app',
          },
        ],
      }),
    };
  };

  const brokers = await fetchBrokerList();
  assert.equal(brokers[0].backend_url, 'https://services.myprop.trade');
});

test('resolveDefaultBrokerSelectionId falls back to stored broker and then response order', () => {
  const brokers = [
    {
      broker_id: 'alphafx',
      name: 'Alpha FX Markets',
      server: 'broker-alpha',
    },
    {
      broker_id: 'myprop_trade',
      name: 'MyProp Trade',
      server: 'broker-myprop',
    },
  ];

  assert.equal(
    resolveDefaultBrokerSelectionId(brokers, {
      currentHostname: 'unknown.example',
      storedBrokerId: 'myprop_trade',
    }),
    'broker-myprop'
  );
  assert.equal(
    resolveDefaultBrokerSelectionId(brokers, {
      currentHostname: 'unknown.example',
      storedBrokerId: 'missing',
    }),
    'broker-alpha'
  );
});

test('resolveInteractiveBrokerSelection keeps desktop broker selection unlocked and prefers stored broker', () => {
  const brokers = [
    {
      broker_id: 'gta_broker',
      name: 'Grow Trading Academy',
      server: 'services.growtradingacademy.com:443',
      domains: {
        manager: 'manager.growtradingacademy.com',
        services: 'services.growtradingacademy.com',
      },
    },
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      server: 'services.myprop.trade:443',
      domains: {
        manager: 'manager.myprop.trade',
        services: 'services.myprop.trade',
      },
    },
  ];

  const selection = resolveInteractiveBrokerSelection(brokers, {
    currentHostname: 'manager.growtradingacademy.com',
    runtimeBrokerId: 'gta_broker',
    runtimeHostnames: ['https://services.growtradingacademy.com'],
    storedBrokerId: 'services.myprop.trade:443',
    recentBrokerIds: ['services.growtradingacademy.com:443'],
  });

  assert.equal(selection.brokerId, 'services.myprop.trade:443');
  assert.equal(selection.source, 'stored-broker');
  assert.equal(selection.locked, false);
});

test('resolveInteractiveBrokerSelection prefers recent broker before response order', () => {
  const brokers = [
    {
      broker_id: 'gta_broker',
      name: 'Grow Trading Academy',
      server: 'services.growtradingacademy.com:443',
    },
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      server: 'services.myprop.trade:443',
    },
  ];

  const selection = resolveInteractiveBrokerSelection(brokers, {
    currentHostname: 'manager.growtradingacademy.com',
    runtimeBrokerId: 'gta_broker',
    runtimeHostnames: ['https://services.growtradingacademy.com'],
    storedBrokerId: 'missing',
    recentBrokerIds: ['services.myprop.trade:443'],
  });

  assert.equal(selection.brokerId, 'services.myprop.trade:443');
  assert.equal(selection.source, 'recent-broker');
  assert.equal(selection.locked, false);
});

test('resolveInteractiveBrokerSelection falls back to first broker unlocked', () => {
  const brokers = [
    {
      broker_id: 'gta_broker',
      name: 'Grow Trading Academy',
      server: 'services.growtradingacademy.com:443',
    },
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      server: 'services.myprop.trade:443',
    },
  ];

  const selection = resolveInteractiveBrokerSelection(brokers, {
    currentHostname: 'manager.growtradingacademy.com',
    runtimeBrokerId: 'gta_broker',
    runtimeHostnames: ['https://services.growtradingacademy.com'],
    storedBrokerId: 'missing',
    recentBrokerIds: ['missing-recent'],
  });

  assert.equal(selection.brokerId, 'services.growtradingacademy.com:443');
  assert.equal(selection.source, 'first-broker');
  assert.equal(selection.locked, false);
});

test('loginManager sends the selected opaque server handle to the broker backend', async () => {
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: 'manager-token', login: 1001 }),
    };
  };

  await loginManager(
    {
      broker_id: 'testorrnn',
      name: 'Test ORRNN',
      status: 'active',
      server: 'broker-server-42',
      backend_url: 'https://testbrokerbackend.orrnn.com',
    },
    { user: '1001', password: 'secret', server: 'broker-server-42' }
  );

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://testbrokerbackend.orrnn.com/api/v1/manager/auth/login');
  assert.equal(fetchCalls[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    user: '1001',
    password: 'secret',
    server: 'broker-server-42',
  });
});

test('loginManager uses the documented native manager auth route for MyProp broker backend', async () => {
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: 'manager-token', login: 10017 }),
    };
  };

  await loginManager(
    {
      broker_id: 'myprop-trade',
      name: 'MyProp',
      status: 'active',
      server: 'services.myprop.trade:443',
      backend_url: 'https://services.myprop.trade',
      server_ip: '185.204.168.202',
    },
    { user: '10017', password: 'secret', server: 'services.myprop.trade:443' }
  );

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://services.myprop.trade/api/v1/manager/auth/login');
});

test('normalizeBrokerInfo attaches explicit test broker defaults', () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery(TEST_BROKER_ENV);
  const normalized = normalizeBrokerInfo({
    broker_id: 'TEST',
    broker_name: 'RTX5-Local-Test-Broker',
    server: 'broker-server-3',
  });

  assert.equal(normalized.broker_id, 'TEST');
  assert.equal(normalized.server, 'broker-server-3');
  assert.equal(normalized.backend_url, 'https://test-broker.example.test');
  assert.equal(normalized.api_url, 'https://test-broker.example.test');
  assert.equal(normalized.server_ip, '198.51.100.30');
  assert.equal(normalized.server_port, 8443);
  assert.equal(normalized.ws_url, 'wss://test-broker.example.test/ws/feed');
  assert.equal(normalized.feed_ws_url, 'wss://test-broker.example.test/ws/feed');
  assert.equal(normalized.default_mt5_server, '198.51.100.30');
});

test('normalizeBrokerInfo fails closed when no test broker endpoints are configured', () => {
  const normalized = normalizeBrokerInfo({
    broker_id: 'TEST',
    broker_name: 'RTX5-Local-Test-Broker',
    server: 'broker-server-3',
  });

  assert.equal(normalized.backend_url, '');
  assert.equal(normalized.api_url, undefined);
  assert.equal(normalized.server_ip, '');
  assert.equal(normalized.ws_url, undefined);
  assert.equal(normalized.feed_ws_url, undefined);
  assert.equal(normalized.feed_status_url, undefined);
  assert.equal(normalized.default_mt5_server, undefined);
});

test('fetchBrokerList attaches explicit test broker defaults returned from discovery', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery(TEST_BROKER_ENV);
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        servers: [
          {
            broker_id: 'TEST',
            broker_name: 'RTX5-Local-Test-Broker',
            server: 'broker-server-3',
          },
        ],
      }),
    };
  };

  const brokers = await fetchBrokerList();
  assert.equal(brokers.length, 1);
  assert.equal(brokers[0].broker_id, 'TEST');
  assert.equal(brokers[0].backend_url, 'https://test-broker.example.test');
  assert.equal(brokers[0].server_ip, '198.51.100.30');
  assert.equal(brokers[0].server_port, 8443);
});

test('MOCK_BROKER_LIST keeps entries without hardcoded host defaults', () => {
  const testBroker = MOCK_BROKER_LIST.find((b) => b.broker_id === 'TEST');
  assert.ok(testBroker);
  assert.equal(testBroker.backend_url, '');
  assert.equal(testBroker.server, '');
  assert.equal(testBroker.server_ip, '');
  assert.equal(testBroker.ws_url, '');
  assert.equal(testBroker.feed_ws_url, '');
});

test('MOCK_BROKER_LIST reads explicit test, Nexa and mock broker runtime settings', async () => {
  globalThis.__RTX_RUNTIME_CONFIG__ = withDiscovery({
    ...TEST_BROKER_ENV,
    NEXA_BACKEND_URL: 'https://nexa.example.test',
    NEXA_SERVER_IP: '198.51.100.40',
    NEXA_WS_URL: 'wss://nexa.example.test/ws/feed',
    NEXA_FEED_STATUS_URL: 'https://nexa.example.test/ws/feed/status',
    NEXA_DEFAULT_MT5_SERVER: '198.51.100.40',
    MOCK_BROKER_TENANT_BACKEND_URL: 'https://mock-tenant.example.test',
    MOCK_BROKER_DEMO_BACKEND_URL: 'https://mock-demo.example.test',
  });
  const { MOCK_BROKER_LIST: configuredMockList } = await import(`./brokerAuth.js?mock-env=${Date.now()}`);

  const testBroker = configuredMockList.find((b) => b.broker_id === 'TEST');
  assert.equal(testBroker.backend_url, 'https://test-broker.example.test');
  assert.equal(testBroker.ws_url, 'wss://test-broker.example.test/ws/feed');

  const nexaBroker = configuredMockList.find((b) => b.broker_id === 'Nexa');
  assert.equal(nexaBroker.backend_url, 'https://nexa.example.test');
  assert.equal(nexaBroker.ws_url, 'wss://nexa.example.test/ws/feed');

  const mockTenant = configuredMockList.find((b) => b.broker_id === 'MOCK-TENANT');
  assert.equal(mockTenant.backend_url, 'https://mock-tenant.example.test');
  const mockDemo = configuredMockList.find((b) => b.broker_id === 'MOCK-DEMO');
  assert.equal(mockDemo.backend_url, 'https://mock-demo.example.test');
});
