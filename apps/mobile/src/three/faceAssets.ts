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
  const texturesPromise = Promise.all([
    loadTexture(face.textures.albedo),
    loadTexture(face.textures.smooth),
    loadTexture(face.textures.mask),
  ]);
  // Let the texture requests start before the (synchronous) geometry work.
  await new Promise((r) => setTimeout(r, 0));
  const mesh = buildFaceMesh(face.mesh, { subdivisions: 2 });
  const model = new DeformationModel(mesh);
  const coarse = buildFaceMesh(face.mesh, { subdivisions: 1 });
  const wire = { positions: coarse.positions, edges: meshEdges(coarse.indices, coarse.vertexCount) };
  const [albedo, smooth, mask] = await texturesPromise;
  return {
    id: face.id,
    mesh,
    wire,
    model,
    textures: { albedo, smooth, mask },
    skinTone: face.skinTone,
    lit: !!face.isDemo,
  };
}

export function forgetFace(faceId: string): void {
  cache.delete(faceId);
}
