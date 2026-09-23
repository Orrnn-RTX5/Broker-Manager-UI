# Symbol Management loading measurements

## Changes

- Sort only when new names join the catalogue, rather than once per parameter response batch.
- Rebuild only changed rows and preserve earlier snapshots and unchanged row objects.
- Combine response batches that resolve together into one progressive publication.
- Start authenticated symbol preloading immediately instead of after the 800 ms workspace warm-up timer.
- Skip table filtering when no filters are active and avoid unchanged resize updates.

## Controlled measurements

The initial optimization measurements below use fixtures, not authenticated
Nexa production responses. The five-symbol scenario tests rendering speed;
it does not establish catalogue completeness.

| Scenario | Before | After |
| --- | --- | --- |
| Node loader: 6,000 symbols, 100 categories, immediate responses, three runs | 1,539–1,568 ms | 37–110 ms |
| Progress publications for that fixture | 203 | 28 |
| Chrome: five cached symbols, mount to animation frame after populated rows, five runs | Not measured | 9.3–22.4 ms |

Cached component mounts made zero API requests. The browser harness imports the
component before starting its timer; these are component-render timings, not
full application navigation or startup timings.

For the uncached browser scenario, each mocked API response was delayed by
2,500 ms. The dependent names/parameters requests required 5,071 ms before
parameter values appeared. This demonstrates why a guaranteed 30 ms cold
network load requires backend/network support or data loaded in advance.

## Validation

- Loader regressions cover progressive data, failures, cached derived types,
  alphabetical order, unchanged-row reuse, and snapshot immutability.
- Existing parameter batching and virtual table window tests passed.
- ESLint on the changed application modules passed.
- Production web build passed with existing chunk/import warnings.

## Complete available catalogue

The manager names endpoint alone was the table's membership source. Category-only
instruments were discarded, and the available feed catalogue was never included.
The loader now unions manager names, category instruments, and the names in the
broker feed status (`available_symbols` and `symbol_status`). A live Nexa status
read returned 701 names in approximately 1,439 ms.

Feed-only names do not inherit invented type, status, or contract settings. They
remain visible with disabled edit/toggle actions until broker parameters are
verified. Category-only instruments are fetched separately from feed-only names,
so an unknown feed symbol cannot reject their parameter batch.

The screen shows filtered/total counts and a Refresh action. Cache v2 includes
all discovered names, is scoped to the session and backend, and rejects late
responses from a superseded load. The old five-symbol cache is not read.

Seventeen targeted tests cover the 701-name/5-configured case, category-only
derived symbols, duplicates, feed failures, immutable progressive rows,
normalization, parameter batching, and the virtual table window.

### Browser verification of the full catalogue

`node tmp/check-symbol-catalogue.cjs` exercises the component inside its production
CSS wrapper with a real Nexa feed response and five mocked manager configurations.
It verifies all 701 names, 701 persisted cache records, search, refresh, disabled
unverified edits, `aria-rowcount=702`, and scrolling to the final symbol, ZURN.CH.
There were no runtime errors.

- Cold mount to full-name table: 1,491.1 ms, including the live feed request.
- Five cached mounts: 25.4, 25.4, 27.0, 27.4, and 22.5 ms, with zero manager requests.

These measure a standalone component after module loading, not authenticated
end-to-end application navigation. The 30 ms target is met for these cached
renders; it is not met for the cold network load.
