import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { DEFAULT_API_MODE } from '../api/config';
import type { AuthResult, User } from '../api/types';
import { getSecret, setSecret } from '../lib/secureStorage';

const TOKEN_KEY = 'beautymade.token';
const PREFS_KEY = 'beautymade.prefs.v1';

interface Prefs {
  onboardingSeen: boolean;
  skippedScan: boolean;
  apiMode: 'remote' | 'demo';
  user: User | null;
}

interface SessionState extends Prefs {
  hydrated: boolean;
  token: string | null;
  hydrate(): Promise<void>;
  setAuth(result: AuthResult): Promise<void>;
  setUser(user: User): void;
  signOut(): Promise<void>;
  markOnboardingSeen(): void;
  setSkippedScan(skipped: boolean): void;
  setApiMode(mode: 'remote' | 'demo'): Promise<void>;
}

const defaults: Prefs = { onboardingSeen: false, skippedScan: false, apiMode: DEFAULT_API_MODE, user: null };

export const useSession = create<SessionState>((set, get) => {
  const persist = () => {
    const { onboardingSeen, skippedScan, apiMode, user } = get();
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ onboardingSeen, skippedScan, apiMode, user })).catch(() => undefined);
  };

  return {
    ...defaults,
    hydrated: false,
    token: null,

    async hydrate() {
      const [raw, token] = await Promise.all([
        AsyncStorage.getItem(PREFS_KEY).catch(() => null),
        getSecret(TOKEN_KEY).catch(() => null),
      ]);
      const prefs: Prefs = raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
      set({ ...prefs, token, hydrated: true });
    },

    async setAuth({ token, user }) {
      await setSecret(TOKEN_KEY, token);
      set({ token, user });
      persist();
    },

    setUser(user) {
      set({ user });
      persist();
    },

    async signOut() {
      await setSecret(TOKEN_KEY, null);
      set({ token: null, user: null, skippedScan: false });
      persist();
    },

    markOnboardingSeen() {
      set({ onboardingSeen: true });
      persist();
    },

    setSkippedScan(skippedScan) {
      set({ skippedScan });
      persist();
    },

    async setApiMode(apiMode) {
      // Switching backends invalidates the session.
      await setSecret(TOKEN_KEY, null);
      set({ apiMode, token: null, user: null, skippedScan: false });
      persist();
    },
  };
});
