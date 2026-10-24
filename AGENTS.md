# Broker Manager UI — Agent Guidelines

## Typography Standard (Universal 11px / 400 Rule)

**CRITICAL REQUIREMENT**:
The entire application strictly and uniformly uses:
- **Font Size**: `11px` (for a clean, compact, professional presentation)
- **Font Weight**: `400`

This applies to every folder, subfolder, file, page, feature, dialog, modal, table, header, navigation, and control throughout the application.

When implementing ANY new feature, page, modal, component, or utility:
1. Ensure all text renders at `11px` font size and `400` font weight.
2. Never introduce non-11px sizes (e.g., 8px, 9px, 10px, 12px, 13px, 14px, 16px, 18px, 20px, 24px) or non-400 weights (e.g., 500, 600, 700, bold, semibold).
3. The universal typography locks at the end of `src/index.css`, `src/styles/command-center.css`, and `src/styles/light-theme.css` must remain intact.

## White-label / multi-broker rule (PERMANENT, user directive 2026-10-14)

This platform is white-label / main-label technology delivered to many brokers. It is not built for one broker.

- Hardcode NOTHING that is broker-, tenant-, group-, account-, symbol- or business-specific. That means no tenant/broker IDs (e.g. `trivanta-markets`), group names, account logins, manager logins/actors, symbols, commission/swap/margin rates, feed IDs/versions, hostnames, or business thresholds. This applies to code, SQL migrations, scripts, tools, tests' production paths, and docs examples presented as defaults.
- Everything must be configurable per tenant from Admin / Manager (or per-tenant DB config / env), with safe, generic defaults, and must work on a fresh install for any new broker.
- Tools and one-off scripts take tenant, logins, symbols and dates as explicit parameters; they never embed today's values.
- Every fix must work for all brokers, all groups, all current AND future accounts, never just one (no per-account or canary workarounds).
- Reviewers must REJECT any change that introduces such hardcoding. Existing hardcoded values must be moved to configuration when touched.
- Code-version pins (schema/body hashes, migration checksums) are not tenant data and are allowed.

## Engineering rules (all AI agents and contributors)

Read and follow [ENGINEERING_RULES.md](ENGINEERING_RULES.md) for every task: white-label /
multi-broker (hardcode nothing tenant-specific; everything configurable from Admin/Manager),
trading-engine latency and correctness rules, migrations, and the quality bar.
