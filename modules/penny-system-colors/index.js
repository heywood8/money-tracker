import { requireOptionalNativeModule } from 'expo';

// The phone's Material You palette (android/src/main/java/expo/modules/pennysystemcolors), for the
// home-screen widgets. Optional on purpose: runtimeVersion follows the SDK version, so an OTA
// bundle can run on a build that predates this module, and Jest has no native side at all. Null
// means "no system palette", and the widgets keep Penny's own colours.
//
//   getPalette() -> { accent1, accent2, accent3, neutral1, neutral2 } | null
//     each palette { '0': '#ffffff', '10': '#…', '50', '100', …, '900', '1000': '#000000' };
//     null below Android 12
//
// See app/widgets/widgetColors.js for how the widgets read it.
export default requireOptionalNativeModule('PennySystemColors');
