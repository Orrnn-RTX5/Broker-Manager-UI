const errorText = /\b(error|failed|failure|unsuccessful|denied|invalid|unable|cannot|could not|does not have permission|not permitted|not allowed|incorrect)\b|MT_RET_ERR_/i;
const successText = /\b(successful(?:ly)?|success|updated|cleared|copied)\b|^(?:spread markup set|execution set|book set to):/i;

// Callers separate an operation summary from server details with a blank line.
// Keep diagnostic content verbatim and leave outcome classification unchanged.
export function splitResultMessage(message) {
  const text = String(message ?? '');
  const separator = /\r?\n[ \t]*\r?\n/.exec(text);
  if (!separator) return { summary: text, details: null };
  const summary = text.slice(0, separator.index);
  const details = text.slice(separator.index + separator[0].length);
  return summary.trim() && details.trim()
    ? { summary, details }
    : { summary: text, details: null };
}

const technicalText = /\bMT_RET_[A-Z0-9_]+\b|\b(?:SQLSTATE|SQL|PostgreSQL|client_order_id|NetworkError|TypeError|ReferenceError|SyntaxError)\b|\brow[- ]level security\b|\bpermission denied for (?:table|relation|schema|database|sequence)\b|\b(?:failed to fetch|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT)\b|^\s*(?:status|message)\s*:/im;

function isTechnicalMessage(message) {
  if (!message) return false;
  if (technicalText.test(message)) return true;
  try {
    const value = JSON.parse(message);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
}

// Presentation never changes the outcome, and diagnostics remain available
// verbatim even when their visible explanation is simplified.
export function getResultPresentation(result) {
  const original = String(result.message ?? '');
  const { summary, details } = splitResultMessage(original);
  const operation = /^(Close Position|Cancel Order) #(\d+)(?: failed)?[.!]?$/i.exec(summary.trim());
  const summaryIsTechnical = isTechnicalMessage(summary);
  const detailsAreTechnical = isTechnicalMessage(details);
  const hasTechnicalText = summaryIsTechnical || detailsAreTechnical;
  const technicalMessage = operation || hasTechnicalText || result.code != null ? original : null;

  if (operation) {
    const isPosition = operation[1].toLowerCase() === 'close position';
    const entity = isPosition ? 'position' : 'order';
    const action = isPosition ? 'closure' : 'cancellation';
    const ticket = operation[2];
    if (result.type === 'success') {
      return {
        message: `${isPosition ? 'Position' : 'Order'} #${ticket} ${isPosition ? 'closed' : 'cancelled'} successfully.`,
        guidance: null,
        technicalMessage,
      };
    }
    const guidance = result.type === 'error'
      ? `Check the ${entity}’s current status before trying again.`
      : `Check the ${entity}’s current status for the latest update.`;
    return {
      message: result.type === 'error'
        ? `Could not confirm ${action} of ${entity} #${ticket}.`
        : `${isPosition ? 'Closure' : 'Cancellation'} of ${entity} #${ticket} is not confirmed.`,
      guidance: details && !detailsAreTechnical ? `${details}\n\n${guidance}` : guidance,
      technicalMessage,
    };
  }

  if (result.type === 'error' && hasTechnicalText) {
    return {
      message: summaryIsTechnical ? 'We couldn’t confirm that the request completed.' : summary,
      guidance: 'Check the latest status before trying again. If you need help, share the technical details with support.',
      technicalMessage,
    };
  }

  // Human-readable continuations remain visible, including single newlines.
  const continuation = details == null ? /\r?\n/.exec(summary) : null;
  if (continuation) {
    const firstLine = summary.slice(0, continuation.index);
    const remainingLines = summary.slice(continuation.index + continuation[0].length);
    if (firstLine.trim() && remainingLines.trim()) {
      return { message: firstLine, guidance: remainingLines, technicalMessage };
    }
  }
  return { message: summary, guidance: details, technicalMessage };
}

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
