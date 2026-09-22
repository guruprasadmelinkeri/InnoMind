import type { ResourceType } from './hospital';

export type EmergencySeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type EmergencyStatus =
  | 'CREATED'
  | 'SEARCHING'
  | 'HOSPITAL_SELECTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'HANDOFF_COMPLETED'
  | 'CANCELLED';

export interface EmergencyRequirement {
  id: number;
  emergency_case_id: number;
  resource_type: ResourceType;
  quantity: number;
  required: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmergencyCase {
  id: number;
  case_number: string;
  severity: EmergencySeverity;
  patient_age?: number;
  description?: string;
  pickup_latitude: number;
  pickup_longitude: number;
  status: EmergencyStatus;
  created_at: string;
  updated_at: string;
  requirements: EmergencyRequirement[];
}

export interface EmergencyRequirementCreate {
  resource_type: ResourceType;
  quantity: number;
  required?: boolean;
}

export interface EmergencyCaseCreate {
  severity: EmergencySeverity;
  patient_age?: number;
  description?: string;
  pickup_latitude: number;
  pickup_longitude: number;
  case_number?: string;
  requirements: EmergencyRequirementCreate[];
}
