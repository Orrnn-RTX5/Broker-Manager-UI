# RTX5 Broker Manager UI — Agent Guidelines

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
