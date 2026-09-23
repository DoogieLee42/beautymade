import type { ControlValues } from '@beautymade/face-engine';

export type CaptureView = 'front' | 'left' | 'right';
export const CAPTURE_VIEWS: CaptureView[] = ['front', 'left', 'right'];

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface PhotoIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface ScanPhoto {
  view: CaptureView;
  ok: boolean;
  issues: PhotoIssue[];
  pose: HeadPose | null;
  url: string;
  width: number;
  height: number;
}

export type ScanStatus = 'capturing' | 'queued' | 'processing' | 'completed' | 'failed';

export interface Scan {
  id: string;
  status: ScanStatus;
  progress: number;
  stage: string | null;
  error: { code: string; message: string } | null;
  photos: ScanPhoto[];
  faceModelId: string | null;
  createdAt: string;
}

export interface FaceMeshData {
  positions: number[];
  uvs: number[];
  indices: number[];
  landmarkCount: number;
  /** Full-head models: how the head shell (the vertices after the landmarks) joins the face. */
  head?: { oval: number[]; rim: number[]; ringUvs: number[]; weld: number[] } | null;
}

/** Texture sources are http(s) URLs or data: URLs (the bundled demo face). */
export interface FaceModel {
  id: string;
  createdAt: string;
  thumbnailUrl: string | null;
  mesh: FaceMeshData;
  textures: { albedo: string; smooth: string; mask: string };
  atlasSize: number;
  skinTone: number[];
  views?: Record<string, { yaw: number; pitch: number; roll: number; textureShare?: number }>;
  quality?: { viewsUsed?: string[]; viewsSkipped?: string[]; multiViewResidual?: number };
  /** True for the stylised sample face shipped with the app. */
  isDemo?: boolean;
}

export interface FaceModelSummary {
  id: string;
  createdAt: string;
  thumbnailUrl: string | null;
}

export interface Me {
  user: User;
  faceModel: FaceModelSummary | null;
  lookCount: number;
}

export interface Look {
  id: string;
  name: string;
  faceModelId: string;
  values: ControlValues;
  presetId: string | null;
  engineVersion: number;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewLook {
  name: string;
  faceModelId: string;
  values: ControlValues;
  presetId?: string | null;
  engineVersion: number;
  /** data:image/jpeg;base64,... snapshot of the 3D view */
  thumbnail?: string | null;
}

export interface LookPatch {
  name?: string;
  values?: ControlValues;
  presetId?: string | null;
  thumbnail?: string | null;
}

/** A photo on the device: a file:// URI on iOS/Android, a blob:/data: URL on web. */
export interface LocalPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export interface ApiClient {
  readonly mode: 'remote' | 'demo';
  readonly baseUrl: string | null;
  health(): Promise<boolean>;
  signup(input: { email: string; password: string; name: string }): Promise<AuthResult>;
  login(input: { email: string; password: string }): Promise<AuthResult>;
  me(): Promise<Me>;
  deleteAccount(): Promise<void>;
  createScan(): Promise<Scan>;
  getScan(id: string): Promise<Scan>;
  uploadPhoto(scanId: string, view: CaptureView, photo: LocalPhoto): Promise<ScanPhoto>;
  submitScan(scanId: string): Promise<Scan>;
  getCurrentFaceModel(): Promise<FaceModel | null>;
  getFaceModel(id: string): Promise<FaceModel>;
  deleteFaceModel(id: string): Promise<void>;
  listLooks(): Promise<Look[]>;
  getLook(id: string): Promise<Look>;
  createLook(input: NewLook): Promise<Look>;
  updateLook(id: string, patch: LookPatch): Promise<Look>;
  deleteLook(id: string): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
