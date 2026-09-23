import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CATEGORIES,
  CONTROL_BY_ID,
  FACE_ENGINE_VERSION,
  PRESETS,
  applyPreset as applyPresetValues,
  controlsInCategory,
  interpolateValues,
  isPresetActive,
  sanitizeValues,
  suggestLookName,
  summarizeChanges,
  type CameraFocus,
  type CategoryId,
  type ControlId,
  type ControlValues,
  type Preset,
} from '@beautymade/face-engine';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApi } from '../../api';
import { SaveLookSheet } from '../../components/studio/SaveLookSheet';
import { PresetCard } from '../../components/studio/PresetCard';
import { Chip, IconButton, ValueSlider, toast } from '../../components/ui';
import { errorMessage, useCreateLook, useStudioFace, useUpdateLook } from '../../hooks/queries';
import { useSession } from '../../state/session';
import { isDirty, useStudio, type StudioTab } from '../../state/studio';
import { colors, radius } from '../../theme';
import { FaceView, type FaceViewHandle } from '../../three/FaceView';

const ANGLES: { label: string; focus: Partial<CameraFocus> }[] = [
  { label: '정면', focus: { yaw: 0, pitch: 0, zoom: 1 } },
  { label: '45°', focus: { yaw: 45, pitch: 0, zoom: 1 } },
  { label: '측면', focus: { yaw: 85, pitch: 0, zoom: 1 } },
];

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'presets', label: '추천' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

function categoryChanged(values: ControlValues, category: CategoryId) {
  return controlsInCategory(category).some((c) => (values[c.id] ?? 0) !== 0);
}

