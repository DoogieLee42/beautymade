import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { Button, IconButton, Screen } from '../../components/ui';
import { useCapture } from '../../state/capture';
import { useSession } from '../../state/session';
import { colors, radius } from '../../theme';

const ANGLES = [
  { label: '정면', turn: 0 },
  { label: '왼쪽', turn: -1 },
  { label: '오른쪽', turn: 1 },
] as const;

/** Step 4 of the flow: what the scan is and why three photos. */
export default function ScanIntro() {
  const setSkipped = useSession((s) => s.setSkippedScan);
  const reset = useCapture((s) => s.reset);

  return (
    <Screen
      dark
      contentStyle={styles.content}
      footer={
        <>
          <Button
            title="스캔 시작하기"
            onPress={() => {
              reset();
              router.push('/scan/guide');
            }}
            testID="scan-start"
          />
          <Button
            title="나중에 할게요 · 샘플 얼굴로 둘러보기"
            variant="subtle"
            size="md"
            onPress={() => {
              setSkipped(true);
              router.replace('/(tabs)');
            }}
          />
        </>
      }
    >
      <StatusBar style="light" />
      <View style={styles.top}>
        <IconButton
          icon="close"
          label="닫기"
          tone="dark"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
      </View>

      <View style={styles.hero}>
        {ANGLES.map((a, i) => (
          <View key={a.label} style={[styles.angle, i === 0 && styles.angleMain]}>
            <HeadGlyph turn={a.turn} size={i === 0 ? 78 : 58} />
            <Text style={styles.angleLabel}>{a.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.title}>내 얼굴을{'\n'}3D로 만들어볼까요?</Text>
      <Text style={styles.body}>정면, 왼쪽, 오른쪽 사진 3장이면 돼요.{'\n'}30초면 충분해요.</Text>

      <View style={styles.points}>
        <Point icon="scan-outline" text="얼굴 특징점 478개로 입체 형태를 복원해요" />
        <Point icon="color-palette-outline" text="3장의 사진을 합쳐 실제 피부 질감을 입혀요" />
        <Point icon="lock-closed-outline" text="사진은 3D 생성에만 쓰이고, 언제든 삭제할 수 있어요" />
      </View>
    </Screen>
  );
}

function Point({ icon, text }: { icon: 'scan-outline' | 'color-palette-outline' | 'lock-closed-outline'; text: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

/** Minimal head outline, optionally turned left (-1) or right (1). */
export function HeadGlyph({ turn, size }: { turn: -1 | 0 | 1; size: number }) {
  const nose = 50 + turn * 13;
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
      <Ellipse cx={50 + turn * 3} cy={58} rx={turn ? 31 : 34} ry={44} stroke={colors.stageText} strokeWidth={3} fill="none" opacity={0.9} />
      <Path d={`M ${nose} 50 L ${nose + turn * 6} 70 L ${nose - turn} 74`} stroke={colors.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={`M ${38 + turn * 9} 46 h 8 M ${56 + turn * 9} 46 h 8`} stroke={colors.stageText} strokeWidth={3} strokeLinecap="round" />
      <Path d={`M ${42 + turn * 8} 88 q 8 5 16 0`} stroke={colors.stageText} strokeWidth={3} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4 },
  top: { alignItems: 'flex-end' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 14, marginTop: 8, marginBottom: 30 },
  angle: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.stageRaised,
    borderWidth: 1,
    borderColor: colors.stageLine,
  },
  angleMain: { borderColor: 'rgba(255,122,160,0.5)' },
  angleLabel: { color: colors.stageMuted, fontSize: 12, fontWeight: '700' },
  title: { color: colors.stageText, fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.stageMuted, fontSize: 16, lineHeight: 24, marginTop: 10 },
  points: { gap: 14, marginTop: 28 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,122,160,0.12)',
  },
  pointText: { flex: 1, color: colors.stageText, fontSize: 14, lineHeight: 20 },
});
