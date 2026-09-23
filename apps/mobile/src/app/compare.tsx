import Ionicons from '@expo/vector-icons/Ionicons';
import type { CameraFocus, ControlValues } from '@beautymade/face-engine';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Look } from '../api/types';
import { Button, Header, Segmented, toast } from '../components/ui';
import { useFace, useLook, useLooks, useStudioFace } from '../hooks/queries';
import { useLookSaver } from '../hooks/useLookSaver';
import { formatDate } from '../lib/format';
import { shareImage } from '../lib/shareImage';
import { useStudio } from '../state/studio';
import { colors, radius } from '../theme';
import type { CompareMode } from '../three/FaceRenderer';
import { FaceView, type FaceViewHandle } from '../three/FaceView';
import { useFaceThumbnails } from '../three/thumbnails';
import { ANGLE_VIEWS } from '../three/views';

type Mode = 'sideBySide' | 'split' | 'alternate';
type Angle = keyof typeof ANGLE_VIEWS | 'free';

const MODES: { value: Mode; label: string }[] = [
  { value: 'sideBySide', label: '나란히 보기' },
  { value: 'split', label: '슬라이더' },
  { value: 'alternate', label: '번갈아 보기' },
];

const ANGLES: { value: Angle; label: string }[] = [
  { value: 'front', label: '정면' },
  { value: 'left', label: '왼쪽' },
  { value: 'right', label: '오른쪽' },
  { value: 'free', label: '자유 회전' },
];

const EMPTY: ControlValues = {};

/**
 * Before/after comparison (design 7). Without params it compares the studio's current
 * values; with `lookId` it shows a saved look. The "before" side can be the original
 * face or another saved look.
 */
