// Point modules with codegen issues to a dummy CMakeLists.txt
// This prevents CMake from failing when codegen artifacts don't exist yet in CI
module.exports = {
  dependencies: {
    '@react-native-community/datetimepicker': {
      platforms: {
        android: {
          // Path relative to: node_modules/@react-native-community/datetimepicker/android
          cmakeListsPath: '../../../../scripts/cmake-stubs/CMakeLists.txt',
        },
      },
    },
    'react-native-gesture-handler': {
      platforms: {
        android: {
          // Path relative to: node_modules/react-native-gesture-handler/android
          cmakeListsPath: '../../../scripts/cmake-stubs/CMakeLists.txt',
        },
      },
    },
  },
};
