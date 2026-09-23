import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { getApi, type Scan } from '../../api';
import { Button, Screen } from '../../components/ui';
import { errorMessage } from '../../hooks/queries';
import { useCapture } from '../../state/capture';
import { colors, radius } from '../../theme';

const STAGES = [
  { key: 'analyzing', until: 0.3, title: '얼굴 특징점 478개 분석', detail: '눈, 코, 입, 윤곽의 위치를 찾고 있어요' },
  { key: 'shaping', until: 0.5, title: '3장의 사진으로 입체 복원', detail: '정면과 양옆을 맞춰 얼굴 깊이를 계산해요' },
  { key: 'texturing', until: 0.85, title: '피부 텍스처 합성', detail: '사진 3장을 이어 붙여 실제 피부 질감을 입혀요' },
  { key: 'finishing', until: 1, title: '마무리', detail: '스튜디오에서 바로 쓸 수 있게 준비하고 있어요' },
];

/** Minimum time the sequence is shown, so a fast server still feels like real work. */
const MIN_MS = 6500;
const RING = 184;

/** Step 7: 3D face generation wait. */
export default function Generating() {
  const { scanId, shots } = useCapture();
  const [scan, setScan] = useState<Scan | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pollError, setPollError] = useState<string | null>(null);
  const started = useRef(Date.now());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!scanId) return;
    let alive = true;
    const poll = async () => {
      try {
        const next = await getApi().getScan(scanId);
        if (alive) {
          setScan(next);
          setPollError(null);
        }
      } catch (e) {
        if (alive) setPollError(errorMessage(e));
      }
    };
    poll();
    const id = setInterval(poll, 700);
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [scanId]);

  const serverProgress = scan?.status === 'completed' ? 1 : (scan?.progress ?? 0);
  const timeProgress = Math.min(1, (now - started.current) / MIN_MS);
  const progress = Math.min(serverProgress, timeProgress);
  const failed = scan?.status === 'failed';

  useEffect(() => {
    if (scan?.status === 'completed' && progress >= 1 && scan.faceModelId) {
      queryClient.invalidateQueries({ queryKey: ['face'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace({ pathname: '/scan/complete', params: { faceId: scan.faceModelId } });
    }
  }, [scan, progress, queryClient]);

  // Scanning line sweeping over the photo, and a slowly spinning ring.
  const sweep = useSharedValue(0);
  const spin = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [sweep, spin]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * (RING - 24) }] }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  if (!scanId) return <Redirect href="/scan" />;

  if (failed) {
    return (
      <Screen
        dark
        contentStyle={styles.center}
        footer={
          <>
            <Button title="다시 촬영하기" icon="camera" onPress={() => router.replace('/scan/capture')} />
            <Button title="나중에 할게요" variant="subtle" size="md" onPress={() => router.replace('/(tabs)')} />
          </>
        }
      >
        <StatusBar style="light" />
        <View style={styles.failIcon}>
          <Ionicons name="alert" size={34} color="#FF8A8A" />
        </View>
        <Text style={styles.title}>3D 얼굴을 만들지 못했어요</Text>
        <Text style={styles.body}>{scan?.error?.message ?? '사진을 다시 찍어주세요.'}</Text>
      </Screen>
    );
  }

  const photo = shots.front?.local.uri;
  const activeIndex = STAGES.findIndex((s) => progress < s.until);

  return (
    <Screen dark contentStyle={styles.content}>
      <StatusBar style="light" />
      <Text style={styles.kicker}>3D 얼굴 생성 중</Text>

      <View style={styles.visual}>
        <Animated.View style={[styles.ring, spinStyle]} />
        <View style={styles.photoWrap}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, { backgroundColor: colors.stageRaised }]} />
          )}
          <View style={styles.tint} />
          <Animated.View style={[styles.sweep, sweepStyle]} />
        </View>
      </View>

      <Text style={styles.percent}>{Math.round(progress * 100)}%</Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.max(progress * 100, 2)}%` }]} />
      </View>

      <View style={styles.stages}>
        {STAGES.map((s, i) => {
          const state = activeIndex === -1 || i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
          return (
            <View key={s.key} style={styles.stage}>
              <View style={[styles.stageIcon, state === 'done' && styles.stageIconDone]}>
                {state === 'done' ? (
                  <Ionicons name="checkmark" size={15} color="#fff" />
                ) : state === 'active' ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <View style={styles.stageDot} />
                )}
              </View>
              <View style={styles.stageText}>
                <Text style={[styles.stageTitle, state === 'todo' && styles.stageTodo]}>{s.title}</Text>
                {state === 'active' && <Text style={styles.stageDetail}>{s.detail}</Text>}
              </View>
            </View>
          );
        })}
      </View>
      {pollError && <Text style={styles.pollError}>{pollError} 다시 연결하는 중...</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'stretch', paddingTop: 20 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  kicker: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  visual: { alignSelf: 'center', width: RING + 36, height: RING + 36, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  ring: {
    position: 'absolute',
    width: RING + 36,
    height: RING + 36,
    borderRadius: (RING + 36) / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,122,160,0.15)',
    borderTopColor: colors.accent,
    borderRightColor: 'rgba(255,122,160,0.55)',
  },
  photoWrap: { width: RING, height: RING, borderRadius: RING / 2, overflow: 'hidden' },
  photo: { width: RING, height: RING },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,12,16,0.35)' },
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: 'rgba(255,122,160,0.35)',
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  percent: { color: colors.stageText, fontSize: 40, fontWeight: '800', textAlign: 'center', marginTop: 24, fontVariant: ['tabular-nums'] },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 10, marginHorizontal: 40, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  stages: { marginTop: 32, gap: 14, backgroundColor: colors.stageRaised, borderRadius: radius.lg, padding: 18 },
  stage: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stageIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.stageLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageIconDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  stageText: { flex: 1, gap: 2, paddingTop: 3 },
  stageTitle: { color: colors.stageText, fontSize: 15, fontWeight: '700' },
  stageTodo: { color: 'rgba(247,240,242,0.4)' },
  stageDetail: { color: colors.stageMuted, fontSize: 13 },
  pollError: { color: colors.stageMuted, fontSize: 12, textAlign: 'center', marginTop: 14 },
  failIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,107,107,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.stageText, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.stageMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
