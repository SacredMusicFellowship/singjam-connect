module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // The first render in a file compiles React Native's modules on demand, which can take more than
  // jest's 5 s default on a cold CI runner.
  testTimeout: 20000,
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