/** Steps 9-13: the Face Studio. */
export default function Studio() {
  const { height } = useWindowDimensions();
  const { face, isDemo } = useStudioFace();
  const faceRef = useRef<FaceViewHandle>(null);
  const animation = useRef<number | null>(null);
  const studio = useStudio();
  const { values, baseline, look, presetId, tab, autoFocus, mirrored } = studio;
  const apiMode = useSession((s) => s.apiMode);
  const [split, setSplit] = useState(false);
  const [holding, setHolding] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const createLook = useCreateLook();
  const updateLook = useUpdateLook();

  // A look saved on an older scan can't be edited on a new face.
  useEffect(() => {
    if (face && look && look.faceModelId !== face.id && !face.isDemo) useStudio.getState().startFresh();
  }, [face, look]);

  useEffect(() => () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
  }, []);

  const focusOn = (focus: Partial<CameraFocus>) => {
    if (useStudio.getState().autoFocus) faceRef.current?.focus(focus);
  };

  /** Smoothly moves every slider to the target (presets feel like a transformation). */
  const animateTo = (target: ControlValues, nextPresetId: string | null) => {
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    const from = useStudio.getState().values;
    const start = Date.now();
    const duration = 520;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      studio.setValues(k >= 1 ? sanitizeValues(target) : interpolateValues(from, target, e), nextPresetId);
      animation.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    animation.current = requestAnimationFrame(step);
  };

  const onPreset = (preset: Preset) => {
    const active = isPresetActive(values, preset);
    const target = active
      ? sanitizeValues(Object.fromEntries(Object.entries(values).filter(([id]) => !(id in preset.values))))
      : applyPresetValues(values, preset);
    animateTo(target, active ? null : preset.id);
    const [mainId] = (Object.entries(preset.values) as [ControlId, number][]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    const f = CONTROL_BY_ID[mainId].focus;
    focusOn({ ...f, zoom: Math.min(f.zoom, 1.15) });
  };

  const onTab = (next: StudioTab) => {
    studio.setTab(next);
    if (next === 'presets') focusOn({ yaw: 0, pitch: 0, zoom: 1 });
    else focusOn(controlsInCategory(next)[0].focus);
  };

  const dirty = isDirty(values, baseline);
  const changeCount = summarizeChanges(values).length;

  const openSave = () => {
    if (!face) return;
    if (face.isDemo && apiMode === 'remote') {
      toast('샘플 얼굴은 저장할 수 없어요. 내 얼굴을 스캔해보세요.', {
        action: { label: '스캔하기', onPress: () => router.push('/scan') },
      });
      return;
    }
    setSaveOpen(true);
  };

  const save = async (name: string, mode: 'new' | 'update') => {
    if (!face) return;
    try {
      const thumbnail = await faceRef.current?.snapshot().catch(() => null);
      const clean = sanitizeValues(values);
      const saved =
        mode === 'update' && look
          ? await updateLook.mutateAsync({ id: look.id, patch: { name, values: clean, presetId, thumbnail } })
          : await createLook.mutateAsync({
              name,
              faceModelId: face.id,
              values: clean,
              presetId,
              engineVersion: FACE_ENGINE_VERSION,
              thumbnail,
            });
      studio.markSaved(saved);
      setSaveOpen(false);
      toast(mode === 'update' ? '룩을 업데이트했어요' : '룩을 저장했어요', {
        action: { label: '보기', onPress: () => router.push({ pathname: '/look/[id]', params: { id: saved.id } }) },
      });
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    }
  };

  const stageHeight = Math.max(300, Math.round(height * 0.5));
  const compareMode = holding ? 'original' : split ? 'split' : 'off';

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
          fit={1.5}
          compareLabelsTop={72}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView edges={['top']} style={styles.stageTop} pointerEvents="box-none">
          <View style={styles.stageTitle} pointerEvents="none">
            <Text style={styles.title}>Face Studio</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {look ? `편집 중 · ${look.name}` : isDemo ? '샘플 얼굴로 체험 중' : '내 3D 얼굴'}
            </Text>
          </View>
          <View style={styles.stageActions}>
            <IconButton icon="swap-horizontal" label="거울 모드" tone="dark" active={mirrored} onPress={studio.toggleMirrored} />
            <IconButton icon="git-compare-outline" label="원본과 나눠 보기" tone="dark" active={split} onPress={() => setSplit((s) => !s)} />
            <Pressable onPress={openSave} style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]} testID="open-save">
              <Ionicons name="bookmark" size={15} color="#fff" />
              <Text style={styles.saveText}>저장</Text>
            </Pressable>
          </View>
        </SafeAreaView>

        <View style={styles.stageBottom} pointerEvents="box-none">
          <View style={styles.angles}>
            {ANGLES.map((a) => (
              <Pressable key={a.label} onPress={() => faceRef.current?.focus(a.focus)} style={styles.angle} hitSlop={4}>
                <Text style={styles.angleText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPressIn={() => setHolding(true)}
            onPressOut={() => setHolding(false)}
            style={[styles.hold, holding && styles.holdActive]}
            accessibilityLabel="누르고 있는 동안 원본 보기"
            testID="hold-original"
          >
            <Ionicons name={holding ? 'eye' : 'eye-outline'} size={16} color={holding ? colors.ink : colors.stageText} />
            <Text style={[styles.holdText, holding && { color: colors.ink }]}>{holding ? '원본' : '누르고 원본 보기'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => (
            <Chip
              key={t.id}
              label={t.label}
              selected={tab === t.id}
              dot={t.id !== 'presets' && categoryChanged(values, t.id)}
              onPress={() => onTab(t.id)}
            />
          ))}
        </ScrollView>

        <ScrollView style={styles.flex} contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>
          {isDemo && (
            <Pressable onPress={() => router.push('/scan')} style={styles.demoBanner}>
              <Ionicons name="scan" size={16} color={colors.primaryInk} />
              <Text style={styles.demoText}>지금은 샘플 얼굴이에요. 내 얼굴을 스캔하면 내 얼굴로 바뀌어요.</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primaryInk} />
            </Pressable>
          )}

          {tab === 'presets' ? (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>원하는 분위기부터 골라보세요</Text>
                {changeCount > 0 && (
                  <Pressable onPress={() => animateTo({}, null)} hitSlop={8}>
                    <Text style={styles.reset}>전체 초기화</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.grid}>
                {PRESETS.map((p) => (
                  <View key={p.id} style={styles.gridItem}>
                    <PresetCard preset={p} active={isPresetActive(values, p)} onPress={() => onPreset(p)} />
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{CATEGORIES.find((c) => c.id === tab)?.description}</Text>
                {categoryChanged(values, tab) && (
                  <Pressable onPress={() => studio.resetCategory(tab)} hitSlop={8}>
                    <Text style={styles.reset}>초기화</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.sliders}>
                {controlsInCategory(tab).map((c) => (
                  <ValueSlider
                    key={c.id}
                    label={c.label}
                    value={values[c.id] ?? 0}
                    min={c.min}
                    max={c.max}
                    minLabel={c.minLabel}
                    maxLabel={c.maxLabel}
                    onStart={() => focusOn(c.focus)}
                    onChange={(v) => studio.setValue(c.id, v)}
                    testID={`slider-${c.id}`}
                  />
                ))}
              </View>
            </>
          )}

          <View style={styles.footerRow}>
            <Pressable onPress={studio.toggleAutoFocus} style={styles.toggle} hitSlop={6}>
              <Ionicons name={autoFocus ? 'checkbox' : 'square-outline'} size={18} color={autoFocus ? colors.primary : colors.muted} />
              <Text style={styles.toggleText}>조절하는 부위로 카메라 자동 이동</Text>
            </Pressable>
            {dirty && changeCount > 0 && <Text style={styles.count}>변경 {changeCount}개</Text>}
          </View>
        </ScrollView>
      </View>

      <SaveLookSheet
        visible={saveOpen}
        values={values}
        suggestedName={suggestLookName(values)}
        editingName={look?.name}
        saving={createLook.isPending || updateLook.isPending}
        onSave={save}
        onClose={() => setSaveOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  stage: { backgroundColor: colors.stage },
  stageTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16 },
  stageTitle: { paddingTop: 10, flexShrink: 1 },
  title: { color: colors.stageText, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: colors.stageMuted, fontSize: 12, marginTop: 2 },
  stageActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  stageBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  angles: { flexDirection: 'row', backgroundColor: 'rgba(20,16,18,0.6)', borderRadius: radius.pill, padding: 3 },
  angle: { paddingHorizontal: 11, height: 30, justifyContent: 'center', borderRadius: radius.pill },
  angleText: { color: colors.stageText, fontSize: 12, fontWeight: '700' },
  hold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,16,18,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  holdActive: { backgroundColor: '#fff' },
  holdText: { color: colors.stageText, fontSize: 12, fontWeight: '700' },
  panel: {
    flex: 1,
    marginTop: -18,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 14,
  },
  tabs: { paddingHorizontal: 16, gap: 8 },
  noGrow: { flexGrow: 0 },
  panelContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, gap: 14 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  demoText: { flex: 1, fontSize: 13, color: colors.primaryInk, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  reset: { fontSize: 13, fontWeight: '700', color: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridItem: { width: '50%', padding: 5 },
  sliders: { gap: 18 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleText: { fontSize: 12, color: colors.inkSoft },
  count: { fontSize: 12, fontWeight: '700', color: colors.primary },
});
