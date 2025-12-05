
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import i18nData from '../../assets/i18n.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appEvents, EVENTS } from '../services/eventEmitter';


const STORAGE_KEY = 'app_language';
const defaultLang = 'en';

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

  // Load language from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const storedLang = await AsyncStorage.getItem(STORAGE_KEY);
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
        // Clear language preference from AsyncStorage
        await AsyncStorage.removeItem(STORAGE_KEY);

        // Reset to first launch state
        setIsFirstLaunch(true);
        setLanguageState(defaultLang);
      } catch (e) {
        console.error('Failed to clear language preference:', e);
      }
    });

    return unsubscribe;
  }, []);

  // Save language to AsyncStorage when it changes
  const setLanguage = useCallback(async (lng) => {
    setLanguageState(lng);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lng);
    } catch (e) {
      // ignore
    }
  }, []);

  // Complete first-time setup by setting language
  const setFirstLaunchComplete = useCallback(async (lng) => {
    setLanguageState(lng);
    setIsFirstLaunch(false);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lng);
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

export function useLocalization() {
  return useContext(LocalizationContext);
}
