import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Text, type ColorValue } from 'react-native';

import { useSession } from '../../state/session';
import { colors } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, color }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={23} color={color as string} />
  );

const label =
  (text: string) =>
  ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Text style={{ color: color as string, fontSize: 11, fontWeight: focused ? '700' : '500', marginTop: 1 }}>{text}</Text>
  );

export default function TabsLayout() {
  const token = useSession((s) => s.token);
  if (!token) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: '#9A9AA0',
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarLabel: label('홈'), tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen
        name="studio-tab"
        options={{ tabBarLabel: label('스튜디오'), tabBarIcon: icon('options', 'options-outline') }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/studio');
          },
        }}
      />
      <Tabs.Screen name="looks" options={{ tabBarLabel: label('내 룩'), tabBarIcon: icon('albums', 'albums-outline') }} />
      <Tabs.Screen name="profile" options={{ tabBarLabel: label('프로필'), tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}
