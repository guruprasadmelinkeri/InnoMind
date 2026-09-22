import type { EmergencyCase } from './emergency';

export type FreshnessStatus = 'VERY_FRESH' | 'FRESH' | 'AGING' | 'STALE';

export interface HospitalRecommendation {
  hospital_id: number;
  hospital_name: string;
  eligible: boolean;
  final_score: number;
  resource_match_score: number;
  travel_score: number;
  freshness_score: number;
  specialization_score: number;
  distance_km: number;
  estimated_travel_minutes: number;
  freshness_status: FreshnessStatus;
  reasons: string[];
}

export interface RecommendationResponse {
  emergency: EmergencyCase;
  recommendations: HospitalRecommendation[];
  ineligible_hospitals: HospitalRecommendation[];
}
