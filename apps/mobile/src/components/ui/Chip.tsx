import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';

/** Filter pill: black when selected, light grey otherwise. */
export function Chip({
  label,
  selected,
  onPress,
  tone = 'light',
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const dark = tone === 'dark';
  const bg = selected ? (dark ? '#FFFFFF' : colors.ink) : dark ? 'rgba(255,255,255,0.1)' : colors.surfaceAlt;
  const fg = selected ? (dark ? colors.ink : '#FFFFFF') : dark ? colors.stageText : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <Text style={[styles.label, { color: fg }, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

/** Row of mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tone = 'light',
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
  /** dark: joined pill floating over the 3D stage. light: separate pills on white. */
  tone?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  if (tone === 'dark') {
    return (
      <View style={[styles.joined, style]}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.joinedItem, on && styles.joinedItemOn]}
            >
              <Text style={[styles.joinedText, on && styles.joinedTextOn]} numberOfLines={1}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={[styles.separate, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.separateItem, on && styles.separateItemOn]}
          >
            <Text style={[styles.separateText, on && styles.separateTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text tabs with an underline under the selected one (studio categories). */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  stretch,
}: {
  tabs: { value: T; label: string; dot?: boolean; testID?: string }[];
  value: T;
  onChange(value: T): void;
  /** Spread the tabs evenly across the width instead of scrolling. */
  stretch?: boolean;
}) {
  const items = tabs.map((t) => {
    const on = t.value === value;
    return (
      <Pressable
        key={t.value}
        onPress={() => onChange(t.value)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        testID={t.testID}
        style={[styles.tab, stretch && styles.tabStretch]}
      >
        <View style={[styles.tabInner, stretch && styles.tabInnerTight]}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
              {t.label}
            </Text>
            {t.dot && <View style={styles.tabDot} />}
          </View>
          <View style={[styles.tabBar, stretch && styles.tabBarTight, on && styles.tabBarOn]} />
        </View>
      </Pressable>
    );
  });
  return (
    <View style={styles.tabsWrap}>
      {stretch ? (
        <View style={[styles.tabs, styles.tabsStretch]}>{items}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabs}>
          {items}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { height: 34, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '500' },
  labelSelected: { fontWeight: '700' },
  joined: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18,18,18,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  joinedItem: { height: 34, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  joinedItemOn: { backgroundColor: '#FFFFFF' },
  joinedText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', maxWidth: 110 },
  joinedTextOn: { color: colors.ink, fontWeight: '700' },
  separate: { flexDirection: 'row', gap: 8 },
  separateItem: { flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  separateItemOn: { backgroundColor: colors.ink },
  separateText: { fontSize: 14, fontWeight: '500', color: colors.inkSoft },
  separateTextOn: { color: '#FFFFFF', fontWeight: '700' },
  tabsWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tabs: { paddingHorizontal: 12, gap: 4 },
  tabsStretch: { flexDirection: 'row', paddingHorizontal: 8, gap: 0 },
  tab: { paddingHorizontal: 6, paddingTop: 4, alignItems: 'center' },
  tabStretch: { flex: 1, paddingHorizontal: 0 },
  tabInner: { paddingHorizontal: 6, alignItems: 'center' },
  // Stretched tabs share the width, so six of them still fit a 375 pt phone.
  tabInnerTight: { paddingHorizontal: 3 },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 38 },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.muted },
  tabTextOn: { color: colors.ink, fontWeight: '700' },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.ink, marginTop: -8 },
  tabBar: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent', marginHorizontal: -6 },
  tabBarTight: { marginHorizontal: -3 },
  tabBarOn: { backgroundColor: colors.ink },
});
