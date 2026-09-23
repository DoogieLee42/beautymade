// Web has no keychain; the token lives in localStorage (scoped to the app's origin).
export async function getSecret(key: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this tab only.
  }
}
