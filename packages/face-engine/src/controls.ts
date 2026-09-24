import { bump, canthus, combine, lidBand, lidMargin, lips, type FieldFn } from './fields';
import { LM, REGION } from './topology/landmarks';

export type CategoryId = 'eyes' | 'nose' | 'contour' | 'lips' | 'skin' | 'lifting';

export type ShapeControlId =
  | 'lidRaise'
  | 'innerCorner'
  | 'outerCorner'
  | 'lowerLid'
  | 'aegyoSal'
  | 'underEye'
  | 'upperLid'
  | 'browLift'
  | 'noseBridge'
  | 'noseTip'
  | 'noseTipRotation'
  | 'alarWidth'
  | 'jawline'
  | 'chinLength'
  | 'chinProjection'
  | 'cheekbone'
  | 'forehead'
  | 'temple'
  | 'lipVolume'
  | 'upperLip'
  | 'lipCorners'
  | 'lipWidth'
  | 'lift'
  | 'cheekVolume'
  | 'nasolabial';

export type SkinControlId = 'skinSmooth' | 'skinTone' | 'skinRedness' | 'skinGlow';

/** Double-eyelid crease, drawn by the face shader rather than moved geometry. */
export type LidControlId = 'creaseDepth' | 'creaseHeight' | 'creaseShape';

export type ControlId = ShapeControlId | SkinControlId | LidControlId;

/** Where the studio camera should look while a control is being adjusted. */
export interface CameraFocus {
  /** Degrees; positive orbits towards the subject's left side. */
  yaw: number;
  /** Degrees; positive looks down from above. */
  pitch: number;
  /** 1 = whole face. */
  zoom: number;
  /** Landmarks the camera should centre on. */
  target: readonly number[];
}

interface ControlBase {
  id: ControlId;
  category: CategoryId;
  label: string;
  /** Compact label for slider rows (2-4 characters). */
  short: string;
  hint: string;
  min: number;
  max: number;
  /** Words shown at the ends of the slider. */
  minLabel: string;
  maxLabel: string;
  focus: CameraFocus;
  /** Sub-heading the control is listed under within its category. */
  group?: string;
  /** Slider readout in real units ("2.5mm", "인아웃"); the plain value when absent. */
  readout?(value: number): string;
}

export interface ShapeControl extends ControlBase {
  kind: 'shape';
  id: ShapeControlId;
  /** Local-frame displacement for value +1 (negative values mirror it). */
  field: FieldFn;
}

export interface SkinControl extends ControlBase {
  kind: 'skin';
  id: SkinControlId;
}

export interface LidControl extends ControlBase {
  kind: 'lid';
  id: LidControlId;
}

export type Control = ShapeControl | SkinControl | LidControl;

export interface Category {
  id: CategoryId;
  label: string;
  /** Tab label when space is tight (defaults to `label`). */
  short?: string;
  description: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'eyes', label: '눈', description: '쌍꺼풀, 트임, 눈매교정, 눈가 볼륨' },
  { id: 'nose', label: '코', description: '콧대, 코끝, 콧볼' },
  { id: 'contour', label: '턱/윤곽', short: '윤곽', description: '턱선, 턱끝, 광대, 이마' },
  { id: 'lips', label: '입술', description: '볼륨, 입꼬리, 너비' },
  { id: 'skin', label: '피부', description: '피부결, 톤, 홍조, 윤광' },
  { id: 'lifting', label: '리프팅', description: '처짐, 앞볼, 팔자' },
];

const EYES: readonly number[] = [LM.eyeOuterLeft, LM.eyeInnerLeft, LM.eyeInnerRight, LM.eyeOuterRight];
const FACE: readonly number[] = [168, 1, 152];
const NOSE: readonly number[] = [6, 1];
const MOUTH: readonly number[] = [13, 14];
const CHIN: readonly number[] = [14, 152];
const UPPER_FACE: readonly number[] = [9, 1];

const focus = (yaw: number, zoom: number, target: readonly number[], pitch = 0): CameraFocus => ({
  yaw,
  pitch,
  zoom,
  target,
});

/** Double-eyelid crease height above the lashes, in mm, at slider values -1 / 0 / +1. */
export const CREASE_MM = { min: 5, mid: 7, max: 9 } as const;

export function creaseHeightMm(value: number): number {
  const step = value < 0 ? CREASE_MM.mid - CREASE_MM.min : CREASE_MM.max - CREASE_MM.mid;
  return CREASE_MM.mid + value * step;
}

