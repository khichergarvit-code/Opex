/**
 * Minimal HTTP client for driving the real live API from eval suites —
 * plain fetch + manual cookie handling (Node's fetch doesn't manage
 * cookies across requests the way a browser does).
 */
export interface EvalUser {
  email: string;
  password: string;
}

export class ApiClient {
  private cookie = '';
  private csrfToken = '';

  constructor(private readonly baseUrl: string) {}

  async login(user: EvalUser): Promise<{ id: string; role: string; clearance: number }> {
    const res = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    if (!res.ok) {
      throw new Error(`login failed for ${user.email}: ${res.status} ${await res.text()}`);
    }
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) throw new Error('login response had no Set-Cookie header');
    this.cookie = setCookie.split(';')[0]!;
    const body = (await res.json()) as { id: string; role: string; clearance: number; csrfToken: string };
    this.csrfToken = body.csrfToken;
    return body;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { cookie: this.cookie },
    });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: this.cookie,
        'x-csrf-token': this.csrfToken,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Posts a chat message and returns the full raw SSE response text. */
  async postMessageRaw(conversationId: string, content: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: this.cookie,
        'x-csrf-token': this.csrfToken,
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`POST message failed: ${res.status} ${await res.text()}`);
    return res.text();
  }
}

/** Pulls the final assistant text out of a raw SSE response (concatenated token deltas). */
export function extractAnswerText(sseText: string): string {
  const lines = sseText.split('\n');
  let answer = '';
  let currentEvent = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ') && currentEvent === 'token') {
      const data = JSON.parse(line.slice(6)) as { delta: string };
      answer += data.delta;
    }
  }
  return answer;
}
