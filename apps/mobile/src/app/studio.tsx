import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CATEGORIES,
  applyPreset as applyPresetValues,
  categoryLabel,
  controlsInCategory,
  interpolateValues,
  isPresetActive,
  presetsInCategory,
  sanitizeValues,
  type CameraFocus,
  type CategoryId,
  type ControlValues,
  type Preset,
} from '@beautymade/face-engine';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PresetTile } from '../components/studio/PresetTile';
import { Button, IconButton, Segmented, UnderlineTabs, ValueSlider, toast } from '../components/ui';
import { useLooks, useStudioFace } from '../hooks/queries';
import { useLookSaver } from '../hooks/useLookSaver';
import { defaultLookLabel } from '../lib/format';
import { useStudio } from '../state/studio';
import { colors, radius } from '../theme';
import { FaceView, type FaceViewHandle } from '../three/FaceView';
import { useFaceThumbnails } from '../three/thumbnails';
import { PRESET_VIEW, STUDIO_VIEW } from '../three/views';

type Showing = 'original' | 'look';

function categoryChanged(values: ControlValues, category: CategoryId) {
  return controlsInCategory(category).some((c) => (values[c.id] ?? 0) !== 0);
}

/** Steps 9-12: the Face Studio (design 6). */
export default function Studio() {
  const { width, height } = useWindowDimensions();
  const { face, isDemo } = useStudioFace();
  const faceRef = useRef<FaceViewHandle>(null);
  const animation = useRef<number | null>(null);
  const studio = useStudio();
  const { values, look, tab, mirrored, past, future } = studio;
  const looks = useLooks();
  const [ready, setReady] = useState(false);
  const [showing, setShowing] = useState<Showing>('look');
  const [holding, setHolding] = useState(false);

  const saver = useLookSaver({
    faceRef,
    face,
    values,
    onSaved: (saved, mode) =>
      toast(mode === 'update' ? '룩을 업데이트했어요' : '룩을 저장했어요', {
        action: { label: '보기', onPress: () => router.push({ pathname: '/compare', params: { lookId: saved.id } }) },
      }),
  });

  // A look saved on an older scan can't be edited on a new face.
  useEffect(() => {
    if (face && look && look.faceModelId !== face.id && !face.isDemo) useStudio.getState().startFresh();
  }, [face, look]);

  useEffect(
    () => () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
    },
    [],
  );

  const tileWidth = Math.floor((Math.min(width, 520) - 40 - 20) / 3);
  const thumbs = useFaceThumbnails(
    faceRef,
    face?.id ?? null,
    ready,
    {
      original: { values: {}, focus: { yaw: 0, zoom: 1.08 }, width: 60, height: 60 },
      ...Object.fromEntries(
        presetsInCategory(tab).map((p) => [
          p.id,
          { values: p.values, focus: PRESET_VIEW[tab], width: tileWidth, height: Math.round(tileWidth / 2) },
        ]),
      ),
    },
    mirrored,
  );

  const focusOn = (focus: Partial<CameraFocus>) => {
    if (useStudio.getState().autoFocus) faceRef.current?.focus(focus);
  };

  const stopAnimation = () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  };

  /** Smoothly moves every slider to the target (presets feel like a transformation). */
  const animateTo = (target: ControlValues) => {
    stopAnimation();
    const s = useStudio.getState();
    s.beginEdit();
    const from = s.values;
    const start = Date.now();
    const duration = 520;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      useStudio.getState().setValues(k >= 1 ? sanitizeValues(target) : interpolateValues(from, target, e));
      if (k < 1) {
        animation.current = requestAnimationFrame(step);
      } else {
        animation.current = null;
        useStudio.getState().endEdit();
      }
    };
    animation.current = requestAnimationFrame(step);
  };

  const onPreset = (preset: Preset) => {
    setShowing('look');
    const active = isPresetActive(values, preset);
    const target = active
      ? sanitizeValues(Object.fromEntries(Object.entries(values).filter(([id]) => !(id in preset.values))))
      : applyPresetValues(values, preset);
    animateTo(target);
  };

  const onTab = (next: CategoryId) => {
    studio.setTab(next);
    focusOn(controlsInCategory(next)[0].focus);
  };

  const onUndo = () => {
    stopAnimation();
    setShowing('look');
    studio.undo();
  };

  const onRedo = () => {
    stopAnimation();
    setShowing('look');
    studio.redo();
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const stageHeight = Math.max(320, Math.round(height * 0.47));
  const lookLabel = look?.name ?? defaultLookLabel((looks.data?.length ?? 0) + 1);
  const compareMode = holding || showing === 'original' ? 'original' : 'off';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.stage, { height: stageHeight }]}>
        <FaceView
          ref={faceRef}
          face={face}
          values={values}
          compareMode={compareMode}
          mirrored={mirrored}
          fit={1.04}
          style={StyleSheet.absoluteFill}
          onReady={() => {
            setReady(true);
            faceRef.current?.focus(STUDIO_VIEW);
          }}
        />

        <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topRow}>
            <IconButton icon="chevron-back" label="뒤로" tone="plainDark" size={40} onPress={goBack} />
            <Segmented<Showing>
              tone="dark"
              options={[
                { value: 'original', label: 'Original' },
                { value: 'look', label: lookLabel },
              ]}
              value={showing}
              onChange={setShowing}
            />
            <Pressable onPress={saver.open} style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]} testID="open-save">
              <Text style={styles.saveText}>저장</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        <View style={styles.history} pointerEvents="box-none">
          <IconButton icon="arrow-undo-outline" label="실행 취소" tone="dark" size={46} disabled={!past.length} onPress={onUndo} />
          <IconButton icon="arrow-redo-outline" label="다시 실행" tone="dark" size={46} disabled={!future.length} onPress={onRedo} />
        </View>

        {isDemo && (
          <Pressable onPress={() => router.push('/scan')} style={styles.demo} testID="demo-scan">
            <Text style={styles.demoText}>샘플 얼굴</Text>
            <View style={styles.demoDivider} />
            <Text style={styles.demoText}>내 얼굴 스캔</Text>
            <Ionicons name="chevron-forward" size={13} color="#FFFFFF" />
          </Pressable>
        )}

        <Pressable
          onPressIn={() => setHolding(true)}
          onPressOut={() => setHolding(false)}
          style={[styles.hold, holding && styles.holdOn]}
          accessibilityLabel="누르고 있는 동안 원본 보기"
          testID="hold-original"
        >
          <View style={styles.holdImage}>
            {thumbs.original && <Image source={{ uri: thumbs.original }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          </View>
          <Text style={styles.holdText}>원본 보기</Text>
        </Pressable>
      </View>

      <View style={styles.sheet}>
        <UnderlineTabs
          stretch
          tabs={CATEGORIES.map((c) => ({ value: c.id, label: c.label, dot: categoryChanged(values, c.id), testID: `tab-${c.id}` }))}
          value={tab}
          onChange={onTab}
        />
        <ScrollView style={styles.flex} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>{categoryLabel(tab)}</Text>
          <View style={styles.presets}>
            {presetsInCategory(tab).map((p) => (
              <PresetTile
                key={p.id}
                label={p.name}
                image={thumbs[p.id]}
                selected={isPresetActive(values, p)}
                onPress={() => onPreset(p)}
                testID={`preset-${p.id}`}
                style={{ width: tileWidth }}
              />
            ))}
          </View>
          <View style={styles.sliders}>
            {controlsInCategory(tab).map((c) => (
              <ValueSlider
                key={c.id}
                label={c.short}
                value={values[c.id] ?? 0}
                min={c.min}
                max={c.max}
                onStart={() => {
                  stopAnimation();
                  setShowing('look');
                  studio.beginEdit();
                  focusOn(c.focus);
                }}
                onEnd={() => studio.endEdit()}
                onChange={(v) => studio.setValue(c.id, v)}
                testID={`slider-${c.id}`}
              />
            ))}
          </View>
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <Button
            title="초기화"
            variant="soft"
            disabled={!categoryChanged(values, tab)}
            onPress={() => {
              stopAnimation();
              studio.resetCategory(tab);
            }}
            style={styles.flex}
            testID="reset-category"
          />
          <Button title="적용하기" onPress={() => router.push('/compare')} style={styles.apply} testID="compare-go" />
        </SafeAreaView>
      </View>

      {saver.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  stage: { backgroundColor: colors.stage },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 6 },
  save: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  history: { position: 'absolute', left: 16, bottom: 44, gap: 14 },
  demo: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(18,18,18,0.6)',
  },
  demoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  demoDivider: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.35)' },
  hold: {
    position: 'absolute',
    right: 12,
    bottom: 32,
    padding: 5,
    paddingBottom: 6,
    gap: 4,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(18,18,18,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  holdOn: { borderColor: '#FFFFFF' },
  holdImage: { width: 60, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.stageRaised },
  holdText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  sheet: {
    flex: 1,
    marginTop: -20,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 6,
    overflow: 'hidden',
  },
  sheetContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  presets: { flexDirection: 'row', justifyContent: 'space-between' },
  sliders: { gap: 2, marginTop: 2 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  apply: { flex: 1.1 },
});
