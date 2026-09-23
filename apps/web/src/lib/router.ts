import { useEffect, useState } from 'react';
import type { Bbox } from '@opex/shared';

export type AdminSectionKey = string;

export type Route =
  | { name: 'landing' }
  | { name: 'login' }
  | { name: 'chat'; conversationId?: string }
  | { name: 'documents' }
  | { name: 'viewer'; documentId: string; page?: number; bbox?: Bbox }
  | { name: 'admin'; section: AdminSectionKey }
  | { name: 'memories' };

// Hash routing, not history mode: paths like /documents, /admin and /memory
// are proxied to the API, so a hard refresh on them would never reach the SPA.
export function parseHash(hash: string): Route {
  const [rawPath = '', rawQuery = ''] = hash.replace(/^#/, '').split('?');
  const parts = rawPath.split('/').filter(Boolean);
  const query = new URLSearchParams(rawQuery);

  switch (parts[0]) {
    case undefined:
      return { name: 'landing' };
    case 'login':
      return { name: 'login' };
    case 'chat':
      return { name: 'chat', conversationId: parts[1] };
    case 'documents':
      return { name: 'documents' };
    case 'memories':
      return { name: 'memories' };
    case 'admin':
      return { name: 'admin', section: parts[1] ?? 'traces' };
    case 'viewer': {
      const documentId = parts[1];
      if (!documentId) return { name: 'chat' };
      const page = query.get('page');
      const bboxParts = query.get('bbox')?.split(',').map(Number);
      const bbox =
        bboxParts && bboxParts.length === 4 && bboxParts.every(Number.isFinite)
          ? ({ x0: bboxParts[0]!, y0: bboxParts[1]!, x1: bboxParts[2]!, y1: bboxParts[3]! } as Bbox)
          : undefined;
      return { name: 'viewer', documentId, page: page ? Number(page) : undefined, bbox };
    }
    default:
      return { name: 'landing' };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'landing':
      return '#/';
    case 'login':
      return '#/login';
    case 'chat':
      return route.conversationId ? `#/chat/${route.conversationId}` : '#/chat';
    case 'documents':
      return '#/documents';
    case 'memories':
      return '#/memories';
    case 'admin':
      return `#/admin/${route.section}`;
    case 'viewer': {
      const query = new URLSearchParams();
      if (route.page !== undefined) query.set('page', String(route.page));
      if (route.bbox) query.set('bbox', [route.bbox.x0, route.bbox.y0, route.bbox.x1, route.bbox.y1].join(','));
      const qs = query.toString();
      return `#/viewer/${route.documentId}${qs ? `?${qs}` : ''}`;
    }
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route);
  if (options.replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
