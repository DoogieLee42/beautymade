import Ionicons from '@expo/vector-icons/Ionicons';
import { PRESET_BY_ID, categoryLabel, type Preset } from '@beautymade/face-engine';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PresetTile } from '../../components/studio/PresetTile';
import { Button } from '../../components/ui';
import { useCurrentFace, useLooks, useMe, useStudioFace } from '../../hooks/queries';
import { formatDate } from '../../lib/format';
import { useSession } from '../../state/session';
import { useStudio } from '../../state/studio';
import { colors, radius } from '../../theme';
import { FaceView, type FaceViewHandle } from '../../three/FaceView';
import { useFaceThumbnails } from '../../three/thumbnails';
import { PRESET_VIEW } from '../../three/views';

/** One eye-catching style per category for the quick start row. */
const QUICK = ['eyes-bright', 'nose-defined', 'contour-vline', 'lips-full', 'skin-glass', 'lifting-firm'].map(
  (id) => PRESET_BY_ID[id],
);

const TILE = 132;

/** Home: my 3D face, quick-start styles and recent looks. */
export default function Home() {
  const focused = useIsFocused();
  const me = useMe();
  const current = useCurrentFace();
  const looks = useLooks();
  const { face, isDemo } = useStudioFace();
  const user = useSession((s) => s.user);
  const mirrored = useStudio((s) => s.mirrored);
  const heroRef = useRef<FaceViewHandle>(null);
  const [ready, setReady] = useState(false);
  const name = me.data?.user.name ?? user?.name ?? '';

  const thumbs = useFaceThumbnails(
    heroRef,
    face?.id ?? null,
    ready,
    Object.fromEntries(
      QUICK.map((p) => [p.id, { values: p.values, focus: PRESET_VIEW[p.category], width: TILE, height: Math.round(TILE * 0.72), theme: 'light' as const }]),
    ),
    mirrored,
  );

  const openStudio = () => router.push('/studio');

  const startWithPreset = (preset: Preset) => {
    const studio = useStudio.getState();
    studio.startFresh();
    studio.applyPreset(preset);
    router.push('/studio');
  };

  const refreshing = me.isRefetching || looks.isRefetching || current.isRefetching;
  const recent = looks.data?.slice(0, 8) ?? [];

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
          <Text style={styles.brand}>BeautyMade</Text>
          <Text style={styles.greeting}>{name ? `${name}님, 오늘은 어떤 모습이 궁금하세요?` : '오늘은 어떤 모습이 궁금하세요?'}</Text>
        </View>

        <View style={styles.hero}>
          <FaceView
            ref={heroRef}
            face={face}
            turntable={focused}
            interactive={false}
            mirrored={mirrored}
            fit={1.18}
            style={styles.heroStage}
            onReady={() => setReady(true)}
          />
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{isDemo ? '샘플 얼굴로 체험 중' : '내 3D 얼굴'}</Text>
            <Text style={styles.heroMeta}>
              {isDemo ? '내 얼굴을 스캔하면 바로 내 얼굴로 바뀌어요' : `${formatDate(face?.createdAt ?? '')} 스캔`}
            </Text>
            <View style={styles.heroActions}>
              {isDemo ? (
                <>
                  <Button title="내 얼굴 스캔하기" variant="white" size="md" onPress={() => router.push('/scan')} style={styles.flex} testID="home-scan" />
                  <Button title="체험하기" variant="subtle" size="md" onPress={openStudio} style={styles.secondary} testID="home-studio" />
                </>
              ) : (
                <>
                  <Button title="스튜디오 열기" variant="white" size="md" onPress={openStudio} style={styles.flex} testID="home-studio" />
                  <Button title="다시 스캔" variant="subtle" size="md" onPress={() => router.push('/scan')} style={styles.secondary} />
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>빠르게 시작하기</Text>
          <Text style={styles.sectionHint}>탭 한 번으로 스튜디오에 바로 적용돼요</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.row}>
          {QUICK.map((p) => (
            <PresetTile
              key={p.id}
              label={`${categoryLabel(p.category)} · ${p.name}`}
              caption={p.tagline}
              image={thumbs[p.id]}
              aspectRatio={1 / 0.72}
              strong
              onPress={() => startWithPreset(p)}
              testID={`quick-${p.id}`}
              style={{ width: TILE }}
            />
          ))}
        </ScrollView>

        <View style={[styles.section, styles.sectionRow]}>
          <Text style={styles.sectionTitle}>최근 저장한 룩</Text>
          {recent.length > 0 && (
            <Pressable onPress={() => router.navigate('/(tabs)/looks')} hitSlop={8}>
              <Text style={styles.more}>전체 보기</Text>
            </Pressable>
          )}
        </View>
        {recent.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.row}>
            {recent.map((look) => (
              <Pressable
                key={look.id}
                onPress={() => router.push({ pathname: '/compare', params: { lookId: look.id } })}
                style={({ pressed }) => [styles.look, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.lookImage}>
                  {look.thumbnailUrl ? (
                    <Image source={{ uri: look.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
                  ) : (
                    <Ionicons name="person-outline" size={26} color={colors.faint} />
                  )}
                </View>
                <Text style={styles.lookName} numberOfLines={1}>
                  {look.name}
                </Text>
                <Text style={styles.lookDate}>{formatDate(look.createdAt)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Pressable style={styles.empty} onPress={openStudio}>
            <Ionicons name="bookmark-outline" size={20} color={colors.inkSoft} />
            <Text style={styles.emptyText}>마음에 드는 버전을 저장하면 여기에 모여요</Text>
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
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 6 },
  brand: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.8 },
  greeting: { fontSize: 15, color: colors.muted },
  hero: { marginHorizontal: 20, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.stage },
  heroStage: { height: 330 },
  heroBody: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18, gap: 4, backgroundColor: colors.stage },
  heroTitle: { color: colors.stageText, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  heroMeta: { color: colors.stageMuted, fontSize: 13 },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  secondary: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', paddingHorizontal: 18 },
  section: { paddingHorizontal: 20, marginTop: 30, marginBottom: 12, gap: 3 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  sectionHint: { fontSize: 13, color: colors.muted },
  more: { fontSize: 13, fontWeight: '600', color: colors.inkSoft, textDecorationLine: 'underline' },
  row: { paddingHorizontal: 20, gap: 12 },
  noGrow: { flexGrow: 0 },
  look: { width: 118, gap: 6 },
  lookImage: {
    width: 118,
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  lookDate: { fontSize: 12, color: colors.muted, marginTop: -3 },
  empty: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  emptyText: { flex: 1, fontSize: 14, color: colors.inkSoft },
});
