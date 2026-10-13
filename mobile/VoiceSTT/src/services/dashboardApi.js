import { MEDIROUTE_API_URL } from '../config/medirouteConfig';

export const API_BASE_URL = MEDIROUTE_API_URL;

export async function api(token, path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

export const dashboardApi = {
  emergencies: token => api(token, '/emergencies'),
  emergency: (token, id) => api(token, `/emergencies/${id}`),
  createEmergency: (token, body) => api(token, '/emergencies', { method: 'POST', body: JSON.stringify(body) }),
  recommendations: (token, id) => api(token, `/emergencies/${id}/recommendations`),
  hospitals: token => api(token, '/hospitals'),
  ambulances: token => api(token, '/ambulances'),
  requests: (token, id) => api(token, `/emergencies/${id}/requests`),
  contacts: token => api(token, '/emergency-contacts'),
  addContact: (token, body) => api(token, '/emergency-contacts', { method: 'POST', body: JSON.stringify(body) }),
  deleteContact: (token, id) => api(token, `/emergency-contacts/${id}`, { method: 'DELETE' }),
  analyze: (token, description) => api(token, '/ai/analyze-emergency', { method: 'POST', body: JSON.stringify({ description }) }),
  async transcribe(token, uri) {
    const ext = (uri.split('.').pop()?.split('?')[0] || 'm4a').toLowerCase();
    const body = new FormData();
    body.append('file', { uri, name: `emergency-recording.${ext}`, type: ext === 'm4a' ? 'audio/m4a' : `audio/${ext}` });
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/ai/transcribe-audio`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.onload = () => { try { const data = JSON.parse(xhr.responseText); xhr.status >= 200 && xhr.status < 300 ? resolve(data.transcript) : reject(new Error(data.detail || 'Audio transcription failed.')); } catch (err) { reject(err); } };
      xhr.onerror = () => reject(new Error('Could not reach the MediRoute server.'));
      xhr.timeout = 120000; xhr.ontimeout = () => reject(new Error('Audio transcription timed out.'));
      xhr.send(body);
    });
    return result;
  },
};
