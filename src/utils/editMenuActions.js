export const EDIT_MENU_ACTION_EVENT = 'rtx5:edit-menu-action';
export const EDIT_MENU_CONTEXT_EVENT = 'rtx5:edit-menu-context';

export const dispatchEditMenuAction = (action) => {
  const detail = { action, handled: false };
  window.dispatchEvent(new CustomEvent(EDIT_MENU_ACTION_EVENT, { detail }));
  return detail.handled;
};

export const publishEditMenuContext = (context) => {
  window.__rtx5EditMenuContext = context;
  window.dispatchEvent(new CustomEvent(EDIT_MENU_CONTEXT_EVENT, { detail: context }));
};

export const isEditableElement = (element = document.activeElement) => (
  element instanceof HTMLInputElement ||
  element instanceof HTMLTextAreaElement ||
  Boolean(element?.isContentEditable)
);

export const copyFocusedSelection = async () => {
  const element = document.activeElement;
  if (!isEditableElement(element) || !element.value?.slice(element.selectionStart, element.selectionEnd)) return false;

  const text = element.value.slice(element.selectionStart, element.selectionEnd);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return document.execCommand('copy');
};

export const pasteIntoFocusedField = async () => {
  const element = document.activeElement;
  if (!isEditableElement(element) || !('value' in element) || !navigator.clipboard?.readText) return false;

  const text = await navigator.clipboard.readText();
  element.setRangeText(text, element.selectionStart, element.selectionEnd, 'end');
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};
