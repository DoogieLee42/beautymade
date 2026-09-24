import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';

/** Image card with a caption (studio presets, quick-start styles). Selected: dark border, bold caption. */
export function PresetTile({
  label,
  caption,
  image,
  selected,
  onPress,
  aspectRatio = 2,
  strong,
  testID,
  style,
}: {
  label: string;
  caption?: string;
  image?: string;
  selected?: boolean;
  onPress?: () => void;
  aspectRatio?: number;
  /** Dark caption even when not selected (standalone cards). */
  strong?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.root, pressed && { opacity: 0.85 }, style]}
    >
      <View style={[styles.frame, { aspectRatio }, selected && styles.frameOn]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={180} />
        ) : (
          <ActivityIndicator size="small" color={colors.faint} />
        )}
      </View>
      <Text style={[styles.label, strong && styles.labelStrong, selected && styles.labelOn]} numberOfLines={1}>
        {label}
      </Text>
      {!!caption && (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 7, alignItems: 'center' },
  frame: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#E6E6E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  frameOn: { borderColor: colors.ink },
  image: { ...StyleSheet.absoluteFill },
  label: { fontSize: 14, fontWeight: '500', color: colors.muted },
  labelStrong: { color: colors.ink, fontWeight: '600' },
  labelOn: { color: colors.ink, fontWeight: '700' },
  caption: { fontSize: 12, color: colors.muted, marginTop: -4 },
});
