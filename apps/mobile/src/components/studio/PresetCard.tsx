import Ionicons from '@expo/vector-icons/Ionicons';
import type { CategoryId, Preset } from '@beautymade/face-engine';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';

export const CATEGORY_ICON: Record<CategoryId, ComponentProps<typeof Ionicons>['name']> = {
  nose: 'triangle-outline',
  jaw: 'chevron-down-circle-outline',
  contour: 'ellipse-outline',
  lips: 'heart-outline',
  lifting: 'trending-up-outline',
  skin: 'water-outline',
};

const TINT: Record<CategoryId, string> = {
  nose: '#FCE9EF',
  jaw: '#EEE9FC',
  contour: '#E9F2FC',
  lips: '#FDE8E4',
  lifting: '#E8F6EF',
  skin: '#FDF3E1',
};

export function PresetCard({
  preset,
  active,
  onPress,
  compact,
  style,
}: {
  preset: Preset;
  active?: boolean;
  onPress?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, active && styles.active, compact && styles.compact, pressed && { opacity: 0.85 }, style]}
    >
      <View style={[styles.icon, { backgroundColor: TINT[preset.category] }]}>
        <Ionicons name={CATEGORY_ICON[preset.category]} size={18} color={colors.ink} />
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {preset.name}
        </Text>
        <Text style={styles.tagline} numberOfLines={2}>
          {preset.tagline}
        </Text>
      </View>
      {active && (
        <View style={styles.check}>
          <Ionicons name="checkmark" size={12} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    gap: 10,
  },
  compact: { width: 156 },
  active: { borderColor: colors.primary, backgroundColor: '#FFF8FA' },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  text: { gap: 3 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  tagline: { fontSize: 12, lineHeight: 17, color: colors.muted },
  check: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
