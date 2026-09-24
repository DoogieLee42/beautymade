import type { FaceModel } from '../api/types';
import model from '../../assets/demo-face/model.json';
import { DEMO_TEXTURES } from './demoFaceTextures.generated';

/**
 * Sample face shipped with the app: an AI-generated portrait (not a real person) put through
 * the same reconstruction as a scan (services/api/scripts/make_demo_face.py), eye
 * measurements and eyeball included. Used before the first scan and in offline demo mode.
 */
export const DEMO_FACE: FaceModel = {
  id: 'demo-face',
  createdAt: '2026-01-01T00:00:00.000Z',
  thumbnailUrl: null,
  mesh: model.mesh,
  textures: DEMO_TEXTURES,
  atlasSize: model.atlasSize,
  skinTone: model.skinTone,
  eyes: model.eyes,
  eyeTexture: model.eyeTexture,
  isDemo: true,
};
