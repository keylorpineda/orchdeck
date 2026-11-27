import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  LOCALE_STORAGE_KEY,
  getUiDictionary,
  resolveInitialLocale,
  type UiDictionary,
  type UiLocale,
} from '../state/i18n';

interface LanguageContextValue {
  readonly locale: UiLocale;
  readonly dict: UiDictionary;
  readonly setLocale: (locale: UiLocale) => void;
  readonly toggleLocale: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(() => {
    const stored =
      typeof window !== 'undefined' ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    return resolveInitialLocale(stored);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = (next: UiLocale): void => {
    setLocaleState(next);
  };

  const toggleLocale = (): void => {
    setLocaleState((prev) => (prev === 'en' ? 'es' : 'en'));
  };

  return (
    <LanguageContext.Provider
      value={{
        locale,
        dict: getUiDictionary(locale),
        setLocale,
        toggleLocale,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      locale: 'en',
      dict: getUiDictionary('en'),
      setLocale: () => undefined,
      toggleLocale: () => undefined,
    };
  }
  return ctx;
}
