export type SimulationStatus = 'IDLE' | 'DISPATCHED' | 'EN_ROUTE' | 'ARRIVED';

export interface AmbulanceSimulationSnapshot {
  ambulanceId: number;
  status: SimulationStatus;
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  currentLatitude: number;
  currentLongitude: number;
  currentPosition: [number, number];
  route: [number, number][];
  progress: number;
  totalDistanceKm: number;
  distanceRemainingKm: number;
  baseEtaSeconds: number;
  totalEtaSeconds: number;
  etaSecondsRemaining: number;
  isRunning: boolean;
  speedMultiplier: number;
  updateIntervalMs: number;
}

export interface AmbulanceSimulationConfig {
  ambulanceId: number;
  origin: [number, number];
  destination: [number, number];
  route: [number, number][];
  totalDistanceKm?: number;
  totalEtaSeconds?: number;
  speedMultiplier?: number;
  updateIntervalMs?: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const haversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const earthRadiusKm = 6371;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const calculateRouteDistanceKm = (route: [number, number][]): number => {
  if (route.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < route.length; index += 1) {
    const [lat1, lon1] = route[index - 1];
    const [lat2, lon2] = route[index];
    total += haversineDistanceKm(lat1, lon1, lat2, lon2);
  }

  return Number(total.toFixed(2));
};

const interpolateRoutePoint = (
  route: [number, number][],
  distanceTravelledKm: number,
  totalDistanceKm: number
): [number, number] => {
  if (!route.length) {
    return [0, 0];
  }

  if (route.length === 1 || totalDistanceKm <= 0) {
    return route[0];
  }

  let accumulated = 0;
  for (let index = 1; index < route.length; index += 1) {
    const [fromLat, fromLon] = route[index - 1];
    const [toLat, toLon] = route[index];
    const segmentDistance = haversineDistanceKm(fromLat, fromLon, toLat, toLon);

    if (accumulated + segmentDistance >= distanceTravelledKm) {
      const segmentProgress = segmentDistance === 0 ? 0 : (distanceTravelledKm - accumulated) / segmentDistance;
      const latitude = fromLat + (toLat - fromLat) * segmentProgress;
      const longitude = fromLon + (toLon - fromLon) * segmentProgress;
      return [latitude, longitude];
    }

    accumulated += segmentDistance;
  }

  return route[route.length - 1];
};

export class AmbulanceSimulationEngine {
  private readonly ambulanceId: number;
  private readonly origin: [number, number];
  private readonly destination: [number, number];
  private readonly route: [number, number][];
  private readonly speedMultiplier: number;
  private readonly updateIntervalMs: number;
  private readonly baseEtaSeconds: number;
  private readonly totalDistanceKm: number;
  private readonly totalEtaSeconds: number;

  private progress = 0;
  private status: SimulationStatus = 'IDLE';
  private isRunningValue = false;
  private currentPosition: [number, number];

  constructor(config: AmbulanceSimulationConfig) {
    const normalizedRoute = config.route.length > 0 ? config.route : [config.origin, config.destination];
    this.ambulanceId = config.ambulanceId;
    this.origin = config.origin;
    this.destination = config.destination;
    this.route = normalizedRoute;
    this.speedMultiplier = config.speedMultiplier ?? 8;
    this.updateIntervalMs = config.updateIntervalMs ?? 200;
    this.totalDistanceKm = config.totalDistanceKm ?? calculateRouteDistanceKm(this.route);
    this.baseEtaSeconds = config.totalEtaSeconds ?? Math.max(30, Math.round((this.totalDistanceKm / 25) * 60));
    this.totalEtaSeconds = Math.max(18, Math.round(this.baseEtaSeconds / this.speedMultiplier));
    this.currentPosition = [...this.origin] as [number, number];
  }

  private interpolateAtProgress(progress: number): [number, number] {
    const safeProgress = clamp(progress, 0, 1);
    if (!this.route.length) {
      return [...this.origin] as [number, number];
    }

    if (this.route.length === 1 || this.totalDistanceKm <= 0) {
      return [...this.route[0]] as [number, number];
    }

    const targetDistanceKm = this.totalDistanceKm * safeProgress;
    return interpolateRoutePoint(this.route, targetDistanceKm, this.totalDistanceKm);
  }

