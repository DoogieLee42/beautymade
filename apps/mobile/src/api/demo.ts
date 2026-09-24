import { FACE_ENGINE_VERSION, sanitizeValues } from '@beautymade/face-engine';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_FACE } from '../three/demoFace';
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
  type NewLook,
  type Scan,
  type ScanPhoto,
  type User,
} from './types';

/**
 * Offline demo backend: the whole flow works without a server. Scans "complete" after a
 * few seconds with the bundled sample face, and looks are stored on the device.
 */
const KEY = 'beautymade.demo.v1';
const PROCESSING_MS = 5200;
const DEMO_POSE: Record<CaptureView, number> = { front: 0, left: 32, right: -32 };

interface DemoDb {
  user: User | null;
  scans: Record<string, Scan & { submittedAt?: number }>;
  faceCreatedAt: string | null;
  looks: Look[];
}

const empty = (): DemoDb => ({ user: null, scans: {}, faceCreatedAt: null, looks: [] });
const id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoApi implements ApiClient {
  readonly mode = 'demo' as const;
  readonly baseUrl = null;
  private cache: DemoDb | null = null;

  private async db(): Promise<DemoDb> {
    if (!this.cache) {
      const raw = await AsyncStorage.getItem(KEY).catch(() => null);
      this.cache = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    }
    return this.cache!;
  }

  private async save(): Promise<void> {
    if (this.cache) await AsyncStorage.setItem(KEY, JSON.stringify(this.cache)).catch(() => undefined);
  }

  private async requireUser(): Promise<DemoDb> {
    const db = await this.db();
    if (!db.user) throw new ApiError('로그인이 필요해요.', 401);
    return db;
  }

  async health() {
    return true;
  }

  async signup(input: { email: string; password: string; name: string }): Promise<AuthResult> {
    await sleep(350);
    const db = await this.db();
    Object.assign(db, empty());
    db.user = { id: 'demo-user', email: input.email.trim().toLowerCase(), name: input.name.trim(), createdAt: new Date().toISOString() };
    await this.save();
    return { token: 'demo-token', user: db.user };
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    await sleep(300);
    const db = await this.db();
    if (!db.user || db.user.email !== input.email.trim().toLowerCase()) {
      db.user = { id: 'demo-user', email: input.email.trim().toLowerCase(), name: '데모', createdAt: new Date().toISOString() };
      await this.save();
    }
    return { token: 'demo-token', user: db.user };
  }

  async me(): Promise<Me> {
    const db = await this.requireUser();
    return {
      user: db.user!,
      faceModel: db.faceCreatedAt ? { id: DEMO_FACE.id, createdAt: db.faceCreatedAt, thumbnailUrl: null } : null,
      lookCount: db.looks.length,
    };
  }

  async deleteAccount() {
    this.cache = empty();
    await this.save();
  }

  async createScan(): Promise<Scan> {
    const db = await this.requireUser();
    const scan: Scan = {
      id: id(),
      status: 'capturing',
      progress: 0,
      stage: null,
      error: null,
      photos: [],
      faceModelId: null,
      createdAt: new Date().toISOString(),
    };
    db.scans[scan.id] = scan;
    await this.save();
    return scan;
  }

  async getScan(scanId: string): Promise<Scan> {
    const db = await this.requireUser();
    const scan = db.scans[scanId];
    if (!scan) throw new ApiError('스캔을 찾을 수 없어요.', 404);
    if (scan.submittedAt && scan.status !== 'completed') {
      const k = Math.min((Date.now() - scan.submittedAt) / PROCESSING_MS, 1);
      scan.progress = k;
      scan.stage = k < 0.3 ? 'analyzing' : k < 0.5 ? 'shaping' : k < 0.85 ? 'texturing' : 'finishing';
      scan.status = 'processing';
      if (k >= 1) {
        scan.status = 'completed';
        scan.stage = 'done';
        scan.faceModelId = DEMO_FACE.id;
        db.faceCreatedAt = new Date().toISOString();
        await this.save();
      }
    }
    return { ...scan };
  }

  async uploadPhoto(scanId: string, view: CaptureView, photo: LocalPhoto): Promise<ScanPhoto> {
    await sleep(450);
    const db = await this.requireUser();
    const scan = db.scans[scanId];
    if (!scan) throw new ApiError('스캔을 찾을 수 없어요.', 404);
    const result: ScanPhoto = {
      view,
      ok: true,
      issues: [],
      pose: { yaw: DEMO_POSE[view], pitch: 0, roll: 0 },
      url: photo.uri,
      width: photo.width ?? 1200,
      height: photo.height ?? 1600,
    };
    scan.photos = [...scan.photos.filter((p) => p.view !== view), result];
    await this.save();
    return result;
  }

  async submitScan(scanId: string): Promise<Scan> {
    const db = await this.requireUser();
    const scan = db.scans[scanId];
    if (!scan) throw new ApiError('스캔을 찾을 수 없어요.', 404);
    if (!scan.photos.some((p) => p.view === 'front')) throw new ApiError('정면 사진을 먼저 촬영해주세요.', 422);
    scan.status = 'queued';
    scan.submittedAt = Date.now();
    await this.save();
    return this.getScan(scanId);
  }

  async getCurrentFaceModel(): Promise<FaceModel | null> {
    const db = await this.requireUser();
    return db.faceCreatedAt ? { ...DEMO_FACE, createdAt: db.faceCreatedAt } : null;
  }

  async getFaceModel(faceId: string): Promise<FaceModel> {
    if (faceId !== DEMO_FACE.id) throw new ApiError('얼굴 모델을 찾을 수 없어요.', 404);
    return DEMO_FACE;
  }

  async deleteFaceModel() {
    const db = await this.requireUser();
    db.faceCreatedAt = null;
    db.looks = [];
    await this.save();
  }

  async listLooks(): Promise<Look[]> {
    const db = await this.requireUser();
    return [...db.looks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getLook(lookId: string): Promise<Look> {
    const db = await this.requireUser();
    const look = db.looks.find((l) => l.id === lookId);
    if (!look) throw new ApiError('저장된 룩을 찾을 수 없어요.', 404);
    return look;
  }

  async createLook(input: NewLook): Promise<Look> {
    const db = await this.requireUser();
    const now = new Date().toISOString();
    const look: Look = {
      id: id(),
      name: input.name.trim(),
      faceModelId: input.faceModelId,
      values: sanitizeValues(input.values),
      presetId: input.presetId ?? null,
      engineVersion: input.engineVersion ?? FACE_ENGINE_VERSION,
      thumbnailUrl: input.thumbnail ?? null,
      createdAt: now,
      updatedAt: now,
    };
    db.looks.push(look);
    await this.save();
    return look;
  }

  async updateLook(lookId: string, patch: LookPatch): Promise<Look> {
    const db = await this.requireUser();
    const look = db.looks.find((l) => l.id === lookId);
    if (!look) throw new ApiError('저장된 룩을 찾을 수 없어요.', 404);
    if (patch.name !== undefined) look.name = patch.name.trim();
    if (patch.values !== undefined) look.values = sanitizeValues(patch.values);
    if (patch.presetId !== undefined) look.presetId = patch.presetId;
    if (patch.thumbnail) look.thumbnailUrl = patch.thumbnail;
    look.updatedAt = new Date().toISOString();
    await this.save();
    return look;
  }

  async aiStatus(): Promise<AiStatus> {
    return { enabled: false, provider: null, remainingToday: 0 };
  }

  async createAiRender(): Promise<AiRender> {
    throw new ApiError('데모 모드에서는 AI 고화질 보기를 쓸 수 없어요.', 503);
  }

  async deleteLook(lookId: string) {
    const db = await this.requireUser();
    db.looks = db.looks.filter((l) => l.id !== lookId);
    await this.save();
  }
}
