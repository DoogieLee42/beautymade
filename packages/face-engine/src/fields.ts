import { centroid, naturalSpline, type Vec3 } from './math';
import { REGION, mirrorLandmarks } from './topology/landmarks';

/**
 * Distance between the outer eye corners of an adult, in millimetres. Used as the scale of
 * the local frame when a face has no measurements of its own.
 */
export const DEFAULT_OUTER_EYE_MM = 90;

/**
 * Inputs for evaluating a deformation field. All coordinates are in the face-local
 * frame (see {@link FaceFrame}): x right, y up, z forward, 1 unit = outer eye distance.
 */
export interface FieldContext {
  vertexCount: number;
  /** Local rest positions (n x 3). */
  local: Float32Array;
  /** Local units per millimetre on this face (eye edits are authored in millimetres). */
  mm: number;
  /** Local position of the centroid of the given landmarks. */
  anchor(landmarks: readonly number[]): Vec3;
}

/** Local-frame displacement per vertex (n x 3) for a control value of +1. */
export type DisplacementField = Float32Array;

export type FieldFn = (ctx: FieldContext) => DisplacementField;

/** `outerEyeMm`: the face's outer-eye-corner distance in mm (1 local unit). */
export function createFieldContext(
  local: Float32Array,
  landmarkCount: number,
  outerEyeMm = DEFAULT_OUTER_EYE_MM,
): FieldContext {
  return {
    vertexCount: local.length / 3,
    local,
    mm: 1 / outerEyeMm,
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

export interface LidBandSpec {
  /** Lid-margin landmarks of the subject's right eye, from the inner to the outer eye corner. */
  lid: readonly number[];
  /** Height of the band's centre line above (+) or below (-) the lid margin, in mm. */
  offset: number;
  /** The effect fades to zero this far above and below the centre line, in mm. */
  halfHeight: number;
  /** Where along the lid the effect is strongest: 0 = inner eye corner, 1 = outer corner. */
  peak: number;
  /** How far from the peak (in the same units) the effect reaches along the lid. */
  spread: number;
  /** Displacement on the centre line at the peak for value +1, in mm (x mirrored for the left eye). */
  move: Vec3;
}

/** Skin further than this behind the lid margin (e.g. the back of the head) is left alone, in mm. */
const LID_DEPTH_MM = 9;

/** An eyelid margin as smooth curves over the position along the eye. */
interface LidCurve {
  /** Position along the eye for a local x: 0 at the inner corner, 1 at the outer one (either eye). */
  along(x: number): number;
  /** Local y and z of the margin at a position along the eye. */
  y(t: number): number;
  z(t: number): number;
}

/** `lid`: margin landmarks from the inner to the outer eye corner. */
function lidCurve(ctx: FieldContext, lid: readonly number[]): LidCurve {
  const points = lid.map((i) => ctx.anchor([i]));
  const inner = points[0][0];
  const span = points[points.length - 1][0] - inner;
  const along = (x: number) => (x - inner) / span;
  const ts = points.map((p) => along(p[0]));
  return { along, y: naturalSpline(ts, points.map((p) => p[1])), z: naturalSpline(ts, points.map((p) => p[2])) };
}

/** 1 on and in front of the lid, fading to 0 for skin far behind it. */
function lidDepthWeight(ctx: FieldContext, lid: LidCurve, t: number, z: number): number {
  const depth = LID_DEPTH_MM * ctx.mm;
  const behind = lid.z(t) - z;
  return behind <= depth ? 1 : falloff(((behind - depth) / depth) ** 2);
}

const toLocal = (ctx: FieldContext, v: Vec3): Vec3 => [v[0] * ctx.mm, v[1] * ctx.mm, v[2] * ctx.mm];
const mirrored = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

/**
 * Moves a band of skin that runs parallel to an eyelid margin (under the lower lashes, the
 * hollow above the upper lid). The band follows the curve of the lid and stops short of the
 * margin, so the eye opening keeps its shape. Applied to both eyes.
 */
export function lidBand(spec: LidBandSpec): FieldFn {
  return (ctx) => {
    const out = new Float32Array(ctx.vertexCount * 3);
    const move = toLocal(ctx, spec.move);
    addLidBand(ctx, out, lidCurve(ctx, spec.lid), spec, move);
    addLidBand(ctx, out, lidCurve(ctx, mirrorLandmarks(spec.lid)), spec, mirrored(move));
    return out;
  };
}

function addLidBand(ctx: FieldContext, out: Float32Array, lid: LidCurve, spec: LidBandSpec, move: Vec3): void {
  const { local } = ctx;
  const offset = spec.offset * ctx.mm;
  const halfHeight = spec.halfHeight * ctx.mm;
  for (let i = 0; i < ctx.vertexCount; i++) {
    const t = lid.along(local[i * 3]);
    const wAlong = falloff(((t - spec.peak) / spec.spread) ** 2);
    if (wAlong === 0) continue;
    const height = local[i * 3 + 1] - lid.y(t);
    const wAcross = falloff(((height - offset) / halfHeight) ** 2);
    if (wAcross === 0) continue;
    const w = wAlong * wAcross * lidDepthWeight(ctx, lid, t, local[i * 3 + 2]);
    out[i * 3] += move[0] * w;
    out[i * 3 + 1] += move[1] * w;
    out[i * 3 + 2] += move[2] * w;
  }
}

export interface LidMarginSpec {
  /** Margin landmarks of the subject's right eye, inner to outer corner: the margin that moves ... */
  moving: readonly number[];
  /** ... and the opposite one, where the effect inside the eye opening fades out. */
  opposite: readonly number[];
  /** Where along the eye the margin moves most (0 = inner corner, 1 = outer) and how far that reaches. */
  peak: number;
  spread: number;
  /** How far into the eyelid skin the movement fades out, in mm. */
  reach: number;
  /** Displacement of the margin at the peak for value +1, in mm (x mirrored for the left eye). */
  move: Vec3;
}

/**
 * Moves an eyelid margin: raises the upper lid, lowers the outer lower lid, ... The eyelid
 * skin follows with a smooth fall-off, and across the eye opening the movement fades to zero
 * at the opposite margin, so the opening itself changes shape. Applied to both eyes.
 */
export function lidMargin(spec: LidMarginSpec): FieldFn {
  return (ctx) => {
    const out = new Float32Array(ctx.vertexCount * 3);
    const move = toLocal(ctx, spec.move);
    addLidMargin(ctx, out, lidCurve(ctx, spec.moving), lidCurve(ctx, spec.opposite), spec, move);
    const mirror = (lid: readonly number[]) => lidCurve(ctx, mirrorLandmarks(lid));
    addLidMargin(ctx, out, mirror(spec.moving), mirror(spec.opposite), spec, mirrored(move));
    return out;
  };
}

function addLidMargin(
  ctx: FieldContext,
  out: Float32Array,
  moving: LidCurve,
  opposite: LidCurve,
  spec: LidMarginSpec,
  move: Vec3,
): void {
  const { local } = ctx;
  const reach = spec.reach * ctx.mm;
  // +1 when the moving margin is the upper one: "outside" the eye is then above it.
  const up = moving.y(0.5) > opposite.y(0.5) ? 1 : -1;
  for (let i = 0; i < ctx.vertexCount; i++) {
    const t = moving.along(local[i * 3]);
    const wAlong = falloff(((t - spec.peak) / spec.spread) ** 2);
    if (wAlong === 0) continue;
    const y = local[i * 3 + 1];
    const beyond = (y - moving.y(t)) * up; // > 0 in the eyelid skin, < 0 towards the other lid
    const gap = (moving.y(t) - opposite.y(t)) * up;
    let w: number;
    if (beyond >= 0) {
      w = falloff((beyond / reach) ** 2);
    } else if (gap > 1e-6 && -beyond < gap) {
      const s = 1 + beyond / gap; // 1 at the moving margin, 0 at the opposite one
      w = s * s * (3 - 2 * s);
    } else {
      continue;
    }
    w *= wAlong * lidDepthWeight(ctx, moving, t, local[i * 3 + 2]);
    out[i * 3] += move[0] * w;
    out[i * 3 + 1] += move[1] * w;
    out[i * 3 + 2] += move[2] * w;
  }
}

/**
 * Where every vertex sits relative to the upper eyelids, for drawing a double-eyelid crease:
 * the position along the eye (0 at the inner corner, 1 at the outer one) and the height above
 * the lash line in mm, measured on the rest shape so a crease moves with the skin. Vertices
 * away from the eyes (or behind them) get a height of -99.
 */
export function upperLidCoordinates(ctx: FieldContext): Float32Array {
  const out = new Float32Array(ctx.vertexCount * 2);
  const right = lidCurve(ctx, REGION.upperLidLeft);
  const left = lidCurve(ctx, mirrorLandmarks(REGION.upperLidLeft));
  const { local } = ctx;
  for (let i = 0; i < ctx.vertexCount; i++) {
    const lid = local[i * 3] < 0 ? right : left;
    const t = lid.along(local[i * 3]);
    const behind = (lid.z(t) - local[i * 3 + 2]) / ctx.mm;
    out[i * 2] = t;
    out[i * 2 + 1] = t < -0.6 || t > 1.6 || behind > 12 ? -99 : (local[i * 3 + 1] - lid.y(t)) / ctx.mm;
  }
  return out;
}

export interface CanthusSpec {
  /** Eye-corner landmark of the subject's right eye (133 inner, 33 outer). */
  at: number;
  /** Ellipsoid radii of the region that moves with the corner, in mm. */
  radius: Vec3;
  /** Displacement of the corner for value +1, in mm (x mirrored for the left eye). */
  move: Vec3;
}

/** Moves an eye corner and the lids and skin around it (both eyes). */
export function canthus(spec: CanthusSpec): FieldFn {
  return (ctx) => {
    const out = new Float32Array(ctx.vertexCount * 3);
    const radius = toLocal(ctx, spec.radius);
    const move = toLocal(ctx, spec.move);
    addBump(ctx, out, [spec.at], undefined, radius, move);
    addBump(ctx, out, mirrorLandmarks([spec.at]), undefined, radius, mirrored(move));
    return out;
  };
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
