export type HandoffStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface Handoff {
  id: number;
  emergency_case_id: number;
  hospital_id: number;
  ambulance_id: number;
  arrival_time?: string;
  handoff_time?: string;
  received_by?: string;
  notes?: string;
  status: HandoffStatus;
  created_at: string;
  updated_at: string;
}

export interface HandoffCompleteRequest {
  received_by: string;
  notes?: string;
}
