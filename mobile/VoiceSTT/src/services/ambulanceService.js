/**
 * Ambulance Service for MediRoute Backend Integration
 *
 * Handles communication with the MediRoute backend APIs for ambulance tracking and management.
 *
 * UPDATED: Now uses real backend APIs instead of mock/scaffold data.
 *
 * BACKEND ENDPOINTS:
 * - GET /ambulances - List all ambulances with current status and location
 * - GET /ambulances/{ambulanceId} - Get specific ambulance details
 * - PATCH /ambulances/{ambulanceId}/status - Update ambulance status (ASSIGNED, EN_ROUTE, ARRIVED)
 */

import { MEDIROUTE_BACKEND_URL } from '../config/medirouteConfig';

/**
 * Fetch all ambulances from the MediRoute backend
 *
 * @returns {Promise<Array>} Array of ambulance objects with current status and location
 */
export async function getAmbulances() {
  try {
    const response = await fetch(`${MEDIROUTE_BACKEND_URL}/ambulances`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to retrieve ambulances: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to retrieve ambulance information. Please check your connection and try again.'
    );
  }
}

/**
 * Get details for a specific ambulance
 *
 * @param {string|number} ambulanceId - ID of the ambulance to fetch
 * @returns {Promise<Object>} Ambulance object with details
 */
export async function getAmbulanceById(ambulanceId) {
  if (!ambulanceId) {
    throw new Error('Ambulance ID is required');
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/ambulances/${ambulanceId}`,
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
        `Failed to retrieve ambulance details: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to retrieve ambulance information. Please try again.'
    );
  }
}

/**
 * Update the status of a specific ambulance
 *
 * @param {string|number} ambulanceId - ID of the ambulance to update
 * @param {string} newStatus - New status value (ASSIGNED, EN_ROUTE, ARRIVED, AVAILABLE)
 * @returns {Promise<Object>} Updated ambulance object
 */
export async function updateAmbulanceStatus(ambulanceId, newStatus) {
  if (!ambulanceId) {
    throw new Error('Ambulance ID is required');
  }
  if (!newStatus) {
    throw new Error('Status value is required');
  }

  // Validate status values according to backend schema
  const validStatuses = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'AVAILABLE'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    const response = await fetch(
      `${MEDIROUTE_BACKEND_URL}/ambulances/${ambulanceId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
        `Failed to update ambulance status: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      error.message ||
      'Unable to update ambulance status. Please try again.'
    );
  }
}

/**
 * Subscribe to live location updates for an ambulance (placeholder for future WebSocket implementation)
 *
 * @param {string} ambulanceId - ID of the ambulance to track
 * @param {Function} onLocationUpdate - Callback function to handle location updates
 * @returns {Function} Unsubscribe cleanup function
 */
export function subscribeToLiveLocation(ambulanceId, onLocationUpdate) {
  // TODO: Implement real WebSocket connection when backend supports live tracking
  // For now, we'll poll the ambulance endpoint periodically

  let pollingInterval = null;

  const startPolling = () => {
    pollingInterval = setInterval(async () => {
      try {
        const ambulanceData = await getAmbulanceById(ambulanceId);
        if (onLocationUpdate && ambulanceData) {
          onLocationUpdate({
            latitude: ambulanceData.current_latitude,
            longitude: ambulanceData.current_longitude,
            status: ambulanceData.status,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn('Failed to update ambulance location:', error.message);
      }
    }, 5000); // Poll every 5 seconds
  };

  startPolling();

  // Return cleanup function
  return () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  };
}

// Export service object for easy import
export const ambulanceService = {
  getAmbulances,
  getAmbulanceById,
  updateAmbulanceStatus,
  subscribeToLiveLocation,
};