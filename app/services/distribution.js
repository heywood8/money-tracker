import Constants from 'expo-constants';
import { Linking } from 'react-native';

// Which store this binary was built for. Baked in by app.config.js from
// APP_VARIANT, because a binary cannot work this out for itself on device.
//
// Two channels exist and they are not interchangeable:
//
//   'github' — the APK we publish on GitHub Releases. It carries
//              REQUEST_INSTALL_PACKAGES and updates itself: AppUpdateService
//              polls the releases API, downloads the next APK and hands it to
//              Android's installer.
//   'play'   — the App Bundle submitted to Google Play. Play's Device and
//              Network Abuse policy forbids an app updating itself by any route
//              other than Play, and a finance app does not qualify for
//              REQUEST_INSTALL_PACKAGES under the permission's own
//              core-functionality list. So the permission is not declared and
//              the updater must not run.
//
// The update *check* runs on both channels — reading the GitHub releases API is
// just an HTTP request, and it is what tells either build that a newer version
// exists. What differs is the action offered afterwards: the GitHub build
// downloads and installs the APK itself, the Play build sends the user to Play,
// which is the only route Play permits. Anything that downloads or installs goes
// through supportsInAppUpdates() first.
const DEFAULT_CHANNEL = 'github';

// The applicationId, which is also the Play listing's id. Kept here rather than
// read from the manifest so a Play build has it even before the store module
// would be available.
const ANDROID_PACKAGE = 'com.heywood8.monkeep';

export const getDistributionChannel = () => {
  const channel = Constants.expoConfig
    && Constants.expoConfig.extra
    && Constants.expoConfig.extra.distributionChannel;
  return typeof channel === 'string' && channel ? channel : DEFAULT_CHANNEL;
};

export const isPlayBuild = () => getDistributionChannel() === 'play';

export const supportsInAppUpdates = () => !isPlayBuild();

// Opens this app's Play listing, where the user takes the update the ordinary
// way. `market://` hands straight to the Play app; the https URL is the fallback
// for a device without it (and for the rare launcher that refuses the scheme).
export const openStoreListing = async () => {
  try {
    await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
    return true;
  } catch (marketError) {
    try {
      await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
      return true;
    } catch (webError) {
      console.warn('[distribution] Could not open the Play listing:', webError);
      return false;
    }
  }
};
