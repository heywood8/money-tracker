import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import Animated, { FadeInDown, Easing, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { availableLanguages, loadTranslations } from '../contexts/LocalizationContext';
import { NATIVE_LANGUAGE_NAMES, ENGLISH_LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../utils/languages';
import { BORDER_RADIUS, FONT_SIZE, TOP_CONTENT_SPACING } from '../styles/designTokens';

// This is the only screen in the app a user sees exactly once, and it is where
// the whole motion budget for first-run lives: everywhere else in Penny is a
// screen people open every day, which argues for less movement, not more.
//
// The gap between cards. The last one must still have arrived ~620ms after the
// title — longer than anything else in the app is allowed to take, permissible
// only because nothing waits on it: the buttons are laid out and pressable from
// the first frame, the animation is purely how they arrive. That budget is what
// sets this number, so it came down from 45ms when the list grew from seven
// languages to eleven; the tail is the same length, the steps are just tighter.
const ENTRY_STAGGER = 30;
const ENTRY_DURATION = 260;
// Rise distance. Small enough that a card never starts outside its own row, so
// the stagger reads as one list settling rather than as eleven things flying in.
const ENTRY_RISE = 12;

const entry = (index) => FadeInDown
  .delay(index * ENTRY_STAGGER)
  .duration(ENTRY_DURATION)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ transform: [{ translateY: ENTRY_RISE }] })
  .reduceMotion(ReduceMotion.System);

// Offered in the order the app lists them, named the way the settings picker
// names them. Derived from the loader map rather than restated, which is what
// let this list fall four languages behind the app. Adding a locale still means
// touching that map and the three tables in utils/languages.js — the tests over
// assets/i18n/ fail by name if any of them is missed.
const LANGUAGES = availableLanguages.map((code) => ({
  code,
  name: ENGLISH_LANGUAGE_NAMES[code] || code,
  nativeName: NATIVE_LANGUAGE_NAMES[code] || code,
  flag: LANGUAGE_FLAGS[code] || '',
}));

const LanguageSelectionScreen = ({ onLanguageSelected }) => {
  const [selectedLanguage, setSelectedLanguage] = useState(null);

  const handleLanguageSelect = (code) => {
    setSelectedLanguage(code);
  };

  const handleContinue = () => {
    if (selectedLanguage) {
      onLanguageSelected(selectedLanguage);
    }
  };

  // Use selected language for UI text, or default to English. Only the language
  // actually tapped is ever loaded.
  const t = (key) => {
    const lang = selectedLanguage || 'en';
    return loadTranslations(lang)?.[key] || key;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={styles.container}>
        {/* Eleven cards do not fit a phone screen, so the list scrolls while the
            title and the Continue button stay put. The title scrolls with it
            rather than pinning: on the one screen where the whole point is
            choosing from a list, the list should get the height. */}
        <ScrollView
          testID="language-list"
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
        >
          {/* Title and subtitle lead the stagger at slots 0 and 1, so the cards
              below them read as continuing a movement rather than starting one. */}
          <Animated.Text entering={entry(0)} style={styles.title}>{t('welcome_title')}</Animated.Text>
          <Animated.Text entering={entry(1)} style={styles.subtitle}>{t('welcome_subtitle')}</Animated.Text>

          <View style={styles.languagesContainer}>
            {LANGUAGES.map((language, index) => (
              <Animated.View key={language.code} entering={entry(index + 2)}>
                <TouchableOpacity
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
                    {/* Only where it adds something: English's two names are
                        the same word, and printing it twice reads as a bug. */}
                    {language.name !== language.nativeName && (
                      <Text
                        style={[
                          styles.languageEnglishName,
                          selectedLanguage === language.code && styles.languageEnglishNameSelected,
                        ]}
                      >
                        {language.name}
                      </Text>
                    )}
                  </View>
                  {selectedLanguage === language.code && (
                    <View style={styles.checkmark}>
                      <Text style={styles.checkmarkText}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </ScrollView>

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
    borderRadius: BORDER_RADIUS.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
  },
  container: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: TOP_CONTENT_SPACING,
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#2196f3',
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    padding: 16,
  },
  continueButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  continueButtonText: {
    color: '#ffffff',
    fontSize: FONT_SIZE.lg,
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
    borderRadius: BORDER_RADIUS.lg,
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
    fontSize: FONT_SIZE.md,
  },
  languageEnglishNameSelected: {
    color: '#1976d2',
  },
  languageName: {
    color: '#1a1a1a',
    fontSize: FONT_SIZE.xl,
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
    fontSize: FONT_SIZE.base,
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
