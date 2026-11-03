// nativewind and apps/native both depend on react-native-css-interop@0.2.6, but npm
// installs two separate physical copies instead of deduping them into one, even with a
// matching root "overrides" pin. Two copies means two module instances with split
// style-registry state, which breaks NativeWind styling at runtime (renders unstyled).
// This forces a single shared instance by symlinking nativewind's nested copy to
// apps/native's copy. Runs as a postinstall step since it doesn't survive npm install.
//
// The same split happens one level down: npm installs react-native-reanimated and
// react-native-worklets as peers of nativewind's nested css-interop, at newer versions
// (4.5.0 and 0.10.0) than the app's (4.3.1 and 0.8.3). expo-doctor reports them as
// duplicate native modules, which can fail the native build or crash at runtime, so
// they get symlinked to apps/native's copies too.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nativeModules = path.join(root, 'apps/native/node_modules');
const nestedModules = path.join(root, 'node_modules/nativewind/node_modules');

function linkToNativeCopy(name) {
  const canonical = path.join(nativeModules, name);
  const duplicate = path.join(nestedModules, name);

  if (!fs.existsSync(canonical)) {
    return;
  }

  const duplicateStat = fs.lstatSync(duplicate, { throwIfNoEntry: false });

  if (duplicateStat?.isSymbolicLink() && fs.realpathSync(duplicate) === fs.realpathSync(canonical)) {
    return;
  }

  if (duplicateStat) {
    fs.rmSync(duplicate, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(duplicate), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(duplicate), canonical), duplicate, 'dir');
  console.log(`[fix-css-interop-dedupe] symlinked nativewind's ${name} to apps/native's copy`);
}

for (const name of ['react-native-css-interop', 'react-native-reanimated', 'react-native-worklets']) {
  linkToNativeCopy(name);
}
