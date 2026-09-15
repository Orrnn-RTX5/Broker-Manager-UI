const errorText = /\b(error|failed|failure|unsuccessful|denied|invalid|unable|cannot|could not|does not have permission|not permitted|not allowed|incorrect)\b|MT_RET_ERR_/i;
const successText = /\b(successful(?:ly)?|success|updated|cleared|copied)\b|^(?:spread markup set|execution set|book set to):/i;

// Unknown server responses stay informational; never infer success from HTTP
// completion alone. Explicit failures take priority over successful fields.
export function normalizeResult(input, options = {}) {
  let value = input;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* Plain text response. */ }
  }
  const object = value && typeof value === 'object' ? value : null;
  const code = object?.retcode ?? object?.code ?? object?.status;
  const message = object ? String(object.message ?? object.error?.message ?? (typeof object.error === 'string' ? object.error : JSON.stringify(object, null, 2))) : String(value ?? 'No additional details were returned.');
  const failure = object?.success === false || object?.ok === false || value === false || Boolean(object?.error) || errorText.test(`${code ?? ''} ${message}`);
  const success = object?.success === true || object?.ok === true || value === true || /^(OK|SUCCESS|DONE|MT_RET_OK|MT_RET_REQUEST_DONE)$/i.test(String(code ?? value));
  const type = failure || options.type === 'error' ? 'error' : options.type || (success || successText.test(message) ? 'success' : 'info');
  return {
    type,
    title: options.title || { success: 'Action successful', error: 'Action unsuccessful', info: 'Action result' }[type],
    message,
    code: code == null ? null : String(code),
  };
}
