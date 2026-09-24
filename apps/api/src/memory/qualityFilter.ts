const REFUSAL_PREFIXES = [
  "i couldn't find any documents in this project",
  'i only answer from retrieved document content',
  "i don't have the information",
  'the answer model isn',
  '(stopped',
  '⚠️',
];

/** True for assistant text that is an error/refusal and must never feed memory. */
export function isRefusalOrError(text: string): boolean {
  const t = text.trim().toLowerCase();
  return REFUSAL_PREFIXES.some((p) => t.startsWith(p));
}

/** Facts worth keeping are short statements about the user, not answers or fragments. */
export function isWorthKeeping(text: string): boolean {
  const t = text.trim();
  if (t.split(/\s+/).length < 3 || t.length > 300) return false;
  if (isRefusalOrError(t)) return false;
  if (/\?\s*$/.test(t)) return false;
  return true;
}

/** Cheap gate for the immediate extraction: only run it when the message states something about the user. */
export function looksLikeSelfStatement(message: string): boolean {
  const m = message.trim();
  if (m.length < 8 || m.length > 600) return false;
  return /\b(i am|i'm|im|i work|i live|i use|i prefer|i like|i need|my name|my role|my team|my company|my project|call me|we use|our team|our project|remember( that)?|i moved|i switched|actually i)\b/i.test(m);
}

/** "remember that ..." is an explicit instruction: the user wants it kept. */
export function isExplicitRemember(message: string): boolean {
  return /^\s*(please\s+)?remember\b/i.test(message);
}
