/**
 * A small (4B) model doesn't reliably follow "don't call code_exec for a plain write-me-code
 * request" from the system prompt alone (confirmed live: it still called the tool and replied with
 * only the printed output). This rule withholds `code_exec` from the tool list for that turn instead
 * of relying on the model to choose not to use a tool it's been handed — the same
 * rule-decides-instead-of-asking-the-model pattern already used for isSummarizeRequest.
 */
const RUN_INTENT = /\b(run|runs?|execute|exec|test|output|result|prints?|what does|check)\b/i;
const WRITE_CODE_INTENT = /\b(write|give|create|show|generate)\b.{0,30}\bcode\b/i;

/** True when the message is a plain "write me this code" request, with no run/execute/output ask. */
export function isWriteCodeOnlyRequest(message: string): boolean {
  return WRITE_CODE_INTENT.test(message) && !RUN_INTENT.test(message);
}
