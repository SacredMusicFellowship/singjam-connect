// Run with: node --test scripts/native-app-config.test.js
// iOS crashes when an app asks for photos or camera without a purpose string, and App
// Review rejects vague ones. These checks keep the strings in apps/native/app.json.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const appJson = require(path.join(__dirname, '../apps/native/app.json'));

function imagePickerOptions() {
  const entry = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
  assert.ok(entry, 'expo-image-picker plugin is configured in app.json');
  return entry[1];
}

test('photo library purpose string says what the photos are for', () => {
  const { photosPermission } = imagePickerOptions();
  assert.match(photosPermission, /profile picture/);
  assert.match(photosPermission, /jam/);
});

test('camera purpose string says what the camera is for', () => {
  const { cameraPermission } = imagePickerOptions();
  assert.match(cameraPermission, /profile picture/);
});

test('microphone is not requested, since the app never records video', () => {
  assert.strictEqual(imagePickerOptions().microphonePermission, false);
});
