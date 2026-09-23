import { categoryLabel, lookCategories, summarizeChanges, type ControlValues } from '@beautymade/face-engine';
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
  const categories = lookCategories(values);

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
          <Text style={styles.title}>{editingName ? '룩 저장' : '이 룩을 저장할까요?'}</Text>
          <Text style={styles.subtitle}>저장한 룩은 ‘내 룩’에서 언제든 다시 열고 비교할 수 있어요.</Text>

          {categories.length > 0 && <Text style={styles.categories}>{categories.map(categoryLabel).join(' / ')}</Text>}
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

          <TextField label="룩 이름" value={name} onChangeText={setName} maxLength={40} placeholder="예: 자연 코 개선" testID="look-name" />

          <View style={styles.actions}>
            {editingName ? (
              <>
                <Button title="기존 룩 업데이트" onPress={() => onSave(trimmed, 'update')} loading={saving} disabled={!trimmed} testID="save-look" />
                <Button
                  title="새 룩으로 저장"
                  variant="outline"
                  // Saving a copy under the same name would be confusing: suggest a fresh one.
                  onPress={() => onSave(trimmed === editingName ? suggestedName : trimmed, 'new')}
                  disabled={!trimmed || saving}
                  testID="save-look-new"
                />
              </>
            ) : (
              <Button title="저장하기" onPress={() => onSave(trimmed, 'new')} loading={saving} disabled={!trimmed} testID="save-look" />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 6 },
  title: { fontSize: 21, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: -6 },
  categories: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  changes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4 },
  change: { paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, justifyContent: 'center' },
  changeText: { fontSize: 12, fontWeight: '600', color: colors.inkSoft },
  noChange: { fontSize: 13, color: colors.muted },
  more: { fontSize: 12, color: colors.muted, alignSelf: 'center' },
  actions: { gap: 8, marginTop: 4 },
});
