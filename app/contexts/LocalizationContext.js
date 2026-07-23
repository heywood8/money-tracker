
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import PropTypes from 'prop-types';
// Keep English as a static base so there is always a resolved fallback language
// available at startup without evaluating any other locale.
import enTranslations from '../../assets/i18n/en.json';
import { getPreference, setPreference, deletePreference, PREF_KEYS } from '../services/PreferencesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const defaultLang = 'en';

// Lazy loaders per language code. With Metro's `inlineRequires: true`, each
// require() is only evaluated the first time it is actually invoked, so only the
// active language's JSON is materialized at startup instead of all 11 (~309 KB).
// Metro still bundles every locale — this is a startup-evaluation win, not a
// bundle-size reduction.
const i18nLoaders = {
  en: () => enTranslations,
  it: () => require('../../assets/i18n/it.json'),
  ru: () => require('../../assets/i18n/ru.json'),
  es: () => require('../../assets/i18n/es.json'),
  fr: () => require('../../assets/i18n/fr.json'),
  zh: () => require('../../assets/i18n/zh.json'),
  de: () => require('../../assets/i18n/de.json'),
  hy: () => require('../../assets/i18n/hy.json'),
  ja: () => require('../../assets/i18n/ja.json'),
  ko: () => require('../../assets/i18n/ko.json'),
  pt: () => require('../../assets/i18n/pt.json'),
};

// Resolved-translation cache so each locale is evaluated at most once.
const i18nCache = { en: enTranslations };

// Resolve (and memoize) the translation object for a language code. Returns the
// language's data, or `undefined` for an unknown code — preserving the original
// `i18nData[language]?.[key] || key` lookup semantics exactly.
function loadTranslations(lang) {
  if (i18nCache[lang]) return i18nCache[lang];
  const loader = i18nLoaders[lang];
  if (!loader) return undefined;
  const data = loader();
  i18nCache[lang] = data;
  return data;
}

const availableLanguages = Object.keys(i18nLoaders);

const LocalizationContext = createContext({
  t: (key) => key,
  language: defaultLang,
  setLanguage: () => {},
  availableLanguages,
  isFirstLaunch: false,
  isLoading: true,
  setFirstLaunchComplete: () => {},
});


export function LocalizationProvider({ children }) {
  const [language, setLanguageState] = useState(defaultLang);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Load language from PreferencesDB on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const storedLang = await getPreference(PREF_KEYS.LANGUAGE);
        if (!mounted) return;
        if (storedLang && i18nLoaders[storedLang]) {
          setLanguageState(storedLang);
          setIsFirstLaunch(false);
        } else {
          // No language set, this is first launch
          setIsFirstLaunch(true);
        }
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Listen for DATABASE_RESET event to reset language preference
  useEffect(() => {
    let mounted = true;
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, async () => {
      console.log('LocalizationContext: Database reset detected, clearing language preference');
      try {
        // Clear language preference from PreferencesDB
        await deletePreference(PREF_KEYS.LANGUAGE);

        if (!mounted) return;
        // Reset to first launch state
        setIsFirstLaunch(true);
        setLanguageState(defaultLang);
      } catch (e) {
        if (mounted) console.error('Failed to clear language preference:', e);
      }
    });

    return () => { mounted = false; unsubscribe(); };
  }, []);

  // Save language to PreferencesDB when it changes
  const setLanguage = useCallback(async (lng) => {
    setLanguageState(lng);
    try {
      await setPreference(PREF_KEYS.LANGUAGE, lng);
    } catch (e) {
      // ignore
    }
  }, []);

  // Complete first-time setup by setting language
  const setFirstLaunchComplete = useCallback(async (lng) => {
    setLanguageState(lng);
    setIsFirstLaunch(false);
    try {
      await setPreference(PREF_KEYS.LANGUAGE, lng);
    } catch (e) {
      // ignore
    }
  }, []);

  const t = useCallback((key) => loadTranslations(language)?.[key] || key, [language]);

  // Hide splash screen once language preference has been loaded
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  const value = useMemo(() => ({
    t,
    language,
    setLanguage,
    availableLanguages,
    isFirstLaunch,
    isLoading,
    setFirstLaunchComplete,
  }), [t, language, setLanguage, isFirstLaunch, isLoading, setFirstLaunchComplete]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

LocalizationProvider.propTypes = {
  children: PropTypes.node,
};

export function useLocalization() {
  return useContext(LocalizationContext);
}
