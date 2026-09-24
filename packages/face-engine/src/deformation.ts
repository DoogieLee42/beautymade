import { SHAPE_CONTROLS, type ShapeControl, type ShapeControlId } from './controls';
import { createFieldContext, upperLidCoordinates, type DisplacementField, type FieldContext } from './fields';
import { computeFaceFrame, toLocalPositions, type FaceFrame } from './frame';
import { centroid, type Vec3 } from './math';
import type { FaceMesh } from './mesh';
import type { ControlValues } from './presets';

/** Non-zero part of a displacement field, in world units, for value +1. */
interface SparseField {
  indices: Uint32Array;
  deltas: Float32Array;
  maxDisplacement: number;
}

/**
 * Linear blend-shape model built from the control catalogue. Construction evaluates
 * every shape control once on the user's mesh (a few ms); {@link apply} is then a
 * cheap sparse sum, fast enough to run on every slider event.
 */
export class DeformationModel {
  readonly mesh: FaceMesh;
  readonly frame: FaceFrame;
  private readonly fields = new Map<ShapeControlId, SparseField>();
  private readonly ctx: FieldContext;

  /**
   * `outerEyeMm`: the face's outer-eye-corner distance in millimetres, when measured (see the
   * face model's eye measurements), so eye edits move by real millimetres.
   */
  constructor(mesh: FaceMesh, controls: readonly ShapeControl[] = SHAPE_CONTROLS, outerEyeMm?: number) {
    this.mesh = mesh;
    this.frame = computeFaceFrame(mesh.positions, mesh.landmarkCount);
    const local = toLocalPositions(this.frame, mesh.positions);
    const ctx = createFieldContext(local, mesh.landmarkCount, outerEyeMm);
    this.ctx = ctx;
    for (const control of controls) {
      this.fields.set(control.id, this.toSparse(control.field(ctx)));
    }
  }

  get controlIds(): ShapeControlId[] {
    return [...this.fields.keys()];
  }

  /** Writes the deformed rest positions into `out`. */
  apply(values: ControlValues, out: Float32Array = new Float32Array(this.mesh.positions.length)): Float32Array {
    out.set(this.mesh.positions);
    for (const [id, field] of this.fields) {
      const v = values[id];
      if (!v) continue;
      const { indices, deltas } = field;
      for (let k = 0; k < indices.length; k++) {
        const o = indices[k] * 3;
        const d = k * 3;
        out[o] += deltas[d] * v;
        out[o + 1] += deltas[d + 1] * v;
        out[o + 2] += deltas[d + 2] * v;
      }
    }
    return out;
  }

  /** Upper-eyelid coordinates of every rest vertex (see {@link upperLidCoordinates}), n x 2. */
  lidCoordinates(): Float32Array {
    return upperLidCoordinates(this.ctx);
  }

  /** Number of vertices a control moves. */
  influenceCount(id: ShapeControlId): number {
    return this.fields.get(id)?.indices.length ?? 0;
  }

  /** Largest displacement a control produces at |value| = 1, in world units. */
  maxDisplacement(id: ShapeControlId): number {
    return this.fields.get(id)?.maxDisplacement ?? 0;
  }

  /** Displacement of one vertex for a control at value +1, in world units. */
  displacementAt(id: ShapeControlId, vertex: number): Vec3 {
    const field = this.fields.get(id);
    if (!field) return [0, 0, 0];
    const k = field.indices.indexOf(vertex);
    if (k < 0) return [0, 0, 0];
    return [field.deltas[k * 3], field.deltas[k * 3 + 1], field.deltas[k * 3 + 2]];
  }

  /** Centroid of landmarks in a (deformed) position buffer. */
  landmarkCentroid(positions: ArrayLike<number>, landmarks: readonly number[]): Vec3 {
    return centroid(positions, landmarks);
  }

  private toSparse(local: DisplacementField): SparseField {
    const { axisX, axisY, axisZ, scale } = this.frame;
    const indices: number[] = [];
    const deltas: number[] = [];
    let maxDisplacement = 0;
    const n = local.length / 3;
    for (let i = 0; i < n; i++) {
      const lx = local[i * 3];
      const ly = local[i * 3 + 1];
      const lz = local[i * 3 + 2];
      if (Math.abs(lx) + Math.abs(ly) + Math.abs(lz) < 1e-7) continue;
      const wx = (lx * axisX[0] + ly * axisY[0] + lz * axisZ[0]) * scale;
      const wy = (lx * axisX[1] + ly * axisY[1] + lz * axisZ[1]) * scale;
      const wz = (lx * axisX[2] + ly * axisY[2] + lz * axisZ[2]) * scale;
      indices.push(i);
      deltas.push(wx, wy, wz);
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(wx, wy, wz));
    }
    return { indices: Uint32Array.from(indices), deltas: Float32Array.from(deltas), maxDisplacement };
  }
}
