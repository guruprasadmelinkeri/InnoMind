import Constants from 'expo-constants';

// Expo Go exposes the LAN host running Metro. Using it keeps the phone pointed
// at this computer's backend without hard-coding a changing Wi-Fi address.
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '').replace(/\/api$/, '');
const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
const backendHost = expoHost || '192.168.43.94';

export const MEDIROUTE_BACKEND_URL = configuredUrl || `http://${backendHost}:8000`;
export const MEDIROUTE_API_URL = `${MEDIROUTE_BACKEND_URL}/api`;
