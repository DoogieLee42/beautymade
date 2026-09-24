import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../../theme';

/** Top bar: back chevron (or custom left), centred title, optional right slot. */
export function Header({
  title,
  tone = 'light',
  onBack,
  back = true,
  left,
  right,
  style,
}: {
  title?: string;
  tone?: 'light' | 'dark';
  onBack?: () => void;
  back?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = tone === 'dark' ? colors.stageText : colors.ink;
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={[styles.bar, style]}>
      <View style={styles.side}>
        {left ??
          (back && (
            <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="뒤로">
              <Ionicons name="chevron-back" size={26} color={fg} />
            </Pressable>
          ))}
      </View>
      <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side: { width: 64, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
});
