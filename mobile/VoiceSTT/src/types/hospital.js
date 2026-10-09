/**
 * @typedef {Object} Hospital
 * @property {string} id - Unique identifier (e.g. "hosp-1")
 * @property {string} name - Hospital name
 * @property {number} score - Overall suitability / emergency readiness score (0-100)
 * @property {number} rating - Patient/facility rating (out of 5.0)
 * @property {number} distanceKm - Distance from user in kilometers
 * @property {string} etaMinutes - Estimated travel duration (e.g. "6 mins")
 * @property {string} address - Street address
 * @property {number} latitude - GPS latitude
 * @property {number} longitude - GPS longitude
 * @property {string} emergencyType - e.g. "Level 1 Trauma Center", "Cardiac Specialty"
 * @property {number} availableBeds - Number of available emergency/ICU beds
 * @property {string[]} specialties - Key medical specialties
 * @property {string} phone - Emergency contact phone
 * @property {boolean} isMock - Explicit flag confirming mock data
 */

export {};
