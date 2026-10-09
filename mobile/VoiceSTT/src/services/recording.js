import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

/**
 * Request microphone permission.
 * @returns {Promise<boolean>} true if granted
 */
export async function requestMicPermission() {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

/**
 * Set audio mode for recording on iOS.
 * Must be called before prepareToRecordAsync on iOS.
 */
export async function enableRecordingMode() {
  await setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
}
