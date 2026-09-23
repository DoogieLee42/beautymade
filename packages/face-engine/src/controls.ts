import { bump, combine, lips, type FieldFn } from './fields';
import { REGION } from './topology/landmarks';

export type CategoryId = 'nose' | 'contour' | 'lips' | 'skin' | 'lifting';

export type ShapeControlId =
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

export type ControlId = ShapeControlId | SkinControlId;

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

export type Control = ShapeControl | SkinControl;

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'nose', label: '코', description: '콧대, 코끝, 콧볼' },
  { id: 'contour', label: '턱/윤곽', description: '턱선, 턱끝, 광대, 이마' },
  { id: 'lips', label: '입술', description: '볼륨, 입꼬리, 너비' },
  { id: 'skin', label: '피부', description: '피부결, 톤, 홍조, 윤광' },
  { id: 'lifting', label: '리프팅', description: '처짐, 앞볼, 팔자' },
];

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

export const CONTROLS: readonly Control[] = [
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

export function controlsInCategory(category: CategoryId): Control[] {
  return CONTROLS.filter((c) => c.category === category);
}

export function isControlId(id: string): id is ControlId {
  return id in CONTROL_BY_ID;
}
