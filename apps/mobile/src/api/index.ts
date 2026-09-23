import { useSession } from '../state/session';
import { resolveApiBaseUrl } from './config';
import { DemoApi } from './demo';
import { RemoteApi } from './remote';
import type { ApiClient } from './types';

export * from './types';

const demo = new DemoApi();
let remote: RemoteApi | null = null;

/** The active backend: the real API, or the on-device demo when chosen (or no API is configured). */
export function getApi(): ApiClient {
  const { apiMode } = useSession.getState();
  if (apiMode === 'demo') return demo;
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) return demo;
  if (!remote || remote.baseUrl !== baseUrl) {
    remote = new RemoteApi(baseUrl, () => useSession.getState().token);
  }
  return remote;
}
