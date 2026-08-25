# Backend Fix Prompt: TEST Broker Market Feed Is Connected but Prices Remain Stale

Copy everything below this line and send it to the backend engineer or backend coding agent.

---

## Objective

Investigate, fix, deploy, and prove the complete browser WebSocket market-data flow for the **TEST** broker. The RTX-5 Manager frontend can display cached symbol prices, but users still do not consistently see live price updates.

Do not stop after reporting a possible cause. Implement the backend correction, test it from a real browser-compatible WebSocket client, deploy it to the relevant TEST environment, and return the exact contract/configuration the frontend must use.

## Systems and current frontend configuration

- Manager REST backend: `https://fxtrustbrokerbackend.orrnn.com`
- Broker discovery backend: `https://fxtrustsuperbackned.orrnn.com`
- Intended central market-data WebSocket:
  `wss://fxtrustsuperbackned.orrnn.com/central-market-data/ws/feed?broker_id=TEST`
- Broker-specific legacy WebSocket advertised in some discovery/runtime data:
  `wss://fxtrustbrokerbackend.orrnn.com/ws/feed`
- Current feed status endpoint:
  `https://fxtrustbrokerbackend.orrnn.com/ws/feed/status`
- Broker ID values currently seen in configuration:
  - Central WebSocket query: `TEST`
  - Frontend environment/discovery may use: `test`
- Default MT5 server: `100.120.168.28`
- Frontend runs locally at origins such as:
  - `http://localhost:5173`
  - `http://localhost:5174`
  - `http://localhost:5175`

The frontend opens the WebSocket and then sends:

```json
{"type":"subscribe","symbols":["*"]}
```

The frontend accepts newline-delimited JSON ticks, a single tick object, or a batch under `ticks`, `data`, `quotes`, or `symbols`.

An observed central-feed tick has this shape:

```json
{
  "broker_id": "TEST",
  "symbol": "ZARJPY",
  "bid": 9.939,
  "ask": 9.949,
  "source_timestamp": 1787573419,
  "receive_timestamp": 1787573419915,
  "sequence": 12759610,
  "provider": "equinix"
}
```

At minimum, every usable tick must contain a non-empty `symbol` and a finite numeric `bid` and/or `ask`.

## Confirmed symptoms and evidence

1. A non-browser WebSocket client can connect directly to the central endpoint and receive live ticks.
2. A previous live sample through the localhost proxy received thousands of messages across hundreds of active symbols, proving that some TEST data reaches the central service.
3. The numeric Hong Kong symbols visible in Market Watch, for example `0001.HK`, `0002.HK`, `0003.HK`, `0005.HK`, `0006.HK`, `0011.HK`, `0016.HK`, and `0027.HK`, did not receive a new tick during the live sample. Their displayed values therefore remained cached.
4. Direct browser-style WebSocket upgrades to the central endpoint were observed returning HTTP `403` when an `Origin` header was present. A normal browser always sends an `Origin` header. A non-browser connection without `Origin` succeeded. Local Vite can only work around this by stripping `Origin`; that workaround does not solve direct production-browser access.
5. Broker discovery/runtime data may still advertise the legacy broker-backend `/ws/feed` URL while the intended feed is the central `/central-market-data/ws/feed?broker_id=TEST` URL.
6. `TEST` versus `test` is inconsistent across the explicit WebSocket URL, environment values, and possible discovery records. This can cause the client to connect successfully but subscribe to an empty or wrong broker channel if matching is case-sensitive.
7. The central WebSocket-derived HTTP `/status` route was not available, while the broker-backend `/ws/feed/status` route was used separately. A healthy status response alone does not prove that a browser WebSocket upgrade, broker subscription, and live tick delivery all work.

## Most likely backend-side problems to investigate

Treat these as hypotheses to verify with logs and code, not as permission to guess:

