import { Platform } from 'react-native';

import {
  ApiError,
  type AiRender,
  type AiStatus,
  type ApiClient,
  type AuthResult,
  type CaptureView,
  type FaceModel,
  type LocalPhoto,
  type Look,
  type LookPatch,
  type Me,
  type NewAiRender,
  type NewLook,
  type Scan,
  type ScanPhoto,
} from './types';

type TokenGetter = () => string | null;

/** HTTP client for services/api. Relative file URLs in responses are made absolute. */
export class RemoteApi implements ApiClient {
  readonly mode = 'remote' as const;

  constructor(
    readonly baseUrl: string,
    private readonly getToken: TokenGetter,
  ) {}

  private url(path: string): string {
    return path.startsWith('http') || path.startsWith('data:') ? path : `${this.baseUrl}${path}`;
  }

  private async request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(this.url(path), {
        method,
        headers,
        body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
    } catch {
      throw new ApiError('서버에 연결할 수 없어요. 네트워크를 확인해주세요.', 0, 'network');
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const detail = data && typeof data.detail === 'string' ? data.detail : '요청을 처리하지 못했어요.';
      throw new ApiError(detail, res.status);
    }
    return data as T;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(this.url('/health'));
      return res.ok;
    } catch {
      return false;
    }
  }

  signup(input: { email: string; password: string; name: string }) {
    return this.request<AuthResult>('POST', '/auth/signup', input);
  }

  login(input: { email: string; password: string }) {
    return this.request<AuthResult>('POST', '/auth/login', input);
  }

  async me(): Promise<Me> {
    const me = await this.request<Me>('GET', '/me');
    if (me.faceModel?.thumbnailUrl) me.faceModel.thumbnailUrl = this.url(me.faceModel.thumbnailUrl);
    return me;
  }

  deleteAccount() {
    return this.request<void>('DELETE', '/me');
  }

  async createScan() {
    return this.fixScan(await this.request<Scan>('POST', '/scans'));
  }

  async getScan(id: string) {
    return this.fixScan(await this.request<Scan>('GET', `/scans/${id}`));
  }

  async uploadPhoto(scanId: string, view: CaptureView, photo: LocalPhoto): Promise<ScanPhoto> {
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(photo.uri)).blob();
      form.append('photo', blob, `${view}.jpg`);
    } else {
      // React Native's FormData streams the file from disk.
      form.append('photo', { uri: photo.uri, name: `${view}.jpg`, type: 'image/jpeg' } as unknown as Blob);
    }
    const res = await this.request<ScanPhoto>('PUT', `/scans/${scanId}/photos/${view}`, undefined, form);
    return { ...res, url: this.url(res.url) };
  }

  async submitScan(scanId: string) {
    return this.fixScan(await this.request<Scan>('POST', `/scans/${scanId}/submit`));
  }

  async getCurrentFaceModel(): Promise<FaceModel | null> {
    try {
      return this.fixFace(await this.request<FaceModel>('GET', '/face-models/current'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }

  async getFaceModel(id: string) {
    return this.fixFace(await this.request<FaceModel>('GET', `/face-models/${id}`));
  }

  deleteFaceModel(id: string) {
    return this.request<void>('DELETE', `/face-models/${id}`);
  }

  async listLooks() {
    return (await this.request<Look[]>('GET', '/looks')).map((l) => this.fixLook(l));
  }

  async getLook(id: string) {
    return this.fixLook(await this.request<Look>('GET', `/looks/${id}`));
  }

  async createLook(input: NewLook) {
    return this.fixLook(await this.request<Look>('POST', '/looks', input));
  }

  async updateLook(id: string, patch: LookPatch) {
    return this.fixLook(await this.request<Look>('PATCH', `/looks/${id}`, patch));
  }

  deleteLook(id: string) {
    return this.request<void>('DELETE', `/looks/${id}`);
  }

  async aiStatus() {
    return this.request<AiStatus>('GET', '/ai-renders/status');
  }

  async createAiRender(input: NewAiRender) {
    const render = await this.request<AiRender>('POST', '/ai-renders', input);
    return { ...render, url: this.url(render.url) };
  }

  private fixScan(scan: Scan): Scan {
    return { ...scan, photos: scan.photos.map((p) => ({ ...p, url: this.url(p.url) })) };
  }

  private fixFace(face: FaceModel): FaceModel {
    return {
      ...face,
      thumbnailUrl: face.thumbnailUrl ? this.url(face.thumbnailUrl) : null,
      textures: {
        albedo: this.url(face.textures.albedo),
        smooth: this.url(face.textures.smooth),
        mask: this.url(face.textures.mask),
      },
    };
  }

  private fixLook(look: Look): Look {
    return { ...look, thumbnailUrl: look.thumbnailUrl ? this.url(look.thumbnailUrl) : null };
  }
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
