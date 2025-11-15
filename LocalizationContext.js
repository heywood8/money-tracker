import React, { createContext, useContext, useState } from 'react';
import i18nData from './assets/i18n.json';

const defaultLang = 'en';

const LocalizationContext = createContext({
  t: (key) => key,
  language: defaultLang,
  setLanguage: () => {},
  availableLanguages: Object.keys(i18nData),
});

export function LocalizationProvider({ children }) {
  const [language, setLanguage] = useState(defaultLang);
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
