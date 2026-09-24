import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import { Button } from './Button';
import { TextField } from './TextField';

export interface SheetAction {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress(): void;
  testID?: string;
}

/** Bottom sheet with a list of actions (the "···" menu). */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        {!!title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            testID={a.testID}
            onPress={() => {
              onClose();
              a.onPress();
            }}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceAlt }]}
          >
            <Ionicons name={a.icon} size={21} color={a.destructive ? colors.danger : colors.ink} />
            <Text style={[styles.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

/** Bottom sheet asking for one line of text (e.g. renaming a look). */
export function PromptSheet({
  visible,
  title,
  label,
  initialValue,
  confirmLabel = '확인',
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  label: string;
  initialValue: string;
  confirmLabel?: string;
  busy?: boolean;
  onSubmit(value: string): void;
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const trimmed = value.trim();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexEnd}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, styles.promptSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <TextField label={label} value={value} onChangeText={setValue} maxLength={40} autoFocus testID="prompt-input" />
          <Button title={confirmLabel} onPress={() => onSubmit(trimmed)} disabled={!trimmed} loading={busy} testID="prompt-submit" />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flexEnd: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  promptSheet: { position: 'relative', paddingHorizontal: 20, gap: 14 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, paddingHorizontal: 8, marginBottom: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 54, paddingHorizontal: 10, borderRadius: radius.md },
  actionText: { fontSize: 16, fontWeight: '500', color: colors.ink },
});
