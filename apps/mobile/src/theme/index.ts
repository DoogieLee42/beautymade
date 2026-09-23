import type { TextStyle } from 'react-native';

export const colors = {
  bg: '#FAF7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F4EFEC',
  ink: '#1E181A',
  inkSoft: '#5B5053',
  muted: '#8F8487',
  line: '#EBE4E1',
  primary: '#D8436B',
  primaryPressed: '#BD3459',
  primarySoft: '#FCE9EF',
  primaryInk: '#A12A4B',
  success: '#2E9C6A',
  successSoft: '#E4F5EC',
  warning: '#C9801B',
  warningSoft: '#FDF1DF',
  danger: '#D14343',
  dangerSoft: '#FBE7E7',
  stage: '#141012',
  stageRaised: '#221B1F',
  stageLine: 'rgba(255,255,255,0.12)',
  stageText: '#F7F0F2',
  stageMuted: 'rgba(247,240,242,0.62)',
  accent: '#FF7AA0',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: colors.ink },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4, color: colors.ink },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', color: colors.inkSoft },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '500', color: colors.muted },
} satisfies Record<string, TextStyle>;

/** RN's New Architecture and react-native-web both support CSS box shadows. */
export const shadow = { boxShadow: '0px 6px 24px rgba(42, 26, 32, 0.08)' } as const;
export const shadowStrong = { boxShadow: '0px 10px 32px rgba(42, 26, 32, 0.16)' } as const;
