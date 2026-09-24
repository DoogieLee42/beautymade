import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApi, type Scan } from '../../api';
import { Button } from '../../components/ui';
import { errorMessage } from '../../hooks/queries';
import { useCapture } from '../../state/capture';
import { colors } from '../../theme';
import { FaceView } from '../../three/FaceView';
import { DEMO_FACE } from '../../three/demoFace';

const STAGES = [
  { key: 'analyzing', until: 0.3, title: '사진을 분석하고 있어요' },
  { key: 'shaping', until: 0.5, title: '얼굴 구조를 생성하고 있어요' },
  { key: 'texturing', until: 0.85, title: '피부 텍스처를 준비하고 있어요' },
  { key: 'finishing', until: 1, title: '미리보기를 생성하고 있어요' },
];

/** Minimum time the sequence is shown, so a fast server still feels like real work. */
const MIN_MS = 7000;

/** Step 7: 3D face generation wait. */
export default function Generating() {
  const { scanId } = useCapture();
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
    const tick = setInterval(() => setNow(Date.now()), 120);
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

  if (!scanId) return <Redirect href="/scan" />;

  if (failed) {
    return (
      <SafeAreaView style={[styles.root, styles.failRoot]}>
        <StatusBar style="light" />
        <View style={styles.failBody}>
          <View style={styles.failIcon}>
            <Ionicons name="alert" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>3D 얼굴을 만들지 못했어요</Text>
          <Text style={styles.subtitle}>{scan?.error?.message ?? '사진을 다시 찍어주세요.'}</Text>
        </View>
        <View style={styles.failActions}>
          <Button title="다시 촬영하기" variant="white" onPress={() => router.replace('/scan/capture')} />
          <Button title="나중에 할게요" variant="subtle" size="md" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  const activeIndex = STAGES.findIndex((s) => progress < s.until);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>당신만의 3D 얼굴을{'\n'}만들고 있어요</Text>
        <Text style={styles.subtitle}>조금만 기다려주세요.</Text>
      </View>

      <FaceView face={DEMO_FACE} renderStyle="wireframe" turntable interactive={false} fit={1.55} quietLoading style={styles.wire} />

      <Animated.View entering={FadeIn.duration(600)} style={styles.steps}>
        {STAGES.map((s, i) => {
          const state = activeIndex === -1 || i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
          return (
            <View key={s.key} style={styles.step}>
              <View style={[styles.stepIcon, state === 'done' && styles.stepIconDone]}>
                {state === 'done' ? (
                  <Ionicons name="checkmark" size={16} color={colors.ink} />
                ) : state === 'active' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ transform: [{ scale: 0.7 }] }} />
                ) : null}
              </View>
              <Text style={[styles.stepText, state === 'todo' && styles.stepTodo]}>{s.title}</Text>
            </View>
          );
        })}
      </Animated.View>

      <Text style={styles.eta}>{pollError ? `${pollError} 다시 연결하는 중...` : `예상 시간: 10~20초 · ${Math.round(progress * 100)}%`}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  header: { alignItems: 'center', paddingTop: 36, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 24, lineHeight: 33, fontWeight: '700', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 15, textAlign: 'center' },
  wire: { flex: 1, backgroundColor: '#050505', marginVertical: 8 },
  steps: { alignSelf: 'center', gap: 16, paddingHorizontal: 32, marginBottom: 26 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  stepText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  stepTodo: { color: 'rgba(255,255,255,0.55)' },
  eta: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 18 },
  failRoot: { justifyContent: 'space-between' },
  failBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  failIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2A2A2C', alignItems: 'center', justifyContent: 'center' },
  failActions: { paddingHorizontal: 20, paddingBottom: 12, gap: 6 },
});
