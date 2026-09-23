import { smoothstep } from './math';

/**
 * Head and neck around the face (full-head models). The shell's vertices follow the
 * face landmarks in the base mesh; the band that joins the face border to the shell is
 * built here, after the face has been subdivided, so both sides always match.
 */
export interface HeadShell {
  /** The 36 face-border landmarks, in order. */
  oval: readonly number[];
  /** Shell vertices around the face opening, same direction as `oval`, starting next to oval[0]. */
  rim: readonly number[];
  /** Texture coordinate of the band at each `oval` landmark (it is textured with the head). */
  ringUvs: ArrayLike<number>;
  /** Flattened [duplicate, original] pairs of shell vertices split along texture seams. */
  weld: ArrayLike<number>;
}

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
  /** Present on full-head models: the vertices after the landmarks are the head shell. */
  head?: HeadShell | null;
}

/** Render-ready, subdivided mesh. Landmark vertices keep their indices. */
export interface FaceMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
  landmarkCount: number;
  /** 0 on the mesh border, rising to 1 towards the inside. Used to fade the edge into the background. */
  edgeFade: Float32Array;
  /**
   * For every vertex, the vertex it shares its position and normal with (itself unless it
   * is a copy made for a texture seam). Null when the mesh has no seams.
   */
  weld: Uint32Array | null;
  /** True when the mesh includes the head and neck, not just the face. */
  hasHead: boolean;
}

