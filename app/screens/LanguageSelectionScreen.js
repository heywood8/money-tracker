import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import enTranslations from '../../assets/i18n/en.json';
import itTranslations from '../../assets/i18n/it.json';
import ruTranslations from '../../assets/i18n/ru.json';
import esTranslations from '../../assets/i18n/es.json';
import frTranslations from '../../assets/i18n/fr.json';
import zhTranslations from '../../assets/i18n/zh.json';
import deTranslations from '../../assets/i18n/de.json';
import hyTranslations from '../../assets/i18n/hy.json';
import { TOP_CONTENT_SPACING, HORIZONTAL_PADDING } from '../styles/layout';

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

const LanguageSelectionScreen = ({ onLanguageSelected }) => {
  const [selectedLanguage, setSelectedLanguage] = useState(null);

  const languages = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
    { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', flag: '🇦🇲' },
  ];

  const handleLanguageSelect = (code) => {
    setSelectedLanguage(code);
  };

  const handleContinue = () => {
    if (selectedLanguage) {
      onLanguageSelected(selectedLanguage);
    }
  };

  // Use selected language for UI text, or default to English
  const t = (key) => {
    const lang = selectedLanguage || 'en';
    return i18nData[lang]?.[key] || key;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('welcome_title')}</Text>
          <Text style={styles.subtitle}>{t('welcome_subtitle')}</Text>

          <View style={styles.languagesContainer}>
            {languages.map((language) => (
              <TouchableOpacity
                key={language.code}
                style={[
                  styles.languageButton,
                  selectedLanguage === language.code && styles.languageButtonSelected,
                ]}
                onPress={() => handleLanguageSelect(language.code)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${language.name}`}
                accessibilityState={{ selected: selectedLanguage === language.code }}
              >
                <Text style={styles.flag}>{language.flag}</Text>
                <View style={styles.languageTextContainer}>
                  <Text
                    style={[
                      styles.languageName,
                      selectedLanguage === language.code && styles.languageNameSelected,
                    ]}
                  >
                    {language.nativeName}
                  </Text>
                  <Text
                    style={[
                      styles.languageEnglishName,
                      selectedLanguage === language.code && styles.languageEnglishNameSelected,
                    ]}
                  >
                    {language.name}
                  </Text>
                </View>
                {selectedLanguage === language.code && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              !selectedLanguage && styles.continueButtonDisabled,
            ]}
            onPress={handleContinue}
            disabled={!selectedLanguage}
            accessibilityRole="button"
            accessibilityLabel={t('continue')}
            accessibilityState={{ disabled: !selectedLanguage }}
          >
            <Text
              style={[
                styles.continueButtonText,
                !selectedLanguage && styles.continueButtonTextDisabled,
              ]}
            >
              {t('continue')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  checkmark: {
    alignItems: 'center',
    backgroundColor: '#2196f3',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  container: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: TOP_CONTENT_SPACING,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#2196f3',
    borderRadius: 12,
    justifyContent: 'center',
    padding: 16,
  },
  continueButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  continueButtonTextDisabled: {
    color: '#9e9e9e',
  },
  flag: {
    fontSize: 40,
    marginRight: 16,
  },
  footer: {
    padding: 24,
    paddingBottom: 24,
  },
  languageButton: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: 16,
    padding: 20,
  },
  languageButtonSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  languageEnglishName: {
    color: '#666666',
    fontSize: 14,
  },
  languageEnglishNameSelected: {
    color: '#1976d2',
  },
  languageName: {
    color: '#1a1a1a',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  languageNameSelected: {
    color: '#1565c0',
  },
  languageTextContainer: {
    flex: 1,
  },
  languagesContainer: {
    maxWidth: 400,
    width: '100%',
  },
  safeArea: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  subtitle: {
    color: '#666666',
    fontSize: 16,
    marginBottom: 48,
    textAlign: 'center',
  },
  title: {
    color: '#1a1a1a',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default LanguageSelectionScreen;

LanguageSelectionScreen.propTypes = {
  onLanguageSelected: PropTypes.func.isRequired,
};