export default function Compare() {
  const { lookId } = useLocalSearchParams<{ lookId?: string }>();
  const { width, height } = useWindowDimensions();
  const faceRef = useRef<FaceViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('split');
  const [angle, setAngle] = useState<Angle | null>('front');
  const [flip, setFlip] = useState(false);
  const [againstId, setAgainstId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const saved = useLook(lookId);
  const savedFace = useFace(saved.data?.faceModelId);
  const studioFace = useStudioFace();
  const studioValues = useStudio((s) => s.values);
  const mirrored = useStudio((s) => s.mirrored);
  const looks = useLooks();

  const face = lookId ? (savedFace.data ?? null) : studioFace.face;
  const values = lookId ? (saved.data?.values ?? EMPTY) : studioValues;
  const candidates = (looks.data ?? []).filter((l) => l.id !== lookId && l.faceModelId === face?.id);
  const against = candidates.find((l) => l.id === againstId) ?? null;
  const compareValues = against?.values ?? EMPTY;
  const labels: [string, string] = [against?.name ?? 'Before', against ? (saved.data?.name ?? 'After') : 'After'];

  const saver = useLookSaver({
    faceRef,
    face,
    values,
    onSaved: (_look, mode) => {
      toast(mode === 'update' ? '룩을 업데이트했어요' : '룩을 저장했어요');
      router.dismissTo('/(tabs)/looks');
    },
  });

  useEffect(() => {
    if (mode !== 'alternate') return;
    setFlip(true);
    const id = setInterval(() => setFlip((f) => !f), 1100);
    return () => clearInterval(id);
  }, [mode]);

  const tile = Math.floor((Math.min(width, 520) - 40 - 24) / 4);
  const thumbs = useFaceThumbnails(
    faceRef,
    face?.id ?? null,
    ready,
    Object.fromEntries(
      (['front', 'left', 'right'] as const).map((a) => [a, { values, focus: ANGLE_VIEWS[a], width: tile, height: Math.round(tile * 0.78) }]),
    ),
    mirrored,
  );

  const pickAngle = (a: Angle) => {
    setAngle(a);
    if (a !== 'free') faceRef.current?.focus(ANGLE_VIEWS[a]);
  };

  const exportImage = async () => {
    if (!faceRef.current || exporting) return;
    setExporting(true);
    try {
      const focus: Partial<CameraFocus> = angle && angle !== 'free' ? ANGLE_VIEWS[angle] : faceRef.current.currentFocus();
      const uri = await faceRef.current.renderThumbnail({ values, pair: compareValues, focus, width: 360, height: 440 });
      if (!uri || !(await shareImage(uri, 'beautymade-compare.jpg'))) toast('이 기기에서는 이미지를 내보낼 수 없어요.', { tone: 'error' });
    } catch {
      toast('이미지를 만들지 못했어요.', { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const editInStudio = (look: Look) => {
    useStudio.getState().loadLook(look);
    useStudio.getState().setTab('nose');
    router.replace('/studio');
  };

  const compareMode: CompareMode = mode === 'alternate' ? (flip ? 'original' : 'off') : mode;
  const stageHeight = Math.max(300, Math.round(height * 0.5));

  if (lookId && (saved.isLoading || (!saved.data && !saved.isError))) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }
  if (lookId && !saved.data) {
    return (
      <SafeAreaView style={[styles.root, styles.center]}>
        <Text style={styles.missing}>룩을 불러오지 못했어요.</Text>
        <Button title="돌아가기" variant="white" size="md" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={styles.top}>
        <Header
          tone="dark"
          title="비교하기"
          right={
            <Pressable onPress={exportImage} hitSlop={10} accessibilityLabel="비교 이미지 저장" testID="export-compare">
              {exporting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download-outline" size={25} color="#FFFFFF" />}
            </Pressable>
          }
        />
      </SafeAreaView>

      <View style={{ height: stageHeight }}>
        <FaceView
          ref={faceRef}
          face={face}
          values={values}
          compareValues={compareValues}
          compareMode={compareMode}
          compareLabels={labels}
          compareLabelsTop={10}
          onBeforeLabelPress={candidates.length ? () => setPicking(true) : undefined}
          splitHandleY={0.8}
          mirrored={mirrored}
          turntable={angle === 'free'}
          fit={1.12}
          style={StyleSheet.absoluteFill}
          onReady={() => setReady(true)}
          onInteract={() => setAngle(null)}
        />
        {mode === 'alternate' && (
          <View pointerEvents="none" style={styles.flipLabel}>
            <Text style={styles.flipText}>{flip ? labels[0] : labels[1]}</Text>
          </View>
        )}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false} bounces={false}>
          <Segmented options={MODES} value={mode} onChange={(m) => setMode(m)} style={styles.modes} />
          <View style={styles.angles}>
            {ANGLES.map((a) => {
              const on = angle === a.value;
              const uri = a.value === 'free' ? undefined : thumbs[a.value];
              return (
                <Pressable
                  key={a.value}
                  onPress={() => pickAngle(a.value)}
                  style={[styles.angle, { width: tile }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  testID={`angle-${a.value}`}
                >
                  <View style={[styles.angleFrame, { height: Math.round(tile * 0.78) }, on && styles.angleFrameOn]}>
                    {a.value === 'free' ? (
                      <Ionicons name="cube-outline" size={24} color={colors.inkSoft} />
                    ) : uri ? (
                      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
                    ) : (
                      <ActivityIndicator size="small" color={colors.faint} />
                    )}
                  </View>
                  <Text style={[styles.angleLabel, on && styles.angleLabelOn]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.actions}>
          {lookId && saved.data ? (
            <>
              <Button title="스튜디오에서 편집하기" onPress={() => editInStudio(saved.data!)} testID="edit-look" />
              <Button title="목록으로 돌아가기" variant="outline" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Button title="이 룩 저장하기" onPress={saver.open} testID="open-save" />
              <Button title="스튜디오로 돌아가기" variant="outline" onPress={() => router.back()} testID="back-to-studio" />
            </>
          )}
        </View>
      </SafeAreaView>

      <TargetPicker
        visible={picking}
        looks={candidates}
        selected={againstId}
        onSelect={(id) => {
          setAgainstId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
      {saver.sheet}
    </View>
  );
}

/** Choose what the "before" side shows: the original face or another saved look. */
function TargetPicker({
  visible,
  looks,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  looks: Look[];
  selected: string | null;
  onSelect(id: string | null): void;
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  const options: { id: string | null; name: string; meta: string; thumb: string | null }[] = [
    { id: null, name: '원본', meta: '아무것도 바꾸지 않은 얼굴', thumb: null },
    ...looks.map((l) => ({ id: l.id, name: l.name, meta: formatDate(l.createdAt), thumb: l.thumbnailUrl })),
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>무엇과 비교할까요?</Text>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 4 }}>
          {options.map((o) => {
            const on = o.id === selected;
            return (
              <Pressable key={o.id ?? 'original'} onPress={() => onSelect(o.id)} style={styles.option}>
                <View style={styles.optionThumb}>
                  {o.thumb ? (
                    <Image source={{ uri: o.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Ionicons name="person-outline" size={20} color={colors.muted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionName} numberOfLines={1}>
                    {o.name}
                  </Text>
                  <Text style={styles.optionMeta}>{o.meta}</Text>
                </View>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.ink : colors.faint} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.stage },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  missing: { color: colors.stageMuted, fontSize: 15 },
  top: { backgroundColor: colors.stage },
  flipLabel: {
    position: 'absolute',
    top: 10,
    left: 14,
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(90,90,94,0.62)',
  },
  flipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  panel: { flex: 1, backgroundColor: colors.bg },
  panelContent: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  modes: {},
  angles: { flexDirection: 'row', justifyContent: 'space-between' },
  angle: { alignItems: 'center', gap: 7 },
  angleFrame: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  angleFrameOn: { borderColor: colors.ink },
  angleLabel: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  angleLabelOn: { color: colors.ink, fontWeight: '700' },
  actions: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, gap: 8 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 4 },
  sheetTitle: { fontSize: 19, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  optionThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  optionMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
