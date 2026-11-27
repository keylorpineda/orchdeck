import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEME_STORAGE_KEY, resolveInitialTheme, type ThemeMode } from './theme';

interface ThemeContextValue {
  readonly theme: ThemeMode;
  readonly toggleTheme: () => void;
  readonly setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return resolveInitialTheme(stored, prefersDark);
  });

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (mode: ThemeMode): void => {
    setThemeState(mode);
  };

  const toggleTheme = (): void => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }
  return ctx;
}
