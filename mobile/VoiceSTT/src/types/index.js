/**
 * Central types index.
 */
export * from './hospital';
export * from './ambulance';

/**
 * @typedef {Object} ApiResponse
 * @property {string} filename  - Backend-generated filename (e.g. "username_abc123.ogg")
 * @property {string} text      - Transcription result
 * @property {number} latitude  - Latitude echoed back from request
 * @property {number} longitude - Longitude echoed back from request
 * @property {string} username  - Username echoed back from request
 * @property {string} id        - Unique ID portion of the filename
 * @property {number} [httpStatus] - HTTP response code (e.g. 200)
 */

/**
 * @typedef {Object} Coords
 * @property {number} latitude
 * @property {number} longitude
 */

/**
 * @typedef {Object} RecordingResult
 * @property {string} uri  - Local file:// URI of the recorded audio
 */
