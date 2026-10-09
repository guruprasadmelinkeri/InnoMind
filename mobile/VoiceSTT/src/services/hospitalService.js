import { MEDIROUTE_BACKEND_URL } from '../config/medirouteConfig';

/**
 * Service to fetch recommended hospitals for an emergency incident.
 *
 * UPDATED BEHAVIOR:
 * 1. Creates an emergency case using voice transcription data
 * 2. Fetches hospital recommendations from backend API
 * 3. Transforms response to match existing Hospital type
 *
 * @param {Object} [params]
 * @param {number} [params.latitude] - User / incident latitude
 * @param {number} [params.longitude] - User / incident longitude
 * @param {string} [params.transcription] - Medical context transcribed from voice
 * @param {string} [params.username] - User identifier
 * @returns {Promise<import('../types/hospital').Hospital[]>}
 */
export async function getHospitals(params = {}) {
  const { latitude, longitude, transcription } = params;

  // 1. Create emergency case using voice transcription data
  const emergencyCase = await createEmergencyCase({
    latitude,
    longitude,
    description: transcription || 'Emergency reported via voice',
    requirements: [{ resource_type: 'GENERAL_BED', quantity: 1, required: true }]
  });

  // 2. Get hospital recommendations for the emergency case
  const response = await fetch(`${MEDIROUTE_BACKEND_URL}/emergencies/${emergencyCase.id}/recommendations`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail ||
      `Failed to get hospital recommendations: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // 3. Transform response to match existing Hospital type
  return data.recommendations.map(rec => ({
    id: String(rec.hospital_id),
    name: rec.hospital_name,
    score: Math.round(rec.final_score * 100), // Convert 0-1 scale to 0-100 integer
    rating: rec.rating || 5.0,
    distanceKm: rec.distance_km ? parseFloat(rec.distance_km.toFixed(1)) : 0,
    etaMinutes: `${Math.round(rec.estimated_travel_minutes || 0)} mins`,
    address: rec.address || '',
    latitude: rec.latitude || 0,
    longitude: rec.longitude || 0,
    emergencyType: rec.emergency_type || 'Emergency Room',
    availableBeds: rec.available_beds || 0,
    specialties: rec.specialties || [],
    phone: rec.phone || '',
    hasRecommendationData: true,
    recommendationScore: rec.final_score, // Already 0-1 scale from backend
    isMock: false
  }));
}

/**
 * Helper: Create emergency case via backend API
 */
async function createEmergencyCase(params) {
  const { latitude, longitude, description, requirements } = params;

  const response = await fetch(`${MEDIROUTE_BACKEND_URL}/emergencies/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pickup_latitude: latitude,
      pickup_longitude: longitude,
      description: description,
      severity: 'MODERATE', // Default - could analyze transcription for severity
      patient_age: null, // Unknown
      requirements: requirements
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create emergency case: ${response.status}`);
  }

  return await response.json();
}

export const hospitalService = {
  getHospitals
};