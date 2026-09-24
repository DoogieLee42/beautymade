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

export interface EyeMeasurements {
  widthMm: number;
  heightMm: number;
  /** Canthal tilt: positive when the outer corner sits higher than the inner one. */
  tiltDeg: number;
  /** Pupil centre to the upper (mrd1) and lower (mrd2) lid margin. */
  mrd1Mm: number;
  mrd2Mm: number;
}

/** Estimated from the front photo, using the iris width (about 11.7 mm) as the ruler. */
export interface EyeAnalysis {
  irisDiameterMm: number;
  /** The person's own right and left eyes. */
  right: EyeMeasurements;
  left: EyeMeasurements;
  intercanthalMm: number;
  interpupillaryMm: number;
  /** Outer eye corner to outer eye corner (missing on the first measured models). */
  outerCanthalMm?: number;
  /** Distance between the inner eye corners divided by the average eye width. */
  intercanthalRatio: number;
}

/** Where a model-space point p falls in the eyeball atlas: u = u . (p, 1), v = v . (p, 1). */
export interface EyeMap {
  u: number[];
  v: number[];
}

/** The clean eyeball atlas (the person's right eye on the left): the eye openings are drawn from it. */
export interface EyeTexture {
  width: number;
  height: number;
  right: EyeMap;
  left: EyeMap;
}

/** Texture sources are http(s) URLs or data: URLs (the bundled demo face). */
export interface FaceModel {
  id: string;
  createdAt: string;
  thumbnailUrl: string | null;
  mesh: FaceMeshData;
  textures: { albedo: string; smooth: string; mask: string; eyes?: string | null };
  atlasSize: number;
  skinTone: number[];
  views?: Record<string, { yaw: number; pitch: number; roll: number; textureShare?: number }>;
  quality?: { viewsUsed?: string[]; viewsSkipped?: string[]; multiViewResidual?: number };
  /** Missing on the demo face, on scans made before eye measurements, and when they weren't reliable. */
  eyes?: EyeAnalysis | null;
  /** With `textures.eyes`: scans that could be measured get a clean eyeball for eye-opening edits. */
  eyeTexture?: EyeTexture | null;
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

export type AiAngle = 'front' | 'left' | 'right' | 'custom';

export interface AiStatus {
  enabled: boolean;
  provider: string | null;
  remainingToday: number;
}

export interface NewAiRender {
  faceModelId: string;
  values: ControlValues;
  angle: AiAngle;
  /** data:image/jpeg;base64,... render of the edited 3D face at the wanted angle */
  guide: string;
}

export interface AiRender {
  id: string;
  url: string;
  cached: boolean;
  remainingToday: number;
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
  aiStatus(): Promise<AiStatus>;
  createAiRender(input: NewAiRender): Promise<AiRender>;
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
