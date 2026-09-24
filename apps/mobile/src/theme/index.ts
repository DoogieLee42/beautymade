import type { TextStyle } from 'react-native';

/** Monochrome, editorial palette: black/white UI, dark stages for the 3D face. */
export const colors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F3F4',
  surfaceMuted: '#F6F6F7',
  ink: '#111111',
  inkSoft: '#46464B',
  muted: '#8B8B91',
  faint: '#B9B9BF',
  line: '#EAEAEC',
  primary: '#111111',
  onPrimary: '#FFFFFF',
  danger: '#D23B3B',
  dangerSoft: '#FCECEC',
  success: '#1E9E5A',
  warning: '#A86B12',
  warningSoft: '#FFF4E3',
  stage: '#141414',
  stageRaised: '#242424',
  stageLine: 'rgba(255,255,255,0.14)',
  stageText: '#FFFFFF',
  stageMuted: 'rgba(255,255,255,0.66)',
  scrim: 'rgba(12,12,12,0.55)',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: colors.ink },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', color: colors.inkSoft },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: colors.muted },
} satisfies Record<string, TextStyle>;

/** RN's New Architecture and react-native-web both support CSS box shadows. */
export const shadow = { boxShadow: '0px 4px 18px rgba(0, 0, 0, 0.06)' } as const;
export const shadowStrong = { boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.18)' } as const;
