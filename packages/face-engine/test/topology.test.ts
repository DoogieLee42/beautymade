import { describe, expect, it } from 'vitest';

import {
  CANONICAL_POSITIONS,
  CANONICAL_TRIANGLES,
  CANONICAL_UVS,
  CANONICAL_VERTEX_COUNT,
  FACE_OVAL,
  LM,
  buildFaceMesh,
  canonicalBaseMesh,
  computeFaceFrame,
  computeVertexNormals,
  findBoundaryVertices,
  mirrorLandmark,
} from '../src';

describe('canonical topology', () => {
  it('has the MediaPipe vertex, uv and triangle counts', () => {
    expect(CANONICAL_VERTEX_COUNT).toBe(468);
    expect(CANONICAL_POSITIONS).toHaveLength(468 * 3);
    expect(CANONICAL_UVS).toHaveLength(468 * 2);
    expect(CANONICAL_TRIANGLES).toHaveLength(898 * 3);
    expect(Math.max(...CANONICAL_TRIANGLES)).toBe(467);
  });

  it('winds triangles so normals face the viewer', () => {
    const normals = computeVertexNormals(CANONICAL_POSITIONS, CANONICAL_TRIANGLES);
    // The nose tip must face forward (+z).
    expect(normals[LM.noseTip * 3 + 2]).toBeGreaterThan(0.9);
  });

  it('has a single closed boundary: the face oval', () => {
    const boundary = findBoundaryVertices(CANONICAL_TRIANGLES, CANONICAL_VERTEX_COUNT);
    expect(new Set(boundary)).toEqual(new Set(FACE_OVAL));
    expect(FACE_OVAL).toHaveLength(36);
  });

  it('mirrors landmarks across the midline', () => {
    expect(mirrorLandmark(LM.eyeOuterLeft)).toBe(LM.eyeOuterRight);
    expect(mirrorLandmark(LM.mouthCornerLeft)).toBe(LM.mouthCornerRight);
    expect(mirrorLandmark(LM.noseTip)).toBe(LM.noseTip);
    for (let i = 0; i < CANONICAL_VERTEX_COUNT; i++) {
      expect(mirrorLandmark(mirrorLandmark(i))).toBe(i);
    }
  });
});

describe('face frame', () => {
  it('is the identity orientation for the canonical face', () => {
    const frame = computeFaceFrame(CANONICAL_POSITIONS);
    expect(frame.axisX[0]).toBeCloseTo(1, 5);
    expect(frame.axisY[1]).toBeCloseTo(1, 3);
    expect(frame.axisZ[2]).toBeCloseTo(1, 3);
    expect(frame.scale).toBeCloseTo(8.89, 2);
  });

  it('follows a rotated and scaled face', () => {
    const angle = 0.4;
    const s = 2;
    const rotated = new Float32Array(CANONICAL_POSITIONS.length);
    for (let i = 0; i < CANONICAL_VERTEX_COUNT; i++) {
      const x = CANONICAL_POSITIONS[i * 3];
      const z = CANONICAL_POSITIONS[i * 3 + 2];
      rotated[i * 3] = s * (Math.cos(angle) * x + Math.sin(angle) * z);
      rotated[i * 3 + 1] = s * CANONICAL_POSITIONS[i * 3 + 1];
      rotated[i * 3 + 2] = s * (-Math.sin(angle) * x + Math.cos(angle) * z);
    }
    const frame = computeFaceFrame(rotated);
    expect(frame.axisX[0]).toBeCloseTo(Math.cos(angle), 4);
    expect(frame.axisX[2]).toBeCloseTo(-Math.sin(angle), 4);
    expect(frame.scale).toBeCloseTo(8.89 * s, 1);
  });
});

describe('buildFaceMesh', () => {
  const base = canonicalBaseMesh();

  it('subdivides while keeping landmarks in place', () => {
    const mesh = buildFaceMesh(base, { subdivisions: 2 });
    // 7257 subdivided vertices plus copies of the two lid-margin loops (16 edges x 4 each).
    expect(mesh.vertexCount).toBe(7257 + 2 * 64);
    expect(mesh.indices.length / 3).toBe(898 * 16);
    expect(mesh.indices).toBeInstanceOf(Uint16Array);
    for (let i = 0; i < CANONICAL_VERTEX_COUNT * 3; i++) {
      expect(mesh.positions[i]).toBeCloseTo(CANONICAL_POSITIONS[i], 4);
    }
  });

  it('produces finite geometry, in-range uvs and a smooth edge fade', () => {
    const mesh = buildFaceMesh(base, { subdivisions: 2 });
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.normals.every(Number.isFinite)).toBe(true);
    expect(Math.min(...mesh.uvs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...mesh.uvs)).toBeLessThanOrEqual(1);
    for (const i of FACE_OVAL) expect(mesh.edgeFade[i]).toBe(0);
    expect(mesh.edgeFade[LM.noseTip]).toBe(1);
  });

  it('bulges midpoints outwards on curved regions (Phong tessellation)', () => {
    const flat = buildFaceMesh(base, { subdivisions: 1, smoothing: 0 });
    const smooth = buildFaceMesh(base, { subdivisions: 1, smoothing: 0.75 });
    let moved = 0;
    for (let i = CANONICAL_VERTEX_COUNT * 3; i < flat.positions.length; i++) {
      moved = Math.max(moved, Math.abs(flat.positions[i] - smooth.positions[i]));
    }
    expect(moved).toBeGreaterThan(0.01);
    expect(moved).toBeLessThan(0.5);
  });
});
