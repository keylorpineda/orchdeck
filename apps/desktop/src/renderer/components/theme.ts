export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'orchdeck.theme';

export function resolveInitialTheme(
  storedValue: string | null | undefined,
  prefersDark: boolean,
): ThemeMode {
  if (storedValue === 'light' || storedValue === 'dark') {
    return storedValue;
  }
  return prefersDark ? 'dark' : 'light';
}
