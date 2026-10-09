/**
 * Conceptual data shapes for future live ambulance tracking.
 *
 * @typedef {Object} AmbulanceLocation
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} timestamp
 *
 * @typedef {Object} AmbulanceDriver
 * @property {string} name
 * @property {string} phone
 * @property {string} rating
 *
 * @typedef {Object} AmbulanceData
 * @property {string} id - Unit identifier (e.g. "MED-912")
 * @property {string} status - Current status description
 * @property {string} eta - Estimated arrival time string
 * @property {string} distanceRemaining - Formatted remaining distance
 * @property {string} vehicleType - Vehicle configuration (e.g. "Advanced Life Support")
 * @property {AmbulanceLocation} [location] - Future live GPS coordinate
 * @property {AmbulanceDriver} [driver] - Assigned paramedic / driver info
 * @property {boolean} isPlaceholder - Indicates scaffold/mock state
 */

export {};
