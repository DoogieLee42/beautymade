import { Redirect, Stack } from 'expo-router';

import { useSession } from '../../state/session';
import { colors } from '../../theme';

export default function ScanLayout() {
  const token = useSession((s) => s.token);
  if (!token) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.stage } }}>
      <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: colors.bg } }} />
      <Stack.Screen name="capture" options={{ gestureEnabled: false }} />
      <Stack.Screen name="generating" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="complete" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
