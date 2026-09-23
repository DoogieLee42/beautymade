import { centroid, type Vec3 } from './math';
import { mirrorLandmarks } from './topology/landmarks';

/**
 * Inputs for evaluating a deformation field. All coordinates are in the face-local
 * frame (see {@link FaceFrame}): x right, y up, z forward, 1 unit = outer eye distance.
 */
export interface FieldContext {
  vertexCount: number;
  /** Local rest positions (n x 3). */
  local: Float32Array;
  /** Local position of the centroid of the given landmarks. */
  anchor(landmarks: readonly number[]): Vec3;
}

/** Local-frame displacement per vertex (n x 3) for a control value of +1. */
export type DisplacementField = Float32Array;

export type FieldFn = (ctx: FieldContext) => DisplacementField;

export function createFieldContext(local: Float32Array, landmarkCount: number): FieldContext {
  return {
    vertexCount: local.length / 3,
    local,
    anchor(landmarks) {
      for (const i of landmarks) {
        if (i >= landmarkCount) throw new Error(`landmark ${i} out of range`);
      }
      return centroid(local, landmarks);
    },
  };
}

/** Compactly supported smooth falloff: 1 at the centre, 0 (with zero slope) at t = 1. */
export function falloff(t2: number): number {
  if (t2 >= 1) return 0;
  const s = 1 - t2;
  return s * s * s;
}

export interface BumpSpec {
  /** Landmarks whose centroid is the bump centre (authored on the subject's right side if mirrored). */
  at: readonly number[];
  /** Optional shift of the centre, in local units. */
  offset?: Vec3;
  /** Ellipsoid radii in local units. */
  radius: Vec3;
  /** Displacement at the centre for value +1, in local units. */
  move: Vec3;
  /** Also apply the mirrored bump on the other half of the face (x and move.x flipped). */
  mirror?: boolean;
}

/** Translates a soft ellipsoidal region of the face. */
export function bump(spec: BumpSpec): FieldFn {
  return (ctx) => {
    const out = new Float32Array(ctx.vertexCount * 3);
    addBump(ctx, out, spec.at, spec.offset, spec.radius, spec.move);
    if (spec.mirror) {
      const offset = spec.offset ? ([-spec.offset[0], spec.offset[1], spec.offset[2]] as Vec3) : undefined;
      addBump(ctx, out, mirrorLandmarks(spec.at), offset, spec.radius, [-spec.move[0], spec.move[1], spec.move[2]]);
    }
    return out;
  };
}

function addBump(
  ctx: FieldContext,
  out: Float32Array,
  at: readonly number[],
  offset: Vec3 | undefined,
  radius: Vec3,
  move: Vec3,
): void {
  const c = ctx.anchor(at);
  if (offset) {
    c[0] += offset[0];
    c[1] += offset[1];
    c[2] += offset[2];
  }
  const { local } = ctx;
  for (let i = 0; i < ctx.vertexCount; i++) {
    const dx = (local[i * 3] - c[0]) / radius[0];
    const dy = (local[i * 3 + 1] - c[1]) / radius[1];
    const dz = (local[i * 3 + 2] - c[2]) / radius[2];
    const w = falloff(dx * dx + dy * dy + dz * dz);
    if (w === 0) continue;
    out[i * 3] += move[0] * w;
    out[i * 3 + 1] += move[1] * w;
    out[i * 3 + 2] += move[2] * w;
  }
}

/** Sums several fields. */
export function combine(...fields: FieldFn[]): FieldFn {
  return (ctx) => {
    const out = new Float32Array(ctx.vertexCount * 3);
    for (const field of fields) {
      const f = field(ctx);
      for (let i = 0; i < out.length; i++) out[i] += f[i];
    }
    return out;
  };
}

export interface LipSpec {
  /** Vertical growth of the lip (away from the mouth seam) at the lip border, local units. */
  grow: number;
  /** Forward pout at the middle of the lip, local units. */
  pout: number;
  upper: boolean;
  lower: boolean;
}

/**
 * Lip volume: vertices move away from the mouth seam (upper lip up, lower lip down)
 * and forward. The seam is approximated by a parabola through the inner lip
 * midpoint and the inner mouth corners, so lip vertices on the seam stay put.
 */
export function lips(spec: LipSpec): FieldFn {
  return (ctx) => {
    const out = new Float32Array(ctx.vertexCount * 3);
    const centre = ctx.anchor([13, 14]);
    const cornerL = ctx.anchor([78]);
    const cornerR = ctx.anchor([308]);
    const upperBorder = ctx.anchor([0]);
    const lowerBorder = ctx.anchor([17]);
    const outerL = ctx.anchor([61]);
    const outerR = ctx.anchor([291]);
    const halfWidth = (outerR[0] - outerL[0]) / 2;
    const midX = (outerR[0] + outerL[0]) / 2;
    const cornerY = (cornerL[1] + cornerR[1]) / 2;
    const innerHalf = Math.max((cornerR[0] - cornerL[0]) / 2, 1e-3);
    const upperH = Math.max(upperBorder[1] - centre[1], 1e-3);
    const lowerH = Math.max(centre[1] - lowerBorder[1], 1e-3);
    const { local } = ctx;

    for (let i = 0; i < ctx.vertexCount; i++) {
      const x = local[i * 3] - midX;
      const y = local[i * 3 + 1];
      const z = local[i * 3 + 2];
      // Horizontal extent: full effect across the lips, fading past the mouth corners.
      const ax = Math.abs(x) / (halfWidth * 1.35);
      if (ax >= 1) continue;
      const wx = falloff(ax * ax);
      const u = Math.min(Math.abs(x) / innerHalf, 1.2);
      const seamY = centre[1] + (cornerY - centre[1]) * u * u;
      const above = y >= seamY;
      if ((above && !spec.upper) || (!above && !spec.lower)) continue;
      const h = above ? upperH : lowerH;
      // s: 0 on the seam, 1 on the lip border, >1 in the surrounding skin.
      const s = Math.abs(y - seamY) / h;
      if (s > 2.2) continue;
      // Growth rises linearly to the border, then relaxes back to zero in the skin.
      const g = s <= 1 ? s : falloff(((s - 1) / 1.2) ** 2);
      // Forward pout covers the whole lip and fades out in the surrounding skin.
      const p = s <= 1 ? 1 : falloff((s - 1) ** 2);
      // Ignore geometry far behind the lips (e.g. cheeks curving back).
      if (z < centre[2] - 0.25) continue;
      out[i * 3 + 1] += (above ? 1 : -1) * spec.grow * g * wx;
      out[i * 3 + 2] += spec.pout * p * wx;
    }
    return out;
  };
}
