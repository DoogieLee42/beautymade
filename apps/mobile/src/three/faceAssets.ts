import { DeformationModel, buildFaceMesh } from '@beautymade/face-engine';

import type { FaceModel } from '../api/types';
import type { LoadedFace } from './FaceRenderer';
import { loadTexture } from './textureLoader';
import { meshEdges } from './wireframe';

const cache = new Map<string, Promise<LoadedFace>>();

/**
 * Turns an API face model into GPU-ready data: the 468-landmark mesh is subdivided
 * (~7k vertices), the beauty deformation basis is precomputed and textures are loaded.
 * Results are cached per face so every screen shares the same work.
 */
export function loadFace(face: FaceModel): Promise<LoadedFace> {
  const key = face.id;
  let pending = cache.get(key);
  if (!pending) {
    pending = build(face);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

async function build(face: FaceModel): Promise<LoadedFace> {
  const eyeball = face.textures.eyes && face.eyeTexture ? face.textures.eyes : null;
  const texturesPromise = Promise.all([
    loadTexture(face.textures.albedo),
    loadTexture(face.textures.smooth),
    loadTexture(face.textures.mask),
    // Without the eyeball the eye openings fall back to the face texture.
    eyeball ? loadTexture(eyeball).catch(() => null) : Promise.resolve(null),
  ]);
  // Let the texture requests start before the (synchronous) geometry work.
  await new Promise((r) => setTimeout(r, 0));
  const mesh = buildFaceMesh(face.mesh, { subdivisions: 2 });
  const model = new DeformationModel(mesh, undefined, outerEyeMm(face));
  const coarse = buildFaceMesh(face.mesh, { subdivisions: 1 });
  const wire = { positions: coarse.positions, edges: meshEdges(coarse.indices, coarse.vertexCount) };
  const [albedo, smooth, mask, eyes] = await texturesPromise;
  return {
    id: face.id,
    mesh,
    wire,
    model,
    lid: model.lidCoordinates(),
    textures: { albedo, smooth, mask, eyes },
    eyeMaps: eyes && face.eyeTexture ? { right: face.eyeTexture.right, left: face.eyeTexture.left } : null,
    skinTone: face.skinTone,
    lit: !!face.isDemo,
  };
}

/** The measured distance between the outer eye corners, so eye edits move by real millimetres. */
function outerEyeMm(face: FaceModel): number | undefined {
  const eyes = face.eyes;
  if (!eyes) return undefined;
  return eyes.outerCanthalMm ?? eyes.intercanthalMm + eyes.right.widthMm + eyes.left.widthMm;
}

export function forgetFace(faceId: string): void {
  cache.delete(faceId);
}
