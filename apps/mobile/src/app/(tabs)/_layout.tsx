import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useSession } from '../../state/session';
import { colors } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size - 2} color={color as string} />
  );

export default function TabsLayout() {
  const token = useSession((s) => s.token);
  if (!token) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="studio" options={{ title: 'Studio', tabBarIcon: icon('sparkles', 'sparkles-outline') }} />
      <Tabs.Screen name="looks" options={{ title: 'Looks', tabBarIcon: icon('albums', 'albums-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
