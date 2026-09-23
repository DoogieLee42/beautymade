import Ionicons from '@expo/vector-icons/Ionicons';
import { lookCategories, type CategoryId } from '@beautymade/face-engine';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Look } from '../../api/types';
import { LookRow } from '../../components/looks/LookRow';
import { ActionSheet, Button, Chip, Header, PromptSheet, toast } from '../../components/ui';
import { errorMessage, useDeleteLook, useLooks, useUpdateLook } from '../../hooks/queries';
import { confirm } from '../../lib/dialog';
import { useStudio } from '../../state/studio';
import { colors } from '../../theme';

type Filter = 'all' | CategoryId;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'nose', label: '코' },
  { value: 'contour', label: '윤곽' },
  { value: 'lips', label: '입술' },
  { value: 'skin', label: '피부' },
  { value: 'lifting', label: '리프팅' },
];

/** Step 14: saved looks, reopened in the studio or compared (design 8). */
export default function Looks() {
  const looks = useLooks();
  const update = useUpdateLook();
  const remove = useDeleteLook();
  const [filter, setFilter] = useState<Filter>('all');
  const [menuFor, setMenuFor] = useState<Look | null>(null);
  const [renaming, setRenaming] = useState<Look | null>(null);
  const data = looks.data ?? [];
  const shown = filter === 'all' ? data : data.filter((l) => lookCategories(l.values).includes(filter));

  const openInStudio = (look: Look) => {
    useStudio.getState().loadLook(look);
    router.push('/studio');
  };

  const newLook = () => {
    useStudio.getState().startFresh();
    router.push('/studio');
  };

  const onDelete = async (look: Look) => {
    if (!(await confirm('룩 삭제', `‘${look.name}’을(를) 삭제할까요?`, '삭제', true))) return;
    try {
      await remove.mutateAsync(look.id);
      if (useStudio.getState().look?.id === look.id) useStudio.getState().startFresh();
      toast('룩을 삭제했어요');
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const onRename = async (name: string) => {
    if (!renaming) return;
    try {
      await update.mutateAsync({ id: renaming.id, patch: { name } });
      if (useStudio.getState().look?.id === renaming.id) {
        useStudio.setState((s) => ({ look: s.look && { ...s.look, name } }));
      }
      setRenaming(null);
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <Header
        title="내가 저장한 룩"
        onBack={() => router.navigate('/(tabs)')}
        right={
          <Pressable onPress={newLook} hitSlop={10} accessibilityLabel="새 룩 만들기" testID="new-look">
            <Ionicons name="add" size={30} color={colors.ink} />
          </Pressable>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} style={styles.chip} />
        ))}
      </ScrollView>

      {looks.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.ink} />
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="albums-outline" size={28} color={colors.ink} />
          </View>
          <Text style={styles.emptyTitle}>아직 저장한 룩이 없어요</Text>
          <Text style={styles.emptyBody}>스튜디오에서 마음에 드는 버전을 만들고{'\n'}저장해보세요.</Text>
          <Button title="스튜디오로 가기" size="md" onPress={newLook} style={styles.emptyButton} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={looks.isRefetching} onRefresh={() => looks.refetch()} />}
          ListEmptyComponent={<Text style={styles.noMatch}>이 카테고리로 저장한 룩이 없어요.</Text>}
          renderItem={({ item }) => (
            <LookRow
              look={item}
              onOpen={() => openInStudio(item)}
              onCompare={() => router.push({ pathname: '/compare', params: { lookId: item.id } })}
              onMenu={() => setMenuFor(item)}
            />
          )}
        />
      )}

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.name}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                { label: '스튜디오에서 편집', icon: 'color-wand-outline', onPress: () => openInStudio(menuFor) },
                { label: '이름 바꾸기', icon: 'create-outline', onPress: () => setRenaming(menuFor), testID: 'rename-look' },
                { label: '삭제', icon: 'trash-outline', destructive: true, onPress: () => onDelete(menuFor), testID: 'delete-look' },
              ]
            : []
        }
      />
      <PromptSheet
        visible={!!renaming}
        title="이름 바꾸기"
        label="룩 이름"
        initialValue={renaming?.name ?? ''}
        confirmLabel="저장"
        busy={update.isPending}
        onSubmit={onRename}
        onClose={() => setRenaming(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  noGrow: { flexGrow: 0 },
  filters: { paddingHorizontal: 20, gap: 8, paddingTop: 6, paddingBottom: 10 },
  chip: { minWidth: 64, height: 38 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  noMatch: { textAlign: 'center', color: colors.muted, fontSize: 14, marginTop: 40 },
  empty: { alignItems: 'center', paddingHorizontal: 32, marginTop: 80 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 16 },
  emptyBody: { fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center', marginTop: 6 },
  emptyButton: { marginTop: 18, alignSelf: 'center', paddingHorizontal: 28 },
});
