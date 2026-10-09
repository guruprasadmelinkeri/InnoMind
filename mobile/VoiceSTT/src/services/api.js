import { BACKEND_URL } from '../constants/config';

/**
 * Upload a recorded audio file with location metadata and receive a transcription.
 *
 * Uses XMLHttpRequest instead of fetch() because React Native's newer fetch
 * implementation rejects the plain { uri, name, type } object FormData part with
 * "Unsupported FormDataPart implementation". XHR has always accepted this shape
 * natively in React Native and remains the correct, stable approach.
 *
 * @param {object} params
 * @param {string} params.audioUri   - Local file:// URI of the recording
 * @param {string} params.username   - Username to attach to the report
 * @param {number} params.latitude   - GPS latitude
 * @param {number} params.longitude  - GPS longitude
 * @returns {Promise<import('../types').ApiResponse>}
 */
export function uploadVoice({ audioUri, username, latitude, longitude }) {
  return new Promise((resolve, reject) => {
    // Derive file extension from URI; expo-audio typically produces .m4a or .caf
    const ext      = (audioUri.split('.').pop()?.split('?')[0] || 'm4a').toLowerCase();
    const filename = `voice.${ext}`;
    const mimeType = ext === 'm4a' ? 'audio/m4a' : `audio/${ext}`;

    const formData = new FormData();

    // React Native XHR accepts this object shape for local file uploads.
    // Do NOT convert to a Blob — that requires reading the entire file into memory.
    formData.append('file', {
      uri:  audioUri,
      name: filename,
      type: mimeType,
    });
    formData.append('username',  username);
    formData.append('latitude',  latitude.toString());
    formData.append('longitude', longitude.toString());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', BACKEND_URL);

    // Do NOT set Content-Type manually — XHR sets multipart/form-data + boundary automatically.

    xhr.onload = () => {
      // ONLY HTTP 200 is accepted as a successful response
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({ ...data, httpStatus: 200 });
        } catch {
          reject(new Error('Server returned invalid JSON.'));
        }
      } else {
        reject(
          new Error(
            `Request failed with HTTP status ${xhr.status}: ${xhr.responseText || 'Non-200 status'}`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          `Cannot reach the backend at:\n${BACKEND_URL}\n\nMake sure the server is running and both devices are on the same Wi-Fi network.`
        )
      );
    };

    xhr.ontimeout = () => {
      reject(new Error('Request timed out. The server took too long to respond.'));
    };

    xhr.timeout = 60000; // 60s — transcription can take a moment

    xhr.send(formData);
  });
}
