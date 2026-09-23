import Ionicons from '@expo/vector-icons/Ionicons';
import { PRESETS, type Preset } from '@beautymade/face-engine';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LookCard } from '../../components/looks/LookCard';
import { PresetCard } from '../../components/studio/PresetCard';
import { Button } from '../../components/ui';
import { useCurrentFace, useLooks, useMe, useStudioFace } from '../../hooks/queries';
import { formatDate } from '../../lib/format';
import { useSession } from '../../state/session';
import { useStudio } from '../../state/studio';
import { colors, radius, shadow } from '../../theme';
import { FaceView } from '../../three/FaceView';

/** Home: my 3D face, quick-start presets and recent looks. */
export default function Home() {
  const focused = useIsFocused();
  const me = useMe();
  const current = useCurrentFace();
  const looks = useLooks();
  const { face, isDemo } = useStudioFace();
  const user = useSession((s) => s.user);
  const mirrored = useStudio((s) => s.mirrored);
  const name = me.data?.user.name ?? user?.name ?? '';

  const startWithPreset = (preset: Preset) => {
    const studio = useStudio.getState();
    studio.startFresh();
    studio.applyPreset(preset);
    studio.setTab('presets');
    router.push('/(tabs)/studio');
  };

  const refreshing = me.isRefetching || looks.isRefetching || current.isRefetching;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              me.refetch();
              looks.refetch();
              current.refetch();
            }}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>BeautyMade</Text>
            <Text style={styles.greeting}>{name ? `${name}님, 오늘은 어떤 모습이 궁금하세요?` : '오늘은 어떤 모습이 궁금하세요?'}</Text>
          </View>
        </View>

        <View style={[styles.hero, shadow]}>
          <FaceView face={face} turntable={focused} interactive={false} mirrored={mirrored} fit={1.22} style={styles.heroStage} />
          <View style={styles.heroBody}>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>{isDemo ? '샘플 얼굴' : '내 3D 얼굴'}</Text>
              <Text style={styles.heroMeta}>
                {isDemo ? '내 얼굴을 스캔하면 여기서 바로 볼 수 있어요' : `${formatDate(face?.createdAt ?? '')} 스캔`}
              </Text>
            </View>
            <View style={styles.heroActions}>
              {isDemo ? (
                <Button title="내 얼굴 스캔하기" icon="scan" onPress={() => router.push('/scan')} style={styles.flex} />
              ) : (
                <>
                  <Button title="Studio 열기" icon="sparkles" onPress={() => router.push('/(tabs)/studio')} style={styles.flex} />
                  <Button title="다시 스캔" variant="light" size="lg" onPress={() => router.push('/scan')} />
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>빠르게 시작하기</Text>
          <Text style={styles.sectionHint}>탭 한 번으로 Studio에서 바로 적용돼요</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.row}>
          {PRESETS.map((p) => (
            <PresetCard key={p.id} preset={p} compact onPress={() => startWithPreset(p)} />
          ))}
        </ScrollView>

        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>최근 저장한 룩</Text>
            {(looks.data?.length ?? 0) > 0 && (
              <Pressable onPress={() => router.push('/(tabs)/looks')} hitSlop={8}>
                <Text style={styles.more}>전체 보기</Text>
              </Pressable>
            )}
          </View>
        </View>
        {looks.data && looks.data.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.row}>
            {looks.data.slice(0, 8).map((look) => (
              <LookCard
                key={look.id}
                look={look}
                style={styles.lookCard}
                onPress={() => router.push({ pathname: '/look/[id]', params: { id: look.id } })}
              />
            ))}
          </ScrollView>
        ) : (
          <Pressable style={styles.empty} onPress={() => router.push('/(tabs)/studio')}>
            <Ionicons name="bookmark-outline" size={22} color={colors.muted} />
            <Text style={styles.emptyText}>마음에 드는 버전을 Studio에서 저장해보세요</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { paddingBottom: 32 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  brand: { fontSize: 15, fontWeight: '800', color: colors.primary, letterSpacing: -0.2 },
  greeting: { fontSize: 22, lineHeight: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.5, marginTop: 4 },
  hero: { marginHorizontal: 20, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.stage },
  heroStage: { height: 300 },
  heroBody: { padding: 18, gap: 14, backgroundColor: colors.stage },
  heroText: { gap: 3 },
  heroTitle: { color: colors.stageText, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  heroMeta: { color: colors.stageMuted, fontSize: 13 },
  heroActions: { flexDirection: 'row', gap: 8 },
  section: { paddingHorizontal: 20, marginTop: 28, marginBottom: 12, gap: 2 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  sectionHint: { fontSize: 13, color: colors.muted },
  more: { fontSize: 13, fontWeight: '700', color: colors.primary },
  row: { paddingHorizontal: 20, gap: 10 },
  noGrow: { flexGrow: 0 },
  lookCard: { width: 150 },
  empty: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  emptyText: { flex: 1, fontSize: 14, color: colors.inkSoft },
});
