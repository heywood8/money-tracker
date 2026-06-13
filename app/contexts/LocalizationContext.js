
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import PropTypes from 'prop-types';
import enTranslations from '../../assets/i18n/en.json';
import itTranslations from '../../assets/i18n/it.json';
import ruTranslations from '../../assets/i18n/ru.json';
import esTranslations from '../../assets/i18n/es.json';
import frTranslations from '../../assets/i18n/fr.json';
import zhTranslations from '../../assets/i18n/zh.json';
import deTranslations from '../../assets/i18n/de.json';
import hyTranslations from '../../assets/i18n/hy.json';
import jaTranslations from '../../assets/i18n/ja.json';
import koTranslations from '../../assets/i18n/ko.json';
import ptTranslations from '../../assets/i18n/pt.json';
import { getPreference, setPreference, deletePreference, PREF_KEYS } from '../services/PreferencesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const defaultLang = 'en';

// Map language codes to their translation data
const i18nData = {
  en: enTranslations,
  it: itTranslations,
  ru: ruTranslations,
  es: esTranslations,
  fr: frTranslations,
  zh: zhTranslations,
  de: deTranslations,
  hy: hyTranslations,
  ja: jaTranslations,
  ko: koTranslations,
  pt: ptTranslations,
};

const LocalizationContext = createContext({
  t: (key) => key,
  language: defaultLang,
  setLanguage: () => {},
  availableLanguages: Object.keys(i18nData),
  isFirstLaunch: false,
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
        if (storedLang && i18nData[storedLang]) {
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

  const t = useCallback((key) => i18nData[language]?.[key] || key, [language]);

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
    availableLanguages: Object.keys(i18nData),
    isFirstLaunch,
    setFirstLaunchComplete,
  }), [t, language, setLanguage, isFirstLaunch, setFirstLaunchComplete]);

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