1. **Browser Origin rejection:** the central WebSocket gateway rejects legitimate browser `Origin` headers with `403`.
2. **Wrong discovery contract:** the discovery service returns a stale or incorrect feed URL for the TEST broker.
3. **Broker-ID mismatch:** `TEST` and `test` are routed differently or one form maps to no upstream feed.
4. **Incomplete symbol routing:** the upstream/provider-to-broker mapping broadcasts only a subset of TEST instruments, or the wildcard subscription does not cover the complete TEST symbol set.
5. **No initial snapshot:** a newly connected client receives only future ticks. Symbols whose markets are closed or quiet remain indefinitely on old cached frontend values, with no backend-provided freshness/market-state information.
6. **Missing subscription acknowledgement/errors:** the server accepts the socket but does not clearly confirm the resolved broker, subscription, symbol count, or any rejection reason.
7. **Timestamp/freshness ambiguity:** timestamp units or meanings are undocumented, preventing the frontend from determining whether a tick is current.

## Required backend investigation

Trace one connection end to end using a correlation ID:

1. WebSocket HTTP upgrade at the public gateway.
2. Origin validation and authentication decision.
3. Resolution of query parameter `broker_id`.
4. Canonical broker ID selected internally.
5. Processing of `{"type":"subscribe","symbols":["*"]}`.
6. Upstream/provider connection used for TEST.
7. Number and names of symbols registered for TEST.
8. Tick received from the upstream provider.
9. Broker/channel filtering applied to that tick.
10. Tick serialized and broadcast to this client.

Check server logs and metrics for:

- HTTP status and exact reason for rejected upgrades.
- Requested `Origin` and whether it matched the allowlist.
- Requested and canonical broker IDs.
- Subscription acknowledgement or rejection.
- Connected-client count for TEST.
- Upstream-connected state and last-upstream-tick time.
- Per-broker received, filtered, and broadcast tick counters.
- Last tick time per symbol.
- Dropped-message count and drop reasons.
- Queue/backpressure state.
- Whether the HK symbols belong to TEST and whether their upstream market was closed, unavailable, or incorrectly unmapped.

Never include tokens, passwords, or complete credentials in logs or in the response.

## Required backend fixes

Implement every applicable fix discovered by the investigation.

### 1. Make the WebSocket usable by a real browser

- Accept WebSocket upgrades from the approved RTX-5 Manager production origins.
- In the TEST/dev environment, allow the required localhost origins, including ports `5173`, `5174`, and `5175`, or use a safe configurable localhost-development policy.
- Handle the browser `Origin` header intentionally; do not require a browser to omit a header it cannot omit.
- If direct cross-origin browser WebSockets are intentionally unsupported, provide and document an official same-origin backend proxy endpoint that preserves WebSocket upgrades. Do not rely on a local Vite-only workaround.
- Return an explicit, logged rejection reason for denied origins without exposing secrets.

### 2. Define and normalize the broker ID

- Confirm the single canonical ID for this broker: `TEST` or `test`.
- Normalize broker IDs case-insensitively at the public boundary if IDs are not intentionally case-sensitive.
- Ensure the resolved broker ID is used consistently for upstream selection, subscription channels, status, discovery, and tick payloads.
- Reject unknown broker IDs with a clear close code/message instead of opening a silent empty stream.

### 3. Correct broker discovery

The TEST broker discovery response must return the actual public browser-compatible feed configuration. Return fields equivalent to:

```json
{
  "broker_id": "TEST",
  "feed_wss_url": "wss://fxtrustsuperbackned.orrnn.com/central-market-data/ws/feed?broker_id=TEST",
  "feed_status_https_url": "<working TEST feed status URL>",
  "feed_auth_required": false
}
```

If authentication is actually required, set `feed_auth_required: true` and document the exact secure mechanism. Do not put a long-lived secret in a `VITE_*` variable or require it to be bundled into browser JavaScript. Prefer a short-lived, broker-scoped credential issued after manager authentication, or a secure same-origin session/cookie contract.

