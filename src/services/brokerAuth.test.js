import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverBrokerById,
  fetchBrokerList,
  getBrokerDisplayServerName,
  getBrokerSelectionId,
  loginManager,
  resolveBrokerSelection,
  resolveDefaultBrokerSelectionId,
} from './brokerAuth.js';

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
  delete globalThis.fetch;
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
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
  assert.equal(fetchCalls[0].url, 'https://superbackend.orrnn.com/api/v2/broker/servers');
  assert.equal(fetchCalls[0].options.credentials, 'omit');
  assert.equal(brokers.length, 1);
  assert.equal(brokers[0].broker_id, 'testorrnn');
  assert.equal(brokers[0].server, 'broker-server-42');
  assert.equal(getBrokerSelectionId(brokers[0]), 'broker-server-42');
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

test('getBrokerDisplayServerName prefers the real GTA server address over the opaque server handle', () => {
  const broker = {
    broker_id: 'gta_broker',
    broker_name: 'Grow Trading Academy',
    server: 'broker-server-2',
  };

  assert.equal(getBrokerDisplayServerName(broker), '103.91.186.142');
  assert.equal(getBrokerSelectionId(broker), 'broker-server-2');
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
  assert.equal(fetchCalls[0].url, 'https://testbrokerbackend.orrnn.com/manager/api/v2/auth/login');
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), {
    user: '1001',
    password: 'secret',
    server: 'broker-server-42',
  });
});
