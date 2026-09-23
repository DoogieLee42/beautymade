import { describe, expect, it } from 'vitest';

import {
  DeformationModel,
  buildFaceMesh,
  computeVertexNormals,
  findBoundaryVertices,
  type BaseMesh,
} from '../src';
import fixture from './fixtures/canonical-head.json';

/** The head the reconstruction service fits around the canonical face. */
const base = fixture as unknown as BaseMesh;

describe('full-head mesh', () => {
  const mesh = buildFaceMesh(base, { subdivisions: 2 });
  const shellCount = base.positions.length / 3 - base.landmarkCount;

  it('keeps the landmarks first and adds the shell and the band copies', () => {
    expect(mesh.hasHead).toBe(true);
    expect(mesh.landmarkCount).toBe(468);
    for (let i = 0; i < 468 * 3; i++) expect(mesh.positions[i]).toBeCloseTo(base.positions[i], 5);
    const faceVertices = 7257; // the face-only mesh at two subdivision levels
    expect(mesh.vertexCount).toBe(faceVertices + shellCount + 36 * 4);
    expect(Math.max(...mesh.indices)).toBe(mesh.vertexCount - 1);
  });

  it('is watertight except at the bottom of the neck', () => {
    const border = findBoundaryVertices(mesh.indices, mesh.vertexCount, mesh.weld);
    expect(border.length).toBeGreaterThan(20);
    let lowest = Infinity;
    for (let i = 0; i < 468; i++) lowest = Math.min(lowest, mesh.positions[i * 3 + 1]);
    for (const v of border) expect(mesh.positions[v * 3 + 1]).toBeLessThan(lowest - 3);
  });

  it('only fades the neck', () => {
    // The face and the scalp are fully opaque; only vertices near the neck cut fade out.
    for (let i = 0; i < 468; i++) expect(mesh.edgeFade[i]).toBe(1);
    const faded = Array.from(mesh.edgeFade).filter((f) => f < 1).length;
    expect(faded).toBeGreaterThan(0);
    expect(faded).toBeLessThan(mesh.vertexCount * 0.15);
  });

  it('shares normals across texture seams and the face border', () => {
    const weld = mesh.weld!;
    let copies = 0;
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (weld[i] === i) continue;
      copies++;
      for (let k = 0; k < 3; k++) {
        expect(mesh.positions[i * 3 + k]).toBeCloseTo(mesh.positions[weld[i] * 3 + k], 5);
        expect(mesh.normals[i * 3 + k]).toBeCloseTo(mesh.normals[weld[i] * 3 + k], 5);
      }
    }
    expect(copies).toBeGreaterThanOrEqual(36 * 4);
  });

  it('faces outwards everywhere', () => {
    // Normals point away from the middle of the head for almost every vertex.
    const normals = computeVertexNormals(mesh.positions, mesh.indices, undefined, mesh.weld);
    let outward = 0;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const dx = mesh.positions[i * 3];
      const dy = (mesh.positions[i * 3 + 1] - 1) * 0.5;
      const dz = mesh.positions[i * 3 + 2] + 5.5;
      if (normals[i * 3] * dx + normals[i * 3 + 1] * dy + normals[i * 3 + 2] * dz > 0) outward++;
    }
    expect(outward / mesh.vertexCount).toBeGreaterThan(0.93);
  });

  it('moves the face border and its band copies together when deformed', () => {
    const model = new DeformationModel(mesh);
    const out = model.apply({ jawline: 1, chinLength: -1, forehead: 1 });
    const weld = mesh.weld!;
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (weld[i] === i) continue;
      for (let k = 0; k < 3; k++) expect(out[i * 3 + k]).toBeCloseTo(out[weld[i] * 3 + k], 5);
    }
    // Contour edits reach into the head a little (no step at the border) but not the back of it.
    expect(model.influenceCount('jawline')).toBeGreaterThan(0);
    let backMoved = 0;
    for (let i = 0; i < mesh.vertexCount; i++) {
      if (mesh.positions[i * 3 + 2] > -12) continue;
      const d = Math.hypot(out[i * 3] - mesh.positions[i * 3], out[i * 3 + 1] - mesh.positions[i * 3 + 1], out[i * 3 + 2] - mesh.positions[i * 3 + 2]);
      if (d > 1e-4) backMoved++;
    }
    expect(backMoved).toBe(0);
  });

  it('can be built coarser for the scanning wireframe', () => {
    const coarse = buildFaceMesh(base, { subdivisions: 1 });
    expect(coarse.vertexCount).toBe(1833 + shellCount + 36 * 2);
  });
});
