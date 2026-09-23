import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApi, type CaptureView, type LocalPhoto } from '../../api';
import { FaceGuide, type GuideState } from '../../components/capture/FaceGuide';
import { Button, IconButton, toast } from '../../components/ui';
import { errorMessage } from '../../hooks/queries';
import { useCapture } from '../../state/capture';
import { colors, radius } from '../../theme';

const STEPS: { view: CaptureView; label: string; title: string; hint: string }[] = [
  { view: 'front', label: '정면', title: '정면을 바라봐 주세요', hint: '얼굴이 가이드 안에 꽉 차게 맞춰주세요' },
  { view: 'left', label: '왼쪽', title: '고개를 왼쪽으로 돌려주세요', hint: '30° 정도 · 코끝이 점선에 오도록' },
  { view: 'right', label: '오른쪽', title: '고개를 오른쪽으로 돌려주세요', hint: '30° 정도 · 코끝이 점선에 오도록' },
];

const MAX_SIDE = 1600;

function haptic(type: Haptics.NotificationFeedbackType) {
  if (Platform.OS !== 'web') Haptics.notificationAsync(type).catch(() => undefined);
}

/** Resizes large photos before upload (the server bounds them anyway). */
async function prepare(photo: LocalPhoto): Promise<LocalPhoto> {
  const { width = 0, height = 0 } = photo;
  if (!width || !height || Math.max(width, height) <= MAX_SIDE) return photo;
  const ctx = ImageManipulator.manipulate(photo.uri);
  ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Step 6: front / left / right capture with instant quality feedback. */
export default function Capture() {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const { scanId, shots, begin, setShot, reset } = useCapture();
  const [step, setStep] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [timerOn, setTimerOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<CaptureView[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const current = STEPS[step];
  const shot = shots[current.view];
  const busy = shot?.status === 'uploading' || countdown !== null;
  const doneViews = STEPS.filter((s) => shots[s.view]?.status === 'ok' || skipped.includes(s.view));
  const complete = shots.front?.status === 'ok' && doneViews.length === STEPS.length;

  useEffect(() => {
    if (scanId) return;
    getApi()
      .createScan()
      .then((scan) => begin(scan.id))
      .catch((e) => toast(errorMessage(e), { tone: 'error' }));
  }, [scanId, begin]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const upload = async (view: CaptureView, photo: LocalPhoto) => {
    if (!scanId) return;
    let prepared = photo;
    try {
      prepared = await prepare(photo);
    } catch {
      // Keep the original if resizing fails.
    }
    setShot(view, { local: prepared, status: 'uploading' });
    try {
      const result = await getApi().uploadPhoto(scanId, view, prepared);
      setShot(view, { local: prepared, status: result.ok ? 'ok' : 'rejected', result });
      if (result.ok) {
        haptic(Haptics.NotificationFeedbackType.Success);
        setSkipped((s) => s.filter((v) => v !== view));
        later(() => setStep((i) => (STEPS[i].view === view ? Math.min(i + 1, STEPS.length - 1) : i)), 700);
      } else {
        haptic(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e) {
      setShot(view, { local: prepared, status: 'error', error: errorMessage(e) });
    }
  };

  const takePicture = async () => {
    const view = current.view;
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.92, imageType: 'jpg', shutterSound: false });
      if (pic) await upload(view, { uri: pic.uri, width: pic.width, height: pic.height });
    } catch {
      toast('사진을 찍지 못했어요. 다시 시도해주세요.', { tone: 'error' });
    }
  };

  const onShutter = () => {
    if (busy || !scanId) return;
    if (!timerOn) return void takePicture();
    setCountdown(3);
    later(() => setCountdown(2), 1000);
    later(() => setCountdown(1), 2000);
    later(() => {
      setCountdown(null);
      takePicture();
    }, 3000);
  };

  const pickFromLibrary = async () => {
    const view = current.view;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.92 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    await upload(view, { uri: asset.uri, width: asset.width, height: asset.height });
  };

  const retake = (index: number) => {
    setStep(index);
    setShot(STEPS[index].view, undefined);
  };

  const skipView = () => {
    setSkipped((s) => [...s, current.view]);
    setShot(current.view, undefined);
    setStep((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!scanId) return;
    setSubmitting(true);
    try {
      await getApi().submitScan(scanId);
      router.replace('/scan/generating');
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const guideState: GuideState =
    shot?.status === 'uploading' ? 'busy' : shot?.status === 'ok' ? 'ok' : shot?.status === 'rejected' ? 'bad' : 'idle';
  const firstIssue = shot?.result?.issues.find((i) => i.severity === 'error') ?? shot?.result?.issues[0];

  if (!permission) return <View style={styles.root} />;

  return (
    <View style={styles.root} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <StatusBar style="light" />
      {permission.granted ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" mode="picture" />
      ) : (
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={40} color={colors.stageText} />
          <Text style={styles.permissionTitle}>카메라 권한이 필요해요</Text>
          <Text style={styles.permissionBody}>얼굴 사진 3장을 찍어 3D 얼굴을 만들어요. 사진은 3D 생성에만 사용돼요.</Text>
          <Button title="카메라 허용하기" onPress={requestPermission} style={styles.permissionButton} />
          <Button title="앨범에서 사진 선택" variant="light" size="md" onPress={pickFromLibrary} />
        </View>
      )}

      {permission.granted && <FaceGuide width={size.width} height={size.height} view={current.view} state={guideState} />}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow}>
          <IconButton
            icon="close"
            label="촬영 종료"
            tone="dark"
            onPress={() => {
              reset();
              router.back();
            }}
          />
          <View style={styles.steps}>
            {STEPS.map((s, i) => {
              const st = shots[s.view]?.status;
              const isSkipped = skipped.includes(s.view);
              return (
                <Pressable
                  key={s.view}
                  onPress={() => !busy && retake(i)}
                  style={[styles.stepPill, i === step && styles.stepPillActive]}
                  accessibilityLabel={`${s.label} 다시 찍기`}
                >
                  {st === 'ok' ? (
                    <Ionicons name="checkmark-circle" size={16} color="#4ADE9A" />
                  ) : st === 'uploading' ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : st === 'rejected' || st === 'error' ? (
                    <Ionicons name="alert-circle" size={16} color="#FF6B6B" />
                  ) : isSkipped ? (
                    <Ionicons name="remove-circle-outline" size={16} color={colors.stageMuted} />
                  ) : (
                    <Text style={styles.stepNum}>{i + 1}</Text>
                  )}
                  <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ width: 40 }} />
        </View>
        {!complete && (
          <View style={styles.instruction}>
            <Text style={styles.instructionTitle}>{current.title}</Text>
            <Text style={styles.instructionHint}>{current.hint}</Text>
          </View>
        )}
      </SafeAreaView>

      {countdown !== null && (
        <View pointerEvents="none" style={styles.countdown}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      {!complete && (
        <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
          {shot && shot.status !== 'ok' && (
            <View style={[styles.feedback, shot.status === 'uploading' ? styles.feedbackBusy : styles.feedbackBad]}>
              {shot.status === 'uploading' ? (
                <>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.feedbackText}>사진을 확인하는 중...</Text>
                </>
              ) : (
                <View style={styles.feedbackBody}>
                  <Text style={styles.feedbackText}>{shot.error ?? firstIssue?.message ?? '다시 찍어주세요.'}</Text>
                  <View style={styles.feedbackActions}>
                    <Pressable onPress={() => setShot(current.view, undefined)} hitSlop={8}>
                      <Text style={styles.feedbackAction}>다시 찍기</Text>
                    </Pressable>
                    {current.view !== 'front' && (
                      <Pressable onPress={skipView} hitSlop={8}>
                        <Text style={styles.feedbackSecondary}>이 각도 건너뛰기</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>
          )}
          {shot?.status === 'ok' && (
            <View style={[styles.feedback, styles.feedbackOk]}>
              <Ionicons name="checkmark-circle" size={20} color="#4ADE9A" />
              <Text style={styles.feedbackText}>좋아요! 다음 각도로 넘어갈게요</Text>
            </View>
          )}
          <View style={styles.controls}>
            <IconButton icon="images-outline" label="앨범에서 선택" tone="dark" size={48} onPress={pickFromLibrary} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="촬영"
              testID="shutter"
              onPress={onShutter}
              disabled={busy || !permission.granted || !scanId}
              style={({ pressed }) => [styles.shutter, (busy || !scanId) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <IconButton
              icon="timer-outline"
              label={timerOn ? '타이머 끄기' : '3초 타이머'}
              tone="dark"
              size={48}
              active={timerOn}
              onPress={() => setTimerOn((t) => !t)}
            />
          </View>
        </SafeAreaView>
      )}

      {complete && (
        <SafeAreaView edges={['bottom']} style={styles.review}>
          <Text style={styles.reviewTitle}>촬영 완료!</Text>
          <Text style={styles.reviewBody}>이 사진들로 내 3D 얼굴을 만들게요.</Text>
          <View style={styles.thumbs}>
            {STEPS.map((s, i) => {
              const sh = shots[s.view];
              return (
                <Pressable key={s.view} style={styles.thumb} onPress={() => retake(i)}>
                  {sh ? (
                    <Image source={{ uri: sh.local.uri }} style={styles.thumbImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.thumbImage, styles.thumbEmpty]}>
                      <Ionicons name="remove" size={20} color={colors.stageMuted} />
                    </View>
                  )}
                  <Text style={styles.thumbLabel}>{sh ? s.label : `${s.label} (건너뜀)`}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="3D 얼굴 만들기" icon="sparkles" onPress={submit} loading={submitting} testID="submit-scan" />
          <Text style={styles.reviewHint}>사진을 누르면 그 각도만 다시 찍을 수 있어요</Text>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  steps: { flexDirection: 'row', gap: 6 },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,16,18,0.55)',
  },
  stepPillActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  stepNum: { color: colors.stageMuted, fontSize: 12, fontWeight: '800', width: 16, textAlign: 'center' },
  stepLabel: { color: colors.stageText, fontSize: 13, fontWeight: '700' },
  stepLabelActive: { color: colors.ink },
  instruction: { alignItems: 'center', marginTop: 18, paddingHorizontal: 24 },
  instructionTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  instructionHint: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  countdown: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  countdownText: { color: '#fff', fontSize: 96, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 20 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, marginBottom: 14 },
  feedbackBusy: { backgroundColor: 'rgba(20,16,18,0.8)' },
  feedbackBad: { backgroundColor: 'rgba(60,18,24,0.9)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.5)' },
  feedbackOk: { backgroundColor: 'rgba(16,40,28,0.88)' },
  feedbackBody: { flex: 1, gap: 10 },
  feedbackText: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20, flexShrink: 1 },
  feedbackActions: { flexDirection: 'row', gap: 18 },
  feedbackAction: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  feedbackSecondary: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 12 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  permission: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: colors.stage },
  permissionTitle: { color: colors.stageText, fontSize: 20, fontWeight: '800', marginTop: 8 },
  permissionBody: { color: colors.stageMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  permissionButton: { alignSelf: 'stretch', marginTop: 12 },
  review: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.stage,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 6,
  },
  reviewTitle: { color: colors.stageText, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  reviewBody: { color: colors.stageMuted, fontSize: 14 },
  thumbs: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  thumb: { flex: 1, gap: 6, alignItems: 'center' },
  thumbImage: { width: '100%', aspectRatio: 0.78, borderRadius: radius.md, backgroundColor: colors.stageRaised },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.stageLine },
  thumbLabel: { color: colors.stageMuted, fontSize: 12, fontWeight: '700' },
  reviewHint: { color: colors.stageMuted, fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 8 },
});
