import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { queryFirst } from '../services/db';

const APP_VERSION = require('../../package.json').version;

export default function Header({ onOpenSettings }) {
  const { colors } = useTheme();
  const { t } = useLocalization();
  const [dbVersion, setDbVersion] = useState(null);

  useEffect(() => {
    const fetchDbVersion = async () => {
      try {
        const result = await queryFirst(
          'SELECT value FROM app_metadata WHERE key = ?',
          ['db_version']
        );
        if (result) {
          setDbVersion(result.value);
        }
      } catch (error) {
        console.error('Failed to fetch database version:', error);
      }
    };

    fetchDbVersion();
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        }
      ]}
    >
      <View style={styles.titleContainer}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.icon}
          accessibilityLabel="Penny app icon"
        />
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Penny</Text>
          <Text style={[styles.version, { color: colors.mutedText }]}>
            v{APP_VERSION} | DB v{dbVersion || '?'}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onOpenSettings}
        accessibilityLabel={t('settings')}
        accessibilityRole="button"
        accessibilityHint="Opens settings menu"
        style={styles.settingsButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="settings-outline" size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 50,
    height: 50,
    marginRight: 4,
  },
  title: { fontSize: 14, fontWeight: '700' },
  version: {
    fontSize: 10,
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
});
