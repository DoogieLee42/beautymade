import { useEffect, useState, type RefObject } from 'react';

import type { ThumbnailRequest } from './FaceRenderer';
import type { FaceViewHandle } from './FaceView';

const cache = new Map<string, string>();

function keyOf(faceId: string, mirrored: boolean, req: ThumbnailRequest): string {
  return JSON.stringify([faceId, mirrored, req]);
}

/**
 * Renders (and caches per face) small images of the face with given values and camera,
 * using an existing FaceView's GL context. Returns name -> image URI as they arrive.
 */
export function useFaceThumbnails(
  view: RefObject<FaceViewHandle | null>,
  faceId: string | null,
  ready: boolean,
  requests: Record<string, ThumbnailRequest>,
  mirrored = false,
): Record<string, string | undefined> {
  const signature = faceId ? JSON.stringify([faceId, mirrored, requests]) : '';
  const [uris, setUris] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (!faceId) return;
    const initial: Record<string, string | undefined> = {};
    for (const [name, req] of Object.entries(requests)) initial[name] = cache.get(keyOf(faceId, mirrored, req));
    setUris(initial);
    if (!ready) return;
    let alive = true;
    (async () => {
      for (const [name, req] of Object.entries(requests)) {
        const key = keyOf(faceId, mirrored, req);
        if (cache.has(key)) continue;
        const uri = await view.current?.renderThumbnail(req).catch(() => null);
        if (!uri) continue;
        cache.set(key, uri);
        if (alive) setUris((prev) => ({ ...prev, [name]: uri }));
      }
    })();
    return () => {
      alive = false;
    };
    // `signature` captures faceId, mirrored and requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready]);

  return uris;
}

export function clearThumbnails(faceId?: string): void {
  if (!faceId) return cache.clear();
  for (const key of cache.keys()) if (key.startsWith(`["${faceId}"`)) cache.delete(key);
}
