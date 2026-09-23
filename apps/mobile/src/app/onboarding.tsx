import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Button } from '../components/ui';
import { useSession } from '../state/session';
import { colors } from '../theme';
import { FaceView } from '../three/FaceView';
import { DEMO_FACE } from '../three/demoFace';

/**
 * Step 1-2: splash + product intro. The hero is the live 3D sample face; swap in a
 * licensed model photo here for marketing builds if you prefer photography.
 */
export default function Splash() {
  const markSeen = useSession((s) => s.markOnboardingSeen);

  const go = (to: '/auth/signup' | '/auth/login') => {
    markSeen();
    router.replace(to);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <FaceView face={DEMO_FACE} turntable reveal interactive={false} fit={1.02} quietLoading style={styles.hero} />

      <Svg style={StyleSheet.absoluteFill} pointerEvents="none" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.38" stopColor="#0B0B0B" stopOpacity="0" />
            <Stop offset="0.7" stopColor="#0B0B0B" stopOpacity="0.72" />
            <Stop offset="1" stopColor="#0B0B0B" stopOpacity="0.96" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill="url(#fade)" />
      </Svg>

      <SafeAreaView edges={['bottom']} style={styles.content} pointerEvents="box-none">
        <Animated.View entering={FadeInDown.delay(500).duration(700)} style={styles.copy}>
          <Text style={styles.brand}>BeautyMade</Text>
          <Text style={styles.headline}>내 얼굴로 미리 보는{'\n'}3D 뷰티 시뮬레이션</Text>
          <Text style={styles.sub}>지금, 새로운 나를 만나보세요.</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(800).duration(700)} style={styles.actions}>
          <Button title="내 얼굴 만들기" variant="white" onPress={() => go('/auth/signup')} testID="onboarding-start" />
          <Pressable onPress={() => go('/auth/login')} hitSlop={10} style={styles.loginRow}>
            <Text style={styles.loginText}>
              이미 계정이 있나요? <Text style={styles.loginLink}>로그인</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0B0B' },
  hero: { ...StyleSheet.absoluteFill, bottom: '18%' },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24 },
  copy: { alignItems: 'center', gap: 12, marginBottom: 34 },
  brand: { color: '#FFFFFF', fontSize: 44, fontWeight: '700', letterSpacing: -1.2 },
  headline: { color: '#FFFFFF', fontSize: 21, lineHeight: 30, fontWeight: '600', textAlign: 'center', letterSpacing: -0.4 },
  sub: { color: colors.stageMuted, fontSize: 15, marginTop: 2 },
  actions: { gap: 14, paddingBottom: 12 },
  loginRow: { alignSelf: 'center', paddingVertical: 4 },
  loginText: { color: colors.stageMuted, fontSize: 14 },
  loginLink: { color: '#FFFFFF', fontWeight: '600', textDecorationLine: 'underline' },
});