Remove or correct any stale discovery field that causes the frontend to choose `wss://fxtrustbrokerbackend.orrnn.com/ws/feed` when that is not the authoritative TEST feed.

### 4. Make subscription behavior explicit

- Accept the current wildcard request:

```json
{"type":"subscribe","symbols":["*"]}
```

- Return a subscription acknowledgement such as:

```json
{
  "type": "subscribed",
  "broker_id": "TEST",
  "requested_symbols": ["*"],
  "resolved_symbol_count": 235,
  "server_time": 1787573419915
}
```

- If wildcard subscriptions are unsupported, return a clear error and provide the exact required request format.
- Keep the connection alive with documented ping/pong or heartbeat behavior.
- Use meaningful WebSocket close codes and a JSON error frame for auth, broker, and subscription failures.

### 5. Provide deterministic initial and live data

After a successful subscription, send one of the following documented contracts:

- An initial snapshot for all TEST symbols followed by incremental ticks; or
- A symbol-state snapshot containing the latest quote, quote timestamp, market/session state, and freshness flag, followed by incremental ticks.

The frontend must not have to mistake an old cached price for a live quote. For symbols without a new tick, return enough information to distinguish:

- market closed;
- instrument disabled;
- no provider mapping;
- provider disconnected;
- quote delayed;
- no quote has ever been received.

If HK instruments are valid TEST instruments, verify their provider mappings and show their last upstream tick time and current market state. Do not manufacture changing prices while a market is closed. If they are not part of TEST, remove them from the TEST symbol metadata/snapshot instead of leaving misleading cached rows.

### 6. Standardize the tick contract

Document and guarantee:

- `broker_id`: canonical string.
- `symbol`: exact frontend symbol identifier.
- `bid` and `ask`: finite JSON numbers, not formatted strings.
- `source_timestamp`: specify seconds or milliseconds since Unix epoch.
- `receive_timestamp`: specify seconds or milliseconds since Unix epoch.
- `sequence`: monotonic scope—global, broker, or symbol.
- `provider`: optional provider identifier.
- Ordering and duplicate-delivery guarantees.
- Whether one frame is JSON, newline-delimited JSON, or a documented batch.

Prefer a stable tick frame such as:

```json
{
  "type": "tick",
  "broker_id": "TEST",
  "symbol": "EURUSD",
  "bid": 1.12345,
  "ask": 1.12357,
  "source_timestamp_ms": 1787573419000,
  "receive_timestamp_ms": 1787573419915,
  "sequence": 12759610,
  "provider": "equinix"
}
```

If the existing frame must remain for compatibility, keep it and document it exactly rather than silently changing field names.

### 7. Provide a meaningful health/status endpoint

Provide one authoritative HTTPS status endpoint for the same central TEST feed. It should report at least:

```json
{
  "status": "healthy",
  "broker_id": "TEST",
  "feed_auth_required": false,
  "upstream_connected": true,
  "last_upstream_tick_at": "<ISO-8601 timestamp>",
  "last_broadcast_tick_at": "<ISO-8601 timestamp>",
  "connected_clients": 1,
  "registered_symbol_count": 235,
  "active_symbol_count": 209,
  "server_time": "<ISO-8601 timestamp>"
}
```

A status endpoint is supplemental. The acceptance test must still prove an actual browser-compatible WebSocket upgrade and tick delivery.

## Mandatory acceptance tests

Run and record all relevant results after deploying the fix.

### A. Browser-origin upgrade

From a client that sends `Origin: http://localhost:5174`:

- The public central WebSocket upgrade returns `101 Switching Protocols`, not `403`.
- The connection remains open.
- The subscription request is acknowledged.
- Valid TEST ticks are received.

Repeat using every configured production Manager origin.

### B. Broker-ID normalization

Test both:

