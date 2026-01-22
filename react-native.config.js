// Configure autolinking for modules that have issues with New Architecture codegen
// in local EAS builds. These modules will use the interop layer instead.
module.exports = {
  dependencies: {
    '@react-native-async-storage/async-storage': {
      platforms: {
        android: {
          // Disable C++ autolinking to avoid codegen race condition in local builds
          cxxModuleCMakeListsPath: null,
        },
      },
    },
    '@react-native-community/datetimepicker': {
      platforms: {
        android: {
          cxxModuleCMakeListsPath: null,
        },
      },
    },
    'react-native-gesture-handler': {
      platforms: {
        android: {
          cxxModuleCMakeListsPath: null,
        },
      },
    },
  },
};
