import Ionicons from '@expo/vector-icons/Ionicons';
import { categoryLabel, lookCategories } from '@beautymade/face-engine';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Look } from '../../api/types';
import { formatDate } from '../../lib/format';
import { colors, radius } from '../../theme';

/** One saved look in the list: thumbnail, name, changed categories, date, compare and menu. */
export function LookRow({
  look,
  onOpen,
  onCompare,
  onMenu,
}: {
  look: Look;
  onOpen(): void;
  onCompare(): void;
  onMenu(): void;
}) {
  const categories = lookCategories(look.values);
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.main, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
        accessibilityLabel={`${look.name} 스튜디오에서 열기`}
        testID={`look-${look.id}`}
      >
        <View style={styles.thumb}>
          {look.thumbnailUrl ? (
            <Image source={{ uri: look.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
          ) : (
            <Ionicons name="person-outline" size={28} color={colors.faint} />
          )}
        </View>
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={1}>
            {look.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {categories.length ? categories.map(categoryLabel).join(' / ') : '원본'}
          </Text>
          <Text style={styles.meta}>{formatDate(look.createdAt)}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onCompare}
        style={({ pressed }) => [styles.compare, pressed && { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="button"
        accessibilityLabel={`${look.name} 비교하기`}
        testID={`compare-${look.id}`}
      >
        <Text style={styles.compareText}>비교</Text>
      </Pressable>
      <Pressable onPress={onMenu} hitSlop={10} style={styles.menu} accessibilityLabel={`${look.name} 더보기`} testID={`menu-${look.id}`}>
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  thumb: {
    width: 90,
    height: 94,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 5 },
  name: { fontSize: 17, fontWeight: '700', color: colors.ink, letterSpacing: -0.3, marginBottom: 2 },
  meta: { fontSize: 14, color: colors.muted },
  compare: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  compareText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  menu: { paddingLeft: 4, paddingVertical: 6 },
});
