import type { FaceModel } from '../api/types';
import model from '../../assets/demo-face/model.json';
import { DEMO_TEXTURES } from './demoFaceTextures.generated';

/**
 * Stylised sample face shipped with the app (the canonical MediaPipe face with a painted
 * porcelain texture). Used before the first scan and in offline demo mode.
 */
export const DEMO_FACE: FaceModel = {
  id: 'demo-face',
  createdAt: '2026-01-01T00:00:00.000Z',
  thumbnailUrl: null,
  mesh: model.mesh,
  textures: DEMO_TEXTURES,
  atlasSize: model.atlasSize,
  skinTone: model.skinTone,
  isDemo: true,
};
