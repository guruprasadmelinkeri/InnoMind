export interface HealthResponse {
  status: string;
  service: string;
}

export interface HealthState {
  data: HealthResponse | null;
  loading: boolean;
  error: string | null;
  lastChecked: Date | null;
}
