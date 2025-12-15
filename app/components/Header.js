import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { getDatabaseVersion } from '../services/db';
import { appEvents } from '../services/eventEmitter';
import { IMPORT_PROGRESS_EVENT } from '../services/BackupRestore';

const APP_VERSION = require('../../package.json').version;

export default function Header({ onOpenSettings }) {
  const { colors, colorScheme, setTheme } = useTheme();
  const { t } = useLocalization();
  const [dbVersion, setDbVersion] = useState(null);

  const fetchDbVersion = useCallback(async () => {
    try {
      const version = await getDatabaseVersion();
      setDbVersion(version);
    } catch (error) {
      console.error('Failed to fetch database version:', error);
    }
  }, []);

  useEffect(() => {
    fetchDbVersion();

    // Listen for import completion to refresh DB version
    const handleImportProgress = (event) => {
      if (event.stepId === 'complete' && event.status === 'completed') {
        console.log('Import completed, refreshing DB version...');
        fetchDbVersion();
      }
    };

    appEvents.on(IMPORT_PROGRESS_EVENT, handleImportProgress);

    return () => {
      appEvents.off(IMPORT_PROGRESS_EVENT, handleImportProgress);
    };
  }, [fetchDbVersion]);

  const toggleTheme = () => {
    const newTheme = colorScheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

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
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          onPress={toggleTheme}
          accessibilityLabel={colorScheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          accessibilityRole="button"
          accessibilityHint="Toggles between light and dark theme"
          style={styles.themeButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={colorScheme === 'dark' ? 'moon' : 'sunny'}
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
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
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeButton: {
    padding: 8,
  },
  settingsButton: {
    padding: 8,
  },
});
