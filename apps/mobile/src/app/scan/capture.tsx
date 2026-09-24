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
  { view: 'front', label: '정면', title: '정면을 맞춰주세요', hint: '가이드를 따라 얼굴을 프레임 안에 맞춰주세요.' },
  { view: 'left', label: '왼쪽', title: '왼쪽으로 45도 돌려주세요', hint: '코끝이 점선에 오도록 천천히 돌려주세요.' },
  { view: 'right', label: '오른쪽', title: '오른쪽으로 45도 돌려주세요', hint: '코끝이 점선에 오도록 천천히 돌려주세요.' },
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
  const [flashOn, setFlashOn] = useState(false);
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
    takePicture();
  };

  // Long-press the shutter for a 3-second self-timer (handy for the side angles).
  const onShutterLong = () => {
    if (busy || !scanId) return;
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
    <View style={styles.root}>
      <StatusBar style="light" />
      {permission.granted ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" mode="picture" flash={flashOn ? 'screen' : 'off'} />
      ) : (
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={40} color={colors.stageText} />
          <Text style={styles.permissionTitle}>카메라 권한이 필요해요</Text>
          <Text style={styles.permissionBody}>얼굴 사진 3장을 찍어 3D 얼굴을 만들어요. 사진은 3D 생성에만 사용돼요.</Text>
          <Button title="카메라 허용하기" variant="white" onPress={requestPermission} style={styles.permissionButton} />
          <Button title="앨범에서 사진 선택" variant="subtle" size="md" onPress={pickFromLibrary} />
        </View>
      )}

      {permission.granted && <FaceGuide view={current.view} state={guideState} />}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.topRow}>
          <IconButton
            icon="close"
            label="촬영 종료"
            tone="plainDark"
            size={40}
            onPress={() => {
              reset();
              router.back();
            }}
          />
          <Text style={styles.counter}>
            {Math.min(step + 1, STEPS.length)} / {STEPS.length}
          </Text>
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
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.feedbackText}>사진을 확인하고 있어요</Text>
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
              <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
              <Text style={styles.feedbackText}>좋아요! 다음 각도로 넘어갈게요</Text>
            </View>
          )}
          <View style={styles.controls}>
            <Pressable onPress={pickFromLibrary} style={styles.gallery} accessibilityRole="button" accessibilityLabel="앨범에서 가져오기">
              <View style={styles.galleryIcon}>
                <Ionicons name="image-outline" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.galleryText}>앨범에서 가져오기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="촬영 (길게 누르면 3초 타이머)"
              testID="shutter"
              onPress={onShutter}
              onLongPress={onShutterLong}
              disabled={busy || !permission.granted || !scanId}
              style={({ pressed }) => [styles.shutter, (busy || !scanId) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.94 }] }]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <View style={styles.sideSlot}>
              <IconButton
                icon={flashOn ? 'flash' : 'flash-outline'}
                label={flashOn ? '플래시 끄기' : '플래시 켜기'}
                tone="dark"
                size={48}
                active={flashOn}
                onPress={() => setFlashOn((f) => !f)}
              />
            </View>
          </View>
        </SafeAreaView>
      )}

      {complete && (
        <SafeAreaView edges={['bottom']} style={styles.review}>
          <Text style={styles.reviewTitle}>촬영이 끝났어요</Text>
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
                  {sh && (
                    <View style={styles.thumbCheck}>
                      <Ionicons name="checkmark" size={12} color={colors.ink} />
                    </View>
                  )}
                  <Text style={styles.thumbLabel}>{sh ? s.label : `${s.label} (건너뜀)`}</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="3D 얼굴 만들기" variant="white" onPress={submit} loading={submitting} testID="submit-scan" />
          <Text style={styles.reviewHint}>사진을 누르면 그 각도만 다시 찍을 수 있어요</Text>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(28,28,30,0.72)', paddingBottom: 18 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4 },
  counter: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  instruction: { alignItems: 'center', marginTop: 10, paddingHorizontal: 24, gap: 6 },
  instructionTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  instructionHint: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center' },
  countdown: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  countdownText: { color: '#fff', fontSize: 96, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 20 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, marginBottom: 16 },
  feedbackBusy: { backgroundColor: 'rgba(20,20,20,0.78)' },
  feedbackBad: { backgroundColor: 'rgba(20,20,20,0.86)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.6)' },
  feedbackOk: { backgroundColor: 'rgba(20,20,20,0.78)' },
  feedbackBody: { flex: 1, gap: 10 },
  feedbackText: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20, flexShrink: 1 },
  feedbackActions: { flexDirection: 'row', gap: 18 },
  feedbackAction: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  feedbackSecondary: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 14 },
  gallery: { width: 96, alignItems: 'center', gap: 6 },
  galleryIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(40,40,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  galleryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '500' },
  sideSlot: { width: 96, alignItems: 'center' },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#FFFFFF' },
  permission: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: colors.stage },
  permissionTitle: { color: colors.stageText, fontSize: 20, fontWeight: '700', marginTop: 8 },
  permissionBody: { color: colors.stageMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  permissionButton: { alignSelf: 'stretch', marginTop: 12 },
  review: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#161616',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 6,
  },
  reviewTitle: { color: colors.stageText, fontSize: 21, fontWeight: '700', letterSpacing: -0.4 },
  reviewBody: { color: colors.stageMuted, fontSize: 14 },
  thumbs: { flexDirection: 'row', gap: 10, marginVertical: 16 },
  thumb: { flex: 1, gap: 8, alignItems: 'center' },
  thumbImage: { width: '100%', aspectRatio: 0.8, borderRadius: 10, backgroundColor: colors.stageRaised },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.stageLine },
  thumbCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLabel: { color: colors.stageMuted, fontSize: 12, fontWeight: '600' },
  reviewHint: { color: colors.stageMuted, fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 8 },
});
