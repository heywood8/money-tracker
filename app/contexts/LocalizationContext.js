
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import enTranslations from '../../assets/i18n/en.json';
import itTranslations from '../../assets/i18n/it.json';
import ruTranslations from '../../assets/i18n/ru.json';
import esTranslations from '../../assets/i18n/es.json';
import frTranslations from '../../assets/i18n/fr.json';
import zhTranslations from '../../assets/i18n/zh.json';
import deTranslations from '../../assets/i18n/de.json';
import hyTranslations from '../../assets/i18n/hy.json';
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
    (async () => {
      try {
        const storedLang = await getPreference(PREF_KEYS.LANGUAGE);
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
        setIsLoading(false);
      }
    })();
  }, []);

  // Listen for DATABASE_RESET event to reset language preference
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.DATABASE_RESET, async () => {
      console.log('LocalizationContext: Database reset detected, clearing language preference');
      try {
        // Clear language preference from PreferencesDB
        await deletePreference(PREF_KEYS.LANGUAGE);

        // Reset to first launch state
        setIsFirstLaunch(true);
        setLanguageState(defaultLang);
      } catch (e) {
        console.error('Failed to clear language preference:', e);
      }
    });

    return unsubscribe;
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

  const t = (key) => i18nData[language]?.[key] || key;

  // Don't render children until we've checked if this is first launch
  if (isLoading) {
    return null;
  }

  return (
    <LocalizationContext.Provider value={{
      t,
      language,
      setLanguage,
      availableLanguages: Object.keys(i18nData),
      isFirstLaunch,
      setFirstLaunchComplete,
    }}>
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
