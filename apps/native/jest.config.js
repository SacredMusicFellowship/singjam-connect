module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@singjam/core$': '<rootDir>/../../packages/core/src/index.ts',
  },
  // MSW and some of its dependencies ship ES modules only (.mjs), which jest-expo's transform
  // pattern doesn't cover.
  transform: {
    '^.+\\.mjs$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|msw|@mswjs/.*|rettime|until-async|@open-draft/.*|headers-polyfill|outvariant|strict-event-emitter|is-node-process))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/'],
};
