import { Redirect, Stack } from 'expo-router';

import { useSession } from '../../state/session';
import { colors } from '../../theme';

export default function ScanLayout() {
  const token = useSession((s) => s.token);
  if (!token) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.stage } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="guide" />
      <Stack.Screen name="capture" options={{ gestureEnabled: false }} />
      <Stack.Screen name="generating" options={{ gestureEnabled: false, animation: 'fade' }} />
      <Stack.Screen name="complete" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
