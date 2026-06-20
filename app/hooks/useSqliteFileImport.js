import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useDialog } from '../contexts/DialogContext';
import { useImportProgress } from '../contexts/ImportProgressContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { importBackupFromFile, CancelledImportError } from '../services/BackupRestore';

/**
 * Recognized backup file extensions. When the opened file URI carries one of
 * these extensions we respect it so format detection works for JSON/CSV/SQLite
 * backups alike; otherwise we fall back to a `.db` filename since the intent
 * filters that route a file here are SQLite-oriented.
 */
const RECOGNIZED_EXTENSION = /\.(db|sqlite|sqlite3|json|csv)$/i;

/**
 * Only file/content URIs represent an externally opened document. Our own
 * custom-scheme deep links (com.heywood8.monkeep://...) and http(s) links must
 * be ignored here.
 */
export const isOpenableFileUri = (url) =>
  typeof url === 'string' && (url.startsWith('content://') || url.startsWith('file://'));

/**
 * Derive a filename (with extension) from an opened file URI so the import
 * pipeline can detect the backup format. Content URIs frequently lack a usable
 * filename, in which case we default to a `.db` name to force SQLite handling.
 * @param {string} uri
 * @returns {string}
 */
export const deriveImportFilename = (uri) => {
  try {
    const decoded = decodeURIComponent(uri);
    const segment = decoded.split(/[/\\]/).pop() || '';
    if (RECOGNIZED_EXTENSION.test(segment)) {
      return segment;
    }
  } catch {
    // Malformed URI encoding - fall through to the default name.
  }
  return 'imported_backup.db';
};

/**
 * Listens for SQLite/backup files opened with the app (Android ACTION_VIEW
 * intents) and starts the restore flow after a confirmation warning, mirroring
 * the Google Drive / file import experience.
 *
 * @param {Object} [options]
 * @param {boolean} [options.enabled=true] - When false, opened files are ignored
 *   (e.g. during first-launch language selection before the app is ready).
 */
export const useSqliteFileImport = ({ enabled = true } = {}) => {
  const { showDialog } = useDialog();
  const { startImport, completeImport, cancelImport, getCancelToken } = useImportProgress();
  const { t } = useLocalization();

  // Guards against showing a second confirmation while one is already pending.
  const promptOpenRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let isMounted = true;

    const runImport = async (fileUri, filename) => {
      startImport();
      const cancelToken = getCancelToken();
      try {
        await importBackupFromFile({ fileUri, filename }, cancelToken);
        completeImport();
      } catch (error) {
        cancelImport();
        if (error instanceof CancelledImportError) return;
        console.error('[useSqliteFileImport] import error:', error);
        showDialog(
          t('error') || 'Error',
          error.message || t('restore_error') || 'Failed to restore backup',
          [{ text: t('ok') || 'OK' }],
        );
      }
    };

    const handleUrl = (url) => {
      if (!isMounted || !isOpenableFileUri(url) || promptOpenRef.current) return;

      promptOpenRef.current = true;
      const filename = deriveImportFilename(url);

      showDialog(
        t('restore_database') || 'Restore Database',
        t('restore_confirm') ||
          'Are you sure you want to restore from backup? This will replace all current data.',
        [
          {
            text: t('cancel') || 'Cancel',
            style: 'cancel',
            onPress: () => {
              promptOpenRef.current = false;
            },
          },
          {
            text: t('restore_database') || 'Restore',
            style: 'destructive',
            onPress: () => {
              promptOpenRef.current = false;
              runImport(url, filename);
            },
          },
        ],
      );
    };

    // Cold start: the app was launched by opening a file.
    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch((error) => console.warn('[useSqliteFileImport] getInitialURL failed:', error));

    // Warm start: a file was opened while the app was already running.
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [enabled, showDialog, startImport, completeImport, cancelImport, getCancelToken, t]);
};
