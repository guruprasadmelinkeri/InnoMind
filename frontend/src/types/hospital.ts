export type ResourceType =
  | 'ICU_BED'
  | 'GENERAL_BED'
  | 'VENTILATOR'
  | 'OXYGEN_BED'
  | 'TRAUMA_BED'
  | 'OPERATING_ROOM';

export interface HospitalResource {
  id: number;
  hospital_id: number;
  resource_type: ResourceType;
  total: number;
  available: number;
  reserved: number;
  last_updated: string;
  created_at: string;
  updated_at: string;
}

export interface Hospital {
  id: number;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  emergency_level?: string;
  trauma_center: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  resources: HospitalResource[];
}

export interface HospitalCreate {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  emergency_level?: string;
  trauma_center?: boolean;
  status?: string;
}
