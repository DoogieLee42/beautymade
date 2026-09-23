import { PRESET_BY_ID, applyPreset, interpolateValues, type ControlValues } from '@beautymade/face-engine';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/ui';
import { useSession } from '../state/session';
import { colors } from '../theme';
import { FaceView } from '../three/FaceView';
import { DEMO_FACE } from '../three/demoFace';

const SLIDES = [
  {
    kicker: '01  SCAN',
    title: '한 번의 스캔으로\n나만의 3D 얼굴',
    body: '정면과 양옆, 사진 3장이면 충분해요. 내 얼굴 그대로 3D로 만들어 드려요.',
  },
  {
    kicker: '02  STUDIO',
    title: '살짝 바꾸면\n인상이 달라져요',
    body: '코, 턱, 입술, 윤곽, 리프팅, 피부까지. 슬라이더를 움직이는 순간 바로 보여요.',
  },
  {
    kicker: '03  LOOKS',
    title: '마음에 드는 버전은\n저장하고 비교해요',
    body: '여러 룩을 저장해 두고, 원본과 나란히 돌려보며 비교하세요.',
  },
];

const DEMO_TARGET: ControlValues = applyPreset(applyPreset({}, PRESET_BY_ID['v-line']), PRESET_BY_ID['natural-nose']);

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<ControlValues>({});
  const pager = useRef<ScrollView>(null);
  const markSeen = useSession((s) => s.markOnboardingSeen);

  // Slide 2 breathes between the original and an edited face to show live changes.
  useEffect(() => {
    if (index !== 1) {
      setValues(index === 2 ? DEMO_TARGET : {});
      return;
    }
    let frame = 0;
    let last = 0;
    const start = Date.now();
    const loop = (t: number) => {
      if (t - last > 33) {
        last = t;
        const phase = (Date.now() - start) / 1000;
        const k = 0.5 - 0.5 * Math.cos(phase * 1.6);
        setValues(interpolateValues({}, DEMO_TARGET, k));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [index]);

  const go = (i: number) => {
    pager.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  const finish = (to: '/auth/signup' | '/auth/login') => {
    markSeen();
    router.replace(to);
  };

  const last = index === SLIDES.length - 1;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <FaceView
        face={DEMO_FACE}
        values={values}
        compareMode={index === 2 ? 'split' : 'off'}
        turntable
        reveal
        compareLabelsTop={64}
        style={styles.stage}
      />
      <SafeAreaView edges={['top']} style={styles.brandWrap} pointerEvents="none">
        <Text style={styles.brand}>BeautyMade</Text>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          scrollEventThrottle={16}
        >
          {SLIDES.map((slide) => (
            <View key={slide.kicker} style={[styles.slide, { width }]}>
              <Text style={styles.kicker}>{slide.kicker}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.kicker} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.actions}>
          <Button
            title={last ? '시작하기' : '다음'}
            iconRight={last ? 'arrow-forward' : undefined}
            onPress={() => (last ? finish('/auth/signup') : go(index + 1))}
            testID="onboarding-next"
          />
          <Button title="이미 계정이 있어요 · 로그인" variant="subtle" size="md" onPress={() => finish('/auth/login')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.stage },
  stage: { flex: 1.15 },
  brandWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 8 },
  brand: { color: colors.stageText, fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginTop: 8 },
  panel: { backgroundColor: colors.stage, paddingTop: 8 },
  slide: { paddingHorizontal: 24, paddingTop: 12, gap: 10 },
  kicker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.stageText, fontSize: 28, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.stageMuted, fontSize: 15, lineHeight: 22 },
  dots: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, marginTop: 18 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 20, backgroundColor: colors.stageText },
  actions: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, gap: 4 },
});
