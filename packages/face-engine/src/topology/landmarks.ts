import { CANONICAL_POSITIONS, CANONICAL_VERTEX_COUNT } from './canonical.generated';

/**
 * Semantic MediaPipe face-mesh landmark indices.
 * "Left"/"right" are from the viewer's point of view in a frontal photo:
 * viewer-left is the subject's right side (negative x in the canonical frame).
 */
export const LM = {
  foreheadTop: 10,
  foreheadMid: 151,
  glabella: 9,
  nasion: 168,
  bridgeUpper: 6,
  bridgeMid: 197,
  bridgeLower: 195,
  noseDorsumTip: 5,
  noseTip: 4,
  pronasale: 1,
  columella: 19,
  subnasaleUpper: 94,
  subnasale: 2,
  upperLipTop: 0,
  upperLipInner: 13,
  lowerLipInner: 14,
  lowerLipBottom: 17,
  chinTop: 18,
  chinUpper: 200,
  chinMid: 199,
  chinLower: 175,
  menton: 152,
  mouthCornerLeft: 61,
  mouthCornerRight: 291,
  mouthInnerCornerLeft: 78,
  mouthInnerCornerRight: 308,
  eyeOuterLeft: 33,
  eyeOuterRight: 263,
  eyeInnerLeft: 133,
  eyeInnerRight: 362,
  upperLidLeft: 159,
  lowerLidLeft: 145,
  browLeft: 105,
} as const;

/** Landmarks on the subject's right half (viewer-left). Mirror with {@link mirrorLandmark}. */
export const REGION = {
  noseBridge: [LM.bridgeUpper, LM.bridgeMid, LM.bridgeLower],
  noseTip: [LM.noseTip, LM.pronasale],
  noseTipAndColumella: [LM.noseTip, LM.pronasale, LM.subnasaleUpper, LM.subnasale],
  noseMidline: [LM.noseTip, LM.subnasale, LM.subnasaleUpper],
  alaLeft: [64, 48, 98, 129, 102],
  chin: [LM.menton, LM.chinLower, LM.chinMid, 148, 377],
  chinFront: [LM.menton, LM.chinLower, LM.chinMid, LM.chinUpper],
  jawAngleLeft: [172, 136, 138, 58],
  jawBodyLeft: [150, 149, 169, 210],
  cheekboneLeft: [123, 116, 117, 147],
  cheekAppleLeft: [50, 101, 36, 205, 118],
  templeLeft: [71, 139, 21, 162, 54],
  forehead: [LM.foreheadMid, 108, 337, LM.glabella, LM.foreheadTop],
  mouth: [LM.upperLipTop, LM.upperLipInner, LM.lowerLipInner, LM.lowerLipBottom, LM.mouthCornerLeft, LM.mouthCornerRight],
  mouthCornerLeft: [LM.mouthCornerLeft],
  jowlLeft: [135, 138, 169, 210, 214],
  midCheekLeft: [206, 216, 192, 212],
  nasolabialLeft: [206, 216, 92, 165],
  /** Upper and lower lid margins, from the inner to the outer eye corner. */
  upperLidLeft: [133, 173, 157, 158, 159, 160, 161, 246, 33],
  lowerLidLeft: [133, 155, 154, 153, 145, 144, 163, 7, 33],
  /** Skin above the outer half of the upper lid, where a sagging lid hoods the eye. */
  lidHoodLeft: [225, 224, 30, 29],
} as const;

let mirrorTable: Int32Array | null = null;

/**
 * Index of the landmark mirrored across the facial midline (e.g. 33 <-> 263).
 * Midline landmarks map to themselves. Derived from the symmetric canonical face.
 */
export function mirrorLandmark(index: number): number {
  if (!mirrorTable) mirrorTable = buildMirrorTable();
  return mirrorTable[index];
}

function buildMirrorTable(): Int32Array {
  const n = CANONICAL_VERTEX_COUNT;
  const table = new Int32Array(n);
  const p = CANONICAL_POSITIONS;
  for (let i = 0; i < n; i++) {
    const tx = -p[i * 3];
    const ty = p[i * 3 + 1];
    const tz = p[i * 3 + 2];
    let best = i;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      const d = (p[j * 3] - tx) ** 2 + (p[j * 3 + 1] - ty) ** 2 + (p[j * 3 + 2] - tz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    table[i] = best;
  }
  return table;
}

export function mirrorLandmarks(indices: readonly number[]): number[] {
  return indices.map(mirrorLandmark);
}
