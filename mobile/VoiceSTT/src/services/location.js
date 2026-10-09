import * as Location from 'expo-location';

/**
 * Request foreground location permission.
 * @returns {Promise<boolean>} true if granted
 */
export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Get the device's current GPS coordinates.
 * Throws a user-friendly Error on timeout or unavailability.
 *
 * @returns {Promise<{ latitude: number, longitude: number }>}
 */
export async function getCurrentCoords() {
  try {
    const result = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return result.coords;
  } catch (err) {
    if (err.code === 3) {
      throw new Error('Location request timed out. Please try again.');
    }
    throw new Error('Unable to get your location. Ensure GPS is enabled and try again.');
  }
}
