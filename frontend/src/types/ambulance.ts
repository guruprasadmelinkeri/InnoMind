export type AmbulanceStatus = 'AVAILABLE' | 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'OFFLINE';

export interface Ambulance {
  id: number;
  vehicle_number: string;
  status: AmbulanceStatus;
  current_latitude?: number;
  current_longitude?: number;
  created_at: string;
  updated_at: string;
}

export interface AmbulanceAssignRequest {
  ambulance_id: number;
}

export interface AmbulanceStatusUpdate {
  status: AmbulanceStatus;
}
