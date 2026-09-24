import { fetchEventSource } from '@microsoft/fetch-event-source';
import type { Citation, SseEvent } from '@opex/shared';
import { getCsrfToken } from './api';

export interface StreamMessageHandlers {
  onToken: (delta: string) => void;
  onStatus?: (state: string, model: string) => void;
  onCitation?: (citation: Citation) => void;
  onDone: (messageId: string, traceId: string) => void;
  onError: (message: string) => void;
  /** What the server is doing right now (routing, retrieving, verifying…). */
  onProgress?: (phase: string, label: string) => void;
  /** Replaces the whole answer shown so far (clears a draft before a revision streams). */
  onReplace?: (text: string) => void;
  /** Fired for every event (including the ones above) — the timeline builds its log from this. */
  onEvent?: (event: SseEvent) => void;
}

/**
 * POSTs a chat message and streams the SSE response. Native EventSource
 * can't POST, hence @microsoft/fetch-event-source.
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: StreamMessageHandlers,
  signal?: AbortSignal,
  modelId?: string,
): Promise<void> {
  await fetchEventSource(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': getCsrfToken() ?? '',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ content, modelId }),
    signal,
    onmessage(ev) {
      if (!ev.event) return;
      const data = JSON.parse(ev.data || '{}');
      const event = { type: ev.event, data } as SseEvent;
      handlers.onEvent?.(event);
      switch (event.type) {
        case 'token':
          handlers.onToken(event.data.delta);
          break;
        case 'status':
          handlers.onStatus?.(event.data.state, event.data.model);
          break;
        case 'citation':
          handlers.onCitation?.(event.data);
          break;
        case 'done':
          handlers.onDone(event.data.messageId, event.data.traceId);
          break;
        case 'error':
          handlers.onError(event.data.message);
          break;
        case 'progress':
          handlers.onProgress?.(event.data.phase, event.data.label);
          break;
        case 'replace':
          handlers.onReplace?.(event.data.text);
          break;
      }
    },
    onerror(err) {
      handlers.onError(err instanceof Error ? err.message : 'stream error');
      throw err; // stop fetch-event-source's automatic retry
    },
  });
}