export interface BuildFaceMeshOptions {
  /** Levels of 1-to-4 subdivision of the face (0-3). Each level roughly quadruples its triangle count. */
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
  weld?: ArrayLike<number> | null,
): Float32Array {
  out.fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t];
    const ib = indices[t + 1];
    const ic = indices[t + 2];
    const a = ia * 3;
    const b = ib * 3;
    const c = ic * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    // Area-weighted face normal, accumulated on the welded vertex so seams stay smooth.
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const oa = (weld ? weld[ia] : ia) * 3;
    const ob = (weld ? weld[ib] : ib) * 3;
    const oc = (weld ? weld[ic] : ic) * 3;
    out[oa] += nx;
    out[oa + 1] += ny;
    out[oa + 2] += nz;
    out[ob] += nx;
    out[ob + 1] += ny;
    out[ob + 2] += nz;
    out[oc] += nx;
    out[oc + 1] += ny;
    out[oc + 2] += nz;
  }
  const n = out.length / 3;
  for (let i = 0; i < n; i++) {
    if (weld && weld[i] !== i) continue;
    const o = i * 3;
    const len = Math.hypot(out[o], out[o + 1], out[o + 2]) || 1;
    out[o] /= len;
    out[o + 1] /= len;
    out[o + 2] /= len;
  }
  if (weld) {
    for (let i = 0; i < n; i++) {
      const r = weld[i];
      if (r === i) continue;
      out[i * 3] = out[r * 3];
      out[i * 3 + 1] = out[r * 3 + 1];
      out[i * 3 + 2] = out[r * 3 + 2];
    }
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

/** Counts how many triangles use each edge (keys are a * vertexCount + b with a < b). */
function edgeUse(indices: ArrayLike<number>, vertexCount: number, weld?: ArrayLike<number> | null): Map<number, number> {
  const use = new Map<number, number>();
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      let a = indices[t + k];
      let b = indices[t + ((k + 1) % 3)];
      if (weld) {
        a = weld[a];
        b = weld[b];
      }
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  return use;
}

/** Vertices on edges that belong to exactly one triangle (texture seams are not borders when welded). */
export function findBoundaryVertices(
  indices: ArrayLike<number>,
  vertexCount: number,
  weld?: ArrayLike<number> | null,
): number[] {
  const boundary = new Set<number>();
  for (const [key, count] of edgeUse(indices, vertexCount, weld)) {
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
  weld?: ArrayLike<number> | null,
): Float32Array {
  const vertexCount = positions.length / 3;
  const boundary = findBoundaryVertices(indices, vertexCount, weld);
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
  if (base.head && base.positions.length / 3 > base.landmarkCount) return buildHeadMesh(base, base.head, options);
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
    weld: null,
    hasHead: false,
  };
}

/**
 * Full head: the face is subdivided like a face-only mesh, then a band of triangles joins
 * its (now finer) border to the head shell's opening. The band is textured from the head
 * chart, so its face-side vertices are copies of the face border welded to the originals.
 * Vertex order: subdivided face (landmarks first), shell, band copies of the face border.
 */
function buildHeadMesh(base: BaseMesh, head: HeadShell, options: BuildFaceMeshOptions): FaceMesh {
  const { subdivisions = 2, smoothing = 0.75, fadeWidth = 0.45 } = options;
  const L = base.landmarkCount;
  const total = base.positions.length / 3;

  // 1. The face on its own: landmarks and the triangles between them.
  const faceTris: number[] = [];
  const shellTris: number[] = [];
  for (let t = 0; t < base.indices.length; t += 3) {
    const a = base.indices[t];
    const b = base.indices[t + 1];
    const c = base.indices[t + 2];
    (a < L && b < L && c < L ? faceTris : shellTris).push(a, b, c);
  }
  let face: RawMesh = {
    positions: Float32Array.from(Array.prototype.slice.call(base.positions, 0, L * 3)),
    uvs: Float32Array.from(Array.prototype.slice.call(base.uvs, 0, L * 2)),
    indices: Uint32Array.from(faceTris),
  };
  for (let level = 0; level < subdivisions; level++) face = subdivideOnce(face, smoothing);
  const F = face.positions.length / 3;

  // 2. The subdivided face border, walked in the direction of `oval`.
  const ring = walkBorder(face, head.oval);
  const steps = 1 << subdivisions;
  if (ring.length !== head.oval.length * steps) throw new Error('face border does not match the head shell');

  // 3. Assemble: face, shell (moved after the subdivided face), band copies of the border.
  const shellCount = total - L;
  const R = ring.length;
  const vertexCount = F + shellCount + R;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  positions.set(face.positions);
  uvs.set(face.uvs);
  for (let i = 0; i < shellCount; i++) {
    for (let k = 0; k < 3; k++) positions[(F + i) * 3 + k] = base.positions[(L + i) * 3 + k];
    uvs[(F + i) * 2] = base.uvs[(L + i) * 2];
    uvs[(F + i) * 2 + 1] = base.uvs[(L + i) * 2 + 1];
  }
  const shellIndex = (v: number) => F + (v - L);
  const n = head.oval.length;
  for (let i = 0; i < R; i++) {
    const src = ring[i];
    const dst = F + shellCount + i;
    positions[dst * 3] = face.positions[src * 3];
    positions[dst * 3 + 1] = face.positions[src * 3 + 1];
    positions[dst * 3 + 2] = face.positions[src * 3 + 2];
    // Border vertices are evenly spaced (in parameter) between consecutive oval landmarks.
    const k = Math.floor(i / steps);
    const t = (i % steps) / steps;
    const k1 = (k + 1) % n;
    uvs[dst * 2] = head.ringUvs[k * 2] + (head.ringUvs[k1 * 2] - head.ringUvs[k * 2]) * t;
    uvs[dst * 2 + 1] = head.ringUvs[k * 2 + 1] + (head.ringUvs[k1 * 2 + 1] - head.ringUvs[k * 2 + 1]) * t;
  }

  const weld = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) weld[i] = i;
  for (let i = 0; i + 1 < head.weld.length; i += 2) weld[shellIndex(head.weld[i])] = shellIndex(head.weld[i + 1]);
  for (let i = 0; i < R; i++) weld[F + shellCount + i] = ring[i];

  const bandRing = Array.from({ length: R }, (_, i) => F + shellCount + i);
  const band = zipLoops(bandRing, head.rim.map(shellIndex), positions);
  orientLike(band, positions, face, ring);

  const indices = new Uint32Array(face.indices.length + shellTris.length + band.length);
  indices.set(face.indices);
  indices.set(shellTris.map(shellIndex), face.indices.length);
  indices.set(band, face.indices.length + shellTris.length);

  const eyeSpan = outerEyeDistance(positions, L);
  return {
    positions,
    normals: computeVertexNormals(positions, indices, undefined, weld),
    uvs,
    indices: vertexCount < 65536 ? Uint16Array.from(indices) : indices,
    vertexCount,
    landmarkCount: L,
    edgeFade: computeEdgeFade(positions, indices, fadeWidth * eyeSpan, weld),
    weld,
    hasHead: true,
  };
}

