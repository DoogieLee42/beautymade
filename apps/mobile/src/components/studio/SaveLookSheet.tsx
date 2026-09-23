import { summarizeChanges, type ControlValues } from '@beautymade/face-engine';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../../theme';
import { Button, TextField } from '../ui';

export interface SaveLookSheetProps {
  visible: boolean;
  values: ControlValues;
  suggestedName: string;
  /** Name of the look being edited; enables "update" in addition to "save as new". */
  editingName?: string | null;
  saving: boolean;
  onSave(name: string, mode: 'new' | 'update'): void;
  onClose(): void;
}

/** Step 13: name and save the current version. */
export function SaveLookSheet({ visible, values, suggestedName, editingName, saving, onSave, onClose }: SaveLookSheetProps) {
  const [name, setName] = useState(suggestedName);
  const insets = useSafeAreaInsets();
  const changes = summarizeChanges(values);

  useEffect(() => {
    if (visible) setName(editingName ?? suggestedName);
  }, [visible, editingName, suggestedName]);

  const trimmed = name.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{editingName ? '룩 저장' : '이 버전을 저장할까요?'}</Text>
          <Text style={styles.subtitle}>저장한 룩은 Looks 탭에서 언제든 다시 열고 비교할 수 있어요.</Text>

          <View style={styles.changes}>
            {changes.length === 0 ? (
              <Text style={styles.noChange}>아직 바꾼 곳이 없어요. 원본 그대로 저장돼요.</Text>
            ) : (
              changes.slice(0, 8).map((c) => (
                <View key={c.id} style={styles.change}>
                  <Text style={styles.changeText}>{c.text}</Text>
                </View>
              ))
            )}
            {changes.length > 8 && <Text style={styles.more}>+{changes.length - 8}</Text>}
          </View>

          <TextField label="룩 이름" value={name} onChangeText={setName} maxLength={40} placeholder="예: 자연스러운 콧대" testID="look-name" />

          <View style={styles.actions}>
            {editingName ? (
              <>
                <Button title="기존 룩 업데이트" onPress={() => onSave(trimmed, 'update')} loading={saving} disabled={!trimmed} />
                <Button title="새 룩으로 저장" variant="secondary" onPress={() => onSave(trimmed, 'new')} disabled={!trimmed || saving} />
              </>
            ) : (
              <Button title="저장하기" icon="bookmark" onPress={() => onSave(trimmed, 'new')} loading={saving} disabled={!trimmed} testID="save-look" />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,10,12,0.45)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.inkSoft, marginTop: -6 },
  changes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  change: { paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.primarySoft, justifyContent: 'center' },
  changeText: { fontSize: 12, fontWeight: '700', color: colors.primaryInk },
  noChange: { fontSize: 13, color: colors.muted },
  more: { fontSize: 12, color: colors.muted, alignSelf: 'center' },
  actions: { gap: 8, marginTop: 4 },
});
