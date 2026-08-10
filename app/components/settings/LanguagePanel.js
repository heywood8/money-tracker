import React from 'react';
import PropTypes from 'prop-types';
import { View, ScrollView } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { languageLabel } from '../../utils/languages';
import { listStyles as styles } from './settingsPanelStyles';

// The language subpanel: every supported language, named in its own script,
// with a check against the current one. Choosing applies immediately and closes
// the panel — there is nothing to confirm, and the whole UI switching language
// is its own confirmation.
export default function LanguagePanel({ onSelected, bottomInset }) {
  const { colors } = useThemeColors();
  const { language, setLanguage, availableLanguages } = useLocalization();

  const handleSelect = (lng) => {
    setLanguage(lng);
    onSelected();
  };

  return (
    <ScrollView
      style={styles.listContainer}
      contentContainerStyle={{ paddingBottom: bottomInset }}
    >
      {availableLanguages.map(lng => (
        <TouchableRipple
          key={lng}
          onPress={() => handleSelect(lng)}
          style={styles.listItem}
        >
          <View style={styles.listItemContent}>
            <Text style={[styles.listItemText, { color: colors.text }]}>
              {languageLabel(lng)}
            </Text>
            {language === lng && (
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            )}
          </View>
        </TouchableRipple>
      ))}
    </ScrollView>
  );
}

LanguagePanel.propTypes = {
  // Called once the language has been applied, so the host can dismiss the panel.
  onSelected: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};
