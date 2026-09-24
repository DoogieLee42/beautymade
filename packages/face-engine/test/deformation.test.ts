import { beforeAll, describe, expect, it } from 'vitest';

import {
  CONTROLS,
  DeformationModel,
  LM,
  PRESETS,
  REGION,
  SHAPE_CONTROLS,
  buildFaceMesh,
  canonicalBaseMesh,
  mirrorLandmark,
  type FaceMesh,
  type ShapeControlId,
} from '../src';

let mesh: FaceMesh;
let model: DeformationModel;

beforeAll(() => {
  mesh = buildFaceMesh(canonicalBaseMesh(), { subdivisions: 2 });
  model = new DeformationModel(mesh);
});

const S = 8.89; // outer eye distance of the canonical face

function moved(id: ShapeControlId, landmark: number, value = 1): [number, number, number] {
  const out = model.apply({ [id]: value });
  const o = landmark * 3;
  return [out[o] - mesh.positions[o], out[o + 1] - mesh.positions[o + 1], out[o + 2] - mesh.positions[o + 2]];
}

const norm = (v: number[]) => Math.hypot(...v);

describe('DeformationModel', () => {
  it('builds a field for every shape control', () => {
    expect(model.controlIds.sort()).toEqual(SHAPE_CONTROLS.map((c) => c.id).sort());
    for (const id of model.controlIds) {
      expect(model.influenceCount(id), id).toBeGreaterThan(20);
      // Every control is visible but none moves the surface by more than ~6% of the eye span.
      expect(model.maxDisplacement(id), id).toBeGreaterThan(0.01 * S);
      expect(model.maxDisplacement(id), id).toBeLessThan(0.065 * S);
    }
  });

  it('is the identity with no adjustments', () => {
    expect(model.apply({})).toEqual(mesh.positions);
    expect(model.apply({ noseBridge: 0, skinGlow: 0.8 })).toEqual(mesh.positions);
  });

  it('is linear in the slider value', () => {
    const a = moved('noseTip', LM.noseTip, 0.5);
    const b = moved('noseTip', LM.noseTip, 1);
    const c = moved('noseTip', LM.noseTip, -1);
    expect(a[2] * 2).toBeCloseTo(b[2], 5);
    expect(c[2]).toBeCloseTo(-b[2], 5);
  });

  it('raises the nose bridge and tip forwards', () => {
    expect(moved('noseBridge', LM.bridgeMid)[2]).toBeGreaterThan(0.3);
    expect(moved('noseTip', LM.noseTip)[2]).toBeGreaterThan(0.3);
    expect(moved('noseTipRotation', LM.pronasale)[1]).toBeGreaterThan(0.15);
  });

  it('keeps each control local to its region', () => {
    const far: Record<string, number[]> = {
      lidRaise: [LM.noseTip, LM.browLeft, LM.lowerLidLeft],
      innerCorner: [LM.noseTip, LM.browLeft, LM.eyeOuterLeft],
      outerCorner: [LM.noseTip, LM.browLeft, LM.eyeInnerLeft],
      lowerLid: [LM.noseTip, LM.browLeft, LM.upperLidLeft],
      aegyoSal: [LM.noseTip, LM.browLeft, LM.upperLidLeft, 230],
      underEye: [LM.noseTip, LM.browLeft, LM.upperLidLeft, 23],
      upperLid: [LM.noseTip, LM.browLeft, LM.lowerLidLeft],
      browLift: [LM.noseTip, LM.browLeft, 52, LM.lowerLidLeft],
      noseBridge: [LM.menton, LM.mouthCornerLeft, LM.eyeOuterLeft],
      noseTip: [LM.menton, LM.upperLipTop, LM.eyeInnerLeft],
      alarWidth: [LM.noseTip, LM.menton, LM.eyeOuterLeft],
      jawline: [LM.menton, LM.noseTip, LM.mouthCornerLeft],
      chinLength: [LM.upperLipTop, LM.noseTip],
      chinProjection: [LM.upperLipTop, LM.noseTip],
      cheekbone: [LM.noseTip, LM.menton],
      forehead: [LM.noseTip, LM.menton],
      temple: [LM.eyeInnerLeft, LM.noseTip],
      lipVolume: [LM.noseTip, LM.menton, LM.subnasale],
      upperLip: [LM.lowerLipBottom, LM.menton],
      lipCorners: [LM.noseTip, LM.menton],
      lipWidth: [LM.noseTip, LM.menton],
      lift: [LM.noseTip, LM.menton, LM.foreheadTop],
      cheekVolume: [LM.menton, LM.foreheadTop],
      nasolabial: [LM.menton, LM.foreheadTop, LM.eyeOuterLeft],
    };
    for (const [id, landmarks] of Object.entries(far)) {
      for (const lm of landmarks) {
        expect(norm(moved(id as ShapeControlId, lm)), `${id} moved landmark ${lm}`).toBeLessThan(1e-4);
      }
    }
  });

  it('deforms both halves of the face symmetrically', () => {
    for (const control of SHAPE_CONTROLS) {
      const out = model.apply({ [control.id]: 1 });
      for (let i = 0; i < mesh.landmarkCount; i++) {
        const m = mirrorLandmark(i);
        const di = [out[i * 3] - mesh.positions[i * 3], out[i * 3 + 1] - mesh.positions[i * 3 + 1], out[i * 3 + 2] - mesh.positions[i * 3 + 2]];
        const dm = [out[m * 3] - mesh.positions[m * 3], out[m * 3 + 1] - mesh.positions[m * 3 + 1], out[m * 3 + 2] - mesh.positions[m * 3 + 2]];
        expect(di[0], `${control.id} x @${i}`).toBeCloseTo(-dm[0], 3);
        expect(di[1], `${control.id} y @${i}`).toBeCloseTo(dm[1], 3);
        expect(di[2], `${control.id} z @${i}`).toBeCloseTo(dm[2], 3);
      }
    }
  });

  it('moves paired features in the expected directions', () => {
    // V-line pulls the jaw angles towards the midline.
    expect(moved('jawline', 172)[0]).toBeGreaterThan(0.2);
    expect(moved('jawline', 397)[0]).toBeLessThan(-0.2);
    // Wider alae move outwards.
    expect(moved('alarWidth', 64)[0]).toBeLessThan(-0.1);
    // Mouth corners lift.
    expect(moved('lipCorners', LM.mouthCornerLeft)[1]).toBeGreaterThan(0.15);
    // Lift raises the jowls.
    expect(moved('lift', 135)[1]).toBeGreaterThan(0.2);
    // Longer chin moves the menton down.
    expect(moved('chinLength', LM.menton)[1]).toBeLessThan(-0.3);
  });

  it('keeps the lash lines of both eyes in place', () => {
    const margins = [...REGION.upperLidLeft, ...REGION.lowerLidLeft];
    for (const id of ['aegyoSal', 'underEye', 'upperLid', 'browLift'] as ShapeControlId[]) {
      for (const lm of [...margins, ...margins.map(mirrorLandmark)]) {
        expect(norm(moved(id, lm)), `${id} moved lid margin ${lm}`).toBeLessThan(1e-4);
        expect(norm(moved(id, lm, -1)), `${id} moved lid margin ${lm}`).toBeLessThan(1e-4);
      }
    }
  });

  it('opens the eyes by the millimetres each procedure promises', () => {
    const mm = S / 90; // world units per mm, the canonical face being ~90 mm between the outer eye corners
    // Ptosis correction raises the upper lid over the pupil by ~2 mm; the lower lid stays.
    expect(moved('lidRaise', LM.upperLidLeft)[1]).toBeGreaterThan(1.7 * mm);
    expect(norm(moved('lidRaise', LM.lowerLidLeft))).toBeLessThan(1e-4);
    expect(norm(moved('lidRaise', LM.eyeOuterLeft))).toBeLessThan(0.05 * mm);
    // Epicanthoplasty moves the inner corners towards the nose (the subject's right eye is on -x).
    expect(moved('innerCorner', LM.eyeInnerLeft)[0]).toBeGreaterThan(2.4 * mm);
    expect(moved('innerCorner', LM.eyeInnerRight)[0]).toBeLessThan(-2.4 * mm);
    // Lateral canthoplasty moves the outer corners outwards.
    expect(moved('outerCorner', LM.eyeOuterLeft)[0]).toBeLessThan(-2.9 * mm);
    expect(moved('outerCorner', LM.eyeOuterRight)[0]).toBeGreaterThan(2.9 * mm);
    // Lower-lid lowering drops the outer part of the lower lid; the upper lid stays.
    expect(moved('lowerLid', 144)[1]).toBeLessThan(-1.8 * mm);
    expect(norm(moved('lowerLid', LM.upperLidLeft))).toBeLessThan(1e-4);
  });

  it('moves eye edits by real millimetres of the measured face', () => {
    // On a face measured at 60 mm between the outer eye corners, 2.5 mm is a bigger share.
    const measured = new DeformationModel(mesh, undefined, 60);
    expect(measured.maxDisplacement('innerCorner') / model.maxDisplacement('innerCorner')).toBeCloseTo(90 / 60, 3);
    expect(measured.maxDisplacement('noseTip')).toBeCloseTo(model.maxDisplacement('noseTip'), 6);
  });

  it('knows how high every vertex sits above the upper lashes', () => {
    const lid = model.lidCoordinates();
    const along = (v: number) => lid[v * 2];
    const height = (v: number) => lid[v * 2 + 1];
    for (const v of [...REGION.upperLidLeft, ...REGION.upperLidLeft.map(mirrorLandmark)]) {
      expect(Math.abs(height(v)), `lid margin ${v}`).toBeLessThan(0.01);
    }
    for (const [inner, outer] of [
      [LM.eyeInnerLeft, LM.eyeOuterLeft],
      [LM.eyeInnerRight, LM.eyeOuterRight],
    ]) {
      expect(along(inner)).toBeCloseTo(0, 5);
      expect(along(outer)).toBeCloseTo(1, 5);
    }
    expect(height(LM.browLeft)).toBeGreaterThan(12);
    expect(height(LM.browLeft)).toBeLessThan(30);
    expect(height(LM.lowerLidLeft)).toBeLessThan(-4);
  });

  it('shapes the skin around the eyes', () => {
    // Aegyo-sal pushes the roll under the lower lashes forwards; under-eye filling works lower down.
    expect(moved('aegyoSal', 23)[2]).toBeGreaterThan(0.15);
    expect(moved('underEye', 230)[2]).toBeGreaterThan(0.12);
    // Upper-lid volume fills the hollow under the brow bone (or slims it at negative values).
    expect(moved('upperLid', 222)[2]).toBeGreaterThan(0.12);
    expect(moved('upperLid', 222, -1)[2]).toBeLessThan(-0.12);
    // The brow lift raises the hooding skin over the outer half of the lid.
    expect(moved('browLift', 224)[1]).toBeGreaterThan(0.15);
    expect(moved('browLift', mirrorLandmark(224))[1]).toBeGreaterThan(0.15);
  });

  it('grows lips away from the mouth seam', () => {
    expect(moved('lipVolume', LM.upperLipTop)[1]).toBeGreaterThan(0.1);
    expect(moved('lipVolume', LM.lowerLipBottom)[1]).toBeLessThan(-0.1);
    expect(moved('lipVolume', 37)[2]).toBeGreaterThan(0.15);
    // The upper-lip control leaves the lower lip alone.
    expect(norm(moved('upperLip', LM.lowerLipBottom))).toBeLessThan(1e-4);
    expect(moved('upperLip', LM.upperLipTop)[1]).toBeGreaterThan(0.1);
  });

  it('keeps combined presets within a sane displacement budget', () => {
    for (const preset of PRESETS) {
      const out = model.apply(preset.values);
      let max = 0;
      for (let i = 0; i < out.length; i += 3) {
        max = Math.max(max, Math.hypot(out[i] - mesh.positions[i], out[i + 1] - mesh.positions[i + 1], out[i + 2] - mesh.positions[i + 2]));
      }
      expect(max, preset.id).toBeLessThan(0.08 * S);
      expect(out.every(Number.isFinite)).toBe(true);
    }
  });

  it('has a camera focus for every control', () => {
    for (const c of CONTROLS) {
      expect(c.focus.zoom).toBeGreaterThanOrEqual(1);
      expect(Math.abs(c.focus.yaw)).toBeLessThanOrEqual(90);
      expect(c.focus.target.length).toBeGreaterThan(0);
    }
  });
});
