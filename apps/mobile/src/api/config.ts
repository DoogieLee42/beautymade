import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the BeautyMade API lives.
 *   1. EXPO_PUBLIC_API_URL, if set (staging/production builds).
 *   2. In development, port 8000 on the machine running the Expo dev server, so a phone
 *      on the same Wi-Fi reaches a locally running API with zero configuration.
 */
export function resolveApiBaseUrl(): string | null {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return null;
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:8000` : null;
}

/** EXPO_PUBLIC_API_MODE=demo starts the app in offline demo mode. */
export const DEFAULT_API_MODE: 'remote' | 'demo' = process.env.EXPO_PUBLIC_API_MODE === 'demo' ? 'demo' : 'remote';
