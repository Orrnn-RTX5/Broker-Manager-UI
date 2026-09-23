# Local Manager UI

Repository: `rtx5-broker-manager-ui`, branch `dipanwita`.

Start the local backend first, then run from this folder:

```powershell
.\scripts\local\start.ps1
```

Open http://localhost:3000. Select **FX Trust Local** and log in with manager **1002**. Its password is `LOCAL_MANAGER_PASSWORD` in the backend's ignored `.env.local` file.

Stop this UI with `.\scripts\local\stop.ps1`.

The ignored `.env.web.local` connects real broker discovery to Gateway8090, manager APIs to Manager8091, report APIs to Reports8095, and market WebSocket to Bridge8094. The Vite proxy keeps browser requests on the UI origin. A local-only runtime configuration plugin prevents the repository's production runtime defaults from overriding these settings. Desktop endpoint resolution is used to permit plain HTTP loopback; this is still the browser UI.

Dependencies and generated build output stay in this repository on D:. Tooling, caches and UI logs stay under `D:\RTX-Support`. UI logs: `D:\RTX-Support\dev-tools\runtime\logs\manager-ui`.

Live market feed remains subject to backend feed configuration. The local database starts without trading accounts or positions. Other broker records are retained by the backend; use the configured FX Trust Local entry for local work.

Position/metrics WebSockets connect separately to Manager8091; market quotes use Bridge8094. The branch also includes preview/demo dashboard metrics and approval items: these are not proof of populated local trading data. The footer identifies this configuration as Local.