/** Crease line type: in-line (-1, tucked into the inner corner), in-out (0), out-line (+1, parallel). */
export function creaseLine(value: number): string {
  return value <= -1 / 3 ? '인라인' : value >= 1 / 3 ? '아웃라인' : '인아웃';
}

// How far each eye-opening procedure moves at full strength, in mm.
const LID_RAISE_MM = 2;
const INNER_CORNER_MM = 2.5;
const OUTER_CORNER_MM = 3;
const LOWER_LID_MM = 2;
const mmReadout = (fullMm: number) => (v: number) => `${(v * fullMm).toFixed(1)}mm`;

export const CONTROLS: readonly Control[] = [
  // ---------------------------------------------------------------- eyes
  // Double eyelid: drawn by the face shader along the upper lid (see creaseHeightMm, creaseLine).
  {
    kind: 'lid',
    id: 'creaseDepth',
    category: 'eyes',
    group: '쌍꺼풀',
    label: '쌍꺼풀',
    short: '쌍꺼풀',
    hint: '속눈썹 위에 쌍꺼풀 라인을 만들어요',
    min: 0,
    max: 1,
    minLabel: '없음',
    maxLabel: '선명',
    focus: focus(0, 1.45, EYES),
  },
  {
    kind: 'lid',
    id: 'creaseHeight',
    category: 'eyes',
    group: '쌍꺼풀',
    label: '쌍꺼풀 높이',
    short: '높이',
    hint: '속눈썹에서 쌍꺼풀 라인까지의 높이',
    min: -1,
    max: 1,
    minLabel: `${CREASE_MM.min}mm`,
    maxLabel: `${CREASE_MM.max}mm`,
    focus: focus(0, 1.45, EYES),
    readout: (v) => `${creaseHeightMm(v).toFixed(1)}mm`,
  },
  {
    kind: 'lid',
    id: 'creaseShape',
    category: 'eyes',
    group: '쌍꺼풀',
    label: '쌍꺼풀 라인',
    short: '라인',
    hint: '인라인 · 인아웃라인 · 아웃라인',
    min: -1,
    max: 1,
    minLabel: '인라인',
    maxLabel: '아웃라인',
    focus: focus(0, 1.45, EYES),
    readout: creaseLine,
  },
  // The eye opening: lid margins and corners move, the eyeball behind them stays.
  {
    kind: 'shape',
    id: 'lidRaise',
    category: 'eyes',
    group: '트임 · 눈매교정',
    label: '눈매교정',
    short: '눈매교정',
    hint: '처진 윗눈꺼풀을 올려 눈동자가 더 보이게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: `+${LID_RAISE_MM}mm`,
    focus: focus(0, 1.45, EYES),
    readout: (v) => `+${(v * LID_RAISE_MM).toFixed(1)}mm`,
    field: lidMargin({
      moving: REGION.upperLidLeft,
      opposite: REGION.lowerLidLeft,
      peak: 0.45,
      spread: 0.52,
      reach: 9,
      move: [0, LID_RAISE_MM, 0.2],
    }),
  },
  {
    kind: 'shape',
    id: 'innerCorner',
    category: 'eyes',
    group: '트임 · 눈매교정',
    label: '앞트임',
    short: '앞트임',
    hint: '눈 앞머리를 코 쪽으로 열어 눈물언덕이 보이게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: `${INNER_CORNER_MM}mm`,
    focus: focus(0, 1.55, EYES),
    readout: mmReadout(INNER_CORNER_MM),
    field: canthus({ at: LM.eyeInnerLeft, radius: [6.5, 5.5, 9], move: [INNER_CORNER_MM, -0.3, 0] }),
  },
  {
    kind: 'shape',
    id: 'outerCorner',
    category: 'eyes',
    group: '트임 · 눈매교정',
    label: '뒷트임',
    short: '뒷트임',
    hint: '눈꼬리를 바깥으로 늘려 가로로 길게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: `${OUTER_CORNER_MM}mm`,
    focus: focus(16, 1.45, EYES),
    readout: mmReadout(OUTER_CORNER_MM),
    field: canthus({ at: LM.eyeOuterLeft, radius: [7, 5.5, 10], move: [-OUTER_CORNER_MM, -0.6, -0.8] }),
  },
  {
    kind: 'shape',
    id: 'lowerLid',
    category: 'eyes',
    group: '트임 · 눈매교정',
    label: '밑트임',
    short: '밑트임',
    hint: '아래 눈꺼풀 바깥쪽을 내려 눈이 세로로 커 보이게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: `${LOWER_LID_MM}mm`,
    focus: focus(8, 1.45, EYES),
    readout: mmReadout(LOWER_LID_MM),
    field: lidMargin({
      moving: REGION.lowerLidLeft,
      opposite: REGION.upperLidLeft,
      peak: 0.72,
      spread: 0.55,
      reach: 8,
      move: [0, -LOWER_LID_MM, 0],
    }),
  },
  // The skin around the eyes.
  {
    kind: 'shape',
    id: 'aegyoSal',
    category: 'eyes',
    group: '눈가 볼륨',
    label: '애교살',
    short: '애교살',
    hint: '아래 속눈썹 밑에 도톰한 애교살을 만들어요',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '도톰',
    focus: focus(24, 1.45, EYES),
    // A roll about 1-6 mm under the lower lashes, fullest under the pupil.
    field: lidBand({ lid: REGION.lowerLidLeft, offset: -3.2, halfHeight: 2.7, peak: 0.52, spread: 0.62, move: [0, 0.3, 1.8] }),
  },
  {
    kind: 'shape',
    id: 'underEye',
    category: 'eyes',
    group: '눈가 볼륨',
    label: '눈밑 꺼짐',
    short: '눈밑',
    hint: '꺼진 눈 밑을 채워 그늘 없이 매끈하게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '매끈',
    focus: focus(30, 1.5, EYES),
    // The hollow 3-13 mm under the lid, deepest towards the nose (tear trough).
    field: lidBand({ lid: REGION.lowerLidLeft, offset: -8, halfHeight: 5, peak: 0.42, spread: 0.85, move: [0, 0.2, 1.6] }),
  },
  {
    kind: 'shape',
    id: 'upperLid',
    category: 'eyes',
    group: '눈가 볼륨',
    label: '눈두덩 볼륨',
    short: '눈두덩',
    hint: '꺼진 눈두덩은 채우고, 부은 눈두덩은 얇게',
    min: -1,
    max: 1,
    minLabel: '얇게',
    maxLabel: '볼륨',
    focus: focus(45, 1.5, EYES),
    // The hollow between the upper lid and the brow bone, 2-12 mm above the lashes.
    field: lidBand({ lid: REGION.upperLidLeft, offset: 6.5, halfHeight: 5, peak: 0.45, spread: 0.8, move: [0, -0.35, 2] }),
  },
  {
    kind: 'shape',
    id: 'browLift',
    category: 'eyes',
    group: '눈가 볼륨',
    label: '눈썹 거상',
    short: '눈썹거상',
    hint: '눈썹 밑 처진 눈꺼풀 피부를 끌어올려요',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '올림',
    focus: focus(0, 1.5, EYES),
    // Lifts the skin that hoods the outer half of the lid; the lashes and the brow stay put.
    field: bump({ at: REGION.lidHoodLeft, offset: [0, 0.02, 0], radius: [0.13, 0.075, 0.2], move: [-0.004, 0.028, 0], mirror: true }),
  },
  // ---------------------------------------------------------------- nose
  {
    kind: 'shape',
    id: 'noseBridge',
    category: 'nose',
    label: '콧대 높이',
    short: '콧대',
    hint: '콧대 라인을 높이거나 낮춰요',
    min: -1,
    max: 1,
    minLabel: '낮게',
    maxLabel: '높게',
    focus: focus(55, 1.35, NOSE),
    field: bump({ at: REGION.noseBridge, offset: [0, 0.02, 0], radius: [0.11, 0.27, 0.3], move: [0, 0, 0.05] }),
  },
  {
    kind: 'shape',
    id: 'noseTip',
    category: 'nose',
    label: '코끝 높이',
    short: '코끝',
    hint: '코끝이 앞으로 나온 정도',
    min: -1,
    max: 1,
    minLabel: '낮게',
    maxLabel: '높게',
    focus: focus(75, 1.35, NOSE),
    field: bump({ at: REGION.noseTip, radius: [0.13, 0.15, 0.3], move: [0, 0, 0.045] }),
  },
  {
    kind: 'shape',
    id: 'noseTipRotation',
    category: 'nose',
    label: '코끝 각도',
    short: '코끝각도',
    hint: '코끝을 들어 올리거나 내려요',
    min: -1,
    max: 1,
    minLabel: '처진',
    maxLabel: '들린',
    focus: focus(85, 1.35, NOSE),
    field: bump({ at: REGION.noseTipAndColumella, radius: [0.12, 0.13, 0.3], move: [0, 0.03, 0.006] }),
  },
  {
    kind: 'shape',
    id: 'alarWidth',
    category: 'nose',
    label: '콧볼 너비',
    short: '콧볼',
    hint: '콧볼을 좁히거나 넓혀요',
    min: -1,
    max: 1,
    minLabel: '좁게',
    maxLabel: '넓게',
    focus: focus(0, 1.45, NOSE),
    field: bump({ at: REGION.alaLeft, radius: [0.075, 0.085, 0.2], move: [-0.028, 0, 0], mirror: true }),
  },
  // ---------------------------------------------------------------- jaw
  {
    kind: 'shape',
    id: 'jawline',
    category: 'contour',
    label: '턱선 (V라인)',
    short: '턱선',
    hint: '사각턱을 갸름한 V라인으로',
    min: -1,
    max: 1,
    minLabel: '각진',
    maxLabel: '갸름',
    focus: focus(0, 1, FACE),
    field: combine(
      bump({ at: REGION.jawAngleLeft, radius: [0.32, 0.36, 0.6], move: [0.055, 0.012, 0], mirror: true }),
      bump({ at: REGION.jawBodyLeft, radius: [0.22, 0.24, 0.5], move: [0.03, 0.005, 0], mirror: true }),
    ),
  },
  {
    kind: 'shape',
    id: 'chinLength',
    category: 'contour',
    label: '턱 길이',
    short: '턱 길이',
    hint: '턱 끝을 길게 또는 짧게',
    min: -1,
    max: 1,
    minLabel: '짧게',
    maxLabel: '길게',
    focus: focus(25, 1.2, CHIN),
    field: bump({ at: REGION.chin, radius: [0.32, 0.34, 0.45], move: [0, -0.045, 0.008] }),
  },
  {
    kind: 'shape',
    id: 'chinProjection',
    category: 'contour',
    label: '턱끝 돌출',
    short: '턱끝',
    hint: '옆에서 본 턱끝 라인',
    min: -1,
    max: 1,
    minLabel: '무턱',
    maxLabel: '또렷',
    focus: focus(85, 1.2, CHIN),
    field: bump({ at: REGION.chinFront, radius: [0.3, 0.3, 0.45], move: [0, -0.008, 0.05] }),
  },
  // ---------------------------------------------------------------- contour
  {
    kind: 'shape',
    id: 'cheekbone',
    category: 'contour',
    label: '광대',
    short: '광대',
    hint: '옆광대를 줄이거나 채워요',
    min: -1,
    max: 1,
    minLabel: '축소',
    maxLabel: '볼륨',
    focus: focus(0, 1, FACE),
    field: bump({ at: REGION.cheekboneLeft, radius: [0.24, 0.24, 0.45], move: [-0.04, 0, 0.004], mirror: true }),
  },
  {
    kind: 'shape',
    id: 'forehead',
    category: 'contour',
    label: '이마 볼륨',
    short: '이마',
    hint: '동그랗고 볼륨 있는 이마',
    min: -1,
    max: 1,
    minLabel: '납작',
    maxLabel: '동그란',
    focus: focus(70, 1.1, UPPER_FACE),
    field: bump({ at: REGION.forehead, offset: [0, 0.05, 0], radius: [0.62, 0.42, 0.5], move: [0, 0.004, 0.045] }),
  },
  {
    kind: 'shape',
    id: 'temple',
    category: 'contour',
    label: '관자 볼륨',
    short: '관자',
    hint: '꺼진 관자놀이를 채워요',
    min: -1,
    max: 1,
    minLabel: '꺼진',
    maxLabel: '채운',
    focus: focus(40, 1.05, UPPER_FACE),
    field: bump({ at: REGION.templeLeft, radius: [0.22, 0.26, 0.5], move: [-0.028, 0, 0.01], mirror: true }),
  },
  // ---------------------------------------------------------------- lips
  {
    kind: 'shape',
    id: 'lipVolume',
    category: 'lips',
    label: '입술 볼륨',
    short: '볼륨',
    hint: '위아래 입술을 도톰하게',
    min: -1,
    max: 1,
    minLabel: '얇게',
    maxLabel: '도톰',
    focus: focus(30, 1.6, MOUTH),
    field: lips({ grow: 0.018, pout: 0.03, upper: true, lower: true }),
  },
  {
    kind: 'shape',
    id: 'upperLip',
    category: 'lips',
    label: '윗입술',
    short: '윗입술',
    hint: '윗입술만 볼륨감 있게',
    min: -1,
    max: 1,
    minLabel: '얇게',
    maxLabel: '도톰',
    focus: focus(55, 1.6, MOUTH),
    field: lips({ grow: 0.016, pout: 0.022, upper: true, lower: false }),
  },
  {
    kind: 'shape',
    id: 'lipCorners',
    category: 'lips',
    label: '입꼬리',
    short: '입꼬리',
    hint: '입꼬리를 살짝 올려요',
    min: -1,
    max: 1,
    minLabel: '내림',
    maxLabel: '올림',
    focus: focus(0, 1.6, MOUTH),
    field: bump({ at: REGION.mouthCornerLeft, radius: [0.09, 0.085, 0.25], move: [-0.004, 0.024, 0.004], mirror: true }),
  },
  {
    kind: 'shape',
    id: 'lipWidth',
    category: 'lips',
    label: '입술 너비',
    short: '너비',
    hint: '입 가로 길이',
    min: -1,
    max: 1,
    minLabel: '좁게',
    maxLabel: '넓게',
    focus: focus(0, 1.6, MOUTH),
    field: bump({ at: REGION.mouthCornerLeft, radius: [0.11, 0.1, 0.25], move: [-0.026, 0, -0.004], mirror: true }),
  },
  // ---------------------------------------------------------------- lifting
  {
    kind: 'shape',
    id: 'lift',
    category: 'lifting',
    label: '리프팅',
    short: '리프팅',
    hint: '처진 볼과 턱선을 끌어올려요',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '탄력',
    focus: focus(30, 1, FACE),
    field: combine(
      bump({ at: REGION.jowlLeft, radius: [0.36, 0.36, 0.6], move: [0.012, 0.04, -0.006], mirror: true }),
      bump({ at: REGION.midCheekLeft, radius: [0.26, 0.24, 0.5], move: [0.004, 0.022, 0.004], mirror: true }),
    ),
  },
  {
    kind: 'shape',
    id: 'cheekVolume',
    category: 'lifting',
    label: '앞볼 볼륨',
    short: '앞볼',
    hint: '앞볼을 볼륨감 있게 채워요',
    min: -1,
    max: 1,
    minLabel: '꺼진',
    maxLabel: '볼륨',
    focus: focus(45, 1.1, FACE),
    field: bump({ at: REGION.cheekAppleLeft, radius: [0.19, 0.17, 0.4], move: [-0.004, 0.004, 0.035], mirror: true }),
  },
  {
    kind: 'shape',
    id: 'nasolabial',
    category: 'lifting',
    label: '팔자 라인',
    short: '팔자',
    hint: '팔자 주름 부위를 채워 매끈하게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '매끈',
    focus: focus(30, 1.3, [1, 13]),
    field: bump({ at: REGION.nasolabialLeft, radius: [0.11, 0.16, 0.3], move: [0, 0.004, 0.022], mirror: true }),
  },
  // ---------------------------------------------------------------- skin
  {
    kind: 'skin',
    id: 'skinSmooth',
    category: 'skin',
    label: '피부결',
    short: '피부결',
    hint: '잡티와 요철을 매끈하게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '매끈',
    focus: focus(0, 1.15, FACE),
  },
  {
    kind: 'skin',
    id: 'skinTone',
    category: 'skin',
    label: '톤업',
    short: '톤업',
    hint: '피부 톤을 화사하게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '화사',
    focus: focus(0, 1.15, FACE),
  },
  {
    kind: 'skin',
    id: 'skinRedness',
    category: 'skin',
    label: '홍조 완화',
    short: '홍조',
    hint: '붉은기를 차분하게',
    min: 0,
    max: 1,
    minLabel: '원래대로',
    maxLabel: '차분',
    focus: focus(0, 1.15, FACE),
  },
  {
    kind: 'skin',
    id: 'skinGlow',
    category: 'skin',
    label: '윤광',
    short: '윤광',
    hint: '물광처럼 촉촉한 광채',
    min: 0,
    max: 1,
    minLabel: '매트',
    maxLabel: '물광',
    focus: focus(20, 1.1, FACE),
  },
];

export const CONTROL_BY_ID: Readonly<Record<ControlId, Control>> = Object.fromEntries(
  CONTROLS.map((c) => [c.id, c]),
) as Record<ControlId, Control>;

export const SHAPE_CONTROLS: readonly ShapeControl[] = CONTROLS.filter((c): c is ShapeControl => c.kind === 'shape');

export const SKIN_CONTROLS: readonly SkinControl[] = CONTROLS.filter((c): c is SkinControl => c.kind === 'skin');

export const LID_CONTROLS: readonly LidControl[] = CONTROLS.filter((c): c is LidControl => c.kind === 'lid');

export function isShapeControlId(id: string): id is ShapeControlId {
  return CONTROL_BY_ID[id as ControlId]?.kind === 'shape';
}

export function controlsInCategory(category: CategoryId): Control[] {
  return CONTROLS.filter((c) => c.category === category);
}

export function isControlId(id: string): id is ControlId {
  return id in CONTROL_BY_ID;
}
