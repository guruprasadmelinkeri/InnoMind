/**
 * Emergency Service for MediRoute Backend Integration
 *
 * Handles communication with the MediRoute backend APIs for emergency management:
 * - Creating emergency cases
 * - Getting hospital recommendations
 * - Creating allocation requests
 * - Assigning ambulances
 */

import { MEDIROUTE_BACKEND_URL } from '../config/medirouteConfig';

/**
 * Create a new emergency case with the user's location and voice transcription
 *
 * @param {Object} params
 * @param {number} params.latitude - GPS latitude from user location
 * @param {number} params.longitude - GPS longitude from user location
 * @param {string} [params.description] - Medical condition description from voice transcription
 * @param {number} [params.severity] - Emergency severity level (1-5, optional)
 * @param {number} [params.patientAge] - Patient age (optional)
 * @param {Array} [params.requirements] - Resource requirements (optional, defaults to basic emergency)
 * @returns {Promise<Object>} Emergency case object with id and details
 */
export async function createEmergency(params = {}) {
  const { latitude, longitude, description, severity, patientAge, requirements } = params;

  // Validate required location parameters
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('Valid latitude and longitude are required');
  }

  // Prepare emergency data according to backend schema
  const emergencyData = {
    pickup_latitude: latitude,
    pickup_longitude: longitude,
    ...(description !== undefined && { description }),
    ...(severity !== undefined && { severity }),
    ...(patientAge !== undefined && { patient_age: patientAge }),
    ...(requirements && requirements.length > 0 && { requirements })
  };

  // If no requirements provided, create a basic emergency requirement
  if (!requirements || requirements.length === 0) {
    emergencyData.requirements = [
      {
        resource_type: 'GENERAL_BED', // Default to general bed as minimum requirement
        quantity: 1,
        required: true
      }
    ];
  }

  try {
    const response = await fetch(`${MEDIROUTE_BACKEND_URL}/emergencies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emergencyData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to create emergency: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to connect to emergency services. Please check your connection and try again.'
    );
  }
}

/**
 * Get hospital recommendations for a specific emergency case
 *
 * @param {string|number} emergencyId - ID of the emergency case
 * @returns {Promise<Array>} Array of recommended hospitals with scores and details
 */
export async function getHospitalRecommendations(emergencyId) {
  if (!emergencyId) {
    throw new Error('Emergency ID is required');
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/emergencies/${emergencyId}/recommendations`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to get hospital recommendations: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    // The backend returns a RecommendationResponse object, extract hospitals
    return data.recommended_hospitals || data.hospitals || [];
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to retrieve hospital recommendations. Please try again.'
    );
  }
}

/**
 * Create an allocation request for an emergency to a specific hospital
 *
 * @param {string|number} emergencyId - ID of the emergency case
 * @param {string|number} hospitalId - ID of the target hospital
 * @returns {Promise<Object>} Allocation request object
 */
export async function createAllocationRequest(emergencyId, hospitalId) {
  if (!emergencyId) {
    throw new Error('Emergency ID is required');
  }
  if (!hospitalId) {
    throw new Error('Hospital ID is required');
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/emergencies/${emergencyId}/requests`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hospital_id: hospitalId }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to create allocation request: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to create hospital request. Please try again.'
    );
  }
}

/**
 * Assign an ambulance to an emergency case
 *
 * @param {string|number} emergencyId - ID of the emergency case
 * @param {string|number} ambulanceId - ID of the ambulance to assign
 * @returns {Promise<Object>} Updated emergency case with ambulance assignment
 */
export async function assignAmbulance(emergencyId, ambulanceId) {
  if (!emergencyId) {
    throw new Error('Emergency ID is required');
  }
  if (!ambulanceId) {
    throw new Error('Ambulance ID is required');
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/emergencies/${emergencyId}/assign-ambulance`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ambulance_id: ambulanceId }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to assign ambulance: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to assign ambulance. Please try again.'
    );
  }
}

/**
 * Accept an allocation request to reserve resources for an emergency
 *
 * @param {string|number} requestId - ID of the allocation request
 * @returns {Promise<Object>} Acceptance confirmation object
 */
export async function acceptAllocationRequest(requestId) {
  if (!requestId) {
    throw new Error('Allocation request ID is required');
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/allocation-requests/${requestId}/accept`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to accept allocation request: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to accept allocation request. Please try again.'
    );
  }
}

/**
 * Get details of a specific emergency case
 *
 * @param {string|number} emergencyId - ID of the emergency case
 * @returns {Promise<Object>} Emergency case details
 */
export async function getEmergencyDetails(emergencyId) {
  if (!emergencyId) {
    throw new Error('Emergency ID is required');
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/emergencies/${emergencyId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to get emergency details: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to retrieve emergency information. Please try again.'
    );
  }
}

// Export service object for easy import
export const emergencyService = {
  createEmergency,
  getHospitalRecommendations,
  createAllocationRequest,
  acceptAllocationRequest,
  assignAmbulance,
  getEmergencyDetails,
};