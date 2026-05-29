# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Broker Discovery Login Flow

The login bootstrap starts at `/`, where the user enters a Broker ID and chooses Manager or Admin. The UI normalizes the Broker ID, validates it, discovers the broker backend, stores the response in `sessionStorage` as `broker_info`, and then routes to `/manager-login` or `/admin-login`.

Manager login posts to `{broker_info.backend_url}/manager/api/v2/auth/login` with `user`, `password`, and the read-only `server` value from `broker_info.server_ip`. Admin login posts to `{broker_info.backend_url}/manager/api/v2/admin/login` with `user` and `password`. Successful login responses are stored in `sessionStorage` as `auth`, and the existing localStorage token keys are also updated for the current dashboard APIs.

Discovery is configured with:

```env
VITE_DISCOVERY_BASE_URL=https://superbackend.orrnn.com
VITE_USE_MOCK_DISCOVERY=true
```

`VITE_USE_MOCK_DISCOVERY=true` uses the local `testorrnn` and `orrnn` broker map while the SuperAdmin discovery endpoint is pending. Set it to `false` when `/api/v1/brokers/{broker_id}` is available.