/** Border loop of a (subdivided) face starting at oval[0] and heading towards oval[1]. */
function walkBorder(face: RawMesh, oval: readonly number[]): number[] {
  const count = face.positions.length / 3;
  const next = new Map<number, number[]>();
  for (const [key, uses] of edgeUse(face.indices, count)) {
    if (uses !== 1) continue;
    const a = Math.floor(key / count);
    const b = key % count;
    next.set(a, [...(next.get(a) ?? []), b]);
    next.set(b, [...(next.get(b) ?? []), a]);
  }
  const start = oval[0];
  const towards = oval[1];
  const options = next.get(start) ?? [];
  const dist = (v: number) =>
    Math.hypot(
      face.positions[v * 3] - face.positions[towards * 3],
      face.positions[v * 3 + 1] - face.positions[towards * 3 + 1],
      face.positions[v * 3 + 2] - face.positions[towards * 3 + 2],
    );
  let prev = start;
  let cur = options[0] !== undefined && options[1] !== undefined && dist(options[1]) < dist(options[0]) ? options[1] : options[0];
  const loop = [start];
  while (cur !== undefined && cur !== start && loop.length <= count) {
    loop.push(cur);
    const nb = next.get(cur) ?? [];
    const step = nb[0] === prev ? nb[1] : nb[0];
    prev = cur;
    cur = step;
  }
  return loop;
}

/** Triangle strip between two closed loops running in the same direction, starting side by side. */
function zipLoops(a: number[], b: number[], positions: ArrayLike<number>): number[] {
  const d = (u: number, v: number) =>
    Math.hypot(
      positions[u * 3] - positions[v * 3],
      positions[u * 3 + 1] - positions[v * 3 + 1],
      positions[u * 3 + 2] - positions[v * 3 + 2],
    );
  const na = a.length;
  const nb = b.length;
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < na || j < nb) {
    const ai = a[i % na];
    const ai1 = a[(i + 1) % na];
    const bj = b[j % nb];
    const bj1 = b[(j + 1) % nb];
    const advanceA = j >= nb || (i < na && d(ai1, bj) <= d(ai, bj1));
    if (advanceA) {
      out.push(ai, ai1, bj);
      i++;
    } else {
      out.push(ai, bj1, bj);
      j++;
    }
  }
  return out;
}

/** Flips the band if its triangles face the opposite way to the face surface along the border. */
function orientLike(band: number[], positions: ArrayLike<number>, face: RawMesh, ring: number[]): void {
  const normals = computeVertexNormals(face.positions, face.indices);
  let agree = 0;
  for (let t = 0; t < band.length; t += 3) {
    const a = band[t] * 3;
    const b = band[t + 1] * 3;
    const c = band[t + 2] * 3;
    const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    // Compare with the face normal at the nearest border vertex (the band continues the face).
    const v = ring[Math.min(ring.length - 1, Math.floor((t / band.length) * ring.length))];
    agree += n[0] * normals[v * 3] + n[1] * normals[v * 3 + 1] + n[2] * normals[v * 3 + 2] > 0 ? 1 : -1;
  }
  if (agree >= 0) return;
  for (let t = 0; t < band.length; t += 3) {
    const tmp = band[t + 1];
    band[t + 1] = band[t + 2];
    band[t + 2] = tmp;
  }
}

function outerEyeDistance(positions: ArrayLike<number>, landmarkCount: number): number {
  if (landmarkCount < 264) return 1;
  const a = 33 * 3;
  const b = 263 * 3;
  return Math.hypot(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
}
