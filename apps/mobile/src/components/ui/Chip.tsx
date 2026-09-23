import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';

export function Chip({
  label,
  selected,
  onPress,
  tone = 'light',
  dot,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'light' | 'dark';
  /** Small indicator that something in this group was changed. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = tone === 'dark';
  const bg = selected ? (dark ? colors.stageText : colors.ink) : dark ? 'rgba(255,255,255,0.1)' : colors.surface;
  const fg = selected ? (dark ? colors.ink : '#fff') : dark ? colors.stageText : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: bg, borderColor: selected ? bg : dark ? colors.stageLine : colors.line, opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
      {dot && <Text style={[styles.dot, { color: selected ? fg : colors.primary }]}>•</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  dot: { fontSize: 18, lineHeight: 18, marginTop: -2 },
});
