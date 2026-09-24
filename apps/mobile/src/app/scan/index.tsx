import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Header, TextLink } from '../../components/ui';
import { useCurrentFace } from '../../hooks/queries';
import { useCapture } from '../../state/capture';
import { useSession } from '../../state/session';
import { colors, radius } from '../../theme';
import { FaceView, type FaceViewHandle } from '../../three/FaceView';
import { DEMO_FACE } from '../../three/demoFace';
import { useFaceThumbnails } from '../../three/thumbnails';

const EXAMPLES = [
  { key: 'front', label: '정면', yaw: 0 },
  { key: 'left', label: '왼쪽 45도', yaw: -45 },
  { key: 'right', label: '오른쪽 45도', yaw: 45 },
] as const;

const TIPS: { icon: ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'bulb-outline', text: '밝은 조명에서 촬영해주세요' },
  { icon: 'scan-outline', text: '얼굴이 잘 보이게 해주세요' },
  { icon: 'glasses-outline', text: '안경은 벗어주세요' },
  { icon: 'happy-outline', text: '자연스러운 표정을 유지해주세요' },
];

const AVOID = ['역광이나 강한 그림자', '모자, 마스크, 앞머리로 가려진 얼굴', '흔들리거나 초점이 나간 사진', '너무 멀리서 찍은 사진'];

/** Steps 4-5: scan start + capture guide. */
export default function ScanGuide() {
  const hidden = useRef<FaceViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const setSkipped = useSession((s) => s.setSkippedScan);
  const reset = useCapture((s) => s.reset);
  const current = useCurrentFace();
  const face = current.data ?? DEMO_FACE;

  const thumbs = useFaceThumbnails(
    hidden,
    face.id,
    ready,
    Object.fromEntries(
      EXAMPLES.map((e) => [e.key, { values: {}, focus: { yaw: e.yaw, zoom: 1.02 }, width: 120, height: 150, theme: 'light' as const }]),
    ),
  );

  const skip = () => {
    setSkipped(true);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <StatusBar style="dark" />
      <FaceView ref={hidden} face={face} theme="light" interactive={false} quietLoading style={styles.hidden} onReady={() => setReady(true)} />
      <Header
        onBack={() => (router.canGoBack() ? router.back() : skip())}
        right={
          <Pressable onPress={skip} hitSlop={10}>
            <Text style={styles.later}>나중에</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>3장의 사진으로{'\n'}내 얼굴을 3D로 만들어요</Text>
        <Text style={styles.subtitle}>정면, 왼쪽, 오른쪽 각도에서 촬영하면{'\n'}더 정확한 3D 얼굴을 생성할 수 있어요.</Text>

        <View style={styles.examples}>
          {EXAMPLES.map((e) => (
            <View key={e.key} style={styles.example}>
              <View style={styles.exampleImage}>
                {thumbs[e.key] ? (
                  <Image source={{ uri: thumbs[e.key] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                ) : (
                  <ActivityIndicator color={colors.muted} />
                )}
              </View>
              <Text style={styles.exampleLabel}>{e.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>더 좋은 결과를 위해</Text>
          {TIPS.map((t) => (
            <View key={t.text} style={styles.tip}>
              <Ionicons name={t.icon} size={20} color={colors.inkSoft} />
              <Text style={styles.tipText}>{t.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="촬영 시작하기"
          onPress={() => {
            reset();
            router.push('/scan/capture');
          }}
          testID="scan-start"
        />
        <TextLink title="예시 보기" onPress={() => setExamplesOpen(true)} />
      </View>

      <Modal visible={examplesOpen} transparent animationType="slide" onRequestClose={() => setExamplesOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setExamplesOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>이렇게 찍어주세요</Text>
          <View style={styles.examples}>
            {EXAMPLES.map((e) => (
              <View key={e.key} style={styles.example}>
                <View style={[styles.exampleImage, styles.good]}>
                  {thumbs[e.key] && <Image source={{ uri: thumbs[e.key] }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  <View style={styles.badge}>
                    <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={styles.exampleLabel}>{e.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.avoidTitle}>이런 사진은 피해주세요</Text>
          {AVOID.map((a) => (
            <View key={a} style={styles.tip}>
              <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
              <Text style={styles.tipText}>{a}</Text>
            </View>
          ))}
          <Button title="확인" onPress={() => setExamplesOpen(false)} style={{ marginTop: 18 }} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hidden: { position: 'absolute', width: 4, height: 4, opacity: 0, top: 0, left: 0 },
  later: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  title: { fontSize: 25, lineHeight: 34, fontWeight: '700', color: colors.ink, textAlign: 'center', letterSpacing: -0.6, marginTop: 10 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center', marginTop: 10 },
  examples: { flexDirection: 'row', gap: 8, marginTop: 26 },
  example: { flex: 1, alignItems: 'center', gap: 10 },
  exampleImage: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  tips: { marginTop: 26, backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, padding: 18, gap: 14 },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 2 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipText: { fontSize: 14, color: colors.inkSoft },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6, gap: 8 },
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
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  good: { borderWidth: 2, borderColor: colors.success },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avoidTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 10 },
});
