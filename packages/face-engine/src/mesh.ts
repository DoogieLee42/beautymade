import { smoothstep } from './math';

/** Mesh as delivered by the reconstruction service (or the bundled demo face). */
export interface BaseMesh {
  /** xyz per vertex. */
  positions: ArrayLike<number>;
  /** uv per vertex (v up). */
  uvs: ArrayLike<number>;
  /** Triangle vertex indices, counter-clockwise seen from the front. */
  indices: ArrayLike<number>;
  /** The first `landmarkCount` vertices are MediaPipe face-mesh landmarks, in order. */
  landmarkCount: number;
}

/** Render-ready, subdivided mesh. Landmark vertices keep their indices. */
export interface FaceMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
  landmarkCount: number;
  /** 0 on the mesh border, rising to 1 towards the inside. Used to fade the face edge. */
  edgeFade: Float32Array;
}

export interface BuildFaceMeshOptions {
  /** Levels of 1-to-4 subdivision (0-3). Each level roughly quadruples the triangle count. */
  subdivisions?: number;
  /** Phong tessellation shape factor in [0, 1]. 0 = flat midpoints, 1 = fully curved. */
  smoothing?: number;
  /** Width of the edge fade, in units of the outer-eye-corner distance. */
  fadeWidth?: number;
}

export function computeVertexNormals(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  out: Float32Array = new Float32Array(positions.length),
): Float32Array {
  out.fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    // Area-weighted face normal.
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    out[a] += nx;
    out[a + 1] += ny;
    out[a + 2] += nz;
    out[b] += nx;
    out[b + 1] += ny;
    out[b + 2] += nz;
    out[c] += nx;
    out[c + 1] += ny;
    out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const len = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= len;
    out[i + 1] /= len;
    out[i + 2] /= len;
  }
  return out;
}

interface RawMesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

/**
 * One level of 1-to-4 subdivision. Original vertices keep their index and position;
 * edge midpoints are placed on a Phong-tessellated surface so the result is smooth
 * but still interpolates the reconstructed landmarks exactly.
 */
export function subdivideOnce(mesh: RawMesh, smoothing = 0.75): RawMesh {
  const { positions, uvs, indices } = mesh;
  const vertexCount = positions.length / 3;
  const normals = computeVertexNormals(positions, indices);
  const edgeMidpoint = new Map<number, number>();
  const newPositions: number[] = Array.from(positions);
  const newUvs: number[] = Array.from(uvs);
  const newIndices = new Uint32Array(indices.length * 4);

  const midpoint = (a: number, b: number): number => {
    const key = a < b ? a * vertexCount + b : b * vertexCount + a;
    const existing = edgeMidpoint.get(key);
    if (existing !== undefined) return existing;

    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const mz = (az + bz) / 2;
    // Project the flat midpoint onto the tangent planes of both endpoints (Phong tessellation).
    const nax = normals[a * 3];
    const nay = normals[a * 3 + 1];
    const naz = normals[a * 3 + 2];
    const nbx = normals[b * 3];
    const nby = normals[b * 3 + 1];
    const nbz = normals[b * 3 + 2];
    const da = (mx - ax) * nax + (my - ay) * nay + (mz - az) * naz;
    const db = (mx - bx) * nbx + (my - by) * nby + (mz - bz) * nbz;
    const px = mx - (da * nax + db * nbx) / 2;
    const py = my - (da * nay + db * nby) / 2;
    const pz = mz - (da * naz + db * nbz) / 2;

    const index = newPositions.length / 3;
    newPositions.push(
      mx + (px - mx) * smoothing,
      my + (py - my) * smoothing,
      mz + (pz - mz) * smoothing,
    );
    newUvs.push((uvs[a * 2] + uvs[b * 2]) / 2, (uvs[a * 2 + 1] + uvs[b * 2 + 1]) / 2);
    edgeMidpoint.set(key, index);
    return index;
  };

  for (let t = 0, o = 0; t < indices.length; t += 3) {
    const a = indices[t];
    const b = indices[t + 1];
    const c = indices[t + 2];
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    newIndices.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], o);
    o += 12;
  }

  return {
    positions: Float32Array.from(newPositions),
    uvs: Float32Array.from(newUvs),
    indices: newIndices,
  };
}

/** Vertices on edges that belong to exactly one triangle. */
export function findBoundaryVertices(indices: ArrayLike<number>, vertexCount: number): number[] {
  const edgeUse = new Map<number, number>();
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k];
      const b = indices[t + ((k + 1) % 3)];
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  const boundary = new Set<number>();
  for (const [key, count] of edgeUse) {
    if (count === 1) {
      boundary.add(Math.floor(key / vertexCount));
      boundary.add(key % vertexCount);
    }
  }
  return [...boundary];
}

/** Per-vertex fade (0 at the border, 1 inside) based on distance to the nearest border vertex. */
export function computeEdgeFade(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  width: number,
): Float32Array {
  const vertexCount = positions.length / 3;
  const boundary = findBoundaryVertices(indices, vertexCount);
  const fade = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    let best = Infinity;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    for (const b of boundary) {
      const d = (positions[b * 3] - x) ** 2 + (positions[b * 3 + 1] - y) ** 2 + (positions[b * 3 + 2] - z) ** 2;
      if (d < best) best = d;
    }
    fade[i] = smoothstep(0, width, Math.sqrt(best));
  }
  return fade;
}

/** Subdivides a base mesh into a smooth, render-ready {@link FaceMesh}. */
export function buildFaceMesh(base: BaseMesh, options: BuildFaceMeshOptions = {}): FaceMesh {
  const { subdivisions = 2, smoothing = 0.75, fadeWidth = 0.09 } = options;
  let raw: RawMesh = {
    positions: Float32Array.from(base.positions),
    uvs: Float32Array.from(base.uvs),
    indices: Uint32Array.from(base.indices),
  };
  for (let level = 0; level < subdivisions; level++) raw = subdivideOnce(raw, smoothing);

  const vertexCount = raw.positions.length / 3;
  const eyeSpan = outerEyeDistance(raw.positions, base.landmarkCount);
  return {
    positions: raw.positions,
    normals: computeVertexNormals(raw.positions, raw.indices),
    uvs: raw.uvs,
    indices: vertexCount < 65536 ? Uint16Array.from(raw.indices) : raw.indices,
    vertexCount,
    landmarkCount: base.landmarkCount,
    edgeFade: computeEdgeFade(raw.positions, raw.indices, fadeWidth * eyeSpan),
  };
}

function outerEyeDistance(positions: ArrayLike<number>, landmarkCount: number): number {
  if (landmarkCount < 264) return 1;
  const a = 33 * 3;
  const b = 263 * 3;
  return Math.hypot(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
}
