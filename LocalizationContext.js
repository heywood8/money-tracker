
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import i18nData from './assets/i18n.json';
import AsyncStorage from '@react-native-async-storage/async-storage';


const STORAGE_KEY = 'app_language';
const defaultLang = 'en';

const LocalizationContext = createContext({
  t: (key) => key,
  language: defaultLang,
  setLanguage: () => {},
  availableLanguages: Object.keys(i18nData),
});


export function LocalizationProvider({ children }) {
  const [language, setLanguageState] = useState(defaultLang);

  // Load language from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const storedLang = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedLang && i18nData[storedLang]) {
          setLanguageState(storedLang);
        }
      } catch (e) {
        // ignore
      }
    })();
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

  const t = (key) => i18nData[language]?.[key] || key;
  return (
    <LocalizationContext.Provider value={{ t, language, setLanguage, availableLanguages: Object.keys(i18nData) }}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
