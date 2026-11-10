import { requireOptionalNativeModule } from 'expo';

// The native self-updater (android/src/main/java/expo/modules/pennyinstaller). Optional on
// purpose: runtimeVersion follows the SDK version, so an OTA bundle can run on a build that
// predates this module, and Jest has no native side at all. Null means "use the system
// installer", which is what every caller falls back to.
//
//   getCapabilities() -> { sdkInt, canRequestPackageInstalls, declaresSilentUpdatePermission,
//                          silentUpdate }
//   install(fileUri)  -> Promise<{ sessionId, status, message }>
//
// See app/services/silentInstaller.js for how the statuses are read.
export default requireOptionalNativeModule('PennyInstaller');
