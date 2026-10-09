/**
 * Mock Hospital Data Layer
 *
 * NOTE: These are simulated mock data values for demonstration and development purposes.
 * These are NOT real hospital availability figures, scores, or live occupancy numbers.
 */

/**
 * Calculates straight-line distance in kilometers between two GPS coordinates using Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in km rounded to 1 decimal place
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Generates mock hospital entries, optionally positioned relative to the user's GPS coordinates.
 *
 * @param {{ latitude?: number, longitude?: number }} [userLocation]
 * @returns {import('../types/hospital').Hospital[]}
 */
export function getMockHospitals(userLocation = {}) {
  const userLat = typeof userLocation.latitude === 'number' ? userLocation.latitude : 12.9716;
  const userLon = typeof userLocation.longitude === 'number' ? userLocation.longitude : 77.5946;
  const hasRealUserLocation = typeof userLocation.latitude === 'number';

  // Coordinate offsets relative to the user's position for realistic map positioning
  const hospitalsConfig = [
    {
      id: 'hosp-metro-trauma',
      name: 'Metro City Trauma & Emergency Center',
      score: 97,
      rating: 4.9,
      dLat: 0.0125,
      dLon: 0.0092,
      fallbackDistance: 1.6,
      etaMinutes: '5 mins',
      emergencyType: 'Level 1 Trauma & Resuscitation Center',
      availableBeds: 12,
      specialties: ['Major Trauma', 'Cardiac Cath', 'ICU', 'Stroke Protocol'],
      phone: '+91 (080) 2555-0199',
      address: '84 Central Health Expressway, Sector 4',
    },
    {
      id: 'hosp-st-jude-cardiac',
      name: 'St. Jude Heart & Emergency Institute',
      score: 93,
      rating: 4.8,
      dLat: -0.0152,
      dLon: 0.0181,
      fallbackDistance: 2.8,
      etaMinutes: '8 mins',
      emergencyType: 'Comprehensive Cardiac & Vascular ER',
      availableBeds: 8,
      specialties: ['Cardiology', 'Emergency Surgery', 'Cardiac ICU', 'Ventilators'],
      phone: '+91 (080) 2555-0142',
      address: '120 Trinity Boulevard, North Block',
    },
    {
      id: 'hosp-apollo-apex',
      name: 'Apollo Apex Superspecialty Hospital',
      score: 89,
      rating: 4.7,
      dLat: 0.0245,
      dLon: -0.0195,
      fallbackDistance: 3.9,
      etaMinutes: '11 mins',
      emergencyType: 'Level 2 Trauma & Pediatric ER',
      availableBeds: 16,
      specialties: ['Pediatric ER', 'Orthopedic Trauma', 'Neurology', 'Blood Bank'],
      phone: '+91 (080) 2555-0320',
      address: '500 Technology Corridor Road',
    },
    {
      id: 'hosp-city-memorial',
      name: 'City Memorial Acute Care Hospital',
      score: 83,
      rating: 4.5,
      dLat: -0.0321,
      dLon: -0.0241,
      fallbackDistance: 5.4,
      etaMinutes: '15 mins',
      emergencyType: 'General Emergency & Critical Care',
      availableBeds: 5,
      specialties: ['Acute Medicine', 'Minor Surgery', 'Respiratory Care', 'Observation'],
      phone: '+91 (080) 2555-0488',
      address: '14 Westside Ring Road, Gate 2',
    },
  ];

  return hospitalsConfig.map((h) => {
    const lat = userLat + h.dLat;
    const lon = userLon + h.dLon;
    const distanceKm = hasRealUserLocation
      ? calculateDistanceKm(userLat, userLon, lat, lon)
      : h.fallbackDistance;

    return {
      id: h.id,
      name: h.name,
      score: h.score,
      rating: h.rating,
      distanceKm: distanceKm > 0 ? distanceKm : h.fallbackDistance,
      etaMinutes: h.etaMinutes,
      address: h.address,
      latitude: lat,
      longitude: lon,
      emergencyType: h.emergencyType,
      availableBeds: h.availableBeds,
      specialties: h.specialties,
      phone: h.phone,
      isMock: true,
    };
  });
}
