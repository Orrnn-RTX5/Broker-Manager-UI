# RTX-5 Broker Manager UI

The manager UI is a Vite/React application with web and Electron builds.

## Local setup

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.terminal` and set the local broker endpoints before starting the dev server. This file is kept outside Git. Run `npm test` for unit tests and `npm run build` to compile the renderer.

## Broker Target Routing

The app resolves broker backend URLs through `src/config/backendTarget.js`.

Default target mode is `web`. Target mode can be set at build time or runtime with:

```env
VITE_BACKEND_TARGET=web
VITE_BACKEND_TARGET=desktop
```

Runtime config also supports `BACKEND_TARGET`, `VITE_BACKEND_TARGET`, `BACKEND_MODE`, and `VITE_BACKEND_MODE`.

Web mode uses the broker public HTTPS backend domain. Desktop/Electron mode also prefers configured HTTPS domains, and only uses direct IP/localhost targets when a broker explicitly provides them.

For Grow Trading Academy:

```text
UI domain: manager.growtradingacademy.com
Web backend: https://services.growtradingacademy.com
Desktop backend: https://services.growtradingacademy.com
```

Do not use `manager.growtradingacademy.com` as an API URL. It is only the UI deployment host.

### Broker List Shape

`GET /api/v1/broker/servers` should return active brokers like:

```json
{
  "broker_id": "grow-trading-academy",
  "name": "Grow Trading Academy",
  "status": "active",
  "backend_url": "https://services.growtradingacademy.com",
  "server_ip": "103.91.186.142",
  "server_port": 8091,
  "env": {
    "BACKEND_TARGET": "web",
    "API_HOST": "https://services.growtradingacademy.com",
    "API_HOST_EXT": "https://services.growtradingacademy.com",
    "WS_HOST": "wss://services.growtradingacademy.com",
    "DEFAULT_MT5_SERVER": "103.91.186.142",
    "DISCOVERY_BASE_URL": "https://superbackend.orrnn.com",
    "USE_MOCK_DISCOVERY": "false"
  }
}
```

Supported public web fields include `web_backend_url`, `web_api_url`, `public_backend_url`, `public_api_url`, `backend_url`, `api_url`, `server_url`, `backend_domain`, `api_domain`, `service_domain`, `services_domain`, and `web_backend_domain`.

Supported desktop fields include `desktop_backend_url`, `desktop_api_url`, `local_backend_url`, `ip_backend_url`, `server_ip`, `host`, `ip`, `server_port`, `backend_port`, and `api_port`.

`domain` is treated as the UI host only. It is not used as a backend API URL.

### Direct market data through the manager session

For a broker whose LP feed publishes ticks through the manager backend, set
`VITE_MARKET_DATA_SOURCE=manager`. The UI requests a single-use `/OnTick` ticket
from `/api/v1/manager/ws-ticket` using the logged-in manager session, then opens
`/manager/OnTick` (or `/OnTick` when the manager prefix is disabled). Each reconnect
requests a new ticket. No bridge feed token is required. Symbol metadata comes
from the manager APIs in this mode, rather than the separate bridge status API.

The default `bridge` mode continues to use the configured `/ws/feed` connection.

### Build modes

The manager app's `dev`, `build`, and Electron scripts use Vite's `terminal` mode. For local work, copy `.env.example` to `.env.terminal` and keep the active broker in that file. Git ignores `.env.terminal`, and Docker excludes it. To switch brokers, change `VITE_BROKER_ID`, `VITE_FEED_BROKER_ID`, `VITE_API_HOST`, `VITE_API_HOST_EXT`, `VITE_WS_HOST`, `VITE_WS_FEED_PATH`, `VITE_DEFAULT_MT5_SERVER`, and `VITE_DISCOVERY_BASE_URL`, then restart the dev server or rebuild the app. Set `VITE_USE_MOCK_DISCOVERY=false` for the real discovery service. The bridge feed URL uses the broker ID and strips legacy token query parameters. Do not put feed credentials in a `VITE_` variable; Vite embeds those values in the browser bundle.

In CI, `MANAGER_UI_ENV` is written to `.env` before the build. The Docker build excludes local `.env.*` files so the deployed bundle uses the CI configuration.

When `VITE_BROKER_ID` is set, the web app uses the configured endpoints and refuses to select another broker if discovery does not return that ID. An existing session for the previous broker is rejected on reload.

Normal web build:

```bash
npm run build
npm run build:web
```

Electron/desktop build:

```bash
npm run build:electron
npm run build:desktop
```

Electron dev script:

```bash
npm run electron:dev
```

### Docker Runtime Config

The Docker image generates `/usr/share/nginx/html/runtime-config.js` at container start.

Supported container env vars:

```env
BACKEND_TARGET=web
API_HOST=https://services.growtradingacademy.com
API_HOST_EXT=https://services.growtradingacademy.com
WS_HOST=wss://services.growtradingacademy.com
DEFAULT_MT5_SERVER=103.91.186.142
DISCOVERY_BASE_URL=https://superbackend.orrnn.com
USE_MOCK_DISCOVERY=false
```

The generated browser global is:

```js
window.__RTX_RUNTIME_CONFIG__
```

`window.RUNTIME_CONFIG` is also assigned as a compatibility alias.

### CI/CD

On pull requests to `main`, `.github/workflows/deploy.yml` installs dependencies, runs tests, and validates the build. On pushes to `main`, it also builds and publishes `ghcr.io/orrnn-rtx5/broker-manager-ui` and deploys one `broker-manager-ui` container to the configured server on port 8082. The workflow uses `MANAGER_UI_ENV` for build configuration and the server-side `broker-manager-ui.env` file for runtime configuration. It requires `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `GHCR_USERNAME`, and `GHCR_TOKEN` secrets for deployment.

The current workflow does not configure host Nginx or request TLS certificates. The separate `.github/scripts/deploy-broker-ui.sh` helper may still be used manually; it is not called by this workflow.

### Validation

Run:

```bash
npm run build
npm run build:electron
npx eslint src/config/backendTarget.js src/config/endpoints.js src/services/brokerAuth.js
```

Manual web test:

```js
window.__RTX_RUNTIME_CONFIG__
sessionStorage.clear()
localStorage.removeItem("authToken")
localStorage.removeItem("refreshToken")
localStorage.removeItem("brokerId")
```

After selecting GTA and logging in, the Network tab must show login requests to:

```text
https://services.growtradingacademy.com/api/v2/...
```

It must not show:

```text
https://103.91.186.142/api/...
https://103.91.186.142:443/...
https://103.91.186.142:8091/...
```

Desktop/Electron mode should prefer the selected broker's HTTPS backend when one is configured. For GTA that resolves to:

```text
https://services.growtradingacademy.com/api/v2/...
```

If a browser tab still runs an older `index-*.js` bundle, hard refresh or clear cache.
