import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * primary: black pill (light screens)   white: white pill (dark screens)
 * outline: white with hairline border   soft: light grey (secondary actions)
 * ghost / subtle: text-only on light / dark backgrounds
 */
type Variant = 'primary' | 'white' | 'outline' | 'soft' | 'ghost' | 'subtle' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'lg' | 'md' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: '#2B2B2E', fg: colors.onPrimary },
  white: { bg: '#FFFFFF', pressed: '#ECECEE', fg: colors.ink },
  outline: { bg: '#FFFFFF', pressed: colors.surfaceAlt, fg: colors.ink, border: '#DCDCE0' },
  soft: { bg: colors.surfaceAlt, pressed: '#E7E7E9', fg: colors.ink },
  ghost: { bg: 'transparent', pressed: 'rgba(0,0,0,0.04)', fg: colors.inkSoft },
  subtle: { bg: 'transparent', pressed: 'rgba(255,255,255,0.06)', fg: colors.stageMuted },
  danger: { bg: colors.dangerSoft, pressed: '#F7DADA', fg: colors.danger },
};

const heights = { lg: 56, md: 48, sm: 38 };

export function Button({ title, onPress, variant = 'primary', size = 'lg', icon, iconRight, loading, disabled, style, testID }: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  const fontSize = size === 'sm' ? 14 : size === 'md' ? 15 : 16;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === 'sm' ? 14 : 20,
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1 : 0,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={fontSize + 2} color={p.fg} />}
          <Text style={[styles.label, { color: p.fg, fontSize }]} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={fontSize + 1} color={p.fg} />}
        </View>
      )}
    </Pressable>
  );
}

/** Underlined text action ("로그인", "예시 보기", "다시 스캔하기"). */
export function TextLink({
  title,
  onPress,
  tone = 'light',
  style,
}: {
  title: string;
  onPress?: () => void;
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link" style={[styles.link, style]}>
      <Text style={[styles.linkText, { color: tone === 'dark' ? colors.stageText : colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * Round icon button. `dark` floats over the 3D stage (translucent), `light` sits on
 * white surfaces, `plain` has no background.
 */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'light',
  size = 40,
  active,
  disabled,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  tone?: 'light' | 'dark' | 'plain' | 'plainDark';
  size?: number;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = tone === 'dark' || tone === 'plainDark';
  const bg = active
    ? '#FFFFFF'
    : tone === 'dark'
      ? 'rgba(18,18,18,0.52)'
      : tone === 'light'
        ? colors.surface
        : 'transparent';
  const fg = active ? colors.ink : dark ? '#FFFFFF' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
          borderWidth: tone === 'dark' && !active ? StyleSheet.hairlineWidth : 0,
          borderColor: 'rgba(255,255,255,0.28)',
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.52)} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '700', letterSpacing: -0.2 },
  link: { alignSelf: 'center', paddingVertical: 6 },
  linkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
