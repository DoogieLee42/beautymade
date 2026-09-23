import Ionicons from '@expo/vector-icons/Ionicons';
import { summarizeChanges } from '@beautymade/face-engine';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Look } from '../../api/types';
import { formatDate } from '../../lib/format';
import { colors, radius, shadow } from '../../theme';

export function LookCard({
  look,
  onPress,
  selected,
  selectable,
  style,
}: {
  look: Look;
  onPress?: () => void;
  selected?: boolean;
  selectable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const changes = summarizeChanges(look.values, 2);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={look.name}
      style={({ pressed }) => [styles.card, shadow, selected && styles.selected, pressed && { opacity: 0.9 }, style]}
    >
      <View style={styles.imageWrap}>
        {look.thumbnailUrl ? (
          <Image source={{ uri: look.thumbnailUrl }} style={styles.image} contentFit="cover" transition={180} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="happy-outline" size={32} color={colors.stageMuted} />
          </View>
        )}
        {selectable && (
          <View style={[styles.select, selected && styles.selectOn]}>
            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {look.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {changes.length ? changes.map((c) => c.text).join(' · ') : '원본'}
        </Text>
        <Text style={styles.date}>{formatDate(look.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.primary },
  imageWrap: { backgroundColor: colors.stage },
  image: { width: '100%', aspectRatio: 0.82 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stageRaised },
  select: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  body: { padding: 12, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  meta: { fontSize: 12, color: colors.inkSoft },
  date: { fontSize: 11, color: colors.muted, marginTop: 2 },
});
