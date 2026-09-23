import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCurrentFace } from '../hooks/queries';
import { useSession } from '../state/session';
import { colors } from '../theme';

/** Entry gate: onboarding -> account -> first scan -> tabs. */
export default function Entry() {
  const { hydrated, onboardingSeen, token, skippedScan } = useSession();
  const face = useCurrentFace();

  if (!hydrated) return <Splash />;
  if (!onboardingSeen) return <Redirect href="/onboarding" />;
  if (!token) return <Redirect href="/auth/signup" />;
  if (face.isLoading) return <Splash />;
  if (!face.data && !skippedScan) return <Redirect href="/scan" />;
  return <Redirect href="/(tabs)" />;
}

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
