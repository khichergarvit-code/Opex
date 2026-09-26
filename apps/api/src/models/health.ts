/** Quick liveness probe of a llama-server-style endpoint (its /health route). */
export async function pingHealth(endpoint: string, timeoutMs = 1500): Promise<'up' | 'down'> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${endpoint}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}
