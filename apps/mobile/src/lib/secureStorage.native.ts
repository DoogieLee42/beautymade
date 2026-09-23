import * as SecureStore from 'expo-secure-store';

export async function getSecret(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
