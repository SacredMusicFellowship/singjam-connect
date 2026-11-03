// Run with: node --test scripts/fix-css-interop-dedupe.test.js
// Checks, against the installed node_modules, that nativewind's nested copies of these
// modules point at apps/native's copies, so the app ships one copy of each native module.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

for (const name of ['react-native-css-interop', 'react-native-reanimated', 'react-native-worklets']) {
  test(`nativewind uses apps/native's ${name}`, (t) => {
    const nested = path.join(root, 'node_modules/nativewind/node_modules', name);
    const canonical = path.join(root, 'apps/native/node_modules', name);

    if (!fs.existsSync(nested)) {
      t.skip('npm did not nest a copy under nativewind');
      return;
    }

    assert.strictEqual(fs.realpathSync(nested), fs.realpathSync(canonical));
  });
}
