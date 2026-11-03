const path = require('path');

// npm hoists @react-native/jest-preset to the repo root, but react-native itself lives in
// apps/native/node_modules, so the preset can't find it. Adding native's node_modules to the
// lookup path lets the root copy resolve react-native from here.
process.env.NODE_PATH = [path.join(__dirname, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // React is installed twice in this monorepo (web's copy at the root, native's here).
    // Point every import at native's copy so the test renderer and the app share one React.
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@singjam/core$': '<rootDir>/../../packages/core/src/index.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
