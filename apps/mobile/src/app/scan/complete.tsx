import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CaptureView } from '../../api/types';
import { Button, Header, TextLink } from '../../components/ui';
import { useFace } from '../../hooks/queries';
import { useCapture } from '../../state/capture';
import { useSession } from '../../state/session';
import { useStudio } from '../../state/studio';
import { colors, radius } from '../../theme';
import { FaceView, type FaceViewHandle } from '../../three/FaceView';
import { useFaceThumbnails } from '../../three/thumbnails';

/** Camera yaw that shows the same side of the face as each capture angle. */
const ANGLES: { view: CaptureView; yaw: number }[] = [
  { view: 'front', yaw: 0 },
  { view: 'left', yaw: -45 },
  { view: 'right', yaw: 45 },
];

/** Step 8: the first reveal ("that's really me"). */
export default function Complete() {
  const { faceId } = useLocalSearchParams<{ faceId: string }>();
  const face = useFace(faceId);
  const view = useRef<FaceViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);
  const [angle, setAngle] = useState<CaptureView>('front');
  const shots = useCapture((s) => s.shots);
  const mirrored = useStudio((s) => s.mirrored);

  const rendered = useFaceThumbnails(
    view,
    face.data?.id ?? null,
    ready,
    Object.fromEntries(ANGLES.map((a) => [a.view, { values: {}, focus: { yaw: a.yaw, zoom: 1.05 }, width: 84, height: 84 }])),
    mirrored,
  );

  const openStudio = () => {
    useCapture.getState().reset();
    useSession.getState().setSkippedScan(false);
    useStudio.getState().startFresh();
    router.replace('/(tabs)');
    router.push('/studio');
  };

  const pick = (a: (typeof ANGLES)[number]) => {
    setTouched(true);
    setAngle(a.view);
    view.current?.focus({ yaw: a.yaw, zoom: 1 });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']}>
        <Header tone="dark" onBack={openStudio} />
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.titles}>
          <Text style={styles.title}>내 얼굴이 준비되었어요!</Text>
          <Text style={styles.subtitle}>드래그해서 얼굴을 둘러보세요.</Text>
        </Animated.View>
      </SafeAreaView>

      <FaceView
        ref={view}
        face={face.data ?? null}
        reveal
        turntable={!touched}
        mirrored={mirrored}
        fit={1.12}
        style={styles.stage}
        onReady={() => setReady(true)}
        onInteract={() => setTouched(true)}
      />

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <View style={styles.angles}>
          {ANGLES.map((a) => {
            const photo = shots[a.view]?.local.uri;
            const uri = photo ?? rendered[a.view];
            return (
              <Pressable key={a.view} onPress={() => pick(a)} style={[styles.angle, angle === a.view && styles.angleOn]}>
                {uri ? <Image source={{ uri }} style={styles.angleImage} contentFit="cover" /> : <View style={styles.angleImage} />}
              </Pressable>
            );
          })}
        </View>
        <Button title="시뮬레이션 시작하기" variant="white" onPress={openStudio} testID="open-studio" />
        <TextLink title="다시 스캔하기" tone="dark" onPress={() => router.replace('/scan')} style={{ marginTop: 6 }} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#161617' },
  titles: { alignItems: 'center', gap: 8, marginTop: 2 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  stage: { flex: 1, backgroundColor: '#161617' },
  bottom: { paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  angles: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(52,52,55,0.7)',
  },
  angle: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  angleOn: { borderColor: '#FFFFFF' },
  angleImage: { width: '100%', height: '100%', backgroundColor: colors.stageRaised },
});
