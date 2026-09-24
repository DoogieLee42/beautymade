import type { CategoryId, ControlId } from './controls';

export type ControlValues = Partial<Record<ControlId, number>>;

export interface Preset {
  id: string;
  name: string;
  tagline: string;
  category: CategoryId;
  values: ControlValues;
}

/** Three styles per category, from subtle to bold (shown as thumbnails in the studio). */
export const PRESETS: readonly Preset[] = [
  // eyes
  {
    id: 'eyes-natural',
    name: '자연형',
    tagline: '인아웃 6mm 자연스러운 쌍꺼풀',
    category: 'eyes',
    values: { creaseDepth: 0.55, creaseHeight: -0.5, aegyoSal: 0.3 },
  },
  {
    id: 'eyes-bright',
    name: '또렷형',
    tagline: '쌍꺼풀에 눈매교정과 앞트임',
    category: 'eyes',
    values: { creaseDepth: 0.8, lidRaise: 0.6, innerCorner: 0.5 },
  },
  {
    id: 'eyes-wide',
    name: '시원형',
    tagline: '아웃라인 쌍꺼풀과 앞·뒤·밑트임',
    category: 'eyes',
    values: { creaseDepth: 0.9, creaseHeight: 0.5, creaseShape: 0.8, lidRaise: 0.4, innerCorner: 0.6, outerCorner: 0.7, lowerLid: 0.6 },
  },
  // nose
  {
    id: 'nose-natural',
    name: '자연형',
    tagline: '티 안 나게 오똑한 콧대',
    category: 'nose',
    values: { noseBridge: 0.35, noseTip: 0.25, alarWidth: -0.2 },
  },
  {
    id: 'nose-defined',
    name: '또렷형',
    tagline: '높은 콧대와 날렵한 코끝',
    category: 'nose',
    values: { noseBridge: 0.65, noseTip: 0.5, noseTipRotation: 0.15, alarWidth: -0.35 },
  },
  {
    id: 'nose-dramatic',
    name: '드라마틱형',
    tagline: '확실하게 달라지는 입체감',
    category: 'nose',
    values: { noseBridge: 1, noseTip: 0.8, noseTipRotation: 0.3, alarWidth: -0.6 },
  },
  // contour
  {
    id: 'contour-vline',
    name: '갸름형',
    tagline: '작고 갸름한 V라인',
    category: 'contour',
    values: { jawline: 0.7, cheekbone: -0.3, chinLength: 0.15, chinProjection: 0.25 },
  },
  {
    id: 'contour-oval',
    name: '계란형',
    tagline: '부드럽게 채운 동안 윤곽',
    category: 'contour',
    values: { jawline: 0.35, cheekbone: -0.35, forehead: 0.35, temple: 0.4 },
  },
  {
    id: 'contour-defined',
    name: '또렷형',
    tagline: '옆에서 봐도 선명한 턱선',
    category: 'contour',
    values: { chinProjection: 0.55, jawline: 0.3, chinLength: 0.1 },
  },
  // lips
  {
    id: 'lips-natural',
    name: '자연형',
    tagline: '살짝 채운 입술 볼륨',
    category: 'lips',
    values: { lipVolume: 0.35 },
  },
  {
    id: 'lips-full',
    name: '도톰형',
    tagline: '볼륨감 있는 입술',
    category: 'lips',
    values: { lipVolume: 0.65, upperLip: 0.25 },
  },
  {
    id: 'lips-smile',
    name: '스마일형',
    tagline: '올라간 입꼬리',
    category: 'lips',
    values: { lipCorners: 0.55, lipVolume: 0.2 },
  },
  // skin
  {
    id: 'skin-clear',
    name: '맑은 피부',
    tagline: '잡티와 홍조를 정돈',
    category: 'skin',
    values: { skinSmooth: 0.45, skinRedness: 0.55 },
  },
  {
    id: 'skin-glass',
    name: '물광 피부',
    tagline: '촉촉한 광채',
    category: 'skin',
    values: { skinSmooth: 0.5, skinGlow: 0.8, skinTone: 0.2 },
  },
  {
    id: 'skin-bright',
    name: '톤업 피부',
    tagline: '화사하게 밝힌 톤',
    category: 'skin',
    values: { skinTone: 0.6, skinSmooth: 0.3, skinRedness: 0.3 },
  },
  // lifting
  {
    id: 'lifting-natural',
    name: '자연형',
    tagline: '가볍게 끌어올린 라인',
    category: 'lifting',
    values: { lift: 0.4, nasolabial: 0.3 },
  },
  {
    id: 'lifting-firm',
    name: '탄력형',
    tagline: '처진 볼과 턱선을 위로',
    category: 'lifting',
    values: { lift: 0.8, nasolabial: 0.6, jawline: 0.15 },
  },
  {
    id: 'lifting-youthful',
    name: '동안형',
    tagline: '앞볼과 관자를 채운 볼륨',
    category: 'lifting',
    values: { cheekVolume: 0.5, temple: 0.3, forehead: 0.25, lift: 0.3 },
  },
];

export const PRESET_BY_ID: Readonly<Record<string, Preset>> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

export function presetsInCategory(category: CategoryId): Preset[] {
  return PRESETS.filter((p) => p.category === category);
}