- `?broker_id=TEST`
- `?broker_id=test`

Either both must resolve to the same documented canonical broker, or the noncanonical form must fail immediately with an explicit error. It must never connect successfully and silently return an empty stream.

### C. Payload validation

For at least 60 seconds, validate every received tick:

- valid JSON or documented NDJSON/batch framing;
- non-empty symbol;
- finite bid/ask;
- ask is not below bid unless that is explicitly valid for the provider;
- valid current timestamps with documented units;
- correct `broker_id`;
- sequence behavior matches documentation.

Report total messages, unique symbols, malformed frames, duplicates, out-of-order frames, and maximum observed quote age.

### D. Symbol coverage

- Compare the TEST broker symbol registry with the provider subscription and broadcast registry.
- Report counts and missing mappings.
- Explicitly report the state and last tick time for the HK examples listed above.
- Confirm that active FX/crypto/index symbols continue updating.

### E. Reconnect behavior

- Disconnect and reconnect the client.
- Verify it receives a new acknowledgement and initial state/snapshot.
- Verify no cross-broker ticks leak into TEST.

### F. Discovery and status

- Fetch the TEST discovery record and show the final sanitized JSON.
- Fetch the authoritative status endpoint and show the final sanitized JSON.
- Verify both describe the same WebSocket service and canonical broker ID.

## Required backend response format

Return the following sections. Do not answer only with “fixed,” “working,” or “frontend issue.”

### 1. Root cause

State the exact backend root cause(s), with service/module names and evidence from logs or tests.

### 2. Changes implemented

List each backend file/service/configuration changed and what was corrected, including:

- WebSocket Origin policy;
- broker-ID normalization;
- discovery record;
- subscription handling;
- provider/symbol mapping;
- snapshot/freshness behavior;
- status endpoint.

### 3. Deployment

Provide environment, deployment identifier/version/commit, deployment time, and the public endpoints now serving the fix.

### 4. Final frontend contract

Provide a copy-paste-ready, secret-free frontend configuration:

```dotenv
VITE_FEED_WS_URL=<final public WebSocket URL>
VITE_FEED_STATUS_URL=<final authoritative HTTPS status URL>
VITE_FEED_BROKER_ID=<exact canonical broker ID>
VITE_FEED_AUTH_REQUIRED=<true-or-false>
VITE_FEED_SEND_TOKEN=<true-or-false>
```

Also provide:

- required query parameters;
- authentication method and token source, if applicable;
- exact subscription message;
- acknowledgement frame;
- tick frame/schema;
- snapshot frame/schema;
- heartbeat behavior;
- error frames and close codes;
- timestamp units;
- allowed browser origins.

Do not return a real secret. If the frontend must obtain a short-lived credential, document the secure endpoint and response field used to obtain it.

### 5. Proof

Include sanitized evidence for:

- browser-origin `101` upgrade;
- subscription acknowledgement;
- received live ticks and changing prices;
- 60-second message/symbol/freshness statistics;
- TEST/test broker-ID behavior;
- discovery response;
- status response;
- HK symbol state/mapping;
- reconnect and broker-isolation tests.

### 6. Remaining frontend work

List only frontend changes that remain necessary after the backend deployment. Give exact values and contract details so the frontend engineer can implement them without guessing. If no frontend change is required, say so explicitly and explain why.

## Definition of done

This task is complete only when:

1. A normal browser can connect without an Origin-stripping development proxy.
2. The backend resolves the TEST broker deterministically.
3. The wildcard subscription is acknowledged or replaced by a clearly documented supported contract.
4. Active TEST prices visibly change in received WebSocket frames.
5. Initial snapshot/freshness/market-state data prevents old cached prices from appearing live.
6. Discovery, WebSocket, and status contracts agree.
7. No secret is exposed in browser build configuration.
8. The backend response contains the final copy-paste frontend contract and objective proof from the deployed environment.

---

End of backend prompt.
