# Exposure API review and backend implementation prompt

## Findings from the supplied Manager API list

The list includes GET `/api/v1/exposure` and GET `/api/v1/exposure/{symbol}`. A new endpoint is not automatically necessary. It does not include response schemas, parameter contracts, units, permissions, pagination, or valuation rules. Availability in this list does not prove deployment or response compatibility.

The frontend now requests GET `/api/v1/exposure` through the existing authenticated Manager client. `/exposure` and the terminal Exposure tab share the query cache. Existing Open Positions remains at `/analytics/open-positions`. Symbol detail is not called because this view needs the aggregate snapshot and no detail response contract was supplied.

| Required information | Existing candidate | What must be confirmed |
| --- | --- | --- |
| Aggregate exposure | `/api/v1/exposure` | Asset versus symbol grouping, quantities, units, valuation, completeness |
| Symbol detail | `/api/v1/exposure/{symbol}` | Detail schema, same scope and valuation |
| Open client positions | `/PositionsAll`, `/Positions`, `/OpenedOrders` | Complete scoped positions, side, explicit volume scale |
| Instrument definitions | `/SymbolBaseList`, `/SymbolList`, `/api/v1/market/symbols` | Contract size, base/profit currencies, calculation mode, multipliers |
| Quotes/conversion | `/TickLast`, `/api/v1/market/quote` | Query parameters, bid/ask timestamps, conversion paths |
| Hedge coverage | `/api/v1/book` is a candidate for inspection | The list does NOT establish that it provides authoritative executed LP hedge inventory |

Frontend responsibilities: search, direction filters, sort, CSV export, polling, table, diverging USD bars, long/short composition percentages, and USD subtotals. No backend is needed for these. It can calculate signed residual quantity and USD value only when the backend supplies explicitly compatible quantities and a USD-per-unit conversion rate. It must not add unlike native units together.

Backend responsibilities: authoritative executed hedge inventory, manager/broker scoping, consistent snapshots, instrument-specific valuation, trustworthy FX conversion and stale-rate status. LP configuration/status, orders, or recent fills alone do not establish current hedge inventory. Client buy/sell lots alone cannot reproduce the screenshot's currency/asset exposure. Never infer base and quote currencies by slicing symbol names; suffixes and CFDs invalidate that assumption.

## Prompt to send to the backend developer

Implement or extend the EXISTING Manager Risk GET `/api/v1/exposure` after inspecting its actual implementation and publishing the OpenAPI response. Preserve compatibility for existing consumers. Do not create a duplicate endpoint unless versioning requires it. Supply a read-only, manager-scoped, internally consistent exposure snapshot for the Manager UI.

1. Authenticate with the existing Bearer session. Derive broker, authorized groups/accounts, and permissions on the server. Return 401/403 correctly and prevent cross-broker or unauthorized-account leakage. Never accept client-supplied broker identity as authorization.
2. Explicitly distinguish symbol exposure from currency/asset exposure. The reference is asset exposure. For supported FX instruments, decompose the two currency legs using the approved risk valuation convention; document whether the quote leg uses execution price or current valuation. For metals, indices, energy, futures and other CFDs, apply their actual calculation mode, contract multiplier, price and currency rules. Do not apply one generic FX formula to every instrument. Define client-perspective versus broker-perspective signs with worked examples and risk-owner approval.
3. Supply actual executed hedge coverage from reconciled LP inventory. Define `coverageQuantity` as the signed offset in the same unit as client quantity, so `netQuantity = clientQuantity + coverageQuantity`. A client long 100,000 EUR covered by -40,000 EUR leaves +60,000 EUR. Only send zero coverage when its absence is verified. Send null plus a reason when unknown. Do not treat A-book labels, pending orders or successful LP connections as proof of an executed hedge.
4. Return the shape below. Decimal strings are preferred for transport; calculate in decimal arithmetic server-side. `usdRate` means USD per ONE reported native unit, including instrument multipliers if the unit is a contract. Publish this convention in OpenAPI. `netUsd` is the authoritative signed USD exposure, not P/L, balance or margin. `netLots` is optional, explicitly lots, never interchangeable with native asset quantity.

```json
{
  "asOf": "2026-09-18T10:00:00Z",
  "snapshotId": "opaque-snapshot-id",
  "aggregation": "asset",
  "complete": true,
  "total": 2,
  "rows": [
    { "asset": "EUR", "unit": "EUR", "clientQuantity": "100000", "coverageQuantity": "-40000", "netQuantity": "60000", "usdRate": "1.10", "netUsd": "66000", "valuationStatus": "current", "rateAsOf": "2026-09-18T10:00:00Z" },
    { "asset": "XAU", "unit": "troy ounce", "clientQuantity": "-10", "coverageQuantity": null, "netQuantity": null, "usdRate": null, "netUsd": null, "valuationStatus": "unavailable", "reason": "Hedge inventory unavailable" }
  ]
}
```

The UI adapter currently accepts an array or `{rows: [...]}`, `{exposures: [...]}`, `{items: [...]}`, `{exposure: [...]}`, optionally wrapped in `data`. Recognized numeric fields are the camelCase names above and their snake_case equivalents (`netTotalUsd` also maps to net USD). `asset` or `symbol` identifies each unique row. Unqualified fields such as `clients`, `volume`, `netVolume`, or `exposure` are deliberately NOT guessed. If the current server uses other names, provide real sanitized JSON and document units before adapting the UI.

5. Set unavailable numbers to null, never to zero. Include missing/stale conversion reasons and quote timestamps. Do not return stale values as current. The initial UI supports unavailable values and incomplete snapshots; richer row-specific valuation badges require a follow-up UI mapping once the real schema is confirmed.
6. Return all aggregated asset rows from one consistent snapshot. If paging is unavoidable, expose snapshot-bound pagination, `total`, `hasMore`, and completeness. The current UI makes one aggregate request and marks `complete:false`, `hasMore:true`, or `total > rows.length` as partial; it does not paginate an undocumented response. Never return an apparently complete first page.
7. Define USD conversion selection, direct/inverse/cross rate paths, bid/ask versus mid policy, stale threshold and rounding. USD cash has rate 1. Never fabricate a missing rate or hard-code market prices. Preserve sufficient precision and document display rounding.
8. Derive positive USD as `max(netUsd, 0)`. Long total is the sum of positive asset values; short total is the sum of negative asset values; net total is their sum. Do not sum native quantities across EUR, JPY, ounces and contracts. Chart percentages use positive values for longs and absolute negative values for shorts.
9. Support cancellation/timeouts, bounded response size and efficient aggregate queries. Existing UI polls every 15 seconds only while mounted and does not poll in the background. Consider a versioned stream separately if real-time risk requirements demand it. Return structured errors without secrets. Unknown/malformed results must not masquerade as an empty array.
10. Add tests for buys/sells, offsetting positions, partial/full hedges, missing LP inventory, suffix symbols, JPY inversion, cross-currency conversion, non-FX contract modes, stale/missing quotes, zero exposure, decimal precision, manager scope isolation, concurrent updates and incomplete snapshots. Provide sanitized example responses, documented units and signs, and reconciliation evidence against a known Manager exposure snapshot.

Acceptance: the existing screen displays genuine values without guessed units or invented zeros; totals reconcile to the authoritative backend snapshot; restricted managers see only authorized exposure; unknown valuation is visibly unavailable.

## Verification boundary

Implementation validation uses synthetic fixtures, not a live authenticated risk account. The supplied endpoint list alone cannot verify the deployed response contract. Live deployment and exact MetaTrader reconciliation remain dependent on a sanitized real response and documented risk semantics.
