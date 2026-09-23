import type { CategoryId, ControlId } from './controls';

export type ControlValues = Partial<Record<ControlId, number>>;

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  /** Category the preset is mostly about; drives its icon/colour in the UI. */
  category: CategoryId;
  values: ControlValues;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'natural-nose',
    name: '자연스러운 콧대',
    tagline: '티 안 나게, 오똑하게',
    category: 'nose',
    values: { noseBridge: 0.5, noseTip: 0.35, alarWidth: -0.25 },
  },
  {
    id: 'defined-nose',
    name: '또렷한 코',
    tagline: '높은 콧대와 날렵한 코끝',
    category: 'nose',
    values: { noseBridge: 0.85, noseTip: 0.6, noseTipRotation: 0.2, alarWidth: -0.45 },
  },
  {
    id: 'v-line',
    name: 'V라인 윤곽',
    tagline: '갸름한 턱선과 작은 얼굴',
    category: 'jaw',
    values: { jawline: 0.75, cheekbone: -0.35, chinLength: 0.15, chinProjection: 0.3 },
  },
  {
    id: 'full-lips',
    name: '도톰한 입술',
    tagline: '볼륨 있는 입술과 올라간 입꼬리',
    category: 'lips',
    values: { lipVolume: 0.6, upperLip: 0.25, lipCorners: 0.4 },
  },
  {
    id: 'lifting',
    name: '탄력 리프팅',
    tagline: '처진 라인을 위로',
    category: 'lifting',
    values: { lift: 0.75, cheekVolume: 0.3, nasolabial: 0.55, jawline: 0.2 },
  },
  {
    id: 'soft-contour',
    name: '부드러운 인상',
    tagline: '이마, 관자, 앞볼을 채운 동안 라인',
    category: 'contour',
    values: { forehead: 0.45, temple: 0.5, cheekVolume: 0.35, cheekbone: -0.25 },
  },
  {
    id: 'glass-skin',
    name: '물광 피부',
    tagline: '맑고 촉촉한 피부',
    category: 'skin',
    values: { skinSmooth: 0.55, skinTone: 0.35, skinRedness: 0.5, skinGlow: 0.75 },
  },
  {
    id: 'total-refine',
    name: '토탈 리파인',
    tagline: '전체를 조금씩, 가장 자연스럽게',
    category: 'contour',
    values: {
      noseBridge: 0.35,
      noseTip: 0.2,
      jawline: 0.35,
      chinProjection: 0.15,
      lipVolume: 0.25,
      lipCorners: 0.25,
      lift: 0.35,
      skinSmooth: 0.35,
      skinTone: 0.2,
    },
  },
];

export const PRESET_BY_ID: Readonly<Record<string, Preset>> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
