import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LookCard } from '../../components/looks/LookCard';
import { Button } from '../../components/ui';
import { useLooks } from '../../hooks/queries';
import { useStudio } from '../../state/studio';
import { colors, radius } from '../../theme';

/** Step 14: saved looks, reopened or compared. */
export default function Looks() {
  const looks = useLooks();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const data = looks.data ?? [];

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));

  const compare = () => {
    const [a, b] = selected;
    setSelecting(false);
    setSelected([]);
    router.push({ pathname: '/look/[id]', params: { id: a, compare: b } });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>내 룩</Text>
          <Text style={styles.subtitle}>{data.length ? `${data.length}개의 버전을 저장했어요` : '저장한 버전이 여기에 모여요'}</Text>
        </View>
        {data.length >= 2 && (
          <Pressable
            onPress={() => {
              setSelecting((s) => !s);
              setSelected([]);
            }}
            style={[styles.compareToggle, selecting && styles.compareToggleOn]}
            testID="compare-mode"
          >
            <Ionicons name="git-compare-outline" size={16} color={selecting ? '#fff' : colors.ink} />
            <Text style={[styles.compareText, selecting && { color: '#fff' }]}>{selecting ? '취소' : '비교하기'}</Text>
          </Pressable>
        )}
      </View>

      {selecting && <Text style={styles.selectHint}>비교할 룩 2개를 골라주세요 ({selected.length}/2)</Text>}

      {looks.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="albums-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>아직 저장한 룩이 없어요</Text>
          <Text style={styles.emptyBody}>Studio에서 마음에 드는 버전을 만들고{'\n'}저장 버튼을 눌러보세요.</Text>
          <Button
            title="Studio로 가기"
            icon="sparkles"
            size="md"
            onPress={() => {
              useStudio.getState().setTab('presets');
              router.push('/(tabs)/studio');
            }}
            style={{ marginTop: 16, alignSelf: 'center' }}
          />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={looks.isRefetching} onRefresh={() => looks.refetch()} />}
          renderItem={({ item }) => (
            <LookCard
              look={item}
              style={styles.card}
              selectable={selecting}
              selected={selected.includes(item.id)}
              onPress={() => (selecting ? toggle(item.id) : router.push({ pathname: '/look/[id]', params: { id: item.id } }))}
            />
          )}
        />
      )}

      {selecting && selected.length === 2 && (
        <View style={styles.compareBar}>
          <Button title="두 룩 나란히 비교하기" icon="git-compare" onPress={compare} testID="compare-go" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.6 },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  compareToggleOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  compareText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  selectHint: { paddingHorizontal: 20, marginBottom: 8, fontSize: 13, color: colors.primary, fontWeight: '600' },
  grid: { paddingHorizontal: 14, paddingBottom: 110 },
  column: { gap: 12, paddingHorizontal: 6, marginBottom: 12 },
  card: { flex: 1 },
  empty: { alignItems: 'center', paddingHorizontal: 32, marginTop: 72 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 16 },
  emptyBody: { fontSize: 14, lineHeight: 21, color: colors.inkSoft, textAlign: 'center', marginTop: 6 },
  compareBar: { position: 'absolute', left: 20, right: 20, bottom: 16 },
});
