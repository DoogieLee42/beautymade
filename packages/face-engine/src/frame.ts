import { add, centroid, cross, dot, normalize, readVec3, scale, sub, type Vec3 } from './math';
import { CANONICAL_POSITIONS } from './topology/canonical.generated';
import { LM, mirrorLandmark } from './topology/landmarks';

/**
 * Face-local coordinate frame. Deformations are authored in this frame so they are
 * independent of head pose and face size:
 *   x = towards the viewer's right (subject's left), y = up, z = out of the face,
 *   1 unit = distance between the outer eye corners (about 9 cm on an adult face).
 */
export interface FaceFrame {
  origin: Vec3;
  axisX: Vec3;
  axisY: Vec3;
  axisZ: Vec3;
  /** World units per local unit. */
  scale: number;
}

export function computeFaceFrame(positions: ArrayLike<number>, landmarkCount = 468): FaceFrame {
  const all = Array.from({ length: landmarkCount }, (_, i) => i);
  const origin = centroid(positions, all);

  // Average left-to-right direction over symmetric landmark pairs.
  let across: Vec3 = [0, 0, 0];
  for (let i = 0; i < landmarkCount; i++) {
    if (CANONICAL_POSITIONS[i * 3] > -1.5) continue; // subject's right half only
    const m = mirrorLandmark(i);
    across = add(across, normalize(sub(readVec3(positions, m), readVec3(positions, i))));
  }
  const axisX = normalize(across);
  const up = sub(readVec3(positions, LM.foreheadTop), readVec3(positions, LM.menton));
  const axisY = normalize(sub(up, scale(axisX, dot(up, axisX))));
  const axisZ = normalize(cross(axisX, axisY));
  const eyeSpan = Math.hypot(...sub(readVec3(positions, LM.eyeOuterRight), readVec3(positions, LM.eyeOuterLeft)));
  return { origin, axisX, axisY, axisZ, scale: eyeSpan };
}

/** Converts world positions to local frame coordinates (n x 3). */
export function toLocalPositions(frame: FaceFrame, positions: ArrayLike<number>): Float32Array {
  const n = positions.length / 3;
  const out = new Float32Array(n * 3);
  const { origin, axisX, axisY, axisZ } = frame;
  const inv = 1 / frame.scale;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3] - origin[0];
    const y = positions[i * 3 + 1] - origin[1];
    const z = positions[i * 3 + 2] - origin[2];
    out[i * 3] = (x * axisX[0] + y * axisX[1] + z * axisX[2]) * inv;
    out[i * 3 + 1] = (x * axisY[0] + y * axisY[1] + z * axisY[2]) * inv;
    out[i * 3 + 2] = (x * axisZ[0] + y * axisZ[1] + z * axisZ[2]) * inv;
  }
  return out;
}

/** Converts a local-frame displacement into a world-space displacement. */
export function localVectorToWorld(frame: FaceFrame, v: Vec3): Vec3 {
  const { axisX, axisY, axisZ } = frame;
  return scale(add(add(scale(axisX, v[0]), scale(axisY, v[1])), scale(axisZ, v[2])), frame.scale);
}
