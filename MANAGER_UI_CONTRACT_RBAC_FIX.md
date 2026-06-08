# Manager UI Contract/RBAC Fix

Date: 2026-06-07

Fixed:
- Broker discovery now calls `/api/v2/broker/servers`.
- Manager login now uses the selected opaque `server` handle instead of `server_ip`.
- AccountDetails trade mutations now require `manipulate_trades` before close, modify, or adapter actions can fire.

Verification:
- `npm test`: 44 passed, 0 failed.
- `npm run build`: passed.
- Targeted ESLint: passed on changed broker-auth/RBAC files.

Remaining risk:
- No live credentialed manager/admin/client workflow was run in this lane.
- Build still reports existing Vite chunk-size and mixed import warnings.
