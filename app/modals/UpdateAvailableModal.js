import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Modal } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { SPACING, BORDER_RADIUS } from '../styles/layout';
import { parseReleaseNotes, formatReleaseDateTime } from '../components/UpdateContentPanel';

// Picks the release-note entry describing the version we're prompting the user to install.
// Prefers the entry whose version matches the latest release; otherwise falls back to the
// first (newest) entry so a mislabelled payload still surfaces some notes.
const findLeadRelease = (releaseNotes, latestVersion) => {
  if (!Array.isArray(releaseNotes) || releaseNotes.length === 0) return null;
  return releaseNotes.find((r) => r.version === latestVersion) || releaseNotes[0];
};

export default function UpdateAvailableModal({ visible, onDismiss, onUpdate, updateData }) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { height: windowHeight } = useWindowDimensions();

  // The release notes can span several skipped versions; the notes region scrolls within a
  // bounded height so a long changelog never grows the card past the actions. Everything else
  // (header, meta, buttons) hugs its content, so a single short release yields a short card.
  const notesMaxHeight = Math.round(windowHeight * 0.4);

  const parsedReleases = useMemo(() => {
    const list = Array.isArray(updateData?.releaseNotes) ? updateData.releaseNotes : [];
    return list
      .map((r) => ({ version: r.version, ...parseReleaseNotes(r.notes, r.version), publishedAt: r.publishedAt }))
      .filter((r) => r.body);
  }, [updateData]);

  if (!updateData) return null;

  const { latestVersion, currentVersion, downloadUrl } = updateData;
  const lead = findLeadRelease(updateData.releaseNotes, latestVersion);
  const leadParsed = lead ? parseReleaseNotes(lead.notes, lead.version) : null;
  const dateLabel = leadParsed ? formatReleaseDateTime(lead.publishedAt, leadParsed.date) : null;
  const hasNotes = parsedReleases.length > 0;
  const showVersionLabels = parsedReleases.length > 1;

  const metaText = dateLabel ? `v${latestVersion} · ${dateLabel}` : `v${latestVersion}`;

  // Rendered as a core React Native Modal (not Paper's Portal/Modal): Paper's backdrop is
  // laid out via a Portal host that, under the New Architecture + Android edge-to-edge, fails
  // to span the full screen — the scrim covered only the content above the card, leaving an
  // undimmed band between the list and this panel. A core Modal owns a full-screen native
  // window, so the scrim (a plain absolute-fill View) reliably dims the entire screen and the
  // card centres deterministically. `statusBarTranslucent`/`navigationBarTranslucent` let that
  // window extend under both system bars so the dim is truly edge-to-edge.
  //
  // The scrim is a plain View (not a Pressable): tapping outside the card must NOT dismiss the
  // prompt. Dismissal is deliberate only — the × icon, the "Later" button, or the hardware back
  // button (onRequestClose) — so a stray tap can't silently bury an available update.
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View
        testID="update-modal-scrim"
        style={[styles.scrim, { backgroundColor: colors.modalBackground }]}
      >
        <View style={styles.cardWrapper}>
          <View
            testID="update-modal-container"
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.header}>
              <View style={[styles.iconBadge, { backgroundColor: `${colors.primary}22` }]}>
                <Ionicons name="arrow-up-circle" size={24} color={colors.primary} />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {t('update_available_title') || 'Update available'}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedText }]} numberOfLines={1}>
                  {metaText}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onDismiss}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={t('later') || 'Later'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.mutedText} />
              </TouchableOpacity>
            </View>

            {currentVersion ? (
              <Text style={[styles.fromVersion, { color: colors.mutedText }]}>
                {(t('update_from_version') || 'installed: v{currentVersion}').replace('{currentVersion}', currentVersion)}
              </Text>
            ) : null}

            <Divider style={styles.divider} />

            {hasNotes ? (
              <ScrollView
                testID="update-notes-scroll"
                style={[styles.notes, { maxHeight: notesMaxHeight }]}
                contentContainerStyle={styles.notesContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.notesLabel, { color: colors.mutedText }]}>
                  {t('whats_new') || "What's new"}
                </Text>
                {parsedReleases.map((release) => (
                  <View key={release.version} style={styles.releaseBlock}>
                    {showVersionLabels ? (
                      <Text style={[styles.releaseVersion, { color: colors.text }]}>
                        v{release.version}
                      </Text>
                    ) : null}
                    <Text style={[styles.releaseBody, { color: colors.text }]}>
                      {release.body}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.emptyNotes, { color: colors.mutedText }]}>
                {(t('update_available_message') || 'A newer app version ({latestVersion}) is available. Download and install the APK from GitHub.').replace('{latestVersion}', `v${latestVersion}`)}
              </Text>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onDismiss}
                style={[styles.button, styles.laterButton, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={t('later') || 'Later'}
              >
                <Text style={[styles.laterText, { color: colors.text }]}>
                  {t('later') || 'Later'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onUpdate(downloadUrl)}
                style={[styles.button, styles.updateButton, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('update_now') || 'Update now'} v${latestVersion}`}
              >
                <Ionicons name="cloud-download-outline" size={18} color="#fff" />
                <Text style={styles.updateText}>
                  {t('update_now') || 'Update now'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

UpdateAvailableModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func.isRequired,
  onUpdate: PropTypes.func.isRequired,
  updateData: PropTypes.shape({
    latestVersion: PropTypes.string.isRequired,
    currentVersion: PropTypes.string.isRequired,
    downloadUrl: PropTypes.string.isRequired,
    releaseNotes: PropTypes.arrayOf(PropTypes.shape({
      version: PropTypes.string,
      notes: PropTypes.string,
      publishedAt: PropTypes.string,
    })),
  }),
};

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    gap: SPACING.xs,
    height: 46,
    justifyContent: 'center',
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.md,
    width: '100%',
  },
  cardWrapper: {
    alignSelf: 'center',
    maxWidth: 480,
    width: '100%',
  },
  closeButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  divider: {
    marginTop: SPACING.md,
  },
  emptyNotes: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  fromVersion: {
    fontSize: 12.5,
    paddingHorizontal: SPACING.lg,
    paddingLeft: 68,
    paddingTop: SPACING.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  laterButton: {
    borderWidth: StyleSheet.hairlineWidth,
    flex: 0.55,
  },
  laterText: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  notes: {
    marginTop: SPACING.sm,
  },
  notesContent: {
    paddingBottom: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  releaseBlock: {
    marginBottom: SPACING.sm,
  },
  releaseBody: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  releaseVersion: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  scrim: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  updateButton: {
    flex: 1,
  },
  updateText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
