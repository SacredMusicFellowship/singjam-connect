import { describe, expect, it } from '@jest/globals';
import appJson from '../../app.json';

// iOS kills an app that asks for photos or the camera without a purpose string, and App Review
// rejects vague ones, so these keep the strings in app.json.
function imagePickerOptions() {
  const entry = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
  expect(entry).toBeDefined();
  return (entry as [string, Record<string, unknown>])[1];
}

describe('expo-image-picker purpose strings', () => {
  it('says what the photo library is for', () => {
    const { photosPermission } = imagePickerOptions();
    expect(photosPermission).toMatch(/profile picture/);
    expect(photosPermission).toMatch(/jam/);
  });

  it('says what the camera is for', () => {
    expect(imagePickerOptions().cameraPermission).toMatch(/profile picture/);
  });

  it("doesn't ask for the microphone, since the app never records video", () => {
    expect(imagePickerOptions().microphonePermission).toBe(false);
  });
});
