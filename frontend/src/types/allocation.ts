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

// Batch Allocation Types
export interface BatchAllocationResult {
  batch_id: string | null;
  results: BatchAllocationResultItem[];
  summary: {
    total: number;
    assigned: number;
    unserved: number;
  };
}

export interface BatchAllocationResultItem {
  emergency_id: number;
  emergency_case_number: string;
  severity: string;
  assigned_hospital_id: number | null;
  assigned_hospital_name: string | null;
  explanation: string;
  assignment_details: {
    hospital_id: number;
    hospital_name: string;
    distance_km: number;
    estimated_travel_minutes: number;
    resource_match_score: number;
    travel_score: number;
    freshness_score: number;
    specialization_score: number;
    final_score: number;
    freshness_status: FreshnessStatus;
  };
  status: 'ASSIGNED' | 'UNSERVED' | 'FAILED' | 'PENDING_MANUAL';
}
