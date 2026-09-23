import Ionicons from '@expo/vector-icons/Ionicons';
import { summarizeChanges, type ControlValues } from '@beautymade/face-engine';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Look } from '../../api/types';
import { Button, IconButton, TextField, toast } from '../../components/ui';
import { errorMessage, useDeleteLook, useFace, useLook, useLooks, useUpdateLook } from '../../hooks/queries';
import { confirm } from '../../lib/dialog';
import { formatDate } from '../../lib/format';
import { useStudio } from '../../state/studio';
import { colors, radius } from '../../theme';
import { FaceView } from '../../three/FaceView';

type Mode = 'split' | 'look' | 'pair';

const EMPTY: ControlValues = {};

/** Reopened look: compare with the original face or with another look. */
export default function LookDetail() {
  const { id, compare } = useLocalSearchParams<{ id: string; compare?: string }>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const look = useLook(id);
  const looks = useLooks();
  const [otherId, setOtherId] = useState<string | null>(compare ?? null);
  const [mode, setMode] = useState<Mode>(compare ? 'pair' : 'split');
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const face = useFace(look.data?.faceModelId);
  const mirrored = useStudio((s) => s.mirrored);
  const update = useUpdateLook();
  const remove = useDeleteLook();

  const other = looks.data?.find((l) => l.id === otherId) ?? null;
  const candidates = (looks.data ?? []).filter((l) => l.id !== id && l.faceModelId === look.data?.faceModelId);

  if (look.isLoading || !look.data) {
    return (
      <View style={[styles.root, styles.center]}>
        {look.isError ? <Text style={styles.muted}>룩을 불러오지 못했어요.</Text> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }
  const current = look.data;
  const changes = summarizeChanges(current.values);

  const openInStudio = () => {
    useStudio.getState().loadLook(current);
    useStudio.getState().setTab('presets');
    router.navigate('/(tabs)/studio');
  };

  const onDelete = async () => {
    if (!(await confirm('룩 삭제', `'${current.name}'을(를) 삭제할까요?`, '삭제', true))) return;
    try {
      await remove.mutateAsync(current.id);
      toast('룩을 삭제했어요');
      router.back();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const onRename = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await update.mutateAsync({ id: current.id, patch: { name: trimmed } });
      setRenaming(false);
      look.refetch();
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const pairMode = mode === 'pair' && other;
  const faceProps = pairMode
    ? { values: current.values, compareValues: other!.values, compareMode: 'sideBySide' as const, compareLabels: [other!.name, current.name] as [string, string] }
    : mode === 'split'
      ? { values: current.values, compareValues: EMPTY, compareMode: 'split' as const, compareLabels: ['원본', current.name] as [string, string] }
      : { values: current.values, compareMode: 'off' as const };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={{ height: Math.max(320, height * 0.52) }}>
        <FaceView face={face.data ?? null} mirrored={mirrored} style={StyleSheet.absoluteFill} {...faceProps} />
        <SafeAreaView edges={['top']} style={styles.header} pointerEvents="box-none">
          <IconButton icon="chevron-back" label="뒤로" tone="dark" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/looks'))} />
          <View style={styles.headerActions}>
            <IconButton
              icon="create-outline"
              label="이름 바꾸기"
              tone="dark"
              onPress={() => {
                setName(current.name);
                setRenaming(true);
              }}
            />
            <IconButton icon="trash-outline" label="삭제" tone="dark" onPress={onDelete} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.name}>{current.name}</Text>
        <Text style={styles.date}>{formatDate(current.createdAt)} 저장</Text>

        <View style={styles.segment}>
          {(
            [
              ['split', '원본과 비교'],
              ['look', '룩만 보기'],
              ['pair', '다른 룩과 비교'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <Pressable
              key={m}
              onPress={() => {
                if (m === 'pair' && !other) {
                  if (!candidates.length) return toast('비교할 다른 룩이 없어요. Studio에서 하나 더 저장해보세요.');
                  setPicking(true);
                  return;
                }
                setMode(m);
              }}
              style={[styles.segmentItem, mode === m && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {pairMode && (
          <Pressable onPress={() => setPicking(true)} style={styles.pairInfo}>
            <Text style={styles.pairText}>
              왼쪽 <Text style={styles.bold}>{other!.name}</Text> · 오른쪽 <Text style={styles.bold}>{current.name}</Text>
            </Text>
            <Text style={styles.link}>바꾸기</Text>
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>바꾼 부위</Text>
        {changes.length === 0 ? (
          <Text style={styles.muted}>원본 그대로예요.</Text>
        ) : (
          <View style={styles.changes}>
            {changes.map((c) => (
              <View key={c.id} style={styles.changeRow}>
                <Text style={styles.changeLabel}>{c.label}</Text>
                <View style={styles.changeBarTrack}>
                  <View
                    style={[
                      styles.changeBar,
                      { width: `${Math.abs(c.value) * 50}%`, left: c.value >= 0 ? '50%' : `${50 - Math.abs(c.value) * 50}%` },
                    ]}
                  />
                  <View style={styles.changeZero} />
                </View>
                <Text style={styles.changeValue}>{c.text.split(' ').pop()}</Text>
              </View>
            ))}
          </View>
        )}

        <Button title="Studio에서 이어서 편집" icon="sparkles" onPress={openInStudio} style={{ marginTop: 20 }} testID="edit-in-studio" />
      </ScrollView>

      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>비교할 룩 선택</Text>
          <FlatList
            data={candidates}
            keyExtractor={(l) => l.id}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => (
              <PickerRow
                look={item}
                selected={item.id === otherId}
                onPress={() => {
                  setOtherId(item.id);
                  setMode('pair');
                  setPicking(false);
                }}
              />
            )}
          />
        </View>
      </Modal>

      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <Pressable style={styles.backdrop} onPress={() => setRenaming(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, gap: 14 }]}>
          <Text style={styles.sheetTitle}>이름 바꾸기</Text>
          <TextField label="룩 이름" value={name} onChangeText={setName} maxLength={40} autoFocus />
          <Button title="저장" onPress={onRename} loading={update.isPending} disabled={!name.trim()} />
        </View>
      </Modal>
    </View>
  );
}

function PickerRow({ look, selected, onPress }: { look: Look; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.pickRow}>
      {look.thumbnailUrl ? (
        <Image source={{ uri: look.thumbnailUrl }} style={styles.pickThumb} contentFit="cover" />
      ) : (
        <View style={[styles.pickThumb, { backgroundColor: colors.stageRaised }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.pickName}>{look.name}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {summarizeChanges(look.values, 2).map((c) => c.text).join(' · ') || '원본'}
        </Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.stage },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  headerActions: { flexDirection: 'row', gap: 8 },
  panel: { flex: 1, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, marginTop: -18 },
  panelContent: { padding: 20, gap: 4 },
  name: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, color: colors.muted },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, marginTop: 16 },
  segmentItem: { flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surface, boxShadow: '0px 2px 6px rgba(42,26,32,0.12)' },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  segmentTextActive: { color: colors.ink, fontWeight: '800' },
  pairInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  pairText: { fontSize: 13, color: colors.inkSoft, flex: 1 },
  bold: { fontWeight: '800', color: colors.ink },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 22, marginBottom: 10 },
  muted: { fontSize: 13, color: colors.muted },
  changes: { gap: 12 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  changeLabel: { width: 92, fontSize: 14, fontWeight: '600', color: colors.ink },
  changeBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  changeBar: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.primary, borderRadius: 3 },
  changeZero: { position: 'absolute', left: '50%', top: -2, width: 1, height: 10, backgroundColor: colors.muted },
  changeValue: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '800', color: colors.primaryInk, fontVariant: ['tabular-nums'] },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,10,12,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  pickThumb: { width: 52, height: 64, borderRadius: radius.sm },
  pickName: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
