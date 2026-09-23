import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius, shadowStrong } from '../../theme';

interface ToastState {
  message: string | null;
  tone: 'default' | 'error';
  action?: { label: string; onPress: () => void };
  key: number;
  show(message: string, options?: { tone?: 'default' | 'error'; action?: { label: string; onPress: () => void } }): void;
  hide(): void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'default',
  key: 0,
  show: (message, options) =>
    set((s) => ({ message, tone: options?.tone ?? 'default', action: options?.action, key: s.key + 1 })),
  hide: () => set({ message: null, action: undefined }),
}));

export const toast = (message: string, options?: Parameters<ToastState['show']>[1]) =>
  useToast.getState().show(message, options);

/** Single app-wide toast, mounted once in the root layout. */
export function ToastHost() {
  const { message, tone, action, key, hide } = useToast();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, action ? 4200 : 2600);
    return () => clearTimeout(timer);
  }, [key, message, action, hide]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <Animated.View
        key={key}
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        style={[styles.toast, shadowStrong, { marginBottom: insets.bottom + 84 }]}
      >
        <Ionicons
          name={tone === 'error' ? 'alert-circle' : 'checkmark-circle'}
          size={20}
          color={tone === 'error' ? '#FF8A8A' : '#FFFFFF'}
        />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
        {action && (
          <Pressable
            onPress={() => {
              hide();
              action.onPress();
            }}
            hitSlop={8}
          >
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    marginHorizontal: 16,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  action: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
});
