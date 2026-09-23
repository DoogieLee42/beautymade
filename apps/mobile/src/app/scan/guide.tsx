import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, IconButton, Screen } from '../../components/ui';
import { colors, radius } from '../../theme';

const TIPS: { icon: ComponentProps<typeof Ionicons>['name']; title: string; body: string }[] = [
  { icon: 'sunny-outline', title: '밝고 고른 빛', body: '창문을 마주 보고 서요. 역광과 강한 그림자는 피해주세요.' },
  { icon: 'glasses-outline', title: '안경은 잠시 벗기', body: '눈 주변 형태가 더 정확해져요.' },
  { icon: 'cut-outline', title: '이마와 눈썹이 보이게', body: '앞머리는 넘기고, 모자나 마스크는 벗어주세요.' },
  { icon: 'happy-outline', title: '무표정으로 자연스럽게', body: '입은 가볍게 다물고 정면을 편하게 바라봐요.' },
  { icon: 'phone-portrait-outline', title: '폰은 눈높이에', body: '팔을 쭉 뻗어 얼굴이 가이드에 꽉 차게 맞춰주세요.' },
];

/** Step 5: capture guide. */
export default function CaptureGuide() {
  return (
    <Screen
      dark
      scroll
      footer={<Button title="촬영하기" icon="camera" onPress={() => router.push('/scan/capture')} testID="guide-continue" />}
    >
      <StatusBar style="light" />
      <View style={styles.top}>
        <IconButton icon="chevron-back" label="뒤로" tone="dark" onPress={() => router.back()} />
      </View>
      <Text style={styles.kicker}>촬영 가이드</Text>
      <Text style={styles.title}>좋은 3D 얼굴은{'\n'}좋은 사진에서 시작해요</Text>

      <View style={styles.list}>
        {TIPS.map((tip, i) => (
          <View key={tip.title} style={styles.tip}>
            <View style={styles.tipIcon}>
              <Ionicons name={tip.icon} size={22} color={colors.accent} />
            </View>
            <View style={styles.tipText}>
              <Text style={styles.tipTitle}>
                {i + 1}. {tip.title}
              </Text>
              <Text style={styles.tipBody}>{tip.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.stageMuted} />
        <Text style={styles.noteText}>촬영할 때마다 얼굴 위치와 각도를 바로 확인해서, 필요하면 다시 찍도록 알려드려요.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: 4, marginBottom: 12 },
  kicker: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  title: { color: colors.stageText, fontSize: 26, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, marginTop: 6 },
  list: { marginTop: 26, gap: 10 },
  tip: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.stageRaised,
    borderWidth: 1,
    borderColor: colors.stageLine,
    alignItems: 'center',
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,122,160,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1, gap: 3 },
  tipTitle: { color: colors.stageText, fontSize: 15, fontWeight: '700' },
  tipBody: { color: colors.stageMuted, fontSize: 13, lineHeight: 19 },
  note: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 12, alignItems: 'flex-start' },
  noteText: { flex: 1, color: colors.stageMuted, fontSize: 12, lineHeight: 18 },
});
