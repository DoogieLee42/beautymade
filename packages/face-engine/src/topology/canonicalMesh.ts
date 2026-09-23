import type { BaseMesh } from '../mesh';
import {
  CANONICAL_POSITIONS,
  CANONICAL_TRIANGLES,
  CANONICAL_UVS,
  CANONICAL_VERTEX_COUNT,
} from './canonical.generated';

/** The average canonical face as a base mesh (used for tests and as a fallback shape). */
export function canonicalBaseMesh(): BaseMesh {
  return {
    positions: CANONICAL_POSITIONS,
    uvs: CANONICAL_UVS,
    indices: CANONICAL_TRIANGLES,
    landmarkCount: CANONICAL_VERTEX_COUNT,
  };
}
