# IB Manager QA Flow

Use this runbook to test the Broker Manager/Admin IB Management frontend end to end.

Scope: Manager/Admin IB Management only. Do not test CRM, SDK, public signup, market data, feed server, or gateway UI in this flow.

## Environment

Confirm before testing:

- Staging Manager URL is available.
- Manager login works.
- Manager has `manage_ib` for the main flow.
- Manager session is broker-scoped.
- Frontend does not send `broker_id`.
- Backend migration `131_ib_production_hardening.sql` is applied.
- Seed rows are in the Manager backend database only.

Required seed tables:

- `accounts`
- `ib_accounts`
- `ib_client_links`
- `ib_commission_plans`
- `ib_commissions`

All seed rows must use the same broker scope as the manager session.

## Test Data Sheet

Fill this before QA starts.

| Purpose | Value |
|---|---|
| Staging URL | `<url>` |
| Manager login | `<login>` |
| Manager broker scope | `<broker_id or broker name for reference only>` |
| Top-level IB candidate account login | `<number>` |
| Sub-IB candidate account login | `<number>` |
| Client account login | `<number>` |
| Existing root IB login | `<number>` |
| Existing root IB status | `approved` or `active` |
| Commission plan id | `<number>` |
| Ledger/stats seed from date | `YYYY-MM-DD` |
| Ledger/stats seed to date | `YYYY-MM-DD` |
| Unpaid commission id for approve test | `<number>` |
| Unpaid commission id for reject test | `<number>` |
| Approved unpaid commission id for payout approve test | `<number>` |
| Approved unpaid commission id for payout reject test | `<number>` |

Important:

- Candidate IB accounts must exist in `accounts`.
- Candidate IB accounts must not already exist in `ib_accounts`.
- Client account must exist in `accounts`.
- Parent IBs used for Sub-IB creation must be `approved` or `active`.
- Ledger and stats pages default to the current month. Set the UI date filters to the exact seed date range above before failing a missing-row check.
- Approved unpaid payout rows must have `status = 'approved'`, `paid = false`, and `payout_request_id IS NULL`.

## Frontend Routes

| Route | Purpose |
|---|---|
| `/ib` | IB accounts overview |
| `/ib/tree` | IB hierarchy tree |
| `/ib/:login/profile` | IB profile |
| `/ib/:login/tree` | IB tree for selected IB |
| `/ib/:login/clients` | Direct/all client links |
| `/ib/:login/plans` | Commission plans |
| `/ib/:login/ledger` | Commission ledger |
| `/ib/:login/payout` | Payout workflow |
| `/ib/:login/stats` | IB stats |

## Frontend UI Flow

1. Login with a staging manager account that has `manage_ib`.
2. Open `/ib`.
   - Pass when IB rows appear for seeded data.
   - Empty state is valid only when backend returns an empty list.
   - API error state is valid only for real API errors.
3. Create a top-level IB with the top-level candidate account login and no parent.
   - Expected request body: `login`, optional `company_name`, optional `referral_code`, optional `notes`.
   - Expected status after create: `pending`.
4. Approve the top-level IB.
   - Expected status: `approved`.
   - `approved_at` should be populated.
5. Create a Sub-IB using only an `approved` or `active` parent IB.
   - Pending, rejected, suspended, and removed IBs must not be selectable as parents.
6. Reject a separate pending IB.
   - Expected status: `rejected`.
   - Rejected IB must not be usable as a parent.
7. Suspend an approved or active IB, then activate it again.
   - Suspend calls `IBSuspend`.
   - Activate calls `IBUpdate` with `status=active`.
8. Open `/ib/tree` and load the existing root IB.
   - Root appears.
   - Sub-IB appears recursively under root.
   - Do not assume root `level` is `0`; use backend-provided `level`.
9. Open IB detail -> Clients.
   - Link a client.
   - Duplicate link should show a clear API error.
   - Unlink the client and confirm it disappears from direct/all client lists.
10. Open IB detail -> Plans.
   - Create, update, enable, disable, and archive a plan.
   - Frontend should validate invalid plan inputs before submit.
11. Open IB detail -> Ledger.
   - Set date filters to the seed date range.
   - Use paid/status filters and confirm the API query updates.
   - Approve and reject unpaid rows only.
   - UI must never show `paid` as a manual status action.
12. Open IB detail -> Payout.
   - Create payout request from approved unpaid rows.
   - Immediately record or copy the displayed `payout_id`.
   - Approve or reject the request in the same session.
   - There is no global payout queue, `IBPayoutList`, or `IBPayoutGet` endpoint yet.
13. Open IB detail -> Stats.
   - Set date filters to the seed date range.
   - Confirm `client_count`, `active_clients`, `total_lots`, and `total_commissions` load and refresh after ledger/payout actions.

## Backend/API-Only Checks

These checks should not be treated as missing UI features.

- Permission API check:
  - Login with a manager that does not have `manage_ib`.
  - UI should show an access-denied state.
  - Direct backend/API check for `/IBList` should return `403`.
- Manual paid status rejection:
  - Send `POST /IBCommissionStatus?commission_id=<id>&status=paid` from an API client.
  - Backend must reject it.
  - Frontend must never expose `paid` as a manual status option.
- Invalid plan backend validation:
  - API client may submit invalid plan payloads to confirm backend validation.
  - Frontend should already block empty `plan_name`, unsupported `commission_type`, zero `rate`, negative values, and `max_lots < min_lots`.

## Backend Endpoints Used

IB accounts:

- `GET /IBList`
- `GET /IBGet?login=<login>`
- `POST /IBCreate`
- `POST /IBUpdate?login=<login>&status=<status>&notes=<notes>`
- `POST /IBApprove?login=<login>&notes=<notes>`
- `POST /IBReject?login=<login>&notes=<notes>`
- `POST /IBSuspend?login=<login>&notes=<notes>`
- `POST /IBDelete?login=<login>&force=<true|false>`

IB tree and client links:

- `GET /IBTree?login=<root_ib_login>`
- `POST /IBLinkClient?ib_login=<ib>&client_login=<client>&source=manual`
- `POST /IBUnlinkClient?client_login=<client>`
- `GET /IBClientList?login=<ib>`
- `GET /IBClientListAll?login=<ib>`

Plans, ledger, payout, stats:

- `POST /IBPlanCreate`
- `POST /IBPlanUpdate`
- `POST /IBPlanEnable?id=<plan_id>`
- `POST /IBPlanDisable?id=<plan_id>`
- `POST /IBPlanDelete?id=<plan_id>`
- `GET /IBPlanList?login=<ib>`
- `GET /IBCommissions?login=<ib>&from=<from>&to=<to>&paid=<true|false>&status=<status>`
- `POST /IBCommissionStatus?commission_id=<id>&status=<status>`
- `POST /IBPayoutRequest?login=<ib>`
- `POST /IBPayoutApprove?payout_id=<id>`
- `POST /IBPayoutReject?payout_id=<id>`
- `GET /IBStats?login=<ib>&from=<from>&to=<to>`

Do not use `/IBCommissionPay?login=<ib>&execute=true` in the normal frontend payout flow.

## Reset Checklist

Reset all QA-created or mutated state:

- Created IB accounts and statuses.
- Parent/sub-IB relationships.
- Client links.
- QA commission plans.
- Commission statuses.
- Payout requests and payout request items.
- `ib_commissions.payout_request_id`.
- `ib_commissions.paid`.
- `ib_commissions.status`.
- `ib_commissions.paid_at`.
- `ib_commissions.pay_ticket`.
- Balance changes caused by payout approval.
- `balance_ops` payout rows created during QA.