  getSnapshot(): AmbulanceSimulationSnapshot {
    const clampedProgress = clamp(this.progress, 0, 1);
    const distanceRemainingKm = Number((this.totalDistanceKm * (1 - clampedProgress)).toFixed(2));
    const etaSecondsRemaining = Math.max(0, Math.round(this.totalEtaSeconds * (1 - clampedProgress)));

    return {
      ambulanceId: this.ambulanceId,
      status: this.status,
      originLatitude: this.origin[0],
      originLongitude: this.origin[1],
      destinationLatitude: this.destination[0],
      destinationLongitude: this.destination[1],
      currentLatitude: this.currentPosition[0],
      currentLongitude: this.currentPosition[1],
      currentPosition: [...this.currentPosition] as [number, number],
      route: this.route,
      progress: Number(clampedProgress.toFixed(4)),
      totalDistanceKm: Number(this.totalDistanceKm.toFixed(2)),
      distanceRemainingKm,
      baseEtaSeconds: this.baseEtaSeconds,
      totalEtaSeconds: this.totalEtaSeconds,
      etaSecondsRemaining,
      isRunning: this.isRunningValue,
      speedMultiplier: this.speedMultiplier,
      updateIntervalMs: this.updateIntervalMs,
    };
  }

  get isRunning(): boolean {
    return this.isRunningValue;
  }

  get updateInterval(): number {
    return this.updateIntervalMs;
  }

  get routeProgress(): number {
    return this.progress;
  }

  start(): AmbulanceSimulationSnapshot {
    if (this.progress >= 1) {
      this.progress = 1;
      this.status = 'ARRIVED';
      this.currentPosition = [...this.destination] as [number, number];
      this.isRunningValue = false;
      return this.getSnapshot();
    }

    this.isRunningValue = true;
    this.status = this.progress > 0 ? 'EN_ROUTE' : 'DISPATCHED';
    this.currentPosition = this.interpolateAtProgress(this.progress);
    return this.getSnapshot();
  }

  pause(): AmbulanceSimulationSnapshot {
    this.isRunningValue = false;
    this.currentPosition = this.interpolateAtProgress(this.progress);
    if (this.progress >= 1) {
      this.status = 'ARRIVED';
    } else if (this.progress > 0) {
      this.status = 'EN_ROUTE';
    } else {
      this.status = 'IDLE';
    }
    return this.getSnapshot();
  }

  reset(): AmbulanceSimulationSnapshot {
    this.progress = 0;
    this.status = 'IDLE';
    this.isRunningValue = false;
    this.currentPosition = [...this.origin] as [number, number];
    return this.getSnapshot();
  }

  tick(): AmbulanceSimulationSnapshot {
    if (!this.isRunningValue) {
      return this.getSnapshot();
    }

    const tickSeconds = this.updateIntervalMs / 1000;
    const progressDelta = tickSeconds / Math.max(1, this.totalEtaSeconds);
    const nextProgress = clamp(this.progress + progressDelta, 0, 1);

    this.progress = nextProgress;
    this.currentPosition = this.interpolateAtProgress(this.progress);

    if (this.progress >= 1) {
      this.progress = 1;
      this.status = 'ARRIVED';
      this.isRunningValue = false;
      this.currentPosition = [...this.destination] as [number, number];
    } else {
      this.status = this.progress > 0 ? 'EN_ROUTE' : 'DISPATCHED';
    }

    const snapshot = this.getSnapshot();
    console.debug('[ambulanceSimulation]', {
      progress: snapshot.progress,
      latitude: snapshot.currentLatitude,
      longitude: snapshot.currentLongitude,
      distanceRemaining: snapshot.distanceRemainingKm,
      etaRemaining: snapshot.etaSecondsRemaining,
    });

    return snapshot;
  }
}
