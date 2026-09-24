# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

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

### Env Modes

The manager app's `dev`, `build`, and Electron scripts all load `.env.terminal` (`vite --mode terminal`). Keep the active broker in that one file. To switch brokers, change `VITE_BROKER_ID`, `VITE_FEED_BROKER_ID`, `VITE_API_HOST`, `VITE_API_HOST_EXT`, `VITE_WS_HOST`, `VITE_WS_FEED_PATH`, `VITE_DEFAULT_MT5_SERVER`, and `VITE_DISCOVERY_BASE_URL`, then restart the dev server or rebuild the app. Set `VITE_USE_MOCK_DISCOVERY=false` for the real discovery service. If the new feed requires a token, set `VITE_FEED_BROKER_TOKEN`, `VITE_FEED_AUTH_REQUIRED=true`, and `VITE_FEED_SEND_TOKEN=true` in the same file.

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

`brokers.json` contains deploy metadata. GitHub Actions can also use a `BROKERS_JSON` secret with the same shape.

Required deployment secret:

```text
BROKER_SSH_PRIVATE_KEY
GHCR_USERNAME
```

On push to `main`, `.github/workflows/deploy.yml`:

```text
1. runs npm ci
2. runs npm run build
3. builds and pushes a Docker image to GHCR
4. deploys enabled broker entries over SSH
5. passes BACKEND_TARGET, API_HOST, API_HOST_EXT, WS_HOST, DEFAULT_MT5_SERVER, DISCOVERY_BASE_URL, and USE_MOCK_DISCOVERY into the container
6. configures nginx for the broker `domain`
7. issues or renews SSL with certbot when `https` is true
```

The checked-in GTA deployment uses `manager.growtradingacademy.com` as the UI host and proxies nginx to the local Docker app port `127.0.0.1:8082`. Nginx setup is idempotent: once the active vhost, certificate, and proxy target are correct, CI/CD updates only the Docker container and skips nginx/certbot. The backend services domain must have its own valid SSL certificate. Do not use HTTPS directly against broker IP addresses.

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
