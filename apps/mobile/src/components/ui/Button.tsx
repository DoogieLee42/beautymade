import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'dark' | 'light' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'lg' | 'md' | 'sm';
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconRight?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: '#fff' },
  secondary: { bg: colors.surface, pressed: colors.surfaceAlt, fg: colors.ink, border: colors.line },
  ghost: { bg: 'transparent', pressed: 'rgba(0,0,0,0.05)', fg: colors.inkSoft },
  /** Ghost button for dark (stage) backgrounds. */
  subtle: { bg: 'transparent', pressed: 'rgba(255,255,255,0.06)', fg: 'rgba(247,240,242,0.78)' },
  dark: { bg: colors.ink, pressed: '#000', fg: '#fff' },
  light: { bg: 'rgba(255,255,255,0.14)', pressed: 'rgba(255,255,255,0.22)', fg: colors.stageText, border: 'rgba(255,255,255,0.18)' },
  danger: { bg: colors.dangerSoft, pressed: '#F6D5D5', fg: colors.danger },
};

const heights = { lg: 56, md: 48, sm: 38 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  testID,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  const fontSize = size === 'sm' ? 14 : 16;
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
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={fontSize + 3} color={p.fg} />}
          <Text style={[styles.label, { color: p.fg, fontSize }]} numberOfLines={1}>
            {title}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={fontSize + 2} color={p.fg} />}
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone = 'light',
  size = 40,
  active,
  style,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  label: string;
  tone?: 'light' | 'dark' | 'plain';
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = active ? '#fff' : tone === 'dark' ? 'rgba(20,16,18,0.55)' : tone === 'plain' ? 'transparent' : colors.surface;
  const fg = active ? colors.ink : tone === 'dark' ? '#fff' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          opacity: pressed ? 0.75 : 1,
          borderWidth: tone === 'dark' && !active ? StyleSheet.hairlineWidth : 0,
          borderColor: 'rgba(255,255,255,0.2)',
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '700', letterSpacing: -0.2 },
});
