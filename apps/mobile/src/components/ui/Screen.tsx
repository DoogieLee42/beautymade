import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '../../theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  dark?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

/** Safe-area aware page with an optional sticky footer (primary actions). */
export function Screen({ children, scroll, dark, edges = ['top', 'bottom'], style, contentStyle, footer }: ScreenProps) {
  const bg = dark ? colors.stage : colors.bg;
  return (
    <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: bg }, style]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
      )}
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10 },
});
