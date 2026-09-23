import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/ui';
import { useFace } from '../../hooks/queries';
import { useCapture } from '../../state/capture';
import { useSession } from '../../state/session';
import { useStudio } from '../../state/studio';
import { colors, radius } from '../../theme';
import { FaceView } from '../../three/FaceView';

const VIEW_LABEL: Record<string, string> = { front: '정면', left: '왼쪽', right: '오른쪽' };

/** Step 8: generation complete, the "that's really me" moment. */
export default function Complete() {
  const { faceId } = useLocalSearchParams<{ faceId: string }>();
  const face = useFace(faceId);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState(false);
  const mirrored = useStudio((s) => s.mirrored);

  const used = face.data?.quality?.viewsUsed ?? [];

  const openStudio = () => {
    useCapture.getState().reset();
    useSession.getState().setSkippedScan(false);
    useStudio.getState().startFresh();
    useStudio.getState().setTab('presets');
    router.replace('/(tabs)/studio');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.stage} onTouchStart={() => setTouched(true)}>
        <FaceView face={face.data ?? null} reveal turntable={!touched} mirrored={mirrored} style={StyleSheet.absoluteFill} onReady={() => setReady(true)} />
        <SafeAreaView edges={['top']} style={styles.header} pointerEvents="none">
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <Text style={styles.badgeText}>내 3D 얼굴</Text>
          </View>
        </SafeAreaView>
        {ready && !touched && (
          <Animated.View entering={FadeInDown.delay(2200).duration(400)} style={styles.hint} pointerEvents="none">
            <Ionicons name="hand-left-outline" size={16} color={colors.stageText} />
            <Text style={styles.hintText}>손가락으로 돌려보세요</Text>
          </Animated.View>
        )}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <Text style={styles.title}>완성됐어요!</Text>
          <Text style={styles.body}>진짜 내 얼굴인지 이리저리 돌려보세요.{'\n'}이제 원하는 부위를 살짝씩 바꿔볼 수 있어요.</Text>
          {used.length > 0 && (
            <View style={styles.meta}>
              {used.map((v) => (
                <View key={v} style={styles.metaChip}>
                  <Ionicons name="checkmark" size={12} color={colors.accent} />
                  <Text style={styles.metaText}>{VIEW_LABEL[v] ?? v}</Text>
                </View>
              ))}
              <Text style={styles.metaCaption}>사진으로 만들었어요</Text>
            </View>
          )}
        </Animated.View>
        <View style={styles.actions}>
          <Button title="Face Studio 시작하기" iconRight="arrow-forward" onPress={openStudio} testID="open-studio" />
          <Button title="다시 스캔하기" variant="subtle" size="md" onPress={() => router.replace('/scan/guide')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.stage },
  stage: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: { color: colors.stageText, fontSize: 13, fontWeight: '700' },
  hint: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,16,18,0.6)',
  },
  hintText: { color: colors.stageText, fontSize: 13, fontWeight: '600' },
  panel: { paddingHorizontal: 20, paddingTop: 20, backgroundColor: colors.stage },
  title: { color: colors.stageText, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.stageMuted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 14 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,122,160,0.12)',
  },
  metaText: { color: colors.stageText, fontSize: 12, fontWeight: '700' },
  metaCaption: { color: colors.stageMuted, fontSize: 12 },
  actions: { marginTop: 20, gap: 4, paddingBottom: 8 },
});
