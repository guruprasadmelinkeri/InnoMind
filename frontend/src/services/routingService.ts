/**
 * Routing service for MediRoute.
 * Fetches real driving routes from OpenStreetMap / OSRM API with
 * graceful offline fallback to straight-line interpolation.
 */

export interface RouteResult {
  coordinates: [number, number][]; // Array of [lat, lon] tuples for Leaflet polyline
  distanceKm: number;
  durationMinutes: number;
  isFallback: boolean;
}

// Haversine formula calculation for fallback
export const calculateHaversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371.0; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
};

export const calculateEstimatedTravelTimeMinutes = (
  distanceKm: number,
  averageSpeedKmh = 30.0
): number => {
  if (distanceKm <= 0) return 0;
  const minutes = (distanceKm / averageSpeedKmh) * 60;
  return Number(minutes.toFixed(1));
};

export const fetchDrivingRoute = async (
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Promise<RouteResult> => {
  // If coordinates are identical or missing
  if (
    !startLat ||
    !startLon ||
    !endLat ||
    !endLon ||
    (startLat === endLat && startLon === endLon)
  ) {
    return {
      coordinates: [[startLat, startLon]],
      distanceKm: 0,
      durationMinutes: 0,
      isFallback: true,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 sec timeout

    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        // GeoJSON coordinates are [lon, lat], Leaflet needs [lat, lon]
        const coords: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        const distanceKm = Number((route.distance / 1000).toFixed(2));
        const durationMinutes = Number((route.duration / 60).toFixed(1));

        return {
          coordinates: coords,
          distanceKm,
          durationMinutes,
          isFallback: false,
        };
      }
    }
  } catch {
    // Graceful fallback to straight-line if network fails or times out
  }

  // Fallback direct polyline
  const fallbackDist = calculateHaversineDistanceKm(
    startLat,
    startLon,
    endLat,
    endLon
  );
  const fallbackDuration = calculateEstimatedTravelTimeMinutes(fallbackDist);

  return {
    coordinates: [
      [startLat, startLon],
      [endLat, endLon],
    ],
    distanceKm: fallbackDist,
    durationMinutes: fallbackDuration,
    isFallback: true,
  };
};
