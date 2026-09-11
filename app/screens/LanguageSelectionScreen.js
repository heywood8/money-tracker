import React, { useState } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Animated, { FadeInDown, Easing, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { availableLanguages, loadTranslations } from '../contexts/LocalizationContext';
import { NATIVE_LANGUAGE_NAMES, ENGLISH_LANGUAGE_NAMES, LANGUAGE_FLAGS } from '../utils/languages';
import { BORDER_RADIUS, FONT_SIZE, TOP_CONTENT_SPACING } from '../styles/designTokens';
import { selectionTint } from '../utils/colorUtils';

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
  // This screen used to carry its own hardcoded white palette plus a
  // `barStyle="dark-content"` StatusBar, so the very first thing a dark-mode
  // phone showed was a full-screen white flash. It renders inside
  // ThemeColorsProvider like every other screen, so it just reads the theme;
  // the status bar is App.js's ThemedStatusBar's job, as everywhere else.
  const { colors } = useThemeColors();
  const selectedBackground = selectionTint(colors.primary, colors.surface);

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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
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
          <Animated.Text entering={entry(0)} style={[styles.title, { color: colors.text }]}>{t('welcome_title')}</Animated.Text>
          <Animated.Text entering={entry(1)} style={[styles.subtitle, { color: colors.mutedText }]}>{t('welcome_subtitle')}</Animated.Text>

          <View style={styles.languagesContainer}>
            {LANGUAGES.map((language, index) => (
              <Animated.View key={language.code} entering={entry(index + 2)}>
                <TouchableOpacity
                  style={[
                    styles.languageButton,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    selectedLanguage === language.code && {
                      backgroundColor: selectedBackground,
                      borderColor: colors.primary,
                    },
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
                        { color: selectedLanguage === language.code ? colors.primaryStrong : colors.text },
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
                          { color: selectedLanguage === language.code ? colors.primaryStrong : colors.mutedText },
                        ]}
                      >
                        {language.name}
                      </Text>
                    )}
                  </View>
                  {selectedLanguage === language.code && (
                    <View style={[styles.checkmark, { backgroundColor: colors.primaryFill }]}>
                      <Text style={[styles.checkmarkText, { color: colors.onPrimaryFill }]}>✓</Text>
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
              { backgroundColor: selectedLanguage ? colors.primaryFill : colors.secondary },
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
                { color: selectedLanguage ? colors.onPrimaryFill : colors.mutedText },
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
    borderRadius: BORDER_RADIUS.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  checkmarkText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
  },
  container: {
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
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    padding: 16,
  },
  continueButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
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
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: 16,
    padding: 20,
  },
  languageEnglishName: {
    fontSize: FONT_SIZE.md,
  },
  languageName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    marginBottom: 4,
  },
  languageTextContainer: {
    flex: 1,
  },
  languagesContainer: {
    maxWidth: 400,
    width: '100%',
  },
  safeArea: {
    flex: 1,
  },
  subtitle: {
    fontSize: FONT_SIZE.base,
    marginBottom: 48,
    textAlign: 'center',
  },
  title: {
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
