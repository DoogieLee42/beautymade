import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EyeAnalysis } from '../../api/types';
import { colors, radius } from '../../theme';

const mean = (a: number, b: number) => (a + b) / 2;
const mm = (value: number) => `${value.toFixed(1)}mm`;

function tiltText(deg: number): { value: string; hint: string } {
  const rounded = Math.round(deg);
  if (Math.abs(rounded) < 2) return { value: `${rounded}°`, hint: '거의 수평' };
  return rounded > 0
    ? { value: `+${rounded}°`, hint: '바깥쪽 끝이 더 높아요' }
    : { value: `${rounded}°`, hint: '바깥쪽 끝이 더 낮아요' };
}

/**
 * Eye measurements for the studio's eye tab: the user's own, or the sample face's with an
 * invitation to scan. Without measurements (a scan from before they existed) it invites the
 * user to scan again instead.
 */
export function EyeAnalysisCard({
  eyes,
  isDemo,
  onScan,
}: {
  eyes: EyeAnalysis | null | undefined;
  isDemo: boolean;
  onScan(): void;
}) {
  if (!eyes) {
    return (
      <Pressable onPress={onScan} style={({ pressed }) => [styles.invite, pressed && { opacity: 0.85 }]} testID="eye-analysis-scan">
        <Ionicons name="scan-outline" size={20} color={colors.ink} />
        <Text style={styles.inviteText}>
          {isDemo ? '내 얼굴을 스캔하면 ' : '다시 스캔하면 '}
          <Text style={styles.inviteStrong}>눈 길이 · 눈꼬리 각도를 mm 단위로</Text> 분석해 드려요
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    );
  }

  const tilt = tiltText(mean(eyes.right.tiltDeg, eyes.left.tiltDeg));
  const metrics = [
    { label: '눈 가로 길이', value: mm(mean(eyes.right.widthMm, eyes.left.widthMm)), hint: '안쪽 끝에서 바깥쪽 끝까지' },
    { label: '눈 사이 거리', value: mm(eyes.intercanthalMm), hint: `눈 가로 길이의 ${eyes.intercanthalRatio.toFixed(1)}배` },
    { label: '눈꼬리 각도', value: tilt.value, hint: tilt.hint },
    { label: '눈 뜨는 정도', value: mm(mean(eyes.right.mrd1Mm, eyes.left.mrd1Mm)), hint: '동공 중심에서 윗눈꺼풀까지' },
  ];
  return (
    <View style={styles.card} testID="eye-analysis">
      <View style={styles.header}>
        <Text style={styles.title}>{isDemo ? '샘플 얼굴 눈 분석' : '내 눈 분석'}</Text>
        <Text style={styles.note}>홍채 지름 {eyes.irisDiameterMm}mm 기준 추정치</Text>
      </View>
      <View style={styles.grid}>
        {metrics.map((m) => (
          <View key={m.label} style={styles.cell}>
            <Text style={styles.label}>{m.label}</Text>
            <Text style={styles.value}>{m.value}</Text>
            <Text style={styles.hint} numberOfLines={1}>
              {m.hint}
            </Text>
          </View>
        ))}
      </View>
      {isDemo && (
        <Pressable onPress={onScan} style={({ pressed }) => [styles.scan, pressed && { opacity: 0.7 }]} testID="eye-analysis-scan">
          <Text style={styles.scanText}>내 얼굴을 스캔하면 내 눈으로 분석해 드려요</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.ink} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink, letterSpacing: -0.2 },
  note: { fontSize: 11, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  cell: { width: '50%', paddingRight: 8, gap: 1 },
  label: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  value: { fontSize: 19, color: colors.ink, fontWeight: '700', letterSpacing: -0.4 },
  hint: { fontSize: 11, color: colors.muted },
  scan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  scanText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  inviteText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  inviteStrong: { fontWeight: '700', color: colors.ink },
});
