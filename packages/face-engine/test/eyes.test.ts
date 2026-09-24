import { describe, expect, it } from 'vitest';

import {
  CANONICAL_TRIANGLES,
  CANONICAL_VERTEX_COUNT,
  LM,
  buildFaceMesh,
  canonicalBaseMesh,
  eyeOpeningTriangles,
  findBoundaryVertices,
} from '../src';

describe('eye openings', () => {
  const mesh = buildFaceMesh(canonicalBaseMesh(), { subdivisions: 2 });
  const weld = mesh.weld!;
  /** The eye-opening copy of a lid-margin vertex. */
  const copyOf = (v: number) => weld.findIndex((w, i) => w === v && i !== v);

  it('finds the triangles that fill each eye opening', () => {
    const flags = eyeOpeningTriangles(CANONICAL_TRIANGLES, CANONICAL_VERTEX_COUNT);
    expect(flags.filter((f) => f === 1)).toHaveLength(14);
    expect(flags.filter((f) => f === 2)).toHaveLength(14);
  });

  it('gives each opening its own vertices along the lid margins', () => {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => mesh.eye[mesh.indices[t + k]]);
      expect(a === b && b === c, `triangle ${t / 3} mixes eye and skin`).toBe(true);
    }
    const count = (e: number) => mesh.eye.filter((v) => v === e).length;
    expect(count(1)).toBeGreaterThan(100);
    expect(count(1)).toBe(count(2));

    let copies = 0;
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (weld[i] === i) continue;
      copies++;
      expect(mesh.eye[i]).toBeGreaterThan(0);
      expect(mesh.eye[weld[i]]).toBe(0);
      for (let k = 0; k < 3; k++) {
        expect(mesh.positions[i * 3 + k]).toBe(mesh.positions[weld[i] * 3 + k]);
        expect(mesh.normals[i * 3 + k]).toBeCloseTo(mesh.normals[weld[i] * 3 + k], 6);
      }
    }
    expect(copies).toBe(2 * 64); // 16 lid-margin edges per eye, each split in 4
  });

  it('stays one closed surface: the only border is the face oval', () => {
    expect(findBoundaryVertices(mesh.indices, mesh.vertexCount, mesh.weld)).toHaveLength(36 * 4);
    expect(mesh.edgeFade[copyOf(LM.upperLidLeft)]).toBe(1);
  });

  it('shades the eyeball under the upper lid more than along the lower lid', () => {
    expect(mesh.eyeShade[copyOf(LM.upperLidLeft)]).toBe(1);
    expect(mesh.eyeShade[copyOf(LM.lowerLidLeft)]).toBeCloseTo(0.45, 6);
    expect(mesh.eyeShade[copyOf(LM.eyeOuterLeft)]).toBeCloseTo(0.725, 6);
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (mesh.eye[i] && weld[i] === i) expect(mesh.eyeShade[i], `inside vertex ${i}`).toBe(0);
      if (!mesh.eye[i]) expect(mesh.eyeShade[i]).toBe(0);
    }
  });
});
