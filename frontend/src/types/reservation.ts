import type { ResourceType } from './hospital';

export type AllocationRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type ReservationStatus =
  | 'HELD'
  | 'CONFIRMED'
  | 'RELEASED'
  | 'CONSUMED'
  | 'EXPIRED';

export interface AllocationRequest {
  id: number;
  emergency_case_id: number;
  hospital_id: number;
  status: AllocationRequestStatus;
  match_score: number;
  requested_at: string;
  responded_at?: string;
  expires_at?: string;
  rejection_reason?: string;
}

export interface ReservationItem {
  resource_type: ResourceType;
  quantity: number;
}

export interface AcceptSuccessResponse {
  request_id: number;
  status: string;
  hospital_id: number;
  hospital_name: string;
  reservations: ReservationItem[];
}

export interface Reservation {
  id: number;
  emergency_case_id: number;
  hospital_id: number;
  resource_id: number;
  quantity: number;
  status: ReservationStatus;
  reserved_at: string;
}
