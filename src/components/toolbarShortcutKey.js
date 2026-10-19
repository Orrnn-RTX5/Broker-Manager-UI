// KeyboardEvent.key is undefined for some synthetic/legacy key events.
// Normalise it before any shortcut comparison so the toolbar handler cannot throw.
export const normalizeShortcutKey = (key) => String(key ?? '').toLowerCase();
