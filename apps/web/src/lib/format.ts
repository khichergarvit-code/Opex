/** "2 min ago", "Yesterday 14:05", "12 Mar 2026, 09:30" — short and readable, replacing raw ISO timestamps. */
export function formatDateTime(input: string | number | Date | null | undefined, now: Date = new Date()): string {
  if (input === null || input === undefined || input === '') return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return `Today ${time}`;
  if (d.getTime() >= startOfToday - 86_400_000) return `Yesterday ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}, ${time}`;
}

/** Full, unambiguous timestamp for tooltips. */
export function formatFullDateTime(input: string | number | Date | null | undefined): string {
  if (!input) return '';
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? String(input) : d.toLocaleString();
}

/** "Qwen3-VL-4B-Instruct-GGUF" / "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf" -> "Qwen3-VL-4B" / "Qwen2.5-VL-7B". */
export function shortModelName(name: string): string {
  return name
    .replace(/\.gguf$/i, '')
    .replace(/-?(Q\d(_[A-Z0-9]+)*|F16|F32)$/i, '')
    .replace(/-GGUF$/i, '')
    .replace(/-Instruct$/i, '');
}
